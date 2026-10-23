// Astroloji — VEDİK AYLIK ZAMANLAMA teknik modeli (SAF; 2026-10-22; teknik kimliği `vedic.monthly`).
//
// Doğum verisinden bağımsız aylık gökyüzü takvimi (sidereal, Lahiri): gezegen burç (rashi) girişleri, gezegenler arası
// ASTRONOMİK açı kesinleşmeleri, Ay açıları ve deklinasyon paralel / kontraparalel olayları; isteğe bağlı olarak doğum anının
// deklinasyonları (natal bağlamlı tek bölüm). Her bölüm ayrı sağlayıcı ucu = ayrı hesap birimi / önbellek satırı.
// Hesap motoru sağlayıcıdır; burada yalnız tip, sınırlar, etiketler, yöntem metinleri ve türetilmiş GÖSTERİM (zaman çizelgesi,
// filtre, özet) bulunur. Retro / direkt İSTASYON anları sağlayıcı yanıtında YOKTUR → üretilmez (yalnız geçiş anındaki hareket).

import { SIGN_IDS, type SignId } from "./western";
import type { VedicGrahaId } from "./vedic";

export const VEDIC_MONTHLY_TECHNICAL_SCHEMA = "astro.vedic.monthly.v1" as const;
export const VEDIC_MONTHLY_PART_SCHEMA = "astro.vedic.monthly.part.v1" as const;

/** Bölümler (kanonik sıra = birim sırası). natal_parallels doğum anına bağlıdır (saat gerekir); diğerleri doğumdan bağımsızdır. */
export const VEDIC_MONTHLY_SECTIONS = ["ingress", "aspects", "lunar", "parallels", "natal_parallels"] as const;
export type VedicMonthlySection = (typeof VEDIC_MONTHLY_SECTIONS)[number];
export const VEDIC_MONTHLY_DEFAULT_SECTIONS: VedicMonthlySection[] = ["ingress", "aspects", "lunar", "parallels"];
export const VEDIC_MONTHLY_SECTION_LABELS: Readonly<Record<VedicMonthlySection, string>> = {
  ingress: "Gezegen burç girişleri",
  aspects: "Gezegenler arası açı kesinleşmeleri",
  lunar: "Ay açıları",
  parallels: "Deklinasyon paralelleri (aylık)",
  natal_parallels: "Doğum anı deklinasyonları",
};

/** Seçilen bölümler → kanonik sıra (aynı seçim = aynı anahtar); boş / bilinmeyen / tekrarlı → null (sessiz ayıklama yok). */
export function vedicMonthlySectionsOf(v: unknown): VedicMonthlySection[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  if (new Set(v).size !== v.length) return null;
  if (!v.every((x) => (VEDIC_MONTHLY_SECTIONS as readonly unknown[]).includes(x))) return null;
  return VEDIC_MONTHLY_SECTIONS.filter((s) => v.includes(s));
}

/** Ay seçimi sınırları (Atlas tarih aralığı; sağlayıcının 1551–2649 aralığının içinde). */
export const VEDIC_MONTHLY_YEAR_MIN = 1600;
export const VEDIC_MONTHLY_YEAR_MAX = 2600;
export const vedicMonthOk = (year: unknown, month: unknown): boolean =>
  Number.isInteger(year) && Number.isInteger(month) && (year as number) >= VEDIC_MONTHLY_YEAR_MIN && (year as number) <= VEDIC_MONTHLY_YEAR_MAX && (month as number) >= 1 && (month as number) <= 12;
/** Ayın UTC sınırları "YYYY-MM-DDTHH:MM" (bitiş = sonraki ayın ilk anı, hariç). */
export function vedicMonthWindow(year: number, month: number): { startUtc: string; endUtc: string } {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  return { startUtc: `${String(year).padStart(4, "0")}-${p2(month)}-01T00:00`, endUtc: `${String(ny).padStart(4, "0")}-${p2(nm)}-01T00:00` };
}

