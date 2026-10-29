/**
 * Bağımsız Pisagor (Batı, Hans Decoz uzlaşımı) hesaplayıcısı — saf, bağımlılıksız, istemci-güvenli.
 * Sağlayıcı çıktısı KOPYALANMAZ; belgelenmiş algoritma uygulanır ve canlı yanıtla karşılaştırılır.
 *
 * Belgelenmiş kurallar:
 *   • Harf tablosu A=1..I=9, J=1..R=9, S=1..Z=8.
 *   • Sesli: yalnız A E I O U (Y ve W sessiz).
 *   • Ad sayıları kelime kelime indirgenir; her kelime ve son toplam 11/22/33'te durur.
 *   • Karmik borç (13/14/16/19): yalnız SON toplamın indirgeme yolunda aranır (kelime ara toplamları borç saymaz).
 *   • Yaşam Yolu: ay, gün, yıl ayrı ayrı indirgenir (usta korunur), sonra toplanıp indirgenir.
 */
import { foldName, isVowel, type FoldedName, type NameWord } from "./text";
import { karmicOnPath, MASTER_NUMBERS, numberType, pathText, reduceKeep, reducePath, reduceSingle } from "./reduce";

export const pythagoreanLetterValue = (L: string): number => ((L.charCodeAt(0) - 65) % 9) + 1;

export type OracleNumber = {
  value: number;
  type: "single" | "master";
  /** Son toplamın indirgeme yolunda karşılaşılan karmik borç sayısı (13/14/16/19) veya null. */
  karmicDebt: number | null;
  /** Son toplamdan sonuca indirgeme yolu. */
  path: number[];
  /** İnsan okunur adım izi. */
  trace: string;
  /** Harf temelli sayılarda sayılan harfler (sıra korunur). */
  letters?: Array<{ letter: string; value: number }>;
};

export type OracleError = { error: string };
export const isOracleError = (x: unknown): x is OracleError => !!x && typeof x === "object" && "error" in x;

function finish(total: number, prefix: string, letters?: OracleNumber["letters"]): OracleNumber {
  const path = reducePath(total);
  const value = path.at(-1)!;
  return {
    value,
    type: numberType(value),
    karmicDebt: karmicOnPath(path),
    path,
    trace: `${prefix}${pathText(path)}`,
    ...(letters ? { letters } : {}),
  };
}

type Filter = (L: string) => boolean;

/** Kelime kelime harf toplamı (Decoz): her kelime usta korunarak indirgenir, sonra toplanır. */
function nameNumber(name: FoldedName | string, filter: Filter, label?: string): OracleNumber | OracleError {
  const folded = typeof name === "string" ? foldName(name) : name;
  const parts: string[] = [];
  const wordValues: number[] = [];
  const letters: Array<{ letter: string; value: number }> = [];
  for (const w of folded.words) {
    const ls = w.letters.filter(filter);
    if (!ls.length) continue;
    const vals = ls.map((L) => ({ letter: L, value: pythagoreanLetterValue(L) }));
    letters.push(...vals);
    const sum = vals.reduce((a, b) => a + b.value, 0);
    const p = reducePath(sum);
    wordValues.push(p.at(-1)!);
    parts.push(`${w.display}: ${vals.map((v) => `${v.letter}=${v.value}`).join(", ")} = ${pathText(p)}`);
  }
  if (!wordValues.length) return { error: "no_letters" };
  const total = wordValues.reduce((a, b) => a + b, 0);
  const prefix = `${label ? `${label}: ` : ""}${parts.join("; ")} → ${wordValues.join("+")} = `;
  return finish(total, prefix, letters);
}

export const expression = (fullName: string) => nameNumber(fullName, () => true);
export const soulUrge = (fullName: string) => nameNumber(fullName, isVowel, "Vowels");
export const personality = (fullName: string) => nameNumber(fullName, (L) => !isVowel(L), "Consonants");

