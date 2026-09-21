/**
 * DYA-07 — DELETE / DATA-INTEGRITY HARNESS
 *
 * İki sınıf test:
 *   (A) PURE: stone-kapsamlı path guard, applySignedPhotoUrls, pathsToPhysicallyRemove.
 *   (B) FAKE-DB INTEGRATION: deleteStonePhotoRecords orkestrasyonu, PROGRAMLANABİLİR bir
 *       in-memory sahte Supabase client ile GERÇEKTEN çalıştırılır (DB/prod erişimi YOK).
 *       Doğrulanan: DB-FIRST (DB hata → storage'a dokunulmaz), referans-güvenli fiziksel
 *       silme (ortak dosya korunur), yabancı path elenmesi, storage-hatası non-fatal,
 *       referans-sorgusu hatası → güvenli (fiziksel silme yok).
 *
 * NOT: Bu, Supabase JS client'ının deleteStonePhotoRecords'un kullandığı ALT KÜMESİNİN
 * sadık bir taklididir; gerçek Supabase round-trip DEĞİLDİR (route AUTH/ownership hâlâ
 * NOT VERIFIED — module-mock/prod yok). Orkestrasyon mantığı burada runtime doğrulanır.
 *
 * Çalıştır: npx tsx scripts/dya07-delete-integrity-harness.ts
 */
import {
  isOwnedClientStonePhotoPath,
  filterOwnedStonePhotoPaths,
  applySignedPhotoUrls,
  pathsToPhysicallyRemove,
  deleteStonePhotoRecords,
} from "../lib/clients/stonePhotoStorage";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) pass++; else { fail++; console.error("FAIL  " + name); }
}

const T = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const C = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const S = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const S2 = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const OT = "99999999-9999-9999-9999-999999999999";

// ─── (A) PURE ─────────────────────────────────────────────────────────────────
ok("PURE-01 stone-scoped path accepted", isOwnedClientStonePhotoPath(`${T}/${C}/${S}/x.png`, T, C, S) === true);
ok("PURE-02 other-stone path rejected when stoneId set", isOwnedClientStonePhotoPath(`${T}/${C}/${S2}/x.png`, T, C, S) === false);
ok("PURE-03 client-only path (no stone match) rejected when stoneId set", isOwnedClientStonePhotoPath(`${T}/${C}/x.png`, T, C, S) === false);
ok("PURE-04 client-scoped still works without stoneId", isOwnedClientStonePhotoPath(`${T}/${C}/${S}/x.png`, T, C) === true);
ok("PURE-05 foreign tenant rejected (stone-scoped)", isOwnedClientStonePhotoPath(`${OT}/${C}/${S}/x.png`, T, C, S) === false);

ok("PURE-06 filter stone-scoped keeps only this stone",
  JSON.stringify(filterOwnedStonePhotoPaths([`${T}/${C}/${S}/a.png`, `${T}/${C}/${S2}/b.png`], T, C, S)) === JSON.stringify([`${T}/${C}/${S}/a.png`]));

ok("PURE-07 applySignedPhotoUrls fills signed, blanks missing", (() => {
  const out = applySignedPhotoUrls(
    [{ id: "p1", image_url: `${T}/${C}/${S}/a.png` }, { id: "p2", image_url: "https://old/public/url.png" }],
    { p1: "https://signed/p1?token=x" },
  );
  return out[0].image_url === "https://signed/p1?token=x" && out[1].image_url === "";
})());
ok("PURE-08 applySignedPhotoUrls never leaks stale/public url when no signed",
  applySignedPhotoUrls([{ id: "p9", image_url: "https://leak/public.png" }], {})[0].image_url === "");

ok("PURE-09 pathsToPhysicallyRemove skips referenced", (() => {
  const r = pathsToPhysicallyRemove([`${T}/${C}/${S}/a.png`, `${T}/${C}/${S}/b.png`], new Set([`${T}/${C}/${S}/a.png`]));
  return r.length === 1 && r[0] === `${T}/${C}/${S}/b.png`;
})());
ok("PURE-10 pathsToPhysicallyRemove removes all when none referenced",
  pathsToPhysicallyRemove([`${T}/${C}/${S}/a.png`], new Set()).length === 1);

// ─── (B) FAKE-DB INTEGRATION ───────────────────────────────────────────────────
type Resp = { data: unknown; error: { message: string } | null };
function makeFakeDb(responses: Resp[], storageResult: { error: { message: string } | null }) {
  let qi = 0;
  const calls: Array<Record<string, unknown>> = [];
  function builder() {
    const b: Record<string, unknown> = { _c: {} as Record<string, unknown> };
    b.from = (t: string) => { (b._c as Record<string, unknown>).table = t; return b; };
    b.select = (s: string) => { (b._c as Record<string, unknown>).select = s; return b; };
    b.delete = () => { (b._c as Record<string, unknown>).delete = true; return b; };
    b.eq = () => b;
    b.in = (col: string, vals: unknown) => { (b._c as Record<string, unknown>).in = vals; return b; };
    b.then = (resolve: (v: Resp) => unknown, reject?: (e: unknown) => unknown) => {
      calls.push({ ...(b._c as Record<string, unknown>) });
      const r = responses[qi++] ?? { data: [], error: null };
      return Promise.resolve(r).then(resolve, reject);
    };
    return b;
  }
  const db = {
    from: (t: string) => (builder().from as (t: string) => unknown)(t),
    storage: {
      from: () => ({
        remove: (paths: string[]) => { calls.push({ storageRemove: paths }); return Promise.resolve(storageResult); },
      }),
    },
    _calls: calls,
  };
  return db as unknown as import("@supabase/supabase-js").SupabaseClient & { _calls: Array<Record<string, unknown>> };
}
const storageRemoved = (db: { _calls: Array<Record<string, unknown>> }) =>
  db._calls.filter((c) => "storageRemove" in c).flatMap((c) => c.storageRemove as string[]);