// ─── Astronomik açılar (ekliptik boylam farkı; 5 majör + 17 minör) ───────────────────────────────────────────────
export const MONTHLY_ASPECTS = [
  { id: "conjunction", angle: 0, major: true, tr: "Kavuşum" },
  { id: "vigintile", angle: 18, major: false, tr: "Yirmilik (vigintile)" },
  { id: "semi_sextile", angle: 30, major: false, tr: "Yarım altmışlık (semi-sextile)" },
  { id: "undecile", angle: 360 / 11, major: false, tr: "On birlik (undecile)" },
  { id: "semi_quintile", angle: 36, major: false, tr: "Yarım beşlik (semi-quintile)" },
  { id: "novile", angle: 40, major: false, tr: "Dokuzluk (novile)" },
  { id: "semi_square", angle: 45, major: false, tr: "Yarım kare (semi-square)" },
  { id: "septile", angle: 360 / 7, major: false, tr: "Yedilik (septile)" },
  { id: "sextile", angle: 60, major: true, tr: "Altmışlık (sextile)" },
  { id: "quintile", angle: 72, major: false, tr: "Beşlik (quintile)" },
  { id: "binovile", angle: 80, major: false, tr: "Çift dokuzluk (binovile)" },
  { id: "square", angle: 90, major: true, tr: "Kare" },
  { id: "centile", angle: 100, major: false, tr: "Yüzlük (centile)" },
  { id: "biseptile", angle: 720 / 7, major: false, tr: "Çift yedilik (biseptile)" },
  { id: "tredecile", angle: 108, major: false, tr: "Üç onluk (tredecile)" },
  { id: "trine", angle: 120, major: true, tr: "Üçgen" },
  { id: "sesqui_square", angle: 135, major: false, tr: "Bir buçuk kare (sesqui-square)" },
  { id: "bi_quintile", angle: 144, major: false, tr: "Çift beşlik (bi-quintile)" },
  { id: "quincunx", angle: 150, major: false, tr: "Quincunx (150°)" },
  { id: "triseptile", angle: 1080 / 7, major: false, tr: "Üçlü yedilik (triseptile)" },
  { id: "quadranovile", angle: 160, major: false, tr: "Dört dokuzluk (quadranovile)" },
  { id: "opposition", angle: 180, major: true, tr: "Karşıt" },
] as const;
export type MonthlyAspectId = (typeof MONTHLY_ASPECTS)[number]["id"];
export const MONTHLY_ASPECT_IDS = MONTHLY_ASPECTS.map((a) => a.id) as MonthlyAspectId[];
export const monthlyAspectOf = (id: string) => MONTHLY_ASPECTS.find((a) => a.id === id) ?? null;
/** "Yarım kare (semi-square) 45°" — açı derecesi tek ondalık (septile 51,4° …). */
export function monthlyAspectLabel(id: string): string {
  const a = monthlyAspectOf(id);
  if (!a) return id;
  const deg = Number.isInteger(a.angle) ? String(a.angle) : a.angle.toFixed(1).replace(".", ",");
  return `${a.tr} ${deg}°`;
}

export const MONTHLY_GRAHA_TR: Readonly<Record<VedicGrahaId, string>> = {
  sun: "Güneş",
  moon: "Ay",
  mars: "Mars",
  mercury: "Merkür",
  jupiter: "Jüpiter",
  venus: "Venüs",
  saturn: "Satürn",
  rahu: "Rahu",
  ketu: "Ketu",
};
export const DECLINATION_TYPE_LABELS = { parallel: "Paralel", contraparallel: "Kontraparalel" } as const;
export type DeclinationType = keyof typeof DECLINATION_TYPE_LABELS;

