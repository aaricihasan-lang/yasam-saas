// ============================================================
// Aromaterapi FAZ 1 — Türkçe arama normalizasyonu birim testi
//
// Gerçek shared normalizer'ı (lib/aromaterapi/searchNormalize) test eder.
// SQL eşi public.aromatherapy_search_normalize ile BYTE-EŞ olmalıdır
// (migration 20261003000000). FAIL → process.exit(1).
// tsx ile: npx tsx scripts/aromaterapi-search-normalize.test.ts
// ============================================================

import { normalizeForSearch } from "../lib/aromaterapi/searchNormalize";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function eq(name: string, got: string, want: string): void {
  check(name, got === want, `got="${got}" want="${want}"`);
}
/** Arama semantiği: sorgu, kaydın normalize halinde substring olarak bulunur. */
function matches(query: string, stored: string): boolean {
  return normalizeForSearch(stored).includes(normalizeForSearch(query));
}

console.log("Aromaterapi FAZ 1 — searchNormalize\n");

// --- Sözleşme çıktıları (byte-eş beklenen değerler) -------------------------
eq("BİBERİYE → biberiye", normalizeForSearch("BİBERİYE"), "biberiye");
eq("Biberiye → biberiye", normalizeForSearch("Biberiye"), "biberiye");
eq("BIBERIYE → biberiye (ASCII I→i)", normalizeForSearch("BIBERIYE"), "biberiye");
eq("İzmir → izmir", normalizeForSearch("İzmir"), "izmir");
eq("İZMİR → izmir", normalizeForSearch("İZMİR"), "izmir");
eq("Sığla → sigla", normalizeForSearch("Sığla"), "sigla");
eq("sigla → sigla", normalizeForSearch("sigla"), "sigla");
eq("Çay → cay", normalizeForSearch("Çay"), "cay");
eq("Gül → gul", normalizeForSearch("Gül"), "gul");
eq("Şekersiz → sekersiz", normalizeForSearch("Şekersiz"), "sekersiz");
eq("Öğün → ogun", normalizeForSearch("Öğün"), "ogun");
eq("Üzüm → uzum", normalizeForSearch("Üzüm"), "uzum");
eq("whitespace collapse+trim", normalizeForSearch("  çok   boşluk "), "cok bosluk");
eq("boş string → ''", normalizeForSearch(""), "");
eq("zaten normal (idempotent)", normalizeForSearch("zaten normal"), "zaten normal");
eq("mixed TR/ASCII", normalizeForSearch("Lavanta ESANSİ x2"), "lavanta esansi x2");

// --- null/undefined güvenliği ----------------------------------------------
eq("null → ''", normalizeForSearch(null), "");
eq("undefined → ''", normalizeForSearch(undefined), "");

// --- idempotentlik ----------------------------------------------------------
for (const s of ["BİBERİYE", "Çay Sığla", "  Öğün  ", "MIXED İ ı I i"]) {
  eq(`idempotent(${s})`, normalizeForSearch(normalizeForSearch(s)), normalizeForSearch(s));
}

// --- POZİTİF arama eşleşmeleri (regresyon matrisi) --------------------------
check("biberiye ↔ BİBERİYE MATCH", matches("biberiye", "BİBERİYE"));
check("BIBERIYE ↔ Biberiye MATCH", matches("BIBERIYE", "Biberiye"));
check("İzmir ↔ izmir MATCH", matches("İzmir", "izmir"));
check("izmir ↔ İZMİR MATCH", matches("izmir", "İZMİR"));
check("sigla ↔ Sığla MATCH", matches("sigla", "Sığla"));
check("cay ↔ Çay MATCH", matches("cay", "Çay"));
check("gul ↔ Gül MATCH", matches("gul", "Gül"));
check("sekersiz ↔ Şekersiz MATCH", matches("sekersiz", "Şekersiz"));
check("kismi: biber ↔ BİBERİYE MATCH", matches("biber", "BİBERİYE"));

// --- NEGATİF: circumflex (â/î/û) bu fazda KATLANMAZ -------------------------
check(
  "kar ↔ kâr FARKLI (â katlanmaz)",
  normalizeForSearch("kar") !== normalizeForSearch("kâr"),
  `kar="${normalizeForSearch("kar")}" kâr="${normalizeForSearch("kâr")}"`,
);
check(
  "kar, kâr'da substring DEĞİL",
  !matches("kâr", "kar") && !matches("kar", "kâr"),
);

// --- NEGATİF: alakasız sorgu eşleşmez ---------------------------------------
check("alakasız eşleşmez", !matches("portakal", "Lavanta"));

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("OVERALL = PASS");
