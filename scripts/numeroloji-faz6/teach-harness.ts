/**
 * NUMEROLOJİ FAZ 6 / UAT PATCH 2 — ÖĞRETİCİ "Nasıl hesaplandı?" acceptance harness.
 *
 * KAPSAM (TEACHING SCOPE CORRECTION): öğretici standart YALNIZ "Zamanlama & Gelişim"
 * sekmesinin 15 hesabında zorunludur. Bu harness o kapsamı + Kişisel Yıl golden 7-soru
 * kilidini doğrular. Diğer alanlar (Hayat Yolu/PIN/İlişki vb.) kapsam DIŞIDIR ve burada
 * test edilmez. Öğretici sunum değerleri engine ile BİREBİR eşit ve kullanıcı diline
 * developer jargonu SIZMAZ.
 *
 * Çalıştır:  tsx scripts/numeroloji-faz6/teach-harness.ts
 */
import { computeUniversalTiming, computePersonalTiming, personalYear } from "@/lib/numeroloji/timing";
import { computeDevelopment } from "@/lib/numeroloji/development";
import type { CalculationExplanation } from "@/app/numeroloji/components/NumerolojiCalculationInfo";
import {
  nominalPersonalYearExplain,
  activePersonalYearExplain,
  personalMonthExplain,
  personalDayExplain,
  universalYearExplain,
  universalMonthExplain,
  universalDayExplain,
  yearChakraExplain,
  maturityExplain,
  birthDayEnergyExplain,
  personalityEnergyExplain,
  lifeLessonExplain,
  destinyExplain,
  evreExplain,
  donguExplain,
} from "@/app/numeroloji/utils/teachingExplain";

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

/** CalculationExplanation → tüm kullanıcı-görünür metinlerin düz listesi. */
function flatten(e: CalculationExplanation): string[] {
  const out: string[] = [];
  for (const it of e.usedInputs ?? []) out.push(it.label, it.value, it.note ?? "");
  for (const it of e.unusedInputs ?? []) out.push(it.label, it.value, it.note ?? "");
  if (e.rationale) out.push(e.rationale);
  for (const st of e.steps ?? []) { if (st.title) out.push(st.title); out.push(...st.lines); }
  out.push(...(e.reduction ?? []));
  if (e.result) out.push(e.result);
  if (e.resultNote) out.push(e.resultNote);
  if (e.period) out.push(e.period);
  return out;
}
const has = (arr: string[], sub: string) => arr.some((s) => s.includes(sub));

// ── Golden kişi ────────────────────────────────────────────────────────────────
const BD = "14/02/1982";
const REF = { year: 2026, month: 9, day: 1 };
const FN = "Hasan";
const LN = "ARICI";

const engPY = personalYear(BD, REF);
const engPersonal = computePersonalTiming(BD, REF);
const engUniversal = computeUniversalTiming(REF);
const engDev = computeDevelopment(FN, LN, BD, REF);

// ── TEACH-01: Nominal Kişisel Yıl kullanılan bilgileri açıklar ───────────────────
const nom = nominalPersonalYearExplain(BD, REF.year)!;
{
  const labels = (nom.explanation.usedInputs ?? []).map((i) => i.label);
  assert(labels.includes("Doğum günü") && labels.includes("Doğum ayı") && labels.some((l) => l.includes("takvim yılı")),
    "TEACH-01 Nominal kullanılan bilgiler (gün + ay + takvim yılı)", labels.join(", "));
}

// ── TEACH-02: Doğum yılının kullanılmadığını açıkça söyler ───────────────────────
{
  const unused = nom.explanation.unusedInputs ?? [];
  const dy = unused.find((i) => i.label === "Doğum yılı");
  assert(Boolean(dy), "TEACH-02a Nominal 'Doğum yılı' kullanılmayan olarak listelenir");
  assert(Boolean(dy?.note && dy.note.includes("doğum yılınız kullanılmaz")), "TEACH-02b 'doğum yılınız kullanılmaz' açıklaması");
  eq(dy?.value, "1982", "TEACH-02c doğum yılı değeri 1982");
}

// ── TEACH-03: Seçilen/takvim yılının neden kullanıldığını açıklar ────────────────
assert(Boolean(nom.explanation.rationale?.includes("2026")) && Boolean(nom.explanation.rationale?.includes("takvim yılı")),
  "TEACH-03 mantık 2026 takvim yılını gerekçelendirir", nom.explanation.rationale);

// ── TEACH-04: Her sadeleştirme ayrı gösterilir (gün/ay/yıl) ──────────────────────
{
  const stepLines = (nom.explanation.steps ?? []).flatMap((s) => s.lines);
  assert(has(stepLines, "1 + 4 = 5"), "TEACH-04a gün 14 → 1 + 4 = 5", stepLines.join(" | "));
  assert(has(stepLines, "0 + 2 = 2"), "TEACH-04b ay 02 → 0 + 2 = 2");
  assert(has(stepLines, "2 + 0 + 2 + 6 = 10"), "TEACH-04c yıl 2026 → 2 + 0 + 2 + 6 = 10");
  assert(has(stepLines, "5 + 2 + 10 = 17"), "TEACH-04d toplam 5 + 2 + 10 = 17");
}

