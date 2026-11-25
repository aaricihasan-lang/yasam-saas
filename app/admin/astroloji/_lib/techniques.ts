// Astroloji owner UI — teknik seçimi için İSTEMCİ meta verisi (SAF).
// Sunucudaki teknik tanımları (lib/astrology/engine/techniques) istemci paketine ALINMAZ; burada yalnız
// etiket + hangi parametrenin sorulacağı tutulur. Seçenekler sunucuda yeniden doğrulanır/normalize edilir.

import { addDaysIso, dateInputIssue, formatInZone, horaryDisplayZone, localToUtcPreview, questionMomentLabel, timeInputIssue } from "@/lib/astrology/transitDetail";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";
import type { HouseSystem, NodeType } from "@/lib/astrology/model/western";
import type { NatalHouseSystemOption } from "@/lib/astrology/model/natalHouseSystems";
import { NATAL_HOUSE_SYSTEM_LABELS } from "@/lib/astrology/labels/tr";
import { profectionAgeOf, profectionAgeOn } from "@/lib/astrology/model/westernProfections";
import { KP_RI_DEFAULT, kpIntervalWindowOk } from "@/lib/astrology/model/kpRulingInterval";
import { EXTRA_SECTIONS, extraSectionsOf, type ExtraSection } from "@/lib/astrology/model/westernExtraPoints";
// 2026-10-22 — Gezegen dönüşleri (ayrı satır: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { PLANETARY_RETURN_LABELS, isPlanetaryReturnPlanet, type PlanetaryReturnPlanet } from "@/lib/astrology/model/westernPlanetaryReturn";
// 2026-10-22 — Deklinasyon paralelleri (ayrı satır: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { DECLINATION_ORB_DEFAULT, declinationMonthLabel, declinationMonthOk } from "@/lib/astrology/model/westernDeclination";
// 02.11.2026 — Klasik asalet ve almuten (#644) (ayrı satır: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { DEFAULT_DIGNITY_SCHOOL, DIGNITY_SCHOOL_LABELS, isDignitySchool } from "@/lib/astrology/model/westernClassicalDignities";
import type { DignitySchoolId } from "@/lib/astrology/dignities/schools";
// 02.11.2026 — Transit taraması (#646) (ayrı satır: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { TRANSIT_SCAN_ASPECTS, TRANSIT_SCAN_BODIES, TRANSIT_SCAN_ORB_DEFAULT, TRANSIT_SCAN_POINTS, transitScanRangeIssue, type TransitScanAspect, type TransitScanBody, type TransitScanPoint } from "@/lib/astrology/model/westernTransitScan";
// 2026-10-22 — Vedik aylık zamanlama (ayrı satır: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { VEDIC_MONTHLY_DEFAULT_SECTIONS, vedicMonthlySectionsOf, vedicMonthOk, type VedicMonthlySection } from "@/lib/astrology/model/vedicMonthly";
// I18N-F1-R5 (ATLAS-B): teknik adları / ipuçları / seçenek özetleri / eksik alan nedenleri katalogdan (atlas.techniques).
import trTechniques from "@/messages/tr/atlas.techniques.json";

/**
 * I18N-F1-R5 (ATLAS-B) — metin kaynağı. Kanonik kimlikler (teknik id, seçenek kodları) DEĞİŞMEZ; yalnız gösterim metni.
 * Varsayılan = kaynak dil (tr) katalogdan düz `{ad}` biçimleyici: Word/PDF (report/model.ts), sunucu planı ve eski çağıranlar
 * BAYT-BAYT eski metni alır. Ekran `useTranslations("atlas.techniques")` çevirmenini geçirir (EN dahil).
 */
export type TechText = (key: string, values?: Record<string, string | number>) => string;
type TechTree = { [k: string]: string | TechTree };
const TR_TECH_TREE = (trTechniques as unknown as { atlas: { techniques: TechTree } }).atlas.techniques;
export const TECH_TEXT_TR: TechText = (key, values) => {
  let node: string | TechTree | undefined = TR_TECH_TREE;
  for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
  if (typeof node !== "string") throw new Error(`atlas.techniques: anahtar yok: ${key}`);
  return values ? node.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m)) : node;
};
/** Katalog anahtarı var mı (bilinmeyen kod → ham değer gösterilir; eski davranış). */
const hasTech = (key: string): boolean => {
  let node: string | TechTree | undefined = TR_TECH_TREE;
  for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
  return typeof node === "string";
};
const metaKey = (id: string) => `meta.${id}`;

export const UI_TECHNIQUES = [
  "western.natal",
  "western.transit",
  "western.forecast",
  "western.progression",
  "western.solar_arc",
  "western.solar_return",
  "western.lunar_return",
  "western.synastry",
  "western.composite",
  "western.astrocartography",
  "western.relocation",
  "western.local_space",
  "western.fixed_stars",
  "western.profections",
  "western.extra_points",
  "western.planetary_return",
  // 2026-10-22: aylık gökyüzü takvimi (doğum verisi kullanılmaz).
  "western.declination_parallels",
  // 02.11.2026 (#644): klasik asalet ve almuten (Natal sonucu + yerel motor).
  "western.classical_dignities",
  // 02.11.2026 (#646): transit taraması (Natal sonucu + yerel tarama; aralık ≤ 1 yıl).
  "western.transit_scan",
  "vedic.d1",
  "vedic.varga",
  "vedic.dasha",
  "vedic.drishti",
  "vedic.ashtakavarga",
  "vedic.shadbala",
  "vedic.panchanga",
  "vedic.transit",
  "vedic.bhav_chalit",
  "vedic.chara_karaka",
  "vedic.arudha",
  "vedic.bhava_bala",
  // 2026-10-22 (yalnız ek): Vedik eşleştirme (iki kişi) + Sade Sati.
  "vedic.gun_milan",
  "vedic.sade_sati",
  // 2026-10-22 gece (yalnız ek): Güney Hint On Porutham + Papasamyam (Gun Milan'dan ayrı teknikler, aynı eşleştirme grubu).
  "vedic.dashakoot",
  "vedic.papasamyam",
  // 22.10.2026 Vedik noktalar (yalnız ek).
  "vedic.upagraha",
  "vedic.heliacal",
  // 2026-10-22 (yalnız ek): Vedik aylık zamanlama.
  "vedic.monthly",
  "kp.chart",
  "kp.dasha",
  "kp.ruling",
  "kp.transit",
  "kp.horary",
  "kp.ruling_interval",
] as const;
export type UiTechniqueId = (typeof UI_TECHNIQUES)[number];