export type DateParts = { year: number; month: number; day: number };

export function isValidDate({ year, month, day }: DateParts): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= dim;
}

export type LifePathResult = OracleNumber & { components: { month: number[]; day: number[]; year: number[] } };

export function lifePath(d: DateParts): LifePathResult {
  const m = reducePath(d.month);
  const dd = reducePath(d.day);
  const y = reducePath(digitSumOnce(d.year));
  const yPath = [d.year, ...y];
  const a = m.at(-1)!;
  const b = dd.at(-1)!;
  const c = y.at(-1)!;
  const r = finish(a + b + c, `Month: ${pathText(m)}, Day: ${pathText(dd)}, Year: ${pathText(yPath)} → ${a}+${b}+${c} = `);
  return { ...r, components: { month: m, day: dd, year: yPath } };
}

function digitSumOnce(n: number): number {
  let s = 0;
  for (const c of String(n)) s += Number(c);
  return s;
}

/** Doğum günü: 11 ve 22 korunur, 29 → 11; diğer iki haneli günler tek haneye; 13/14/16/19 karmik. */
export function birthDay(day: number): OracleNumber {
  return finish(day, "");
}

/** Olgunluk = Yaşam Yolu + İfade (usta tam değerle), usta korunarak indirgenir. */
export function maturity(lp: number, expr: number): OracleNumber {
  const r = finish(lp + expr, `Life Path ${lp} + Expression ${expr} = `);
  return r;
}

/** Kişisel Yıl: doğum ayı + günü + hedef yıl, tek haneye (1–9). */
export function personalYear(month: number, day: number, year: number): OracleNumber {
  const a = reduceSingle(month);
  const b = reduceSingle(day);
  const c = reduceSingle(year);
  const path = reducePath(a + b + c, []);
  return { value: path.at(-1)!, type: "single", karmicDebt: null, path, trace: `${a}+${b}+${c} = ${pathText(path)}` };
}

export function personalMonth(py: number, calendarMonth: number): OracleNumber {
  const path = reducePath(py + calendarMonth, []);
  return { value: path.at(-1)!, type: "single", karmicDebt: null, path, trace: `PY ${py} + ${calendarMonth} = ${pathText(path)}` };
}

export function personalDay(pm: number, calendarDay: number): OracleNumber {
  const path = reducePath(pm + calendarDay, []);
  return { value: path.at(-1)!, type: "single", karmicDebt: null, path, trace: `PM ${pm} + ${calendarDay} = ${pathText(path)}` };
}

export type Period = { position: number; number: number; startAge: number; endAge: number | null; trace: string };

/** İlk zirve bitişi = 36 − (Yaşam Yolu tek haneye). Sonraki dönemler 9'ar yıl. */
export function firstPeriodEnd(lp: number): number {
  return 36 - reduceSingle(lp);
}

/** Zirveler: bileşenler (ay, gün, yıl) usta korunarak indirgenir; zirve toplamları usta korunarak indirgenir. */
export function pinnacles(d: DateParts, lp: number): Period[] {
  const m = reduceKeep(d.month);
  const dd = reduceKeep(d.day);
  const y = reduceKeep(digitSumOnce(d.year));
  const e1 = firstPeriodEnd(lp);
  const p1 = reducePath(m + dd);
  const p2 = reducePath(dd + y);
  const p3 = reducePath(p1.at(-1)! + p2.at(-1)!);
  const p4 = reducePath(m + y);
  return [
    { position: 1, number: p1.at(-1)!, startAge: 0, endAge: e1, trace: `${m}+${dd} = ${pathText(p1)}` },
    { position: 2, number: p2.at(-1)!, startAge: e1 + 1, endAge: e1 + 9, trace: `${dd}+${y} = ${pathText(p2)}` },
    { position: 3, number: p3.at(-1)!, startAge: e1 + 10, endAge: e1 + 18, trace: `P1+P2 = ${pathText(p3)}` },
    { position: 4, number: p4.at(-1)!, startAge: e1 + 19, endAge: null, trace: `${m}+${y} = ${pathText(p4)}` },
  ];
}

