/**
 * Doğaltaş SATIŞ-ÖNCESİ NİHAİ — AŞAMA 2 regresyon harness'i (P1-01 … P2-09).
 *
 * Saf fonksiyonlar GERÇEKTEN çalıştırılır (sahte DB ile 1000-satır tavanı simülasyonu dahil);
 * route/UI davranışı kaynak-tarama kapılarıyla kilitlenir. Çalışan DB/ağ GEREKMEZ.
 *
 * Çalıştır: npx tsx scripts/dogaltas-presale-stage2/harness.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  STONE_CHAKRA_OPTIONS,
  STONE_WARNING_OPTIONS,
  canonicalTaxonomyValue,
  isTaxonomyOptionSelected,
  legacyTaxonomyValues,
  normalizeTaxonomyValues,
  taxonomyKey,
  toggleLegacyTaxonomyValue,
  toggleTaxonomyOption,
} from "../../lib/dogaltas/stoneTaxonomy";
import { fetchAllRows, fetchAllRowsByIds } from "../../lib/dogaltas/fetchAllRows";
import { parseReportIds, REPORT_MAX_IDS } from "../../lib/dogaltas/reportIds";
import { sanitizeMineralArrays, sanitizeMineralRowsForReport } from "../../lib/dogaltas/reportSafe";
import { validateMineralStructuredFields } from "../../lib/dogaltas/validation";
import { reportErrorKind } from "../../lib/dogaltas/reportErrorKind";
import { filterUnreferencedStonePhotoPaths, isStonePhotoReferenced } from "../../lib/dogaltas/stonePhotoRefs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; failures.push(name); console.error(`  ✗ ${name}`); }
}
function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
// ─── P1-01: canonical chakra / warning values ───────────────────────────────────
{
  ok("P1-01 kanonik çakra: Kalp Çakrası", STONE_CHAKRA_OPTIONS.includes("Kalp Çakrası"));
  ok("P1-01 kanonik çakra: Boğaz Çakrası", STONE_CHAKRA_OPTIONS.includes("Boğaz Çakrası"));
  ok("P1-01 kanonik uyarı: Hamilelik (Hamileler değil)", STONE_WARNING_OPTIONS.includes("Hamilelik") && !(STONE_WARNING_OPTIONS as readonly string[]).includes("Hamileler"));
  ok("P1-01 seçeneklerde kavram tekrarı yok (çakra)", new Set(STONE_CHAKRA_OPTIONS.map((o) => taxonomyKey("chakra", o))).size === STONE_CHAKRA_OPTIONS.length);
  ok("P1-01 seçeneklerde kavram tekrarı yok (uyarı)", new Set(STONE_WARNING_OPTIONS.map((o) => taxonomyKey("warning", o))).size === STONE_WARNING_OPTIONS.length);
  ok("P1-01 eşdeğerlik: Kalp Çakra ≡ Kalp Çakrası", taxonomyKey("chakra", "Kalp Çakra") === taxonomyKey("chakra", "Kalp Çakrası"));
  ok("P1-01 eşdeğerlik: Boğaz Çakra ≡ Boğaz Çakrası", canonicalTaxonomyValue("chakra", "Boğaz Çakra") === "Boğaz Çakrası");
  ok("P1-01 eşdeğerlik: Solar Pleksus Çakra ≡ Solar Pleksus", canonicalTaxonomyValue("chakra", "Solar Pleksus Çakra") === "Solar Pleksus");
  ok("P1-01 eşdeğerlik: Hamileler ≡ Hamilelik", canonicalTaxonomyValue("warning", "Hamileler") === "Hamilelik");
  ok("P1-01 büyük/küçük harf + boşluk", canonicalTaxonomyValue("chakra", "  kalp   çakrası ") === "Kalp Çakrası");
  ok("P1-01 bilinmeyen değer kanonik değil", canonicalTaxonomyValue("chakra", "Alın Çakrası") === null);

  // Eski yazımla kayıtlı taş → editörde kanonik seçenek işaretli görünür
  const stored = ["Kalp Çakra", "Alın Çakrası", "Kök Çakra"];
  ok("P1-01 eski yazım 'Kalp Çakra' → 'Kalp Çakrası' seçili görünür", isTaxonomyOptionSelected("chakra", stored, "Kalp Çakrası"));
  ok("P1-01 listede olmayan değer legacy olarak listelenir", eq(legacyTaxonomyValues("chakra", stored), ["Alın Çakrası"]));
  // Kanonik seçeneği kapatınca eski yazım da kalkar (kaldırılabilirlik)
  const off = toggleTaxonomyOption("chakra", stored, "Kalp Çakrası");
  ok("P1-01 kapatma eski yazımı da kaldırır", !off.includes("Kalp Çakra") && off.includes("Alın Çakrası") && off.includes("Kök Çakra"));
  // Açınca kanonik yazım eklenir; aynı kavram iki kez eklenemez
  const on = toggleTaxonomyOption("chakra", off, "Kalp Çakrası");
  ok("P1-01 açma kanonik yazımı ekler", on.includes("Kalp Çakrası"));
  ok("P1-01 seçili kavram tekrar eklenmez (toggle=kaldır)", !toggleTaxonomyOption("chakra", ["Kalp Çakra"], "Kalp Çakrası").some((v) => taxonomyKey("chakra", v) === "kalp"));
  // Legacy değer birebir kaldırılabilir / geri eklenebilir
  const lOff = toggleLegacyTaxonomyValue(stored, "Alın Çakrası");
  ok("P1-01 legacy değer kaldırılabilir", !lOff.includes("Alın Çakrası") && lOff.length === 2);
  ok("P1-01 legacy değer geri eklenebilir (yazım korunur)", toggleLegacyTaxonomyValue(lOff, "Alın Çakrası").includes("Alın Çakrası"));
  // Dokunulmayan değerler sessizce yeniden yazılmaz (sunucu PATCH dedupe)
  ok("P1-01 PATCH dedupe: ilk yazım korunur, ikinci yazım ayıklanır", eq(normalizeTaxonomyValues("chakra", ["Kalp Çakra", "Kalp Çakrası", "Kök Çakra"]), ["Kalp Çakra", "Kök Çakra"]));
  ok("P1-01 POST canonicalize: yeni kayıtta kanonik yazım", eq(normalizeTaxonomyValues("chakra", ["Kalp Çakra", "Alın Çakrası"], { canonicalize: true }), ["Kalp Çakrası", "Alın Çakrası"]));
  ok("P1-01 POST canonicalize uyarı", eq(normalizeTaxonomyValues("warning", ["Hamileler", "Hamilelik"], { canonicalize: true }), ["Hamilelik"]));

  const kayit = read("app/dogaltas/dogaltas-kayit/page.tsx");
  const detay = read("app/dogaltas/dogaltas-listesi/[id]/page.tsx");
  ok("P1-01 create tek kaynak kullanır", kayit.includes("STONE_CHAKRA_OPTIONS") && kayit.includes("STONE_WARNING_OPTIONS") && !/"Kalp Çakra",/.test(kayit) && !/"Hamilelik",/.test(kayit));
  ok("P1-01 edit tek kaynak kullanır", detay.includes("STONE_CHAKRA_OPTIONS") && detay.includes("STONE_WARNING_OPTIONS") && !/"Kalp Çakrası",/.test(detay) && !/"Hamileler",/.test(detay));
  ok("P1-01 edit legacy değerleri gösterir + kaldırılabilir", detay.includes("legacyTaxonomyValues(") && detay.includes("toggleLegacySelected") && detay.includes('data-testid="taxonomy-legacy"'));
  ok("P1-01 sunucu POST canonicalize", read("app/api/dogaltas/stones/route.ts").includes('normalizeTaxonomyValues("chakra", payload.chakras as string[], { canonicalize: true })'));
  ok("P1-01 sunucu PATCH dedupe (yeniden yazım yok)", read("app/api/dogaltas/stones/[id]/route.ts").includes('normalizeTaxonomyValues("chakra", fields.chakras as string[])'));
}

// ─── P2-01: malformed mineral report ────────────────────────────────────────────
{
  const valid = { id: "m1", name: "Çinko", fiziksel: ["Bağışıklık", " Enzim "], zihinsel: null, cakralar: [] };
  const v = sanitizeMineralArrays(valid);
  ok("P2-01 geçerli mineral BİREBİR korunur (çıktı değişmez)", eq(v.row, valid) && v.malformedFields.length === 0);
  const bad = { id: "m2", name: "Bozuk", fiziksel: "string-değil-dizi", zihinsel: [{ a: 1 }, 5, true, "metin", null], iceren_taslar: { x: 1 } };
  const b = sanitizeMineralArrays(bad);
  ok("P2-01 dizi olmayan alan → []", eq(b.row.fiziksel, []));
  ok("P2-01 dizi içinde nesne/null atlanır, sayı/bool metne", eq(b.row.zihinsel, ["5", "true", "metin"]));
  ok("P2-01 nesne alan → []", eq(b.row.iceren_taslar, []));
  ok("P2-01 bozuk alan adları raporlanır", eq(b.malformedFields.sort(), ["fiziksel", "iceren_taslar", "zihinsel"]));
  const origWarn = console.warn; const logs: string[] = [];
  console.warn = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  const rep = sanitizeMineralRowsForReport([valid, bad], { route: "harness", tenantId: "t1" });
  console.warn = origWarn;
  ok("P2-01 toplu normalize: 1 bozuk kayıt", rep.malformedCount === 1 && rep.rows.length === 2);
  ok("P2-01 log teknik bağlam içerir, içerik içermez", logs.length === 1 && logs[0].includes("m2") && logs[0].includes("fiziksel") && !logs[0].includes("string-değil-dizi"));
  ok("P2-01 API kapısı: string dizi kabul", validateMineralStructuredFields({ fiziksel: ["a"], kategori: "x", aciklama: null }).ok);
  ok("P2-01 API kapısı: string alan dizi değil → red", !validateMineralStructuredFields({ fiziksel: "a" }).ok);
  ok("P2-01 API kapısı: dizide sayı → red", !validateMineralStructuredFields({ zihinsel: [1] }).ok);
  ok("P2-01 API kapısı: kategori sayı → red", !validateMineralStructuredFields({ kategori: 5 }).ok);
  ok("P2-01 API kapısı: alan yoksa geçer (kısmi PATCH)", validateMineralStructuredFields({ name: "x" }).ok);
  ok("P2-01 minerals POST kapısı 422", read("app/api/dogaltas/minerals/route.ts").includes("validateMineralStructuredFields(payload)"));
  ok("P2-01 minerals PATCH kapısı 422", read("app/api/dogaltas/minerals/[id]/route.ts").includes("validateMineralStructuredFields(fields)"));
  for (const r of ["app/api/dogaltas/mineral-report/route.ts", "app/api/dogaltas/word-report/route.ts", "app/api/dogaltas/minerals/[id]/word-report/route.ts"]) {
    ok(`P2-01 rapor normalize: ${r}`, read(r).includes("sanitizeMineralRowsForReport("));
  }
}

// ─── P2-02: invalid bulk-report ID / DB error → no empty Word ───────────────────
{
  ok("P2-02 ids yok → tümü", eq(parseReportIds(undefined), { ok: true, ids: null }));
  ok("P2-02 boş dizi → tümü", eq(parseReportIds([]), { ok: true, ids: null }));
  ok("P2-02 UUID olmayan → red", parseReportIds(["not-a-uuid"]).ok === false);
  ok("P2-02 string olmayan → red", parseReportIds([5]).ok === false);
  ok("P2-02 dizi değil → red", parseReportIds("x").ok === false);
  const u = "11111111-1111-4111-8111-111111111111";
  const p = parseReportIds([u, u.toUpperCase()]);
  ok("P2-02 tekrar ayıklanır", p.ok && p.ids?.length === 1);
  const many = Array.from({ length: REPORT_MAX_IDS + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  ok("P2-02 üst sınır", parseReportIds(many).ok === false);
  const wr = read("app/api/dogaltas/word-report/route.ts");
  ok("P2-02 toplu rapor: seçim doğrulama", wr.includes("parseReportIds(selectedStoneIds)") && wr.includes("badSelectionResponse"));
  ok("P2-02 toplu rapor: DB hatası yutulmaz", /if \(r && !r\.ok\)[\s\S]{0,80}serverErrorResponse/.test(wr));
  ok("P2-02 toplu rapor: eksik seçim → 404 (Word yok)", wr.includes("missingSelectionResponse()"));
  ok("P2-02 toplu rapor: tamamen boş → 404", wr.includes('code: "empty_report"'));
  ok("P2-02 mineral rapor doğrulama + varlık", read("app/api/dogaltas/mineral-report/route.ts").includes("missingSelectionResponse()"));
  ok("P2-02 kütüphane rapor doğrulama + varlık", read("app/api/dogaltas/knowledge-report/route.ts").includes("missingSelectionResponse()"));
  ok("P2-02 kombinasyon rapor başlık doğrulama", read("app/api/dogaltas/combinations/word-report/route.ts").includes('badSelectionResponse("Kombinasyon başlığı geçersiz.")'));
  // reportErrorKind — gerçek Response nesneleriyle
  const mk = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  ok("P2-02 hata türü 401 → session", (await reportErrorKind(mk(401, {}))) === "session");
  ok("P2-02 hata türü 403 → forbidden", (await reportErrorKind(mk(403, {}))) === "forbidden");
  ok("P2-02 hata türü 404 empty_report → empty", (await reportErrorKind(mk(404, { code: "empty_report" }))) === "empty");
  ok("P2-02 hata türü 404 → notFound", (await reportErrorKind(mk(404, { code: "selection_missing" }))) === "notFound");
  ok("P2-02 hata türü 400 → invalid", (await reportErrorKind(mk(400, {}))) === "invalid");
  ok("P2-02 hata türü 500 HTML → generic (SyntaxError sızmaz)", (await reportErrorKind(new Response("<html>", { status: 502 }))) === "generic");
}

// ─── P2-03: double submit ───────────────────────────────────────────────────────
{
  for (const [f, fn] of [
    ["app/dogaltas/dogaltas-kayit/page.tsx", "handleSave"],
    ["app/dogaltas/mineral-bankasi/page.tsx", "saveMineral"],
    ["app/dogaltas/kombinasyon-olustur/page.tsx", "saveCombination"],
    ["app/dogaltas/kombinasyon-olustur/page.tsx", "saveCombinationToClient"],
    ["app/dogaltas/tas-bilgi-kutuphanesi/page.tsx", "saveArticle"],
  ] as const) {
    const s = read(f);
    const re = new RegExp(`async function ${fn}\\([^)]*\\) \\{\\s*if \\(saveLockRef\\.current\\) return;\\s*saveLockRef\\.current = true;[\\s\\S]{0,400}finally \\{\\s*saveLockRef\\.current = false;`);
    ok(`P2-03 senkron kilit + her çıkışta serbest: ${fn}`, re.test(s));
  }
  // Simülasyon: kilit deseni çift çağrıda tek "kaydetme" yapar, başarısızlıktan sonra tekrar denenebilir.
  let saves = 0; let shouldFail = true;
  const lock = { current: false };
  const inner = async () => { await new Promise((r) => setTimeout(r, 20)); saves++; if (shouldFail) throw new Error("ağ"); };
  const guarded = async () => { if (lock.current) return; lock.current = true; try { await inner(); } catch { /* hata */ } finally { lock.current = false; } };
  await Promise.all([guarded(), guarded(), guarded()]);
  ok("P2-03 simülasyon: çift/üçlü tık → 1 istek", saves === 1);
  shouldFail = false;
  await guarded();
  ok("P2-03 simülasyon: başarısız istekten sonra tekrar denenebilir", saves === 2 && lock.current === false);
  const kayit = read("app/dogaltas/dogaltas-kayit/page.tsx");
  ok("P2-03 buton tenant senkronu sırasında da kilitli", /setIsSaving\(true\);\s*const tenantId = await getSyncedTenantId\(\);/.test(kayit));
}

