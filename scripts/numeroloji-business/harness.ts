/**
 * NUMEROLOJİ FAZ 3 — Ev/Ofis Sayısı (Motor A) + İşyeri Uyumu (Motor B) harness.
 *
 * Kaynak: kitap 1. seviye (Ev/Ofis) + kitap 2. seviye (İşyeri Uyumu).
 * Çalıştır:  tsx scripts/numeroloji-business/harness.ts
 */
import { calcPlaceNumber, EV_OFIS_CATALOG } from "@/lib/numeroloji/place";
import {
  analyzeBusinessCompatibility,
  evaluateLayer,
  BUSINESS_SOURCE_NOTES,
} from "@/lib/numeroloji/business";
import { compatibilityNameSum } from "@/lib/numeroloji/relationship/compatibilityAlphabet";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(`  ✗ ${label}${detail ? `  → ${detail}` : ""}`); }
}
function eq<T>(a: T, e: T, label: string) {
  const x = JSON.stringify(a), y = JSON.stringify(e);
  assert(x === y, label, x === y ? undefined : `beklenen ${y}, gelen ${x}`);
}

// ── MOTOR A — EV / OFİS SAYISI ───────────────────────────────────────────────
{
  const p = calcPlaceNumber(4, 11)!;
  eq([p.rawTotal, p.reducedNumber], [15, 6], "PLACE-1 4 + 11 = 15 → 6");
  assert(!!p.interpretation && p.interpretation.length > 0, "PLACE-1b 6 kaynak yorumu mevcut");

  // PLACE-2 catalog 9/9
  let complete = true;
  for (let n = 1; n <= 9; n++) if (!EV_OFIS_CATALOG[n] || !EV_OFIS_CATALOG[n].trim()) complete = false;
  assert(complete && Object.keys(EV_OFIS_CATALOG).length === 9, "PLACE-2 Ev/Ofis catalog 9/9");

  // PLACE-3 master preservation YOK (5+6=11 → 2, 11 korunmaz)
  const p2 = calcPlaceNumber(5, 6)!;
  eq([p2.rawTotal, p2.reducedNumber], [11, 2], "PLACE-3 11 master KORUNMAZ → 2");
}

// ── MOTOR B — İŞYERİ UYUMU (AHMED + CANTAŞ + açılış) ─────────────────────────
{
  eq(compatibilityNameSum("AHMED").sum, 22, "BUSINESS-1 AHMED = 22");

  const r = analyzeBusinessCompatibility({
    name: "AHMED",
    birthDate: "23/05/1974",
    businessName: "CANTAŞ",
    openingDate: "19/12/2019",
  })!;
  const v = r.variants[0];
  eq(v.birthDateRawSum, 31, "BUSINESS-2 23/05/1974 raw = 31");
  eq(v.personBaseValue, 53, "BUSINESS-3 22 + 31 = 53");
  eq([v.personBase.compatibilityPercent, v.personBase.polarity], [50, "UYUMLU"], "BUSINESS-4 53 → KÖTÜ+İYİ → %50 UYUMLU");
  eq(v.businessNameValue, 11, "BUSINESS-5 CANTAŞ = 11");
  eq(v.personBusinessTotal, 64, "BUSINESS-6 53 + 11 = 64");
  eq([v.businessName.compatibilityPercent, v.businessName.polarity], [100, "UYUMSUZ"], "BUSINESS-7 64 → KÖTÜ+KÖTÜ → %100 UYUMSUZ");
  eq(v.openingDate!.rawSum, 25, "BUSINESS-8 19/12/2019 raw = 25");
  eq(v.openingDate!.finalTotal, 89, "BUSINESS-9 64 + 25 = 89");
  eq(v.openingDate!.classification!.digitClasses, ["KÖTÜ", "KÇB"], "BUSINESS-10a 89 → KÖTÜ + K.Ç.B.");
  eq([v.openingDate!.classification!.compatibilityPercent, v.openingDate!.classification!.polarity], [75, "UYUMSUZ"], "BUSINESS-10b 89 → %75 UYUMSUZ (tablo)");

  // BUSINESS-11 anomaly documented
  assert(BUSINESS_SOURCE_NOTES.includes("SOURCE_SAMPLE_CONFLICT_WORKPLACE_89"), "BUSINESS-11 SOURCE_SAMPLE_CONFLICT_WORKPLACE_89 belgelendi");
}

