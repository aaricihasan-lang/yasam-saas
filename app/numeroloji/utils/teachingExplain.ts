// FAZ 6 / UAT PATCH 2 — ÖĞRETİCİ "Nasıl hesaplandı?" hesap açıklamaları.
//
// Bu saf yardımcı, mevcut canonical engine SONUÇLARININ nasıl oluştuğunu kullanıcı diliyle
// açıklayan yapılandırılmış CalculationExplanation nesneleri üretir. YENİ formül/motor YOK:
//   • Nihai değerler engine reducer'larıyla (reduce1To9 / reduceKeepMaster / reduceKeepMaster11or22
//     / sumNameLetterValues) BİREBİR hesaplanır; adım satırları yalnız sunum içindir.
//   • Developer jargonu (raw/primitive/fallback/activeCalendarYear/trace ...) kullanıcıya BASILMAZ.
//
// Her builder { explanation, value } döndürür (value = engine ile eşitlik testi için).
//
// I18N (R5, 25.11.2026): metinler `numerology.analysis.explain` kataloğundan gelir. Her builder'ın SON opsiyonel
// parametresi `tx` (ekran dilinin çevirisi, ör. `useTranslations("numerology.analysis.explain")`). Verilmezse
// KAYNAK dil (tr) kataloğu kullanılır → TR çıktı önceki literal'lerle BAYT-BİREBİR (teach/final-methodology
// harness'ları). Hesap (value, sayılar, sadeleştirme) dilden bağımsızdır; yalnız etiket/cümle çevrilir.

import { createTranslator } from "next-intl";
import trAnalysis from "@/messages/tr/numerology.analysis.json";
import {
  CHAKRA_LETTER_MAP,
  parseBirthDate,
  reduce1To9,
  sumDigits,
  turkishUpper,
  type BirthDateParts,
} from "@/lib/numeroloji";
import type { CalculationExplanation } from "../components/NumerolojiCalculationInfo";

export type ExplainOut = { explanation: CalculationExplanation; value: number };

/** Ekran dilinin çeviri fonksiyonu (`numerology.analysis.explain` ad alanı). Sayılar string geçirilir. */
export type ExplainT = (key: string, values?: Record<string, string>) => string;

const TR_EXPLAIN: ExplainT = createTranslator({
  locale: "tr",
  messages: trAnalysis as unknown as Record<string, never>,
  namespace: "numerology.analysis.explain" as never,
}) as unknown as ExplainT;

const s = (n: number | string): string => String(n);