export const TECHNIQUE_META: Record<UiTechniqueId, { label: string; hint: string; needsPartner: boolean; needsTime: boolean }> = {
  "western.natal": { label: TECH_TEXT_TR("meta.western.natal.label"), hint: TECH_TEXT_TR("meta.western.natal.hint"), needsPartner: false, needsTime: false },
  "western.transit": { label: TECH_TEXT_TR("meta.western.transit.label"), hint: TECH_TEXT_TR("meta.western.transit.hint"), needsPartner: false, needsTime: false },
  "western.forecast": { label: TECH_TEXT_TR("meta.western.forecast.label"), hint: TECH_TEXT_TR("meta.western.forecast.hint"), needsPartner: false, needsTime: false },
  "western.progression": { label: TECH_TEXT_TR("meta.western.progression.label"), hint: TECH_TEXT_TR("meta.western.progression.hint"), needsPartner: false, needsTime: false },
  "western.solar_arc": { label: TECH_TEXT_TR("meta.western.solar_arc.label"), hint: TECH_TEXT_TR("meta.western.solar_arc.hint"), needsPartner: false, needsTime: false },
  "western.solar_return": { label: TECH_TEXT_TR("meta.western.solar_return.label"), hint: TECH_TEXT_TR("meta.western.solar_return.hint"), needsPartner: false, needsTime: true },
  "western.lunar_return": { label: TECH_TEXT_TR("meta.western.lunar_return.label"), hint: TECH_TEXT_TR("meta.western.lunar_return.hint"), needsPartner: false, needsTime: true },
  "western.synastry": { label: TECH_TEXT_TR("meta.western.synastry.label"), hint: TECH_TEXT_TR("meta.western.synastry.hint"), needsPartner: true, needsTime: false },
  "western.composite": { label: TECH_TEXT_TR("meta.western.composite.label"), hint: TECH_TEXT_TR("meta.western.composite.hint"), needsPartner: true, needsTime: false },
  "western.astrocartography": { label: TECH_TEXT_TR("meta.western.astrocartography.label"), hint: TECH_TEXT_TR("meta.western.astrocartography.hint"), needsPartner: false, needsTime: true },
  "western.relocation": { label: TECH_TEXT_TR("meta.western.relocation.label"), hint: TECH_TEXT_TR("meta.western.relocation.hint"), needsPartner: false, needsTime: true },
  "western.local_space": { label: TECH_TEXT_TR("meta.western.local_space.label"), hint: TECH_TEXT_TR("meta.western.local_space.hint"), needsPartner: false, needsTime: true },
  "western.fixed_stars": { label: TECH_TEXT_TR("meta.western.fixed_stars.label"), hint: TECH_TEXT_TR("meta.western.fixed_stars.hint"), needsPartner: false, needsTime: false },
  "western.profections": { label: TECH_TEXT_TR("meta.western.profections.label"), hint: TECH_TEXT_TR("meta.western.profections.hint"), needsPartner: false, needsTime: true },
  "western.extra_points": { label: TECH_TEXT_TR("meta.western.extra_points.label"), hint: TECH_TEXT_TR("meta.western.extra_points.hint"), needsPartner: false, needsTime: false },
  "western.planetary_return": { label: TECH_TEXT_TR("meta.western.planetary_return.label"), hint: TECH_TEXT_TR("meta.western.planetary_return.hint"), needsPartner: false, needsTime: true },
  "western.transit_scan": { label: TECH_TEXT_TR("meta.western.transit_scan.label"), hint: TECH_TEXT_TR("meta.western.transit_scan.hint"), needsPartner: false, needsTime: false },
  "western.classical_dignities": { label: TECH_TEXT_TR("meta.western.classical_dignities.label"), hint: TECH_TEXT_TR("meta.western.classical_dignities.hint"), needsPartner: false, needsTime: true },
  "western.declination_parallels": { label: TECH_TEXT_TR("meta.western.declination_parallels.label"), hint: TECH_TEXT_TR("meta.western.declination_parallels.hint"), needsPartner: false, needsTime: false },
  "vedic.d1": { label: TECH_TEXT_TR("meta.vedic.d1.label"), hint: TECH_TEXT_TR("meta.vedic.d1.hint"), needsPartner: false, needsTime: true },
  "vedic.drishti": { label: TECH_TEXT_TR("meta.vedic.drishti.label"), hint: TECH_TEXT_TR("meta.vedic.drishti.hint"), needsPartner: false, needsTime: true },
  "vedic.ashtakavarga": { label: TECH_TEXT_TR("meta.vedic.ashtakavarga.label"), hint: TECH_TEXT_TR("meta.vedic.ashtakavarga.hint"), needsPartner: false, needsTime: true },
  "vedic.shadbala": { label: TECH_TEXT_TR("meta.vedic.shadbala.label"), hint: TECH_TEXT_TR("meta.vedic.shadbala.hint"), needsPartner: false, needsTime: true },
  "vedic.panchanga": { label: TECH_TEXT_TR("meta.vedic.panchanga.label"), hint: TECH_TEXT_TR("meta.vedic.panchanga.hint"), needsPartner: false, needsTime: true },
  "vedic.transit": { label: TECH_TEXT_TR("meta.vedic.transit.label"), hint: TECH_TEXT_TR("meta.vedic.transit.hint"), needsPartner: false, needsTime: true },
  "vedic.bhav_chalit": { label: TECH_TEXT_TR("meta.vedic.bhav_chalit.label"), hint: TECH_TEXT_TR("meta.vedic.bhav_chalit.hint"), needsPartner: false, needsTime: true },
  "vedic.chara_karaka": { label: TECH_TEXT_TR("meta.vedic.chara_karaka.label"), hint: TECH_TEXT_TR("meta.vedic.chara_karaka.hint"), needsPartner: false, needsTime: true },
  "vedic.arudha": { label: TECH_TEXT_TR("meta.vedic.arudha.label"), hint: TECH_TEXT_TR("meta.vedic.arudha.hint"), needsPartner: false, needsTime: true },
  "vedic.bhava_bala": { label: TECH_TEXT_TR("meta.vedic.bhava_bala.label"), hint: TECH_TEXT_TR("meta.vedic.bhava_bala.hint"), needsPartner: false, needsTime: true },
  "kp.chart": { label: TECH_TEXT_TR("meta.kp.chart.label"), hint: TECH_TEXT_TR("meta.kp.chart.hint"), needsPartner: false, needsTime: true },
  "kp.dasha": { label: TECH_TEXT_TR("meta.kp.dasha.label"), hint: TECH_TEXT_TR("meta.kp.dasha.hint"), needsPartner: false, needsTime: true },
  "kp.ruling": { label: TECH_TEXT_TR("meta.kp.ruling.label"), hint: TECH_TEXT_TR("meta.kp.ruling.hint"), needsPartner: false, needsTime: true },
  "kp.transit": { label: TECH_TEXT_TR("meta.kp.transit.label"), hint: TECH_TEXT_TR("meta.kp.transit.hint"), needsPartner: false, needsTime: false },
  "kp.horary": { label: TECH_TEXT_TR("meta.kp.horary.label"), hint: TECH_TEXT_TR("meta.kp.horary.hint"), needsPartner: false, needsTime: false },
  "kp.ruling_interval": { label: TECH_TEXT_TR("meta.kp.ruling_interval.label"), hint: TECH_TEXT_TR("meta.kp.ruling_interval.hint"), needsPartner: false, needsTime: false },
  "vedic.dasha": { label: TECH_TEXT_TR("meta.vedic.dasha.label"), hint: TECH_TEXT_TR("meta.vedic.dasha.hint"), needsPartner: false, needsTime: true },
  "vedic.varga": { label: TECH_TEXT_TR("meta.vedic.varga.label"), hint: TECH_TEXT_TR("meta.vedic.varga.hint"), needsPartner: false, needsTime: true },
  "vedic.gun_milan": { label: TECH_TEXT_TR("meta.vedic.gun_milan.label"), hint: TECH_TEXT_TR("meta.vedic.gun_milan.hint"), needsPartner: true, needsTime: true },
  "vedic.monthly": { label: TECH_TEXT_TR("meta.vedic.monthly.label"), hint: TECH_TEXT_TR("meta.vedic.monthly.hint"), needsPartner: false, needsTime: false },
  "vedic.sade_sati": { label: TECH_TEXT_TR("meta.vedic.sade_sati.label"), hint: TECH_TEXT_TR("meta.vedic.sade_sati.hint"), needsPartner: false, needsTime: true },
  "vedic.dashakoot": { label: TECH_TEXT_TR("meta.vedic.dashakoot.label"), hint: TECH_TEXT_TR("meta.vedic.dashakoot.hint"), needsPartner: true, needsTime: true },
  "vedic.papasamyam": { label: TECH_TEXT_TR("meta.vedic.papasamyam.label"), hint: TECH_TEXT_TR("meta.vedic.papasamyam.hint"), needsPartner: true, needsTime: true },
  "vedic.upagraha": { label: TECH_TEXT_TR("meta.vedic.upagraha.label"), hint: TECH_TEXT_TR("meta.vedic.upagraha.hint"), needsPartner: false, needsTime: true },
  "vedic.heliacal": { label: TECH_TEXT_TR("meta.vedic.heliacal.label"), hint: TECH_TEXT_TR("meta.vedic.heliacal.hint"), needsPartner: false, needsTime: false },
};

export const DASHA_LORD_OPTIONS: [string, string][] = [
  ["ketu", TECH_TEXT_TR("dashaLord.ketu")],
  ["venus", TECH_TEXT_TR("dashaLord.venus")],
  ["sun", TECH_TEXT_TR("dashaLord.sun")],
  ["moon", TECH_TEXT_TR("dashaLord.moon")],
  ["mars", TECH_TEXT_TR("dashaLord.mars")],
  ["rahu", TECH_TEXT_TR("dashaLord.rahu")],
  ["jupiter", TECH_TEXT_TR("dashaLord.jupiter")],
  ["saturn", TECH_TEXT_TR("dashaLord.saturn")],
  ["mercury", TECH_TEXT_TR("dashaLord.mercury")],
];

export const VEDIC_VARGA_OPTIONS: [number, string][] = [
  [9, TECH_TEXT_TR("varga.9")],
  [2, TECH_TEXT_TR("varga.2")],
  [3, TECH_TEXT_TR("varga.3")],
  [4, TECH_TEXT_TR("varga.4")],
  [7, TECH_TEXT_TR("varga.7")],
  [10, TECH_TEXT_TR("varga.10")],
  [12, TECH_TEXT_TR("varga.12")],
  [16, TECH_TEXT_TR("varga.16")],
  [20, TECH_TEXT_TR("varga.20")],
  [24, TECH_TEXT_TR("varga.24")],
  [27, TECH_TEXT_TR("varga.27")],
  [30, TECH_TEXT_TR("varga.30")],
  [40, TECH_TEXT_TR("varga.40")],
  [45, TECH_TEXT_TR("varga.45")],
  [60, TECH_TEXT_TR("varga.60")],
];

export const KP_AYANAMSA_OPTIONS: [string, string][] = [
  ["kp-newcomb", TECH_TEXT_TR("kpAyanamsaOption.kp-newcomb")],
  ["kp-old", TECH_TEXT_TR("kpAyanamsaOption.kp-old")],
];


export const VEDIC_AYANAMSA_OPTIONS: [string, string][] = [
  ["lahiri", TECH_TEXT_TR("vedicAyanamsaOption.lahiri")],
  ["raman", TECH_TEXT_TR("vedicAyanamsaOption.raman")],
  ["kp-newcomb", TECH_TEXT_TR("vedicAyanamsaOption.kp-newcomb")],
  ["kp-old", TECH_TEXT_TR("vedicAyanamsaOption.kp-old")],
];

