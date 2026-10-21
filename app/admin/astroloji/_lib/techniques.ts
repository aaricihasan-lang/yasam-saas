// Astroloji owner UI — teknik seçimi için İSTEMCİ meta verisi (SAF).
// Sunucudaki teknik tanımları (lib/astrology/engine/techniques) istemci paketine ALINMAZ; burada yalnız
// etiket + hangi parametrenin sorulacağı tutulur. Seçenekler sunucuda yeniden doğrulanır/normalize edilir.

import { addDaysIso, dateInputIssue, formatInZone, horaryDisplayZone, localToUtcPreview, questionMomentLabel, timeInputIssue } from "@/lib/astrology/transitDetail";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";
import type { HouseSystem, NodeType } from "@/lib/astrology/model/western";
import { profectionAgeOf, profectionAgeOn } from "@/lib/astrology/model/westernProfections";

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
  "vedic.d1",
  "vedic.varga",
  "vedic.dasha",
  "vedic.drishti",
  "vedic.ashtakavarga",
  "vedic.shadbala",
  "vedic.panchanga",
  "vedic.transit",
  "kp.chart",
  "kp.dasha",
  "kp.ruling",
  "kp.transit",
  "kp.horary",
] as const;
export type UiTechniqueId = (typeof UI_TECHNIQUES)[number];

export const TECHNIQUE_META: Record<UiTechniqueId, { label: string; hint: string; needsPartner: boolean; needsTime: boolean }> = {
  "western.natal": { label: "Natal", hint: "Doğum haritası", needsPartner: false, needsTime: false },
  "western.transit": { label: "Transit (tek an)", hint: "Seçilen andaki gökyüzü → natal açılar", needsPartner: false, needsTime: false },
  "western.forecast": { label: "Transit takvimi", hint: "Dönem boyunca açı, burç girişi, istasyon, tutulma, Ay evresi", needsPartner: false, needsTime: false },
  "western.progression": { label: "Secondary progression", hint: "Gün = yıl ilerletilmiş harita", needsPartner: false, needsTime: false },
  "western.solar_arc": { label: "Solar arc", hint: "Tüm noktalar ilerletilmiş Güneş yayı kadar", needsPartner: false, needsTime: false },
  "western.solar_return": { label: "Solar return", hint: "Güneş'in natal konumuna dönüş haritası (doğum yeri)", needsPartner: false, needsTime: true },
  "western.lunar_return": { label: "Lunar return", hint: "Ay'ın natal konumuna dönüş haritası (doğum yeri)", needsPartner: false, needsTime: true },
  "western.synastry": { label: "Sinastri", hint: "İki kişinin haritaları arası açılar + ev bindirmesi", needsPartner: true, needsTime: false },
  "western.composite": { label: "Composite", hint: "İki haritanın orta nokta haritası", needsPartner: true, needsTime: false },
  "western.astrocartography": { label: "Astrocartography", hint: "Gezegen MC/IC/AC/DC hatları — dünya haritası", needsPartner: false, needsTime: true },
  "western.relocation": { label: "Relocation", hint: "Aynı doğum anı, yeni konum: ASC/MC/evler", needsPartner: false, needsTime: true },
  "western.local_space": { label: "Local Space", hint: "Doğum anında ufuk yönleri (pusula + harita)", needsPartner: false, needsTime: true },
  "western.fixed_stars": { label: "Sabit yıldızlar", hint: "43 sabit yıldızın doğum anındaki konumu + natal noktalarla ekliptik boylam kavuşumları", needsPartner: false, needsTime: false },
  "western.profections": { label: "Yıllık Profeksiyonlar", hint: "Yükselen burçtan her yaş için bir burç (bütün-burç evleri): yılın etkin evi, burcu ve klasik yönetici gezegeni", needsPartner: false, needsTime: true },
  "vedic.d1": { label: "Vedik D1 (Rashi)", hint: "Sidereal kundli: Lagna, graha, nakshatra/pada, yogalar", needsPartner: false, needsTime: true },
  "vedic.drishti": { label: "Graha Drishti", hint: "Parashari bütün-burç graha drishti — yalnız Lahiri", needsPartner: false, needsTime: true },
  "vedic.ashtakavarga": { label: "Ashtakavarga", hint: "Bhinna/Sarva bindu ızgarası, Shodhana, Shodhya Pinda", needsPartner: false, needsTime: true },
  "vedic.shadbala": { label: "Shadbala", hint: "Altı katlı graha gücü (BPHS), oran ve sıralama", needsPartner: false, needsTime: true },
  "vedic.panchanga": { label: "Janma Panchanga", hint: "Doğum anı tithi, nakshatra, nitya yoga, karana; isteğe bağlı ayrıntılı gün (vara, gün doğumu, Rahu Kaal…) ve gezegen saatleri (hora) + Choghadiya — yalnız Lahiri", needsPartner: false, needsTime: true },
  "vedic.transit": { label: "Gochara (Vedik transit)", hint: "Seçilen anın sidereal grahaları → Janma Rashi'den / Lagna'dan ev, bütün-burç drishti, kaksha — yalnız Lahiri", needsPartner: false, needsTime: true },
  "kp.chart": { label: "KP doğum haritası", hint: "Placidus cusp'ları, sign / star / sub / sub-sub lord, 4 düzey significator (KP-Newcomb)", needsPartner: false, needsTime: true },
  "kp.dasha": { label: "KP dasha", hint: "Vimshottari (KP ayanamsa) + dönem lordlarının KP significator'ları; alt dönemler tıklayınca", needsPartner: false, needsTime: true },
  "kp.ruling": { label: "KP ruling planets", hint: "Seçilen anın ruling planet'leri + natal significator'ları", needsPartner: false, needsTime: true },
  "kp.transit": { label: "KP transit", hint: "Tek an KP gökyüzü veya zaman aralığında Sub-Lord / Rasi geçişleri; natal ev analizi yok", needsPartner: false, needsTime: false },
  "kp.horary": { label: "KP horary (1–249)", hint: "Sayı + soru anı + değerlendirme yeri; doğum verisi kullanılmaz", needsPartner: false, needsTime: false },
  "vedic.dasha": { label: "Vimshottari Dasha", hint: "Mahadasha zaman çizelgesi; alt dönemler Prana düzeyine kadar tıklayınca yüklenir; güncel dönem zinciri isteğe bağlı", needsPartner: false, needsTime: true },
  "vedic.varga": { label: "Vedik Varga (D9 Navamsa / Dn)", hint: "Bölümsel harita: D9 varsayılan; D2…D60 seçilebilir; vargottama", needsPartner: false, needsTime: true },
};