function parse(birthDate: string): BirthDateParts | null {
  return parseBirthDate((birthDate || "").replace(/\//g, "."));
}

function monthName(tx: ExplainT, month: number): string {
  return month >= 1 && month <= 12 ? tx(`months.${month}`) : "?";
}

function monthLabel(tx: ExplainT, month: number, monthText: string): string {
  return `${monthName(tx, month)} (${monthText})`;
}

/** Tek geçişli rakam toplamı satırı (engine sumDigits ile aynı; ör. "14 → 1 + 4 = 5"). */
function digitSumLine(text: string): { line: string; sum: number } {
  const digits = text.split("").map(Number);
  const sum = digits.reduce((a, b) => a + b, 0);
  if (text.length <= 1) return { line: text, sum };
  return { line: `${text} → ${text.split("").join(" + ")} = ${sum}`, sum };
}

/** Tam sadeleştirme zinciri (1–9, 0→9 — reduce1To9 ile birebir). */
function reduce1To9Lines(total: number): { lines: string[]; value: number } {
  const lines: string[] = [];
  let cur = Math.abs(total);
  while (cur > 9) {
    const next = sumDigits(cur);
    lines.push(`${cur} → ${String(cur).split("").join(" + ")} = ${next}`);
    cur = next;
  }
  return { lines, value: cur === 0 ? 9 : cur };
}

/** Ana sayı (11/22, iste 33) korunan sadeleştirme satırları. */
function reduceKeepMasterLines(total: number, masters: number[], tx: ExplainT): { lines: string[]; value: number } {
  const lines: string[] = [];
  let cur = Math.abs(total);
  while (cur > 9) {
    if (masters.includes(cur)) break;
    const next = sumDigits(cur);
    const kept = masters.includes(next) ? tx("masterStops") : "";
    lines.push(`${cur} → ${String(cur).split("").join(" + ")} = ${next}${kept}`);
    cur = next;
  }
  return { lines, value: cur };
}

type LetterVals = { pairs: { ch: string; val: number }[]; values: number[]; total: number };

function letterValues(firstName: string, lastName: string): LetterVals {
  const full = `${firstName || ""} ${lastName || ""}`;
  const pairs: { ch: string; val: number }[] = [];
  const values: number[] = [];
  for (const ch of Array.from(turkishUpper(full))) {
    const val = CHAKRA_LETTER_MAP[ch];
    if (val) {
      pairs.push({ ch, val });
      values.push(val);
    }
  }
  return { pairs, values, total: values.reduce((a, b) => a + b, 0) };
}

function letterLine(lv: LetterVals): string {
  return lv.pairs.map((p) => `${p.ch}=${p.val}`).join("  ");
}

// ─── Kişisel Yıl (nominal / aktif) ────────────────────────────────────────────

/** Kişisel Yıl aritmetiği (gün + ay + verilen takvim yılı → 1–9), nominal/aktif için ortak. */
function personalYearMath(p: BirthDateParts, calendarYear: number, tx: ExplainT) {
  const d = digitSumLine(p.dayText);
  const m = digitSumLine(p.monthText);
  const y = digitSumLine(String(calendarYear));
  const total = d.sum + m.sum + y.sum;
  const red = reduce1To9Lines(total);
  const steps = [
    { title: tx("step", { n: "1", label: tx("l.birthDay") }), lines: [d.line] },
    { title: tx("step", { n: "2", label: tx("l.birthMonth") }), lines: [m.line] },
    { title: tx("step", { n: "3", label: tx("l.calcYear") }), lines: [y.line] },
    { title: tx("step", { n: "4", label: tx("l.total") }), lines: [`${d.sum} + ${m.sum} + ${y.sum} = ${total}`] },
  ];
  return { steps, reduction: red.lines, value: red.value, total };
}

export function nominalPersonalYearExplain(birthDate: string, calendarYear: number, tx: ExplainT = TR_EXPLAIN): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const math = personalYearMath(p, calendarYear, tx);
  return {
    value: math.value,
    explanation: {
      usedInputs: [
        { label: tx("l.birthDay"), value: p.dayText },
        { label: tx("l.birthMonth"), value: monthLabel(tx, p.month, p.monthText) },
        { label: tx("l.calcYear"), value: String(calendarYear) },
      ],
      unusedInputs: [
        {
          label: tx("l.birthYear"),
          value: p.yearText,
          note: tx("nominalPy.unusedNote"),
        },
      ],
      rationale: tx("nominalPy.rationale", { year: s(calendarYear) }),
      steps: math.steps,
      reduction: math.reduction.length ? math.reduction : undefined,
      result: tx("nominalPy.result", { year: s(calendarYear), value: s(math.value) }),
      resultNote: tx("nominalPy.resultNote"),
    },
  };
}

export function activePersonalYearExplain(
  birthDate: string,
  ref: { day: number; month: number; year: number },
  activeCalendarYear: number,
  periodStartText: string,
  periodEndText: string,
  tx: ExplainT = TR_EXPLAIN,
): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const math = personalYearMath(p, activeCalendarYear, tx);
  const refText = `${String(ref.day).padStart(2, "0")}/${String(ref.month).padStart(2, "0")}/${ref.year}`;
  return {
    value: math.value,
    explanation: {
      usedInputs: [
        { label: tx("l.birth"), value: birthDate },
        { label: tx("l.reference"), value: refText },
        { label: tx("l.birthDay"), value: `${p.day} ${p.month >= 1 && p.month <= 12 ? monthName(tx, p.month) : ""}`.trim() },
      ],
      rationale: tx("activePy.rationale", {
        ref: refText,
        start: periodStartText,
        year: s(activeCalendarYear),
        value: s(math.value),
      }),
      steps: math.steps,
      reduction: math.reduction.length ? math.reduction : undefined,
      result: tx("activePy.result", { value: s(math.value) }),
      period: `${periodStartText} – ${periodEndText}`,
    },
  };
}