export type TechniqueParams = {
  /** TRANSİT-01: şimdi (UTC saat başı) · seçilen gün (yerel 12:00) · seçilen gün + saat (dakika). */
  transitMode: "now" | "date" | "custom";
  transitDate: string;
  transitTime: string;
  transitTz: string;
  forecastStart: string;
  forecastDays: number;
  /** Takvim bitiş kutusuna yazılan, henüz geçerli olmayan değer (yazma sırasında ara değer / başlangıçtan önce / sınır dışı). null = yok. */
  forecastEndDraft: string | null;
  /** TRANSİT-01: takvim gösterim saat dilimi (gün gruplaması / yerel saat; istek gövdesine girmez). */
  forecastTz: string;
  targetDate: string;
  returnYear: number;
  lunarMonth: string;
  /** Ay içindeki dönüş sırası (bir takvim ayında 2 lunar return olabilir). */
  lunarSequence: 1 | 2;
  partnerProfileId: string;
  /** Relocation hedefi (konum kimliği sunucuda çözülür). */
  relocationTarget: { id: string; label: string } | null;
  /** Aşama 4.1: Solar/Lunar return dönüş konumu; null = doğum yeri. */
  solarReturnLocation: { id: string; label: string } | null;
  lunarReturnLocation: { id: string; label: string } | null;
  /** Aşama 5: Vedik ayanamsa (tüm Vedik seçimler için ortak). */
  vedicAyanamsa: string;
  /** Aşama 5D: varga bölümü (D9 varsayılan). */
  vargaDivision: number;
  /** Aşama 5E: dasha düzeyi ("" = mahadasha listesi). */
  dashaMd: string;
  dashaAd: string;
  /** 2026-10-21: Sookshma / Prana listesi için pratyantardasha / sookshma yöneticisi ("" = yok). Eski kayıtlı parametrelerde alan olmayabilir. */
  dashaPd?: string;
  dashaSd?: string;
  /** 2026-10-21: "Güncel dönem zinciri" (Vedik + KP ortak): kapalı / şimdi / seçilen an (UTC). */
  dashaChainMode?: "off" | "now" | "custom";
  dashaChainDate?: string;
  dashaChainTime?: string;
  dashaChainTz?: string;
  /** 2026-10-21: Ayrıntılı Panchanga seçeneği (gün + konum). */
  panchangaDetail?: boolean;
  /** 2026-10-22: Gun Milan hesaplama rolü — "partner_first" = karşı taraf 1. rol (geleneksel erkek / damat). Yoksa danışan 1. rol. */
  gunMilanOrder?: "client_first" | "partner_first";
  /** 2026-10-22 gece: On Porutham / Papasamyam hesaplama rolü (Gun Milan'dan bağımsız seçim). Yoksa danışan 1. rol. */
  dashakootOrder?: "client_first" | "partner_first";
  papasamyamOrder?: "client_first" | "partner_first";
  panchangaDate?: string;
  panchangaPlace?: { id: string; label: string } | null;
  /** 2026-10-22: "Gezegen saatleri (Hora) + Choghadiya" seçeneği — Ayrıntılı Panchanga ile AYNI gün + konum alanları. */
  panchangaHours?: boolean;
  /** 22.10.2026 Graha Asta / Udaya: değerlendirme günü ("" = doğum günü) ve gözlem yeri (null = doğum yeri). Eski parametrelerde yok. */
  heliacalDate?: string;
  heliacalPlace?: { id: string; label: string } | null;
  /** Aşama 5.1A: Gochara anı (Batı transitten AYRI parametre). */
  vedicTransitMode: "now" | "custom";
  vedicTransitDate: string;
  vedicTransitTime: string;
  vedicTransitTz: string;
  /** Aşama 6: KP seçenekleri (tüm KP teknikleri ortak). */
  kpAyanamsa: string;
  kpNodeType: string;
  kpDashaMd: string;
  kpDashaAd: string;
  kpDashaPd?: string;
  kpDashaSd?: string;
  /** KP an (ruling / transit / horary ortak): şimdi veya tarih-saat. */
  kpMomentMode: "now" | "custom";
  /** TRANSİT-03: KP transit kipi — tek an (eski) veya zaman aralığı (Sub-Lord / Rasi geçişleri, konum tablosu). */
  kpTransitMode?: "moment" | "range";
  kpRangeStart: string;
  kpRangeDays: number;
  kpRangePlanets: string[];
  kpRangeKinds: string[];
  kpRangeInterval: number;
  kpRangeTz: string;
  kpDate: string;
  kpTime: string;
  kpTz: string;
  horaryNumber: number;
  /** Ruling / horary değerlendirme yeri; null = doğum yeri. */
  kpPlace: { id: string; label: string } | null;
  /**
   * FINAL: gözlem / değerlendirme yeri AÇIK seçimdir — doğum yeri otomatik gözlem yeri kabul edilmez.
   * "unset" → ruling/horary plana alınmaz; "birth" → doğum yeri (istek gövdesi eskisiyle aynı: placeLocationId null);
   * "other" → seçilen konum.
   */
  kpPlaceMode: "unset" | "birth" | "other";
  /** 2026-10-22: KP ruling planets zaman taraması — süre ve adım (dk). Başlangıç = KP ortak an; yer = KP gözlem yeri. Eski parametrelerde yok. */
  kpRiDuration?: number;
  kpRiInterval?: number;
  /** Local space referansı; null = doğum yeri. */
  localSpaceReference: { id: string; label: string } | null;
  /** Sabit yıldızlar: gösterim/rapor orbu (yalnız filtre; sağlayıcıdan her zaman 3° istenir → yeni istek yok). */
  fixedStarsOrb: number;
  /** Sabit yıldızlar: Word/PDF'e 43 yıldızlık katalog eki. */
  fixedStarsCatalog: boolean;
  /** Yıllık profeksiyonlar: seçilen tamamlanmış yaş (null = henüz seçilmedi; doğum tarihi bilinince bu yıl önerilir). */
  profectionAge: number | null;
  /**
   * P2-01 (2026-10-20): profectionAge'in AİT OLDUĞU danışan bağlamı (profectionContextKey: profil | revizyon | doğum tarihi).
   * Bağlam değişince yaş yeni kişinin bu yılına çekilir; uyuşmayan bağlamla profeksiyon plana/çalıştırmaya GİRMEZ.
   */
  profectionFor: string | null;
  /** 22.10.2026 Chara Karaka şeması: "eight" (Rahu dahil, varsayılan) / "seven" (Rahu hariç). Eksikse "eight". */
  charaKarakaScheme?: "eight" | "seven";
  /** 2026-10-22 — Ek noktalar: seçilen bölümler (yoksa üçü de; eski kayıtlı parametrelerde alan yok). */
  extraSections?: ExtraSection[];
  /** 2026-10-22 — Gezegen dönüşü: gezegen, hedef (yaklaşık) tarih, kümedeki kavuşum sırası, dönüş konumu (null = doğum yeri). */
  planetaryReturnPlanet?: PlanetaryReturnPlanet;
  planetaryReturnDate?: string;
  planetaryReturnCrossing?: 1 | 2 | 3;
  planetaryReturnLocation?: { id: string; label: string } | null;
  /** 2026-10-22 — Deklinasyon paralelleri: ay (YYYY-MM, UTC ayı), orb (1 / 1,5 / 2°), gösterim saat dilimi. Eski parametrelerde yok. */
  declinationMonth?: string;
  declinationOrb?: number;
  declinationTz?: string;
  /** 02.11.2026 — Klasik asalet (#644): ekol (varsayılan Lilly 1647) ve ev sistemi (null = Natal'ın ev sistemi seçimi). Eski parametrelerde yok. */
  dignitySchool?: DignitySchoolId;
  dignityHouseSystem?: NatalHouseSystemOption | null;
  /** 02.11.2026 — Transit taraması (#646): aralık (≤ 1 yıl), tek orb (varsayılan 1°), gezegen / nokta / açı seçimi, ek olaylar, gösterim saat dilimi. */
  scanStart?: string;
  scanEnd?: string;
  scanOrb?: number;
  scanBodies?: TransitScanBody[];
  scanPoints?: TransitScanPoint[];
  scanAspects?: TransitScanAspect[];
  scanStations?: boolean;
  scanIngresses?: boolean;
  scanTz?: string;
  /** 2026-10-22 — Vedik aylık zamanlama: yıl / ay (UTC takvim ayı), bölümler, gösterim saat dilimi. Eski kayıtlı parametrelerde yok. */
  vedicMonthlyYear?: number;
  vedicMonthlyMonth?: number;
  vedicMonthlySections?: VedicMonthlySection[];
  vedicMonthlyTz?: string;
};

export const FORECAST_CHUNK_DAYS = 90;
export const FORECAST_MAX_DAYS = 366;

/**
 * "Bugün" Türkiye takvim günüdür (varsayılan saat dilimi Europe/Istanbul). 2026-10-12 canlı UI testi: UTC günü
 * kullanılınca 00:00–03:00 TSİ arasında ilerletme/solar arc/transit/forecast varsayılanları DÜNÜN tarihini gösteriyordu.
 */
