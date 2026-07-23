/**
 * NKB-V2-D2 — Kaynak/bağlantı UI mantığı harness'ı (SAF; React/DB yok).
 * sourceUiLogic fonksiyonlarını test eder. sourcesApi yalnız `import type` ile kullanıldığından
 * runtime'da yüklenmez (numApiClient/yasamUser import edilmez).
 *
 * node --import ./scripts/numeroloji-nkb-v2/register-ts-hook.mjs scripts/numeroloji-nkb-v2/validate-source-ui-logic.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HELPERS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers");
const ui = await import(pathToFileURL(join(HELPERS, "sourceUiLogic.ts")).href);

const {
  SECTION_KEY_OPTIONS,
  MSG_LINK_DUPLICATE,
  MSG_SOURCE_IN_USE,
  MSG_NEEDS_SAVED_RECORD,
  MSG_DEMO_NO_WRITE,
  sectionKeyLabel,
  sectionKeyFromSelect,
  buildSourceInputFromForm,
  buildLinkInputFromForm,
  joinLinksWithSources,
  pageDisplay,
  classifyWriteResult,
} = ui;

let pass = 0;
let fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++;
  else fail++;
}

const SRC_FORM = {
  display_label: "",
  title: "",
  authors: "",
  organization: "",
  source_type: "",
  level_or_edition: "",
  publication_year: "",
  language: "",
  notes: "",
};
const LINK_FORM = {
  source_id: "",
  section_key: "",
  page_start: "",
  page_end: "",
  locator: "",
  is_primary: false,
  display_order: "",
  internal_note: "",
};

console.log("── NKB-V2-D2 — Kaynak UI mantığı ──");

// section_key seçenekleri + eşleme
check("SECTION_KEY_OPTIONS 5 (Tüm kayıt + 4 bölüm)", SECTION_KEY_OPTIONS.length === 5 && SECTION_KEY_OPTIONS[0].value === "" && SECTION_KEY_OPTIONS[0].label === "Tüm kayıt");
check("sectionKeyFromSelect('') → null", sectionKeyFromSelect("") === null);
check("sectionKeyFromSelect('overview') → overview", sectionKeyFromSelect("overview") === "overview");
check("sectionKeyLabel(null) = Tüm kayıt", sectionKeyLabel(null) === "Tüm kayıt");
check("sectionKeyLabel('destructive') = Yıkıcı Potansiyeller", sectionKeyLabel("destructive") === "Yıkıcı Potansiyeller");

// Mesaj sabitleri
check("Duplicate bağ mesajı sabit", MSG_LINK_DUPLICATE === "Bu kaynak seçilen kapsam için zaten bağlı.");
check("Bağlı kaynak silme mesajı mevcut", typeof MSG_SOURCE_IN_USE === "string" && MSG_SOURCE_IN_USE.length > 0);
check("Kaydedilmemiş kayıt mesajı mevcut", MSG_NEEDS_SAVED_RECORD === "Kaynak ekleyebilmek için önce bilgi kaydını kaydedin.");

// Kaynak formu
check("display_label boş → reddedilir", buildSourceInputFromForm({ ...SRC_FORM, display_label: "   " }).ok === false);
check("display_label yazımı korunur (Elif YILMAZ&Sema ÇAYLAR)", (() => { const r = buildSourceInputFromForm({ ...SRC_FORM, display_label: "Elif YILMAZ&Sema ÇAYLAR" }); return r.ok && r.value.display_label === "Elif YILMAZ&Sema ÇAYLAR"; })());
check("publication_year geçersiz → reddedilir", buildSourceInputFromForm({ ...SRC_FORM, display_label: "X", publication_year: "20a4" }).ok === false);
check("publication_year geçerli → kabul", buildSourceInputFromForm({ ...SRC_FORM, display_label: "X", publication_year: "2024" }).ok === true);
check("boş opsiyonel alanlar gönderilmez", (() => { const r = buildSourceInputFromForm({ ...SRC_FORM, display_label: "X" }); return r.ok && r.value.title === undefined; })());

// Bağlantı formu
check("kaynak seçilmeden bağ reddedilir", buildLinkInputFromForm({ ...LINK_FORM }, { recordAnalysisType: "ana-kulvar" }).ok === false);
check("geçerli bağ (kulvar, overview) kabul", (() => { const r = buildLinkInputFromForm({ ...LINK_FORM, source_id: "s1", section_key: "overview", page_start: "10", page_end: "12" }, { recordAnalysisType: "ana-kulvar" }); return r.ok && r.value.section_key === "overview" && r.value.page_start === 10 && r.value.page_end === 12; })());
check("section_key='' → null (Tüm kayıt)", (() => { const r = buildLinkInputFromForm({ ...LINK_FORM, source_id: "s1" }, { recordAnalysisType: "ana-kulvar" }); return r.ok && r.value.section_key === null; })());
check("section_key + NON-kulvar → reddedilir", buildLinkInputFromForm({ ...LINK_FORM, source_id: "s1", section_key: "overview" }, { recordAnalysisType: "element" }).ok === false);
check("page_start > page_end → reddedilir", buildLinkInputFromForm({ ...LINK_FORM, source_id: "s1", page_start: "20", page_end: "5" }, { recordAnalysisType: "ana-kulvar" }).ok === false);
check("negatif/geçersiz sayfa → reddedilir", buildLinkInputFromForm({ ...LINK_FORM, source_id: "s1", page_start: "-1" }, { recordAnalysisType: "ana-kulvar" }).ok === false);
check("display_order boş → 0", (() => { const r = buildLinkInputFromForm({ ...LINK_FORM, source_id: "s1" }, { recordAnalysisType: "ana-kulvar" }); return r.ok && r.value.display_order === 0; })());
check("display_order '3' → 3", (() => { const r = buildLinkInputFromForm({ ...LINK_FORM, source_id: "s1", display_order: "3" }, { recordAnalysisType: "ana-kulvar" }); return r.ok && r.value.display_order === 3; })());

// join + sayfa gösterimi
const srcs = [{ id: "s1", display_label: "Kaynak A" }, { id: "s2", display_label: "Kaynak B" }];
const lnks = [
  { id: "l2", source_id: "s2", display_order: 2, created_at: "2026-01-02", page_start: null, page_end: null, section_key: null, is_primary: false, locator: null },
  { id: "l1", source_id: "s1", display_order: 1, created_at: "2026-01-01", page_start: 5, page_end: 5, section_key: "overview", is_primary: true, locator: null },
  { id: "l3", source_id: "x9", display_order: 3, created_at: "2026-01-03", page_start: null, page_end: null, section_key: null, is_primary: false, locator: null },
];
const j = joinLinksWithSources(lnks, srcs);
check("join display_order'a göre sıralar", j[0].link.id === "l1" && j[1].link.id === "l2" && j[2].link.id === "l3");
check("join kaynak künyesini ekler", j[0].source && j[0].source.display_label === "Kaynak A");
check("join eşleşmeyen kaynak → null", j[2].source === null);
check("pageDisplay tek sayfa 's. 5'", pageDisplay({ page_start: 5, page_end: 5 }) === "s. 5");
check("pageDisplay aralık 's. 5–8'", pageDisplay({ page_start: 5, page_end: 8 }) === "s. 5–8");
check("pageDisplay boş ''", pageDisplay({ page_start: null, page_end: null }) === "");

// ── NKB-V2-D2-FIX — Demo no-op yazma sınıflandırması ──
console.log("\n── NKB-V2-D2-FIX — Demo no-op ──");
// (1) Normal create → gerçek başarı
check("Normal create cevabı success", classifyWriteResult({ error: null }).kind === "success");
// (2) Demo create → success DEĞİL
check("Demo create {demo:true} success sayılmaz", classifyWriteResult({ demo: true, error: null }).kind === "demo");
// (3) Demo create → sahte id kullanılmaz (kind !== success → handler id/state güncellemez)
check("Demo sonucu success değil (sahte id/state yok)", classifyWriteResult({ demo: true, error: null }).kind !== "success");
// (4) Demo update → başarı göstermez
check("Demo update başarı göstermez", classifyWriteResult({ demo: true, error: null }).kind === "demo");
// (5) Demo delete → gerçek silme sayılmaz (liste değişmez)
check("Demo delete gerçek silme sayılmaz", classifyWriteResult({ demo: true, error: null, conflict: false }).kind === "demo");
// (6) Demo bağlantı create → sahte bağlantı yok
check("Demo link create success değil", classifyWriteResult({ demo: true, error: null, conflict: false }).kind === "demo");
// (7) Demo bağlantı update → başarı değil
check("Demo link update başarı değil", classifyWriteResult({ demo: true, error: null, conflict: false }).kind === "demo");
// (8) Demo bağlantı delete → gerçek silinmiş gibi gösterilmez
check("Demo link delete gerçek silme değil", classifyWriteResult({ demo: true, error: null }).kind === "demo");
// (9) Demo mesajı üretilir
check("Demo mesajı doğru", classifyWriteResult({ demo: true, error: null }).message === MSG_DEMO_NO_WRITE && MSG_DEMO_NO_WRITE === "Demo hesabında değişiklikler kaydedilmez.");
// (10) Normal davranış bozulmaz: conflict/error/success korunur
check("Normal conflict korunur", classifyWriteResult({ error: null, conflict: true }, { conflictMsg: "X" }).kind === "conflict");
check("Normal error korunur", classifyWriteResult({ error: "hata" }).kind === "error");
check("Öncelik: demo > conflict/error", classifyWriteResult({ demo: true, conflict: true, error: "x" }).kind === "demo");

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
