// FAZ 6 / UAT PATCH 2 — ÖĞRETİCİ "Nasıl hesaplandı?" hesap açıklamaları.
//
// Bu saf yardımcı, mevcut canonical engine SONUÇLARININ nasıl oluştuğunu kullanıcı diliyle
// açıklayan yapılandırılmış CalculationExplanation nesneleri üretir. YENİ formül/motor YOK:
//   • Nihai değerler engine reducer'larıyla (reduce1To9 / reduceKeepMaster / reduceKeepMaster11or22
//     / sumNameLetterValues) BİREBİR hesaplanır; adım satırları yalnız sunum içindir.
//   • Developer jargonu (raw/primitive/fallback/activeCalendarYear/trace ...) kullanıcıya BASILMAZ.
//
// Her builder { explanation, value } döndürür (value = engine ile eşitlik testi için).

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

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function parse(birthDate: string): BirthDateParts | null {
  return parseBirthDate((birthDate || "").replace(/\//g, "."));
}

function monthLabel(month: number, monthText: string): string {
  return `${TR_MONTHS[month - 1] ?? "?"} (${monthText})`;
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
function reduceKeepMasterLines(total: number, masters: number[]): { lines: string[]; value: number } {
  const lines: string[] = [];
  let cur = Math.abs(total);
  while (cur > 9) {
    if (masters.includes(cur)) break;
    const next = sumDigits(cur);
    const kept = masters.includes(next) ? " (ana sayı — burada durur)" : "";
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
function personalYearMath(p: BirthDateParts, calendarYear: number) {
  const d = digitSumLine(p.dayText);
  const m = digitSumLine(p.monthText);
  const y = digitSumLine(String(calendarYear));
  const total = d.sum + m.sum + y.sum;
  const red = reduce1To9Lines(total);
  const steps = [
    { title: "Adım 1 — Doğum günü", lines: [d.line] },
    { title: "Adım 2 — Doğum ayı", lines: [m.line] },
    { title: "Adım 3 — Hesaplanan takvim yılı", lines: [y.line] },
    { title: "Adım 4 — Toplam", lines: [`${d.sum} + ${m.sum} + ${y.sum} = ${total}`] },
  ];
  return { steps, reduction: red.lines, value: red.value, total };
}

export function nominalPersonalYearExplain(birthDate: string, calendarYear: number): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const math = personalYearMath(p, calendarYear);
  return {
    value: math.value,
    explanation: {
      usedInputs: [
        { label: "Doğum günü", value: p.dayText },
        { label: "Doğum ayı", value: monthLabel(p.month, p.monthText) },
        { label: "Hesaplanan takvim yılı", value: String(calendarYear) },
      ],
      unusedInputs: [
        {
          label: "Doğum yılı",
          value: p.yearText,
          note: "Kişisel Yıl hesabında doğum yılınız kullanılmaz. Kaynak yönteminde doğduğunuz gün, doğduğunuz ay ve hesaplanan takvim yılı kullanılır.",
        },
      ],
      rationale: `Burada ${calendarYear} kullanılmasının nedeni, ${calendarYear} takvim yılı için kişisel yıl sayısının hesaplanıyor olmasıdır.`,
      steps: math.steps,
      reduction: math.reduction.length ? math.reduction : undefined,
      result: `${calendarYear} Nominal Kişisel Yıl: ${math.value}`,
      resultNote:
        "Bu değer seçilen takvim yılı için hesaplanan kişisel yıl sayısıdır. Referans tarihinde fiilen aktif olan kişisel yıl ayrıca Aktif Kişisel Yıl kartında gösterilir.",
    },
  };
}

export function activePersonalYearExplain(
  birthDate: string,
  ref: { day: number; month: number; year: number },
  activeCalendarYear: number,
  periodStartText: string,
  periodEndText: string,
): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const math = personalYearMath(p, activeCalendarYear);
  const refText = `${String(ref.day).padStart(2, "0")}/${String(ref.month).padStart(2, "0")}/${ref.year}`;
  return {
    value: math.value,
    explanation: {
      usedInputs: [
        { label: "Doğum", value: birthDate },
        { label: "Referans", value: refText },
        { label: "Doğum günü", value: `${p.day} ${TR_MONTHS[p.month - 1] ?? ""}`.trim() },
      ],
      rationale:
        `Kaynak yönteminde yeni Kişisel Yıl, kişinin doğum gününde aktif olur ve bir sonraki doğum gününe kadar devam eder. ` +
        `${refText} tarihi ${periodStartText} tarihinden sonra olduğu için, ${activeCalendarYear} için hesaplanan Kişisel Yıl ${math.value} bu tarihte aktiftir.`,
      steps: math.steps,
      reduction: math.reduction.length ? math.reduction : undefined,
      result: `Referans tarihinde aktif olan Kişisel Yıl: ${math.value}`,
      period: `${periodStartText} – ${periodEndText}`,
    },
  };
}

// ─── Kişisel Ay / Gün (NOMİNAL kişisel yıl temelli) ────────────────────────────

export function personalMonthExplain(
  birthDate: string,
  ref: { month: number; year: number },
): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const py = nominalPersonalYearExplain(birthDate, ref.year)?.value;
  if (py === undefined) return null;
  const monthRed = reduce1To9Lines(ref.month);
  const monthReduced = monthRed.value;
  const total = py + monthReduced;
  const finalRed = reduce1To9Lines(total);
  return {
    value: finalRed.value,
    explanation: {
      usedInputs: [
        { label: `Nominal Kişisel Yıl (${ref.year})`, value: String(py) },
        { label: "Takvim ayı", value: monthLabel(ref.month, String(ref.month)) },
      ],
      rationale:
        "Kişisel Ay hesabında bu kaynak yöntemine göre takvim yılı için hesaplanan Nominal Kişisel Yıl kullanılır (o tarihte aktif olan kişisel yıl değil).",
      steps: [
        { title: "Adım 1 — Nominal Kişisel Yıl", lines: [`${ref.year} için: ${py}`] },
        {
          title: "Adım 2 — Takvim ayı",
          lines: ref.month > 9 ? [monthRed.lines.join("  ·  "), `= ${monthReduced}`] : [`${ref.month}`],
        },
        { title: "Adım 3 — Toplam", lines: [`${py} + ${monthReduced} = ${total}`] },
      ],
      reduction: finalRed.lines.length ? finalRed.lines : undefined,
      result: `Kişisel Ay: ${finalRed.value}`,
    },
  };
}

export function personalDayExplain(
  birthDate: string,
  ref: { day: number; month: number; year: number },
): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const py = nominalPersonalYearExplain(birthDate, ref.year)?.value;
  const pm = personalMonthExplain(birthDate, ref)?.value;
  if (py === undefined || pm === undefined) return null;
  const dayRed = reduce1To9Lines(ref.day);
  const dayReduced = dayRed.value;
  const total = py + pm + dayReduced;
  const finalRed = reduce1To9Lines(total);
  return {
    value: finalRed.value,
    explanation: {
      usedInputs: [
        { label: `Nominal Kişisel Yıl (${ref.year})`, value: String(py) },
        { label: "Kişisel Ay", value: String(pm) },
        { label: "Seçilen gün", value: String(ref.day) },
      ],
      rationale:
        "Kişisel Gün, Nominal Kişisel Yıl + Kişisel Ay + seçilen günün tek haneye indirilmiş değeri toplanarak bulunur. Zincir Nominal Kişisel Yıl üzerine kuruludur (aktif kişisel yıl değil).",
      steps: [
        { title: "Adım 1 — Nominal Kişisel Yıl", lines: [String(py)] },
        { title: "Adım 2 — Kişisel Ay", lines: [String(pm)] },
        {
          title: "Adım 3 — Seçilen gün",
          lines: ref.day > 9 ? [...dayRed.lines] : [`${ref.day}`],
        },
        { title: "Adım 4 — Toplam", lines: [`${py} + ${pm} + ${dayReduced} = ${total}`] },
      ],
      reduction: finalRed.lines.length ? finalRed.lines : undefined,
      result: `Kişisel Gün: ${finalRed.value}`,
    },
  };
}

// ─── Evrensel Yıl / Ay / Gün ───────────────────────────────────────────────────

export function universalYearExplain(year: number): ExplainOut {
  const line = digitSumLine(String(year));
  const red = reduce1To9Lines(line.sum);
  return {
    value: red.value,
    explanation: {
      usedInputs: [{ label: "Seçilen takvim yılı", value: String(year) }],
      rationale: "Evrensel Yıl kişiye özel değildir. Seçilen takvim yılının rakamları toplanıp tek haneye indirilir.",
      steps: [{ title: "Adım 1 — Yılın rakamları", lines: [line.line] }],
      reduction: red.lines.length ? red.lines : undefined,
      result: `Evrensel Yıl: ${red.value}`,
    },
  };
}

export function universalMonthExplain(year: number, month: number): ExplainOut {
  const uy = reduce1To9(sumDigits(year));
  const total = uy + month;
  const red = reduce1To9Lines(total);
  return {
    value: red.value,
    explanation: {
      usedInputs: [
        { label: "Evrensel Yıl", value: `${year} → ${uy}` },
        { label: "Takvim ayı", value: monthLabel(month, String(month)) },
      ],
      rationale: "Önce yılın Evrensel Yıl değeri bulunur, sonra seçilen ayın numarası eklenir ve tek haneye indirilir. Kişiye özel değildir.",
      steps: [
        { title: "Adım 1 — Evrensel Yıl", lines: [`${year} → ${uy}`] },
        { title: "Adım 2 — Takvim ayı eklenir", lines: [`${uy} + ${month} = ${total}`] },
      ],
      reduction: red.lines.length ? red.lines : undefined,
      result: `Evrensel Ay: ${red.value}`,
    },
  };
}

export function universalDayExplain(year: number, month: number, day: number): ExplainOut {
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
        { label: "Evrensel Ay", value: String(um) },
        { label: "Seçilen gün", value: String(day) },
      ],
      rationale: "Önce ayın Evrensel Ay değeri bulunur, sonra seçilen günün tek haneye indirilmiş değeri eklenir. Kişiye özel değildir.",
      steps: [
        { title: "Adım 1 — Evrensel Ay", lines: [String(um)] },
        { title: "Adım 2 — Seçilen gün", lines: day > 9 ? [...dayRed.lines] : [`${day}`] },
        { title: "Adım 3 — Toplam", lines: [`${um} + ${dayReduced} = ${total}`] },
      ],
      reduction: red.lines.length ? red.lines : undefined,
      result: `Evrensel Gün: ${red.value}`,
    },
  };
}