// ── TEACH-05: Nihai sadeleştirme gösterilir ──────────────────────────────────────
assert(has(nom.explanation.reduction ?? [], "1 + 7 = 8"), "TEACH-05 son sadeleştirme 17 → 1 + 7 = 8", (nom.explanation.reduction ?? []).join(" | "));

// ── TEACH-06: Aktif Kişisel Yıl doğum günü geçişini açıklar ('geçildi' YOK) ──────
const act = activePersonalYearExplain(BD, REF, engPY.active.periodStart.year, "14/02/2026", "13/02/2027")!;
{
  assert(Boolean(act.explanation.rationale?.includes("doğum gününde")), "TEACH-06a aktif mantık doğum günü geçişini anlatır");
  const all = flatten(act.explanation).join("  ");
  assert(!all.includes("geçildi"), "TEACH-06b aktif açıklama 'geçildi' developer copy'si içermez");
}

// ── TEACH-07: Aktif dönem aralığı gösterilir ─────────────────────────────────────
assert(Boolean(act.explanation.period && act.explanation.period.includes("14/02/2026") && act.explanation.period.includes("13/02/2027")),
  "TEACH-07 aktif dönem 14/02/2026 – 13/02/2027", act.explanation.period);

// ── TEACH-08: Kişisel Ay, Nominal Kişisel Yıl temelini belirtir ──────────────────
const pm = personalMonthExplain(BD, REF)!;
assert(Boolean(pm.explanation.rationale?.includes("Nominal Kişisel Yıl")), "TEACH-08 Kişisel Ay Nominal temelini söyler", pm.explanation.rationale);

// ── TEACH-09: Kişisel Gün bağımlılık zincirini gösterir ──────────────────────────
const pd = personalDayExplain(BD, REF)!;
{
  const labels = (pd.explanation.usedInputs ?? []).map((i) => i.label);
  assert(labels.some((l) => l.includes("Nominal Kişisel Yıl")) && labels.includes("Kişisel Ay") && labels.includes("Seçilen gün"),
    "TEACH-09 Kişisel Gün zinciri (Nominal Yıl + Kişisel Ay + gün)", labels.join(", "));
}

// ── TEACH-10: Doğum Günü Enerjisi exact 1–31, sadeleştirme YOK ────────────────────
const bde = birthDayEnergyExplain(BD)!;
{
  assert(bde.value === 14, "TEACH-10a Doğum Günü Enerjisi = 14 (exact)");
  assert(!bde.explanation.reduction?.length, "TEACH-10b sadeleştirme bölümü yok");
  assert(Boolean(bde.explanation.rationale?.includes("sadeleştirme yapılmaz")), "TEACH-10c 'sadeleştirme yapılmaz' der");
}

// ── TEACH-11: Kişilik Enerjisi, sadeleştirilmiş doğum günü değerini karşılaştırır ─
const pe = personalityEnergyExplain(BD)!;
assert(Boolean(pe.explanation.rationale?.includes("14") && pe.explanation.rationale?.includes(String(pe.value))),
  "TEACH-11 Kişilik Enerjisi 14 → 5 karşılaştırması", pe.explanation.rationale);

// ── TEACH-13: Yıl Çakrası referans yılı kullanır, doğum yılını KULLANMAZ ──────────
const yc = yearChakraExplain(BD, REF.year)!;
{
  const usedLabels = (yc.explanation.usedInputs ?? []).map((i) => i.label);
  const unusedLabels = (yc.explanation.unusedInputs ?? []).map((i) => i.label);
  assert(usedLabels.includes("Referans yıl"), "TEACH-13a Yıl Çakrası referans yılı kullanır");
  assert(unusedLabels.includes("Doğum yılı"), "TEACH-13b Yıl Çakrası doğum yılını kullanmaz");
  assert(Boolean(yc.explanation.rationale?.includes("Kişisel Yıl ile aynı hesap değildir")), "TEACH-13c Yıl Çakrası ≠ Kişisel Yıl");
}

// ── TEACH-14: Evre/Döngü farkı + yaş yerleşimi ───────────────────────────────────
{
  const ev = evreExplain(44, 5, 7);
  const dn = donguExplain(44, 9);
  assert(Boolean(ev.explanation.rationale?.includes("dokuz yıllık Evrelere")), "TEACH-14a Evre 9 yıllık dönem açıklaması");
  const evLines = (ev.explanation.steps ?? []).flatMap((s) => s.lines);
  assert(evLines.some((l) => l.includes("5. Evre")), "TEACH-14b yaş yerleşimi gösterilir");
  assert(evLines.some((l) => l.includes("siz buradasınız")), "TEACH-14c mevcut Evre işaretlenir");
  assert(Boolean(dn.explanation.rationale?.includes("Evre ile aynı şey değildir")), "TEACH-14d Döngü ≠ Evre");
}

// (TEACH-15 PIN ve TEACH-16 Ortak Rakam KAPSAM DIŞI — Zamanlama & Gelişim'e ait değil.)

