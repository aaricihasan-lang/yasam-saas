/**
 * W06 — Refleksoloji / Kayıtlı Atlas TOPLU SİLME regresyon harness'i (tsx; DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/reflexology-atlas-bulk-delete-harness.ts
 *
 * Gerçek kod yolları (atlasManage.planOrgansDeletion/deleteOrgansFromStorage + atlasStorage +
 * refleksolojiAtlasSync + bulkDeleteGuard) sahte tarayıcı (localStorage) ve sahte sunucu
 * üzerinde koşar. Sahte sunucu tenant'ı İSTEK GÖVDESİNDEN DEĞİL oturum token'ından çözer
 * (requireModuleAccess gibi) ve gerçek decideAtlasPut / validateAtlasPayload kararını uygular.
 * Gerçek production verisi YOK — tüm kayıtlar kurgusal test fixture'ıdır.
 *
 *   PLAN  P1–P7  saf plan: yalnız seçilenler, mezar taşı, bulunamayan, organ listesi
 *   SYNC  S1–S6  yerel + sunucu: kısmi/toplam silme, allow_empty, diriltmeme, tek PUT
 *   İZOL  I1–I3  başka uzman (tenant/kullanıcı) verisi + protokol/not verisi dokunulmaz
 *   HATA  H1–H2  kota hatası → hiçbir şey silinmez; bulunamayan raporlanır
 *   ONAY  G1–G5  1–2 kayıt tek onay; 3+ ve Tümünü Sil 3 aşama; her aşamada iptal → silme yok
 *   KAYNAK K1–K4 tekli silme metni + kart eylemleri korunur, toplu akış guard'ı kullanır
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(name: string, cond: unknown, detail = ""): void {
  try {
    assert.ok(cond);
    pass += 1;
    console.log(`  ✅ ${name}`);
  } catch {
    fail += 1;
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(t: string): void {
  console.log(`\n──────── ${t} ────────`);
}

// ─── Sahte tarayıcı ──────────────────────────────────────────────────────────
class MemoryStorage {
  map = new Map<string, string>();
  failPattern: RegExp | null = null;
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    if (this.failPattern && this.failPattern.test(k)) {
      const e = new Error("QuotaExceededError");
      e.name = "QuotaExceededError";
      throw e;
    }
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  get length() {
    return this.map.size;
  }
}
let ls = new MemoryStorage();
const win = new EventTarget() as EventTarget & { localStorage: MemoryStorage };
Object.defineProperty(win, "localStorage", { get: () => ls });
(globalThis as unknown as { window: unknown }).window = win;
Object.defineProperty(globalThis, "localStorage", { get: () => ls, configurable: true });

const USERS = {
  a: { user: { id: "user-a", tenant_id: "tenant-a", role: "expert" }, token: "tok-a" },
  b: { user: { id: "user-b", tenant_id: "tenant-b", role: "expert" }, token: "tok-b" },
} as const;
type Who = keyof typeof USERS;
function login(store: MemoryStorage, who: Who) {
  store.map.set("yasam_user", JSON.stringify(USERS[who].user));
  store.map.set("yasam_session_token", USERS[who].token);
}

// ─── Sahte sunucu: tenant başına TEK satır; tenant OTURUMDAN çözülür ─────────
let clock = 0;
const tick = () => new Date(Date.UTC(2026, 9, 29, 10, 0, 0) + (clock += 1000)).toISOString();
type Row = { updated_at: string; document: unknown; organ_list: string[] };
const serverRows = new Map<string, Row>();
const TOKEN_TENANT: Record<string, string> = { "tok-a": "tenant-a", "tok-b": "tenant-b" };
const putLog: Array<{ tenant: string; allowEmpty: boolean; status: number }> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function tenantFromHeaders(init?: RequestInit): string | null {
  const h = new Headers(init?.headers ?? {});
  for (const [, v] of h) {
    for (const tok of Object.keys(TOKEN_TENANT)) if (v.includes(tok)) return TOKEN_TENANT[tok];
  }
  return null;
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  const tenant = tenantFromHeaders(init);
  if (!tenant) return json({ ok: false }, 401);
  const { decideAtlasPut } = await import("@/lib/refleksoloji/atlasSyncCore");
  const { validateAtlasPayload } = await import("@/lib/refleksoloji/atlasValidate");

  if (url === "/api/refleksoloji/atlas") {
    const row = serverRows.get(tenant) ?? null;
    if (method === "GET") {
      return json({ ok: true, document: row?.document ?? null, organ_list: row?.organ_list ?? [], updated_at: row?.updated_at ?? null });
    }
    const bodyStr = typeof init?.body === "string" ? init.body : "{}";
    const body = JSON.parse(bodyStr);
    const invalid = validateAtlasPayload({ document: body.document, organList: body.organ_list, bodyBytes: Buffer.byteLength(bodyStr, "utf8") });
    if (invalid) return json({ ok: false, code: invalid.code }, invalid.status);
    const d = decideAtlasPut({
      current: row,
      expected: typeof body.expected_updated_at === "string" ? body.expected_updated_at : null,
      incomingDocument: body.document,
      incomingOrganList: body.organ_list ?? [],
      allowEmpty: body.allow_empty === true,
    });
    if (d.kind === "conflict") {
      putLog.push({ tenant, allowEmpty: body.allow_empty === true, status: 409 });
      return json({ ok: false, conflict: true, code: d.code }, 409);
    }
    const updated_at = tick();
    serverRows.set(tenant, { updated_at, document: body.document, organ_list: body.organ_list ?? [] });
    putLog.push({ tenant, allowEmpty: body.allow_empty === true, status: 200 });
    return json({ ok: true, updated_at });
  }
  // Protokol kullanım sorgusu vb. — bu harness'te kullanılmaz.
  return json({ ok: true, count: 0, titles: [] });
}
(globalThis as unknown as { fetch: unknown }).fetch = fakeFetch;

// ─── Fixture yardımcıları (kurgusal) ─────────────────────────────────────────
type R = Record<string, unknown>;
const reg = (id: string, cx = 0.3, cy = 0.4): R => ({ id, shape: "oval", cx, cy, rx: 0.05, ry: 0.05, angle: 0, color: "rgba(1,2,3,0.2)" });
const emptyEntry = () => ({ taban: { sol: [], sag: [] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] } });
function entry(...ids: string[]) {
  const e = emptyEntry() as Record<string, Record<string, R[]>>;
  ids.forEach((id, i) => e.taban[i % 2 ? "sag" : "sol"].push(reg(id, 0.2 + i * 0.05)));
  return e;
}
function docOf(organs: Record<string, ReturnType<typeof entry>>): R {
  return { ...organs, _meta: { version: "1", updated_at: "2026-10-29T09:00:00.000Z", tombstones: {}, organUpdatedAt: {} } };
}
function organsIn(doc: unknown): string[] {
  if (!doc || typeof doc !== "object") return [];
  return Object.keys(doc as R).filter((k) => k !== "_meta").sort((a, b) => a.localeCompare(b, "tr"));
}
function tombstonesOf(doc: unknown): Record<string, string> {
  return ((doc as { _meta?: { tombstones?: Record<string, string> } } | null)?._meta?.tombstones ?? {}) as Record<string, string>;
}
const stable = (v: unknown) => JSON.stringify(v);
function regionIds(e: unknown): string {
  const ids: string[] = [];
  for (const view of Object.values((e ?? {}) as Record<string, Record<string, R[]>>))
    for (const foot of ["sol", "sag"]) for (const r of view?.[foot] ?? []) ids.push(String(r.id));
  return ids.sort().join(",");
}

async function main() {
  const atlasStorage = await import("@/lib/atlasStorage");
  const atlasSync = await import("@/lib/refleksolojiAtlasSync");
  const runtime = await import("@/lib/refleksoloji/runtimeReset");
  const manage = await import("@/app/refleksoloji/kayitli-atlas/lib/atlasManage");
  const merge = await import("@/lib/refleksoloji/atlasMerge");
  const core = await import("@/lib/refleksoloji/atlasSyncCore");
  const guard = await import("@/lib/ui/bulkDeleteGuard");

  const devices = new Map<string, MemoryStorage>();
  function switchDevice(name: string, who: Who) {
    if (!devices.has(name)) devices.set(name, new MemoryStorage());
    ls = devices.get(name)!;
    login(ls, who);
    runtime.resetReflexologyRuntime();
  }
  async function openAtlasPage() {
    await atlasStorage.hydrateAndMergeAtlas();
    await atlasSync.flushAtlasNow();
  }

  // ════════════════════════════════════════════════════════════════════════
  section("PLAN — saf planOrgansDeletion");
  {
    const base = docOf({
      "Böbrek": entry("b1", "b2"),
      "Kalp": entry("k1"),
      "Karaciğer": entry("kc1", "kc2", "kc3"),
      "Mesane": entry("m1"),
    }) as unknown as import("@/lib/atlasStorage").AtlasDocument;
    (base._meta as { tombstones: Record<string, string> }).tombstones = { "eski organ": "2026-10-01T00:00:00.000Z" };
    const before = stable(base);
    const list = ["Böbrek", "Kalp", "Karaciğer", "Mesane", "Yetim"];
    const plan = manage.planOrgansDeletion(base, list, ["Kalp", "Mesane", "Kalp", "Olmayan", "_meta"]);

    ok("P1 yalnız seçilen organlar silinir", stable(plan.deleted) === stable(["Kalp", "Mesane"]) && stable(organsIn(plan.next)) === stable(["Böbrek", "Karaciğer"]));
    ok(
      "P2 seçilmeyen organların bölgeleri birebir aynı",
      stable(plan.next["Böbrek"]) === stable(base["Böbrek"]) && stable(plan.next["Karaciğer"]) === stable(base["Karaciğer"]),
    );
    const t = tombstonesOf(plan.next);
    ok("P3 silinenlere mezar taşı; eski mezar taşı korunur", !!t[merge.normOrgan("Kalp")] && !!t[merge.normOrgan("Mesane")] && t["eski organ"] === "2026-10-01T00:00:00.000Z");
    ok("P4 bulunamayan/yinelenen/_meta → missing, mezar taşı YOK", stable(plan.missing) === stable(["Olmayan", "_meta"]) && !t[merge.normOrgan("Olmayan")] && !!plan.next._meta);
    ok("P5 organ listesinden yalnız silinenler çıkar (yetim korunur)", stable(plan.nextOrganList) === stable(["Böbrek", "Karaciğer", "Yetim"]));
    ok("P6 girdi belgesi mutasyona uğramaz", stable(base) === before);
    const all = manage.planOrgansDeletion(base, list, organsIn(base));
    const plan2 = core.planAtlasPush(all.next, all.nextOrganList.filter((n) => n !== "Yetim"), null);
    ok("P7 tümü silinince boş belge + mezar taşı → allow_empty ile gönderilir", organsIn(all.next).length === 0 && plan2.send === true && plan2.allowEmpty === true);
  }

  // ════════════════════════════════════════════════════════════════════════
  section("SYNC + İZOL — iki uzman, aynı cihaz + ikinci cihaz");
  {
    // Uzman B (tenant-b) sunucuda 3 organ; Uzman A (tenant-a) 5 organ.
    const docA = docOf({ "Böbrek": entry("a1"), "Kalp": entry("a2"), "Karaciğer": entry("a3"), "Mesane": entry("a4"), "Tiroid": entry("a5") });
    const docB = docOf({ "Böbrek": entry("b1"), "Kalp": entry("b2"), "Akciğer": entry("b3") });
    serverRows.set("tenant-a", { updated_at: tick(), document: docA, organ_list: organsIn(docA) });
    serverRows.set("tenant-b", { updated_at: tick(), document: docB, organ_list: organsIn(docB) });
    const serverBBefore = stable(serverRows.get("tenant-b"));

    // Aynı cihazda önce B oturumu (B'nin yerel kapsamı + yerel protokol/not verisi oluşur).
    switchDevice("ortak", "b");
    await openAtlasPage();
    const bKeys = () => [...ls.map.entries()].filter(([k]) => k.includes("tenant-b")).sort();
    ls.map.set("refleks:v2:tenant-b:user-b:protocols", JSON.stringify([{ id: "p-b", organs: ["Kalp"] }]));
    const bLocalBefore = stable(bKeys());

    // Ardından A oturumu, A'nın yerel protokol/not verisi.
    switchDevice("ortak", "a");
    await openAtlasPage();
    ls.map.set("refleks:v2:tenant-a:user-a:protocols", JSON.stringify([{ id: "p-a", organs: ["Kalp", "Böbrek"] }]));
    ls.map.set("refleks:v2:tenant-a:user-a:notes", JSON.stringify([{ uid: "n-a", organ: "Kalp" }]));
    const aSideBefore = stable([ls.getItem("refleks:v2:tenant-a:user-a:protocols"), ls.getItem("refleks:v2:tenant-a:user-a:notes")]);
    ok("S0 A yerelinde 5 organ hidrate", stable(atlasStorage.listOrganNamesFromAtlas(atlasStorage.loadAtlas())) === stable(organsIn(docA)));

    // İkinci cihaz (A) — silmeden ÖNCE açık, bayat kopya tutar.
    switchDevice("a-tablet", "a");
    await openAtlasPage();
    switchDevice("ortak", "a");
    await openAtlasPage();

    // Seçilenleri Sil: Kalp + Mesane + Tiroid (3 → UI'da 3 aşamalı onay; burada depolama yolu).
    const keptBefore = stable([atlasStorage.loadAtlas()["Böbrek"], atlasStorage.loadAtlas()["Karaciğer"]]);
    const putsBefore = putLog.length;
    const r = manage.deleteOrgansFromStorage(["Kalp", "Mesane", "Tiroid"]);
    await atlasSync.flushAtlasNow();
    const localAfter = atlasStorage.loadAtlas();
    ok("S1 yerel: yalnız seçilen 3 organ silindi", stable(r.deleted) === stable(["Kalp", "Mesane", "Tiroid"]) && r.failed.length === 0 && stable(atlasStorage.listOrganNamesFromAtlas(localAfter)) === stable(["Böbrek", "Karaciğer"]));
    ok("S2 yerel: kalan organların bölgeleri birebir", stable([localAfter["Böbrek"], localAfter["Karaciğer"]]) === keptBefore && regionIds(localAfter["Böbrek"]) === "a1" && regionIds(localAfter["Karaciğer"]) === "a3");
    const rowA = serverRows.get("tenant-a")!;
    const newPuts = putLog.slice(putsBefore);
    ok("S3 sunucu A: tek PUT (200) ve yalnız 2 organ kaldı", newPuts.length === 1 && newPuts[0].status === 200 && newPuts[0].tenant === "tenant-a" && stable(organsIn(rowA.document)) === stable(["Böbrek", "Karaciğer"]), JSON.stringify(newPuts));
    ok("I1 sunucu B (başka uzman) birebir aynı", stable(serverRows.get("tenant-b")) === serverBBefore);
    ok("I2 aynı cihazdaki B yerel kapsamı birebir aynı", stable(bKeys()) === bLocalBefore);
    ok("I3 A'nın protokol/not yerel verisi dokunulmadı", stable([ls.getItem("refleks:v2:tenant-a:user-a:protocols"), ls.getItem("refleks:v2:tenant-a:user-a:notes")]) === aSideBefore);

    // Bayat ikinci cihaz açılınca silinen organlar DİRİLMEZ.
    switchDevice("a-tablet", "a");
    await openAtlasPage();
    ok("S4 bayat ikinci cihaz: silinenler dirilmedi (yerel + sunucu)", stable(atlasStorage.listOrganNamesFromAtlas(atlasStorage.loadAtlas())) === stable(["Böbrek", "Karaciğer"]) && stable(organsIn(serverRows.get("tenant-a")!.document)) === stable(["Böbrek", "Karaciğer"]));

    // Tümünü Sil (ikinci cihazdan): kalan tüm A organları.
    const names = atlasStorage.listOrganNamesFromAtlas(atlasStorage.loadAtlas());
    const putsBefore2 = putLog.length;
    const r2 = manage.deleteOrgansFromStorage(names);
    await atlasSync.flushAtlasNow();
    const puts2 = putLog.slice(putsBefore2);
    ok("S5 Tümünü Sil: yerel boş + sunucuya allow_empty PUT 200", r2.deleted.length === 2 && atlasStorage.listOrganNamesFromAtlas(atlasStorage.loadAtlas()).length === 0 && puts2.length === 1 && puts2[0].allowEmpty && puts2[0].status === 200 && organsIn(serverRows.get("tenant-a")!.document).length === 0, JSON.stringify(puts2));
    switchDevice("ortak", "a");
    await openAtlasPage();
    ok("S6 diğer cihaz açılınca A atlası boş; B hâlâ aynı", atlasStorage.listOrganNamesFromAtlas(atlasStorage.loadAtlas()).length === 0 && stable(serverRows.get("tenant-b")) === serverBBefore);
  }

  // ════════════════════════════════════════════════════════════════════════
  section("HATA — kota + bulunamayan");
  {
    const doc = docOf({ "Dalak": entry("d1"), "Mide": entry("m1"), "Pankreas": entry("p1") });
    serverRows.set("tenant-a", { updated_at: tick(), document: doc, organ_list: organsIn(doc) });
    switchDevice("kota", "a");
    await openAtlasPage();
    const before = ls.getItem("refleks:v2:tenant-a:user-a:atlas");
    ls.failPattern = /:atlas$/;
    const r = manage.deleteOrgansFromStorage(["Dalak", "Mide"]);
    ls.failPattern = null;
    ok("H1 atlas yazılamazsa: hiçbiri silinmez, tümü failed", r.deleted.length === 0 && stable(r.failed) === stable(["Dalak", "Mide"]) && ls.getItem("refleks:v2:tenant-a:user-a:atlas") === before);
    const r2 = manage.deleteOrgansFromStorage(["Mide", "Zaten Silinmiş"]);
    ok("H2 bulunamayan ayrı raporlanır, var olan silinir", stable(r2.deleted) === stable(["Mide"]) && stable(r2.missing) === stable(["Zaten Silinmiş"]) && stable(atlasStorage.listOrganNamesFromAtlas(atlasStorage.loadAtlas())) === stable(["Dalak", "Pankreas"]));
  }

  // ════════════════════════════════════════════════════════════════════════
  section("ONAY — bulkDeleteGuard akışı");
  {
    ok("G1 2 kayıt → 3 aşama GEREKMEZ; 3 kayıt → gerekir", !guard.requiresBulkDeleteGuard(2) && guard.requiresBulkDeleteGuard(3));
    ok("G2 Tümünü Sil (1 kayıt bile) → 3 aşama", guard.requiresBulkDeleteGuard(1, true));
    const stages: string[] = [];
    const yes: import("@/lib/ui/bulkDeleteGuard").BulkConfirmFn = async (o) => {
      stages.push(o.title ?? "");
      if (o.requireTextMatcher) return o.requireTextMatcher(guard.bulkDeletePhrase(4, true));
      return true;
    };
    const all = await guard.runBulkDeleteConfirm(yes, { count: 4, deleteAll: true, noun: "atlas kaydı", detail: "Silinecek kayıtlar:\n• A" });
    ok("G3 Tümünü Sil: 3 ayrı onay penceresi, TÜMÜNÜ SİL ifadesi", all && stages.length === 3 && guard.bulkDeletePhrase(4, true) === "TÜMÜNÜ SİL");
    let cancelAll = true;
    for (let stop = 0; stop < 3; stop += 1) {
      let i = 0;
      const no: import("@/lib/ui/bulkDeleteGuard").BulkConfirmFn = async (o) => {
        const cur = i++;
        if (cur === stop) return false;
        if (o.requireTextMatcher) return o.requireTextMatcher("3 KAYDI SİL");
        return true;
      };
      if (await guard.runBulkDeleteConfirm(no, { count: 3, noun: "atlas kaydı" })) cancelAll = false;
    }
    ok("G4 herhangi bir aşamada Vazgeç → false (silme çağrılmaz)", cancelAll);
    const wrong: import("@/lib/ui/bulkDeleteGuard").BulkConfirmFn = async (o) => (o.requireTextMatcher ? o.requireTextMatcher("2 KAYDI SİL") : true);
    const s1 = guard.buildBulkDeleteStages({ count: 3, noun: "atlas kaydı" });
    ok("G5 yanlış ifade reddedilir; aşama 1 sayıyı açıkça gösterir", !(await guard.runBulkDeleteConfirm(wrong, { count: 3 })) && s1.stage1.message.startsWith("3 atlas kaydı kalıcı olarak silinecek"));
  }

  // ════════════════════════════════════════════════════════════════════════
  section("KAYNAK — mevcut davranış kilidi");
  {
    const layout = readFileSync("app/refleksoloji/kayitli-atlas/components/KayitliAtlasLayout.tsx", "utf8");
    const card = readFileSync("app/refleksoloji/kayitli-atlas/components/OrganAtlasCard.tsx", "utf8");
    ok("K1 tekli silme onay metni korunur", layout.includes('"Bu organ ve kayıtlı tüm atlas bölgeleri silinsin mi? Bu işlem geri alınamaz."') && layout.includes("if (!deleteOrgan(organ))"));
    ok("K2 kartta Görüntüle / Düzenle / Sil korunur", ["Görüntüle", "Düzenle", "Sil"].every((t) => card.includes(`>\r\n          ${t}\r\n`) || card.includes(`>\n          ${t}\n`)));
    ok("K3 toplu akış guard + tek depolama yolu kullanır", layout.includes("requiresBulkDeleteGuard(count, deleteAll)") && layout.includes("runBulkDeleteConfirm(confirm") && layout.includes("deleteOrgans(names)"));
    ok("K4 Seçilenleri Sil seçim yokken pasif", layout.includes("disabled={bulkBusy || selectedNames.length === 0}"));
  }

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log("Başarısız:", failures.join(" | "));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("HARNESS ÇÖKTÜ:", e);
  process.exit(1);
});
