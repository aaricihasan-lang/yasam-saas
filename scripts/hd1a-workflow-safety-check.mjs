/**
 * HD-1A güvenlik harness — statik değişmez doğrulaması.
 *
 * Projede React test runner yoktur. Bu harness, rapor ekranı veri-kaybı ve
 * duplicate-INSERT korumalarının kod-şeklini deterministik doğrular.
 *
 * ÖNEMLİ: Bu statik harness gerçek React render zamanlamasını, gerçek hızlı
 * çift-tıklama (double-submit) davranışını ve tarayıcı beforeunload tetiklenmesini
 * TEK BAŞINA KANITLAMAZ. Yalnız kod-şeklini (state/ref modeli, karar dalları,
 * güncelleme sırası) doğrular. Gerçek etkileşim runtime/DOM gerektirir (aşağıda not).
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

// handleSave gövdesini izole et (INSERT/UPDATE karar sırasını konumsal doğrulamak için).
const saveBody = (Ccode.match(/async function handleSave\(\)[\s\S]*?\n  \}/) || [""])[0];
// runBuild success (applyClientId) bloğunu izole et.
const buildBody = (Ccode.match(/const runBuild = useCallback\([\s\S]*?\n  \);/) || [""])[0];
// Build-giriş handler gövdeleri (save devam ederken build başlatmama kontrolü için).
const refreshBody = (Ccode.match(/async function handleRefresh\(\)[\s\S]*?\n  \}/) || [""])[0];
const clientChangeBody = (Ccode.match(/async function handleClientChange\([\s\S]*?\n  \}/) || [""])[0];
// runBuild guard satırı (ilk await ÖNCESİ senkron kilit).
const runBuildGuardLine = (Ccode.match(/if \(!id \|\|[^\n]*\) return false;/) || [""])[0];

console.log("── AKTİF RAPOR KİMLİĞİ (duplicate INSERT fix) ──");
check("1. INSERT/UPDATE kararı urlReportId/isEditMode'a DAYANMAZ (handleSave içinde geçmez)",
  /async function handleSave/.test(Ccode) && !/isEditMode/.test(saveBody) && !/\burlReportId\b/.test(saveBody));
check("2. activeReportId state bulunuyor",
  /const \[activeReportId, setActiveReportId\] = useState<string \| null>\(urlReportId \|\| null\)/.test(Ccode));
check("3. activeReportIdRef bulunuyor",
  /const activeReportIdRef = useRef<string \| null>\(urlReportId \|\| null\)/.test(Ccode));
check("4. Save kararı activeReportIdRef.current üzerinden veriliyor",
  /const currentReportId = activeReportIdRef\.current/.test(saveBody) &&
  /if \(currentReportId\)/.test(saveBody));
check("5. Başarılı INSERT id'yi router.push ÖNCESİNDE ref'e yazıyor",
  /activeReportIdRef\.current = id;[\s\S]*?router\.push/.test(saveBody) &&
  // ref ataması, saveReport hata dönüşünden SONRA (başarı dalında)
  /error \|\| !id[\s\S]*?activeReportIdRef\.current = id/.test(saveBody));
check("6. Başarılı INSERT id'yi state'e de yazıyor",
  /activeReportIdRef\.current = id;\s*\n\s*setActiveReportId\(id\);/.test(saveBody));
check("7. İlk INSERT sonrası sonraki save UPDATE yoluna girer (kimlik→UPDATE dalı önce)",
  /if \(currentReportId\)\s*\{[\s\S]*?updateReport\(/.test(saveBody) &&
  // UPDATE dalı INSERT'ten (saveReport) ÖNCE gelir → kimlik varken INSERT'e ulaşılmaz.
  saveBody.indexOf("if (currentReportId)") < saveBody.indexOf("saveReport("));
check("8. Aktif id varken duplicate count/INSERT yolu çalışmaz (getClientReportCount UPDATE dalından sonra)",
  saveBody.indexOf("updateReport(") < saveBody.indexOf("getClientReportCount(") &&
  /if \(currentReportId\)[\s\S]*?return;\s*\n\s*\}/.test(saveBody) &&
  saveBody.indexOf("getClientReportCount(") > saveBody.indexOf("return; // kimlik + baseline"));

console.log("── DANIŞAN DEĞİŞİMİNDE KİMLİK ──");
check("9. Başarılı danışan değişiminde active id + baseline sıfırlanır (applyClientId, başarılı build)",
  /if \(opts\?\.applyClientId\)\s*\{[\s\S]*?activeReportIdRef\.current = null;[\s\S]*?setActiveReportId\(null\);[\s\S]*?setSavedSnapshot\(null\);/.test(buildBody));
check("10. Başarısız danışan build'inde active id korunur (sıfırlama başarı bloğunun İÇİNDE)",
  // Sıfırlama yalnız tüm adımlar başarılıysa ulaşılan blokta; erken `return false` dalları kimliğe dokunmaz.
  buildBody.indexOf("return false; // mevcut state KORUNUR") < buildBody.indexOf("activeReportIdRef.current = null") &&
  !/return false;[\s\S]{0,40}activeReportIdRef\.current = null/.test(buildBody));
check("11. Danışan değişiminde eski report id yeni danışana TAŞINMAZ (kimlik null'lanır, applyClientId'den kopyalanmaz)",
  !/activeReportIdRef\.current = id\b/.test(buildBody) &&
  /if \(opts\?\.applyClientId\)\s*\{[\s\S]*?activeReportIdRef\.current = null/.test(buildBody));

console.log("── DIRTY / YAŞAM DÖNGÜSÜ (veri kaybı fix) ──");
check("12. Dirty editedText.trim().length > 0 modeline DAYANMAZ",
  !/editedText\.trim\(\)\.length > 0/.test(Ccode));
check("13. İçerikten bağımsız hasUnsavedDraft (veya eşdeğeri) bulunuyor",
  /const \[hasUnsavedDraft, setHasUnsavedDraft\] = useState\(false\)/.test(Ccode));
check("14. Dirty: baseline varsa sapma, yoksa hasUnsavedDraft",
  /if \(savedSnapshot\)\s*\{\s*return reportTitle !== savedSnapshot\.title \|\| editedText !== savedSnapshot\.editedText;/.test(Ccode) &&
  /\}\s*return hasUnsavedDraft;/.test(Ccode));
check("15. Henüz oluşturulmamış boş ekran dirty=false (hasUnsavedDraft başlangıçta false, savedSnapshot null)",
  /useState\(false\)/.test(Ccode) && /useState<SavedSnapshot \| null>\(null\)/.test(Ccode));
check("16. Yeni rapor build (replace) sonrası dirty=true (hasUnsavedDraft=true)",
  /mode === "replace"\)\s*\{\s*setEditedText\(text\);\s*setReportTitle\(newTitle\);\s*[\s\S]*?setHasUnsavedDraft\(true\);/.test(buildBody));
check("17. Metin tamamen boşaltılsa da dirty=true (dirty metin uzunluğuna bakmaz; hasUnsavedDraft'a bakar)",
  !/editedText\.trim\(\)\.length/.test(Ccode) && /return hasUnsavedDraft;/.test(Ccode));
check("18. Metin boş + başlık değişmiş olsa da dirty=true (aynı hasUnsavedDraft dalı; uzunluk yok)",
  /return hasUnsavedDraft;/.test(Ccode) && !/editedText\.trim\(\)\.length/.test(Ccode));

console.log("── SAVE SONUÇ DAVRANIŞI ──");
check("19. Başarılı INSERT sonrası dirty=false (setHasUnsavedDraft(false) + baseline=güncel)",
  /activeReportIdRef\.current = id;[\s\S]*?setSavedSnapshot\(\{ title:[\s\S]*?reportId: id \}\);\s*setHasUnsavedDraft\(false\);/.test(saveBody));
check("20. Başarısız INSERT sonrası dirty=true (error → return, baseline/kimlik/işaret DEĞİŞMEZ)",
  /kaydedilemedi[\s\S]{0,120}return; \/\/ kimlik null kalır/.test(saveBody));
// UPDATE dalı bölgesi: `if (currentReportId)` ile INSERT çağrısı `saveReport(` arası.
const updateRegion = saveBody.slice(saveBody.indexOf("if (currentReportId)"), saveBody.indexOf("saveReport("));
check("21. Başarılı UPDATE sonrası dirty=false (baseline=güncel + hasUnsavedDraft=false, active id korunur)",
  /setSavedSnapshot\(\{ title:[\s\S]*?reportId: currentReportId \}\);\s*setHasUnsavedDraft\(false\);/.test(updateRegion) &&
  // UPDATE dalında activeReportIdRef'e yeniden ATAMA YOK → aktif kimlik korunur.
  !/activeReportIdRef\.current =/.test(updateRegion));
check("22. Başarısız UPDATE sonrası dirty=true (error → return, baseline/kimlik DEĞİŞMEZ)",
  /güncellenemedi[\s\S]{0,120}return; \/\/ kimlik \+ baseline/.test(saveBody));

console.log("── KAYITLI RAPOR YENİLE (kimlik korunur) ──");
check("23. Kayıtlı rapor Yenile sonrası activeReportId korunur (replace applyClientId'siz kimliğe dokunmaz)",
  // Kimlik sıfırlaması YALNIZ applyClientId bloğunda; sade replace (Yenile) dalı kimliği null'lamaz.
  /if \(opts\?\.applyClientId\)\s*\{[\s\S]*?activeReportIdRef\.current = null/.test(buildBody) &&
  !/setEditedText\(text\);\s*setReportTitle\(newTitle\);\s*setHasUnsavedDraft\(true\);\s*\}\s*[\s\S]{0,40}activeReportIdRef\.current = null/.test(buildBody));
check("24. Yenilenen kayıtlı raporun sonraki save'i UPDATE yapar (kimlik varken UPDATE dalı)",
  /const currentReportId = activeReportIdRef\.current/.test(saveBody) && /if \(currentReportId\)[\s\S]*?updateReport\(/.test(saveBody));

console.log("── YENİLE (üç seçenek) + DANIŞAN (iki seçenek) korundu ──");
check("25. Yenile üç seçenek korunur; keepEdited editedText'e dokunmaz",
  /Mevcut Metni Koru/.test(C) && /Değişiklikleri At ve Yeniden Oluştur/.test(C) &&
  /choice === "keep"[\s\S]{0,140}runBuild\(clientId, "keepEdited"\)/.test(Ccode) &&
  /mode === "replace"\)\s*\{\s*setEditedText/.test(Ccode));
check("26. Danışan değişimi iki seçenek; 'Mevcut Metni Koru' BULUNMAZ",
  /Değişiklikleri At ve Danışanı Değiştir/.test(C) &&
  !/handleClientChange[\s\S]*?Mevcut Metni Koru/.test(Ccode));

console.log("── EŞZAMANLILIK / BEFOREUNLOAD ──");
check("27. save yeniden-giriş guard (saveGuard ref) finally'de temizlenir",
  /const saveGuard = useRef\(false\)/.test(Ccode) && /if \(saveGuard\.current \|\| buildGuard\.current\) return;/.test(Ccode) &&
  /finally \{[\s\S]{0,120}saveGuard\.current = false/.test(Ccode));
check("28. beforeunload YALNIZ dirty iken bağlı + cleanup",
  /useUnsavedGuard\(dirty\)/.test(Ccode) && /if \(!active\) return/.test(stripJs(H)) &&
  /addEventListener\("beforeunload"/.test(H) && /removeEventListener\("beforeunload"/.test(H));
check("29. router/history monkey-patch YOK",
  !/history\.pushState|history\.replaceState|router\.push =|window\.history\s*=/.test(C + D + H));

console.log("── BUILD↔SAVE KARŞILIKLI KİLİT (race fix) ──");
check("R1. Build için senkron ref guard var (buildGuard = useRef)",
  /const buildGuard = useRef\(false\)/.test(Ccode));
check("R2. buildGuard ilk await'ten ÖNCE true yapılıyor (guard satırı → true → await sırası)",
  /if \(!id \|\|[\s\S]*?buildGuard\.current = true;[\s\S]*?await loadChartForReport/.test(buildBody) &&
  buildBody.indexOf("buildGuard.current = true") < buildBody.indexOf("await "));
check("R3. buildGuard finally içinde false yapılıyor",
  /finally \{[\s\S]{0,120}buildGuard\.current = false/.test(buildBody));
check("R4. handleSave build guard aktifken BAŞLAMAZ (buildGuard.current kontrolü, saveGuard=true'dan ÖNCE)",
  /if \(saveGuard\.current \|\| buildGuard\.current\) return;/.test(saveBody) &&
  saveBody.indexOf("buildGuard.current) return;") < saveBody.indexOf("saveGuard.current = true"));
check("R5. Build (runBuild) saveGuard aktifken BAŞLAMAZ (guard satırında saveGuard.current)",
  /if \(!id \|\| buildGuard\.current \|\| saveGuard\.current\) return false;/.test(runBuildGuardLine));
check("R6. Kaydet butonu build/loading sırasında disabled",
  /onClick=\{handleSave\}\s*\n\s*disabled=\{saving \|\| loading \|\| !editedText\.trim\(\)\}/.test(C));
check("R7. Danışan seçimi save sırasında disabled + handler saveGuard/saving kontrolü",
  /onChange=\{\(e\) => handleClientChange\(e\.target\.value\)\}\s*\n\s*disabled=\{loading \|\| saving\}/.test(C) &&
  /\|\| saving \|\| saveGuard\.current\) return;/.test(clientChangeBody));
check("R8. Yenile save sırasında disabled + handler saveGuard/saving kontrolü",
  /onClick=\{handleRefresh\}\s*\n\s*disabled=\{!clientId \|\| loading \|\| saving\}/.test(C) &&
  /\|\| saving \|\| saveGuard\.current\) return;/.test(refreshBody));
check("R9. Build sürerken INSERT/UPDATE yapılamaz (handleSave build guard'ı updateReport/saveReport'tan ÖNCE)",
  saveBody.indexOf("buildGuard.current) return;") < saveBody.indexOf("updateReport(") &&
  saveBody.indexOf("buildGuard.current) return;") < saveBody.indexOf("saveReport("));
check("R10. Save sürerken danışan değişimi build'i başlamaz (guard kontrolü runBuild çağrısından ÖNCE)",
  clientChangeBody.indexOf("saveGuard.current) return;") < clientChangeBody.indexOf("runBuild("));
check("R11. Save sürerken Yenile build'i başlamaz (guard kontrolü runBuild çağrısından ÖNCE)",
  refreshBody.indexOf("saveGuard.current) return;") < refreshBody.indexOf("runBuild("));
check("R12. Build hata/exception sonrası guard temizli (guard sıfırlama try'ın finally'sinde)",
  /\} finally \{\s*setLoading\(false\);\s*buildGuard\.current = false;\s*\}/.test(buildBody));
check("R13. Save hata/exception sonrası saveGuard temizli (finally)",
  /\} finally \{\s*setSaving\(false\);\s*saveGuard\.current = false;\s*\}/.test(saveBody));
check("R14. Erken dönüşte guard sızıntısı yok (buildGuard/saveGuard kontrolleri kendi set'lerinden ÖNCE)",
  runBuildGuardLine.indexOf("buildGuard.current") < (Ccode.indexOf("buildGuard.current = true")) &&
  saveBody.indexOf("buildGuard.current) return;") < saveBody.indexOf("saveGuard.current = true"));

console.log("── KAPSAM DEĞİŞMEZLİKLERİ ──");
check("30. report route/persistence/helper/schema sözleşmesi bu bileşende değişmemiş",
  !/storage\.buckets|ALTER TABLE|REVOKE|CREATE POLICY|migration/i.test(C + D + H) &&
  /generatedContent: generatedText/.test(Ccode) && /editedContent: editedText/.test(Ccode) &&
  /updateReport\(\{[\s\S]{0,140}editedContent: editedText/.test(Ccode));
check("31. PR #25 (HD-0 image) kodu taşınmamış",
  !/HdChartImageViewer|HdChartImageUpload|viewportFit|width: "device-width"/.test(C + D + H));
check("32. Dialog a11y sözleşmesi korunur (dokunulmadı)",
  /role="dialog"/.test(D) && /aria-modal="true"/.test(D) && /e\.key === "Escape"/.test(D) &&
  /safeBtnRef\.current\?\.focus\(\)/.test(D) && /i === firstSafeIdx \? safeBtnRef : undefined/.test(D));

console.log("\n── RUNTIME-GEREKLİ (statik harness dışı) ──");
console.log("  NOTE  Bu harness STATİKtir. Gerçek React render zamanlaması, gerçek hızlı çift-tıklama");
console.log("        (double-submit) davranışı, gerçek build↔save YARIŞ zamanlaması ve tarayıcı");
console.log("        beforeunload tetiklenmesi DOM/runtime gerektirir. Statik kontrol; senkron ref");
console.log("        kilitlerinin (buildGuard/saveGuard) kod-şeklini ve konumsal sırasını kanıtlar,");
console.log("        gerçek eşzamanlı olay zamanlamasını TEK BAŞINA kanıtlamaz.");

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILED:"); for (const f of fails) console.log("  - " + f); process.exit(1); }
