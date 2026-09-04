/**
 * NUMEROLOJİ CANONICAL — golden regression harness (FAZ 2).
 *
 * Kapsam:
 *   • Zirve yaşı düzeltmesi (36 − Hayat Yolu kökü)
 *   • Mücadele düzeltmesi (36 − M1, +27, +27; tek yöntem)
 *   • Harflerin Yankılanışı tam yaşam çizgisi (güncel yılda kesilmiyor)
 *   • Sinerji PIN + 9. hane + Ruh Duygusu + element (tie) + baskın/edilgen
 *   • Paylaşılan uyum primitive'leri (compatibilityNameSum/classify — Ev/İşyeri ile ortak)
 *   • FAZ 6: Eş Uyumu (spouseCompatibility) + Nikâh (marriageDateEffect) result'tan KALDIRILDI
 *   • İlişki sonucunda GENEL UYUM SKORU alanının OLMAMASI
 *
 * Çalıştır:  tsx scripts/numeroloji-canonical/harness.ts
 */
import {
  hesaplaNumeroloji,
  calcZirveYillari,
  calcMucadeleYillari,
  calcHarflerinYankilanisi,
  analyzeRelationship,
  classifyCompatibilityNumber,
  compatibilityNameSum,
  calcAcquisition,
  calcNameNumberSingle,
  RUH_DUYGUSU_REL,
  NEDEN_BIR_ARADAYIZ_REL,
  ISIM_SAYISI_REL,
  YASAM_KODU_REL,
  EDINIM_REL,
  DOGUM_GUNU_REL,
  ORTAK_RAKAM_REL,
  DIRECTIONAL_REL,
  HANE_REL,
} from "@/lib/numeroloji";

function complete9(cat: Record<number, string>): boolean {
  for (let n = 1; n <= 9; n++) if (!cat[n] || !cat[n].trim()) return false;
  return Object.keys(cat).length === 9;
}
function directionalCount(m: Record<number, Record<number, string>>): number {
  let c = 0;
  for (let s = 1; s <= 9; s++) for (let t = 1; t <= 9; t++) if (m[s]?.[t]?.trim()) c++;
  return c;
}

let pass = 0;
let fail = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    failures.push(`  ✗ ${label}${detail ? `  → ${detail}` : ""}`);
  }
}
function eq<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, label, a === e ? undefined : `beklenen ${e}, gelen ${a}`);
}

// ── CASE 1 — Ali TUNA 10/03/2026 ─────────────────────────────────────────────
{
  const m = hesaplaNumeroloji({ firstName: "Ali", lastName: "TUNA", birthDate: "10/03/2026" });
  eq(m.hayatYolu.display, "14/5", "CASE1 Hayat Yolu = 14/5");
  const pin = m.pinKodu;
  eq([pin.k1, pin.k2, pin.k3, pin.k4, pin.k5, pin.k6, pin.k7, pin.k8, pin.k9], [1, 3, 1, 5, 6, 4, 4, 8, 5], "CASE1 PIN = 1,3,1,5,6,4,4,8,5");
  eq([m.elementler.counts.Hava, m.elementler.counts.Su, m.elementler.counts["Ateş"], m.elementler.counts.Toprak], [3, 0, 2, 3], "CASE1 element Hava3/Su0/Ateş2/Toprak3");

  const z = calcZirveYillari("10/03/2026")!;
  eq(z.peaks.map((p) => p.age), [31, 40, 49, 58], "CASE1 Zirve yaş 31,40,49,58");
  eq(z.peaks.map((p) => p.topic), [4, 2, 6, 4], "CASE1 Zirve konu 4,2,6,4");

  const mu = calcMucadeleYillari("10/03/2026")!;
  eq(mu.method1.map((p) => p.age), [34, 61, 88], "CASE1 Mücadele 34,61,88");
  eq(mu.method1.map((p) => p.topic), [2, 0, 2], "CASE1 Mücadele konu 2,0,2");
  assert(!("method2" in (mu as Record<string, unknown>)), "CASE1 Mücadele: 2. yöntem YOK");
}

// ── CASE 2 — Esra Nur KONUK 15/03/1990 ───────────────────────────────────────
{
  const m = hesaplaNumeroloji({ firstName: "Esra Nur", lastName: "KONUK", birthDate: "15/03/1990" });
  const pin = m.pinKodu;
  eq([pin.k1, pin.k2, pin.k3, pin.k4, pin.k5, pin.k6, pin.k7, pin.k8, pin.k9], [6, 3, 1, 1, 7, 9, 4, 4, 8], "CASE2 PIN = 6,3,1,1,7,9,4,4,8");
}