// ─── Teknik veri ────────────────────────────────────────────────────────────────────────────────────────────────
export type MonthlyIngress = { atUtc: string; planet: VedicGrahaId; from: SignId; to: SignId; retrograde: boolean };
export type MonthlyStart = { planet: VedicGrahaId; sign: SignId; longitude: number };
export type MonthlyAspectEvent = { atUtc: string; a: VedicGrahaId; b: VedicGrahaId; aspect: MonthlyAspectId; orb: number; distance: number; lonA: number; lonB: number };
export type MonthlyLunarEvent = { atUtc: string; planet: VedicGrahaId; aspect: MonthlyAspectId; orb: number; distance: number; moonLon: number; planetLon: number };
export type MonthlyParallelEvent = { atUtc: string; a: VedicGrahaId; b: VedicGrahaId; type: DeclinationType; orb: number; decA: number; decB: number };
export type NatalDeclination = { id: VedicGrahaId; declination: number; rightAscension: number };
export type NatalParallel = { a: VedicGrahaId; b: VedicGrahaId; type: DeclinationType; orb: number; decA: number; decB: number };

/** Tek sağlayıcı yanıtının (bölümün) teknik katmanı. */
export type VedicMonthlyPart =
  | { schema: typeof VEDIC_MONTHLY_PART_SCHEMA; section: "ingress"; start: MonthlyStart[]; events: MonthlyIngress[] }
  | { schema: typeof VEDIC_MONTHLY_PART_SCHEMA; section: "aspects"; events: MonthlyAspectEvent[] }
  | { schema: typeof VEDIC_MONTHLY_PART_SCHEMA; section: "lunar"; events: MonthlyLunarEvent[] }
  | { schema: typeof VEDIC_MONTHLY_PART_SCHEMA; section: "parallels"; events: MonthlyParallelEvent[] }
  | { schema: typeof VEDIC_MONTHLY_PART_SCHEMA; section: "natal_parallels"; atLocal: string; orb: number; planets: NatalDeclination[]; parallels: NatalParallel[] };

export type VedicMonthlyTechnical = {
  schema: typeof VEDIC_MONTHLY_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: { ayanamsa: "lahiri" };
  /** UTC takvim ayı: sağlayıcıya saat dilimi 0 gönderilir; yerel gösterim seçilen IANA bölgesinde olay başına yapılır. */
  window: { year: number; month: number; startUtc: string; endUtc: string };
  sections: VedicMonthlySection[];
  ingress: { start: MonthlyStart[]; events: MonthlyIngress[] } | null;
  aspects: { events: MonthlyAspectEvent[] } | null;
  lunar: { events: MonthlyLunarEvent[] } | null;
  parallels: { events: MonthlyParallelEvent[] } | null;
  natalParallels: { atLocal: string; orb: number; planets: NatalDeclination[]; parallels: NatalParallel[] } | null;
  /** Hesaplanamayan (başarısız / atlanan) bölümler — sessizce düşürülmez, ekranda ve raporda listelenir. */
  missing: VedicMonthlySection[];
};

/** Natal paralel isteğinin orbu (sağlayıcı 0,5–3; varsayılan 1,5). Sabit → tek önbellek varyantı. */
export const NATAL_PARALLEL_ORB = 1.5;

// ─── Yöntem / kapsam metinleri (ekran + Word/PDF aynı dizge) ─────────────────────────────────────────────────────
export const VEDIC_MONTHLY_METHOD_TEXT =
  "Aylık gökyüzü takvimi: sidereal (nirayana) zodyak, Lahiri ayanamsa. Doğum verisi kullanılmaz (doğum anı deklinasyonları bölümü hariç). Olay anları sağlayıcının dakika hassasiyetindeki arama sonuçlarıdır; Yaşam bu anları yeniden hesaplamaz, yalnız iç tutarlılığını denetler.";
export const VEDIC_MONTHLY_WINDOW_TEXT =
  "Pencere UTC takvim ayıdır (ayın 1'i 00:00 UTC → sonraki ayın 1'i 00:00 UTC). Yerel saatler her olay için seçilen saat diliminin o andaki ofsetiyle (yaz/kış saati dahil) gösterilir; bu nedenle yerel ayın ilk / son saatlerindeki bazı olaylar komşu ayın kaydında yer alabilir.";
