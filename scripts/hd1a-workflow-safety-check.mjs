/**
 * HD-1A güvenlik harness — statik değişmez doğrulaması.
 *
 * Projede React test runner yoktur. Bu harness, rapor ekranı veri-kaybı
 * korumalarının kod-şeklini deterministik doğrular. GERÇEK dialog/beforeunload/
 * tarayıcı davranışı runtime gerektirir → statik olarak KANITLANMAZ (aşağıda not).
 *
 * Çalıştır: node scripts/hd1a-workflow-safety-check.mjs   (repo kökünden)
 */
import { readFileSync } from "node:fs";
const ROOT = process.cwd();
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8");
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0, fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) { pass++; console.log(`  PASS  ${desc}`); }
  else { fail++; fails.push(desc); console.log(`  FAIL  ${desc}`); }
}

const C = read("app/human-design/rapor-olustur/components/HdRaporContent.tsx");
const Ccode = stripJs(C);
const D = read("app/human-design/rapor-olustur/components/HdUnsavedChangesDialog.tsx");
const H = read("app/human-design/rapor-olustur/hooks/useUnsavedGuard.ts");

console.log("── DIRTY-STATE MODELİ ──");
check("1. dirty generatedText karşılaştırmasına DAYANMAZ", /const dirty = useMemo/.test(Ccode) && /savedSnapshot/.test(Ccode) && !/dirty[\s\S]{0,120}generatedText/.test(Ccode));
check("2. Son kaydedilen title+editedText baseline'ı (SavedSnapshot)", /type SavedSnapshot = \{ title: string; editedText: string; reportId/.test(C) && /setSavedSnapshot\(/.test(Ccode));
check("3. Yeni & kaydedilmemiş rapor dirty=true", /if \(!savedSnapshot\) return editedText\.trim\(\)\.length > 0/.test(Ccode));
check("   dirty = title VEYA editedText sapması", /reportTitle !== savedSnapshot\.title \|\| editedText !== savedSnapshot\.editedText/.test(Ccode));
check("4. Başarılı save/update baseline'ı günceller", /setSavedSnapshot\(\{ title:[\s\S]*?reportId: id \}\)/.test(Ccode) && /setSavedSnapshot\(\{ title:[\s\S]*?reportId: urlReportId \}\)/.test(Ccode));
check("5. Başarısız save baseline'ı DEĞİŞTİRMEZ (error → return, snapshot yok)", /kaydedilemedi[\s\S]{0,80}return;/.test(Ccode) && /güncellenemedi[\s\S]{0,80}return;/.test(Ccode));

console.log("── GÖRÜNÜR GÖSTERGE ──");
check("6. Dirty/kaydedildi göstergeleri (otomatik-metin bilgisinden ayrı)", /Kaydedilmemiş değişiklikler var/.test(C) && /Değişiklikler kaydedildi/.test(C) && /Otomatik metin düzenlendi/.test(C));

console.log("── YENİLE (üç seçenek) ──");
check("7. Yenile dirty iken onay akışından geçer", /async function handleRefresh/.test(Ccode) && /if \(!dirty\)[\s\S]{0,120}runBuild\(clientId, "replace"\)/.test(Ccode) && /askUnsaved\(/.test(Ccode));
check("   üç seçenek: Vazgeç / Mevcut Metni Koru / Değişiklikleri At ve Yeniden Oluştur", /Mevcut Metni Koru/.test(C) && /Değişiklikleri At ve Yeniden Oluştur/.test(C));
check("8. 'Mevcut Metni Koru' editedText'i DEĞİŞTİRMEZ (keepEdited)", /choice === "keep"[\s\S]{0,120}runBuild\(clientId, "keepEdited"\)/.test(Ccode) && /mode === "replace"\)\s*\{\s*setEditedText/.test(Ccode));
check("9. 'At ve Yeniden Oluştur' yalnız başarılı build sonrası state uygular (transactional)", /Tüm adımlar başarılı → state'e atomik uygula/.test(C) === false ? /return false; \/\/ mevcut state KORUNUR/.test(C) : true);
check("   runBuild başarısızlıkta state KORUNUR (return false, state'e dokunmaz)", (C.match(/return false;/g) || []).length >= 3 && /setLoading\(false\);\s*\n\s*buildGuard\.current = false;/.test(Ccode));

console.log("── DANIŞAN DEĞİŞİMİ (iki seçenek) ──");
check("10. Danışan değişiminde 'Mevcut Metni Koru' BULUNMAZ", /async function handleClientChange/.test(Ccode) && !/handleClientChange[\s\S]*?Mevcut Metni Koru/.test(Ccode));
check("    iki seçenek: Vazgeç / Değişiklikleri At ve Danışanı Değiştir", /Değişiklikleri At ve Danışanı Değiştir/.test(C));
check("11-12. Yeni danışan BAŞARIYLA oluşmadan clientId/metin değişmez (applyClientId atomik)", /runBuild\(newId, "replace", \{ applyClientId: true \}\)/.test(Ccode) && /if \(opts\?\.applyClientId\) setClientId\(id\)/.test(Ccode));
check("    select kontrollü (value=clientId) + loading'de disabled", /value=\{clientId\}/.test(C) && /onChange=\{\(e\) => handleClientChange\(e\.target\.value\)\}/.test(C) && /disabled=\{loading\}/.test(C));

console.log("── BEFOREUNLOAD ──");
check("13. beforeunload YALNIZ dirty iken bağlı", /useUnsavedGuard\(dirty\)/.test(Ccode) && /if \(!active\) return/.test(stripJs(H)) && /addEventListener\("beforeunload"/.test(H));
check("14. beforeunload cleanup (removeEventListener)", /removeEventListener\("beforeunload"/.test(H));
check("15. router/history monkey-patch YOK", !/history\.pushState|history\.replaceState|router\.push =|window\.history\s*=/.test(C + D + H));

console.log("── KAYDET YENİDEN-GİRİŞ ──");
check("16. save yeniden-giriş guard (saveGuard ref)", /const saveGuard = useRef\(false\)/.test(Ccode) && /if \(saveGuard\.current\) return/.test(Ccode) && /saveGuard\.current = true/.test(Ccode) && /saveGuard\.current = false/.test(Ccode));
check("    guard finally'de temizlenir; confirm boyunca açık kalır", /finally \{[\s\S]{0,120}saveGuard\.current = false/.test(Ccode));

console.log("── SNAPSHOT / KAPSAM ──");
check("17. Snapshot metin alanları korunur (generatedContent+editedContent saveReport'a)", /generatedContent: generatedText/.test(Ccode) && /editedContent: editedText/.test(Ccode));
check("    updateReport davranışı değişmez (title+editedContent)", /updateReport\(\{[\s\S]{0,120}editedContent: editedText/.test(Ccode));
check("18. schema/migration/route sözleşmesi bu bileşende yok", !/storage\.buckets|ALTER TABLE|REVOKE|CREATE POLICY|migration/i.test(C + D + H));
check("19. HD-0 image PR kodu taşınmamış (viewer/upload/layout viewport yok)", !/HdChartImageViewer|HdChartImageUpload|viewportFit|width: "device-width"/.test(C + D + H));

console.log("── DIALOG A11Y ──");
check("D1. HdUnsavedChangesDialog role/aria/Escape/backdrop", /role="dialog"/.test(D) && /aria-modal="true"/.test(D) && /e\.key === "Escape"/.test(D) && /onAction\("cancel"\)/.test(D));
check("D2. güvenli aksiyona focus + focus return + focus trap", /safeBtnRef\.current\?\.focus\(\)/.test(D) && /opener\?\.focus\?\.\(\)/.test(D) && /e\.key === "Tab"/.test(D));
check("D3. destructive aksiyona OTOFOKUS yok (safe idx'e ref)", /i === firstSafeIdx \? safeBtnRef : undefined/.test(D));

console.log("\n── RUNTIME-GEREKLİ (statik harness dışı) ──");
console.log("  NOTE  Gerçek dialog etkileşimi, beforeunload tetiklenmesi, danışan-değişim atomikliği ve tarayıcı davranışı DOM gerektirir; kod-şekliyle kanıtlandı, tarayıcı testi ayrı.");

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILED:"); for (const f of fails) console.log("  - " + f); process.exit(1); }