export function istanbulDateIso(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function defaultParams(today: Date): TechniqueParams {
  const iso = istanbulDateIso(today);
  return {
    transitMode: "now",
    transitDate: iso,
    transitTime: "12:00",
    transitTz: "Europe/Istanbul",
    forecastStart: iso,
    forecastDays: 90,
    forecastEndDraft: null,
    forecastTz: "Europe/Istanbul",
    targetDate: iso,
    returnYear: Number(iso.slice(0, 4)),
    lunarMonth: iso.slice(0, 7),
    lunarSequence: 1,
    partnerProfileId: "",
    relocationTarget: null,
    localSpaceReference: null,
    solarReturnLocation: null,
    lunarReturnLocation: null,
    vedicAyanamsa: "lahiri",
    vargaDivision: 9,
    dashaMd: "",
    dashaAd: "",
    vedicTransitMode: "now",
    vedicTransitDate: iso,
    vedicTransitTime: "12:00",
    vedicTransitTz: "Europe/Istanbul",
    kpAyanamsa: "kp-newcomb",
    kpNodeType: "mean",
    kpDashaMd: "",
    kpDashaAd: "",
    kpMomentMode: "now",
    kpTransitMode: "moment",
    kpRangeStart: iso,
    kpRangeDays: 7,
    kpRangePlanets: ["sun", "moon"],
    kpRangeKinds: ["sublord", "rasi"],
    kpRangeInterval: 360,
    kpRangeTz: "Europe/Istanbul",
    kpDate: iso,
    kpTime: "12:00",
    kpTz: "Europe/Istanbul",
    horaryNumber: 1,
    kpPlace: null,
    kpPlaceMode: "unset",
    fixedStarsOrb: 1,
    fixedStarsCatalog: false,
    profectionAge: null,
    profectionFor: null,
    charaKarakaScheme: "eight",
    planetaryReturnPlanet: "saturn",
    planetaryReturnDate: iso,
    planetaryReturnCrossing: 1,
    planetaryReturnLocation: null,
    declinationMonth: iso.slice(0, 7),
    declinationOrb: DECLINATION_ORB_DEFAULT,
    declinationTz: "Europe/Istanbul",
    scanStart: iso,
    scanEnd: addDaysIso(iso, 91) ?? iso,
    scanOrb: TRANSIT_SCAN_ORB_DEFAULT,
    scanBodies: [...TRANSIT_SCAN_BODIES],
    scanPoints: [...TRANSIT_SCAN_POINTS],
    scanAspects: [...TRANSIT_SCAN_ASPECTS],
    scanStations: true,
    scanIngresses: true,
    scanTz: "Europe/Istanbul",
    vedicMonthlyYear: Number(iso.slice(0, 4)),
    vedicMonthlyMonth: Number(iso.slice(5, 7)),
    vedicMonthlySections: [...VEDIC_MONTHLY_DEFAULT_SECTIONS],
    vedicMonthlyTz: "Europe/Istanbul",
  };
}

/** Seçili teknikler → sunucu seçim listesi (sıra sabit: UI_TECHNIQUES sırası). */
/**
 * HORARY-P1: "Analizi Başlat"ta gönderilecek seçenek. Normalde planın NORMALİZE seçeneği (önizlemede gösterilen an) gönderilir.
 * KP horary + "şimdi" ise ham `{ now: true }` gönderilir → soru anı, sunucunun çalıştırmayı işlediği gerçek UTC dakikadır
 * (plan, teknik seçildiğinde dakikalar önce alınmış olabilir). Diğer teknikler (transit, ruling: UTC saat başı) DEĞİŞMEZ.
 */
export function runOptionsFor(technique: string, planned: Record<string, unknown> | null | undefined, raw: Record<string, unknown>): Record<string, unknown> {
  if (technique === "kp.horary" && raw.now === true) return raw;
  return planned ?? raw;
}

/**
 * Batı yöntem seçimi (Aşama 3, #643): `houseSystem` = Natal DIŞINDAKİ Batı tekniklerinin 4'lü ORTAK seçimi (davranış aynen);
 * `natalHouseSystem` = YALNIZ Natal'ın 8'li seçimi. İkisi birbirini değiştirmez. Ay düğümü tüm Batı tekniklerinde ortak.
 */
export type WesternMethod = { houseSystem: HouseSystem; nodeType: NodeType; natalHouseSystem: NatalHouseSystemOption };
export const DEFAULT_WESTERN_METHOD: Readonly<WesternMethod> = Object.freeze({ houseSystem: "placidus", nodeType: "true", natalHouseSystem: "placidus" });

export function buildSelections(
  checked: Partial<Record<UiTechniqueId, boolean>>,
  p: TechniqueParams,
  /** natalHouseSystem verilmezse (eski çağıranlar) Natal ortak seçimi kullanır — eski davranış birebir. */
  method: Omit<WesternMethod, "natalHouseSystem"> & { natalHouseSystem?: NatalHouseSystemOption },
): { technique: UiTechniqueId; options: Record<string, unknown> }[] {
  const out: { technique: UiTechniqueId; options: Record<string, unknown> }[] = [];
  for (const id of UI_TECHNIQUES) {
    if (!checked[id]) continue;
    // Eksik / geçersiz tarih-saat (ör. yıl yazılırken "0002-10-17") plana ve API'ye GİRMEZ; neden missingReason'da.
    if (dateInputReason(id, p)) continue;
    switch (id) {
      case "western.natal":
        out.push({ technique: id, options: { houseSystem: method.natalHouseSystem ?? method.houseSystem, nodeType: method.nodeType } });
        break;
      case "western.transit":
        out.push({
          technique: id,
          // TRANSİT-01: saat dilimi gösterim için seçenekte kalır (gövdeye girmez). "Seçilen gün" = o günün yerel 12:00'si.
          options:
            p.transitMode === "now"
              ? { now: true, nodeType: method.nodeType, displayTz: p.transitTz }
              : { date: p.transitDate, time: p.transitMode === "date" ? "12:00" : p.transitTime, timezone: p.transitTz, nodeType: method.nodeType },
        });
        break;
      case "western.forecast":
        out.push({ technique: id, options: { startDate: p.forecastStart, days: p.forecastDays, displayTz: p.forecastTz } });
        break;
      case "western.progression":
      case "western.solar_arc":
        out.push({ technique: id, options: { targetDate: p.targetDate, nodeType: method.nodeType } });
        break;
      case "western.solar_return":
        out.push({ technique: id, options: { returnYear: p.returnYear, houseSystem: method.houseSystem, returnLocationId: p.solarReturnLocation?.id ?? null } });
        break;
      case "western.lunar_return":
        out.push({ technique: id, options: { month: p.lunarMonth, sequence: p.lunarSequence, houseSystem: method.houseSystem, returnLocationId: p.lunarReturnLocation?.id ?? null } });
        break;
      case "western.synastry":
      case "western.composite":
        out.push({ technique: id, options: { partnerProfileId: p.partnerProfileId, houseSystem: method.houseSystem, nodeType: method.nodeType } });
        break;
      case "western.astrocartography":
        out.push({ technique: id, options: {} });
        break;
      case "western.relocation":
        if (p.relocationTarget) out.push({ technique: id, options: { targetLocationId: p.relocationTarget.id, houseSystem: method.houseSystem } });
        break;
      case "western.local_space":
        out.push({ technique: id, options: { referenceLocationId: p.localSpaceReference?.id ?? null } });
        break;
      case "western.fixed_stars":
        out.push({ technique: id, options: { nodeType: method.nodeType, orb: p.fixedStarsOrb, reportCatalog: p.fixedStarsCatalog } });
        break;
      case "western.profections":
        // Yalnız yaş gönderilir (ev sistemi bu teknikte sunucuda sabit bütün-burç); yaş seçilmemişse plana alınmaz.
        if (profectionAgeOf(p.profectionAge) !== null) out.push({ technique: id, options: { age: p.profectionAge } });
        break;
      case "western.extra_points": {
        // Yalnız seçilen bölümler istek açar (her bölüm ayrı uç); bölüm seçilmemişse plana alınmaz.
        const sections = extraSectionsOf(p.extraSections ?? [...EXTRA_SECTIONS]);
        if (sections) out.push({ technique: id, options: { sections, houseSystem: method.houseSystem } });
        break;
      }
      case "western.planetary_return":
        out.push({
          technique: id,
          options: {
            planet: p.planetaryReturnPlanet ?? "saturn",
            approxDate: p.planetaryReturnDate ?? p.targetDate,
            crossing: p.planetaryReturnCrossing ?? 1,
            houseSystem: method.houseSystem,
            returnLocationId: p.planetaryReturnLocation?.id ?? null,
          },
        });
        break;
      case "western.transit_scan":
        // Düğüm türü Batı yöntem seçiminden; gösterim saat dilimi yalnız sunum (önbellek anahtarına girmez — birim Natal'dır).
        out.push({
          technique: id,
          options: {
            start: p.scanStart ?? p.forecastStart,
            end: p.scanEnd ?? addDaysIso(p.scanStart ?? p.forecastStart, 91) ?? (p.scanStart ?? p.forecastStart),
            orb: p.scanOrb ?? TRANSIT_SCAN_ORB_DEFAULT,
            bodies: p.scanBodies ?? [...TRANSIT_SCAN_BODIES],
            points: p.scanPoints ?? [...TRANSIT_SCAN_POINTS],
            aspects: p.scanAspects ?? [...TRANSIT_SCAN_ASPECTS],
            stations: p.scanStations ?? true,
            ingresses: p.scanIngresses ?? true,
            nodeType: method.nodeType,
            displayTz: p.scanTz ?? "Europe/Istanbul",
          },
        });
        break;
      case "western.classical_dignities":
        // Ev sistemi: tekniğin kendi seçimi yoksa Natal'ın 8'li seçimi; düğüm Batı yöntem seçiminden. Sunucu yeniden doğrular.
        out.push({ technique: id, options: { school: p.dignitySchool ?? DEFAULT_DIGNITY_SCHOOL, houseSystem: p.dignityHouseSystem ?? method.natalHouseSystem ?? method.houseSystem, nodeType: method.nodeType } });
        break;
      case "western.declination_parallels":
        // Düğüm türü Batı yöntem seçiminden; gösterim saat dilimi gövdeye girmez (sunucu yalnız gösterim için saklar).
        out.push({ technique: id, options: { month: p.declinationMonth ?? p.lunarMonth, orb: p.declinationOrb ?? DECLINATION_ORB_DEFAULT, nodeType: method.nodeType, displayTz: p.declinationTz ?? "Europe/Istanbul" } });
        break;
      case "vedic.d1":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.drishti":
      case "vedic.ashtakavarga":
      case "vedic.shadbala":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.bhav_chalit":
      case "vedic.arudha":
      case "vedic.bhava_bala":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.chara_karaka":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa, scheme: p.charaKarakaScheme ?? "eight" } });
        break;
      case "vedic.panchanga":
        // Seçenek kapalıyken gövde birebir eski ({ ayanamsa }) → eski kayıt ve önbellek anahtarı aynı.
        // 2026-10-22: Hora + Choghadiya seçeneği yalnız işaretliyse eklenir (yoksa nesne birebir eski).
        if (p.panchangaHours && !p.panchangaDetail) out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa, detailDate: p.panchangaDate || null, placeLocationId: p.panchangaPlace?.id ?? null, hours: true } });
        else out.push({ technique: id, options: p.panchangaDetail ? { ayanamsa: p.vedicAyanamsa, detail: true, detailDate: p.panchangaDate || null, placeLocationId: p.panchangaPlace?.id ?? null, ...(p.panchangaHours ? { hours: true } : {}) } : { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.dasha":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa, ...dashaPathOptions(p.dashaMd, p.dashaAd, p.dashaPd, p.dashaSd), ...dashaChainOptions(p) } });
        break;
      case "vedic.transit":
        out.push({
          technique: id,
          options:
            p.vedicTransitMode === "now"
              ? { ayanamsa: p.vedicAyanamsa, now: true }
              : { ayanamsa: p.vedicAyanamsa, date: p.vedicTransitDate, time: p.vedicTransitTime, timezone: p.vedicTransitTz },
        });
        break;
      case "kp.chart":
        out.push({ technique: id, options: { ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType } });
        break;
      case "kp.dasha":
        out.push({ technique: id, options: { ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType, ...dashaPathOptions(p.kpDashaMd, p.kpDashaAd, p.kpDashaPd, p.kpDashaSd), ...dashaChainOptions(p) } });
        break;
      case "kp.ruling":
      case "kp.transit":
      case "kp.horary": {
        const at = p.kpMomentMode === "now" ? { now: true } : { date: p.kpDate, time: p.kpTime, timezone: p.kpTz };
        // Gözlem yeri seçilmemişse (veya "başka konum" seçili ama konum yok) ruling/horary plana alınmaz.
        if (id !== "kp.transit" && !kpPlaceReady(p)) break;
        if (id === "kp.ruling") out.push({ technique: id, options: { ...at, nodeType: p.kpNodeType, placeLocationId: p.kpPlaceMode === "other" ? (p.kpPlace?.id ?? null) : null } });
        else if (id === "kp.transit" && p.kpTransitMode === "range") out.push({ technique: id, options: { range: kpRangeOptions(p), ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType, displayTz: p.kpRangeTz ?? "Europe/Istanbul" } });
        else if (id === "kp.transit") out.push({ technique: id, options: { ...at, ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType } });
        else out.push({ technique: id, options: { ...at, horaryNumber: p.horaryNumber, ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType, placeLocationId: p.kpPlaceMode === "other" ? (p.kpPlace?.id ?? null) : null } });
        break;
      }
      case "kp.ruling_interval": {
        // Başlangıç = KP ortak an (şimdi: UTC saat başı); gözlem yeri açıkça seçilmeden plana alınmaz (ruling/horary ile aynı kural).
        if (!kpPlaceReady(p)) break;
        const at = p.kpMomentMode === "now" ? { now: true } : { date: p.kpDate, time: p.kpTime, timezone: p.kpTz };
        out.push({ technique: id, options: { ...at, durationMinutes: p.kpRiDuration ?? KP_RI_DEFAULT.durationMinutes, intervalMinutes: p.kpRiInterval ?? KP_RI_DEFAULT.intervalMinutes, ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType, placeLocationId: p.kpPlaceMode === "other" ? (p.kpPlace?.id ?? null) : null } });
        break;
      }
      case "vedic.varga":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa, division: p.vargaDivision } });
        break;
      case "vedic.gun_milan":
        // Rol yalnız "karşı taraf 1. rol" seçilince gönderilir → varsayılan seçim / anahtar eskisiyle aynı.
        out.push({ technique: id, options: { partnerProfileId: p.partnerProfileId, ayanamsa: p.vedicAyanamsa, ...(p.gunMilanOrder === "partner_first" ? { order: "partner_first" } : {}) } });
        break;
      case "vedic.dashakoot":
      case "vedic.papasamyam": {
        // Rol yalnız "karşı taraf 1. rol" seçilince gönderilir (Gun Milan ile aynı sözleşme).
        const ord = id === "vedic.dashakoot" ? p.dashakootOrder : p.papasamyamOrder;
        out.push({ technique: id, options: { partnerProfileId: p.partnerProfileId, ayanamsa: p.vedicAyanamsa, ...(ord === "partner_first" ? { order: "partner_first" } : {}) } });
        break;
      }
      case "vedic.sade_sati":
        // Değerlendirme günü SUNUCUDA belirlenir (bugün, UTC); istemci tarih göndermez.
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      // 22.10.2026 Vedik noktalar: Upagraha = ayanamsa (Vedik ortak); Heliakal = gün (boş → doğum günü) + gözlem yeri (boş → doğum yeri).
      case "vedic.upagraha":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.heliacal":
        out.push({ technique: id, options: { date: p.heliacalDate || null, placeLocationId: p.heliacalPlace?.id ?? null } });
        break;
      case "vedic.monthly": {
        // Ayanamsa sabit Lahiri (ortak Vedik ayanamsa seçimi bu teknikte kullanılmaz); bölüm seçilmemişse plana alınmaz.
        const sections = vedicMonthlySectionsOf(p.vedicMonthlySections ?? [...VEDIC_MONTHLY_DEFAULT_SECTIONS]);
        const ym = vedicMonthlyYm(p);
        if (sections) out.push({ technique: id, options: { year: ym.year, month: ym.month, sections, ayanamsa: "lahiri", displayTz: p.vedicMonthlyTz ?? "Europe/Istanbul" } });
        break;
      }
    }
  }
  return out;
}

