/**
 * Klasik Numeroloji — normalize sonuç tipleri (saf; istemci-güvenli).
 * Ham sağlayıcı yanıtı UI'ya GİTMEZ; yalnız bu tipler (normalize/index.ts üretir).
 * Türkçe etiketler: ./labels.ts
 */
import type { ClassicEndpointId } from "./endpoints";

export type NumberMethod = "pythagorean" | "chaldean";
export type NumberKind = "single" | "master" | "compound";

export type VerificationStatus = "match" | "mismatch" | "unverified";
export type Verification = {
  status: VerificationStatus;
  oracleValue?: number | string | boolean | number[];
  note?: string;
};

/** Sağlayıcı yorum bloğu ("Klasik ekol yorumu"); yoksa alanlar boş/null. */
export type MeaningBlock = {
  title: string;
  keywords: string[];
  description: string;
  strengths: string[];
  challenges: string[];
  career: string | null;
  relationships: string | null;
  spirituality: string | null;
};

export type KarmicDebtMeaning = { number: number; description: string; challenge: string; resolution: string };

/** Her sayı nesnesinin ortak çekirdeği. */
export type ClassicNumber = {
  value: number;
  type: NumberKind;
  /** 13/14/16/19 veya null */
  karmicDebt: number | null;
  /** Sağlayıcının adım izi (düz metin, uzunluk sınırlı). */
  calculation: string;
  meaning: MeaningBlock | null;
  method: NumberMethod;
  verification: Verification;
};

// ── Tekil Pisagor çekirdek uçları (life_path, expression, soul_urge, personality, birth_day, maturity)
export type CoreNumberResult = {
  number: ClassicNumber;
  karmicDebtMeaning: KarmicDebtMeaning | null;
};

export type BridgeItem = {
  bridge: number;
  from: { name: string; number: number };
  to: { name: string; number: number };
  meaning: string;
  verification: Verification;
};
export type BridgeResult = {
  lifePathExpression: BridgeItem;
  expressionSoulUrge: BridgeItem;
  soulUrgePersonality: BridgeItem;
  expressionPersonality: BridgeItem;
};

export type KarmicLesson = { number: number; lesson: string; description: string; howToOvercome: string };
export type KarmicLessonsResult = {
  missingNumbers: number[];
  lessons: KarmicLesson[];
  /** "1".."9" → harf adedi */
  presentNumbers: Record<string, number>;
  verification: Verification;
};

export type KarmicDebtResult = {
  hasKarmicDebt: boolean;
  debtNumbers: number[];
  meanings: KarmicDebtMeaning[];
  message: string | null;
  verification: Verification;
};

export type PersonalYearResult = {
  personalYear: number;
  cycle: string;
  theme: string;
  forecast: string;
  opportunities: string[];
  challenges: string[];
  advice: string;
  verification: Verification;
};
export type PersonalMonthResult = {
  personalMonth: number;
  theme: string;
  focus: string;
  calendarMonth: number | null;
  personalYear: number | null;
  personalYearTheme: string | null;
  verification: Verification;
};
export type PersonalDayResult = {
  personalDay: number;
  theme: string;
  guidance: string;
  targetDate: string;
  personalMonth: number;
  personalMonthTheme: string;
  personalYear: number;
  personalYearTheme: string;
  verification: Verification;
};

export type CompatibilityPair = { person1: number; person2: number; compatibility: number; description: string };
export type CompatibilityResult = {
  overallScore: number;
  rating: string;
  lifePath: CompatibilityPair;
  expression: CompatibilityPair;
  soulUrge: CompatibilityPair;
  strengths: string[];
  challenges: string[];
  advice: string;
  verification: Verification;
};

export type Period = {
  position: number;
  number: number;
  startAge: number;
  endAge: number | null;
  title: string;
  description: string;
  /** zirvede fırsatlar; zorlukta ders + aşma yolu */
  opportunities: string[];
  challenges: string[];
  lesson: string | null;
  howToOvercome: string | null;
  verification: Verification;
};

