/**
 * Normalize sonuçlara bağımsız oracle doğrulama durumu ekler (saf). Girdi nesneleri değiştirilmez.
 * Oracle girdiyi kendisi hesaplar; sağlayıcı değeri yalnız KARŞILAŞTIRILIR.
 */
import type { ClassicEndpointId } from "../endpoints";
import type {
  BridgeResult,
  BusinessNameResult,
  ChaldeanPart,
  ChaldeanResult,
  ChartResult,
  ClassicNumber,
  CompatibilityResult,
  CompoundNumberResult,
  CoreNumberResult,
  DailyResult,
  DualResult,
  KarmicDebtResult,
  KarmicLessonsResult,
  MeaningsResult,
  PersonalDayResult,
  PersonalMonthResult,
  PersonalYearResult,
  Verification,
} from "../model";
import * as P from "../oracle/pythagorean";
import * as C from "../oracle/chaldean";
import { foldName } from "../oracle/text";
import { numberType, reduceSingle } from "../oracle/reduce";

type Input = Record<string, unknown>;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const M = (oracleValue: Verification["oracleValue"]): Verification => ({ status: "match", oracleValue });
const X = (oracleValue: Verification["oracleValue"], note: string): Verification => ({ status: "mismatch", oracleValue, note });
const U = (note: string): Verification => ({ status: "unverified", note });

function cmp(actual: unknown, expected: unknown, label: string): Verification {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  return a === e ? M(expected as Verification["oracleValue"]) : X(expected as Verification["oracleValue"], `${label}: sağlayıcı=${a} oracle=${e}`);
}

/** Birden çok karşılaştırmayı tek doğrulamada birleştirir (biri uyuşmazsa mismatch). */
function all(primary: Verification["oracleValue"], checks: Verification[]): Verification {
  const bad = checks.filter((c) => c.status === "mismatch");
  if (bad.length) return { status: "mismatch", oracleValue: primary, note: bad.map((b) => b.note).join("; ") };
  if (checks.some((c) => c.status === "unverified")) return { status: "unverified", oracleValue: primary, note: checks.find((c) => c.status === "unverified")!.note };
  return M(primary);
}

const nameOf = (i: Input): string | null => (typeof i.fullName === "string" ? i.fullName : typeof i.name === "string" ? i.name : null);
const dateOf = (i: Input): P.DateParts | null =>
  typeof i.year === "number" && typeof i.month === "number" && typeof i.day === "number" ? { year: i.year, month: i.month, day: i.day } : null;

/** Oracle'ın tüm harfleri tanıyıp tanımadığı (Latin/Kiril dışı → doğrulanamaz). */
function nameSupported(n: string): boolean {
  return foldName(n).dropped.length === 0;
}

function verifyPyNumber(n: ClassicNumber, o: P.OracleNumber | P.OracleError | null, label: string): ClassicNumber {
  const out = clone(n);
  if (!o || P.isOracleError(o)) {
    out.verification = U(`${label}: oracle hesaplayamadı`);
    return out;
  }
  out.verification = all(o.value, [cmp(n.value, o.value, `${label}.value`), cmp(n.type, o.type, `${label}.type`), cmp(n.karmicDebt, o.karmicDebt, `${label}.karmicDebt`)]);
  return out;
}

function verifyChaldeanPart(part: ChaldeanPart, o: C.ChaldeanNumber | P.OracleError, label: string): ChaldeanPart {
  const out = clone(part);
  if (P.isOracleError(o)) {
    out.verification = U(`${label}: oracle hesaplayamadı`);
    return out;
  }
  out.verification = all(o.root, [
    cmp(part.total, o.total, `${label}.total`),
    cmp(part.compound, o.compound, `${label}.compound`),
    cmp(part.root, o.root, `${label}.root`),
    ...(part.compoundMeaning && part.compound !== null ? [cmp(part.compoundMeaning.number, part.compound, `${label}.compoundMeaning.number`)] : []),
  ]);
  return out;
}