export const ASPECT_VS_DRISHTI_TEXT =
  "Buradaki açılar ASTRONOMİK açılardır: iki gezegenin ekliptik boylam farkının belirli bir dereceye (0°, 60°, 90°, 120°, 180° ve minör açılar) eşitlendiği an. Geleneksel Vedik graha drishti (Parashari bütün-burç bakışları: herkes 7., Mars 4/8, Jüpiter 5/9, Satürn 3/10) AYRI bir yöntemdir ve “Graha Drishti” / “Gochara” tekniklerinde gösterilir; bu tablo drishti yerine kullanılmamalıdır.";
export const ASPECT_ZODIAC_TEXT = "Açı anı iki boylamın FARKINA bağlıdır; ayanamsa iki tarafta sadeleştiği için anlar sidereal ve tropikal zodyakta aynıdır. Boylam sütunları sidereal (Lahiri) değerdir.";
export const DECLINATION_TEXT =
  "Deklinasyon paralelleri ekliptik boylam açılarından AYRI bir matematiksel alandır: gök ekvatoruna göre kuzey / güney açısal uzaklık (deklinasyon) karşılaştırılır. Paralel = iki gezegen aynı yarımkürede eşit deklinasyonda (|d1 − d2| ≤ orb); kontraparalel = karşı yarımkürelerde eşit deklinasyonda (|d1 + d2| ≤ orb). Deklinasyon zodyak seçiminden (sidereal / tropikal) bağımsızdır.";
export const PARALLELS_SAMPLING_TEXT = "Aylık paralel anı, iki gezegenin deklinasyonlarının eşitlendiği (paralel) ya da karşı yarımkürede eşitlendiği (kontraparalel) dakika hassasiyetindeki kesinleşme anıdır. Kapsam yedi görünür gezegendir (Güneş … Satürn; Rahu / Ketu yok).";
export const STATION_TEXT =
  "Retro / direkt istasyon (duraklama) anları bu takvimin sağlayıcı verisinde yoktur ve Yaşam tarafından üretilmez; burç girişlerinde yalnız geçiş anındaki hareket yönü (ileri / geri) gösterilir. Rahu ve Ketu ortalama hareketle geri yönde ilerler.";
export const NATAL_DECLINATION_TEXT = "Doğum anının deklinasyonları ve doğum haritasındaki paralel / kontraparaleller (orb 1,5°). Bu bölüm doğum saatine bağlıdır; saat bilinmiyorsa hesaplanmaz.";

// ─── Türetilmiş GÖSTERİM (hesap değil) ─────────────────────────────────────────────────────────────────────────────
export type MonthlyTimelineKind = "ingress" | "aspect" | "lunar" | "parallel";
export type MonthlyTimelineItem = { atUtc: string; kind: MonthlyTimelineKind; planets: VedicGrahaId[]; text: string; major: boolean | null; retrograde: boolean | null };
export const MONTHLY_KIND_LABELS: Readonly<Record<MonthlyTimelineKind, string>> = { ingress: "Burç girişi", aspect: "Açı", lunar: "Ay açısı", parallel: "Deklinasyon" };

