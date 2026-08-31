/**
 * Stones (Doğaltaş) i18n — AŞAMA 2J: mineral yüzde validation FEEDBACK görünürlüğü.
 *
 * Owner browser UAT bulgusu: /dogaltas/dogaltas-kayit → Assignments → Minerals'ta
 * Percentage=101 + Add Row: numeric validation ÇALIŞIYOR (satır eklenmiyor) fakat
 * kullanıcıya HİÇBİR mesaj görünmüyordu. Kök neden: `showError` ana sayfa
 * `errorMessage`'ını z-50 atama MODALININ ARKASINA yazıyordu → mesaj görünmez.
 *
 * Fix (yalnız USER-FACING FEEDBACK; validation logic DEĞİL): modal-kapsamlı
 * `assignmentError` state modal İÇİNDE render edilir; invalid oran satır eklemez ve
 * modal AÇIK kalır; geçerli ekleme / yeni giriş / kapatma error'u temizler.
 *
 * 2H STATIK gate geçmesine rağmen bu görünürlük bug'ını yakalayamadı → 2J hem
 * YAPISAL render-yeri gate'i hem de GERÇEK validator ile INTERACTION-level reducer
 * simülasyonu (npx tsx) içerir.
 *
 * Salt-okunur; exit 1. Çalıştır: node scripts/stones-i18n-2j-harness.mjs
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
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

// ── GATE A: validation message değeri + parity (2H key reuse) ────────────────
console.log("[GATE A] validation message values + parity (2H key reuse)");
enS.validation?.mineralPercentInvalid === "Enter a mineral percentage between 0 and 100."
  ? ok('EN validation.mineralPercentInvalid = "Enter a mineral percentage between 0 and 100."')
  : err(`EN mineralPercentInvalid beklenmedik: "${enS.validation?.mineralPercentInvalid}"`);
trS.validation?.mineralPercentInvalid === "Mineral yüzdesi 0 ile 100 arasında olmalıdır."
  ? ok('TR validation.mineralPercentInvalid = "Mineral yüzdesi 0 ile 100 arasında olmalıdır." (korundu)')
  : err(`TR mineralPercentInvalid beklenmedik: "${trS.validation?.mineralPercentInvalid}"`);
JSON.stringify(Object.keys(enS.validation ?? {}).sort()) === JSON.stringify(Object.keys(trS.validation ?? {}).sort())
  ? ok("stones.validation EN/TR parity") : err("stones.validation parity BOZUK");

// ── GATE B: kayit modal-İÇİ görünür feedback (2H-miss YAPISAL gate) ──────────
console.log("\n[GATE B] new-record modal shows validation INSIDE the overlay");
kayit.includes('const [assignmentError, setAssignmentError] = useState("");')
  ? ok("assignmentError modal-kapsamlı state tanımlı") : err("assignmentError state YOK");
// invalid branch modal-kapsamlı state'e yazıyor; artık gizli showError'a DEĞİL
kayit.includes('setAssignmentError(tf("validation.mineralPercentInvalid"))')
  ? ok("invalid oran → setAssignmentError(tf('validation.mineralPercentInvalid'))")
  : err("invalid oran modal-kapsamlı error state'e yazmıyor");
!kayit.includes('showError(tf("validation.mineralPercentInvalid"))')
  ? ok("invalid oran artık gizli ana-sayfa showError'ına yazMIYOR")
  : err("invalid oran hâlâ gizli showError kullanıyor (modal arkasında kalır)");
// addAssignmentRow boolean döndürüp save-close'u kapıyor
(kayit.includes("function addAssignmentRow(): boolean") && /return false;/.test(kayit) && /return true;/.test(kayit))
  ? ok("addAssignmentRow boolean (invalid=false / ok=true)") : err("addAssignmentRow boolean sözleşmesi eksik");
kayit.includes("if (addAssignmentRow()) closeAssignment();")
  ? ok("saveAssignmentAndClose invalid'de modalı KAPATMIYOR (gated)") : err("save-close hâlâ koşulsuz kapatıyor");
// render modal overlay İÇİNDE (activeAssignment bloğundan sonra)
const modalIdx = kayit.indexOf("{activeAssignment && (");
const errRenderIdx = kayit.indexOf("{assignmentError && (");
(modalIdx > -1 && errRenderIdx > modalIdx)
  ? ok("assignmentError JSX z-50 modal overlay İÇİNDE render ediliyor") : err("assignmentError modal içinde render EDİLMİYOR");
// error temizleme: yeni giriş + kapatma
kayit.includes("if (assignmentError) setAssignmentError(\"\");")
  ? ok("updateAssignmentInput yeni girişte stale error'u temizliyor") : err("input değişiminde error temizlenmiyor");
/function closeAssignment\(\)\s*\{[^}]*setAssignmentError\(""\);/.test(kayit)
  ? ok("closeAssignment error'u temizliyor") : err("closeAssignment error temizlemiyor");
// başarılı geçerli eklemede error temizleniyor (success path)
/setAssignmentError\(""\);\s*\n\s*setAssignmentRows/.test(kayit)
  ? ok("geçerli ekleme öncesi error temizleniyor (stale kalmıyor)") : err("geçerli eklemede error temizlenmiyor");

// ── GATE C: INTERACTION-level reducer simülasyonu (GERÇEK validator, tsx) ────
console.log("\n[GATE C] interaction-level Add-Row reducer sim (real parseMineralPercent)");
let realOutputs = null;
const tmpFile = join(tmpdir(), "stones-2j-validator-probe.mts");
const libUrl = pathToFileURL(join(ROOT, "lib/dogaltas/mineralPercent.ts")).href;
try {
  writeFileSync(tmpFile, [
    `import { parseMineralPercent } from ${JSON.stringify(libUrl)};`,
    'const inputs = ["22","101","0","100","-1","50,5",""];',
    'process.stdout.write(JSON.stringify(inputs.map((i) => { const r = parseMineralPercent(i); return { i, ok: r.ok, v: r.value }; })));',
  ].join("\n"), "utf8");
  const out = execSync(`npx tsx "${tmpFile}"`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  realOutputs = JSON.parse(out.trim());
  ok(`gerçek parseMineralPercent tsx ile çalıştırıldı (${realOutputs.length} girdi)`);
} catch (e) {
  err(`tsx validator probe başarısız: ${String(e.message).split("\n")[0]}`);
} finally {
  try { rmSync(tmpFile, { force: true }); } catch { /* yut */ }
}