function core(id: ClassicEndpointId, i: Input, n: CoreNumberResult): CoreNumberResult {
  const out = clone(n);
  const name = nameOf(i);
  const d = dateOf(i);
  let o: P.OracleNumber | P.OracleError | null = null;
  if (id === "life_path" && d) o = P.lifePath(d);
  else if (id === "birth_day" && typeof i.day === "number") o = P.birthDay(i.day);
  else if (name && nameSupported(name)) {
    if (id === "expression") o = P.expression(name);
    if (id === "soul_urge") o = P.soulUrge(name);
    if (id === "personality") o = P.personality(name);
  }
  if (id === "maturity") {
    const lp = typeof i.lifePath === "number" ? i.lifePath : d ? P.lifePath(d).value : null;
    let ex: number | null = typeof i.expression === "number" ? i.expression : null;
    if (ex === null && name && nameSupported(name)) {
      const e = P.expression(name);
      ex = P.isOracleError(e) ? null : e.value;
    }
    o = lp !== null && ex !== null ? P.maturity(lp, ex) : null;
  }
  out.number = verifyPyNumber(n.number, o, id);
  if (out.number.verification.status !== "mismatch" && n.karmicDebtMeaning && n.karmicDebtMeaning.number !== n.number.karmicDebt) {
    out.number.verification = X(n.number.karmicDebt ?? -1, `karmicDebtMeaning.number ${n.karmicDebtMeaning.number} ≠ karmicDebt ${n.number.karmicDebt}`);
  }
  return out;
}

function lessons(i: Input, r: KarmicLessonsResult): KarmicLessonsResult {
  const out = clone(r);
  const name = nameOf(i);
  if (!name || !nameSupported(name)) {
    out.verification = U("ad oracle kapsamı dışında");
    return out;
  }
  const o = P.karmicLessons(name);
  const present: Record<string, number> = {};
  for (const k of Object.keys(o.presentNumbers)) present[k] = o.presentNumbers[Number(k) as keyof P.LetterCounts];
  out.verification = all(o.missingNumbers, [
    cmp(r.missingNumbers, o.missingNumbers, "missingNumbers"),
    cmp(r.presentNumbers, present, "presentNumbers"),
    cmp(r.lessons.map((l) => l.number), o.missingNumbers, "lessons.number"),
  ]);
  return out;
}

function debt(i: Input, r: KarmicDebtResult): KarmicDebtResult {
  const out = clone(r);
  const name = nameOf(i);
  const d = dateOf(i);
  if (name && !nameSupported(name)) {
    out.verification = U("ad oracle kapsamı dışında");
    return out;
  }
  const parts: Array<P.OracleNumber | P.OracleError | null> = [];
  if (d) parts.push(P.lifePath(d));
  if (name) parts.push(P.expression(name), P.soulUrge(name), P.personality(name));
  if (typeof i.day === "number") parts.push(P.birthDay(i.day));
  const exp = P.karmicDebtAcross(parts);
  out.verification = all(exp, [
    cmp([...r.debtNumbers].sort(), [...exp].sort(), "debtNumbers"),
    cmp(r.hasKarmicDebt, exp.length > 0, "hasKarmicDebt"),
    cmp(r.meanings.map((m) => m.number).sort(), [...exp].sort(), "meanings.number"),
  ]);
  return out;
}

