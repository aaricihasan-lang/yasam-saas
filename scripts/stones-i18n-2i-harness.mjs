/**
 * Stones (Doğaltaş) i18n — AŞAMA 2I: Stones-geneli session/tenant/workspace hata
 * mesajı localization.
 *
 * Paylaşımlı `MISSING_SESSION_TENANT_MESSAGE` (Türkçe sabit, ~26 consumer) Stones
 * UI sayfalarında (~9 consumer) doğrudan display olarak gösteriliyordu; EN
 * arayüzde Türkçe hata çıkıyordu. Fix: Stones UI boundary'de artık
 * tc("workspaceUnavailable") (stones.common) ile localize gösteriliyor. İki
 * dolaylı akış (dogaltas/page arama throw + combinationsApi lib return) için
 * locale-BAĞIMSIZ kod sentinel `STONES_WORKSPACE_UNAVAILABLE` kullanılıyor ve
 * yalnız görüntüleme sınırında localize ediliyor.
 *
 * Paylaşımlı sabit GLOBAL olarak DEĞİŞMEDİ; Stones-dışı consumer'lar (aromaterapi,
 * biyoenerji, numeroloji, sifa-rehberi) DEĞİŞMEDİ; server/API contract DEĞİŞMEDİ.
 *
 * Salt-okunur; exit 1. Çalıştır: node scripts/stones-i18n-2i-harness.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@formatjs/icu-messageformat-parser";

const ROOT = process.cwd();
let fail = 0;
const err = (m) => { console.log("  ❌ " + m); fail++; };
const ok = (m) => console.log("  ✅ " + m);
const rd = (p) => JSON.parse(readFileSync(join(ROOT, "messages", p), "utf8"));
const src = (p) => readFileSync(join(ROOT, p), "utf8");

const enS = rd("en/stones.json").stones, trS = rd("tr/stones.json").stones;

// Stones UI consumer sayfaları (paylaşımlı sabiti display için kullanan/kullanmış).
const STONES_PAGES = [
  "app/dogaltas/page.tsx",
  "app/dogaltas/mineral-listesi/[id]/page.tsx",
  "app/dogaltas/mineral-listesi/page.tsx",
  "app/dogaltas/mineral-bankasi/page.tsx",
  "app/dogaltas/kombinasyonlar/page.tsx",
  "app/dogaltas/kombinasyonlar/[title]/page.tsx",
  "app/dogaltas/kombinasyon-olustur/page.tsx",
  "app/dogaltas/dogaltas-listesi/page.tsx",
  "app/dogaltas/dogaltas-kayit/page.tsx",
];

// Stones-DIŞI consumer'lar (bu turda DEĞİŞMEMELİ → sabiti hâlâ kullanmalı).
const NON_STONES_CONSUMERS = [
  "app/aromaterapi/yaglar/[id]/page.tsx",
  "app/aromaterapi/_components/OilsPage.tsx",
  "app/aromaterapi/karisim-olusturucu/page.tsx",
  "app/aromaterapi/bilgi-bankasi/page.tsx",
  "app/dashboard/biyoenerji/components/SembolDili.tsx",
  "app/dashboard/biyoenerji/components/SembolDiliDetail.tsx",
  "app/dashboard/biyoenerji/components/Imajinasyonlar.tsx",
  "app/dashboard/biyoenerji/components/ImajinasyonlarDetail.tsx",
  "app/dashboard/biyoenerji/components/Cakralar.tsx",
  "app/dashboard/biyoenerji/components/CakralarDetail.tsx",
  "app/dashboard/biyoenerji/components/BilincaltiSebepleri.tsx",
  "app/dashboard/biyoenerji/components/BilincaltiSebepleriDetail.tsx",
  "app/numeroloji/liste/page.tsx",
  "app/sifa-rehberi/[id]/page.tsx",
  "app/sifa-rehberi/page.tsx",
];

// ── GATE A: localized workspace copy değerleri + parity ──────────────────────
console.log("[GATE A] stones.common.workspaceUnavailable values + parity");
enS.common?.workspaceUnavailable === "Your workspace information could not be loaded. Please sign in again."
  ? ok('EN common.workspaceUnavailable = "Your workspace information could not be loaded. Please sign in again."')
  : err(`EN workspaceUnavailable beklenmedik: "${enS.common?.workspaceUnavailable}"`);
trS.common?.workspaceUnavailable === "Çalışma alanı bilgileriniz yüklenemedi. Lütfen yeniden giriş yapın."
  ? ok('TR common.workspaceUnavailable = "Çalışma alanı bilgileriniz yüklenemedi. Lütfen yeniden giriş yapın."')
  : err(`TR workspaceUnavailable beklenmedik: "${trS.common?.workspaceUnavailable}"`);
JSON.stringify(Object.keys(enS.common ?? {}).sort()) === JSON.stringify(Object.keys(trS.common ?? {}).sort())
  ? ok("stones.common EN/TR anahtar parity") : err("stones.common parity BOZUK");

// ── GATE B: Stones UI sabiti display olarak KULLANMIYOR + localize ediyor ────
console.log("\n[GATE B] Stones UI no longer displays shared Turkish constant");
for (const p of STONES_PAGES) {
  const s = src(p);
  !s.includes("MISSING_SESSION_TENANT_MESSAGE")
    ? ok(`${p}: MISSING_SESSION_TENANT_MESSAGE import/kullanım YOK`)
    : err(`${p}: MISSING_SESSION_TENANT_MESSAGE hâlâ var`);
  s.includes('tc("workspaceUnavailable")')
    ? ok(`${p}: tc("workspaceUnavailable") ile localize gösterim`)
    : err(`${p}: localize workspace mesajı kullanılmıyor`);
}

// ── GATE C: locale-BAĞIMSIZ sentinel mimarisi (dolaylı akışlar) ──────────────
console.log("\n[GATE C] locale-independent sentinel for indirect flows");
const sentinel = src("lib/dogaltas/sessionError.ts");
sentinel.includes('export const STONES_WORKSPACE_UNAVAILABLE = "STONES_WORKSPACE_UNAVAILABLE";')
  ? ok("sessionError.ts: STONES_WORKSPACE_UNAVAILABLE kodu tanımlı (display DEĞİL)")
  : err("sessionError.ts sentinel tanımı beklenmedik");
const combLib = src("lib/dogaltas/combinationsApi.ts");
(combLib.includes("STONES_WORKSPACE_UNAVAILABLE") && !combLib.includes("MISSING_SESSION_TENANT_MESSAGE"))
  ? ok("combinationsApi.ts: sabit yerine locale-bağımsız kod dönüyor")
  : err("combinationsApi.ts hâlâ Türkçe sabiti dönüyor");
// dogaltas/page: arama throw kodu + catch sınırında localize
const hub = src("app/dogaltas/page.tsx");
(hub.includes("throw new Error(STONES_WORKSPACE_UNAVAILABLE)")
  && hub.includes("err.message === STONES_WORKSPACE_UNAVAILABLE")
  && hub.includes('setSearchError(tc("workspaceUnavailable"))'))
  ? ok("dogaltas/page: arama akışı sentinel throw + catch sınırında localize")
  : err("dogaltas/page arama sentinel/catch mimarisi eksik");
// kombinasyonlar iki sayfa: sentinel'i tc ile eşliyor
const kList = src("app/dogaltas/kombinasyonlar/page.tsx");
const kDetail = src("app/dogaltas/kombinasyonlar/[title]/page.tsx");
(kList.includes("=== STONES_WORKSPACE_UNAVAILABLE") && kList.includes('tc("workspaceUnavailable")'))
  ? ok("kombinasyonlar/page: lib kodu → tc('workspaceUnavailable') eşlemesi")
  : err("kombinasyonlar/page sentinel eşlemesi eksik");
(kDetail.includes("=== STONES_WORKSPACE_UNAVAILABLE") && kDetail.includes('tc("workspaceUnavailable")'))
  ? ok("kombinasyonlar/[title]: lib kodu → tc('workspaceUnavailable') eşlemesi")
  : err("kombinasyonlar/[title] sentinel eşlemesi eksik");

// ── GATE D: paylaşımlı sabit GLOBAL değişmedi + Stones-dışı consumer intact ──
console.log("\n[GATE D] shared constant unchanged & non-Stones consumers intact");
const shared = src("lib/auth/sessionTenant.ts");
(shared.includes("export const MISSING_SESSION_TENANT_MESSAGE =")
  && shared.includes('"Aktif kullanıcı tenant_id bulunamadı. Lütfen tekrar giriş yapın.";'))
  ? ok("lib/auth/sessionTenant.ts: paylaşımlı sabit değeri KORUNDU (global mutation yok)")
  : err("paylaşımlı MISSING_SESSION_TENANT_MESSAGE DEĞİŞMİŞ");
let nonStonesOk = true;
for (const p of NON_STONES_CONSUMERS) {
  if (!src(p).includes("MISSING_SESSION_TENANT_MESSAGE")) { nonStonesOk = false; err(`${p}: sabit KAYBOLMUŞ (Stones-dışı davranış değişti)`); }
}
nonStonesOk ? ok(`Stones-dışı ${NON_STONES_CONSUMERS.length} consumer paylaşımlı sabiti hâlâ kullanıyor (davranış değişmedi)`) : null;

// ── GATE E: locale-BAĞIMLI branching YOK (kod ≠ display, display ≠ control) ──
console.log("\n[GATE E] no locale-dependent branching in Stones files");
const allStones = STONES_PAGES.concat(["lib/dogaltas/combinationsApi.ts"]).map(src).join("\n");
// Türkçe hata literal'i üzerinde karşılaştırma YOK
!/(===|!==|startsWith|includes)\s*\(?\s*["'`][^"'`]*(Aktif kullanıcı|Çalışma alanı bilgileriniz|tenant_id bulunamadı)/.test(allStones)
  ? ok("Türkçe workspace/tenant literal'i üzerinde control-flow YOK") : err("Türkçe literal üzerinde control-flow VAR");
// localize edilmiş display çağrısı control-flow anahtarı DEĞİL
!/(===|!==|startsWith|includes)\s*\(?\s*tc\(\s*["'`]workspaceUnavailable/.test(allStones)
  ? ok("tc('workspaceUnavailable') display'i control-flow karşılaştırmasında kullanılmıyor") : err("localize display control-flow'a bağlanmış");
// dolaylı akış karşılaştırmaları locale-BAĞIMSIZ kod üzerinden
allStones.includes("=== STONES_WORKSPACE_UNAVAILABLE")
  ? ok("dolaylı akış branch'leri locale-bağımsız kod (STONES_WORKSPACE_UNAVAILABLE) üzerinden") : err("locale-bağımsız kod branch'i bulunamadı");

// ── GATE F: 2E / 2F / 2G / 2H regression guards ──────────────────────────────
console.log("\n[GATE F] 2E / 2F / 2G / 2H regression guards");
const gd = src("app/dogaltas/dogaltas-listesi/[id]/page.tsx");
const idxHook = gd.indexOf("useSignedStoneImageUrls(imageFilePaths)"), idxLoad = gd.indexOf("if (loading) {");
(idxHook > -1 && idxHook < idxLoad) ? ok("2E hook-order fix korundu") : err("2E hook-order BOZULDU");
gd.includes('if (Number.isNaN(parsed.getTime())) return "-";') ? ok("2E Invalid Date guard korundu") : err("2E Invalid Date guard KAYBOLDU");
!gd.includes("Henüz bilgi girilmedi") && gd.includes('if (!text || !text.trim()) return "";')
  ? ok("2F empty-state (shortPreview→'' + noInfoYet) korundu") : err("2F empty-state BOZULDU");
(gd.includes("loadError.kind ===") && gd.includes("if (loadError && !stone)") && !gd.includes('startsWith("Kayıt'))
  ? ok("2G typed loadError.kind + Türkçe control-flow yok korundu") : err("2G error-state BOZULDU");
!gd.includes("MISSING_SESSION_TENANT_MESSAGE")
  ? ok("2G: Stone Detail [id] shared tenant sabiti kullanmıyor (lokal t() adapte korundu)") : err("2G tenant adaptasyonu bozulmuş");
const kayit = src("app/dogaltas/dogaltas-kayit/page.tsx");
(kayit.includes('tf("validation.mineralPercentInvalid")') && !kayit.includes("MINERAL_PERCENT_ERROR"))
  ? ok("2H mineral percent validation localize korundu (dogaltas-kayit)") : err("2H validation localization BOZULDU");
src("lib/dogaltas/mineralPercent.ts").includes('export const MINERAL_PERCENT_ERROR = "Mineral yüzdesi 0 ile 100 arasında olmalıdır.";')
  ? ok("2H lib sabiti (MINERAL_PERCENT_ERROR) değeri KORUNDU") : err("2H lib sabiti DEĞİŞMİŞ");

// ── GATE G: canonical / persisted anahtarlar DEĞİŞMEDİ ───────────────────────
console.log("\n[GATE G] canonical / persisted preserved");
(trS.assignmentFields?.["Oran %"] === "Oran %" && trS.common?.unnamedStone === "İsimsiz taş")
  ? ok('canonical "Oran %" + unnamedStone TR identity korundu') : err("canonical/persisted TR identity BOZULDU");
// modules canonical slug anahtarları intact
(enS.modules?.["dogaltas-kayit"] != null && enS.modules?.["kombinasyon-olustur"] != null)
  ? ok("stones.modules canonical slug anahtarları korundu") : err("stones.modules slug anahtarları DEĞİŞMİŞ");

// ── GATE H: ICU parse (stones.json EN+TR) ────────────────────────────────────
console.log("\n[GATE H] ICU parse integrity");
let bad = 0, n = 0;
const walk = (o) => { for (const v of Object.values(o)) { if (typeof v === "string") { n++; try { parse(v); } catch (e) { bad++; err(`ICU: ${e.message}`); } } else if (v && typeof v === "object") walk(v); } };
for (const f of ["en/stones.json", "tr/stones.json"]) walk(rd(f));
bad === 0 ? ok(`ICU parse: ${n} string sağlam`) : err(`ICU parse: ${bad} hata`);

console.log("\n=== SONUÇ ===");
console.log(fail === 0 ? "✅ TÜM 2I KAPILARI GEÇTİ" : `❌ ${fail} HATA`);
process.exit(fail === 0 ? 0 : 1);
