/**
 * Klasik Numeroloji — ham sağlayıcı yanıtı → model.ts tipleri (saf; istemci-güvenli; "server-only" YOK).
 *
 * İlkeler:
 *   • Ham yanıt asla geçirilmez: yalnız bilinen alanlar kopyalanır, bilinmeyenler atılır.
 *   • Katı çalışma zamanı doğrulaması: tip/aralık hatası → { ok:false, reason }.
 *   • Metinler: HTML etiketleri ve kontrol karakterleri temizlenir, `<`/`>` kaldırılır, uzunluk sınırlanır.
 *   • Doğrulama durumları başlangıçta "unverified"; verifyWithOracle() bağımsız oracle ile doldurur.
 */
import type { ClassicEndpointId } from "../endpoints";
import type {
  BridgeItem,
  BridgeResult,
  BusinessNameResult,
  ChaldeanPart,
  ChaldeanResult,
  ChartResult,
  ClassicNumber,
  CompatibilityPair,
  CompatibilityResult,
  CompoundMeaning,
  CompoundNumberResult,
  CoreNumberResult,
  DailyResult,
  DualResult,
  KarmicDebtMeaning,
  KarmicDebtResult,
  KarmicLessonsResult,
  MeaningBlock,
  MeaningsResult,
  NumberMethod,
  Period,
  PersonalDayResult,
  PersonalMonthResult,
  PersonalYearResult,
  Verification,
} from "../model";
import { verifyNormalized } from "./verify";

class NormError extends Error {}

const CAP = { short: 200, line: 600, calc: 2000, text: 8000, item: 2500, list: 40 } as const;

const fail = (path: string, why: string): never => {
  throw new NormError(`${path}: ${why}`);
};

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function obj(x: unknown, path: string): Record<string, unknown> {
  if (!isObj(x)) fail(path, "nesne değil");
  return x as Record<string, unknown>;
}

/** Metin temizliği: etiketleri sil, kalan açılı ayraçları kaldır, kontrol karakterlerini at, sınırla. */
export function cleanText(s: string, max: number): string {
  let t = s
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/javascript\s*:/gi, "")
    .trim();
  if (t.length > max) t = `${t.slice(0, max - 1)}…`;
  return t;
}

function str(x: unknown, path: string, max: number = CAP.line): string {
  if (typeof x !== "string") fail(path, "metin değil");
  return cleanText(x as string, max);
}
function strOpt(x: unknown, path: string, max: number = CAP.line): string | null {
  if (x === undefined || x === null) return null;
  return str(x, path, max);
}
function num(x: unknown, path: string, min = -1e9, max = 1e9, int = true): number {
  if (typeof x !== "number" || !Number.isFinite(x)) fail(path, "sayı değil");
  const n = x as number;
  if (int && !Number.isInteger(n)) fail(path, "tamsayı değil");
  if (n < min || n > max) fail(path, `aralık dışı (${n})`);
  return n;
}
function numOpt(x: unknown, path: string, min?: number, max?: number): number | null {
  if (x === undefined || x === null) return null;
  return num(x, path, min, max);
}
function bool(x: unknown, path: string): boolean {
  if (typeof x !== "boolean") fail(path, "mantıksal değil");
  return x as boolean;
}
function arr<T>(x: unknown, path: string, f: (v: unknown, p: string) => T, maxLen: number = CAP.list): T[] {
  if (!Array.isArray(x)) fail(path, "dizi değil");
  const a = x as unknown[];
  if (a.length > maxLen) fail(path, `dizi çok uzun (${a.length})`);
  return a.map((v, i) => f(v, `${path}[${i}]`));
}
const strList = (x: unknown, path: string, max: number = CAP.item) => arr(x, path, (v, p) => str(v, p, max));
const strListOpt = (x: unknown, path: string, max: number = CAP.item) => (x === undefined || x === null ? [] : strList(x, path, max));
const numList = (x: unknown, path: string, min = 0, max = 100) => arr(x, path, (v, p) => num(v, p, min, max));

