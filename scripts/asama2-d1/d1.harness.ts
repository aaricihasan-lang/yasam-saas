/**
 * AŞAMA 2 / D1 — Danışan Yolculuğu hata kapanışı: birim + sahte-DB harness'i (ağ/DB/prod YOK).
 *
 * Kapsam: DY-04 / BUG-001 (izin listesi + süre kuralı), DY-03 (Genel Bilgi sürümü), DY-01
 * (taş fotoğrafı yolu toplama fail-closed, analiz klasörü listeleme fail-closed), BUG-003
 * (HomeworkTab ve YolculukTab aynı canonical gecikme kuralı). Her bulgunun ESKİ davranışı da
 * yeniden üretilir ("ESKİ:" satırları) ve düzeltmeden sonra geçtiği gösterilir.
 *
 * Çalıştır: npx tsx scripts/asama2-d1/d1.harness.ts
 */
import {
  validateSessionWrite,
  validateStoneWrite,
  isValidSessionDuration,
  SESSION_WRITABLE_FIELDS,
  STONE_WRITABLE_FIELDS,
} from "../../lib/danisan/subRecordValidation";
import { clientVersion, readBaseVersion, CLIENT_VERSION_FIELDS } from "../../lib/danisan/clientVersion";
import { deleteStoneAndPhotos, collectOwnedStonePhotoPaths } from "../../lib/clients/stonePhotoStorage";
import { listClientAnalysisImagePaths, analysisImagePath } from "../../lib/clients/analysisImageStorage";
import { aggregateHomeworks } from "../../lib/odevStatus";

let pass = 0;
let fail = 0;
const ok = (c: unknown, l: string) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); }
};

const T = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const C = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const S = "cccccccc-cccc-cccc-cccc-cccccccccccc";

// Eski route davranışı (yasak listesi) — yeniden üretim için birebir kopya.
const OLD_PROTECTED = new Set(["tenant_id", "id", "created_at", "client_id"]);
const oldSanitize = (b: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(b).filter(([k]) => !OLD_PROTECTED.has(k)));