const signTr: Record<SignId, string> = {
  aries: "Koç",
  taurus: "Boğa",
  gemini: "İkizler",
  cancer: "Yengeç",
  leo: "Aslan",
  virgo: "Başak",
  libra: "Terazi",
  scorpio: "Akrep",
  sagittarius: "Yay",
  capricorn: "Oğlak",
  aquarius: "Kova",
  pisces: "Balık",
};
export const monthlySignTr = (s: string) => (signTr as Record<string, string>)[s] ?? s;
const dec2 = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2).replace(".", ",")}°`;
export const fmtDeclination = dec2;
const orbTxt = (v: number) => `orb ${v.toFixed(2).replace(".", ",")}°`;

/** Bölümlerin olaylarını tek kronolojik listeye çevirir (UTC dakika; eşit anda bölüm sırası). */
export function monthlyTimeline(t: Pick<VedicMonthlyTechnical, "ingress" | "aspects" | "lunar" | "parallels">): MonthlyTimelineItem[] {
  const out: MonthlyTimelineItem[] = [];
  for (const e of t.ingress?.events ?? [])
    out.push({ atUtc: e.atUtc, kind: "ingress", planets: [e.planet], text: `${MONTHLY_GRAHA_TR[e.planet]} ${monthlySignTr(e.from)} → ${monthlySignTr(e.to)}${e.retrograde ? " (geri hareketle)" : ""}`, major: null, retrograde: e.retrograde });
  for (const e of t.aspects?.events ?? [])
    out.push({ atUtc: e.atUtc, kind: "aspect", planets: [e.a, e.b], text: `${MONTHLY_GRAHA_TR[e.a]} – ${MONTHLY_GRAHA_TR[e.b]} · ${monthlyAspectLabel(e.aspect)} · ${orbTxt(e.orb)}`, major: monthlyAspectOf(e.aspect)?.major ?? null, retrograde: null });
  for (const e of t.lunar?.events ?? [])
    out.push({ atUtc: e.atUtc, kind: "lunar", planets: ["moon", e.planet], text: `Ay – ${MONTHLY_GRAHA_TR[e.planet]} · ${monthlyAspectLabel(e.aspect)} · ${orbTxt(e.orb)}`, major: monthlyAspectOf(e.aspect)?.major ?? null, retrograde: null });
  for (const e of t.parallels?.events ?? [])
    out.push({ atUtc: e.atUtc, kind: "parallel", planets: [e.a, e.b], text: `${MONTHLY_GRAHA_TR[e.a]} – ${MONTHLY_GRAHA_TR[e.b]} · ${DECLINATION_TYPE_LABELS[e.type]} (${dec2(e.decA)} / ${dec2(e.decB)}) · ${orbTxt(e.orb)}`, major: null, retrograde: null });
  const order: MonthlyTimelineKind[] = ["ingress", "aspect", "lunar", "parallel"];
  return out.sort((x, y) => (x.atUtc < y.atUtc ? -1 : x.atUtc > y.atUtc ? 1 : order.indexOf(x.kind) - order.indexOf(y.kind)));
}

export type MonthlyFilter = { planets: VedicGrahaId[] | null; kinds: MonthlyTimelineKind[] | null; majorOnly: boolean };
/** Gezegen filtresi: olayın gezegenlerinden BİRİ seçiliyse gösterilir; "yalnız majör" yalnız açı/Ay açısı satırlarını süzer. */
export function filterTimeline(items: MonthlyTimelineItem[], f: MonthlyFilter): MonthlyTimelineItem[] {
  return items.filter((x) => (!f.planets || x.planets.some((p) => f.planets!.includes(p))) && (!f.kinds || f.kinds.includes(x.kind)) && (!f.majorOnly || x.major !== false));
}

export type MonthlySummary = {
  counts: Record<MonthlyTimelineKind, number>;
  /** Ay dışındaki gezegenlerin burç girişleri (aylık özetin ana satırı). */
  keyIngresses: MonthlyIngress[];
  retroIngresses: number;
  majorAspects: number;
  minorAspects: number;
  moonIngresses: number;
  parallels: number;
  contraparallels: number;
};
export function monthlySummary(t: Pick<VedicMonthlyTechnical, "ingress" | "aspects" | "lunar" | "parallels">): MonthlySummary {
  const ing = t.ingress?.events ?? [];
  const asp = t.aspects?.events ?? [];
  const lun = t.lunar?.events ?? [];
  const par = t.parallels?.events ?? [];
  const isMajor = (id: string) => monthlyAspectOf(id)?.major === true;
  return {
    counts: { ingress: ing.length, aspect: asp.length, lunar: lun.length, parallel: par.length },
    keyIngresses: ing.filter((e) => e.planet !== "moon"),
    retroIngresses: ing.filter((e) => e.retrograde && e.planet !== "rahu" && e.planet !== "ketu").length,
    majorAspects: asp.filter((e) => isMajor(e.aspect)).length,
    minorAspects: asp.filter((e) => !isMajor(e.aspect)).length,
    moonIngresses: ing.filter((e) => e.planet === "moon").length,
    parallels: par.filter((e) => e.type === "parallel").length,
    contraparallels: par.filter((e) => e.type === "contraparallel").length,
  };
}

export const signIndex = (s: SignId) => SIGN_IDS.indexOf(s);