// ── CASE 3 — Ali + Esra ilişki ───────────────────────────────────────────────
{
  const r = analyzeRelationship({
    person1: { name: "Ali", surname: "TUNA", birthDate: "10/03/2026" },
    person2: { name: "Esra Nur", surname: "KONUK", birthDate: "15/03/1990" },
  })!;
  eq(r.synergyPin.pin, [7, 6, 2, 6, 4, 4, 8, 3], "CASE3 Sinerji PIN 7,6,2,6,4,4,8,3");
  eq(r.whyTogether.digit, 4, "CASE3 9. hane = 4");
  eq(r.whyTogether.sum, 40, "CASE3 9. hane Σ = 40");
  eq(r.relationshipSoulFeeling.digit, 3, "CASE3 Ruh Duygusu = 3");
  eq([r.elementBalance.counts.Hava, r.elementBalance.counts.Su, r.elementBalance.counts["Ateş"], r.elementBalance.counts.Toprak], [0, 2, 3, 3], "CASE3 element Hava0/Su2/Ateş3/Toprak3");
  eq(r.elementBalance.highlighted, ["Ateş", "Toprak"], "CASE3 element TIE korunuyor (Ateş & Toprak)");
  eq([r.dominance.baskin, r.dominance.edilgen], [4, 4], "CASE3 baskın/edilgen 4/4");
  // Genel uyum skoru OLMAMALI
  const anyR = r as Record<string, unknown>;
  assert(anyR.compatibilityScore === undefined, "CASE3 compatibilityScore alanı YOK");
  assert(anyR.globalScore === undefined, "CASE3 globalScore alanı YOK");
  assert(anyR.overallScore === undefined, "CASE3 overallScore alanı YOK");
  assert(JSON.stringify(r).indexOf("Mükemmel Uyum") === -1, "CASE3 'Mükemmel Uyum' metni YOK");
}

// ── CASE 4 — Eş Uyumu: Züleyha + Hakan → 118 → %75 UYUMLU ────────────────────
{
  const c = classifyCompatibilityNumber(118);
  eq(c.classes, ["İYİ", "İYİ", "KÖTÜ"], "CASE4 118 → İYİ/İYİ/KÖTÜ");
  eq(c.percentage, 75, "CASE4 118 → %75");
  eq(c.polarity, "UYUMLU", "CASE4 118 → UYUMLU");
}

// ── CASE 5 — Mücadele PDF: 29/03/1986 → 35,62,89 ─────────────────────────────
{
  const mu = calcMucadeleYillari("29/03/1986")!;
  eq(mu.method1.map((p) => p.age), [35, 62, 89], "CASE5 Mücadele 35,62,89");

  // Zirve PDF fixture: 19/02/1987 (canonical formülden türetilmiş)
  const z = calcZirveYillari("19/02/1987")!;
  eq(z.hayatYoluRoot, 1, "CASE5b Zirve Hayat Yolu kökü = 1");
  eq(z.peaks.map((p) => p.age), [35, 44, 53, 62], "CASE5b Zirve yaş 35,44,53,62 (+9 zincir)");
}

// ── CASE 6 — Harflerin Yankılanışı: ilk harften sonra timeline DEVAM ETMELİ ───
{
  const segs = calcHarflerinYankilanisi("Ali", "TUNA", "10/03/2026");
  assert(segs.length > 5, "CASE6 timeline tek segmentte kesilmiyor", `segment sayısı = ${segs.length}`);
  assert(segs[0].letter === "A" && segs[0].ageStart === 0, "CASE6 ilk segment A / yaş 0");
  assert(segs.some((s) => s.letter === "T"), "CASE6 timeline sonraki harflere (T) ulaşıyor");
  assert(Math.max(...segs.map((s) => s.ageEnd)) >= 40, "CASE6 timeline yaşam boyunca uzuyor (>=40)");
}

// ── CASE 7 — Kaynak-içi çelişki: 151 → TABLO üstün → %75 UYUMLU ───────────────
{
  const c = classifyCompatibilityNumber(151);
  eq(c.classes, ["İYİ", "KÖTÜ", "İYİ"], "CASE7 151 → İYİ/KÖTÜ/İYİ");
  eq(c.percentage, 75, "CASE7 151 → %75 (tablo)");
  eq(c.polarity, "UYUMLU", "CASE7 151 → UYUMLU (hatalı örnek '%75 UYUMSUZ' KODLANMADI)");
}