const isoDate = (x: unknown, path: string): string => {
  const s = str(x, path, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(path, "ISO tarih değil");
  return s;
};

const unverified = (): Verification => ({ status: "unverified" });
const VALID_CORE = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]);

function meaningBlock(x: unknown, path: string): MeaningBlock | null {
  if (x === undefined || x === null) return null;
  const o = obj(x, path);
  return {
    title: str(o.title, `${path}.title`, CAP.short),
    keywords: strListOpt(o.keywords, `${path}.keywords`, CAP.short),
    description: str(o.description ?? "", `${path}.description`, CAP.text),
    strengths: strListOpt(o.strengths, `${path}.strengths`),
    challenges: strListOpt(o.challenges, `${path}.challenges`),
    career: strOpt(o.career, `${path}.career`, CAP.text),
    relationships: strOpt(o.relationships, `${path}.relationships`, CAP.text),
    spirituality: strOpt(o.spirituality, `${path}.spirituality`, CAP.text),
  };
}

function karmicDebtMeaning(x: unknown, path: string, numberFallback?: number): KarmicDebtMeaning {
  const o = obj(x, path);
  return {
    number: o.number === undefined && numberFallback !== undefined ? numberFallback : num(o.number, `${path}.number`, 13, 19),
    description: str(o.description, `${path}.description`, CAP.item),
    challenge: str(o.challenge, `${path}.challenge`, CAP.item),
    resolution: str(o.resolution, `${path}.resolution`, CAP.item),
  };
}

/** Pisagor çekirdek sayı nesnesi (number/calculation/type/hasKarmicDebt/karmicDebtNumber/meaning). */
function pyNumber(x: unknown, path: string, opts: { requireCore?: boolean } = {}): ClassicNumber {
  const o = obj(x, path);
  const value = num(o.number, `${path}.number`, 0, 99);
  if (opts.requireCore !== false && !VALID_CORE.has(value)) fail(`${path}.number`, `geçersiz çekirdek sayı ${value}`);
  const type = o.type;
  if (type !== "single" && type !== "master") fail(`${path}.type`, "single|master değil");
  const has = o.hasKarmicDebt === undefined ? false : bool(o.hasKarmicDebt, `${path}.hasKarmicDebt`);
  const kd = numOpt(o.karmicDebtNumber, `${path}.karmicDebtNumber`, 13, 19);
  if (has && kd === null) fail(`${path}.karmicDebtNumber`, "borç var ama sayı yok");
  return {
    value,
    type: type as "single" | "master",
    karmicDebt: has ? kd : null,
    calculation: strOpt(o.calculation, `${path}.calculation`, CAP.calc) ?? "",
    meaning: meaningBlock(o.meaning, `${path}.meaning`),
    method: "pythagorean",
    verification: unverified(),
  };
}

function coreResult(raw: unknown): CoreNumberResult {
  const o = obj(raw, "$");
  const number = pyNumber(o, "$");
  return {
    number,
    karmicDebtMeaning: o.karmicDebtMeaning ? karmicDebtMeaning(o.karmicDebtMeaning, "$.karmicDebtMeaning", number.karmicDebt ?? undefined) : null,
  };
}

function bridgeItem(x: unknown, path: string): BridgeItem {
  const o = obj(x, path);
  const f = obj(o.from, `${path}.from`);
  const t = obj(o.to, `${path}.to`);
  return {
    bridge: num(o.bridge, `${path}.bridge`, 0, 8),
    from: { name: str(f.name, `${path}.from.name`, CAP.short), number: num(f.number, `${path}.from.number`, 0, 99) },
    to: { name: str(t.name, `${path}.to.name`, CAP.short), number: num(t.number, `${path}.to.number`, 0, 99) },
    meaning: str(o.meaning, `${path}.meaning`, CAP.text),
    verification: unverified(),
  };
}

