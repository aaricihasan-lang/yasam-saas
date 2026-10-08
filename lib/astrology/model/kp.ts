// Astroloji — Aşama 6 KP (Krishnamurti Paddhati) kanonik modelleri (SAF; istemci de import edebilir).
//
// Hesap motoru Roxy'dir. KP, Vedik D1'den AYRI bir tekniktir: evler Placidus cusp'larıyla başlar (bütün-burç DEĞİL), her nokta
// sign → star (nakshatra) → sub → sub-sub lord hiyerarşisiyle okunur. Teknik katmana sağlayıcı anlatısı (houseThemes) GİRMEZ.

import type { SignId } from "./western";
import type { NakshatraId, VedicGrahaId } from "./vedic";

export const KP_AYANAMSA_IDS = ["kp-newcomb", "kp-old"] as const;
export type KpAyanamsaId = (typeof KP_AYANAMSA_IDS)[number];

/** Klasik burç yöneticileri (KP L4 "sahip" = cusp burcunun yöneticisi). */
export const SIGN_LORDS: Readonly<Record<SignId, VedicGrahaId>> = {
  aries: "mars", taurus: "venus", gemini: "mercury", cancer: "moon", leo: "sun", virgo: "mercury",
  libra: "venus", scorpio: "mars", sagittarius: "jupiter", capricorn: "saturn", aquarius: "saturn", pisces: "jupiter",
};

export type KpPoint = {
  /** KP ayanamsalı sidereal boylam (0…360). */
  longitude: number;
  rashi: SignId;
  degreeInRashi: number;
  signLord: VedicGrahaId;
  nakshatra: { index: number; id: NakshatraId; pada: 1 | 2 | 3 | 4 };
  starLord: VedicGrahaId;
  subLord: VedicGrahaId;
  /** Horary cusp'larında Roxy sub-sub lord VERMEZ → null (uydurulmaz). */
  subSubLord: VedicGrahaId | null;
  /** KP numarası 1…249 (burç sınırında bölünen alt bölümler ayrı numaralanır). */
  kpNumber: number;
};
export type KpCusp = KpPoint & { house: number };
export type KpBody = KpPoint & { id: VedicGrahaId; house: number; retrograde: boolean | null };

/** KP 4 düzey: 1 = yıldızı ev sakininde olan, 2 = sakin, 3 = yıldızı ev sahibinde olan, 4 = sahip. */
export type KpLevel = 1 | 2 | 3 | 4;
export type KpSignificators = {
  /** levels = SADE KP kuralı (ev tablosuyla birebir). agent = Roxy horary ucunun düğümler için ajan ekli listesi (varsa). */
  planets: { id: VedicGrahaId; levels: Record<KpLevel, number[]>; agent?: { levels: Record<KpLevel, number[]>; houses: number[] } }[];
  houses: { house: number; levels: Record<KpLevel, VedicGrahaId[]> }[];
};

export const KP_CHART_TECHNICAL_SCHEMA = "astro.kp.chart.v1" as const;
export type KpChartTechnical = {
  schema: typeof KP_CHART_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: { ayanamsa: KpAyanamsaId; ayanamsaDegrees: number };
  /** KP ev sistemi: Placidus cusp'ları (Roxy'de başka seçenek yok). */
  houseSystem: "placidus";
  nodeType: "mean" | "true";
  ascendant: KpPoint;
  cusps: KpCusp[];
  /** 7 graha + Rahu + Ketu; ev = Placidus cusp aralığı. */
  bodies: KpBody[];
  significators: KpSignificators;
};
export const KP_CHART_INTERP_SCHEMA = "astro.kp.chart.interp.v1" as const;
export type KpChartInterpretation = { schema: typeof KP_CHART_INTERP_SCHEMA; houseThemes: { house: number; keywords: string[] }[] };