// ─── Kişisel Ay / Gün (NOMİNAL kişisel yıl temelli) ────────────────────────────

export function personalMonthExplain(
  birthDate: string,
  ref: { month: number; year: number },
  tx: ExplainT = TR_EXPLAIN,
): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const py = nominalPersonalYearExplain(birthDate, ref.year, tx)?.value;
  if (py === undefined) return null;
  const monthRed = reduce1To9Lines(ref.month);
  const monthReduced = monthRed.value;
  const total = py + monthReduced;
  const finalRed = reduce1To9Lines(total);
  return {
    value: finalRed.value,
    explanation: {
      usedInputs: [
        { label: tx("l.nominalPyYear", { year: s(ref.year) }), value: String(py) },
        { label: tx("l.calendarMonth"), value: monthLabel(tx, ref.month, String(ref.month)) },
      ],
      rationale: tx("personalMonth.rationale"),
      steps: [
        { title: tx("step", { n: "1", label: tx("l.nominalPy") }), lines: [tx("forYear", { year: s(ref.year), value: s(py) })] },
        {
          title: tx("step", { n: "2", label: tx("l.calendarMonth") }),
          lines: ref.month > 9 ? [monthRed.lines.join("  ·  "), `= ${monthReduced}`] : [`${ref.month}`],
        },
        { title: tx("step", { n: "3", label: tx("l.total") }), lines: [`${py} + ${monthReduced} = ${total}`] },
      ],
      reduction: finalRed.lines.length ? finalRed.lines : undefined,
      result: tx("result", { label: tx("l.personalMonth"), value: s(finalRed.value) }),
    },
  };
}

export function personalDayExplain(
  birthDate: string,
  ref: { day: number; month: number; year: number },
  tx: ExplainT = TR_EXPLAIN,
): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const pm = personalMonthExplain(birthDate, ref, tx)?.value;
  if (pm === undefined) return null;
  const dayRed = reduce1To9Lines(ref.day);
  const dayReduced = dayRed.value;
  const total = pm + dayReduced;
  const finalRed = reduce1To9Lines(total);
  return {
    value: finalRed.value,
    explanation: {
      usedInputs: [
        { label: tx("l.personalMonth"), value: String(pm) },
        { label: tx("l.selectedDay"), value: String(ref.day) },
      ],
      rationale: tx("personalDay.rationale"),
      steps: [
        { title: tx("step", { n: "1", label: tx("l.personalMonth") }), lines: [String(pm)] },
        {
          title: tx("step", { n: "2", label: tx("l.selectedDay") }),
          lines: ref.day > 9 ? [...dayRed.lines] : [`${ref.day}`],
        },
        { title: tx("step", { n: "3", label: tx("l.total") }), lines: [`${pm} + ${dayReduced} = ${total}`] },
      ],
      reduction: finalRed.lines.length ? finalRed.lines : undefined,
      result: tx("result", { label: tx("l.personalDay"), value: s(finalRed.value) }),
    },
  };
}

// ─── Evrensel Yıl / Ay / Gün ───────────────────────────────────────────────────