function karmicLessons(x: unknown, path: string): KarmicLessonsResult {
  const o = obj(x, path);
  const pn = obj(o.presentNumbers, `${path}.presentNumbers`);
  const presentNumbers: Record<string, number> = {};
  for (const k of ["1", "2", "3", "4", "5", "6", "7", "8", "9"]) presentNumbers[k] = num(pn[k] ?? 0, `${path}.presentNumbers.${k}`, 0, 500);
  return {
    missingNumbers: numList(o.missingNumbers, `${path}.missingNumbers`, 1, 9),
    lessons: arr(o.lessons, `${path}.lessons`, (v, p) => {
      const l = obj(v, p);
      return {
        number: num(l.number, `${p}.number`, 1, 9),
        lesson: str(l.lesson, `${p}.lesson`, CAP.item),
        description: str(l.description, `${p}.description`, CAP.text),
        howToOvercome: str(l.howToOvercome, `${p}.howToOvercome`, CAP.text),
      };
    }),
    presentNumbers,
    verification: unverified(),
  };
}

function karmicDebt(x: unknown, path: string): KarmicDebtResult {
  const o = obj(x, path);
  return {
    hasKarmicDebt: bool(o.hasKarmicDebt, `${path}.hasKarmicDebt`),
    debtNumbers: numList(o.debtNumbers, `${path}.debtNumbers`, 13, 19),
    meanings: arr(o.meanings, `${path}.meanings`, (v, p) => karmicDebtMeaning(v, p)),
    message: strOpt(o.message, `${path}.message`, CAP.item),
    verification: unverified(),
  };
}

function personalYear(x: unknown, path: string): PersonalYearResult {
  const o = obj(x, path);
  return {
    personalYear: num(o.personalYear, `${path}.personalYear`, 1, 33),
    cycle: str(o.cycle, `${path}.cycle`, CAP.short),
    theme: str(o.theme, `${path}.theme`, CAP.short),
    forecast: str(o.forecast, `${path}.forecast`, CAP.text),
    opportunities: strListOpt(o.opportunities, `${path}.opportunities`),
    challenges: strListOpt(o.challenges, `${path}.challenges`),
    advice: str(o.advice ?? "", `${path}.advice`, CAP.text),
    verification: unverified(),
  };
}

function period(x: unknown, path: string, kind: "pinnacle" | "challenge"): Period {
  const o = obj(x, path);
  const m = isObj(o.meaning) ? o.meaning : {};
  return {
    position: num(o.position, `${path}.position`, 1, 4),
    number: num(o.number, `${path}.number`, 0, 33),
    startAge: num(o.startAge, `${path}.startAge`, 0, 200),
    endAge: numOpt(o.endAge, `${path}.endAge`, 0, 200),
    title: strOpt(m.title, `${path}.meaning.title`, CAP.short) ?? "",
    description: strOpt(m.description, `${path}.meaning.description`, CAP.text) ?? "",
    opportunities: kind === "pinnacle" ? strListOpt(m.opportunities, `${path}.meaning.opportunities`) : [],
    challenges: kind === "pinnacle" ? strListOpt(m.challenges, `${path}.meaning.challenges`) : [],
    lesson: kind === "challenge" ? strOpt(m.lesson, `${path}.meaning.lesson`, CAP.text) : null,
    howToOvercome: kind === "challenge" ? strOpt(m.howToOvercome, `${path}.meaning.howToOvercome`, CAP.text) : null,
    verification: unverified(),
  };
}

function letterInfo(x: unknown, path: string, withNumber: boolean) {
  if (!isObj(x)) return null;
  const letter = str(x.letter, `${path}.letter`, 2);
  if (!/^[A-Z]$/.test(letter)) fail(`${path}.letter`, "A–Z değil");
  return withNumber
    ? { letter, number: num(x.number, `${path}.number`, 1, 9), meaning: str(x.meaning, `${path}.meaning`, CAP.text), verification: unverified() }
    : { letter, meaning: str(x.meaning, `${path}.meaning`, CAP.text), verification: unverified() };
}