const storageWasCalled = (db: { _calls: Array<Record<string, unknown>> }) =>
  db._calls.some((c) => "storageRemove" in c);

async function main() {
  // INT-01: normal single delete, unique path → DB-first delete then physical remove
  {
    const db = makeFakeDb([
      { data: [{ id: "p1", file_path: `${T}/${C}/${S}/a.png` }], error: null }, // select targets
      { data: [{ id: "p1" }], error: null },                                    // delete...select
      { data: [], error: null },                                                // ref check: none remaining
    ], { error: null });
    const r = await deleteStonePhotoRecords(db, { bucket: "stone-photos", tenantId: T, clientId: C, photoId: "p1" });
    ok("INT-01 deleted=1 & object removed", r.error === null && r.deleted === 1 &&
      JSON.stringify(storageRemoved(db)) === JSON.stringify([`${T}/${C}/${S}/a.png`]));
  }

  // INT-02: DB delete FAILS → storage must NOT be touched (no photo loss)
  {
    const db = makeFakeDb([
      { data: [{ id: "p1", file_path: `${T}/${C}/${S}/a.png` }], error: null },
      { data: null, error: { message: "db fail" } },
    ], { error: null });
    const r = await deleteStonePhotoRecords(db, { bucket: "stone-photos", tenantId: T, clientId: C, photoId: "p1" });
    ok("INT-02 db-delete error → error returned, storage untouched", r.error === "db fail" && !storageWasCalled(db));
  }

  // INT-03: shared path still referenced by another surviving row → NOT physically removed
  {
    const db = makeFakeDb([
      { data: [{ id: "p1", file_path: `${T}/${C}/${S}/a.png` }], error: null },
      { data: [{ id: "p1" }], error: null },
      { data: [{ file_path: `${T}/${C}/${S}/a.png` }], error: null }, // ref check: still referenced (p2)
    ], { error: null });
    const r = await deleteStonePhotoRecords(db, { bucket: "stone-photos", tenantId: T, clientId: C, photoId: "p1" });
    ok("INT-03 shared object preserved (referenced)", r.error === null && r.deleted === 1 &&
      r.removed.length === 0 && !storageWasCalled(db));
  }

  // INT-04: foreign-tenant path in row → filtered out, never removed
  {
    const db = makeFakeDb([
      { data: [{ id: "p1", file_path: `${OT}/${C}/${S}/a.png` }], error: null }, // foreign
      { data: [{ id: "p1" }], error: null },
    ], { error: null });
    const r = await deleteStonePhotoRecords(db, { bucket: "stone-photos", tenantId: T, clientId: C, photoId: "p1" });
    ok("INT-04 foreign path never removed", r.error === null && r.deleted === 1 &&
      r.removed.length === 0 && !storageWasCalled(db));
  }

  // INT-05: storage.remove FAILS after DB delete → non-fatal (orphan blob), error null
  {
    const db = makeFakeDb([
      { data: [{ id: "p1", file_path: `${T}/${C}/${S}/a.png` }], error: null },
      { data: [{ id: "p1" }], error: null },
      { data: [], error: null },
    ], { error: { message: "storage boom" } });
    const r = await deleteStonePhotoRecords(db, { bucket: "stone-photos", tenantId: T, clientId: C, photoId: "p1" });
    ok("INT-05 storage error non-fatal, removed empty", r.error === null && r.deleted === 1 &&
      r.removed.length === 0 && storageWasCalled(db));
  }

  // INT-06: reference-check query FAILS → safe side: no physical removal
  {
    const db = makeFakeDb([
      { data: [{ id: "p1", file_path: `${T}/${C}/${S}/a.png` }], error: null },
      { data: [{ id: "p1" }], error: null },
      { data: null, error: { message: "ref fail" } },
    ], { error: null });
    const r = await deleteStonePhotoRecords(db, { bucket: "stone-photos", tenantId: T, clientId: C, photoId: "p1" });
    ok("INT-06 ref-check error → no physical removal", r.error === null && r.deleted === 1 &&
      r.removed.length === 0 && !storageWasCalled(db));
  }

  // INT-07: stone-scoped delete (all photos of one stone), unique paths removed
  {
    const db = makeFakeDb([
      { data: [{ id: "p1", file_path: `${T}/${C}/${S}/a.png` }, { id: "p2", file_path: `${T}/${C}/${S}/b.png` }], error: null },
      { data: [{ id: "p1" }, { id: "p2" }], error: null },
      { data: [], error: null },
    ], { error: null });
    const r = await deleteStonePhotoRecords(db, { bucket: "stone-photos", tenantId: T, clientId: C, stoneId: S });
    ok("INT-07 stone-scoped delete removes both unique objects", r.error === null && r.deleted === 2 &&
      storageRemoved(db).length === 2);
  }

  console.log(`\nDYA-07 delete-integrity harness: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
void main();