export function universalYearExplain(year: number, tx: ExplainT = TR_EXPLAIN): ExplainOut {
  const line = digitSumLine(String(year));
  const red = reduce1To9Lines(line.sum);
  return {
    value: red.value,
    explanation: {
      usedInputs: [{ label: tx("l.selectedYear"), value: String(year) }],
      rationale: tx("universalYear.rationale"),
      steps: [{ title: tx("step", { n: "1", label: tx("l.yearDigits") }), lines: [line.line] }],
      reduction: red.lines.length ? red.lines : undefined,
      result: tx("result", { label: tx("l.universalYear"), value: s(red.value) }),
    },
  };
}

export function universalMonthExplain(year: number, month: number, tx: ExplainT = TR_EXPLAIN): ExplainOut {
  const uy = reduce1To9(sumDigits(year));
  const total = uy + month;
  const red = reduce1To9Lines(total);
  return {
    value: red.value,
    explanation: {
      usedInputs: [
        { label: tx("l.universalYear"), value: `${year} → ${uy}` },
        { label: tx("l.calendarMonth"), value: monthLabel(tx, month, String(month)) },
      ],
      rationale: tx("universalMonth.rationale"),
      steps: [
        { title: tx("step", { n: "1", label: tx("l.universalYear") }), lines: [`${year} → ${uy}`] },
        { title: tx("step", { n: "2", label: tx("l.calendarMonthAdded") }), lines: [`${uy} + ${month} = ${total}`] },
      ],
      reduction: red.lines.length ? red.lines : undefined,
      result: tx("result", { label: tx("l.universalMonth"), value: s(red.value) }),
    },
  };
}

export function universalDayExplain(year: number, month: number, day: number, tx: ExplainT = TR_EXPLAIN): ExplainOut {
  const uy = reduce1To9(sumDigits(year));
  const um = reduce1To9(uy + month);
  const dayRed = reduce1To9Lines(day);
  const dayReduced = dayRed.value;
  const total = um + dayReduced;
  const red = reduce1To9Lines(total);
  return {
    value: red.value,
    explanation: {
      usedInputs: [
        { label: tx("l.universalMonth"), value: String(um) },
        { label: tx("l.selectedDay"), value: String(day) },
      ],
      rationale: tx("universalDay.rationale"),
      steps: [
        { title: tx("step", { n: "1", label: tx("l.universalMonth") }), lines: [String(um)] },
        { title: tx("step", { n: "2", label: tx("l.selectedDay") }), lines: day > 9 ? [...dayRed.lines] : [`${day}`] },
        { title: tx("step", { n: "3", label: tx("l.total") }), lines: [`${um} + ${dayReduced} = ${total}`] },
      ],
      reduction: red.lines.length ? red.lines : undefined,
      result: tx("result", { label: tx("l.universalDay"), value: s(red.value) }),
    },
  };
}

// ─── Güncel Yıl Çakrası ────────────────────────────────────────────────────────

export function yearChakraExplain(birthDate: string, refYear: number, tx: ExplainT = TR_EXPLAIN): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const d = digitSumLine(p.dayText);
  const m = digitSumLine(p.monthText);
  const y = digitSumLine(String(refYear));
  const total = d.sum + m.sum + y.sum;
  const red = reduce1To9Lines(total);
  return {
    value: red.value,
    explanation: {
      usedInputs: [
        { label: tx("l.birthDay"), value: p.dayText },
        { label: tx("l.birthMonth"), value: monthLabel(tx, p.month, p.monthText) },
        { label: tx("l.refYear"), value: String(refYear) },
      ],
      unusedInputs: [
        {
          label: tx("l.birthYear"),
          value: p.yearText,
          note: tx("yearChakra.unusedNote"),
        },
      ],
      rationale: tx("yearChakra.rationale"),
      steps: [
        { title: tx("step", { n: "1", label: tx("l.birthDay") }), lines: [d.line] },
        { title: tx("step", { n: "2", label: tx("l.birthMonth") }), lines: [m.line] },
        { title: tx("step", { n: "3", label: tx("l.refYear") }), lines: [y.line] },
        { title: tx("step", { n: "4", label: tx("l.total") }), lines: [`${d.sum} + ${m.sum} + ${y.sum} = ${total}`] },
      ],
      reduction: red.lines.length ? red.lines : undefined,
      result: tx("result", { label: tx("l.yearChakra"), value: s(red.value) }),
    },
  };
}

