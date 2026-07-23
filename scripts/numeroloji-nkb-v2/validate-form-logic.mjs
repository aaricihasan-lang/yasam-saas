/**
 * NKB-V2-D1 — Form mantığı doğrulama harness'ı.
 * KulvarSectionEditor/BilgiKayitEkleDuzenle/KayitDetayModal'ın kullandığı SAF mantığı
 * (kulvarFormLogic + knowledgeSections) test eder. React/DB YOK.
 *
 * Çalıştır: node --import ./scripts/numeroloji-nkb-v2/register-ts-hook.mjs scripts/numeroloji-nkb-v2/validate-form-logic.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HELPERS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers");
const fl = await import(pathToFileURL(join(HELPERS, "kulvarFormLogic.ts")).href);
const ks = await import(pathToFileURL(join(HELPERS, "knowledgeSections.ts")).href);

const { sectionsFromBodies, bodiesFromRecord, decideSaveMethod, nonEmptySectionsForView, EMPTY_KULVAR_BODIES } = fl;
const { validateKulvarSections } = ks;

let pass = 0;
let fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++;
  else fail++;
}

console.log("── NKB-V2-D1 — Form mantığı ──");

// EMPTY_KULVAR_BODIES
check("EMPTY_KULVAR_BODIES 4 boş anahtar", ["overview", "constructive", "negative", "destructive"].every((k) => EMPTY_KULVAR_BODIES[k] === ""));

// sectionsFromBodies → 4 bölüm, doğru key/label/order
const bodies = { overview: "genel", constructive: "yapıcı", negative: "olumsuz", destructive: "yıkıcı" };
const secs = sectionsFromBodies(bodies);
check("sectionsFromBodies 4 bölüm üretir", secs.length === 4);
check("sıra 1..4 sabit", secs.map((s) => s.order).join(",") === "1,2,3,4");
check("key/label sabit (overview=Genel Açıklama)", secs[0].key === "overview" && secs[0].label === "Genel Açıklama");
check("body değerleri doğru eşlenir", secs[0].body === "genel" && secs[3].body === "yıkıcı");
check("sectionsFromBodies çıktısı validateKulvarSections'tan geçer", validateKulvarSections(secs).ok === true);

// bodiesFromRecord — content_sections canonical, description ile BİRLEŞTİRİLMEZ
const withCs = bodiesFromRecord({
  content_sections: [
    { key: "overview", label: "Genel Açıklama", body: "CS-overview", order: 1 },
    { key: "constructive", label: "Yapıcı Potansiyeller", body: "CS-yapıcı", order: 2 },
  ],
  description: "ESKI-DESCRIPTION",
});
check("content_sections varsa overview canonical'dan (description değil)", withCs.overview === "CS-overview");
check("content_sections varsa description birleştirilmez", withCs.overview.indexOf("ESKI-DESCRIPTION") === -1);
check("content_sections'ta olmayan bölüm boş kalır", withCs.negative === "" && withCs.destructive === "");

// bodiesFromRecord — legacy: content_sections yok → description yalnız overview
const legacy = bodiesFromRecord({ content_sections: null, description: "LEGACY-METIN" });
check("legacy: overview = description", legacy.overview === "LEGACY-METIN");
check("legacy: diğer bölümler boş başlar", legacy.constructive === "" && legacy.negative === "" && legacy.destructive === "");

// decideSaveMethod
check("yeni kayıt (id yok) → POST", decideSaveMethod(null) === "POST" && decideSaveMethod(undefined) === "POST");
check("mevcut kayıt (id) → PATCH", decideSaveMethod("rec-1") === "PATCH");

// nonEmptySectionsForView — boş bölümler görünümden gizlenir
const view = nonEmptySectionsForView({
  content_sections: [
    { key: "overview", label: "Genel Açıklama", body: "dolu", order: 1 },
    { key: "constructive", label: "Yapıcı Potansiyeller", body: "   ", order: 2 },
  ],
  description: null,
});
check("nonEmptySectionsForView boş body'yi eler", view.length === 1 && view[0].key === "overview");

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