// ─── Güncel Yıl Çakrası ────────────────────────────────────────────────────────

export function yearChakraExplain(birthDate: string, refYear: number): ExplainOut | null {
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
        { label: "Doğum günü", value: p.dayText },
        { label: "Doğum ayı", value: monthLabel(p.month, p.monthText) },
        { label: "Referans yıl", value: String(refYear) },
      ],
      unusedInputs: [
        {
          label: "Doğum yılı",
          value: p.yearText,
          note: "Güncel Yıl Çakrası hesabında doğum yılınız kullanılmaz; doğum günü, doğum ayı ve referans yıl kullanılır.",
        },
      ],
      rationale:
        "Bu hesap seçilen referans yılın çakra etkisini gösterir. Kişisel Yıl ile matematiksel olarak aynı sayıya ulaşabilir; ancak kavramsal kimliği farklıdır (Yıl Çakrası, Kişisel Yıl ile aynı hesap değildir).",
      steps: [
        { title: "Adım 1 — Doğum günü", lines: [d.line] },
        { title: "Adım 2 — Doğum ayı", lines: [m.line] },
        { title: "Adım 3 — Referans yıl", lines: [y.line] },
        { title: "Adım 4 — Toplam", lines: [`${d.sum} + ${m.sum} + ${y.sum} = ${total}`] },
      ],
      reduction: red.lines.length ? red.lines : undefined,
      result: `Güncel Yıl Çakrası: ${red.value}`,
    },
  };
}