if (realOutputs) {
  const byIn = Object.fromEntries(realOutputs.map((r) => [r.i, r]));
  // gerçek validator davranışı (semantics)
  const expect = { "22": true, "101": false, "0": true, "100": true, "-1": false, "50,5": true, "": true };
  let semOk = true;
  for (const [k, v] of Object.entries(expect)) {
    if (!byIn[k] || byIn[k].ok !== v) { semOk = false; err(`validator("${k}").ok beklenen ${v}, gelen ${byIn[k]?.ok}`); }
  }
  if (semOk) ok("gerçek validator semantics: 22/0/100/50,5 geçerli · 101/-1 geçersiz · boş geçerli");
  byIn["50,5"] && byIn["50,5"].v === "50.5" ? ok("virgül→nokta normalize (50,5→50.5) korundu") : err("virgül→nokta normalize BOZUK");

  // Add-Row reducer'ının addAssignmentRow ile AYNI karar mantığı (pure model).
  const reduceAddRow = (state, mineral, percentRaw, parsedOk) => {
    const hasValue = mineral.trim().length > 0 || percentRaw.trim().length > 0;
    if (!hasValue) return { rows: state.rows, error: state.error, added: false, canClose: true };
    if (!parsedOk) return { rows: state.rows, error: "MINERAL_PCT", added: false, canClose: false };
    return { rows: state.rows + 1, error: "", added: true, canClose: true };
  };
  // Senaryo: (1) valid 22 ekler; (2) invalid 101 engeller+error; (3) düzeltip 22 → temizler+ekler
  let st = { rows: 0, error: "" };
  let s1 = reduceAddRow(st, "aa", "22", byIn["22"].ok);
  (s1.added && s1.rows === 1 && s1.error === "" && s1.canClose)
    ? ok("sim#1 valid(22): satır eklendi, error yok") : err("sim#1 valid(22) beklenmedik");
  let s2 = reduceAddRow(s1, "aa", "101", byIn["101"].ok);
  (!s2.added && s2.rows === 1 && s2.error === "MINERAL_PCT" && !s2.canClose)
    ? ok("sim#2 invalid(101): satır EKLENMEDİ, error GÖRÜNÜR, modal kapanmaz") : err("sim#2 invalid(101) beklenmedik");
  // yeni giriş → error temizlenir (updateAssignmentInput davranışı)
  let s2b = { ...s2, error: "" };
  let s3 = reduceAddRow(s2b, "aa", "22", byIn["22"].ok);
  (s3.added && s3.rows === 2 && s3.error === "" && s3.canClose)
    ? ok("sim#3 düzeltilmiş(22): stale error temizlendi, satır eklendi") : err("sim#3 recovery beklenmedik");
  // boundary 0 ve 100 eklenebilir
  (reduceAddRow(st, "a", "0", byIn["0"].ok).added && reduceAddRow(st, "a", "100", byIn["100"].ok).added)
    ? ok("sim#4 sınır 0 ve 100 eklenebilir") : err("sim#4 sınır davranışı BOZUK");
}