async function main() {
  console.log("\n[DY-04] İzin listesi (seans/taş)");
  const evil = { session_note: "x", tenant_id: "x", fee: 999, updated_at: "2000-01-01", user_id: "u", hacker_col: 1 };
  const old = oldSanitize(evil);
  ok("fee" in old && "updated_at" in old && "hacker_col" in old, "ESKİ: yasak listesi fee/updated_at/bilinmeyen kolonu DB'ye geçiriyordu");
  let v = validateSessionWrite(evil, "create");
  ok(v.ok && Object.keys(v.fields).join(",") === "session_note", "YENİ: yalnız izinli alan (session_note) kalır; tenant_id/fee/updated_at/bilinmeyen atılır");
  v = validateSessionWrite({ id: "r1", tenant_id: "x", unknown: 1 }, "patch");
  ok(!v.ok && v.code === "NO_FIELDS", "PATCH'te yalnız izinsiz alanlar → 400 NO_FIELDS (DB'ye gitmez)");
  v = validateStoneWrite({ stone_name: "Ametist", image_url: "http://evil", client_id: "y", stone_date: "2026-10-21" }, "patch");
  ok(v.ok && !("image_url" in v.fields) && !("client_id" in v.fields) && v.fields.stone_date === "2026-10-21", "taş: image_url/client_id yazılamaz, tarih geçer");
  ok(!validateStoneWrite({ stone_date: "2026-02-30" }, "patch").ok, "taş: geçersiz takvim tarihi → 400");
  ok(!validateStoneWrite({ stone_name: 42 }, "create").ok, "taş: metin alanına sayı → 400");
  ok(!validateSessionWrite({ session_note: "a".repeat(50001) }, "create").ok, "seans: aşırı uzun metin → 400");
  ok(SESSION_WRITABLE_FIELDS.join(",") === "session_date,session_type,duration_minutes,session_note,actions_done,suggestions,next_plan",
    "seans izin listesi = SessionsTab formToPayload alanları");
  ok(STONE_WRITABLE_FIELDS.join(",") === "stone_name,stone_type,note,usage_area,combination_text,warning_text,other_notes,stone_date",
    "taş izin listesi = StonesTab formToPayload alanları");

  console.log("\n[BUG-001] Seans süresi 0–1440");
  ok(oldSanitize({ duration_minutes: -30 }).duration_minutes === -30, "ESKİ: -30 dakika doğrudan yazılıyordu");
  for (const bad of [-1, -30, 1441, 99999, 1.5, Number.NaN, "30", true]) {
    ok(!validateSessionWrite({ duration_minutes: bad }, "create").ok, `geçersiz süre reddedilir: ${String(bad)} (${typeof bad})`);
  }
  for (const good of [0, 1, 45, 1440]) {
    const r = validateSessionWrite({ duration_minutes: good }, "create");
    ok(r.ok && r.fields.duration_minutes === good, `geçerli süre kabul: ${good}`);
  }
  const cleared = validateSessionWrite({ duration_minutes: null }, "patch");
  ok(cleared.ok && cleared.fields.duration_minutes === null, "boş süre (null) → alan temizlenir");
  ok(!isValidSessionDuration(-5) && isValidSessionDuration(60), "istemci/sunucu ortak kural");

  console.log("\n[DY-03] Genel Bilgi sürümü (CAS)");
  const row = { ad: "Ayşe", soyad: "Yılmaz", telefon: "555", dogum: "1990-01-01", kan: null, mizac: "dem", gorusme: "2026-10-01" };
  const v1 = clientVersion(row);
  ok(v1 === clientVersion({ ...row }), "aynı içerik → aynı sürüm");
  ok(v1 !== clientVersion({ ...row, telefon: "556" }), "telefon değişti → sürüm değişir (bayat form 409 alır)");
  ok(v1 === clientVersion({ ...row, gorusme: "2026-11-11" }), "gorusme sürüme girmez (randevu akışı Genel Bilgi'de yanlış çakışma üretmez)");
  ok(clientVersion({ ...row, kan: "" }) === clientVersion({ ...row, kan: null }), "null ve boş string aynı sürüm");
  ok(readBaseVersion({ base_version: v1 }) === v1 && readBaseVersion({}) === null && readBaseVersion({ base_version: "x" }) === null,
    "base_version yalnız 64 hex; yok/biçimsiz → CAS'sız eski davranış");
  ok(CLIENT_VERSION_FIELDS.join(",") === "ad,soyad,telefon,dogum,kan,mizac", "sürüm alanları = Genel Bilgi formunun yazdığı alanlar");

  console.log("\n[DY-01] Taş silme: fotoğraf yolu toplama FAIL-CLOSED (sahte DB)");
  {
    const db = fakeDb([{ data: null, error: { message: "read boom" } }]);
    const legacy = await collectOwnedStonePhotoPaths(db, { tenantId: T, clientId: C, stoneId: S });
    ok(Array.isArray(legacy) && legacy.length === 0, "ESKİ davranış (geri uyumlu fonksiyon): okuma hatası = boş liste");
  }
  {
    const db = fakeDb([{ data: null, error: { message: "read boom" } }]);
    const r = await deleteStoneAndPhotos(db, { bucket: "stone-photos", tenantId: T, clientId: C, stoneId: S });
    ok(r.error !== null && r.stoneDeleted === 0 && !db._calls.some((c) => c.delete) && !db._calls.some((c) => "storageRemove" in c),
      "YENİ: yol okuma hatası → taş SİLİNMEZ, storage'a dokunulmaz (yetim foto yok)");
  }
  {
    const db = fakeDb([
      { data: [{ file_path: `${T}/${C}/${S}/a.png` }, { file_path: `ffffffff-ffff-ffff-ffff-ffffffffffff/sifa/x.png` }], error: null },
      { data: [{ id: S }], error: null },
      { data: null, error: null },
      { data: [], error: null },
    ]);
    const r = await deleteStoneAndPhotos(db, { bucket: "stone-photos", tenantId: T, clientId: C, stoneId: S });
    const removed = db._calls.filter((c) => "storageRemove" in c).flatMap((c) => c.storageRemove as string[]);
    ok(r.stoneDeleted === 1 && removed.length === 1 && removed[0] === `${T}/${C}/${S}/a.png`,
      "normal silme: yalnız bu tenant+danışan+taş yolu silinir; ortak bucket'taki yabancı (Şifa) yolu ELENİR");
  }

  console.log("\n[DY-01] Analiz klasörü listeleme FAIL-CLOSED (sahte storage)");
  {
    const st = fakeStorage([{ data: null, error: { message: "list boom" } }]);
    const r = await listClientAnalysisImagePaths(st, T, C);
    ok(!r.ok, "listeleme hatası → ok:false (danışan silme durur)");
  }
  {
    const st = fakeStorage([{ data: null, error: { message: "Bucket not found" } }]);
    const r = await listClientAnalysisImagePaths(st, T, C);
    ok(r.ok && r.paths.length === 0, "bucket HİÇ yok (şema düzeyi) → nesne yok, boş liste (yalnız bu durum)");
  }
  {
    const st = fakeStorage([{ data: null, error: { message: "Bucket not found (timeout)" } }]);
    ok(!(await listClientAnalysisImagePaths(st, T, C)).ok, "benzer ama farklı hata metni → fail-closed");
  }
  {
    const st = fakeStorage([{ data: { not: "array" }, error: null }]);
    ok(!(await listClientAnalysisImagePaths(st, T, C)).ok, "beklenmeyen yanıt → ok:false");
  }
  {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `o${i}`, name: `a${String(i).padStart(4, "0")}.png` }));
    const page2 = [{ id: "z", name: "orphan.png" }, { id: null, name: "altklasor" }, { id: "q", name: "../kacis.png" }];
    const st = fakeStorage([{ data: page1, error: null }, { data: page2, error: null }]);
    const r = await listClientAnalysisImagePaths(st, T, C);
    ok(r.ok && r.paths.length === 1001 && r.paths.every((p) => p.startsWith(`${T}/${C}/`)) && r.paths.includes(`${T}/${C}/orphan.png`),
      "sayfalama + yetim yükleme yakalanır; klasör girdisi ve ayraçlı ad atlanır; yalnız bu tenant+danışan öneki");
    ok(st._lists.every((l) => l.prefix === `${T}/${C}`), "listeleme öneki sunucu üretimli tenant/danışan");
  }
  ok(analysisImagePath(T, C, "id-1") === `${T}/${C}/id-1.png`, "tek analiz görsel yolu upload-image ile aynı");

  console.log("\n[BUG-003] Ödev gecikme sayacı — HomeworkTab = YolculukTab");
  const today = "2026-10-22";
  const rows = [
    { status: "devam", end_date: "2026-10-10" }, // süresi dolmuş devam
    { status: "devam", end_date: "2026-10-22" }, // bugün biten → canonical: gecikmiş (≤ bugün)
    { status: "devam", end_date: "2026-11-01" },
    { status: "gecikti", end_date: "2026-09-01" },
    { status: "tamamlandi", end_date: "2026-01-01" },
    { status: "iptal", end_date: "2026-01-01" },
  ];
  const agg = aggregateHomeworks(rows, today);
  ok(agg.late === 1, "ESKİ: HomeworkTab 'Geciken' = hwAgg.late = 1 (yalnız açık 'gecikti')");
  ok(agg.overdue === 3, "YENİ: HomeworkTab 'Geciken' = hwAgg.overdue = 3 (YolculukTab ile AYNI)");
  const upcoming = rows.filter((r) => r.status === "devam" && r.end_date > today).map((r) => r.end_date).sort();
  ok(upcoming[0] === "2026-11-01", "'En yakın bitiş' geçmiş/bugün tarihleri değil ilk GELECEK bitişi gösterir");

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