/**
 * Zorluklar: bileşenler tek haneye indirgenir, mutlak farklar.
 * Sağlayıcının belgelediği/gözlenen uzlaşım: 3. (ana) zorluk ömür boyu (0 → null); 4. zorluk 4. zirveyle başlar.
 */
export function challenges(d: DateParts, lp: number): Period[] {
  const m = reduceSingle(d.month);
  const dd = reduceSingle(d.day);
  const y = reduceSingle(d.year);
  const e1 = firstPeriodEnd(lp);
  const c1 = Math.abs(m - dd);
  const c2 = Math.abs(dd - y);
  const c3 = Math.abs(c1 - c2);
  const c4 = Math.abs(m - y);
  return [
    { position: 1, number: c1, startAge: 0, endAge: e1, trace: `|${m}-${dd}| = ${c1}` },
    { position: 2, number: c2, startAge: e1 + 1, endAge: e1 + 9, trace: `|${dd}-${y}| = ${c2}` },
    { position: 3, number: c3, startAge: 0, endAge: null, trace: `|${c1}-${c2}| = ${c3}` },
    { position: 4, number: c4, startAge: e1 + 19, endAge: null, trace: `|${m}-${y}| = ${c4}` },
  ];
}

export type LetterCounts = Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, number>;

export function letterCounts(fullName: string): LetterCounts {
  const c: LetterCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  for (const L of foldName(fullName).letters) c[pythagoreanLetterValue(L) as keyof LetterCounts]++;
  return c;
}

export function karmicLessons(fullName: string): { missingNumbers: number[]; presentNumbers: LetterCounts } {
  const presentNumbers = letterCounts(fullName);
  const missingNumbers = (Object.keys(presentNumbers) as unknown as Array<keyof LetterCounts>)
    .map(Number)
    .filter((k) => presentNumbers[k as keyof LetterCounts] === 0);
  return { missingNumbers, presentNumbers };
}

/** Gizli Tutku: en sık tekrar eden rakam(lar); eşitlikte tümü (küçükten büyüğe). */
export function hiddenPassion(fullName: string): { number: number; count: number; allPassions: number[] } {
  const c = letterCounts(fullName);
  const max = Math.max(...Object.values(c));
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((k) => c[k as keyof LetterCounts] === max);
  return { number: all[0], count: max, allPassions: all };
}

/** Bilinçaltı Benlik = 9 − eksik rakam sayısı. */
export function subconsciousSelf(fullName: string): { number: number; uniqueNumbers: number[] } {
  const c = letterCounts(fullName);
  const uniq = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((k) => c[k as keyof LetterCounts] > 0);
  return { number: uniq.length, uniqueNumbers: uniq };
}

/** Köşe taşı = ilk adın ilk harfi; Tepe taşı = ilk adın son harfi; İlk sesli = ilk adın ilk sesli harfi. */
export function nameLetters(fullName: string): {
  cornerstone: { letter: string; number: number } | null;
  capstone: { letter: string; number: number } | null;
  firstVowel: { letter: string; number: number } | null;
} {
  const first: NameWord | undefined = foldName(fullName).words[0];
  if (!first) return { cornerstone: null, capstone: null, firstVowel: null };
  const L0 = first.letters[0];
  const Ln = first.letters[first.letters.length - 1];
  const v = first.letters.find(isVowel);
  return {
    cornerstone: { letter: L0, number: pythagoreanLetterValue(L0) },
    capstone: { letter: Ln, number: pythagoreanLetterValue(Ln) },
    firstVowel: v ? { letter: v, number: pythagoreanLetterValue(v) } : null,
  };
}

