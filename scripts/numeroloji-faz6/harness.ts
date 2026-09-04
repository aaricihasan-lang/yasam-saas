/**
 * NUMEROLOJİ FAZ 6 — golden regression harness.
 *
 * Kapsam:
 *   • NAME-SOURCE  : İsim Sayısı kaynak kimliği (SEMA=2, DURMAZ=2, SEMA DURMAZ=4, ELİF YILMAZ=1)
 *   • COMMON       : Ortak Rakam = reduce1To9(isimA + isimB) — formül kimliği
 *   • YANKI        : Harflerin Yankılanışı sunum filtresi (geçmiş+aktif; gelecek gizli; tam korunur)
 *   • CALCINFO     : "Nasıl hesaplandı?" breakdown değerleri engine ile birebir
 *   • REL-NO-SPOUSE/REL-NO-MARRIAGE : Eş Uyumu / Nikâh result'tan kaldırıldı
 *   • PARITY       : aynı referans tarih → deterministik aynı FAZ4 sonuç (yeni vs kayıtlı parity temeli)
 *
 * Çalıştır:  tsx scripts/numeroloji-faz6/harness.ts
 */
import {
  calcNameNumberSingle,
  calcLifeCodeDigit,
  calcBirthdayDigit,
  calcAcquisition,
  analyzeRelationship,
  reduce1To9,
  calcHarflerinYankilanisi,
} from "@/lib/numeroloji";
import { computeUniversalTiming, computePersonalTiming, universalYear, personalYear } from "@/lib/numeroloji/timing";
import { computeDevelopment, birthDayEnergyExactDay } from "@/lib/numeroloji/development";
import { filterHarfSegmentsThroughActive } from "@/app/numeroloji/utils/harfSummary";
import {
  lifeCodeBreakdown,
  birthdayBreakdown,
  acquisitionBreakdown,
  nameNumberBreakdown,
  commonDigitBreakdown,
} from "@/app/numeroloji/utils/relationshipCalcBreakdown";
import { CONCEPT_HELP } from "@/app/numeroloji/helpers/conceptHelp";
import { activePersonalYearBreakdown } from "@/app/numeroloji/utils/timingCalcBreakdown";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(`  ✗ ${label}${detail ? `  → ${detail}` : ""}`); }
}
function eq<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  assert(a === e, label, a === e ? undefined : `beklenen ${e}, gelen ${a}`);
}

// ── NAME-SOURCE (kaynak: kitap 2. seviye(3).pdf — İsim Sayısı / Ortak Rakam) ──
eq(calcNameNumberSingle("SEMA", ""), 2, "NAME-SOURCE-01 SEMA = 11 → 2");
eq(calcNameNumberSingle("DURMAZ", ""), 2, "NAME-SOURCE-02 DURMAZ = 29 → 11 → 2");
eq(calcNameNumberSingle("SEMA", "DURMAZ"), 4, "NAME-SOURCE-03 SEMA DURMAZ = 4");
eq(calcNameNumberSingle("ELİF", "YILMAZ"), 1, "NAME-SOURCE-04 ELİF YILMAZ = 55 → 1");
// SOURCE-SAMPLE ANOMALY: kaynak örneği "SEMA ÇAYLAR = 2" der; ELİF YILMAZ=1'i üreten AYNI
// yöntem (isim+soyisim harf toplamı → tek hane) SEMA ÇAYLAR için 8 verir (ÇAYLAR=6).
// Tablo/yöntem üstün; hatalı örnek KODLANMADI. Yöntem kimliğini doğrularız:
eq(calcNameNumberSingle("SEMA", "ÇAYLAR"), 8, "NAME-SOURCE-ANOMALY SEMA ÇAYLAR = 8 (kaynak örneği '2' yöntemle çelişir)");

// ── COMMON — Ortak Rakam formül kimliği: reduce1To9(isimA + isimB) ───────────
{
  const r = analyzeRelationship({
    person1: { name: "SEMA", surname: "DURMAZ", birthDate: "01/01/1980" }, // isim = 4
    person2: { name: "ELİF", surname: "YILMAZ", birthDate: "02/02/1985" }, // isim = 1
  })!;
  eq(r.commonTopics.aNameNumber, 4, "COMMON A isim sayısı = 4");
  eq(r.commonTopics.bNameNumber, 1, "COMMON B isim sayısı = 1");
  eq(r.commonTopics.commonDigit, reduce1To9(4 + 1), "COMMON-SOURCE-03 Ortak Rakam = reduce1To9(4+1) = 5");
  eq(r.commonTopics.commonDigit, 5, "COMMON Ortak Rakam = 5");
}

