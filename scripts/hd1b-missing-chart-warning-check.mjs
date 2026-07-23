/**
 * HD-1B güvenlik/doğruluk harness — eksik harita bilgisi uyarısı.
 *
 * İKİ katman:
 *  (1) DAVRANIŞSAL: gerçek `detectMissingChartInfo` kaynağı dosyadan çıkarılır,
 *      TS anotasyonları soyulur ve senaryolarla ÇALIŞTIRILIR (kopya değil, asıl mantık).
 *  (2) STATİK: HdRaporContent.tsx wiring'i + HD-1A güvenceleri kod-şekliyle doğrulanır.
 *
 * ÖNEMLİ: Statik katman gerçek React render/tarayıcı davranışını, gerçek navigasyon
 * ve dialog etkileşimini TEK BAŞINA kanıtlamaz; kod-şeklini doğrular.
 *
 * Çalıştır: node scripts/hd1b-missing-chart-warning-check.mjs   (repo kökünden)
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8");
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0, fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) { pass++; console.log(`  PASS  ${desc}`); }
  else { fail++; fails.push(desc); console.log(`  FAIL  ${desc}`); }
}

const BANNER = read("app/human-design/rapor-olustur/components/HdMissingChartInfoBanner.tsx");
const C = read("app/human-design/rapor-olustur/components/HdRaporContent.tsx");
const Ccode = stripJs(C);

// ─────────────────────────────────────────────────────────────────────────────
// (1) DAVRANIŞSAL — gerçek detektörü kaynaktan çıkar, TS soy, çalıştır.
// ─────────────────────────────────────────────────────────────────────────────
function loadDetector() {
  // HD_MISSING_FIELD_ORDER dizisi + iki fonksiyonu kaynaktan al.
  const orderMatch = BANNER.match(/HD_MISSING_FIELD_ORDER = \[([\s\S]*?)\] as const;/);
  const isNeaMatch = BANNER.match(/function isNonEmptyArray[\s\S]*?\n\}/);
  const detMatch = BANNER.match(/export function detectMissingChartInfo[\s\S]*?\n\}/);
  if (!orderMatch || !isNeaMatch || !detMatch) {
    throw new Error("Detektör kaynağı çıkarılamadı (order/isNonEmptyArray/detect).");
  }
  let src =
    `const HD_MISSING_FIELD_ORDER = [${orderMatch[1]}];\n` +
    isNeaMatch[0]
      .replace(/\(v: unknown\)/, "(v)")
      .replace(/\): boolean/, ")") + "\n" +
    detMatch[0]
      .replace(/^export /, "")
      .replace(/\(chart: HumanDesignChart \| null\): HdMissingChartField\[\]/, "(chart)")
      .replace(/new Set<HdMissingChartField>\(\)/, "new Set()") + "\n" +
    "return detectMissingChartInfo;";
  return Function(src)();
}

let detect;
try { detect = loadDetector(); }
catch (e) { check(`Detektör kaynaktan yüklenebiliyor (${e.message})`, false); }

const full = {
  type_code: "generator", authority_code: "sacral", profile_code: "3_5",
  definition_code: "single", active_centers: ["sacral"], channels: ["34-57"], gates: [34, 57],
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const D = detect ?? (() => []);

console.log("── DAVRANIŞSAL: detectMissingChartInfo ──");
check("1. Tam alanlı non-Reflector → eksik liste boş",
  eq(D(full), []));
check("2. Tip null → Tip eksik",
  D({ ...full, type_code: null }).includes("Tip"));
check("3. Tip null iken Tanım/Merkezler/Kanallar GÖSTERİLMEZ (yalnız Tip + array-boşları)",
  (() => { const r = D({ ...full, type_code: null, definition_code: null, active_centers: [], channels: [] });
    return r.includes("Tip") && !r.includes("Tanım") && !r.includes("Merkezler") && !r.includes("Kanallar"); })());
check("4. Otorite null → Otorite eksik",
  D({ ...full, authority_code: null }).includes("Otorite"));
check("5. Profil null → Profil eksik",
  D({ ...full, profile_code: null }).includes("Profil"));
check("6. Non-Reflector Tanım null → Tanım eksik",
  D({ ...full, definition_code: null }).includes("Tanım"));
check("7. Non-Reflector active_centers boş → Merkezler eksik",
  D({ ...full, active_centers: [] }).includes("Merkezler"));
check("8. Non-Reflector channels boş → Kanallar eksik",
  D({ ...full, channels: [] }).includes("Kanallar"));
check("9. Gates boş → Kapılar eksik",
  D({ ...full, gates: [] }).includes("Kapılar"));
check("10. Reflector Tanım null → YANLIŞ eksik DEĞİL",
  !D({ ...full, type_code: "reflector", authority_code: "lunar", definition_code: null }).includes("Tanım"));
check("11. Reflector active_centers boş → YANLIŞ eksik DEĞİL",
  !D({ ...full, type_code: "reflector", authority_code: "lunar", active_centers: [] }).includes("Merkezler"));
check("12. Reflector channels boş → YANLIŞ eksik DEĞİL",
  !D({ ...full, type_code: "reflector", authority_code: "lunar", channels: [] }).includes("Kanallar"));
check("13. Reflector gates boş → Kapılar eksik (geçerli boşu yok)",
  D({ ...full, type_code: "reflector", authority_code: "lunar", gates: [] }).includes("Kapılar"));
check("14. Strateji için bağımsız storage kontrolü yok (çıktıda 'Strateji' etiketi yok)",
  !/Strateji/.test(BANNER.match(/HD_MISSING_FIELD_ORDER = \[([\s\S]*?)\]/)[1]) &&
  !D({ type_code: null, authority_code: null, profile_code: null, gates: [] }).includes("Strateji"));
check("15. Eksik liste DETERMİNİSTİK sırada (Tip→Otorite→Profil→Tanım→Merkezler→Kanallar→Kapılar)",
  eq(D({ type_code: "generator", authority_code: null, profile_code: null, definition_code: null, active_centers: [], channels: [], gates: [] }),
     ["Otorite", "Profil", "Tanım", "Merkezler", "Kanallar", "Kapılar"]) &&
  eq(D({ ...full, type_code: null, authority_code: null, gates: [] }),
     ["Tip", "Otorite", "Kapılar"]));
// Ekstra doğrulama: null-güvenli + gerçek-array kontrolü (kör falsy değil)
check("   null chart → [], eksik array alanı da eksik sayılır (Array.isArray kontrolü)",
  eq(D(null), []) &&
  D({ ...full, gates: undefined }).includes("Kapılar") &&
  D({ ...full, active_centers: undefined }).includes("Merkezler"));

// ─────────────────────────────────────────────────────────────────────────────
// (2) STATİK: banner sunum + wiring
// ─────────────────────────────────────────────────────────────────────────────
console.log("── BANNER SUNUM (DB/API/build/save YOK) ──");
check("16. Banner yalnız chart + missing list ile görünür (showMissingBanner koşulu)",
  /const showMissingBanner\s*=\s*[\s\S]*?!!chart &&[\s\S]*?!!clientId &&[\s\S]*?!loading &&[\s\S]*?missingChartInfo\.length > 0 &&[\s\S]*?dismissedMissingInfoClientId !== clientId/.test(Ccode) &&
  /\{showMissingBanner && \(\s*<HdMissingChartInfoBanner/.test(C) &&
  /if \(missing\.length === 0\) return null;/.test(BANNER));
check("   banner presentational — DB/API/build/save çağrısı YOK",
  !/fetch\(|saveReport|updateReport|runBuild|supabase|reportPersistence|loadKnowledge|buildReportText/.test(BANNER));
check("   mobil taşma güvenli + dokunma hedefi (min-h-44, flex-wrap, min-w-0)",
  /min-h-\[44px\]/.test(BANNER) && /flex-wrap/.test(BANNER) && /min-w-0/.test(BANNER));

console.log("── MEVCUT BİLGİLERLE DEVAM ET (yalnız dismiss) ──");
check("17. Devam aksiyonu YALNIZ dismiss state'i değiştirir",
  /function handleContinueWithCurrentInfo\(\)\s*\{\s*setDismissedMissingInfoClientId\(clientId\);\s*\}/.test(Ccode));
check("18. Devam aksiyonu runBuild ÇAĞIRMAZ",
  !/handleContinueWithCurrentInfo[\s\S]*?runBuild/.test(Ccode.slice(Ccode.indexOf("function handleContinueWithCurrentInfo"), Ccode.indexOf("function handleContinueWithCurrentInfo") + 200)));
check("19. Devam aksiyonu metin/id/snapshot/dirty setter'ı ÇAĞIRMAZ",
  (() => { const b = Ccode.slice(Ccode.indexOf("function handleContinueWithCurrentInfo"), Ccode.indexOf("function handleContinueWithCurrentInfo") + 200);
    return !/setEditedText|setReportTitle|setGeneratedText|setActiveReportId|activeReportIdRef|setSavedSnapshot|setHasUnsavedDraft|saveReport|updateReport/.test(b); })());
check("20. Dismiss kararı client id'ye bağlı (state string|null + clientId ile karşılaştırma)",
  /const \[dismissedMissingInfoClientId, setDismissedMissingInfoClientId\] = useState<string \| null>\(null\)/.test(Ccode) &&
  /dismissedMissingInfoClientId !== clientId/.test(Ccode));
// handleClientChange gövdesini izole et (dismiss'e yanlış reset olmadığını kanıtlamak için).
const clientChangeBody = Ccode.slice(Ccode.indexOf("async function handleClientChange"), Ccode.indexOf("async function handleSave"));
check("21. Danışan değişince başka id'de banner yeniden görünür (reset YOK; clientId-keyed)",
  // handleClientChange içinde dismiss state'e YAZILMAZ (yanlış reset yok); görünürlük clientId'ye bağlı.
  clientChangeBody.length > 0 && !/setDismissedMissingInfoClientId/.test(clientChangeBody));
check("22. Kalıcı DB tercih YOK (dismiss yalnız useState; localStorage/api/fetch yok)",
  !/dismissedMissingInfo[\s\S]{0,60}(localStorage|fetch|api\/)/.test(Ccode) &&
  /useState<string \| null>\(null\)/.test(Ccode));

console.log("── EKSİKLERİ TAMAMLA (dirty-farkında navigasyon) ──");
const completeBody = Ccode.slice(Ccode.indexOf("async function handleCompleteMissingInfo"), Ccode.indexOf("function handleContinueWithCurrentInfo"));
check("23. Eksikleri Tamamla doğru harita-kaydi route'una gider",
  /\/human-design\/harita-kaydi\?clientId=\$\{encodeURIComponent\(clientId\)\}/.test(completeBody) &&
  /router\.push\(target\)/.test(completeBody));
check("24. clientId encode edilir (encodeURIComponent)",
  /encodeURIComponent\(clientId\)/.test(completeBody));
check("25. Dirty=false → doğrudan yönlendirme",
  /if \(!dirty\)\s*\{\s*router\.push\(target\);/.test(completeBody));
check("26. Dirty=true → mevcut unsaved karar mekanizmasından (askUnsaved) geçer",
  /if \(!dirty\)[\s\S]*?await askUnsaved\(\{[\s\S]*?Değişiklikleri At ve Eksikleri Tamamla/.test(completeBody));
check("27. Vazgeç/Escape/backdrop → navigasyon YAPILMAZ (choice !== discard → return)",
  /if \(choice !== "discard"\) return;/.test(completeBody));
check("28. Onaylı discard → navigasyon (router.push target, choice sonrası)",
  /if \(choice !== "discard"\) return;\s*router\.push\(target\);/.test(completeBody));
check("   HD-1A koruması ATLANMAZ: save/snapshot/kimlik değiştiren setter YOK, monkey-patch YOK",
  !/setSavedSnapshot|activeReportIdRef\.current =|saveReport|updateReport|history\.pushState|history\.replaceState/.test(completeBody));

console.log("── KAYITLI RAPOR / EDIT MODU ──");
// loadExistingReport gövdesini izole et: edit-yükleme yolunda banner/dismiss/detect mantığı OLMAMALI.
// Sınır: callback başı → mount effect'teki runInEffect( çağrısı (loadExistingReport'tan sonra gelir).
const loadExistingBody = Ccode.slice(
  Ccode.indexOf("const loadExistingReport = useCallback"),
  Ccode.indexOf("runInEffect("),
);
check("29. Edit modunda banner snapshot'ı DEĞİŞTİRMEZ (edit-yükleme yolunda banner/dismiss/detect yok)",
  loadExistingBody.length > 0 &&
  !/setDismissedMissingInfoClientId|showMissingBanner|detectMissingChartInfo/.test(loadExistingBody) &&
  // detektör hiçbir snapshot/metin/build setter'ına doğrudan bağlı DEĞİL (yalnız useMemo + render).
  !/detectMissingChartInfo[\s\S]{0,80}(setEditedText|setSavedSnapshot|runBuild)/.test(Ccode));

// ─────────────────────────────────────────────────────────────────────────────
// (2b) STATİK: HD-1A güvenceleri korunmuş
// ─────────────────────────────────────────────────────────────────────────────
console.log("── HD-1A GÜVENCELERİ KORUNDU ──");
check("30. Empty-build dirty=false korunur (didCreateDraft = text.trim().length > 0)",
  /const didCreateDraft = text\.trim\(\)\.length > 0;\s*setHasUnsavedDraft\(didCreateDraft\);/.test(Ccode));
check("31. Gerçek taslak sonrası editedText boşalsa dirty=true (textarea onChange yalnız setEditedText)",
  /onChange=\{\(e\) => setEditedText\(e\.target\.value\)\}/.test(C) && /return hasUnsavedDraft;/.test(Ccode));
check("32. activeReportId modeli korunur (currentReportId = activeReportIdRef.current)",
  /const currentReportId = activeReportIdRef\.current/.test(Ccode) && /if \(currentReportId\)/.test(Ccode));
check("33. build/save karşılıklı guard'ları korunur",
  /if \(!id \|\| buildGuard\.current \|\| saveGuard\.current\) return false;/.test(Ccode) &&
  /if \(saveGuard\.current \|\| buildGuard\.current\) return;/.test(Ccode));
check("34. duplicate confirm yalnız gerçek INSERT (getClientReportCount UPDATE dalından sonra)",
  Ccode.indexOf("updateReport(") < Ccode.indexOf("getClientReportCount("));
check("35. beforeunload korunur (useUnsavedGuard(dirty))",
  /useUnsavedGuard\(dirty\)/.test(Ccode));

console.log("── HD-1A HARNESS (regresyon) ──");
try {
  execSync("node scripts/hd1a-workflow-safety-check.mjs", { cwd: ROOT, stdio: "pipe" });
  check("36. HD-1A harness hâlâ PASS (exit 0)", true);
} catch {
  check("36. HD-1A harness hâlâ PASS (exit 0)", false);
}

console.log("── KAPSAM ──");
check("37. Silinen dosya yok (git kontrolü doğrulamada; bu dosyalar mevcut)",
  BANNER.length > 0 && C.length > 0);
check("38. Kapsam dışı import yok (banner yalnız types import eder; route/persistence yok)",
  !/reportPersistence|\/api\/hd|harita-kaydi\/components|hdRapor/.test(BANNER));
check("39. PR #25 kodu taşınmamış (viewer/upload/layout viewport yok)",
  !/HdChartImageViewer|HdChartImageUpload|viewportFit|width: "device-width"/.test(BANNER + C));
check("40. Package/schema/API/migration değişikliği yok (bu dosyalarda)",
  !/ALTER TABLE|CREATE POLICY|REVOKE|storage\.buckets|migration|"dependencies"/i.test(BANNER + C));

console.log("\n── RUNTIME-GEREKLİ (statik dışı) ──");
console.log("  NOTE  Davranışsal katman gerçek detektör mantığını çalıştırır; ancak gerçek React");
console.log("        render zamanlaması, gerçek navigasyon, dialog etkileşimi ve mobil layout DOM");
console.log("        gerektirir → Preview manuel testiyle doğrulanır, statik olarak TEK BAŞINA kanıtlanmaz.");

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILED:"); for (const f of fails) console.log("  - " + f); process.exit(1); }