function chart(raw: unknown): ChartResult {
  const o = obj(raw, "$");
  const pr = obj(o.profile, "$.profile");
  const cn = obj(o.coreNumbers, "$.coreNumbers");
  const ai = obj(o.additionalInsights, "$.additionalInsights");
  const py = obj(ai.personalYear, "$.additionalInsights.personalYear");
  const pm = obj(py.personalMonth, "$.additionalInsights.personalYear.personalMonth");
  const hp = obj(ai.hiddenPassion, "$.additionalInsights.hiddenPassion");
  const ss = obj(ai.subconsciousSelf, "$.additionalInsights.subconsciousSelf");
  const nl = obj(ai.nameLetters, "$.additionalInsights.nameLetters");
  const ms = obj(o.maturityStatus, "$.maturityStatus");
  const bdp = isObj(o.birthDayProfile) ? o.birthDayProfile : null;
  const la = isObj(o.luckyAssociations) ? o.luckyAssociations : null;
  return {
    profile: { name: str(pr.name, "$.profile.name", CAP.short), birthdate: isoDate(pr.birthdate, "$.profile.birthdate") },
    core: {
      lifePath: pyNumber(cn.lifePath, "$.coreNumbers.lifePath"),
      expression: pyNumber(cn.expression, "$.coreNumbers.expression"),
      soulUrge: pyNumber(cn.soulUrge, "$.coreNumbers.soulUrge"),
      personality: pyNumber(cn.personality, "$.coreNumbers.personality"),
      birthDay: pyNumber(cn.birthDay, "$.coreNumbers.birthDay"),
      maturity: pyNumber(cn.maturity, "$.coreNumbers.maturity"),
    },
    karmicLessons: karmicLessons(ai.karmicLessons, "$.additionalInsights.karmicLessons"),
    karmicDebt: karmicDebt(ai.karmicDebt, "$.additionalInsights.karmicDebt"),
    personalYear: {
      ...personalYear(py, "$.additionalInsights.personalYear"),
      personalMonth: {
        personalMonth: num(pm.personalMonth, "$..personalMonth.personalMonth", 1, 33),
        theme: str(pm.theme, "$..personalMonth.theme", CAP.short),
        focus: str(pm.focus, "$..personalMonth.focus", CAP.text),
        verification: unverified(),
      },
    },
    pinnacles: arr(ai.pinnacles, "$.additionalInsights.pinnacles", (v, p) => period(v, p, "pinnacle"), 4),
    challenges: arr(ai.challenges, "$.additionalInsights.challenges", (v, p) => period(v, p, "challenge"), 4),
    hiddenPassion: {
      number: num(hp.number, "$..hiddenPassion.number", 1, 9),
      count: num(hp.count, "$..hiddenPassion.count", 0, 500),
      allPassions: numList(hp.allPassions, "$..hiddenPassion.allPassions", 1, 9),
      title: str(hp.title, "$..hiddenPassion.title", CAP.short),
      description: str(hp.description, "$..hiddenPassion.description", CAP.text),
      verification: unverified(),
    },
    subconsciousSelf: {
      number: num(ss.number, "$..subconsciousSelf.number", 0, 9),
      uniqueNumbers: numList(ss.uniqueNumbers, "$..subconsciousSelf.uniqueNumbers", 1, 9),
      title: str(ss.title, "$..subconsciousSelf.title", CAP.short),
      description: str(ss.description, "$..subconsciousSelf.description", CAP.text),
      verification: unverified(),
    },
    nameLetters: {
      cornerstone: letterInfo(nl.cornerstone, "$..cornerstone", true) as ChartResult["nameLetters"]["cornerstone"],
      capstone: letterInfo(nl.capstone, "$..capstone", true) as ChartResult["nameLetters"]["capstone"],
      firstVowel: letterInfo(nl.firstVowel, "$..firstVowel", false) as ChartResult["nameLetters"]["firstVowel"],
    },
    birthDayProfile: bdp
      ? {
          day: num(bdp.day, "$.birthDayProfile.day", 1, 31),
          reducesTo: num(bdp.reducesTo, "$.birthDayProfile.reducesTo", 1, 33),
          title: str(bdp.title, "$.birthDayProfile.title", CAP.short),
          keywords: strListOpt(bdp.keywords, "$.birthDayProfile.keywords", CAP.short),
          description: str(bdp.description, "$.birthDayProfile.description", CAP.text),
          strengths: strListOpt(bdp.strengths, "$.birthDayProfile.strengths"),
          challenges: strListOpt(bdp.challenges, "$.birthDayProfile.challenges"),
          career: strOpt(bdp.career, "$.birthDayProfile.career", CAP.text),
          relationships: strOpt(bdp.relationships, "$.birthDayProfile.relationships", CAP.text),
        }
      : null,
    maturityStatus: {
      isActive: bool(ms.isActive, "$.maturityStatus.isActive"),
      currentAge: num(ms.currentAge, "$.maturityStatus.currentAge", 0, 2100),
      activationRange: str(ms.activationRange, "$.maturityStatus.activationRange", 40),
      verification: unverified(),
    },
    luckyAssociations: la
      ? {
          colors: strListOpt(la.colors, "$.luckyAssociations.colors", CAP.short),
          gemstones: strListOpt(la.gemstones, "$.luckyAssociations.gemstones", CAP.short),
          day: str(la.day, "$.luckyAssociations.day", CAP.short),
          element: str(la.element, "$.luckyAssociations.element", CAP.short),
          rulingPlanet: str(la.rulingPlanet, "$.luckyAssociations.rulingPlanet", CAP.short),
          compatibleNumbers: la.compatibleNumbers === undefined ? [] : numList(la.compatibleNumbers, "$.luckyAssociations.compatibleNumbers", 1, 33),
          incompatibleNumbers: la.incompatibleNumbers === undefined ? [] : numList(la.incompatibleNumbers, "$.luckyAssociations.incompatibleNumbers", 1, 33),
        }
      : null,
    summary: str(o.summary ?? "", "$.summary", CAP.text),
  };
}