// ── CALCINFO — breakdown değerleri engine primitive'leriyle BİREBİR ──────────
{
  const life87 = lifeCodeBreakdown("14/02/1987")!;
  eq(life87.value, calcLifeCodeDigit("14/02/1987"), "CALCINFO-02 lifeCode breakdown = engine (14/02/1987)");
  eq(life87.value, 5, "CALCINFO 14/02/1987 → 5");
  const life92 = lifeCodeBreakdown("10/04/1992")!;
  eq(life92.value, 8, "CALCINFO 10/04/1992 → 8");
  assert(life87.steps.length > 0, "CALCINFO lifeCode adım dökümü mevcut");

  eq(nameNumberBreakdown("SEMA", "")!.value, calcNameNumberSingle("SEMA", ""), "CALCINFO nameNumber breakdown = engine (SEMA)");
  eq(birthdayBreakdown("14/02/1987")!.value, calcBirthdayDigit("14/02/1987"), "CALCINFO birthday breakdown = engine");
  eq(acquisitionBreakdown("14/02/1987")!.value, calcAcquisition("14/02/1987"), "CALCINFO acquisition breakdown = engine");
  eq(commonDigitBreakdown("SEMA", "DURMAZ", "ELİF", "YILMAZ")!.value, 5, "CALCINFO common breakdown = 5");
}

// ── YANKI — Sonuç Özeti sunum filtresi (engine tam timeline'ı KESMEZ) ────────
{
  const segs = calcHarflerinYankilanisi("Ali", "TUNA", "10/03/1990"); // yıl bilgili tam timeline
  const refYear = 2026;
  const activeIdx = segs.findIndex((s) => s.yearStart! <= refYear && refYear <= s.yearEnd!);
  assert(activeIdx >= 0, "YANKI setup aktif segment bulundu", `activeIdx=${activeIdx}`);
  const filtered = filterHarfSegmentsThroughActive(segs, refYear);

  assert(filtered.length < segs.length, "YANKI-01 gelecek segmentler gizlendi (özet < tam)", `${filtered.length} < ${segs.length}`);
  eq(filtered.length, activeIdx + 1, "YANKI-01b özet = geçmiş + aktif (activeIdx+1)");
  const lastF = filtered[filtered.length - 1]!;
  assert(lastF.yearStart! <= refYear && refYear <= lastF.yearEnd!, "YANKI-02 aktif segment görünür (son eleman refYear'ı kapsar)");
  eq(lastF.yearEnd, segs[activeIdx]!.yearEnd, "YANKI-04 aktif segment uç yılı KIRPILMADI");
  eq(segs.length, calcHarflerinYankilanisi("Ali", "TUNA", "10/03/1990").length, "YANKI-03 engine tam timeline korunuyor (segs mutasyona uğramadı)");

  // Yıl bilgisi yoksa (doğum yılı yok) → filtre hiçbir şeyi gizlemez (güvenli).
  const noYear = calcHarflerinYankilanisi("Ali", "TUNA");
  eq(filterHarfSegmentsThroughActive(noYear, refYear).length, noYear.length, "YANKI-05 yıl yoksa filtre tümünü döndürür");
}

// ── REL-NO-SPOUSE / REL-NO-MARRIAGE ─────────────────────────────────────────
{
  const r = analyzeRelationship({
    person1: { name: "Ali", surname: "TUNA", birthDate: "10/03/2026" },
    person2: { name: "Esra Nur", surname: "KONUK", birthDate: "15/03/1990" },
  })!;
  const anyR = r as Record<string, unknown>;
  assert(anyR.spouseCompatibility === undefined, "REL-NO-SPOUSE-01 spouseCompatibility YOK");
  assert(anyR.marriageDateEffect === undefined, "REL-NO-MARRIAGE-01 marriageDateEffect YOK");
  assert(JSON.stringify(r).toLowerCase().indexOf("marriage") === -1, "REL residue: 'marriage' YOK");
}

// ── PARITY — aynı referans tarih → deterministik aynı FAZ4 sonuç ─────────────
{
  const ref = { year: 2026, month: 9, day: 1 };
  const u1 = computeUniversalTiming(ref);
  const u2 = computeUniversalTiming(ref);
  eq(JSON.stringify(u1), JSON.stringify(u2), "PARITY-02 Universal timing deterministik (aynı ref → aynı sonuç)");
  const p1 = computePersonalTiming("15/03/1990", ref);
  const p2 = computePersonalTiming("15/03/1990", ref);
  eq(JSON.stringify(p1), JSON.stringify(p2), "PARITY-02b Personal timing deterministik");
  const d1 = computeDevelopment("Esra Nur", "KONUK", "15/03/1990", ref);
  const d2 = computeDevelopment("Esra Nur", "KONUK", "15/03/1990", ref);
  eq(JSON.stringify(d1), JSON.stringify(d2), "PARITY-01 Development deterministik (yeni analiz = kayıtlı analiz temeli)");
}

