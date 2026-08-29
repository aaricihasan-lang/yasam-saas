/**
 * Stones (Doğaltaş) i18n — AŞAMA 2H: mineral yüzde (percent) validation localization.
 *
 * `MINERAL_PERCENT_ERROR` (Türkçe sabit) UI'da display olarak gösteriliyordu; EN'de
 * Türkçe validation mesajı çıkıyordu. Fix: iki UI boundary (dogaltas-kayit + [id])
 * artık tf("validation.mineralPercentInvalid") ile localize gösteriyor. Validation
 * SEMANTİĞİ (0..100, boolean `ok`) locale-bağımsız — sabit/lib/API DEĞİŞMEDİ.
 * Salt-okunur; exit 1. Çalıştır: node scripts/stones-i18n-2h-harness.mjs
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
const kayit = src("app/dogaltas/dogaltas-kayit/page.tsx");
const detail = src("app/dogaltas/dogaltas-listesi/[id]/page.tsx");
const lib = src("lib/dogaltas/mineralPercent.ts");

// ── GATE A: localized validation message (EN native / TR korunur) ───────────
console.log("[GATE A] validation message values + parity");
enS.validation?.mineralPercentInvalid === "Enter a mineral percentage between 0 and 100."
  ? ok('EN validation.mineralPercentInvalid = "Enter a mineral percentage between 0 and 100."')
  : err(`EN mineralPercentInvalid beklenmedik: "${enS.validation?.mineralPercentInvalid}"`);
trS.validation?.mineralPercentInvalid === "Mineral yüzdesi 0 ile 100 arasında olmalıdır."
  ? ok('TR validation.mineralPercentInvalid = "Mineral yüzdesi 0 ile 100 arasında olmalıdır." (korundu)')
  : err(`TR mineralPercentInvalid beklenmedik: "${trS.validation?.mineralPercentInvalid}"`);
// parity: validation alt-anahtar kümesi EN==TR
JSON.stringify(Object.keys(enS.validation ?? {}).sort()) === JSON.stringify(Object.keys(trS.validation ?? {}).sort())
  ? ok("stones.validation EN/TR anahtar parity") : err("stones.validation parity BOZUK");

// ── GATE B: UI boundary'de Türkçe validation constant DÜŞMÜŞ ─────────────────
console.log("\n[GATE B] UI no longer displays the Turkish constant");
for (const [name, s] of [["dogaltas-kayit", kayit], ["dogaltas-listesi/[id]", detail]]) {
  !s.includes("MINERAL_PERCENT_ERROR")
    ? ok(`${name}: MINERAL_PERCENT_ERROR import/kullanım YOK`) : err(`${name}: MINERAL_PERCENT_ERROR hâlâ var`);
  s.includes('tf("validation.mineralPercentInvalid")')
    ? ok(`${name}: tf("validation.mineralPercentInvalid") ile localize gösterim`) : err(`${name}: localize mesaj kullanılmıyor`);
}

// ── GATE C: validation logic translated string'e BAĞLI DEĞİL ─────────────────
console.log("\n[GATE C] validation control flow decoupled from display string");
// UI control flow boolean `ok` üzerinden (parsed.ok / check.ok), string değil
(kayit.includes("if (!parsed.ok)") && detail.includes("if (!check.ok)"))
  ? ok("UI validation dalları boolean ok üzerinden (string değil)") : err("UI validation boolean ok kullanmıyor");
// Türkçe mesaj üzerinde control-flow YOK (=== / startsWith / includes MINERAL/yüzdesi)
!/(===|!==|startsWith|includes)\s*\(?\s*MINERAL_PERCENT_ERROR/.test(kayit + detail) &&
!/(startsWith|includes)\(\s*["'`][^"'`]*yüzdesi/.test(kayit + detail)
  ? ok("translated string üzerinde control-flow YOK") : err("translated string'e bağlı control-flow var");

// ── GATE D: validation SEMANTICS / shared constant DEĞİŞMEDİ ─────────────────
console.log("\n[GATE D] validation semantics & shared constant unchanged");
lib.includes('export const MINERAL_PERCENT_ERROR = "Mineral yüzdesi 0 ile 100 arasında olmalıdır.";')
  ? ok("lib sabiti (MINERAL_PERCENT_ERROR) değeri KORUNDU (global mutation yok)") : err("lib MINERAL_PERCENT_ERROR DEĞİŞMİŞ");
(lib.includes("n < 0 || n > 100") && lib.includes('const normalized = core.replace(",", ".")'))
  ? ok("numeric semantics (0..100 + virgül→nokta normalize) KORUNDU") : err("numeric validation semantics DEĞİŞMİŞ");
// API tüketicileri validateMineralAssignments'ı hâlâ kullanıyor (server contract intact)
const api1 = src("app/api/dogaltas/stones/route.ts"), api2 = src("app/api/dogaltas/stones/[id]/route.ts");
(api1.includes("validateMineralAssignments") && api2.includes("validateMineralAssignments"))
  ? ok("API route'ları validateMineralAssignments kullanımı korundu (server-side validation intact)") : err("API validation kullanımı DEĞİŞMİŞ");

// ── GATE E: canonical "Oran %" + persisted anahtar DEĞİŞMEDİ ─────────────────
console.log("\n[GATE E] canonical / persisted preserved");
(enS.assignmentFields["Oran %"] != null && trS.assignmentFields["Oran %"] === "Oran %")
  ? ok('canonical "Oran %" anahtarı korunmuş (TR identity)') : err('canonical "Oran %" BOZULMUŞ');
kayit.includes('fields: ["Mineral", "Oran %"]')
  ? ok("dogaltas-kayit persisted fields ['Mineral','Oran %'] korunmuş") : err("persisted fields DEĞİŞMİŞ");

// ── GATE F: 2E / 2F / 2G regression guards ───────────────────────────────────
console.log("\n[GATE F] 2E / 2F / 2G regression guards");
const gd = detail;
const idxHook = gd.indexOf("useSignedStoneImageUrls(imageFilePaths)"), idxLoad = gd.indexOf("if (loading) {");
(idxHook > -1 && idxHook < idxLoad) ? ok("2E hook-order fix korundu") : err("2E hook-order BOZULDU");
gd.includes('if (Number.isNaN(parsed.getTime())) return "-";') ? ok("2E Invalid Date guard korundu") : err("2E Invalid Date guard KAYBOLDU");
!gd.includes("Henüz bilgi girilmedi") && gd.includes('if (!text || !text.trim()) return "";')
  ? ok("2F empty-state (shortPreview→'' + noInfoYet) korundu") : err("2F empty-state BOZULDU");
(gd.includes("loadError.kind ===") && gd.includes("if (loadError && !stone)") && !gd.includes('startsWith("Kayıt'))
  ? ok("2G typed loadError.kind + no Türkçe control-flow korundu") : err("2G error-state BOZULDU");
!gd.includes("MISSING_SESSION_TENANT_MESSAGE")
  ? ok("2G: [id] route shared tenant sabiti hâlâ kullanmıyor (lokal t() adapte korundu)") : err("2G tenant adaptasyonu bozulmuş");

// ── GATE G: ICU parse (stones.json EN+TR) ────────────────────────────────────
console.log("\n[GATE G] ICU parse integrity");
let bad = 0, n = 0;
const walk = (o) => { for (const v of Object.values(o)) { if (typeof v === "string") { n++; try { parse(v); } catch (e) { bad++; err(`ICU: ${e.message}`); } } else if (v && typeof v === "object") walk(v); } };
for (const f of ["en/stones.json", "tr/stones.json"]) walk(rd(f));
bad === 0 ? ok(`ICU parse: ${n} string sağlam`) : err(`ICU parse: ${bad} hata`);

console.log("\n=== SONUÇ ===");
console.log(fail === 0 ? "✅ TÜM 2H KAPILARI GEÇTİ" : `❌ ${fail} HATA`);
process.exit(fail === 0 ? 0 : 1);