// ── EK ASSERTLER (Source Catalog Closure) ────────────────────────────────────
{
  // N1–N3: Compatibility alphabet Q/W/X
  const q = compatibilityNameSum("Q");
  eq([q.sum, q.unmapped.length], [0, 0], "N1 Q = 0 (mapped)");
  const w = compatibilityNameSum("W");
  eq([w.sum, w.unmapped.length], [0, 0], "N2 W = 0 (mapped)");
  const x = compatibilityNameSum("X");
  assert(x.unmapped.includes("X") && x.sum === 0, "N3 X unsupported (unmapped, değer yok)");

  // N4: Edinim 29/03/1986 = 5
  eq(calcAcquisition("29/03/1986"), 5, "N4 Edinim 29/03/1986 = 5");

  // C: İsim Sayısı primitive VERIFIED (SEMA DURMAZ = 4)
  eq(calcNameNumberSingle("SEMA", "DURMAZ"), 4, "C İsim Sayısı SEMA DURMAZ = 4 (VERIFIED_SOURCE)");

  // N5–N6: Üçgen pozisyonları
  const r = analyzeRelationship({
    person1: { name: "Ali", surname: "TUNA", birthDate: "10/03/2026" },
    person2: { name: "Esra Nur", surname: "KONUK", birthDate: "15/03/1990" },
  })!;
  eq(r.relationshipTriangle.positions, [1, 2, 3, 6, 7, 8], "N5 üçgen pozisyonları [1,2,3,6,7,8]");
  eq(r.relationshipTriangle.excludedPositions, [4, 5], "N6 üçgen dışı [4,5] (Yaşam Döngüsü, Ders)");
  assert(!r.relationshipTriangle.positions.includes(4) && !r.relationshipTriangle.positions.includes(5), "N6b üçgen 4 ve 5'i içermiyor");

  // N7: Ruh Duygusu = 3 + kaynak yorumu mevcut
  eq(r.relationshipSoulFeeling.digit, 3, "N7 Ruh Duygusu = 3");
  assert(
    r.relationshipSoulFeeling.status === "COMPUTED" && !!r.relationshipSoulFeeling.text,
    "N7b Ruh Duygusu kaynak yorumu MEVCUT (SOURCE_MISSING değil)",
  );

  // N8: whyTogether = 4 + kaynak yorumu mevcut
  eq(r.whyTogether.digit, 4, "N8 Neden Bir Aradayız = 4");
  assert(
    r.whyTogether.status === "COMPUTED" && !!r.whyTogether.text,
    "N8b 9. hane (4) kaynak yorumu MEVCUT",
  );

  // Catalog completeness (kaynak katalogları tam)
  assert(complete9(YASAM_KODU_REL), "CAT Yaşam Kodu ilişkiler 9/9");
  assert(complete9(ISIM_SAYISI_REL), "CAT İsim Sayısı ilişkiler 9/9");
  assert(complete9(EDINIM_REL), "CAT Edinim ilişkiler 9/9");
  assert(complete9(DOGUM_GUNU_REL), "CAT Doğum Günü ilişkiler 9/9");
  assert(complete9(ORTAK_RAKAM_REL), "CAT Ortak Rakam 9/9");
  assert(complete9(RUH_DUYGUSU_REL), "CAT Ruh Duygusu 9/9");
  assert(complete9(NEDEN_BIR_ARADAYIZ_REL), "CAT Neden Bir Aradayız 9/9");
  eq(directionalCount(DIRECTIONAL_REL), 81, "CAT Directional matrix 81/81");
  eq(directionalCount(HANE_REL), 81, "CAT Hane katalogları 81/81 (9 hane × 9)");

  // Katman metinleri artık dolu (COMPUTED)
  assert(r.lifeCodeCompatibility.status === "COMPUTED" && !!r.lifeCodeCompatibility.aText, "LAYER Yaşam Kodu metni dolu");
  assert(r.nameNumberCompatibility.status === "COMPUTED" && !!r.nameNumberCompatibility.aText, "LAYER İsim Sayısı metni dolu");
  assert(r.acquisitionCompatibility.status === "COMPUTED" && !!r.acquisitionCompatibility.aText, "LAYER Edinim metni dolu");
  assert(r.birthdayCompatibility.status === "COMPUTED" && !!r.birthdayCompatibility.aText, "LAYER Doğum Günü metni dolu");
  assert(r.commonTopics.status === "COMPUTED" && !!r.commonTopics.text, "LAYER Ortak Rakam metni dolu");
  assert(r.relationshipType.status === "COMPUTED" && !!r.relationshipType.aToB && !!r.relationshipType.bToA, "LAYER İlişki Türü yönlü metin dolu");
  assert(r.relationshipTriangle.nodes.length === 6 && r.relationshipTriangle.nodes.every((n) => !!n.text), "LAYER Üçgen 6 düğüm metinli");

  // N9: Züleyha + Hakan eş uyumu uçtan uca
  const zul = compatibilityNameSum("Züleyha").sum;
  const hak = compatibilityNameSum("Hakan").sum;
  eq([zul, hak], [44, 16], "N9a isim toplamları 44 / 16");
  const personA = zul + 29; // DOB ham toplam = 29 (PDF örneği)
  const personB = hak + 29;
  eq([personA, personB], [73, 45], "N9b kişi değerleri 73 / 45");
  const couple = personA + personB;
  eq(couple, 118, "N9c çift değeri 118");
  const cc = classifyCompatibilityNumber(couple);
  eq(cc.classes, ["İYİ", "İYİ", "KÖTÜ"], "N9d 118 → İYİ/İYİ/KÖTÜ");
  eq([cc.percentage, cc.polarity], [75, "UYUMLU"], "N9e 118 → %75 UYUMLU");

  // N10–N11: Ana Mücadele ayrı field
  const mu = calcMucadeleYillari("29/03/1986")!;
  assert("anaMucadele" in mu, "N10 Ana Mücadele ayrı field mevcut");
  eq([mu.method1[0].topic, mu.method1[1].topic, mu.method1[2].topic, mu.anaMucadele], [1, 4, 3, 3], "N11 29/03/1986 M1=1,M2=4,M3=3,ANA=3");
  const muAli = calcMucadeleYillari("10/03/2026")!;
  eq(muAli.anaMucadele, 2, "N11b Ali ANA MÜCADELE = 2");

  // N12: skor alanları hâlâ yok
  const anyR = r as Record<string, unknown>;
  assert(anyR.compatibilityScore === undefined && anyR.globalScore === undefined && anyR.overallScore === undefined, "N12 skor alanları hâlâ YOK");
}