/** 2026-10-21: dasha düzey yolu (boş üst düzeyde alt düzey gönderilmez; yeni anahtarlar yalnız doluysa). */
export function dashaPathOptions(md: string, ad: string, pd?: string, sd?: string): Record<string, string | null> {
  const a = md && ad ? ad : null;
  const p = a && pd ? pd : null;
  const s = p && sd ? sd : null;
  return { mahadasha: md || null, antardasha: a, ...(p ? { pratyantardasha: p } : {}), ...(s ? { sookshma: s } : {}) };
}
/**
 * 2026-10-21: "Güncel dönem zinciri" seçeneği. Şimdi → sunucunun gerçek UTC dakikası (chainNow); seçilen an → yerel tarih/saat +
 * IANA bölgeden UTC dakika (sunucunun aynı çözümleyicisiyle). Kapalı veya geçersiz → seçenek YOK (eski davranış).
 */
export function dashaChainOptions(p: TechniqueParams): Record<string, unknown> {
  if (p.dashaChainMode === "now") return { chainNow: true };
  if (p.dashaChainMode !== "custom" || !p.dashaChainDate || !p.dashaChainTime) return {};
  if (dateInputIssue(p.dashaChainDate) || timeInputIssue(p.dashaChainTime)) return {};
  const r = resolveAstroBirthTime(p.dashaChainDate, p.dashaChainTime, p.dashaChainTz || "Europe/Istanbul", "earlier");
  return r.kind === "ok" ? { chainAtUtc: r.utcIso.slice(0, 16) } : {};
}
const LEVEL_TR = ["Antardasha", "Pratyantardasha", "Sookshma", "Prana"];
function dashaLevelLabel(o: Record<string, unknown>, L: TechText): string {
  const lord = (v: unknown) => (DASHA_LORD_OPTIONS.some((x) => x[0] === v) ? L(`dashaLord.${String(v)}`) : String(v));
  const path = [o.mahadasha, o.antardasha, o.pratyantardasha, o.sookshma].filter((x) => typeof x === "string" && x) as string[];
  return path.length ? `${LEVEL_TR[path.length - 1]} · ${path.map(lord).join(" / ")}` : "Mahadasha";
}
const dashaChainLabel = (o: Record<string, unknown>, L: TechText) =>
  typeof o.chainAtUtc === "string" ? L("d.dashaChainAt", { date: fmtDate(o.chainAtUtc, L), time: o.chainAtUtc.slice(11, 16) }) : o.chainNow === true ? L("d.dashaChainNow") : "";

/** 2026-10-22 — Vedik aylık zamanlama: seçilen yıl / ay (eski parametrelerde yoksa transit gününün ayı). */
export function vedicMonthlyYm(p: TechniqueParams): { year: number; month: number } {
  return { year: p.vedicMonthlyYear ?? Number(p.transitDate.slice(0, 4)), month: p.vedicMonthlyMonth ?? Number(p.transitDate.slice(5, 7)) };
}

/** Ruling / horary için gözlem yeri açıkça belirlendi mi? */
export function kpPlaceReady(p: TechniqueParams): boolean {
  return p.kpPlaceMode === "birth" || (p.kpPlaceMode === "other" && !!p.kpPlace);
}

/**
 * Tarih/saat alanı tamamlanmamış veya geçersizse kısa neden (yoksa null). Tarayıcı tarih kutusu yazma sırasında boş
 * dize ya da "0002-10-17" gibi ara değerler üretir; bunlarla hesap / plan / istek YAPILMAZ.
 */
