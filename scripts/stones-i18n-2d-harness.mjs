/**
 * Stones (Doğaltaş) i18n — AŞAMA 2D visual-residue COVERAGE + STRUCTURAL gate.
 *
 * Char-tabanlı tarama yetersiz (ASCII Türkçe "Mineraller"/"Elementler"/"Genel" + {ifade}
 * ile render edilen değerler yakalanmaz). Bunun yerine:
 *   GATE A COVERAGE — render edilebilen her KANONİK değer için display-map var mı; anahtarın
 *     görünen string OLDUĞU haritalarda TR == kanonik (TR görünüm byte-aynı) ve EN mevcut.
 *   GATE B STRUCTURAL — her render sınırının localize helper'ını kullandığını doğrula
 *     (kaçırılan bir render sitesi = gate fail).
 * Salt-okunur; exit 1. Çalıştır: node scripts/stones-i18n-2d-harness.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = process.cwd();
let fail = 0;
const err = (m) => { console.log("  ❌ " + m); fail++; };
const ok = (m) => console.log("  ✅ " + m);
const rd = (p) => JSON.parse(readFileSync(join(ROOT, "messages", p), "utf8"));
const src = (p) => readFileSync(join(ROOT, p), "utf8");

const trS = rd("tr/stones.json").stones, enS = rd("en/stones.json").stones;
const trK = rd("tr/stones.knowledge.json").stones.knowledge, enK = rd("en/stones.knowledge.json").stones.knowledge;
const trC = rd("tr/stones.combinations.json").stones.combinations, enC = rd("en/stones.combinations.json").stones.combinations;

// Canonical sets that RENDER (from source constants — kept in sync with code)
const CHAKRA = ["Kök", "Sakral", "Solar Pleksus", "Kalp", "Boğaz", "Alın", "Taç",
  "Kök Çakra", "Sakral Çakra", "Kalp Çakra", "Boğaz Çakra", "Üçüncü Göz", "Taç Çakra",
  "Kalp Çakrası", "Boğaz Çakrası"];
const WARNING = ["Genel Uyarı", "Hamilelik", "Çocuklar", "Tansiyon / Kalp", "Uyku / Huzursuzluk",
  "Enerji Hassasiyeti", "Hamileler", "Tansiyon", "Kalp Rahatsızlığı", "Epilepsi", "Alerji",
  "Böbrek", "Uyku", "Psikolojik Hassasiyet", "Uzman Kontrolü"];
const ASG_TITLES = ["Mineraller", "Etkili Organlar", "Astrolojik Atama", "Elementler",
  "Çakra Atama", "Burçlar", "Mizaçlar", "Kan Grupları"];
const ASG_FIELDS = ["Mineral", "Oran %", "Etkili Organ / Not", "Astrolojik Atama", "Element"];
const CATEGORIES = ["Şifa", "Araştırma", "Mineroloji", "Uygulamalar", "Genel"];
const SLUGS = ["dogaltas-kayit", "mineral-bankasi", "mineral-listesi", "dogaltas-listesi",
  "kombinasyonlar", "kombinasyon-olustur", "tas-bilgi-kutuphanesi"];
const TYPES = ["mineral", "chakra", "astrology", "organ", "stone_name"];
const COLORS = ["emerald", "blue", "violet", "amber", "slate", "rose", "cyan", "orange", "green", "indigo", "teal"];

// identity-key map coverage: key is the displayed string → TR must be identity, EN must exist
function coverIdentity(name, keys, trMap, enMap) {
  let missTr = 0, missEn = 0, badTr = 0;
  for (const k of keys) {
    if (!(k in trMap)) { missTr++; err(`${name}: TR map "${k}" YOK`); continue; }
    if (!(k in enMap)) { missEn++; err(`${name}: EN map "${k}" YOK`); }
    if (trMap[k] !== k) { badTr++; err(`${name}: TR "${k}" identity DEĞİL ("${trMap[k]}") → TR görünüm değişir`); }
  }
  if (!missTr && !missEn && !badTr) ok(`${name}: ${keys.length} kanonik değer kapsandı (TR identity, EN mevcut)`);
}
// slug/type-key map coverage: key is a slug → just require presence in both
function coverKeyed(name, keys, trMap, enMap, sub) {
  let miss = 0;
  for (const k of keys) {
    const t = sub ? trMap[k]?.[sub] : trMap[k];
    const e = sub ? enMap[k]?.[sub] : enMap[k];
    if (t == null) { miss++; err(`${name}: TR "${k}${sub ? "." + sub : ""}" YOK`); }
    if (e == null) { miss++; err(`${name}: EN "${k}${sub ? "." + sub : ""}" YOK`); }
  }
  if (!miss) ok(`${name}: ${keys.length} anahtar kapsandı (tr+en)`);
}

console.log("[GATE A] display-map coverage");
coverIdentity("facetLabels(chakra)", CHAKRA, trS.facetLabels, enS.facetLabels);
coverIdentity("facetLabels(warning)", WARNING, trS.facetLabels, enS.facetLabels);
coverIdentity("assignmentLabels", ASG_TITLES, trS.assignmentLabels, enS.assignmentLabels);
coverIdentity("assignmentFields", ASG_FIELDS, trS.assignmentFields, enS.assignmentFields);
coverIdentity("categoryLabels", CATEGORIES, trK.categoryLabels, enK.categoryLabels);
coverKeyed("modules.title", SLUGS, trS.modules, enS.modules, "title");
coverKeyed("modules.subtitle", SLUGS, trS.modules, enS.modules, "subtitle");
coverKeyed("assignmentDesc", ["Mineraller", "Etkili Organlar", "Astrolojik Atama", "Elementler"], trS.assignmentDesc, enS.assignmentDesc);
coverKeyed("colorOptions", COLORS, trK.colorOptions, enK.colorOptions);
coverKeyed("searchType.label", TYPES, trC.builder.searchType, enC.builder.searchType, "label");
coverKeyed("searchType.placeholder", TYPES, trC.builder.searchType, enC.builder.searchType, "placeholder");
// EN must actually differ where the Turkish word differs (spot: these MUST be localized)
const mustDiffer = [["facetLabels", "Kök", enS.facetLabels], ["assignmentLabels", "Mineraller", enS.assignmentLabels], ["categoryLabels", "Şifa", enK.categoryLabels]];
for (const [n, k, m] of mustDiffer) if (m[k] === k) err(`${n}: EN "${k}" hâlâ Türkçe (localize edilmemiş)`);

console.log("\n[GATE B] render sites localize helper kullanıyor mu");
const structural = [
  ["app/dogaltas/page.tsx", ["tm(`${item.slug}.title`)", "tm(`${item.slug}.subtitle`)"]],
  ["app/dogaltas/dogaltas-kayit/page.tsx", ["asgLabel(item.title)", "asgDesc(activeAssignment.title)", "asgField("]],
  ["app/dogaltas/dogaltas-listesi/[id]/page.tsx", ["asgLabel(title)", "asgLabel(section)", "facet(chakra)"]],
  ["app/dogaltas/dogaltas-listesi/page.tsx", ["facet(chakra)", 'tf("common.unnamedStone")']],
  ["app/dogaltas/components/StoneDetailDrawer.tsx", ["facet(c)", 'tc("unnamedStone")']],
  ["app/dogaltas/tas-bilgi-kutuphanesi/page.tsx", ["catLabel("]],
  ["app/dogaltas/kombinasyon-olustur/page.tsx", ["typeLabel(", "typePlaceholder("]],
];
for (const [rel, needles] of structural) {
  const s = src(rel);
  for (const n of needles) {
    if (s.includes(n)) ok(`${rel}: "${n}" var`);
    else err(`${rel}: "${n}" BULUNAMADI (render sitesi localize edilmemiş olabilir)`);
  }
}

console.log("\n=== SONUÇ ===");
console.log(fail === 0 ? "✅ TÜM 2D KAPILARI GEÇTİ" : `❌ ${fail} HATA`);
process.exit(fail === 0 ? 0 : 1);