function chart(i: Input, r: ChartResult): ChartResult {
  const out = clone(r);
  const name = nameOf(i);
  const d = dateOf(i);
  if (!name || !d) return out;
  if (!nameSupported(name)) return out;
  const target = typeof i.targetDate === "string" ? i.targetDate : undefined;
  const o = P.fullChart({ fullName: name, ...d, targetDate: target, currentYear: typeof i.currentYear === "number" ? i.currentYear : undefined });
  out.core.lifePath = verifyPyNumber(r.core.lifePath, o.lifePath, "lifePath");
  out.core.expression = verifyPyNumber(r.core.expression, o.expression, "expression");
  out.core.soulUrge = verifyPyNumber(r.core.soulUrge, o.soulUrge, "soulUrge");
  out.core.personality = verifyPyNumber(r.core.personality, o.personality, "personality");
  out.core.birthDay = verifyPyNumber(r.core.birthDay, o.birthDay, "birthDay");
  out.core.maturity = verifyPyNumber(r.core.maturity, o.maturity, "maturity");
  out.karmicLessons = lessons(i, r.karmicLessons);
  out.karmicDebt = debt({ fullName: name, ...d }, r.karmicDebt);
  if (o.personalYear) out.personalYear.verification = cmp(r.personalYear.personalYear, o.personalYear.value, "personalYear");
  else out.personalYear.verification = U("hedef tarih yok (sağlayıcı bugünü kullanır)");
  if (o.personalMonth) out.personalYear.personalMonth.verification = cmp(r.personalYear.personalMonth.personalMonth, o.personalMonth.value, "personalMonth");
  else out.personalYear.personalMonth.verification = U("hedef tarih yok");
  out.pinnacles = r.pinnacles.map((p, k) => {
    const e = o.pinnacles[k];
    return { ...clone(p), verification: e ? all(e.number, [cmp(p.number, e.number, `pinnacle${k + 1}.number`), cmp([p.startAge, p.endAge], [e.startAge, e.endAge], `pinnacle${k + 1}.ages`)]) : U("fazla zirve") };
  });
  out.challenges = r.challenges.map((p, k) => {
    const e = o.challenges[k];
    return { ...clone(p), verification: e ? all(e.number, [cmp(p.number, e.number, `challenge${k + 1}.number`), cmp([p.startAge, p.endAge], [e.startAge, e.endAge], `challenge${k + 1}.ages`)]) : U("fazla zorluk") };
  });
  out.hiddenPassion.verification = all(o.hiddenPassion.number, [
    cmp(r.hiddenPassion.number, o.hiddenPassion.number, "hiddenPassion.number"),
    cmp(r.hiddenPassion.count, o.hiddenPassion.count, "hiddenPassion.count"),
    cmp(r.hiddenPassion.allPassions, o.hiddenPassion.allPassions, "hiddenPassion.allPassions"),
  ]);
  out.subconsciousSelf.verification = all(o.subconsciousSelf.number, [
    cmp(r.subconsciousSelf.number, o.subconsciousSelf.number, "subconsciousSelf.number"),
    cmp(r.subconsciousSelf.uniqueNumbers, o.subconsciousSelf.uniqueNumbers, "subconsciousSelf.uniqueNumbers"),
  ]);
  const nl = o.nameLetters;
  if (out.nameLetters.cornerstone)
    out.nameLetters.cornerstone.verification = cmp([r.nameLetters.cornerstone!.letter, r.nameLetters.cornerstone!.number], nl.cornerstone ? [nl.cornerstone.letter, nl.cornerstone.number] : null, "cornerstone");
  if (out.nameLetters.capstone)
    out.nameLetters.capstone.verification = cmp([r.nameLetters.capstone!.letter, r.nameLetters.capstone!.number], nl.capstone ? [nl.capstone.letter, nl.capstone.number] : null, "capstone");
  if (out.nameLetters.firstVowel) out.nameLetters.firstVowel.verification = cmp(r.nameLetters.firstVowel!.letter, nl.firstVowel?.letter ?? null, "firstVowel");
  if (o.currentAge !== null) {
    out.maturityStatus.verification = all(o.currentAge, [
      cmp(r.maturityStatus.currentAge, o.currentAge, "maturityStatus.currentAge"),
      cmp(r.maturityStatus.isActive, o.currentAge >= 35, "maturityStatus.isActive(yaş≥35)"),
    ]);
  } else out.maturityStatus.verification = U("hedef tarih yok");
  return out;
}

function bridge(i: Input, r: BridgeResult): BridgeResult {
  const out = clone(r);
  const name = nameOf(i);
  const d = dateOf(i);
  if (!name || !d || !nameSupported(name)) return out;
  const ex = P.expression(name);
  const su = P.soulUrge(name);
  const pe = P.personality(name);
  if (P.isOracleError(ex) || P.isOracleError(su) || P.isOracleError(pe)) return out;
  const coreN = { lifePath: P.lifePath(d).value, expression: ex.value, soulUrge: su.value, personality: pe.value };
  const pairs: Record<keyof BridgeResult, [number, number]> = {
    lifePathExpression: [coreN.lifePath, coreN.expression],
    expressionSoulUrge: [coreN.expression, coreN.soulUrge],
    soulUrgePersonality: [coreN.soulUrge, coreN.personality],
    expressionPersonality: [coreN.expression, coreN.personality],
  };
  for (const k of Object.keys(pairs) as Array<keyof BridgeResult>) {
    const [a, b] = pairs[k];
    const exp = P.bridge(a, b);
    out[k].verification = all(exp, [
      cmp(r[k].bridge, exp, `${k}.bridge`),
      cmp([r[k].from.number, r[k].to.number], [reduceSingle(a), reduceSingle(b)], `${k}.from/to(tek hane)`),
    ]);
  }
  return out;
}