// ─── Olgunluk ──────────────────────────────────────────────────────────────────

export function maturityExplain(firstName: string, lastName: string, birthDate: string, tx: ExplainT = TR_EXPLAIN): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const dobTotal = sumDigits(p.day) + sumDigits(p.month) + sumDigits(p.year);
  const dobRed = reduceKeepMasterLines(dobTotal, [11, 22], tx);
  const dobSide = dobRed.value;
  const lv = letterValues(firstName, lastName);
  const nameRed = reduceKeepMasterLines(lv.total, [11, 22], tx);
  const nameSide = nameRed.value;
  const finalTotal = dobSide + nameSide;
  const finalRed = reduceKeepMasterLines(finalTotal, [11, 22], tx);
  return {
    value: finalRed.value,
    explanation: {
      usedInputs: [
        { label: tx("l.dobSide"), value: `${dobTotal} → ${dobSide}` },
        { label: tx("l.nameSide"), value: `${lv.total} → ${nameSide}` },
      ],
      rationale: tx("maturity.rationale"),
      steps: [
        {
          title: tx("step", { n: "1", label: tx("l.dobSide") }),
          lines: [`${sumDigits(p.day)} + ${sumDigits(p.month)} + ${sumDigits(p.year)} = ${dobTotal}`, ...dobRed.lines, `= ${dobSide}`],
        },
        {
          title: tx("step", { n: "2", label: tx("l.nameSide") }),
          lines: [letterLine(lv), tx("totalLine", { total: s(lv.total) }), ...nameRed.lines, `= ${nameSide}`],
        },
        { title: tx("step", { n: "3", label: tx("l.total") }), lines: [`${dobSide} + ${nameSide} = ${finalTotal}`] },
      ],
      reduction: finalRed.lines.length ? finalRed.lines : undefined,
      result: tx("result", { label: tx("l.maturity"), value: s(finalRed.value) }),
    },
  };
}

// ─── Doğum Günü Enerjisi (exact 1–31) / Kişilik Enerjisi ───────────────────────

export function birthDayEnergyExplain(birthDate: string, tx: ExplainT = TR_EXPLAIN): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  return {
    value: p.day,
    explanation: {
      usedInputs: [{ label: tx("l.dayOfBirthMonth"), value: String(p.day) }],
      rationale: tx("birthDayEnergy.rationale", { day: s(p.day) }),
      result: tx("result", { label: tx("l.birthDayEnergy"), value: s(p.day) }),
      resultNote: tx("birthDayEnergy.resultNote"),
    },
  };
}

export function personalityEnergyExplain(birthDate: string, tx: ExplainT = TR_EXPLAIN): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const red = reduce1To9Lines(p.day);
  const value = red.value;
  return {
    value,
    explanation: {
      usedInputs: [{ label: tx("l.birthDay"), value: String(p.day) }],
      rationale: tx("personalityEnergy.rationale", { day: s(p.day), value: s(value) }),
      steps: [{ title: tx("personalityEnergy.stepTitle"), lines: p.day > 9 ? [...red.lines] : [`${p.day}`] }],
      result: tx("result", { label: tx("l.personalityEnergy"), value: s(value) }),
    },
  };
}

// ─── Hayat Dersi ─────────────────────────────────────────────────────────────