export type ChartResult = {
  profile: { name: string; birthdate: string };
  core: {
    lifePath: ClassicNumber;
    expression: ClassicNumber;
    soulUrge: ClassicNumber;
    personality: ClassicNumber;
    birthDay: ClassicNumber;
    maturity: ClassicNumber;
  };
  karmicLessons: KarmicLessonsResult;
  karmicDebt: KarmicDebtResult;
  personalYear: PersonalYearResult & { personalMonth: { personalMonth: number; theme: string; focus: string; verification: Verification } };
  pinnacles: Period[];
  challenges: Period[];
  hiddenPassion: { number: number; count: number; allPassions: number[]; title: string; description: string; verification: Verification };
  subconsciousSelf: { number: number; uniqueNumbers: number[]; title: string; description: string; verification: Verification };
  nameLetters: {
    cornerstone: { letter: string; number: number; meaning: string; verification: Verification } | null;
    capstone: { letter: string; number: number; meaning: string; verification: Verification } | null;
    firstVowel: { letter: string; meaning: string; verification: Verification } | null;
  };
  birthDayProfile: {
    day: number;
    reducesTo: number;
    title: string;
    keywords: string[];
    description: string;
    strengths: string[];
    challenges: string[];
    career: string | null;
    relationships: string | null;
  } | null;
  maturityStatus: { isActive: boolean; currentAge: number; activationRange: string; verification: Verification };
  luckyAssociations: {
    colors: string[];
    gemstones: string[];
    day: string;
    element: string;
    rulingPlanet: string;
    compatibleNumbers: number[];
    incompatibleNumbers: number[];
  } | null;
  summary: string;
};

export type MeaningsResult = { number: ClassicNumber };

export type DailyResult = { date: string; seed: string | null; number: ClassicNumber; dailyMessage: string };

export type CompoundNature = "fortunate" | "unfortunate" | "mixed";
export type CompoundMeaning = {
  number: number;
  name: string | null;
  nature: CompoundNature;
  meaning: string;
  sameAs: number | null;
};

/** Kalde sayı: value = kök; compound 10..52 veya null. */
export type ChaldeanPart = ClassicNumber & {
  total: number;
  compound: number | null;
  root: number;
  compoundMeaning: CompoundMeaning | null;
};

export type ChaldeanResult = {
  name: string;
  destiny: ChaldeanPart;
  soulUrge: ChaldeanPart;
  personality: ChaldeanPart;
  numberMeaning: { number: number; planet: string; title: string; keywords: string[]; caution: boolean; meaning: string };
  caution: boolean;
  summary: string;
};

export type CompoundNumberResult = CompoundMeaning & { root: number; verification: Verification };

export type DualResult = {
  name: string;
  pythagorean: ClassicNumber & { title: string; keywords: string[] };
  chaldean: ChaldeanPart & { planet: string; title: string; caution: boolean };
  agreement: boolean;
  note: string;
  verification: Verification;
};

export type BusinessRating = "excellent" | "good" | "caution" | "avoid";
export type BusinessNameResult = {
  name: string;
  number: ChaldeanPart;
  planet: string;
  rating: BusinessRating;
  favorableCompound: boolean;
  industries: string[];
  guidance: string;
  summary: string;
  verification: Verification;
};

/** Uç kimliği → normalize veri tipi. */
export type NormalizedByEndpoint = {
  chart: ChartResult;
  life_path: CoreNumberResult;
  expression: CoreNumberResult;
  soul_urge: CoreNumberResult;
  personality: CoreNumberResult;
  birth_day: CoreNumberResult;
  maturity: CoreNumberResult;
  bridge: BridgeResult;
  karmic_lessons: KarmicLessonsResult;
  karmic_debt: KarmicDebtResult;
  personal_day: PersonalDayResult;
  personal_month: PersonalMonthResult;
  personal_year: PersonalYearResult;
  compatibility: CompatibilityResult;
  meanings: MeaningsResult;
  daily: DailyResult;
  chaldean: ChaldeanResult;
  compound_number: CompoundNumberResult;
  dual: DualResult;
  business_name: BusinessNameResult;
};

export type NormalizedFor<E extends ClassicEndpointId> = NormalizedByEndpoint[E];

export const UNVERIFIED: Verification = Object.freeze({ status: "unverified" }) as Verification;