export function dateInputReason(id: UiTechniqueId, p: TechniqueParams, L: TechText = TECH_TEXT_TR): string | null {
  const bad = (date: string, time?: string) => !!(dateInputIssue(date) ?? (time === undefined ? null : timeInputIssue(time)));
  switch (id) {
    case "western.transit":
      // Ekrandaki UTC ön izlemesiyle AYNI karar (sunucunun resolveAstroBirthTime + 1600–2600 UTC yıl sınırı): biçim, yaz saati
      // boşluğu ve UTC'de sınır dışına düşen an da plana / API'ye girmez → ön izleme uyarısı ile Başlat her zaman tutarlı.
      if (p.transitMode === "now") return null;
      if (bad(p.transitDate, p.transitMode === "custom" ? p.transitTime : undefined)) return L("reason.transitDate");
      return localToUtcPreview(p.transitDate, p.transitMode === "date" ? "12:00" : p.transitTime, p.transitTz).ok ? null : L("reason.transitMoment");
    case "western.transit_scan":
      return scanIssueText(transitScanRangeIssue(p.scanStart ?? p.forecastStart, p.scanEnd ?? addDaysIso(p.scanStart ?? p.forecastStart, 91) ?? null), L);
    case "western.forecast":
      return bad(p.forecastStart) ? L("reason.forecastStart") : p.forecastEndDraft != null ? L("reason.forecastEnd") : null;
    case "western.progression":
    case "western.solar_arc":
      return bad(p.targetDate) ? L("reason.targetDate") : null;
    case "vedic.transit":
      return p.vedicTransitMode === "custom" && bad(p.vedicTransitDate, p.vedicTransitTime) ? L("reason.gochara") : null;
    case "kp.transit":
      // TRANSİT-03 zaman aralığı: tek-an tarihi bu kipte kullanılmaz; aralık başlangıcı + aralık ayarları (sunucuyla aynı) denetlenir.
      if (p.kpTransitMode === "range") return kpRangeIssue(p, L);
      return p.kpMomentMode === "custom" && bad(p.kpDate, p.kpTime) ? L("reason.kpDate") : null;
    case "kp.ruling":
    case "kp.horary":
      return p.kpMomentMode === "custom" && bad(p.kpDate, p.kpTime) ? L("reason.kpDate") : null;
    case "kp.ruling_interval":
      if (p.kpMomentMode === "custom" && bad(p.kpDate, p.kpTime)) return L("reason.riStart");
      return kpIntervalWindowOk(p.kpRiDuration ?? KP_RI_DEFAULT.durationMinutes, p.kpRiInterval ?? KP_RI_DEFAULT.intervalMinutes) ? null : L("reason.riWindow");
    case "vedic.dasha":
    case "kp.dasha":
      // 2026-10-21: seçilen an kipinde tamamlanmamış/geçersiz an sessizce düşürülmez — plana girmez, neden gösterilir.
      if (p.dashaChainMode !== "custom") return null;
      if (bad(p.dashaChainDate ?? "", p.dashaChainTime ?? "")) return L("reason.chainDate");
      return localToUtcPreview(p.dashaChainDate ?? "", p.dashaChainTime ?? "", p.dashaChainTz || "Europe/Istanbul").ok ? null : L("reason.chainMoment");
    case "vedic.panchanga":
      return (p.panchangaDetail || p.panchangaHours) && p.panchangaDate && bad(p.panchangaDate) ? (p.panchangaDetail ? L("reason.panchangaDetail") : L("reason.panchangaHours")) : null;
    case "western.planetary_return":
      return bad(p.planetaryReturnDate ?? p.targetDate) ? L("reason.prDate") : null;
    case "western.declination_parallels":
      return declinationMonthOk(p.declinationMonth ?? p.lunarMonth) ? null : L("reason.declination");
    case "vedic.heliacal":
      return p.heliacalDate && bad(p.heliacalDate) ? L("reason.heliacal") : null;
    case "vedic.monthly": {
      const ym = vedicMonthlyYm(p);
      return vedicMonthOk(ym.year, ym.month) ? null : L("reason.monthly");
    }
    default:
      return null;
  }
}

/** Seçili ama eksik ayar yüzünden plana alınmayan tekniğin kısa nedeni (yoksa null). */
export function missingReason(id: UiTechniqueId, p: TechniqueParams, L: TechText = TECH_TEXT_TR): string | null {
  const dateWhy = dateInputReason(id, p, L);
  if (dateWhy) return dateWhy;
  if (TECHNIQUE_META[id].needsPartner && !p.partnerProfileId) return L("reason.partner");
  if (id === "western.relocation" && !p.relocationTarget) return L("reason.relocation");
  if (id === "western.profections" && profectionAgeOf(p.profectionAge) === null) return L("reason.profection");
  if ((id === "kp.ruling" || id === "kp.horary" || id === "kp.ruling_interval") && !kpPlaceReady(p)) return id === "kp.horary" ? L("reason.horaryPlace") : L("reason.observePlace");
  if (id === "western.extra_points" && !extraSectionsOf(p.extraSections ?? [...EXTRA_SECTIONS])) return L("reason.extraSections");
  if (id === "vedic.monthly" && !vedicMonthlySectionsOf(p.vedicMonthlySections ?? [...VEDIC_MONTHLY_DEFAULT_SECTIONS])) return L("reason.monthlySections");
  return null;
}

/** P2-01: profeksiyon seçiminin danışan bağlamı (danışan kimliği + doğum kaydı revizyonu + doğum tarihi). */
export function profectionContextKey(profileId: string | null | undefined, revision: number | null | undefined, birthDate: string | null | undefined): string | null {
  return profileId && revision != null && birthDate ? `${profileId}|${revision}|${birthDate}` : null;
}

/**
 * P2-01: bağlam değiştiyse (başka danışan / revizyon / doğum tarihi) yaşı YENİ kişinin bu yılına çeker; aynı bağlamda kullanıcının
 * seçimine DOKUNMAZ (aynı nesneyi döndürür → gereksiz render yok). today = Türkiye takvim günü (YYYY-MM-DD).
 */
export function syncProfectionContext(p: TechniqueParams, ctx: string | null, birthDate: string | null | undefined, today: string): TechniqueParams {
  if (!ctx || p.profectionFor === ctx) return p;
  return { ...p, profectionAge: birthDate ? profectionAgeOn(birthDate, today) : null, profectionFor: ctx };
}

/** P2-01: profeksiyon seçimi yalnız GEÇERLİ danışan bağlamına aitse plana/çalıştırmaya girer (geçiş anında eski yaş gitmez). */
export function profectionSelectionCurrent(p: TechniqueParams, ctx: string | null): boolean {
  return !!ctx && p.profectionFor === ctx;
}

export function forecastPartCount(days: number): number {
  return Math.max(1, Math.ceil(days / FORECAST_CHUNK_DAYS));
}

/** Gün/ay/yıl; ayırıcı dile göre (tr "." · en "/" — Owner A13). Yalnız gösterim. */
const fmtDate = (iso: string, L: TechText = TECH_TEXT_TR) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  const sep = L("dateSep");
  return `${d}${sep}${m}${sep}${y}`;
};
/** Batı transit taraması aralık nedeni (lib, kaynak dil) → ekran dili. Bilinmeyen metin olduğu gibi (eski davranış). */
function scanIssueText(issue: string | null, L: TechText): string | null {
  if (issue === null || L === TECH_TEXT_TR) return issue;
  if (issue === TECH_TEXT_TR("reason.scanDates")) return L("reason.scanDates");
  if (issue === TECH_TEXT_TR("reason.scanOrder")) return L("reason.scanOrder");
  const y = /^desteklenen yıllar (\d+)–(\d+)$/.exec(issue);
  if (y) return L("reason.scanYears", { min: y[1], max: y[2] });
  const d = /^tarama aralığı en çok 1 yıl \((\d+) gün\)$/.exec(issue);
  if (d) return L("reason.scanMax", { days: d[1] });
  return issue;
}
/** KP horary soru anı: kaynak dilde lib `questionMomentLabel` (bayt-bayt); diğer dillerde aynı kural katalogla. */
function questionMoment(utcIso: string, tz: string | null, L: TechText): string {
  if (L === TECH_TEXT_TR) return questionMomentLabel(utcIso, tz);
  const utcDate = fmtDate(utcIso, L);
  const utcTime = utcIso.slice(11, 16);
  if (tz === "UTC" || tz === "Etc/UTC") return `${utcDate} ${utcTime} UTC`;
  const z = tz ? formatInZone(utcIso, tz) : null;
  if (!tz || !z) return `${utcDate} ${utcTime} UTC (${L("d.horaryUnverified")})`;
  const name = tz === "Europe/Istanbul" || tz === "Asia/Istanbul" || tz === "Turkey" ? L("d.turkeyTime") : tz;
  const zText = z.text.replace(/^(\d{2})\.(\d{2})\.(\d{4})/, `$1${L("dateSep")}$2${L("dateSep")}$3`);
  const utc = zText.slice(0, 10) === utcDate ? `${utcTime} UTC` : `${utcDate} ${utcTime} UTC`;
  return `${zText} — ${name}, ${z.zone} (${utc})`;
}
/** Kayıtlı Vedik ayanamsa etiketi (" —" öncesi; eski davranış). */
const vedicAy = (v: unknown, L: TechText) => {
  const code = String(v ?? "lahiri");
  return (VEDIC_AYANAMSA_OPTIONS.some((x) => x[0] === v) ? L(`vedicAyanamsaOption.${code}`) : code).split(" —")[0];
};
const kpAy = (v: unknown, L: TechText) => (hasTech(`kpAy.${String(v)}`) ? L(`kpAy.${String(v)}`) : String(v));
const decimal = (x: unknown, L: TechText) => String(x).replace(".", L("decimalSep"));