// ── MEANING — "Bu ne demek?" kavram tanımları (source-safe, ayrımlar korunur) ──
{
  const has = (s: string | undefined, sub: string) => Boolean(s && s.includes(sub));
  // MEANING-01: Evrensel Yıl kişiye özel olmadığını söyler.
  assert(has(CONCEPT_HELP.universalYear, "Kişiye özel değildir"), "MEANING-01 Evrensel Yıl 'kişiye özel değildir' der");
  // MEANING-02: Nominal ile Aktif açıkça ayrılır.
  assert(CONCEPT_HELP.nominalPersonalYear !== CONCEPT_HELP.activePersonalYear, "MEANING-02a Nominal ≠ Aktif tanımı");
  assert(has(CONCEPT_HELP.nominalPersonalYear, "takvim yılı"), "MEANING-02b Nominal 'takvim yılı' vurgusu");
  assert(has(CONCEPT_HELP.activePersonalYear, "doğum gününüzde başlar"), "MEANING-02c Aktif 'doğum gününde başlar' vurgusu");
  // MEANING-03: Aktif Kişisel Yıl 'geçildi' developer copy içermez (tanım + döküm).
  assert(!has(CONCEPT_HELP.activePersonalYear, "geçildi"), "MEANING-03a Aktif tanımı 'geçildi' içermez");
  const abd = activePersonalYearBreakdown("14/02/1982", 2026)!;
  assert(!abd.steps.join(" ").includes("geçildi"), "MEANING-03b Aktif hesap dökümü 'geçildi' içermez");
  // MEANING-04: Aktif dönem tarih aralığı engine'den gelir (UI hint kaynağı).
  const pyA = personalYear("14/02/1982", { year: 2026, month: 9, day: 1 });
  assert(pyA.active.periodStart.year <= 2026 && pyA.active.periodEnd.year >= 2026, "MEANING-04 aktif dönem aralığı mevcut");
  // MEANING-05: Evre ve Döngü aynı kavram gibi anlatılmaz.
  assert(CONCEPT_HELP.evre !== CONCEPT_HELP.dongu, "MEANING-05a Evre ≠ Döngü tanımı");
  assert(has(CONCEPT_HELP.dongu, "aynı şey değildir"), "MEANING-05b Döngü 'Evre ile aynı değil' der");
  // MEANING-06: Doğum Günü Enerjisi 1–31 exact kimliği korunur.
  assert(has(CONCEPT_HELP.birthDayEnergy, "1–31") && has(CONCEPT_HELP.birthDayEnergy, "sadeleştirilmez"), "MEANING-06a exact 1–31 tanımı");
  assert(birthDayEnergyExactDay("29/03/1986").value === 29, "MEANING-06b engine exact gün = 29 (reduce YOK)");
  // MEANING-07: Hayat Dersi ile PIN 5 Yaşam Dersi karıştırılmaz.
  assert(has(CONCEPT_HELP.lifeLesson, "Yaşam Dersi") && has(CONCEPT_HELP.lifeLesson, "aynı şey değildir"), "MEANING-07 Hayat Dersi ≠ PIN 5 Yaşam Dersi");
}

// ── CALCINFO — meaning vs calculation ayrı; gerçek matematik ──────────────────
{
  // CALCINFO-05: Aktif Kişisel Yıl dökümü final değerin GERÇEK matematiğini gösterir.
  const active = personalYear("14/02/1982", { year: 2026, month: 9, day: 1 }).active;
  const bd = activePersonalYearBreakdown("14/02/1982", 2026)!;
  eq(bd.value, active.value, "CALCINFO-05 Aktif breakdown value = engine active value");
  assert(bd.steps.some((s) => /\d\s*\+\s*\d/.test(s)), "CALCINFO-05b Aktif döküm gerçek toplama satırı içerir");
  // CALCINFO-06: Evrensel Yıl 2026 → 2+0+2+6 = 10 → 1 dökümü korunur.
  const uy = universalYear(2026);
  assert(uy.steps.join(" ").includes("2+0+2+6"), "CALCINFO-06 Evrensel Yıl 2+0+2+6 dökümü");
  eq(uy.value, 1, "CALCINFO-06b Evrensel Yıl 2026 → 1");
  // CALCINFO-07: meaning metni ile calculation dökümü ayrı içeriktir.
  assert(CONCEPT_HELP.activePersonalYear !== bd.steps.join("\n"), "CALCINFO-07 meaning ≠ calculation içeriği");
  assert(!/\d\s*\+\s*\d/.test(CONCEPT_HELP.activePersonalYear ?? ""), "CALCINFO-07b meaning metni aritmetik içermez");
}

// ── Sonuç ────────────────────────────────────────────────────────────────────
console.log(`\nNUMEROLOJİ FAZ 6 HARNESS: ${pass} PASS · ${fail} FAIL`);
if (fail > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("Tüm FAZ 6 golden fixture'lar geçti.");