// ── PAYLAŞILAN UYUM PRIMITIVE'LERİ (Ev/İşyeri motoru kullanır → KORUNUR) ──────
// FAZ 6: Eş Uyumu (spouseCompatibility) ve Nikâh (marriageDateEffect) ürün kapsamından
// KALDIRILDI. Ancak compatibilityNameSum / classifyCompatibilityNumber Business (Ev/İşyeri)
// tarafından paylaşılır; bu SHARED primitive'ler doğrulanmaya devam eder.
{
  eq(compatibilityNameSum("Züleyha").sum, 44, "SHARED ZÜLEYHA isim = 44");
  eq(compatibilityNameSum("Hakan").sum, 16, "SHARED HAKAN isim = 16");
  eq(compatibilityNameSum("Sevilay").sum, 38, "SHARED SEVİLAY isim = 38");
  eq(compatibilityNameSum("Kalaycı").sum, 35, "SHARED KALAYCI soyisim = 35");
  eq(compatibilityNameSum("Murat").sum, 24, "SHARED MURAT isim = 24");
  eq(classifyCompatibilityNumber(118).percentage, 75, "SHARED classify 118 → %75");

  // REL-NO-SPOUSE-01 / REL-NO-MARRIAGE-01: result'ta bu alanlar ARTIK YOK.
  const r2 = analyzeRelationship({
    person1: { name: "Ali", surname: "TUNA", birthDate: "10/03/2026" },
    person2: { name: "Esra Nur", surname: "KONUK", birthDate: "15/03/1990" },
  })!;
  const anyR2 = r2 as Record<string, unknown>;
  assert(anyR2.spouseCompatibility === undefined, "REL-NO-SPOUSE-01 spouseCompatibility result'ta YOK");
  assert(anyR2.marriageDateEffect === undefined, "REL-NO-MARRIAGE-01 marriageDateEffect result'ta YOK");
  assert(JSON.stringify(r2).toLowerCase().indexOf("marriage") === -1, "REL-NO-MARRIAGE-01b marriage residue YOK");
  assert(r2.synergyPin.pin.length === 8, "FAZ6 ilişki analizi Eş Uyumu/Nikâh olmadan tam çalışır");
}

// ── SOURCE ANOMALIES (belgelenmiş; classify SHARED primitive üzerinden) ──────
{
  // 106 (s.207): tablo 106 → İYİ/KÇB/KÖTÜ → %75 UYUMSUZ.
  const ayse = classifyCompatibilityNumber(106);
  eq([ayse.percentage, ayse.polarity], [75, "UYUMSUZ"], "ANOMALY 106 tablo-tutarlı %75 UYUMSUZ");
  // 151 (s.210): örnek metin '%75 UYUMSUZ' der; TABLO %75 UYUMLU → tablo üstün.
  const c151 = classifyCompatibilityNumber(151);
  eq([c151.percentage, c151.polarity], [75, "UYUMLU"], "ANOMALY 151 tablo üstün → %75 UYUMLU");
}

// ── Sonuç ────────────────────────────────────────────────────────────────────
console.log(`\nNUMEROLOJİ CANONICAL HARNESS: ${pass} PASS · ${fail} FAIL`);
if (fail > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("Tüm golden fixture'lar geçti.");