// ─── P2-04: knowledge provenance cannot be spoofed ──────────────────────────────
{
  const k = read("app/api/dogaltas/knowledge/route.ts");
  const post = k.slice(k.indexOf("export async function POST"), k.indexOf("export async function PATCH"));
  ok("P2-04 POST blacklist sanitize(body) kullanılmaz", !post.includes("...sanitize(body)"));
  ok("P2-04 POST allowlist", post.includes("POST_TEXT_FIELDS") && post.includes("POST_ARRAY_FIELDS"));
  const allow = k.slice(k.indexOf("const POST_TEXT_FIELDS"), k.indexOf("];", k.indexOf("const POST_ARRAY_FIELDS")));
  ok("P2-04 allowlist provenance alanı içermez", !/origin_|transferred_at|is_active|tenant_id/.test(allow));
  ok("P2-04 PATCH zorunlu alan boş olamaz", k.includes("const REQUIRED: Record<string, string>"));
}

// ─── P2-05: photo removal order + reference-safe cleanup ────────────────────────
{
  const d = read("app/dogaltas/dogaltas-listesi/[id]/page.tsx");
  const del = d.slice(d.indexOf("async function handleDeleteImage"), d.indexOf("const safeStone = useMemo("));
  const iUpdate = del.indexOf("await updateStone(");
  const iCleanup = del.indexOf("await cleanupPhotoFiles(");
  ok("P2-05 kaldırma: önce DB, sonra storage", iUpdate > 0 && iCleanup > iUpdate);
  ok("P2-05 kaldırma: storage DELETE doğrudan çağrılmaz (yalnız cleanup)", !del.includes('method: "DELETE"'));
  ok("P2-05 kaldırma: optimistic concurrency", /updateStone\(\s*currentStone\.id,\s*\{ images: nextImages \},\s*currentStone\.updated_at,?\s*\)/.test(del));
  ok("P2-05 kaldırma: 409'da dosyaya dokunulmaz", /if \(conflict\) \{[\s\S]{0,400}return;\s*\}/.test(del) && del.indexOf("if (conflict)") < iCleanup);
  const up = d.slice(d.indexOf("async function handlePhotoUpload"), d.indexOf("async function handleDeleteImage"));
  ok("P2-05 ekleme: optimistic concurrency", up.includes("currentStone.updated_at"));
  ok("P2-05 ekleme: başarısızlıkta yüklenen dosyalar temizlenir", (up.match(/cleanupPhotoFiles\(additions\.map/g) || []).length >= 2);
  ok("P2-05 ekleme: busy her durumda sıfırlanır", /finally \{\s*setImageBusy\(false\);/.test(up));
  ok("P2-05 photos DELETE referans kontrolü", read("app/api/dogaltas/stones/photos/route.ts").includes("isStonePhotoReferenced(db, tenantId, filePath)"));
  ok("P2-05 taş silme referans-güvenli", read("app/api/dogaltas/stones/[id]/route.ts").includes("filterUnreferencedStonePhotoPaths"));
  ok("P2-05 toplu silme referans-güvenli", read("app/api/dogaltas/stones/bulk-delete/route.ts").includes("filterUnreferencedStonePhotoPaths"));

  // Sahte DB ile referans kontrolü
  type Filter = { tenant?: string; contains?: string };
  const stones = [
    { tenant_id: "t1", images: [{ id: "a", name: "a", file_path: "catalog/t1/a.png" }] },
    { tenant_id: "t1", images: ["catalog/t1/legacy.png"] },
    { tenant_id: "t2", images: [{ id: "x", name: "x", file_path: "catalog/t1/b.png" }] },
  ];
  function fakeDb(failing = false) {
    return {
      from() {
        const f: Filter = {};
        const q = {
          select() { return q; },
          eq(_c: string, v: string) { f.tenant = v; return q; },
          contains(_c: string, v: string) { f.contains = v; return q; },
          limit() {
            if (failing) return Promise.resolve({ data: null, error: { message: "boom" } });
            const needle = JSON.parse(f.contains ?? "[]")[0];
            const hit = stones.filter((s) => s.tenant_id === f.tenant && s.images.some((im) =>
              typeof needle === "string" ? im === needle : typeof im === "object" && im.file_path === needle.file_path));
            return Promise.resolve({ data: hit.map(() => ({ id: "s" })), error: null });
          },
        };
        return q;
      },
    } as never;
  }
  ok("P2-05 referanslı (nesne) dosya silinmez", await isStonePhotoReferenced(fakeDb(), "t1", "catalog/t1/a.png"));
  ok("P2-05 referanslı (legacy string) dosya silinmez", await isStonePhotoReferenced(fakeDb(), "t1", "catalog/t1/legacy.png"));
  ok("P2-05 referanssız dosya silinebilir", !(await isStonePhotoReferenced(fakeDb(), "t1", "catalog/t1/b.png")));
  const origErr = console.error; console.error = () => {};
  ok("P2-05 referans sorgusu hatası → fail-safe (silinmez)", await isStonePhotoReferenced(fakeDb(true), "t1", "catalog/t1/zzz.png"));
  console.error = origErr;
  const split = await filterUnreferencedStonePhotoPaths(fakeDb(), "t1", ["catalog/t1/a.png", "catalog/t1/b.png"]);
  ok("P2-05 filtre ayırımı", eq(split, { removable: ["catalog/t1/b.png"], referenced: ["catalog/t1/a.png"] }));
}

// ─── P2-06: blank name server validation ────────────────────────────────────────
{
  const s = read("app/api/dogaltas/stones/[id]/route.ts");
  ok("P2-06 stone PATCH boş/boşluk ad → 400", /if \("stone_name" in fields\) \{[\s\S]{0,300}status: 400/.test(s));
  ok("P2-06 mineral PATCH boş ad → 400 (korunur)", read("app/api/dogaltas/minerals/[id]/route.ts").includes('"Mineral adı zorunludur."'));
  ok("P2-06 kombinasyon PATCH boş ad → 400 (korunur)", read("app/api/dogaltas/combinations/[id]/route.ts").includes('"Kombinasyon adı zorunludur."'));
  ok("P2-06 kütüphane PATCH boş başlık → 400", read("app/api/dogaltas/knowledge/route.ts").includes('title: "Başlık zorunludur."'));
}

// ─── P2-07: >1000 row behavior ──────────────────────────────────────────────────
{
  // Sahte PostgREST: max-rows tavanı uygulayan sayfa kaynağı
  const N = 2537;
  const rows = Array.from({ length: N }, (_, i) => ({ id: i }));
  let calls = 0;
  const pager = (maxRows: number) => (from: number, to: number) => {
    calls++;
    const end = Math.min(to, from + maxRows - 1);
    return Promise.resolve({ data: rows.slice(from, end + 1), error: null });
  };
  calls = 0;
  const r1 = await fetchAllRows<{ id: number }>(pager(1000));
  ok("P2-07 max-rows=1000 → 2537 satırın TAMAMI", r1.ok && r1.rows.length === N && r1.rows[N - 1].id === N - 1 && !r1.truncated);
  ok("P2-07 istek sayısı sınırlı (N/1000 + 1)", calls === 4);
  const r2 = await fetchAllRows<{ id: number }>(pager(300));
  ok("P2-07 max-rows=300 (daha düşük ayar) → yine TAMAMI", r2.ok && r2.rows.length === N);
  const r3 = await fetchAllRows<{ id: number }>(pager(1000), { maxRows: 1500 });
  ok("P2-07 bounded okuma: truncated dürüst", r3.ok && r3.rows.length === 1500 && r3.truncated);
  const r4 = await fetchAllRows<{ id: number }>(pager(1000), { maxRows: 5000 });
  ok("P2-07 bounded okuma: sınır aşılmazsa truncated=false", r4.ok && r4.rows.length === N && !r4.truncated);
  let n = 0;
  const r5 = await fetchAllRows<{ id: number }>(() => { n++; return Promise.resolve(n === 2 ? { data: null, error: { message: "x" } } : { data: rows.slice(0, 1000), error: null }); });
  ok("P2-07 ara sayfa hatası yutulmaz", !r5.ok);
  const ids = Array.from({ length: 400 }, (_, i) => String(i));
  const chunks: number[] = [];
  const r6 = await fetchAllRowsByIds<{ id: string }>(ids, (chunk, from) => { if (from === 0) chunks.push(chunk.length); return Promise.resolve({ data: from === 0 ? chunk.map((id) => ({ id })) : [], error: null }); });
  ok("P2-07 .in() parçalı (URL sınırı) ve tam", r6.ok && r6.rows.length === 400 && chunks.every((c) => c <= 150) && chunks.length === 3);

  const mustPage = [
    "app/api/dogaltas/combinations/route.ts",
    "app/api/dogaltas/duplicate-check/route.ts",
    "app/api/dogaltas/knowledge/route.ts",
    "app/api/dogaltas/stone-warnings/route.ts",
    "app/api/dogaltas/stone-exclusions/route.ts",
    "app/api/dogaltas/inventory/route.ts",
    "app/api/dogaltas/minerals/route.ts",
    "app/api/dogaltas/stones/route.ts",
    "app/api/dogaltas/stones/condition-search/route.ts",
    "app/api/dogaltas/word-report/route.ts",
    "app/api/dogaltas/mineral-report/route.ts",
    "app/api/dogaltas/knowledge-report/route.ts",
    "app/api/dogaltas/combinations/word-report/route.ts",
    "app/api/admin/dogaltas/combinations/route.ts",
    "app/api/admin/dogaltas/records/route.ts",
    "lib/dogaltas/combinationStonesRead.ts",
  ];
  for (const f of mustPage) ok(`P2-07 sayfalı okuma: ${f}`, /fetchAllRows(ByIds)?</.test(read(f)));
  const cs = read("app/api/dogaltas/stones/condition-search/route.ts");
  ok("P2-07 condition-search: .range(0, CORPUS_CAP) kaldırıldı + dürüst capped", !/[^`]\.range\(0, CORPUS_CAP\)/.test(cs) && cs.includes("corpusRes.truncated ||"));
  ok("P2-07 liste: kararlı ikincil sıra (id)", /STONES_LIST_ORDER_OPTIONS\)\s*\/\/[^\n]*\n\s*\.order\("id"/.test(read("app/api/dogaltas/stones/route.ts")));
  ok("P2-07 filtreli dışa aktarım 500'de kesilmez", read("app/dogaltas/dogaltas-listesi/page.tsx").includes("for (let offset = 0; offset < 100_000; offset += PAGE)"));
}

// ─── P2-08: admin-only import / transfer picker ─────────────────────────────────
{
  const vp = read("app/admin/veri-paylasimi/page.tsx");
  ok("P2-08 veri-paylaşımı: tarayıcı supabase client yok", !vp.includes('from "@/lib/supabase"') && !/supabase\s*\.from\(/.test(vp));
  ok("P2-08 veri-paylaşımı: admin route kullanır", vp.includes("/api/admin/dogaltas/records?type="));
  ok("P2-08 veri-paylaşımı: ham hata gösterilmez", !vp.includes("fetchError = error.message"));
  const rec = read("app/api/admin/dogaltas/records/route.ts");
  ok("P2-08 records route: verifyAdminRequest", rec.includes("await verifyAdminRequest(req)"));
  ok("P2-08 records route: tenant sunucuda (resolveAdminOwnTenant)", rec.includes("resolveAdminOwnTenant(db, guard.adminId)") && rec.includes("foreignTenantResponse()"));
  ok("P2-08 records route: tip allowlist", rec.includes('type !== "stones" && type !== "minerals"'));
  ok("P2-08 records route: ham DB hatası dönmez", rec.includes("serverErrorResponse(") && !rec.includes("error.message"));
  const tv = read("app/admin/toplu-veri/page.tsx");
  ok("P2-08 toplu-veri: tarayıcı supabase insert yok", !tv.includes('from "@/lib/supabase"') && !/supabase\s*\.from\("(stones|minerals)"\)/.test(tv));
  ok("P2-08 toplu-veri: admin import API", tv.includes("/api/admin/toplu-veri/${resource}"));
  for (const r of ["app/api/admin/toplu-veri/stones/route.ts", "app/api/admin/toplu-veri/minerals/route.ts"]) {
    const s = existsSync(resolve(ROOT, r)) ? read(r) : "";
    ok(`P2-08 ${r}: admin guard + kendi tenant`, s.includes("verifyAdminRequest(req)") && s.includes("resolveAdminOwnTenant("));
  }
  const ac = read("app/api/admin/dogaltas/combinations/route.ts");
  ok("P2-08 admin combinations: ham error.message dönmez", !ac.includes("error.message"));
}

// ─── P2-09: server-error != empty-state, Word errors, modals ────────────────────
{
  for (const [f, label] of [
    ["app/dogaltas/dogaltas-listesi/[id]/page.tsx", "taş detay"],
    ["app/dogaltas/mineral-listesi/[id]/page.tsx", "mineral detay"],
    ["app/dogaltas/kombinasyonlar/[title]/page.tsx", "kombinasyon detay"],
  ] as const) {
    const s = read(f);
    ok(`P2-09A ${label}: Word hatası sessiz değil`, s.includes("reportErrorKind(res)") && !s.includes("/* sessiz") && !s.includes("// sessiz hata"));
  }
  ok("P2-09A pano: ham SyntaxError/sunucu metni gösterilmez", read("app/dogaltas/page.tsx").includes("setReportError(tre(await reportErrorKind(res)))"));
  ok("P2-09B oluşturucu: hata ≠ eşleşme yok", read("app/dogaltas/kombinasyon-olustur/page.tsx").includes('data-testid="builder-search-error"'));
  ok("P2-09B oluşturucu: öneri hatası sonuçları gizlemez", !read("app/dogaltas/kombinasyon-olustur/page.tsx").includes("setError(sugg.error)"));
  ok("P2-09B liste detay filtre: hata ≠ sonuç yok", read("app/dogaltas/dogaltas-listesi/page.tsx").includes('data-testid="list-filter-error"'));
  ok("P2-09B liste filtre modu: sonsuz iskelet yok (yükleme detay aramasından)", read("app/dogaltas/dogaltas-listesi/page.tsx").includes("const effectiveListLoading = needsFullLoad ? detailLoading || detailData === null : listLoading;") && read("app/dogaltas/dogaltas-listesi/page.tsx").includes("{effectiveListLoading && filteredStones.length === 0 ? ("));
  ok("P2-09B kütüphane: hata ≠ boş kütüphane", read("app/dogaltas/tas-bilgi-kutuphanesi/page.tsx").includes('data-testid="library-load-error"'));
  ok("P2-09B pano trend: hata ≠ sıfır çubuk", read("app/dogaltas/page.tsx").includes('data-testid="dash-trend-error"'));
  ok("P2-09C liste filtre paneli: max-h + kayan gövde + sabit footer", /max-h-\[calc\(100dvh-2rem\)\][^"]*flex-col/.test(read("app/dogaltas/dogaltas-listesi/page.tsx")) && read("app/dogaltas/dogaltas-listesi/page.tsx").includes("min-h-0 flex-1 overflow-y-auto"));
  ok("P2-09C atama modalı: mobilde kayar, sm+ korunur", read("app/dogaltas/dogaltas-kayit/page.tsx").includes("max-h-[calc(100dvh-1.5rem)]") && read("app/dogaltas/dogaltas-kayit/page.tsx").includes("sm:h-[78vh]"));
  for (const f of ["app/dogaltas/page.tsx", "app/dogaltas/mineral-listesi/page.tsx", "app/dogaltas/tas-bilgi-kutuphanesi/page.tsx"]) {
    ok(`P2-09C Word modalı kayar: ${f}`, read(f).includes('data-testid="word-modal" className="max-h-[calc(100dvh-1.5rem)]'));
  }
  ok("P2-09C mineral bankası editörü kayar", read("app/dogaltas/mineral-bankasi/page.tsx").includes("max-h-[calc(100dvh-2.5rem)]"));
  for (const loc of ["tr", "en"]) {
    const m = JSON.parse(read(`messages/${loc}/stones.json`));
    ok(`P2-09 i18n ${loc}: reportErrors anahtarları`, ["session", "forbidden", "notFound", "empty", "invalid", "generic"].every((k) => typeof m.stones.reportErrors?.[k] === "string"));
  }
}

// ─── Güvenlik regresyon kilitleri (önceki PASS'ler korunur) ─────────────────────
{
  ok("SEC tek-taş GET tenant kapsamı korunur", read("app/api/dogaltas/stones/[id]/route.ts").includes('.eq("id", id).in("tenant_id", ids).maybeSingle()'));
  ok("SEC images[].url SSRF reddi korunur", read("app/api/dogaltas/stones/[id]/route.ts").includes("validateStoneImagesField(fields.images, tenantId)"));
  ok("SEC toplu rapor tenant filtresi her sayfada", (read("app/api/dogaltas/word-report/route.ts").match(/\.eq\("tenant_id", tenantId\)/g) || []).length >= 5);
}

console.log(`\nDoğaltaş AŞAMA 2 harness: ${pass} PASS / ${fail} FAIL (toplam ${pass + fail})`);
if (fail > 0) { console.log("Başarısız:\n - " + failures.join("\n - ")); process.exit(1); }
console.log("✓ TÜM KAPILAR GEÇTİ");
}

void main();