// ─── Olgunluk ──────────────────────────────────────────────────────────────────

export function maturityExplain(firstName: string, lastName: string, birthDate: string): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const dobTotal = sumDigits(p.day) + sumDigits(p.month) + sumDigits(p.year);
  const dobRed = reduceKeepMasterLines(dobTotal, [11, 22]);
  const dobSide = dobRed.value;
  const lv = letterValues(firstName, lastName);
  const nameRed = reduceKeepMasterLines(lv.total, [11, 22]);
  const nameSide = nameRed.value;
  const finalTotal = dobSide + nameSide;
  const finalRed = reduceKeepMasterLines(finalTotal, [11, 22]);
  return {
    value: finalRed.value,
    explanation: {
      usedInputs: [
        { label: "Doğum tarihi tarafı", value: `${dobTotal} → ${dobSide}` },
        { label: "Ad + soyad tarafı", value: `${lv.total} → ${nameSide}` },
      ],
      rationale:
        "Olgunluk, doğum tarihi tarafı ile ad-soyad tarafının birlikte değerlendirilmesinden elde edilir. Bu hesapta yalnız 11 ve 22 ana sayı olarak korunur.",
      steps: [
        {
          title: "Adım 1 — Doğum tarihi tarafı",
          lines: [`${sumDigits(p.day)} + ${sumDigits(p.month)} + ${sumDigits(p.year)} = ${dobTotal}`, ...dobRed.lines, `= ${dobSide}`],
        },
        {
          title: "Adım 2 — Ad + soyad tarafı",
          lines: [letterLine(lv), `Toplam: ${lv.total}`, ...nameRed.lines, `= ${nameSide}`],
        },
        { title: "Adım 3 — Toplam", lines: [`${dobSide} + ${nameSide} = ${finalTotal}`] },
      ],
      reduction: finalRed.lines.length ? finalRed.lines : undefined,
      result: `Olgunluk: ${finalRed.value}`,
    },
  };
}