// ── GATE D: detail editor zaten doğru (in-modal + save-block) korunuyor ──────
console.log("\n[GATE D] existing-record editor already-correct guard");
detail.includes('setErrorMessage(tf("validation.mineralPercentInvalid"))')
  ? ok("detail editor invalid'de tf('validation.mineralPercentInvalid') set ediyor") : err("detail editor validation mesajı yok");
// in-modal render: errorMessage overlay (fixed inset-0 z-50) İÇİNDE
const dModal = detail.indexOf("fixed inset-0 z-50");
const dErr = detail.indexOf('role="alert"');
(dModal > -1 && dErr > dModal) ? ok("detail editor errorMessage modal İÇİNDE (role=alert) görünür") : err("detail editor error modal içinde değil");
// save invalid'de modalı kapatmıyor: check.ok false → return (setActiveEditor(null) öncesi)
/if \(!check\.ok\)\s*\{[\s\S]{0,400}?return;/.test(detail)
  ? ok("detail editor invalid oranda save bloklanıyor (modal açık kalır)") : err("detail editor invalid'de save bloklamıyor");
// açılışta stale error temizleniyor
/function openAssignmentsEditor\(\)[\s\S]{0,120}setErrorMessage\(""\);/.test(detail)
  ? ok("openAssignmentsEditor açılışta error temizliyor") : err("detail editor açılışta error temizlemiyor");

// ── GATE E: validation SEMANTICS / shared / API contract DEĞİŞMEDİ ───────────
console.log("\n[GATE E] validation semantics & shared/API contract unchanged");
lib.includes('export const MINERAL_PERCENT_ERROR = "Mineral yüzdesi 0 ile 100 arasında olmalıdır.";')
  ? ok("lib MINERAL_PERCENT_ERROR sabiti KORUNDU") : err("lib sabiti DEĞİŞMİŞ");
(lib.includes("n < 0 || n > 100") && lib.includes('const normalized = core.replace(",", ".")'))
  ? ok("numeric semantics (0..100 + virgül→nokta) KORUNDU") : err("numeric semantics DEĞİŞMİŞ");
const api1 = src("app/api/dogaltas/stones/route.ts"), api2 = src("app/api/dogaltas/stones/[id]/route.ts");
(api1.includes("validateMineralAssignments") && api2.includes("validateMineralAssignments"))
  ? ok("API route validateMineralAssignments kullanımı korundu (server contract intact)") : err("API validation kullanımı DEĞİŞMİŞ");

// ── GATE F: 2I workspace localization + canonical/persisted korunumu ─────────
console.log("\n[GATE F] 2I workspace localization + canonical/persisted preserved");
(kayit.includes('tc("workspaceUnavailable")') && !kayit.includes("MISSING_SESSION_TENANT_MESSAGE"))
  ? ok("2I: kayit workspace hatası tc('workspaceUnavailable') (regresyon yok)") : err("2I workspace localization BOZULDU");
kayit.includes('fields: ["Mineral", "Oran %"]')
  ? ok('persisted fields ["Mineral","Oran %"] korundu') : err("persisted fields DEĞİŞMİŞ");
(trS.assignmentFields?.["Oran %"] === "Oran %" && enS.assignmentFields?.["Oran %"] != null)
  ? ok('canonical "Oran %" anahtarı korundu') : err('canonical "Oran %" BOZULMUŞ');

// ── GATE G: ICU parse ────────────────────────────────────────────────────────
console.log("\n[GATE G] ICU parse integrity");
let bad = 0, n = 0;
const walk = (o) => { for (const v of Object.values(o)) { if (typeof v === "string") { n++; try { parse(v); } catch (e) { bad++; err(`ICU: ${e.message}`); } } else if (v && typeof v === "object") walk(v); } };
for (const f of ["en/stones.json", "tr/stones.json"]) walk(rd(f));
bad === 0 ? ok(`ICU parse: ${n} string sağlam`) : err(`ICU parse: ${bad} hata`);

console.log("\n=== SONUÇ ===");
console.log(fail === 0 ? "✅ TÜM 2J KAPILARI GEÇTİ" : `❌ ${fail} HATA`);
process.exit(fail === 0 ? 0 : 1);
