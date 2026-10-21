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
  /**
   * Aşama 9A-P2-04: gözlem yeri doğum yerinden farklıysa significator İSTENMEZ (Roxy natal haritayı da gözlem yerinde
   * kurduğu için yanlış olurdu) → "place_differs". Alan yoksa (eski kayıt) significator'lar istekteki konumla hesaplanmıştır.
   */
  significatorsOmitted?: "place_differs";
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
/**
 * TRANSİT-03 (2026-10-17): KP Transit ZAMAN ARALIĞI kipi. Sağlayıcı uçları (OpenAPI 2.0.0'dan doğrulandı):
 *   • /vedic-astrology/kp/sublord-changes — gezegen başına (Güneş…Satürn; Rahu/Ketu YOK), ≤365 gün, KP numarası (1–249)
 *     geçişleri: önceki/yeni KP no + sub-lord + yıldız (nakshatra) lordu
 *   • /vedic-astrology/kp/rasi-changes — gezegen başına, ≤365 gün, rasi (burç) geçişleri + burç yöneticileri
 *   • /vedic-astrology/kp/planets-interval — ≤7 gün, 15–1440 dk aralıklarla 9 graha KP konumu
 * Saat dilimi 0 (UTC) gönderilir: sağlayıcı aralık boyunca TEK ofset kullanır (yaz saati geçişini aralık içinde uygulamaz) →
 * anlar UTC saklanır, gösterim seçilen IANA diliminde yapılır. Gezegen/tür başına bir istek = bir "parça".
 */
export const KP_TIMING_TECHNICAL_SCHEMA = "astro.kp.transit_timing.v1" as const;
export const KP_TIMING_PLANETS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"] as const;
export type KpTimingPlanet = (typeof KP_TIMING_PLANETS)[number];
export const KP_TIMING_KINDS = ["sublord", "rasi", "positions"] as const;
export type KpTimingKind = (typeof KP_TIMING_KINDS)[number];
export type KpSublordChange = {
  atUtc: string;
  fromKp: number;
  toKp: number;
  fromSub: VedicGrahaId;
  toSub: VedicGrahaId;
  fromStar: VedicGrahaId;
  toStar: VedicGrahaId;
  /**
   * Gerçek yanıtta (17.10.2026, 92 gün Ay) saptanan sağlayıcı kusuru: Krittika / Ardra başlangıcında satır "46→46" gibi ESKİ
   * KP no + sub-lord ile gelir (yeni yıldız lordu doğru). Değer, sağlayıcının kendi sonraki kaydı + bağımsız KP tablosu
   * tutarlıysa düzeltilir ve bu alanla İŞARETLENİR (ekranda / raporda görünür; sessiz değişiklik yok).
   */
  corrected?: { providerToKp: number; providerToSub: VedicGrahaId };
};
export const KP_PROVIDER_CORRECTION_NOTE =
  "* Sağlayıcı bu geçişte yeni KP numarasını ve sub-lord'u önceki değerle bildirdi (yeni yıldız lordu doğruydu). Değer, sağlayıcının bir sonraki kaydı ve bağımsız KP tablosuyla tutarlı olarak düzeltildi; geçiş anı sağlayıcınındır.";
export type KpRasiChange = { atUtc: string; fromRashi: SignId; toRashi: SignId; fromLord: VedicGrahaId; toLord: VedicGrahaId };
export type KpPositionRow = { atUtc: string; bodies: (KpPoint & { id: VedicGrahaId; retrograde: boolean })[] };
/** Tek sağlayıcı yanıtının (parçanın) teknik katmanı; birleşik teknik bunlardan kurulur. */
export type KpTimingPart =
  | { kind: "sublord"; planet: KpTimingPlanet; window: { startDate: string; endDate: string }; changes: KpSublordChange[] }
  | { kind: "rasi"; planet: KpTimingPlanet; window: { startDate: string; endDate: string }; changes: KpRasiChange[] }
  | { kind: "positions"; window: { startUtc: string; endUtc: string }; intervalMinutes: number; ayanamsaDegrees: number; rows: KpPositionRow[] };