function py(i: Input, r: PersonalYearResult): PersonalYearResult {
  const out = clone(r);
  if (typeof i.month === "number" && typeof i.day === "number" && typeof i.year === "number") {
    const e = P.personalYear(i.month, i.day, i.year);
    out.verification = all(e.value, [cmp(r.personalYear, e.value, "personalYear"), cmp((r.cycle.match(/\d+/g) ?? ([] as string[])).includes(String(e.value)), true, "cycle metni yılı içerir")]);
  } else out.verification = U("yıl verilmedi (sağlayıcı güncel UTC yılını kullanır)");
  return out;
}

function pm(i: Input, r: PersonalMonthResult): PersonalMonthResult {
  const out = clone(r);
  if (typeof i.month === "number" && typeof i.day === "number" && typeof i.year === "number" && typeof i.targetMonth === "number") {
    const y = P.personalYear(i.month, i.day, i.year);
    const e = P.personalMonth(y.value, i.targetMonth);
    out.verification = all(e.value, [cmp(r.personalMonth, e.value, "personalMonth"), cmp(r.personalYear, y.value, "personalYear"), cmp(r.calendarMonth, i.targetMonth, "calendarMonth")]);
  } else if (typeof i.month === "number" && typeof i.day === "number" && r.personalYear !== null && r.calendarMonth !== null) {
    // varsayılan yıl/ay: iç tutarlılık (PM = PY + takvim ayı)
    const e = P.personalMonth(r.personalYear, r.calendarMonth);
    out.verification = { ...cmp(r.personalMonth, e.value, "personalMonth(iç tutarlılık)"), note: "varsayılan yıl/ay: yalnız iç tutarlılık" };
  } else out.verification = U("girdi eksik");
  return out;
}

function pd(i: Input, r: PersonalDayResult): PersonalDayResult {
  const out = clone(r);
  if (typeof i.month !== "number" || typeof i.day !== "number") return out;
  const t = P.parseIsoDate(typeof i.targetDate === "string" ? i.targetDate : r.targetDate);
  if (!t) return out;
  const y = P.personalYear(i.month, i.day, t.year);
  const m = P.personalMonth(y.value, t.month);
  const dd = P.personalDay(m.value, t.day);
  out.verification = all(dd.value, [
    cmp(r.personalDay, dd.value, "personalDay"),
    cmp(r.personalMonth, m.value, "personalMonth"),
    cmp(r.personalYear, y.value, "personalYear"),
    ...(typeof i.targetDate === "string" ? [cmp(r.targetDate, i.targetDate, "targetDate")] : []),
  ]);
  if (typeof i.targetDate !== "string" && out.verification.status === "match") out.verification.note = "hedef tarih sağlayıcıdan (bugün UTC)";
  return out;
}

function personNumbers(p: unknown): { lifePath: number; expression: number; soulUrge: number } | null {
  if (!isObj(p)) return null;
  if (typeof p.lifePath === "number" && typeof p.expression === "number" && typeof p.soulUrge === "number")
    return { lifePath: p.lifePath, expression: p.expression, soulUrge: p.soulUrge };
  const d = dateOf(p);
  const n = typeof p.fullName === "string" ? p.fullName : null;
  if (!d || !n || !nameSupported(n)) return null;
  const ex = P.expression(n);
  const su = P.soulUrge(n);
  if (P.isOracleError(ex) || P.isOracleError(su)) return null;
  return { lifePath: P.lifePath(d).value, expression: ex.value, soulUrge: su.value };
}

function compat(i: Input, r: CompatibilityResult): CompatibilityResult {
  const out = clone(r);
  const a = personNumbers(i.person1);
  const b = personNumbers(i.person2);
  if (!a || !b) {
    out.verification = U("kişi sayıları hesaplanamadı");
    return out;
  }
  const checks = (["lifePath", "expression", "soulUrge"] as const).map((k) => cmp([r[k].person1, r[k].person2], [a[k], b[k]], `${k}.person1/2`));
  const v = all([a.lifePath, b.lifePath], checks);
  // Çift puan tablosu belgelenmemiş: puanlar yalnız aralık kontrolü (50–100).
  out.verification = v.status === "match" ? { status: "match", oracleValue: v.oracleValue, note: "kişi sayıları doğrulandı; uyum puan tablosu belgelenmemiş (doğrulanmadı)" } : v;
  return out;
}

function meanings(i: Input, r: MeaningsResult): MeaningsResult {
  const out = clone(r);
  const n = typeof i.number === "number" ? i.number : null;
  out.number.verification = n === null ? U("istenen sayı bilinmiyor") : all(n, [cmp(r.number.value, n, "number"), cmp(r.number.type, numberType(n), "type")]);
  return out;
}