/** Normalize seçeneklerin okunur özeti (sonuç kartı / kayıtlı analiz başlığı). */
export function describeOptions(technique: string, o: Record<string, unknown>, partnerLabel?: (id: string) => string | null, L: TechText = TECH_TEXT_TR): string {
  const partner = typeof o.partnerProfileId === "string" ? (partnerLabel?.(o.partnerProfileId) ?? L("d.partnerFallback")) : null;
  const rev = o.partnerRevision ? L("d.partnerRev", { rev: String(o.partnerRevision) }) : "";
  switch (technique) {
    case "western.transit": {
      if (typeof o.atUtc !== "string") return "";
      // TRANSİT-01: gösterim saat dilimi varsa yerel an + UTC; yoksa (eski kayıtlar) yalnız UTC — eski metin aynen.
      const utc = `${fmtDate(o.atUtc, L)} ${o.atUtc.slice(11, 16)} UTC`;
      const tz = typeof o.displayTz === "string" && o.displayTz !== "UTC" ? o.displayTz : null;
      const z = tz ? formatInZone(o.atUtc, tz) : null;
      const cal = o.calendar as { startDate?: unknown; days?: unknown } | undefined;
      const calTxt = cal && typeof cal.startDate === "string" ? L("d.transitCal", { start: fmtDate(cal.startDate, L), days: String(cal.days) }) : "";
      return `${z ? `${L === TECH_TEXT_TR ? z.text : z.text.replace(/^(\d{2})\.(\d{2})\.(\d{4})/, `$1${L("dateSep")}$2${L("dateSep")}$3`)} ${z.zone} (${utc})` : utc}${calTxt}`;
    }
    case "western.forecast": {
      const days = Number(o.days);
      if (typeof o.startDate !== "string") return "";
      const end = addDaysIso(o.startDate, days - 1);
      const tz = typeof o.displayTz === "string" ? ` · ${o.displayTz}` : "";
      return L("d.forecast", { start: fmtDate(o.startDate, L), days, end: end ? L("d.forecastEnd", { end: fmtDate(end, L) }) : "", parts: forecastPartCount(days), tz });
    }
    case "western.progression":
    case "western.solar_arc":
      return typeof o.targetDate === "string" ? L("d.target", { date: fmtDate(o.targetDate, L) }) : "";
    case "western.solar_return":
      return L("d.solarReturn", { year: String(o.returnYear), place: returnPlace(o, L) });
    case "western.lunar_return":
      if (typeof o.month !== "string") return "";
      // Eski (Aşama 3) kayıtlarda sıra yok: o zaman yalnız ayın ilk dönüşü hesaplanabiliyordu.
      return L("d.lunar", { monthYear: L("monthYear", { m: o.month.slice(5, 7), y: o.month.slice(0, 4) }), n: o.sequence === 2 ? 2 : 1, legacy: o.sequence === undefined ? L("d.lunarLegacy") : "", place: returnPlace(o, L) });
    case "western.synastry":
    case "western.composite":
      return `${partner ?? ""}${rev}`;
    case "western.relocation": {
      const t = o.target as { label?: string } | undefined;
      return t?.label ? `→ ${t.label}` : typeof o.targetLocationId === "string" ? `→ ${o.targetLocationId}` : "";
    }
    case "vedic.drishti":
      return L("d.lahiriFixed");
    case "vedic.panchanga": {
      if (o.detail !== true && o.hours !== true) return L("d.lahiriFixed");
      const pl = (o.place as { label?: string } | undefined)?.label;
      const day = typeof o.detailDate === "string" ? fmtDate(o.detailDate, L) : L("d.birthDay");
      const what = o.detail === true ? L("d.panchangaDetail", { day, hours: o.hours === true ? L("d.panchangaHoursSuffix") : "" }) : L("d.panchangaHoursOnly", { day });
      return `${L("d.lahiriFixed")} · ${what}${pl ? ` · ${pl}` : ""}`;
    }
    case "kp.chart":
      return L("d.kpChart", { ay: o.ayanamsa ? `${kpAy(o.ayanamsa, L)} · ` : "", node: o.nodeType === "true" ? L("d.nodeTrueShort") : L("d.nodeMeanShort") });
    case "kp.dasha":
      return `${dashaLevelLabel(o, L)} · ${kpAy(o.ayanamsa, L)}${dashaChainLabel(o, L)}`;
    case "kp.ruling":
    case "kp.transit":
    case "kp.horary": {
      const at = typeof o.atUtc === "string" ? `${fmtDate(o.atUtc, L)} ${o.atUtc.slice(11, 16)} UTC` : "";
      const pl = (o.place as { label?: string } | undefined)?.label;
      if (technique === "kp.horary") {
        // HORARY-P2: yerel soru anı esas, UTC parantezde (dilim: displayTz → değerlendirme yeri → UTC + not). Yalnız gösterim.
        // HORARY-P1: başarısız denemeler ham seçenekle listelenir ({ now: true } — an henüz sunucuda belirlenmedi).
        const when = typeof o.atUtc === "string" ? questionMoment(o.atUtc, horaryDisplayZone(o), L) : o.now === true ? L("d.horaryNow") : "";
        return L("d.horary", { n: String(o.horaryNumber), when, place: pl ? ` · ${pl}` : "" });
      }
      if (technique === "kp.ruling") return `${at}${pl ? ` · ${pl}` : ""}`;
      const rg = o.range as { startDate?: string; days?: number; planets?: string[]; kinds?: string[] } | undefined;
      if (technique === "kp.transit" && rg && typeof rg.startDate === "string") {
        const kinds = (rg.kinds ?? []).map((k) => (hasTech(`kpKind.${k}`) ? L(`kpKind.${k}`) : k)).join(" + ");
        const planets = (rg.planets ?? []).map((x) => (hasTech(`kpPlanet.${x}`) ? L(`kpPlanet.${x}`) : x)).join(", ");
        return L("d.kpRange", { start: fmtDate(rg.startDate, L), days: String(rg.days), kinds, planets: planets ? ` · ${planets}` : "", ay: kpAy(o.ayanamsa, L) });
      }
      return `${at} · ${kpAy(o.ayanamsa, L)}`;
    }
    case "kp.ruling_interval": {
      if (typeof o.atUtc !== "string") return "";
      const pl = (o.place as { label?: string } | undefined)?.label;
      const d = Number(o.durationMinutes);
      const iv = Number(o.intervalMinutes);
      const dur = d >= 60 && d % 60 === 0 ? L("d.riHours", { n: d / 60 }) : L("d.riMinutes", { n: d });
      return L("d.ri", { date: fmtDate(o.atUtc, L), time: o.atUtc.slice(11, 16), dur, iv, n: d / iv + 1, ay: kpAy(o.ayanamsa, L), place: pl ? ` · ${pl}` : "" });
    }
    case "vedic.transit":
      return typeof o.atUtc === "string" ? `${fmtDate(o.atUtc, L)} ${o.atUtc.slice(11, 16)} UTC · ${L("d.lahiriFixed")}` : L("d.lahiriFixed");
    case "vedic.bhav_chalit":
    case "vedic.arudha":
    case "vedic.bhava_bala":
      return L("d.ayanamsa", { ay: vedicAy(o.ayanamsa, L) });
    case "vedic.chara_karaka":
      return `${o.scheme === "seven" ? L("d.chara7") : L("d.chara8")} · ${L("d.ayanamsa", { ay: vedicAy(o.ayanamsa, L) })}`;
    case "vedic.ashtakavarga":
    case "vedic.shadbala":
      return L("d.ayanamsa", { ay: vedicAy(o.ayanamsa, L) });
    case "vedic.dasha":
      return `${dashaLevelLabel(o, L)} · ${L("d.ayanamsa", { ay: vedicAy(o.ayanamsa, L) })}${dashaChainLabel(o, L)}`;
    case "vedic.varga":
      return `D${Number(o.division ?? 9)} · ${L("d.ayanamsa", { ay: vedicAy(o.ayanamsa, L) })}`;
    case "vedic.d1":
      return L("d.ayanamsa", { ay: vedicAy(o.ayanamsa, L) });
    case "western.fixed_stars":
      return L("d.fixedStars", { orb: Number(o.orb ?? 1).toLocaleString(L("numLocale")), cat: o.reportCatalog === true ? L("d.fixedStarsCatalog") : "" });
    case "western.profections":
      return profectionAgeOf(o.age) !== null ? L("d.profections", { age: Number(o.age) }) : "";
    case "western.extra_points": {
      return Array.isArray(o.sections) ? o.sections.map((s) => (hasTech(`d.extra.${String(s)}`) ? L(`d.extra.${String(s)}`) : String(s))).join(" · ") : "";
    }
    case "western.planetary_return":
      if (!isPlanetaryReturnPlanet(o.planet) || typeof o.approxDate !== "string") return "";
      return L("d.planetaryReturn", { title: L === TECH_TEXT_TR ? PLANETARY_RETURN_LABELS[o.planet].title : L(`prTitle.${o.planet}`), date: fmtDate(o.approxDate, L), n: Number(o.crossing ?? 1), place: returnPlace(o, L) });
    case "vedic.gun_milan":
      return `${partner ?? ""}${rev} · ${o.order === "partner_first" ? L("d.role1Partner") : L("d.role1Client")} · ${L("d.ayanamsa", { ay: vedicAy(o.ayanamsa, L) })}`;
    case "western.transit_scan": {
      if (typeof o.start !== "string" || typeof o.end !== "string") return "";
      const n = (v: unknown, all: number) => (Array.isArray(v) && v.length < all ? `${v.length}/${all}` : L("d.all"));
      return L("d.transitScan", { start: fmtDate(o.start, L), end: fmtDate(o.end, L), orb: decimal(o.orb ?? TRANSIT_SCAN_ORB_DEFAULT, L), b: n(o.bodies, TRANSIT_SCAN_BODIES.length), p: n(o.points, TRANSIT_SCAN_POINTS.length), a: n(o.aspects, TRANSIT_SCAN_ASPECTS.length) });
    }
    case "western.classical_dignities":
      return `${isDignitySchool(o.school) ? (L === TECH_TEXT_TR ? DIGNITY_SCHOOL_LABELS[o.school] : L(`dignitySchool.${o.school}`)) : "Lilly 1647"} · ${L("d.houseSystemOf", { hs: NATAL_HOUSE_SYSTEM_LABELS[String(o.houseSystem)] ? L(`natalHouse.${String(o.houseSystem)}`) : String(o.houseSystem ?? "placidus") })} · ${o.nodeType === "mean" ? L("d.nodeMean") : L("d.nodeTrue")}`;
    case "western.declination_parallels":
      return typeof o.month === "string"
        ? `${L === TECH_TEXT_TR || !declinationMonthOk(o.month) ? declinationMonthLabel(o.month) : `${L(`month.${Number(o.month.slice(5, 7))}`)} ${o.month.slice(0, 4)}`} · orb ${decimal(o.orb ?? DECLINATION_ORB_DEFAULT, L)}° · ${o.nodeType === "mean" ? L("d.nodeMean") : L("d.nodeTrue")}${typeof o.displayTz === "string" ? ` · ${o.displayTz}` : ""}`
        : "";
    case "vedic.dashakoot":
    case "vedic.papasamyam":
      return `${partner ?? ""}${rev} · ${o.order === "partner_first" ? L("d.roleGroomPartner") : L("d.roleGroomClient")} · ${L("d.ayanamsa", { ay: vedicAy(o.ayanamsa, L) })}`;
    case "vedic.upagraha":
      return L("d.ayanamsa", { ay: vedicAy(o.ayanamsa, L) });
    case "vedic.heliacal": {
      const pl = (o.place as { label?: string } | undefined)?.label;
      return L("d.heliacal", { date: typeof o.date === "string" ? fmtDate(o.date, L) : L("d.birthDay"), place: pl ?? (typeof o.placeLocationId === "string" ? o.placeLocationId : L("d.birthPlace")) });
    }
    case "vedic.sade_sati":
      return `${typeof o.asOf === "string" ? L("d.sadeSatiAsOf", { date: fmtDate(o.asOf, L) }) : ""}${L("d.ayanamsa", { ay: vedicAy(o.ayanamsa, L) })}`;
    case "vedic.monthly": {
      const mo = Number(o.month);
      const head = Number.isInteger(mo) && mo >= 1 && mo <= 12 ? L("d.monthlyHead", { month: L(`month.${mo}`), year: String(o.year) }) : "";
      const secs = Array.isArray(o.sections) ? o.sections.map((s) => (hasTech(`d.monthly.${String(s)}`) ? L(`d.monthly.${String(s)}`) : String(s))).join(" · ") : "";
      return [head, secs, "Lahiri", typeof o.displayTz === "string" ? o.displayTz : ""].filter(Boolean).join(" · ");
    }
    case "western.local_space": {
      const r = o.reference as { label?: string } | undefined;
      return L("d.localSpace", { place: r?.label ?? (o.referenceLocationId ? String(o.referenceLocationId) : L("d.birthPlace")) });
    }
    default:
      return "";
  }
}