function compoundMeaning(x: unknown, path: string): CompoundMeaning | null {
  if (x === undefined || x === null) return null;
  const o = obj(x, path);
  const nature = o.nature;
  if (nature !== "fortunate" && nature !== "unfortunate" && nature !== "mixed") fail(`${path}.nature`, "geçersiz doğa");
  return {
    number: num(o.number, `${path}.number`, 1, 99),
    name: strOpt(o.name, `${path}.name`, CAP.short),
    nature: nature as CompoundMeaning["nature"],
    meaning: str(o.meaning, `${path}.meaning`, CAP.text),
    sameAs: numOpt(o.sameAs, `${path}.sameAs`, 10, 52),
  };
}

function chaldeanPart(o: Record<string, unknown>, path: string): ChaldeanPart {
  const total = num(o.total, `${path}.total`, 0, 2000);
  const compound = numOpt(o.compound, `${path}.compound`, 10, 52);
  const root = num(o.root, `${path}.root`, 1, 9);
  return {
    value: root,
    type: compound !== null ? "compound" : "single",
    karmicDebt: null,
    calculation: strOpt(o.calculation, `${path}.calculation`, CAP.calc) ?? "",
    meaning: null,
    method: "chaldean",
    verification: unverified(),
    total,
    compound,
    root,
    compoundMeaning: compoundMeaning(o.compoundMeaning, `${path}.compoundMeaning`),
  };
}

function chaldean(raw: unknown): ChaldeanResult {
  const o = obj(raw, "$");
  const nm = obj(o.numberMeaning, "$.numberMeaning");
  return {
    name: str(o.name, "$.name", CAP.short),
    destiny: chaldeanPart(obj(o.destiny, "$.destiny"), "$.destiny"),
    soulUrge: chaldeanPart(obj(o.soulUrge, "$.soulUrge"), "$.soulUrge"),
    personality: chaldeanPart(obj(o.personality, "$.personality"), "$.personality"),
    numberMeaning: {
      number: num(nm.number, "$.numberMeaning.number", 1, 9),
      planet: str(nm.planet, "$.numberMeaning.planet", CAP.short),
      title: str(nm.title, "$.numberMeaning.title", CAP.short),
      keywords: strListOpt(nm.keywords, "$.numberMeaning.keywords", CAP.short),
      caution: bool(nm.caution, "$.numberMeaning.caution"),
      meaning: str(nm.meaning, "$.numberMeaning.meaning", CAP.text),
    },
    caution: bool(o.caution, "$.caution"),
    summary: str(o.summary ?? "", "$.summary", CAP.text),
  };
}