export function lifeLessonExplain(birthDate: string, tx: ExplainT = TR_EXPLAIN): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const persRed = reduce1To9Lines(p.day);
  const personality = persRed.value;
  const hyTotal = sumDigits(p.day) + sumDigits(p.month) + sumDigits(p.year);
  const hyRed = reduceKeepMasterLines(hyTotal, [11, 22, 33], tx);
  const hayatYolu = hyRed.value;
  const total = personality + hayatYolu;
  const finalRed = reduceKeepMasterLines(total, [11, 22], tx);
  return {
    value: finalRed.value,
    explanation: {
      usedInputs: [
        { label: tx("l.personalityEnergy"), value: String(personality) },
        { label: tx("l.lifePath"), value: String(hayatYolu) },
      ],
      rationale: tx("lifeLesson.rationale"),
      steps: [
        { title: tx("step", { n: "1", label: tx("l.personalityEnergy") }), lines: p.day > 9 ? [...persRed.lines] : [`${p.day}`] },
        { title: tx("step", { n: "2", label: tx("l.lifePath") }), lines: [`${sumDigits(p.day)} + ${sumDigits(p.month)} + ${sumDigits(p.year)} = ${hyTotal}`, ...hyRed.lines, `= ${hayatYolu}`] },
        { title: tx("step", { n: "3", label: tx("l.total") }), lines: [`${personality} + ${hayatYolu} = ${total}`] },
      ],
      reduction: finalRed.lines.length ? finalRed.lines : undefined,
      result: tx("result", { label: tx("l.lifeLesson"), value: s(finalRed.value) }),
    },
  };
}

// ─── Kader Sayısı ──────────────────────────────────────────────────────────────

export function destinyExplain(firstName: string, lastName: string, tx: ExplainT = TR_EXPLAIN): ExplainOut | null {
  const lv = letterValues(firstName, lastName);
  if (lv.total === 0) return null;
  const finalRed = reduceKeepMasterLines(lv.total, [11, 22], tx);
  return {
    value: finalRed.value,
    explanation: {
      usedInputs: [
        { label: tx("l.nameLetters"), value: `${firstName} ${lastName}`.trim() },
      ],
      rationale: tx("destiny.rationale"),
      steps: [
        { title: tx("step", { n: "1", label: tx("l.letterValues") }), lines: [letterLine(lv)] },
        { title: tx("step", { n: "2", label: tx("l.total") }), lines: [`${lv.values.join(" + ")} = ${lv.total}`] },
      ],
      reduction: finalRed.lines.length ? finalRed.lines : undefined,
      result: tx("result", { label: tx("l.destiny"), value: s(finalRed.value) }),
    },
  };
}

// ─── Evre / Döngü ──────────────────────────────────────────────────────────────

function evreRangeLines(currentEvre: number, tx: ExplainT): string[] {
  const lines: string[] = [];
  for (let i = 1; i <= 9; i++) {
    const start = (i - 1) * 9 + 1;
    const end = i * 9;
    lines.push(`${tx("evre.rangeLine", { start: s(start), end: s(end), i: s(i) })}${i === currentEvre ? tx("evre.youAreHere") : ""}`);
  }
  return lines;
}

export function evreExplain(age: number, evreIndex: number, energy: number, tx: ExplainT = TR_EXPLAIN): ExplainOut {
  return {
    value: evreIndex,
    explanation: {
      usedInputs: [
        { label: tx("l.calcAge"), value: String(age) },
      ],
      rationale: tx("evre.rationale"),
      steps: [
        { title: tx("evre.placementTitle"), lines: evreRangeLines(evreIndex, tx) },
        { title: tx("evre.resultTitle"), lines: [tx("evre.ageToEvre", { age: s(age), i: s(evreIndex) })] },
      ],
      result: tx("evre.result", { i: s(evreIndex), energy: s(energy) }),
      resultNote: tx("evre.resultNote"),
    },
  };
}

export function donguExplain(age: number, donguIndex: number, tx: ExplainT = TR_EXPLAIN): ExplainOut {
  return {
    value: donguIndex,
    explanation: {
      usedInputs: [{ label: tx("l.calcAge"), value: String(age) }],
      rationale: tx("dongu.rationale"),
      steps: [
        { title: tx("dongu.stepTitle"), lines: [tx("dongu.ageToYear", { age: s(age), i: s(donguIndex) })] },
      ],
      result: tx("dongu.result", { i: s(donguIndex) }),
    },
  };
}