function daily(_i: Input, r: DailyResult): DailyResult {
  const out = clone(r);
  out.number.verification = {
    ...cmp(r.number.type, numberType(r.number.value), "type"),
    note: "tohum tabanlı sembolik sayı: algoritma belgelenmemiş; yalnız tip tutarlılığı",
  };
  if (out.number.verification.status === "match") out.number.verification.status = "unverified";
  return out;
}

function chaldeanV(i: Input, r: ChaldeanResult): ChaldeanResult {
  const out = clone(r);
  const name = nameOf(i);
  if (!name || !nameSupported(name)) return out;
  out.destiny = verifyChaldeanPart(r.destiny, C.chaldeanDestiny(name), "destiny");
  out.soulUrge = verifyChaldeanPart(r.soulUrge, C.chaldeanSoulUrge(name), "soulUrge");
  out.personality = verifyChaldeanPart(r.personality, C.chaldeanPersonality(name), "personality");
  if (out.destiny.verification.status === "match") {
    const extra = all(r.destiny.root, [
      cmp(r.numberMeaning.number, r.destiny.root, "numberMeaning.number"),
      cmp(r.caution, C.chaldeanCaution(r.destiny.root), "caution(4/8)"),
      cmp(r.numberMeaning.caution, C.chaldeanCaution(r.destiny.root), "numberMeaning.caution"),
    ]);
    if (extra.status === "mismatch") out.destiny.verification = extra;
  }
  return out;
}

function compound(i: Input, r: CompoundNumberResult): CompoundNumberResult {
  const out = clone(r);
  const n = typeof i.number === "number" ? i.number : r.number;
  out.verification = all(reduceSingle(n), [cmp(r.number, n, "number"), cmp(r.root, reduceSingle(n), "root")]);
  return out;
}

function dual(i: Input, r: DualResult): DualResult {
  const out = clone(r);
  const name = nameOf(i);
  if (!name || !nameSupported(name)) return out;
  out.pythagorean = { ...verifyPyNumber({ ...r.pythagorean, karmicDebt: null }, (() => {
    const e = P.expression(name);
    return P.isOracleError(e) ? e : { ...e, karmicDebt: null };
  })(), "pythagorean"), title: r.pythagorean.title, keywords: r.pythagorean.keywords };
  out.chaldean = { ...verifyChaldeanPart(r.chaldean, C.chaldeanDestiny(name), "chaldean"), planet: r.chaldean.planet, title: r.chaldean.title, caution: r.chaldean.caution };
  const agree = reduceSingle(r.pythagorean.value) === r.chaldean.root;
  out.verification = all(agree, [cmp(r.agreement, agree, "agreement(tek hane eşit)"), cmp(r.chaldean.caution, C.chaldeanCaution(r.chaldean.root), "chaldean.caution")]);
  return out;
}

function business(i: Input, r: BusinessNameResult): BusinessNameResult {
  const out = clone(r);
  const name = nameOf(i);
  if (!name || !nameSupported(name)) return out;
  out.number = verifyChaldeanPart(r.number, C.chaldeanDestiny(name), "business");
  out.verification = all(C.businessRating(r.number.root), [cmp(r.rating, C.businessRating(r.number.root), "rating(kök kuralı)")]);
  return out;
}

export function verifyNormalized(id: ClassicEndpointId, input: unknown, normalized: unknown): unknown {
  if (!isObj(normalized)) return normalized;
  const i: Input = isObj(input) ? input : {};
  const n = normalized as never;
  switch (id) {
    case "chart":
      return chart(i, n);
    case "life_path":
    case "expression":
    case "soul_urge":
    case "personality":
    case "birth_day":
    case "maturity":
      return core(id, i, n);
    case "bridge":
      return bridge(i, n);
    case "karmic_lessons":
      return lessons(i, n);
    case "karmic_debt":
      return debt(i, n);
    case "personal_year":
      return py(i, n);
    case "personal_month":
      return pm(i, n);
    case "personal_day":
      return pd(i, n);
    case "compatibility":
      return compat(i, n);
    case "meanings":
      return meanings(i, n);
    case "daily":
      return daily(i, n);
    case "chaldean":
      return chaldeanV(i, n);
    case "compound_number":
      return compound(i, n);
    case "dual":
      return dual(i, n);
    case "business_name":
      return business(i, n);
    default:
      return normalized;
  }
}