/** Köprü = iki çekirdek sayının (tek haneye indirgenmiş) farkı, 0–8. */
export function bridge(a: number, b: number): number {
  return Math.abs(reduceSingle(a) - reduceSingle(b));
}

export function bridges(core: { lifePath: number; expression: number; soulUrge: number; personality: number }) {
  return {
    lifePathExpression: bridge(core.lifePath, core.expression),
    expressionSoulUrge: bridge(core.expression, core.soulUrge),
    soulUrgePersonality: bridge(core.soulUrge, core.personality),
    expressionPersonality: bridge(core.expression, core.personality),
  };
}

/** Yaş (hedef tarihte tamamlanan yıl). */
export function ageOn(birth: DateParts, target: DateParts): number {
  let age = target.year - birth.year;
  if (target.month < birth.month || (target.month === birth.month && target.day < birth.day)) age--;
  return age;
}

export function parseIsoDate(s: string): DateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export type FullChartOracle = {
  lifePath: LifePathResult;
  expression: OracleNumber | OracleError;
  soulUrge: OracleNumber | OracleError;
  personality: OracleNumber | OracleError;
  birthDay: OracleNumber;
  maturity: OracleNumber | null;
  karmicLessons: ReturnType<typeof karmicLessons>;
  karmicDebtNumbers: number[];
  pinnacles: Period[];
  challenges: Period[];
  hiddenPassion: ReturnType<typeof hiddenPassion>;
  subconsciousSelf: ReturnType<typeof subconsciousSelf>;
  nameLetters: ReturnType<typeof nameLetters>;
  personalYear: OracleNumber | null;
  personalMonth: OracleNumber | null;
  currentAge: number | null;
};

/** Karmik borç: beş konumda (LP, İfade, Ruh, Kişilik, Doğum Günü) tekil, ilk görülme sırasıyla. */
export function karmicDebtAcross(parts: Array<OracleNumber | OracleError | null>): number[] {
  const out: number[] = [];
  for (const p of parts) {
    if (!p || isOracleError(p) || p.karmicDebt === null) continue;
    if (!out.includes(p.karmicDebt)) out.push(p.karmicDebt);
  }
  return out;
}

export function fullChart(input: { fullName: string; year: number; month: number; day: number; targetDate?: string; currentYear?: number }): FullChartOracle {
  const d = { year: input.year, month: input.month, day: input.day };
  const lp = lifePath(d);
  const ex = expression(input.fullName);
  const su = soulUrge(input.fullName);
  const pe = personality(input.fullName);
  const bd = birthDay(input.day);
  const mat = isOracleError(ex) ? null : maturity(lp.value, ex.value);
  const target = input.targetDate ? parseIsoDate(input.targetDate) : null;
  const pyYear = input.currentYear ?? target?.year ?? null;
  const py = pyYear !== null ? personalYear(input.month, input.day, pyYear) : null;
  const pm = py && target ? personalMonth(py.value, target.month) : null;
  // Not: currentYear verilirse PY o yıla göre; iç içe kişisel ay ise targetDate yılına göre okunur (belge).
  const pmForTarget = target ? personalMonth(personalYear(input.month, input.day, target.year).value, target.month) : pm;
  return {
    lifePath: lp,
    expression: ex,
    soulUrge: su,
    personality: pe,
    birthDay: bd,
    maturity: mat,
    karmicLessons: karmicLessons(input.fullName),
    karmicDebtNumbers: karmicDebtAcross([lp, ex, su, pe, bd]),
    pinnacles: pinnacles(d, lp.value),
    challenges: challenges(d, lp.value),
    hiddenPassion: hiddenPassion(input.fullName),
    subconsciousSelf: subconsciousSelf(input.fullName),
    nameLetters: nameLetters(input.fullName),
    personalYear: py,
    personalMonth: pmForTarget,
    currentAge: target ? ageOn(d, target) : null,
  };
}

export { MASTER_NUMBERS };