// ─── Doğum Günü Enerjisi (exact 1–31) / Kişilik Enerjisi ───────────────────────

export function birthDayEnergyExplain(birthDate: string): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  return {
    value: p.day,
    explanation: {
      usedInputs: [{ label: "Doğduğunuz ayın günü", value: String(p.day) }],
      rationale:
        `Bu hesap doğduğunuz ayın gününü aynen kullanır ve sadeleştirme yapılmaz. Örneğin ${p.day} doğum günü, Doğum Günü Enerjisi ${p.day} olarak değerlendirilir.`,
      result: `Doğum Günü Enerjisi: ${p.day}`,
      resultNote: "Bu, tek haneye indirilen Kişilik Enerjisi ile karıştırılmamalıdır.",
    },
  };
}

export function personalityEnergyExplain(birthDate: string): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const red = reduce1To9Lines(p.day);
  const value = red.value;
  return {
    value,
    explanation: {
      usedInputs: [{ label: "Doğum günü", value: String(p.day) }],
      rationale:
        `Kişilik Enerjisi, doğum gününüzün tek haneye sadeleştirilmiş halidir. Bu nedenle Doğum Günü Enerjisi ${p.day} iken Kişilik Enerjisi ${value} olabilir.`,
      steps: [{ title: "Doğum gününün sadeleştirilmesi", lines: p.day > 9 ? [...red.lines] : [`${p.day}`] }],
      result: `Kişilik Enerjisi: ${value}`,
    },
  };
}

// ─── Hayat Dersi ─────────────────────────────────────────────────────────────