// ─── Sahte Supabase (yalnız kullanılan alt küme) ─────────────────────────────
type Resp = { data: unknown; error: { message: string } | null };
function fakeDb(responses: Resp[]) {
  let qi = 0;
  const calls: Array<Record<string, unknown>> = [];
  function builder() {
    const c: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    b.from = (t: string) => { c.table = t; return b; };
    b.select = (s: string) => { c.select = s; return b; };
    b.delete = () => { c.delete = true; return b; };
    b.eq = () => b;
    b.in = (_col: string, vals: unknown) => { c.in = vals; return b; };
    b.then = (resolve: (v: Resp) => unknown, reject?: (e: unknown) => unknown) => {
      calls.push({ ...c });
      const r = responses[qi++] ?? { data: [], error: null };
      return Promise.resolve(r).then(resolve, reject);
    };
    return b;
  }
  const db = {
    from: (t: string) => (builder().from as (t: string) => unknown)(t),
    storage: {
      from: () => ({
        remove: (paths: string[]) => { calls.push({ storageRemove: paths }); return Promise.resolve({ error: null }); },
      }),
    },
    _calls: calls,
  };
  return db as unknown as import("@supabase/supabase-js").SupabaseClient & { _calls: Array<Record<string, unknown>> };
}
function fakeStorage(pages: Resp[]) {
  let i = 0;
  const lists: Array<{ prefix: string; offset: number }> = [];
  const db = {
    storage: {
      from: () => ({
        list: (prefix: string, opts: { offset: number }) => {
          lists.push({ prefix, offset: opts.offset });
          return Promise.resolve(pages[i++] ?? { data: [], error: null });
        },
      }),
    },
    _lists: lists,
  };
  return db as unknown as import("@supabase/supabase-js").SupabaseClient & { _lists: Array<{ prefix: string; offset: number }> };
}

main().catch((e) => { console.error("harness çöktü:", e); process.exit(2); });