// ─── 6F: Ruling Planets · KP transit (efemeris) · Horary ──────────────────────
export type KpLordSet = { sign: VedicGrahaId; star: VedicGrahaId; sub: VedicGrahaId; subSub: VedicGrahaId };
export const KP_RULING_TECHNICAL_SCHEMA = "astro.kp.ruling.v1" as const;
export type KpRulingTechnical = {
  schema: typeof KP_RULING_TECHNICAL_SCHEMA;
  /** Roxy: ruling planets ucu ayanamsa ALMAZ (KP-Newcomb dahili) → çerçeve sabit. */
  frame: { ayanamsa: "kp-newcomb" };
  at: { utc: string; local: string; utcOffsetHours: number };
  place: { latitude: number; longitude: number };
  /** Gün lordu — Hindu vara (gün doğumu esaslı; Roxy). */
  dayLord: VedicGrahaId;
  moon: KpLordSet;
  lagna: KpLordSet;
  /** Roxy sırası (güçlüden zayıfa); klasik 5 öğe: gün lordu, Ay burç/yıldız, Lagna burç/yıldız (sub lordlar kümeye girmez). */
  rulingPlanets: VedicGrahaId[];
  /** Her ruling planet'in natal haritada gösterdiği evler (Roxy, güç sırası). */
  significators: { id: VedicGrahaId; houses: number[] }[];
};
export const KP_TRANSIT_TECHNICAL_SCHEMA = "astro.kp.transit.v1" as const;
export type KpTransitTechnical = {
  schema: typeof KP_TRANSIT_TECHNICAL_SCHEMA;
  frame: { ayanamsa: KpAyanamsaId; ayanamsaDegrees: number };
  nodeType: "mean" | "true";
  at: { utc: string };
  /** Roxy /kp/planets-interval tek an: KP hiyerarşili gökyüzü. Natal cusp'lara göre ev / transit analizi Roxy'de YOK (KISMİ). */
  bodies: (KpPoint & { id: VedicGrahaId; retrograde: boolean })[];
};
export const KP_HORARY_TECHNICAL_SCHEMA = "astro.kp.horary.v1" as const;
export type KpHoraryTechnical = {
  schema: typeof KP_HORARY_TECHNICAL_SCHEMA;
  frame: { ayanamsa: KpAyanamsaId; ayanamsaDegrees: number };
  houseSystem: "placidus";
  nodeType: "mean" | "true";
  horaryNumber: number;
  at: { utc: string };
  place: { latitude: number; longitude: number };
  /** Sayının KP alt bölümü; Asc = alt bölümün ORTA noktası (Roxy). */
  span: { from: number; to: number };
  ascendant: KpPoint;
  cusps: KpCusp[];
  bodies: KpBody[];
  significators: KpSignificators;
  ruling: { dayLord: VedicGrahaId; moon: KpLordSet; lagna: KpLordSet; rulingPlanets: VedicGrahaId[] };
};
export const KP_EXTRA_INTERP_SCHEMA = "astro.kp.extra.interp.v1" as const;
export type KpExtraInterpretation = { schema: typeof KP_EXTRA_INTERP_SCHEMA; houseThemes: { house: number; keywords: string[] }[] };

// ─── Aşama 6.1A: Rahu/Ketu significator YÖNTEM etiketleri (hesap DEĞİL; yalnız sunum) ──────────────
/**
 * Roxy düğüm (Rahu/Ketu) significator'larını uç noktaya göre FARKLI kurallarla verir (golden'larla gösterildi,
 * docs/astrology/phase6-1-rahu-ketu-method-audit.md). Yaşam Sistemi bu kuralları HESAPLAMAZ; yalnız hangi listenin
 * hangi kuraldan geldiğini adlandırır. "status" = bağımsız denetimin vardığı güven düzeyi.
 */
export type KpNodeSigMethodId = "plain" | "agent" | "sign_lord";
export const KP_NODE_SIG_METHODS: Readonly<Record<KpNodeSigMethodId, { short: string; label: string; detail: string; status: string }>> = {
  plain: {
    short: "sade kural",
    label: "Sade 4 düzey (düğüm ajanlığı uygulanmaz)",
    detail:
      "Düğüm sıradan graha gibi okunur: L1 yıldız lordunun evi, L2 kendi evi, L3 yıldız lordunun sahip olduğu evler; düğüm burç sahibi olmadığından L4 boştur. Roxy bu uçta düğümleri 'burç lordunun ajanı' diye tanımlar ama tabloya ajan evlerini eklemez.",
    status: "Bağımsız olarak doğrulandı (golden; natal + horary).",
  },
  agent: {
    short: "ajan ekli",
    label: "Ajan ekli 4 düzey (düğüm + burç lordu + aynı burçtaki + karşı burçtaki grahalar)",
    detail:
      "Düğümün kendi düzeylerine, ajanı sayılan grahaların aynı düzeydeki evleri eklenir. Roxy dasha ucu bu kuralı 'kavuşan, bakan, burç lordu' diye belgeler. Golden'larda ajanlar = burç lordu + aynı burçtaki grahalar + 7. burçtaki grahalar; Mars'ın 4. bakışı sayılmadı. 7. burç bakışı ile 'karşı düğümle kavuşma' bu verilerle ayırt edilemez.",
    status: "Golden'larla tutarlı (4 düğüm × 4 düzey); 'bakış' kapsamı kısmen belirsiz.",
  },
  sign_lord: {
    short: "burç lordu kümesi",
    label: "Burç lordunun significator kümesi (Roxy belgelemiyor)",
    detail:
      "Bu uçta düğümün ev listesi, düğümün kendi 4 düzeyi değil, bulunduğu burcun lordunun ev kümesiyle aynıdır. Sıra o lordun düzey sırasına da uymaz. Roxy belgesi bu uç için yalnız '4 düzey KP hiyerarşisi' der; düğüm kuralı yazılı değildir.",
    status: "Belgelenmemiş; tek örnekle gözlendi (Ketu) — kesin kural sayılmamalı.",
  },
};
/** Hangi KP uç/alanının düğüm listesi hangi kuralla gelir (Aşama 6.1A golden denetimi). */
export const KP_NODE_SIG_SOURCE = {
  chart: "plain",
  horaryLevels: "plain",
  horaryAgent: "agent",
  dasha: "agent",
  ruling: "sign_lord",
} as const satisfies Record<string, KpNodeSigMethodId>;
export const isKpNode = (id: string): boolean => id === "rahu" || id === "ketu";