// ── Açılış tarihi / soyad davranışları ──────────────────────────────────────
{
  // BUSINESS-12 opening date omitted → 2-layer geçerli sonuç
  const r = analyzeBusinessCompatibility({ name: "AHMED", birthDate: "23/05/1974", businessName: "CANTAŞ" })!;
  assert(r.variants[0].openingDate === null, "BUSINESS-12 açılış tarihi yok → openingDate null");
  assert(r.variants[0].personBase != null && r.variants[0].businessName != null, "BUSINESS-12b 2 katman mevcut");

  // BUSINESS-13 invalid opening date rejected (12/22/2002, ay=22)
  const rInv = analyzeBusinessCompatibility({ name: "AHMED", birthDate: "23/05/1974", businessName: "CANTAŞ", openingDate: "12/22/2002" })!;
  assert(rInv.variants[0].openingDate?.valid === false && rInv.variants[0].openingDate?.classification === null, "BUSINESS-13 geçersiz açılış tarihi reddedildi");

  // BUSINESS-14 surname omitted → 1 variant
  assert(r.variants.length === 1, "BUSINESS-14 soyad yok → 1 variant");

  // BUSINESS-15 surname supplied → 2 independent variants
  const rS = analyzeBusinessCompatibility({ name: "AHMED", surname: "YILMAZ", birthDate: "23/05/1974", businessName: "CANTAŞ" })!;
  eq(rS.variants.length, 2, "BUSINESS-15 soyad var → 2 variant");
  eq([rS.variants[0].mode, rS.variants[1].mode], ["name", "name_surname"], "BUSINESS-15b modlar name / name_surname");

  // BUSINESS-16 override yok — iki variant bağımsız (personBaseValue farklı)
  assert(rS.variants[0].personBaseValue !== rS.variants[1].personBaseValue, "BUSINESS-16 name ve name+surname birbirini override etmiyor");
}

// ── Alfabe / unsupported / digit-count source boundary ──────────────────────
{
  eq(compatibilityNameSum("Q").sum, 0, "BUSINESS-17 Q = 0");
  eq(compatibilityNameSum("W").sum, 0, "BUSINESS-18 W = 0");
  assert(compatibilityNameSum("X").unmapped.includes("X"), "BUSINESS-19 X unsupported (unmapped)");

  // BUSINESS-20 unsupported char sessizce yok sayılmıyor → sonuçta raporlanıyor
  const rx = analyzeBusinessCompatibility({ name: "AXE", birthDate: "23/05/1974", businessName: "CANTAŞ" })!;
  assert(rx.unsupportedCharacters.includes("X"), "BUSINESS-20 desteklenmeyen harf sonuçta raporlanıyor");

  // BUSINESS-21 1-digit → SOURCE_RULE_UNDEFINED_FOR_DIGIT_COUNT, percentage null
  const l1 = evaluateLayer(5);
  eq([l1.resultStatus, l1.compatibilityPercent], ["SOURCE_RULE_UNDEFINED_FOR_DIGIT_COUNT", null], "BUSINESS-21 1 basamak → kural yok, percent null");

  // BUSINESS-22 4+-digit → SOURCE_RULE_UNDEFINED_FOR_DIGIT_COUNT, percentage null
  const l4 = evaluateLayer(1234);
  eq([l4.resultStatus, l4.compatibilityPercent], ["SOURCE_RULE_UNDEFINED_FOR_DIGIT_COUNT", null], "BUSINESS-22 4+ basamak → kural yok, percent null");

  // Ek: 2 basamak ama tabloda olmayan kombinasyon (90 → KÇB+KÇB) → SOURCE_COMBINATION_UNDEFINED
  const l90 = evaluateLayer(90);
  eq([l90.resultStatus, l90.compatibilityPercent], ["SOURCE_COMBINATION_UNDEFINED", null], "BUSINESS-22b tanımsız 2-basamak kombinasyon → percent null");
}

// ── Global skor yasağı ──────────────────────────────────────────────────────
{
  const r = analyzeBusinessCompatibility({ name: "AHMED", birthDate: "23/05/1974", businessName: "CANTAŞ" })! as Record<string, unknown>;
  assert(r.globalScore === undefined, "BUSINESS-23 globalScore YOK");
  assert(r.overallScore === undefined, "BUSINESS-24 overallScore YOK");
  assert(r.compatibilityScore === undefined && JSON.stringify(r).indexOf("Mükemmel Uyum") === -1, "BUSINESS-25 compatibilityScore / '90/100' YOK");
}

console.log(`\nNUMEROLOJİ İŞYERİ/EV HARNESS: ${pass} PASS · ${fail} FAIL`);
if (fail > 0) { console.log(failures.join("\n")); process.exit(1); }
console.log("Tüm golden fixture'lar geçti.");