function compatPair(x: unknown, path: string): CompatibilityPair {
  const o = obj(x, path);
  return {
    person1: num(o.person1, `${path}.person1`, 0, 99),
    person2: num(o.person2, `${path}.person2`, 0, 99),
    compatibility: num(o.compatibility, `${path}.compatibility`, 0, 100, false),
    description: str(o.description, `${path}.description`, CAP.text),
  };
}

type Normalizer = (raw: unknown) => unknown;

const NORMALIZERS: Record<ClassicEndpointId, Normalizer> = {
  chart,
  life_path: coreResult,
  expression: coreResult,
  soul_urge: coreResult,
  personality: coreResult,
  birth_day: coreResult,
  maturity: coreResult,
  bridge: (raw): BridgeResult => {
    const o = obj(raw, "$");
    return {
      lifePathExpression: bridgeItem(o.lifePathExpression, "$.lifePathExpression"),
      expressionSoulUrge: bridgeItem(o.expressionSoulUrge, "$.expressionSoulUrge"),
      soulUrgePersonality: bridgeItem(o.soulUrgePersonality, "$.soulUrgePersonality"),
      expressionPersonality: bridgeItem(o.expressionPersonality, "$.expressionPersonality"),
    };
  },
  karmic_lessons: (raw) => karmicLessons(raw, "$"),
  karmic_debt: (raw) => karmicDebt(raw, "$"),
  personal_day: (raw): PersonalDayResult => {
    const o = obj(raw, "$");
    return {
      personalDay: num(o.personalDay, "$.personalDay", 1, 33),
      theme: str(o.theme, "$.theme", CAP.short),
      guidance: str(o.guidance, "$.guidance", CAP.text),
      targetDate: isoDate(o.targetDate, "$.targetDate"),
      personalMonth: num(o.personalMonth, "$.personalMonth", 1, 33),
      personalMonthTheme: str(o.personalMonthTheme, "$.personalMonthTheme", CAP.short),
      personalYear: num(o.personalYear, "$.personalYear", 1, 33),
      personalYearTheme: str(o.personalYearTheme, "$.personalYearTheme", CAP.short),
      verification: unverified(),
    };
  },
  personal_month: (raw): PersonalMonthResult => {
    const o = obj(raw, "$");
    return {
      personalMonth: num(o.personalMonth, "$.personalMonth", 1, 33),
      theme: str(o.theme, "$.theme", CAP.short),
      focus: str(o.focus, "$.focus", CAP.text),
      calendarMonth: numOpt(o.calendarMonth, "$.calendarMonth", 1, 12),
      personalYear: numOpt(o.personalYear, "$.personalYear", 1, 33),
      personalYearTheme: strOpt(o.personalYearTheme, "$.personalYearTheme", CAP.short),
      verification: unverified(),
    };
  },
  personal_year: (raw) => personalYear(raw, "$"),
  compatibility: (raw): CompatibilityResult => {
    const o = obj(raw, "$");
    return {
      overallScore: num(o.overallScore, "$.overallScore", 0, 100, false),
      rating: str(o.rating, "$.rating", CAP.short),
      lifePath: compatPair(o.lifePath, "$.lifePath"),
      expression: compatPair(o.expression, "$.expression"),
      soulUrge: compatPair(o.soulUrge, "$.soulUrge"),
      strengths: strListOpt(o.strengths, "$.strengths"),
      challenges: strListOpt(o.challenges, "$.challenges"),
      advice: str(o.advice ?? "", "$.advice", CAP.text),
      verification: unverified(),
    };
  },
  meanings: (raw): MeaningsResult => {
    const o = obj(raw, "$");
    return { number: pyNumber({ ...o, hasKarmicDebt: false }, "$") };
  },
  daily: (raw): DailyResult => {
    const o = obj(raw, "$");
    return {
      date: isoDate(o.date, "$.date"),
      seed: strOpt(o.seed, "$.seed", CAP.short),
      number: pyNumber({ ...o, hasKarmicDebt: false }, "$"),
      dailyMessage: str(o.dailyMessage ?? "", "$.dailyMessage", CAP.text),
    };
  },
  chaldean,
  compound_number: (raw): CompoundNumberResult => {
    const o = obj(raw, "$");
    const cm = compoundMeaning(o, "$")!;
    if (cm.number < 10 || cm.number > 52) fail("$.number", "10–52 dışı");
    return { ...cm, root: num(o.root, "$.root", 1, 9), verification: unverified() };
  },
  dual: (raw): DualResult => {
    const o = obj(raw, "$");
    const p = obj(o.pythagorean, "$.pythagorean");
    const c = obj(o.chaldean, "$.chaldean");
    return {
      name: str(o.name, "$.name", CAP.short),
      pythagorean: {
        ...pyNumber({ ...p, hasKarmicDebt: false }, "$.pythagorean"),
        title: str(p.title, "$.pythagorean.title", CAP.short),
        keywords: strListOpt(p.keywords, "$.pythagorean.keywords", CAP.short),
      },
      chaldean: {
        ...chaldeanPart(c, "$.chaldean"),
        planet: str(c.planet, "$.chaldean.planet", CAP.short),
        title: str(c.title, "$.chaldean.title", CAP.short),
        caution: bool(c.caution, "$.chaldean.caution"),
      },
      agreement: bool(o.agreement, "$.agreement"),
      note: str(o.note ?? "", "$.note", CAP.text),
      verification: unverified(),
    };
  },
  business_name: (raw): BusinessNameResult => {
    const o = obj(raw, "$");
    const rating = o.rating;
    if (rating !== "excellent" && rating !== "good" && rating !== "caution" && rating !== "avoid") fail("$.rating", "geçersiz puan");
    return {
      name: str(o.name, "$.name", CAP.short),
      number: chaldeanPart(o, "$"),
      planet: str(o.planet, "$.planet", CAP.short),
      rating: rating as BusinessNameResult["rating"],
      favorableCompound: bool(o.favorableCompound, "$.favorableCompound"),
      industries: strListOpt(o.industries, "$.industries", CAP.short),
      guidance: str(o.guidance ?? "", "$.guidance", CAP.text),
      summary: str(o.summary ?? "", "$.summary", CAP.text),
      verification: unverified(),
    };
  },
};

export function normalizeEndpointResponse(id: ClassicEndpointId, raw: unknown): { ok: true; data: unknown } | { ok: false; reason: string } {
  const f = NORMALIZERS[id];
  if (!f) return { ok: false, reason: `bilinmeyen uç: ${String(id)}` };
  if (isObj(raw) && typeof raw.error === "string" && typeof raw.code === "string") {
    return { ok: false, reason: `sağlayıcı hatası: ${cleanText(raw.code, 60)}` };
  }
  try {
    return { ok: true, data: f(raw) };
  } catch (e) {
    if (e instanceof NormError) return { ok: false, reason: e.message };
    return { ok: false, reason: "beklenmeyen normalize hatası" };
  }
}

/**
 * Normalize sonuca bağımsız oracle doğrulama durumlarını ekler (girdi değiştirilmez; yeni nesne döner).
 * `input` sağlayıcıya gönderilen istek gövdesidir (fullName/name/year/month/day/targetDate ...).
 */
export function verifyWithOracle(id: ClassicEndpointId, input: unknown, normalized: unknown): unknown {
  return verifyNormalized(id, input, normalized);
}

export type { NumberMethod };