export const DASHA_LORD_OPTIONS: [string, string][] = [
  ["ketu", "Ketu"],
  ["venus", "Venüs (Shukra)"],
  ["sun", "Güneş (Surya)"],
  ["moon", "Ay (Chandra)"],
  ["mars", "Mars (Mangala)"],
  ["rahu", "Rahu"],
  ["jupiter", "Jüpiter (Guru)"],
  ["saturn", "Satürn (Shani)"],
  ["mercury", "Merkür (Budha)"],
];

export const VEDIC_VARGA_OPTIONS: [number, string][] = [
  [9, "D9 Navamsa (varsayılan)"],
  [2, "D2 Hora"],
  [3, "D3 Drekkana"],
  [4, "D4 Chaturthamsa"],
  [7, "D7 Saptamsa"],
  [10, "D10 Dasamsa"],
  [12, "D12 Dwadasamsa"],
  [16, "D16 Shodasamsa"],
  [20, "D20 Vimsamsa"],
  [24, "D24 Chaturvimsamsa"],
  [27, "D27 Bhamsa"],
  [30, "D30 Trimsamsa"],
  [40, "D40 Khavedamsa"],
  [45, "D45 Akshavedamsa"],
  [60, "D60 Shashtiamsa"],
];

export const KP_AYANAMSA_OPTIONS: [string, string][] = [
  ["kp-newcomb", "KP-Newcomb — varsayılan"],
  ["kp-old", "KP (Krishnamurti eski tablo)"],
];
const KP_AY_LABEL: Record<string, string> = { "kp-newcomb": "KP-Newcomb", "kp-old": "KP (eski tablo)" };

