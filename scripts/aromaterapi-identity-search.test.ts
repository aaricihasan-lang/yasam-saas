// ============================================================
// Aromaterapi FAZ 3 — identity_norm typeahead + "İçerikte geçiyor" birim testi
//
// (1) Türkçe-normalize KİMLİK araması: buildIdentityNormIlike + normalizeForSearch
//     parity ile ASCII/Türkçe eşleşme ("adacayi"↔"Adaçayı", "corek"↔"Çörek",
//     "isirgan"↔"Isırgan", "lav"↔"Lavanta/Lavandula"). Kütüphane search_norm ayrı.
// (2) matchedOnlyInContent: içerik-only eşleşme rozeti; identity match → false; boş → false.
// FAIL → process.exit(1).  npx tsx scripts/aromaterapi-identity-search.test.ts
// ============================================================

import {
  buildIdentityNormIlike,
  buildSearchNormIlike,
} from "../lib/aromaterapi/service/readValidation";
import { normalizeForSearch } from "../lib/aromaterapi/searchNormalize";
import { matchedOnlyInContent } from "../lib/aromaterapi/aromatherapyData";

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

console.log("Aromaterapi FAZ 3 — identity_norm typeahead + içerik rozeti\n");

// --- (1) Türkçe fold parity: ASCII sorgu, Türkçe-karakterli isimle aynı normalize --
// identity_norm sütunu DB'de aromatherapy_search_normalize(name+latin+english) tutar;
// sorgu da normalizeForSearch ile normalize edilir → ikisi BYTE-EŞ olduğundan ASCII
// sorgu Türkçe-karakterli ismi bulur. Bunu iki tarafın normalize eşitliğiyle kanıtlarız.
const foldPairs: [string, string][] = [
  ["adacayi", "Adaçayı"],
  ["corek", "Çörek"],
  ["isirgan", "Isırgan"],
  ["cay agaci", "Çay Ağacı"],
  ["gul", "Gül"],
];
for (const [ascii, tr] of foldPairs) {
  check(`fold parity: "${ascii}" ↔ "${tr}" aynı normalize`,
    normalizeForSearch(ascii) === normalizeForSearch(tr) && normalizeForSearch(ascii).length > 0,
    `${JSON.stringify(normalizeForSearch(ascii))} vs ${JSON.stringify(normalizeForSearch(tr))}`);
}
// DB tarafı (isim normalize) ASCII sorguyu İÇERİR → ILIKE %ascii% eşleşir.
for (const [ascii, tr] of foldPairs) {
  const dbIdentity = normalizeForSearch(`${tr} Latince English`);
  check(`identity_norm("${tr}") sorgu "${ascii}"'yı içerir (ILIKE eşleşir)`,
    dbIdentity.includes(normalizeForSearch(ascii)));
}
// "lav" → Lavanta / Lavandula
check(`"lav" Lavanta ismini bulur`, normalizeForSearch("Lavanta").includes(normalizeForSearch("lav")));
check(`"lav" Lavandula latin adını bulur`, normalizeForSearch("Lavandula angustifolia").includes(normalizeForSearch("lav")));

// buildIdentityNormIlike: identity_norm kolonu + normalize edilmiş, sanitize edilmiş pattern.
check(`buildIdentityNormIlike("adacayi") = identity_norm.ilike.*adacayi*`,
  buildIdentityNormIlike("adacayi") === "identity_norm.ilike.*adacayi*",
  buildIdentityNormIlike("adacayi"));
check(`buildIdentityNormIlike("Adaçayı") normalize → aynı pattern (fold)`,
  buildIdentityNormIlike("Adaçayı") === "identity_norm.ilike.*adacayi*",
  buildIdentityNormIlike("Adaçayı"));
check(`buildIdentityNormIlike identity_norm-only (içerik/search_norm YOK)`,
  /identity_norm\.ilike\./.test(buildIdentityNormIlike("lav")) &&
  !/search_norm|benefits|name\.ilike|latin_name\.ilike/.test(buildIdentityNormIlike("lav")));
// Kütüphane geniş araması DEĞİŞMEDİ (search_norm).
check(`buildSearchNormIlike hâlâ search_norm (Kütüphane ayrı/değişmedi)`,
  /search_norm\.ilike\./.test(buildSearchNormIlike("lav")) && !/identity_norm/.test(buildSearchNormIlike("lav")));

// --- (2) matchedOnlyInContent -------------------------------------------------
const lavanta = { name: "Lavanta", latin_name: "Lavandula angustifolia", english_name: "Lavender" };
const papatya = { name: "Papatya", latin_name: "Matricaria chamomilla", english_name: "Chamomile" };
const adacayi = { name: "Adaçayı", latin_name: "Salvia officinalis", english_name: "Sage" };

check(`matchedOnlyInContent: kimlik eşleşmesi → false ("lav" Lavanta)`,
  matchedOnlyInContent(lavanta, "lav") === false);
check(`matchedOnlyInContent: içerik-only → true ("sakin" Papatya, isimde yok)`,
  matchedOnlyInContent(papatya, "sakin") === true);
check(`matchedOnlyInContent: Türkçe fold kimlik eşleşmesi → false ("adacayi" Adaçayı)`,
  matchedOnlyInContent(adacayi, "adacayi") === false);
check(`matchedOnlyInContent: boş sorgu → false (rozet yok)`,
  matchedOnlyInContent(papatya, "") === false && matchedOnlyInContent(papatya, "   ") === false);
check(`matchedOnlyInContent: latin/english eşleşmesi → false (kimlik sayılır)`,
  matchedOnlyInContent(lavanta, "lavandula") === false && matchedOnlyInContent(adacayi, "sage") === false);

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("OVERALL = PASS");