// ── TEACH-17: Kullanıcı-görünür modalda developer jargonu YOK ─────────────────────
{
  const FORBIDDEN = [
    "raw", "primitive", "fallback", "activecalendaryear", "resolved year", "transition state",
    "source branch", "anchor", "floor(", "debug", "trace", "provenance",
    "reduce1to9", "reducekeepmaster", "sumdigits", "geçildi", "spouse", "marriage", "index =",
  ];
  const allExps: CalculationExplanation[] = [
    nom.explanation, act.explanation, pm.explanation, pd.explanation,
    universalYearExplain(REF.year).explanation, universalMonthExplain(REF.year, REF.month).explanation,
    universalDayExplain(REF.year, REF.month, REF.day).explanation,
    yc.explanation, maturityExplain(FN, LN, BD)!.explanation, bde.explanation, pe.explanation,
    lifeLessonExplain(BD)!.explanation, destinyExplain(FN, LN)!.explanation,
    evreExplain(44, 5, 7).explanation, donguExplain(44, 9).explanation,
  ];
  const blob = allExps.flatMap(flatten).join("\n").toLowerCase();
  for (const tok of FORBIDDEN) {
    assert(!blob.includes(tok), `TEACH-17 jargon yok: "${tok}"`);
  }
}

// ── TEACH-18: Sunum finalleri engine finalleriyle BİREBİR ────────────────────────
{
  eq(nom.value, engPY.nominal.value, "TEACH-18a Nominal = engine");
  eq(act.value, engPY.active.value, "TEACH-18b Aktif = engine");
  eq(pm.value, engPersonal.personalMonth.value, "TEACH-18c Kişisel Ay = engine");
  eq(pd.value, engPersonal.personalDay.value, "TEACH-18d Kişisel Gün = engine");
  eq(universalYearExplain(REF.year).value, engUniversal.universalYear.value, "TEACH-18e Evrensel Yıl = engine");
  eq(universalMonthExplain(REF.year, REF.month).value, engUniversal.universalMonth.value, "TEACH-18f Evrensel Ay = engine");
  eq(universalDayExplain(REF.year, REF.month, REF.day).value, engUniversal.universalDay.value, "TEACH-18g Evrensel Gün = engine");
  eq(yc.value, engDev.yearChakra.value, "TEACH-18h Yıl Çakrası = engine");
  eq(maturityExplain(FN, LN, BD)!.value, engDev.maturity.value, "TEACH-18i Olgunluk = engine");
  eq(bde.value, engDev.birthDayEnergy.value, "TEACH-18j Doğum Günü Enerjisi = engine");
  eq(pe.value, engDev.personalityEnergy.value, "TEACH-18k Kişilik Enerjisi = engine");
  eq(lifeLessonExplain(BD)!.value, engDev.lifeLesson.value, "TEACH-18l Hayat Dersi = engine");
  eq(destinyExplain(FN, LN)!.value, engDev.destiny.value, "TEACH-18m Kader Sayısı = engine");
}

// ── GOLDEN — Kişisel Yıl 7 soru kilidi (Hasan ARICI 14/02/1982 · ref 01/09/2026) ──
{
  // 1) Neden 2026? → mantık 2026 takvim yılını gerekçelendirir (TEACH-03 ile örtüşür)
  assert(Boolean(nom.explanation.rationale?.includes("2026")), "GOLDEN-1 neden 2026");
  // 2) Neden 1982 değil? → unused doğum yılı + not
  assert(Boolean((nom.explanation.unusedInputs ?? []).find((i) => i.value === "1982")), "GOLDEN-2 1982 kullanılmaz");
  // 3) 14 nasıl 5 oldu?
  assert(has((nom.explanation.steps ?? []).flatMap((s) => s.lines), "1 + 4 = 5"), "GOLDEN-3 14 → 5");
  // 4) 2026 nasıl 10 oldu?
  assert(has((nom.explanation.steps ?? []).flatMap((s) => s.lines), "2 + 0 + 2 + 6 = 10"), "GOLDEN-4 2026 → 10");
  // 5) 8 nasıl çıktı?
  assert(has(nom.explanation.reduction ?? [], "1 + 7 = 8"), "GOLDEN-5 17 → 8");
  assert(nom.value === 8, "GOLDEN-5b Nominal = 8");
  // 6) 8 ne zaman aktif oldu? 7) Ne zamana kadar?
  assert(Boolean(act.explanation.period?.includes("14/02/2026")), "GOLDEN-6 aktif başlangıç 14/02/2026");
  assert(Boolean(act.explanation.period?.includes("13/02/2027")), "GOLDEN-7 aktif bitiş 13/02/2027");
  assert(act.value === 8, "GOLDEN aktif = 8");
}

// ── Sonuç ────────────────────────────────────────────────────────────────────────
console.log(`\nNUMEROLOJİ FAZ 6 / PATCH 2 TEACH HARNESS: ${pass} PASS · ${fail} FAIL`);
if (fail > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("Zamanlama & Gelişim öğretici kapsamı + Kişisel Yıl golden 7-soru kilidi geçti (PIN/İlişki/Hayat Yolu kapsam dışı).");