export type KpTimingTechnical = {
  schema: typeof KP_TIMING_TECHNICAL_SCHEMA;
  frame: { ayanamsa: KpAyanamsaId; ayanamsaDegrees: number | null };
  nodeType: "mean" | "true";
  /** UTC takvim günleri, iki uç dahil. */
  window: { startDate: string; endDate: string };
  planets: KpTimingPlanet[];
  kinds: KpTimingKind[];
  sublord: { planet: KpTimingPlanet; changes: KpSublordChange[] }[];
  rasi: { planet: KpTimingPlanet; changes: KpRasiChange[] }[];
  positions: { intervalMinutes: number; rows: KpPositionRow[] } | null;
  /** Hesaplanamayan (başarısız / süre sınırı) parçalar — sessizce düşürülmez, ekranda ve raporda listelenir. */
  missing: string[];
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

// ─── Aşama 6.1A / 6.2: Rahu/Ketu significator YÖNTEM etiketleri (hesap DEĞİL; yalnız sunum) ─────────
/**
 * Roxy düğüm (Rahu/Ketu) significator'larını uç noktaya göre FARKLI kurallarla verir. Kanıt: 6.1 golden'ları + 6.2'nin
 * 3 ayırt edici sentetik golden'ı (docs/astrology/phase6-1-rahu-ketu-method-audit.md §7). Yaşam Sistemi bu kuralları
 * HESAPLAMAZ; yalnız hangi listenin hangi kuraldan geldiğini adlandırır. "status" = bağımsız denetimin vardığı güven düzeyi.
 * Ajan (Roxy): burç lordu + düğümle AYNI burçtaki grahalar + düğümden 7. burçtaki grahalar (burç bazlı; derece orbu yok).
 */
export type KpNodeSigMethodId = "plain" | "agent" | "agent_houses";
export const KP_NODE_SIG_METHODS: Readonly<Record<KpNodeSigMethodId, { short: string; label: string; detail: string; status: string }>> = {
  plain: {
    short: "sade kural",
    label: "Sade 4 düzey (düğüm ajanlığı uygulanmaz)",
    detail:
      "Düğüm sıradan graha gibi okunur: L1 yıldız lordunun evi, L2 kendi evi, L3 yıldız lordunun sahip olduğu evler; düğüm burç sahibi olmadığından L4 boştur. Bu hesaplamada düğümler 'burç lordunun ajanı' diye tanımlanır ama tabloya ajan evleri eklenmez.",
    status: "Bağımsız olarak doğrulandı (doğum haritası + horary örnekleriyle).",
  },
  agent: {
    short: "ajan ekli",
    label: "Ajan ekli 4 düzey (düğüm + burç lordu + aynı burçtaki + 7. burçtaki grahalar)",
    detail:
      "Düğümün kendi düzeylerine, ajanlarının aynı düzeydeki evleri eklenir. Ajan = burç lordu + düğümle aynı burçtaki grahalar + düğümden 7. burçtaki grahalar. Kavuşma ve karşıtlık burç bazlıdır: aynı burçta 19.5° uzaktaki graha ajan sayılır, komşu burçta 2.8° yakındaki sayılmaz. Jüpiter'in 9., Satürn'ün 3. ve Mars'ın 4. özel bakışları sayılmaz. Ketu her zaman Rahu'nun 7. burcunda olduğundan '7. burç bakışı' ile 'karşı düğümle kavuşma' aynı sonucu verir.",
    status: "Bağımsız olarak doğrulandı (3 doğum, 6 düğüm listesiyle). Jüpiter 5., Satürn 10. ve Mars 8. bakışları ayrıca sınanmadı.",
  },
  agent_houses: {
    short: "ajan evleri",
    label: "Ajan evleri: düğüm ve ajanlarının bulunduğu + sahip olduğu evler (düzeysiz; yıldız düzeyleri yok)",
    detail:
      "Bu uçta düğümün listesi, ajan ekli kuralın yalnız L2 (bulunduğu evler) ve L4 (sahip olduğu evler) kısmıdır. Yıldız lordundan gelen L1/L3 evleri eklenmez. Sıra: önce düğümün kendi evi, sonra kavuşan / 7. burçtaki ajanlar, en son burç lordu. Görünür grahalarda ise bu uç tam 4 düzeyi verir. Hesaplama belgesi bu teknik için yalnız '4 düzey KP hiyerarşisi' der; düğümdeki farkı yazmaz.",
    status: "Bağımsız olarak doğrulandı (2 doğum, 3 liste, sıra dahil). Hesaplama belgesinde tanımlanmamış bir uygulama (belgelenmemiş).",
  },
};
/** Hangi KP uç/alanının düğüm listesi hangi kuralla gelir (Aşama 6.1A + 6.2 golden denetimi). */
export const KP_NODE_SIG_SOURCE = {
  chart: "plain",
  horaryLevels: "plain",
  horaryAgent: "agent",
  dasha: "agent",
  ruling: "agent_houses",
} as const satisfies Record<string, KpNodeSigMethodId>;
export const isKpNode = (id: string): boolean => id === "rahu" || id === "ketu";
