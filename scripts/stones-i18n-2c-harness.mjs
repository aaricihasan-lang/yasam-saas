/**
 * Stones (Doğaltaş) i18n — AŞAMA 2C harness.
 * GATE A: ICU PARSE — her stones tr/en value geçerli ICU MessageFormat mı (plural/select dahil).
 * GATE B: PLURAL RENDER — plural içeren her EN value n=1 ve n=2'de hata vermeden render olur;
 *         "1 <plural-noun>s" gibi bariz n=1 hatası için tekil/çoğul FARKI kontrolü.
 * GATE C: VALUE/LABEL — canonical facet/sentinel değerleri kaynak kodda ham literal olarak korunur
 *         (query/DB değeri değişmedi; yalnız display t() ile localize edildi).
 * Salt-okunur; exit 1 on failure. Çalıştır: node scripts/stones-i18n-2c-harness.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import IMF from "intl-messageformat";
const IntlMessageFormat = IMF.default || IMF.IntlMessageFormat || IMF;

const ROOT = process.cwd();
let fail = 0;
const err = (m) => { console.log("  ❌ " + m); fail++; };
const ok = (m) => console.log("  ✅ " + m);

function leaves(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...leaves(v, p));
    else if (Array.isArray(v)) v.forEach((x, i) => out.push([`${p}[${i}]`, x]));
    else out.push([p, v]);
  }
  return out;
}
// generic arg bag so any placeholder resolves
function bag(n) {
  return { n, count: n, num: n, issues: n, variants: n, titles: n, shown: n, total: n, skipped: n,
    query: "q", q: "q", label: "L", name: "N", combo: "C", client: "Cl", error: "E", field: "F",
    px: 14, value: "V", date: "D", id: "1", title: "T", imageCount: n,
    // I18N-F1: ürün bu iki mesajı ek argümanlarla çağırıyor — kombinasyonlar/page.tsx:584
    // t("deleteGroupMessage", { issue, n }) ve kombinasyonlar/[title]/page.tsx:1288
    // t("deleteHiddenCopies", { v, d }). Eski torba bu argümanları vermediği için render "FAIL" oluyordu.
    issue: "I", v: n, d: n };
}

for (const loc of ["tr", "en"]) {
  const dir = join(ROOT, "messages", loc);
  const files = readdirSync(dir).filter((f) => f === "stones.json" || f.startsWith("stones."));
  console.log(`\n[GATE A/B] ICU parse + plural render — ${loc}`);
  let parsed = 0, plurals = 0;
  for (const f of files) {
    const obj = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const [k, v] of leaves(obj)) {
      if (typeof v !== "string") continue;
      let mf;
      try { mf = new IntlMessageFormat(v, loc); parsed++; }
      catch (e) { err(`${loc}/${f}:${k} ICU PARSE FAIL — ${e.message}`); continue; }
      if (/,\s*plural\s*,/.test(v)) {
        plurals++;
        try {
          const one = String(mf.format(bag(1)));
          const two = String(mf.format(bag(2)));
          if (loc === "en" && one === two) err(`${loc}/${f}:${k} plural n=1==n=2 ("${one}") — tekil/çoğul farkı yok`);
        } catch (e) { err(`${loc}/${f}:${k} plural RENDER FAIL — ${e.message}`); }
      }
    }
  }
  if (fail === 0) ok(`${loc}: ${parsed} value ICU-parse OK, ${plurals} plural render OK`);
}

// I18N-F1 (2026-11-24): 2026-10-02 cfbeb94f ("taxonomy" P1/P2 kapanışı) çakra/uyarı kanonik listelerini
// lib/dogaltas/stoneTaxonomy.ts'e TAŞIDI; sayfa onları import ediyor. Kanonik değer korunuyor mu sorusu artık:
// "literal sayfada VEYA (merkezî taksonomide VE sayfa taksonomiyi import ediyor)". Beklenti gevşetilmedi: literal
// hiçbir yerde yoksa ya da sayfa merkezî listeyi kullanmıyorsa yine FAIL.
const TAXONOMY_REL = "lib/dogaltas/stoneTaxonomy.ts";
const TAXONOMY_IMPORT = "@/lib/dogaltas/stoneTaxonomy";
function canonPresent(src, lit) {
  const raw = (s) => s.includes(`"${lit}"`) || s.includes(`'${lit}'`);
  if (raw(src)) return true;
  if (!src.includes(TAXONOMY_IMPORT)) return false;
  return raw(readFileSync(join(ROOT, TAXONOMY_REL), "utf8"));
}

// GATE C — canonical facet/sentinel literals must still be raw in source
console.log("\n[GATE C] canonical facet/sentinel literaller kaynakta korunuyor");
const CANON = [
  ["app/dogaltas/dogaltas-listesi/page.tsx", ["Kök", "Sakral", "Solar Pleksus", "Kalp", "Boğaz", "Taç"]],
  ["app/dogaltas/dogaltas-kayit/page.tsx", ["Kök Çakra", "Genel Uyarı", "Hamilelik"]],
  ["app/dogaltas/mineral-listesi/page.tsx", ["Kategorisiz"]],
  ["app/dogaltas/kombinasyonlar/page.tsx", ["İsimsiz"]],
  ["app/dogaltas/tas-bilgi-kutuphanesi/page.tsx", ["Tümü"]],
  ["app/dogaltas/tas-bilgi-kutuphanesi/page.tsx", ["emerald", "blue", "violet"]],
];
for (const [rel, lits] of CANON) {
  let src;
  try { src = readFileSync(join(ROOT, rel), "utf8"); } catch { err(`${rel}: okunamadı`); continue; }
  for (const lit of lits) {
    if (canonPresent(src, lit)) ok(`${rel}: "${lit}" korunmuş`);
    else err(`${rel}: "${lit}" ham literal BULUNAMADI`);
  }
}

console.log("\n=== SONUÇ ===");
console.log(fail === 0 ? "✅ TÜM 2C KAPILARI GEÇTİ" : `❌ ${fail} HATA`);
process.exit(fail === 0 ? 0 : 1);