export const VEDIC_AYANAMSA_OPTIONS: [string, string][] = [
  ["lahiri", "Lahiri (Chitrapaksha) — varsayılan"],
  ["raman", "B.V. Raman"],
  ["kp-newcomb", "KP Newcomb"],
  ["kp-old", "KP (eski)"],
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
  panchangaDate?: string;
  panchangaPlace?: { id: string; label: string } | null;
  /** 2026-10-22: "Gezegen saatleri (Hora) + Choghadiya" seçeneği — Ayrıntılı Panchanga ile AYNI gün + konum alanları. */
  panchangaHours?: boolean;
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

export function buildSelections(
  checked: Partial<Record<UiTechniqueId, boolean>>,
  p: TechniqueParams,
  method: { houseSystem: HouseSystem; nodeType: NodeType },
): { technique: UiTechniqueId; options: Record<string, unknown> }[] {
  const out: { technique: UiTechniqueId; options: Record<string, unknown> }[] = [];
  for (const id of UI_TECHNIQUES) {
    if (!checked[id]) continue;
    // Eksik / geçersiz tarih-saat (ör. yıl yazılırken "0002-10-17") plana ve API'ye GİRMEZ; neden missingReason'da.
    if (dateInputReason(id, p)) continue;
    switch (id) {
      case "western.natal":
        out.push({ technique: id, options: { houseSystem: method.houseSystem, nodeType: method.nodeType } });
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
      case "vedic.d1":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.drishti":
      case "vedic.ashtakavarga":
      case "vedic.shadbala":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
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
      case "vedic.varga":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa, division: p.vargaDivision } });
        break;
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
function dashaLevelLabel(o: Record<string, unknown>): string {
  const lord = (v: unknown) => DASHA_LORD_OPTIONS.find((x) => x[0] === v)?.[1] ?? String(v);
  const path = [o.mahadasha, o.antardasha, o.pratyantardasha, o.sookshma].filter((x) => typeof x === "string" && x) as string[];
  return path.length ? `${LEVEL_TR[path.length - 1]} · ${path.map(lord).join(" / ")}` : "Mahadasha";
}
const dashaChainLabel = (o: Record<string, unknown>) =>
  typeof o.chainAtUtc === "string" ? ` · güncel dönem zinciri: ${fmtDate(o.chainAtUtc)} ${o.chainAtUtc.slice(11, 16)} UTC` : o.chainNow === true ? " · güncel dönem zinciri: şimdi" : "";

/** Ruling / horary için gözlem yeri açıkça belirlendi mi? */
export function kpPlaceReady(p: TechniqueParams): boolean {
  return p.kpPlaceMode === "birth" || (p.kpPlaceMode === "other" && !!p.kpPlace);
}

/**
 * Tarih/saat alanı tamamlanmamış veya geçersizse kısa neden (yoksa null). Tarayıcı tarih kutusu yazma sırasında boş
 * dize ya da "0002-10-17" gibi ara değerler üretir; bunlarla hesap / plan / istek YAPILMAZ.
 */
export function dateInputReason(id: UiTechniqueId, p: TechniqueParams): string | null {
  const bad = (date: string, time?: string) => !!(dateInputIssue(date) ?? (time === undefined ? null : timeInputIssue(time)));
  switch (id) {
    case "western.transit":
      // Ekrandaki UTC ön izlemesiyle AYNI karar (sunucunun resolveAstroBirthTime + 1600–2600 UTC yıl sınırı): biçim, yaz saati
      // boşluğu ve UTC'de sınır dışına düşen an da plana / API'ye girmez → ön izleme uyarısı ile Başlat her zaman tutarlı.
      if (p.transitMode === "now") return null;
      if (bad(p.transitDate, p.transitMode === "custom" ? p.transitTime : undefined)) return "transit tarihini / saatini tamamlayın";
      return localToUtcPreview(p.transitDate, p.transitMode === "date" ? "12:00" : p.transitTime, p.transitTz).ok ? null : "transit anı geçersiz (ön izlemeye bakın)";
    case "western.forecast":
      return bad(p.forecastStart) ? "takvim başlangıç tarihini tamamlayın" : p.forecastEndDraft != null ? "takvim bitiş tarihini düzeltin" : null;
    case "western.progression":
    case "western.solar_arc":
      return bad(p.targetDate) ? "hedef tarihi tamamlayın" : null;
    case "vedic.transit":
      return p.vedicTransitMode === "custom" && bad(p.vedicTransitDate, p.vedicTransitTime) ? "Gochara tarihini / saatini tamamlayın" : null;
    case "kp.transit":
      // TRANSİT-03 zaman aralığı: tek-an tarihi bu kipte kullanılmaz; aralık başlangıcı + aralık ayarları (sunucuyla aynı) denetlenir.
      if (p.kpTransitMode === "range") return kpRangeIssue(p);
      return p.kpMomentMode === "custom" && bad(p.kpDate, p.kpTime) ? "KP tarihini / saatini tamamlayın" : null;
    case "kp.ruling":
    case "kp.horary":
      return p.kpMomentMode === "custom" && bad(p.kpDate, p.kpTime) ? "KP tarihini / saatini tamamlayın" : null;
    case "vedic.dasha":
    case "kp.dasha":
      // 2026-10-21: seçilen an kipinde tamamlanmamış/geçersiz an sessizce düşürülmez — plana girmez, neden gösterilir.
      if (p.dashaChainMode !== "custom") return null;
      if (bad(p.dashaChainDate ?? "", p.dashaChainTime ?? "")) return "güncel dönem zinciri tarihini / saatini tamamlayın";
      return localToUtcPreview(p.dashaChainDate ?? "", p.dashaChainTime ?? "", p.dashaChainTz || "Europe/Istanbul").ok ? null : "güncel dönem zinciri anı geçersiz";
    case "vedic.panchanga":
      return (p.panchangaDetail || p.panchangaHours) && p.panchangaDate && bad(p.panchangaDate) ? (p.panchangaDetail ? "ayrıntılı Panchanga gününü tamamlayın" : "hora / choghadiya gününü tamamlayın") : null;
    default:
      return null;
  }
}

/** Seçili ama eksik ayar yüzünden plana alınmayan tekniğin kısa nedeni (yoksa null). */
export function missingReason(id: UiTechniqueId, p: TechniqueParams): string | null {
  const dateWhy = dateInputReason(id, p);
  if (dateWhy) return dateWhy;
  if (TECHNIQUE_META[id].needsPartner && !p.partnerProfileId) return "karşı taraf seçin";
  if (id === "western.relocation" && !p.relocationTarget) return "hedef konum seçin";
  if (id === "western.profections" && profectionAgeOf(p.profectionAge) === null) return "profeksiyon yılını seçin";
  if ((id === "kp.ruling" || id === "kp.horary") && !kpPlaceReady(p)) return id === "kp.horary" ? "değerlendirme yeri seçin" : "gözlem yeri seçin";
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

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};

/** Normalize seçeneklerin okunur özeti (sonuç kartı / kayıtlı analiz başlığı). */
export function describeOptions(technique: string, o: Record<string, unknown>, partnerLabel?: (id: string) => string | null): string {
  const partner = typeof o.partnerProfileId === "string" ? (partnerLabel?.(o.partnerProfileId) ?? "karşı taraf") : null;
  switch (technique) {
    case "western.transit": {
      if (typeof o.atUtc !== "string") return "";
      // TRANSİT-01: gösterim saat dilimi varsa yerel an + UTC; yoksa (eski kayıtlar) yalnız UTC — eski metin aynen.
      const utc = `${fmtDate(o.atUtc)} ${o.atUtc.slice(11, 16)} UTC`;
      const tz = typeof o.displayTz === "string" && o.displayTz !== "UTC" ? o.displayTz : null;
      const z = tz ? formatInZone(o.atUtc, tz) : null;
      const cal = o.calendar as { startDate?: unknown; days?: unknown } | undefined;
      const calTxt = cal && typeof cal.startDate === "string" ? ` · takvim ${fmtDate(cal.startDate)} + ${String(cal.days)} gün` : "";
      return `${z ? `${z.text} ${z.zone} (${utc})` : utc}${calTxt}`;
    }
    case "western.forecast": {
      const days = Number(o.days);
      if (typeof o.startDate !== "string") return "";
      const end = addDaysIso(o.startDate, days - 1);
      const tz = typeof o.displayTz === "string" ? ` · ${o.displayTz}` : "";
      return `${fmtDate(o.startDate)} + ${days} gün${end ? ` (→ ${fmtDate(end)})` : ""} (${forecastPartCount(days)} parça)${tz}`;
    }
    case "western.progression":
    case "western.solar_arc":
      return typeof o.targetDate === "string" ? `hedef ${fmtDate(o.targetDate)}` : "";
    case "western.solar_return":
      return `${String(o.returnYear)} dönüşü${returnPlace(o)}`;
    case "western.lunar_return":
      if (typeof o.month !== "string") return "";
      // Eski (Aşama 3) kayıtlarda sıra yok: o zaman yalnız ayın ilk dönüşü hesaplanabiliyordu.
      return `${o.month.slice(5, 7)}.${o.month.slice(0, 4)} · ${o.sequence === 2 ? "2." : "1."} dönüş${o.sequence === undefined ? " (ayın ilk dönüşü)" : ""}${returnPlace(o)}`;
    case "western.synastry":
    case "western.composite":
      return `${partner ?? ""}${o.partnerRevision ? ` (karşı taraf rev ${String(o.partnerRevision)})` : ""}`;
    case "western.relocation": {
      const t = o.target as { label?: string } | undefined;
      return t?.label ? `→ ${t.label}` : typeof o.targetLocationId === "string" ? `→ ${o.targetLocationId}` : "";
    }
    case "vedic.drishti":
      return "ayanamsa: Lahiri (sabit)";
    case "vedic.panchanga": {
      if (o.detail !== true && o.hours !== true) return "ayanamsa: Lahiri (sabit)";
      const pl = (o.place as { label?: string } | undefined)?.label;
      const day = typeof o.detailDate === "string" ? fmtDate(o.detailDate) : "doğum günü";
      const what = o.detail === true ? `ayrıntılı: ${day}${o.hours === true ? " · hora + choghadiya" : ""}` : `hora + choghadiya: ${day}`;
      return `ayanamsa: Lahiri (sabit) · ${what}${pl ? ` · ${pl}` : ""}`;
    }
    case "kp.chart":
      return `${o.ayanamsa ? `${KP_AY_LABEL[String(o.ayanamsa)] ?? String(o.ayanamsa)} · ` : ""}Placidus · düğüm ${o.nodeType === "true" ? "gerçek" : "ortalama"}`;
    case "kp.dasha":
      return `${dashaLevelLabel(o)} · ${KP_AY_LABEL[String(o.ayanamsa)] ?? String(o.ayanamsa)}${dashaChainLabel(o)}`;
    case "kp.ruling":
    case "kp.transit":
    case "kp.horary": {
      const at = typeof o.atUtc === "string" ? `${fmtDate(o.atUtc)} ${o.atUtc.slice(11, 16)} UTC` : "";
      const pl = (o.place as { label?: string } | undefined)?.label;
      if (technique === "kp.horary") {
        // HORARY-P2: yerel soru anı esas, UTC parantezde (dilim: displayTz → değerlendirme yeri → UTC + not). Yalnız gösterim.
        // HORARY-P1: başarısız denemeler ham seçenekle listelenir ({ now: true } — an henüz sunucuda belirlenmedi).
        const when = typeof o.atUtc === "string" ? questionMomentLabel(o.atUtc, horaryDisplayZone(o)) : o.now === true ? "şimdi (gerçek soru anı)" : "";
        return `sayı ${String(o.horaryNumber)} · ${when}${pl ? ` · ${pl}` : ""}`;
      }
      if (technique === "kp.ruling") return `${at}${pl ? ` · ${pl}` : ""}`;
      const rg = o.range as { startDate?: string; days?: number; planets?: string[]; kinds?: string[] } | undefined;
      if (technique === "kp.transit" && rg && typeof rg.startDate === "string") {
        const kinds = (rg.kinds ?? []).map((k) => KP_KIND_SHORT[k] ?? k).join(" + ");
        const planets = (rg.planets ?? []).map((x) => KP_PLANET_SHORT[x] ?? x).join(", ");
        return `aralık ${fmtDate(rg.startDate)} + ${String(rg.days)} gün · ${kinds}${planets ? ` · ${planets}` : ""} · ${KP_AY_LABEL[String(o.ayanamsa)] ?? String(o.ayanamsa)}`;
      }
      return `${at} · ${KP_AY_LABEL[String(o.ayanamsa)] ?? String(o.ayanamsa)}`;
    }
    case "vedic.transit":
      return typeof o.atUtc === "string" ? `${fmtDate(o.atUtc)} ${o.atUtc.slice(11, 16)} UTC · ayanamsa: Lahiri (sabit)` : "ayanamsa: Lahiri (sabit)";
    case "vedic.ashtakavarga":
    case "vedic.shadbala":
      return `ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "vedic.dasha":
      return `${dashaLevelLabel(o)} · ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}${dashaChainLabel(o)}`;
    case "vedic.varga":
      return `D${Number(o.division ?? 9)} · ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "vedic.d1":
      return `ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "western.fixed_stars":
      return `orb ${Number(o.orb ?? 1).toLocaleString("tr-TR")}° · ekliptik boylam kavuşumu${o.reportCatalog === true ? " · raporda katalog" : ""}`;
    case "western.profections":
      return profectionAgeOf(o.age) !== null ? `${Number(o.age)} yaş profeksiyon yılı · bütün-burç` : "";
    case "western.local_space": {
      const r = o.reference as { label?: string } | undefined;
      return `merkez: ${r?.label ?? (o.referenceLocationId ? String(o.referenceLocationId) : "doğum yeri")}`;
    }
    default:
      return "";
  }
}

/** Dönüş konumu etiketi: farklı konumsa " · konum: Londra", doğum yeriyse " · doğum yeri" (eski kayıtlarda boş). */
function returnPlace(o: Record<string, unknown>): string {
  const rl = o.returnLocation as { locationId?: string | null; label?: string } | undefined;
  if (rl?.locationId) return ` · konum: ${rl.label ?? rl.locationId}`;
  if (typeof o.returnLocationId === "string") return ` · konum: ${o.returnLocationId}`;
  return rl || o.returnLocationId === null ? " · doğum yeri" : "";
}

export function techniqueLabel(id: string): string {
  return (TECHNIQUE_META as Record<string, { label: string }>)[id]?.label ?? id;
}

export type LunarReturnInfo = { sequence: number; approxUtc: string };

/** "2027-06-28T13:58" → "28.06.2027 13:58 UTC" */
export function fmtUtcMinute(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)} UTC`;
}

/** Aşama 5: ev/bhava sistemi etiketi — Vedik "whole_sign" Batı etiket tablosunda yok. */
export function houseSystemLabel(h: string | null | undefined, westernLabels: Record<string, string>): string {
  if (!h) return "ev sistemi yok";
  if (h === "whole_sign") return "Bütün-burç (rashi chakra)";
  return westernLabels[h] ?? h;
}

/** Zodyak çerçevesi: Vedik teknikler sidereal (nirayana), diğerleri tropikal. */
export function zodiacLabel(technique: string): string {
  return technique.startsWith("kp.") ? "Sidereal (KP)" : technique.startsWith("vedic.") ? "Sidereal (nirayana)" : "Tropikal";
}

// ─── TRANSİT-03: KP Transit zaman aralığı (istemci meta; sınırlar sunucudaki engine/techniques ile AYNI, test denetler) ───
export const KP_TIMING_MAX_DAYS = 92;
export const KP_POSITIONS_MAX_DAYS = 7;
export const KP_POSITIONS_INTERVALS = [60, 180, 360, 720, 1440] as const;
const KP_KIND_SHORT: Record<string, string> = { sublord: "Sub-Lord", rasi: "Rasi", positions: "konum tablosu" };
const KP_PLANET_SHORT: Record<string, string> = { sun: "Güneş", moon: "Ay", mars: "Mars", mercury: "Merkür", jupiter: "Jüpiter", venus: "Venüs", saturn: "Satürn" };
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
export function kpRangeIssue(p: TechniqueParams): string | null {
  if (dateInputIssue(p.kpRangeStart)) return "KP aralık başlangıç tarihini tamamlayın";
  const k = p.kpRangeKinds ?? [];
  if (k.length === 0) return "KP aralık türü seçin";
  if ((k.includes("sublord") || k.includes("rasi")) && (p.kpRangePlanets ?? []).length === 0) return "KP aralık gezegeni seçin";
  if (!Number.isInteger(p.kpRangeDays) || p.kpRangeDays < 1 || p.kpRangeDays > KP_TIMING_MAX_DAYS) return `KP aralığı en çok ${KP_TIMING_MAX_DAYS} gün olabilir`;
  if (k.includes("positions") && p.kpRangeDays > KP_POSITIONS_MAX_DAYS) return `KP konum tablosu en çok ${KP_POSITIONS_MAX_DAYS} gün olabilir`;
  return null;
}
/** Tahmini istek sayısı (önbellek hariç): gezegen × (sub-lord + rasi) + konum tablosu. */
export function kpRangeRequestCount(p: TechniqueParams): number {
  const k = p.kpRangeKinds ?? [];
  return (p.kpRangePlanets ?? []).length * ((k.includes("sublord") ? 1 : 0) + (k.includes("rasi") ? 1 : 0)) + (k.includes("positions") ? 1 : 0);
}