export function lifeLessonExplain(birthDate: string): ExplainOut | null {
  const p = parse(birthDate);
  if (!p) return null;
  const persRed = reduce1To9Lines(p.day);
  const personality = persRed.value;
  const hyTotal = sumDigits(p.day) + sumDigits(p.month) + sumDigits(p.year);
  const hyRed = reduceKeepMasterLines(hyTotal, [11, 22, 33]);
  const hayatYolu = hyRed.value;
  const total = personality + hayatYolu;
  const finalRed = reduceKeepMasterLines(total, [11, 22]);
  return {
    value: finalRed.value,
    explanation: {
      usedInputs: [
        { label: "Kişilik Enerjisi", value: String(personality) },
        { label: "Hayat Yolu", value: String(hayatYolu) },
      ],
      rationale:
        "Hayat Dersi, Kişilik Enerjisi ile Hayat Yolu tarafının birlikte değerlendirilmesinden elde edilir. Bu hesap, PIN kodundaki 5. hane 'Yaşam Dersi' ile aynı hesap değildir.",
      steps: [
        { title: "Adım 1 — Kişilik Enerjisi", lines: p.day > 9 ? [...persRed.lines] : [`${p.day}`] },
        { title: "Adım 2 — Hayat Yolu", lines: [`${sumDigits(p.day)} + ${sumDigits(p.month)} + ${sumDigits(p.year)} = ${hyTotal}`, ...hyRed.lines, `= ${hayatYolu}`] },
        { title: "Adım 3 — Toplam", lines: [`${personality} + ${hayatYolu} = ${total}`] },
      ],
      reduction: finalRed.lines.length ? finalRed.lines : undefined,
      result: `Hayat Dersi: ${finalRed.value}`,
    },
  };
}

// ─── Kader Sayısı ──────────────────────────────────────────────────────────────

export function destinyExplain(firstName: string, lastName: string): ExplainOut | null {
  const lv = letterValues(firstName, lastName);
  if (lv.total === 0) return null;
  const finalRed = reduceKeepMasterLines(lv.total, [11, 22]);
  return {
    value: finalRed.value,
    explanation: {
      usedInputs: [
        { label: "Ad + soyad harfleri", value: `${firstName} ${lastName}`.trim() },
      ],
      rationale:
        "Kader Sayısı, ad ve soyadınızdaki bütün harflerin sayısal değerlerinden elde edilir. Bu hesapta 11 ve 22 ana sayı olarak korunur.",
      steps: [
        { title: "Adım 1 — Harf değerleri", lines: [letterLine(lv)] },
        { title: "Adım 2 — Toplam", lines: [`${lv.values.join(" + ")} = ${lv.total}`] },
      ],
      reduction: finalRed.lines.length ? finalRed.lines : undefined,
      result: `Kader Sayısı: ${finalRed.value}`,
    },
  };
}

// ─── Evre / Döngü ──────────────────────────────────────────────────────────────

function evreRangeLines(currentEvre: number): string[] {
  const lines: string[] = [];
  for (let i = 1; i <= 9; i++) {
    const start = (i - 1) * 9 + 1;
    const end = i * 9;
    lines.push(`${start}–${end} yaş → ${i}. Evre${i === currentEvre ? "   ← siz buradasınız" : ""}`);
  }
  return lines;
}

export function evreExplain(age: number, evreIndex: number, energy: number): ExplainOut {
  return {
    value: evreIndex,
    explanation: {
      usedInputs: [
        { label: "Hesaplanan yaş", value: String(age) },
      ],
      rationale:
        "Kaynak yöntemi yaşamı dokuz yıllık Evrelere ayırır. Bulunduğunuz Evre, referans tarihteki yaşınıza göre belirlenir; Evre enerjisi PIN kodunuzdan gelir.",
      steps: [
        { title: "Yaşın Evreye yerleşimi", lines: evreRangeLines(evreIndex) },
        { title: "Sonuç yerleşimi", lines: [`Yaş ${age} → ${evreIndex}. Evre`] },
      ],
      result: `${evreIndex}. Evre · Enerji ${energy}`,
      resultNote: "Enerji değeri, bu Evreye karşılık gelen PIN hanesinden gelir.",
    },
  };
}

export function donguExplain(age: number, donguIndex: number): ExplainOut {
  return {
    value: donguIndex,
    explanation: {
      usedInputs: [{ label: "Hesaplanan yaş", value: String(age) }],
      rationale:
        "Döngü, içinde bulunduğunuz dokuz yıllık Evrenin kaçıncı yılında olduğunuzu gösterir. Evre ile aynı şey değildir.",
      steps: [
        { title: "Evre içi yıl", lines: [`Yaş ${age} → Evrenin ${donguIndex}. yılı`] },
      ],
      result: `Döngü ${donguIndex}`,
    },
  };
}
