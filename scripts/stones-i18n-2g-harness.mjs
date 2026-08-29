/**
 * Stones (Doğaltaş) i18n — AŞAMA 2G: Stone Detail error-state closure gate.
 *
 * [id] route'ta kullanıcıya yalnız hata/uç durumda görünen SYSTEM-OWNED Türkçe
 * error-state residue'ları kapatır ve KRİTİK olarak control-flow'u translated
 * string'den ayırır: yükleme hataları artık TYPED `loadError.kind` ile
 * sınıflanır, görünen metin t() ile locale'e göre gelir. Shared
 * MISSING_SESSION_TENANT_MESSAGE (26 consumer) global değişmez; Stones route'ta
 * lokal olarak t("error.workspaceUnavailable")'e adapte edilir.
 * Salt-okunur; exit 1. Çalıştır: node scripts/stones-i18n-2g-harness.mjs
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

const DETAIL = "app/dogaltas/dogaltas-listesi/[id]/page.tsx";
const detSrc = src(DETAIL);
const enD = rd("en/stones.list.json").stones.detail;
const trD = rd("tr/stones.list.json").stones.detail;

// ── GATE A: error-state message values + parity ─────────────────────────────
console.log("[GATE A] error-state message values (EN native / TR korunur)");
const EXP = {
  "error.notFound": ["Stone record not found.", "Kayıt bulunamadı."],
  "error.loadFailed": ["We couldn't load this stone record.", "Kayıt okunurken hata oluştu."],
  "error.loadFailedHelp": ["Try again or return to Stone Records.", "Tekrar deneyin veya Taş Kayıtları'na dönün."],
  "error.workspaceUnavailable": ["Your workspace information could not be loaded. Please sign in again.", "Çalışma alanı bilgileriniz yüklenemedi. Lütfen yeniden giriş yapın."],
  "error.invalidData": ["Invalid record data.", "Geçersiz kayıt verisi."],
  "thisStone": ["this stone", "bu taş"],
};
const dig = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
for (const [key, [en, tr]] of Object.entries(EXP)) {
  dig(enD, key) === en ? ok(`EN ${key} = "${en}"`) : err(`EN ${key} beklenmedik: "${dig(enD, key)}"`);
  dig(trD, key) === tr ? ok(`TR ${key} = "${tr}"`) : err(`TR ${key} beklenmedik: "${dig(trD, key)}"`);
}
// parity: error alt-anahtar kümesi EN==TR
const enErrKeys = Object.keys(enD.error).sort().join(",");
const trErrKeys = Object.keys(trD.error).sort().join(",");
enErrKeys === trErrKeys ? ok("detail.error EN/TR anahtar parity") : err(`detail.error parity BOZUK\n  EN:${enErrKeys}\n  TR:${trErrKeys}`);

// ── GATE B: EN render path'te Türkçe system error literal YOK ────────────────
console.log("\n[GATE B] no Turkish error literals in render path");
for (const lit of ["Kayıt bulunamadı", "Kayıt okunurken", "Bu taş"]) {
  detSrc.includes(lit) ? err(`[id] page: "${lit}" literal hâlâ var`) : ok(`[id] page: "${lit}" literal YOK`);
}
// shared tenant sabiti Stones route'ta artık kullanılmıyor (lokal t() adapte)
!detSrc.includes("MISSING_SESSION_TENANT_MESSAGE")
  ? ok("[id] page: MISSING_SESSION_TENANT_MESSAGE kullanılmıyor (lokal t() adapte)") : err("[id] page: MISSING_SESSION_TENANT_MESSAGE hâlâ kullanılıyor");

// ── GATE C: control flow ≠ display string (TYPED classification) ─────────────
console.log("\n[GATE C] control flow decoupled from translated string");
// locale-bağımlı sınıflandırma kalmadı (Türkçe string üzerinde startsWith/===/includes)
/(startsWith|includes)\(\s*["'`][^"'`]*Kayıt/.test(detSrc) || /===\s*["'`][^"'`]*Kayıt/.test(detSrc)
  ? err("locale-bağımlı control-flow (Kayıt... string) hâlâ var") : ok("Türkçe string üzerinde control-flow YOK");
// typed loadError state + kind ile sınıflandırma
/loadError[\s\S]{0,120}"notFound"[\s\S]{0,60}"loadFailed"[\s\S]{0,60}"workspace"/.test(detSrc)
  ? ok("typed loadError state (notFound|loadFailed|workspace)") : err("typed loadError state bulunamadı");
detSrc.includes("loadError.kind ===")
  ? ok("full-page error UI loadError.kind ile sınıflanıyor (string değil)") : err("error UI kind-based sınıflandırma yok");
detSrc.includes("if (loadError && !stone)")
  ? ok("full-page error guard `loadError && !stone`") : err("error guard loadError'a bağlı değil");

// ── GATE D: 2E crash-fix preserved ──────────────────────────────────────────
console.log("\n[GATE D] 2E crash-fix preserved");
const idxHook = detSrc.indexOf("useSignedStoneImageUrls(imageFilePaths)");
const idxLoad = detSrc.indexOf("if (loading) {");
(idxHook > -1 && idxLoad > -1 && idxHook < idxLoad) ? ok("hook-order fix korundu") : err("hook-order fix BOZULDU");
detSrc.includes('if (Number.isNaN(parsed.getTime())) return "-";') ? ok("Invalid Date guard korundu") : err("Invalid Date guard KAYBOLDU");

// ── GATE E: 2F empty-state preserved ────────────────────────────────────────
console.log("\n[GATE E] 2F empty-state preserved");
!detSrc.includes("Henüz bilgi girilmedi") ? ok("'Henüz bilgi girilmedi' literal YOK") : err("2F empty-state literal geri geldi");
detSrc.includes('if (!text || !text.trim()) return "";') ? ok("shortPreview boş → '' korundu") : err("shortPreview 2F davranışı bozuldu");
(detSrc.split('t("noInfoYet")').length - 1) >= 4 ? ok("t('noInfoYet') empty-state fallback korundu") : err("noInfoYet fallback azaldı");

// ── GATE F: canonical / persisted / catalog untouched ───────────────────────
console.log("\n[GATE F] canonical / persisted / catalog untouched");
["Kök Çakra", "Çakra Atama", "Kan Grupları"].every((c) => detSrc.includes(`"${c}"`))
  ? ok("canonical facet/assignment değerleri korunmuş") : err("canonical değer kaybolmuş");
detSrc.includes('|| "İsimsiz Taş"') ? ok("toSafeStone 'İsimsiz Taş' DATA fallback dokunulmadı (veri katmanı)") : err("İsimsiz Taş data fallback DEĞİŞMİŞ");
!/toSafeStone[\s\S]{0,600}t\(/.test(detSrc) ? ok("toSafeStone içinde t() yok — data mapping'e dokunulmadı") : err("toSafeStone'a t() sızmış");

// ── GATE G: ICU parse (touched namespace) ───────────────────────────────────
console.log("\n[GATE G] ICU parse integrity");
let bad = 0, n = 0;
const walk = (o) => { for (const v of Object.values(o)) { if (typeof v === "string") { n++; try { parse(v); } catch (e) { bad++; err(`ICU: ${e.message}`); } } else if (v && typeof v === "object") walk(v); } };
for (const f of ["en/stones.list.json", "tr/stones.list.json"]) walk(rd(f));
bad === 0 ? ok(`ICU parse: ${n} string sağlam`) : err(`ICU parse: ${bad} hata`);

console.log("\n=== SONUÇ ===");
console.log(fail === 0 ? "✅ TÜM 2G KAPILARI GEÇTİ" : `❌ ${fail} HATA`);
process.exit(fail === 0 ? 0 : 1);
