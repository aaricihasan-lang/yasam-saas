// ============================================================
// Aromaterapi FAZ 2 — Karışım Oluşturucu typeahead arama kapsamı birim testi
//
// Gerçek PostgREST filtre-string kurucularını test eder:
//   - buildOrIlike(["name","latin_name","english_name"], q) = kimlik-only ILIKE
//     (Karışım Oluşturucu typeahead) → içerik/search_norm kolonu SIZMAZ.
//   - buildSearchNormIlike(q) = search_norm ILIKE (Yağlar Kütüphanesi) → DEĞİŞMEDİ,
//     kimlik kolonlarını tek tek AÇMAZ (ayrı geniş arama).
//   - q her iki dalda da safeIlikePattern ile sanitize edilir (enjeksiyon güvenliği).
// FAIL → process.exit(1).  tsx: npx tsx scripts/aromaterapi-blend-typeahead.test.ts
// ============================================================

import {
  buildOrIlike,
  buildSearchNormIlike,
  safeIlikePattern,
} from "../lib/aromaterapi/service/readValidation";

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

console.log("Aromaterapi FAZ 2 — blend typeahead arama kapsamı\n");

const IDENTITY = ["name", "latin_name", "english_name"] as const;

// A) Kimlik-only typeahead filtresi — tam beklenen string.
const nameOnly = buildOrIlike([...IDENTITY], "lav");
check("typeahead: name/latin/english ILIKE (tam string)",
  nameOnly === "name.ilike.*lav*,latin_name.ilike.*lav*,english_name.ilike.*lav*",
  nameOnly);

// B) Kimlik-only içerik/search_norm SIZDIRMAZ → "lav" içerikte geçen yağları GETİRMEZ.
check("typeahead: search_norm kolonu YOK", !/search_norm/.test(nameOnly));
check("typeahead: içerik alanı YOK (benefits/usage/aroma/safety/origin/components)",
  !/benefits|usage|aroma|safety|origin|main_components/.test(nameOnly), nameOnly);
check("typeahead: 3 kimlik kolonu da var",
  IDENTITY.every((c) => nameOnly.includes(`${c}.ilike.`)));

// C) Yağlar Kütüphanesi geniş araması AYRI ve DEĞİŞMEDİ (search_norm; kimlik kolonlarını açmaz).
const broad = buildSearchNormIlike("lav");
check("kütüphane: search_norm ILIKE (geniş arama korunur)", /search_norm\.ilike\./.test(broad), broad);
check("kütüphane: kimlik kolonlarını tek tek AÇMAZ (typeahead'den ayrı)",
  !/latin_name\.ilike|english_name\.ilike|(^|,)name\.ilike/.test(broad), broad);

// D) Sanitizasyon (enjeksiyon güvenliği) her iki dalda korunur — PostgREST kontrol
//    karakterleri boşlukla değişir; wildcard sızıntısı yok.
check("sanitize: safeIlikePattern kontrol karakterlerini temizler",
  safeIlikePattern("la,v(x)*%") === "*la v x*", safeIlikePattern("la,v(x)*%"));
const injected = buildOrIlike([...IDENTITY], 'a,name.ilike.*b*,x"(');
check("typeahead: enjekte edilen PostgREST kontrol karakterleri nötralize",
  !/\.ilike\.\*a,name\.ilike/.test(injected) && !injected.includes('"'), injected);

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("OVERALL = PASS");