/** Dönüş konumu etiketi: farklı konumsa " · konum: Londra", doğum yeriyse " · doğum yeri" (eski kayıtlarda boş). */
function returnPlace(o: Record<string, unknown>, L: TechText): string {
  const rl = o.returnLocation as { locationId?: string | null; label?: string } | undefined;
  if (rl?.locationId) return L("d.returnPlaceOther", { place: rl.label ?? rl.locationId });
  if (typeof o.returnLocationId === "string") return L("d.returnPlaceOther", { place: o.returnLocationId });
  return rl || o.returnLocationId === null ? L("d.returnPlaceBirth") : "";
}

/** 02.11.2026: Yeni Analiz listesinde "YENİ" işareti taşıyan teknikler (owner görsel PASS prototipi). */
export const NEW_TECHNIQUES: ReadonlySet<string> = new Set<string>(["western.classical_dignities", "western.transit_scan"]);

export function techniqueLabel(id: string, L: TechText = TECH_TEXT_TR): string {
  return Object.prototype.hasOwnProperty.call(TECHNIQUE_META, id) ? L(`${metaKey(id)}.label`) : id;
}

export type LunarReturnInfo = { sequence: number; approxUtc: string };
/** 2026-10-22 — sunucu planının bildirdiği dönüş kümesi kavuşumları (retro döngüsünde 2–3). */
export type PlanetaryReturnInfo = { crossing: number; of: number; approxUtc: string; motion: "direct" | "retrograde" };
/** 2026-10-22: "Önceki / sonraki dönüş" kısayolu — komşu dönüş kümelerinin ilk kavuşum günü (YYYY-MM-DD; yoksa null). */
export type PlanetaryReturnNeighbors = { previous: string | null; next: string | null };

/** "2027-06-28T13:58" → "28.06.2027 13:58 UTC" */
export function fmtUtcMinute(iso: string, L: TechText = TECH_TEXT_TR): string {
  return `${fmtDate(iso, L)} ${iso.slice(11, 16)} UTC`;
}

/** Aşama 5: ev/bhava sistemi etiketi — Vedik "whole_sign" Batı etiket tablosunda yok. */
export function houseSystemLabel(h: string | null | undefined, westernLabels: Record<string, string>, L: TechText = TECH_TEXT_TR): string {
  if (!h) return L("house.none");
  if (h === "whole_sign") return L("house.wholeSign");
  if (h === "sripati") return L("house.sripati");
  return westernLabels[h] ?? (NATAL_HOUSE_SYSTEM_LABELS[h] ? L(`natalHouse.${h}`) : h);
}

/** Zodyak çerçevesi: Vedik teknikler sidereal (nirayana), diğerleri tropikal. */
export function zodiacLabel(technique: string, L: TechText = TECH_TEXT_TR): string {
  return technique.startsWith("kp.") ? L("zodiac.kp") : technique.startsWith("vedic.") ? L("zodiac.vedic") : L("zodiac.western");
}

// ─── TRANSİT-03: KP Transit zaman aralığı (istemci meta; sınırlar sunucudaki engine/techniques ile AYNI, test denetler) ───
export const KP_TIMING_MAX_DAYS = 92;
export const KP_POSITIONS_MAX_DAYS = 7;
export const KP_POSITIONS_INTERVALS = [60, 180, 360, 720, 1440] as const;
export function kpRangeOptions(p: TechniqueParams): Record<string, unknown> {
  const kinds = p.kpRangeKinds ?? [];
  return {
    startDate: p.kpRangeStart,
    days: p.kpRangeDays,
    planets: kinds.includes("sublord") || kinds.includes("rasi") ? (p.kpRangePlanets ?? []) : [],
    kinds,
    ...(kinds.includes("positions") ? { intervalMinutes: p.kpRangeInterval } : {}),
  };
}
/**
 * KP zaman aralığı ayarı eksik / geçersizse kısa neden (yoksa null). Sunucunun parseKpRange'iyle aynı kurallar:
 * başlangıç tarihi (yıl yazılırken "0002-10-07" gibi ara değerler dahil), en az bir tür, Sub-Lord/Rasi için gezegen,
 * konum tablosu ≤ 7 gün. Neden varsa seçim plana / API'ye GİRMEZ.
 */
export function kpRangeIssue(p: TechniqueParams, L: TechText = TECH_TEXT_TR): string | null {
  if (dateInputIssue(p.kpRangeStart)) return L("reason.kpRangeStart");
  const k = p.kpRangeKinds ?? [];
  if (k.length === 0) return L("reason.kpRangeKind");
  if ((k.includes("sublord") || k.includes("rasi")) && (p.kpRangePlanets ?? []).length === 0) return L("reason.kpRangePlanet");
  if (!Number.isInteger(p.kpRangeDays) || p.kpRangeDays < 1 || p.kpRangeDays > KP_TIMING_MAX_DAYS) return L("reason.kpRangeDays", { max: KP_TIMING_MAX_DAYS });
  if (k.includes("positions") && p.kpRangeDays > KP_POSITIONS_MAX_DAYS) return L("reason.kpPositionsDays", { max: KP_POSITIONS_MAX_DAYS });
  return null;
}
/** Tahmini istek sayısı (önbellek hariç): gezegen × (sub-lord + rasi) + konum tablosu. */
export function kpRangeRequestCount(p: TechniqueParams): number {
  const k = p.kpRangeKinds ?? [];
  return (p.kpRangePlanets ?? []).length * ((k.includes("sublord") ? 1 : 0) + (k.includes("rasi") ? 1 : 0)) + (k.includes("positions") ? 1 : 0);
}
