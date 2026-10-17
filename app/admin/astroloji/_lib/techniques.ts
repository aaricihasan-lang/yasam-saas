// Astroloji owner UI — teknik seçimi için İSTEMCİ meta verisi (SAF).
// Sunucudaki teknik tanımları (lib/astrology/engine/techniques) istemci paketine ALINMAZ; burada yalnız
// etiket + hangi parametrenin sorulacağı tutulur. Seçenekler sunucuda yeniden doğrulanır/normalize edilir.

import { addDaysIso, formatInZone } from "@/lib/astrology/transitDetail";
import type { HouseSystem, NodeType } from "@/lib/astrology/model/western";

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
  "vedic.d1": { label: "Vedik D1 (Rashi)", hint: "Sidereal kundli: Lagna, graha, nakshatra/pada, yogalar", needsPartner: false, needsTime: true },
  "vedic.drishti": { label: "Graha Drishti", hint: "Parashari bütün-burç graha drishti — yalnız Lahiri", needsPartner: false, needsTime: true },
  "vedic.ashtakavarga": { label: "Ashtakavarga", hint: "Bhinna/Sarva bindu ızgarası, Shodhana, Shodhya Pinda", needsPartner: false, needsTime: true },
  "vedic.shadbala": { label: "Shadbala", hint: "Altı katlı graha gücü (BPHS), oran ve sıralama", needsPartner: false, needsTime: true },
  "vedic.panchanga": { label: "Janma Panchanga", hint: "Doğum anı tithi, nakshatra, nitya yoga, karana — yalnız Lahiri", needsPartner: false, needsTime: true },
  "vedic.transit": { label: "Gochara (Vedik transit)", hint: "Seçilen anın sidereal grahaları → Janma Rashi'den / Lagna'dan ev, bütün-burç drishti, kaksha — yalnız Lahiri", needsPartner: false, needsTime: true },
  "kp.chart": { label: "KP doğum haritası", hint: "Placidus cusp'ları, sign / star / sub / sub-sub lord, 4 düzey significator (KP-Newcomb)", needsPartner: false, needsTime: true },
  "kp.dasha": { label: "KP dasha", hint: "Vimshottari (KP ayanamsa) + dönem lordlarının KP significator'ları; alt dönemler tıklayınca", needsPartner: false, needsTime: true },
  "kp.ruling": { label: "KP ruling planets", hint: "Seçilen anın ruling planet'leri + natal significator'ları", needsPartner: false, needsTime: true },
  "kp.transit": { label: "KP transit (kısmi)", hint: "Seçilen anın KP gökyüzü (star / sub lord); natal ev analizi yok", needsPartner: false, needsTime: false },
  "kp.horary": { label: "KP horary (1–249)", hint: "Sayı + soru anı + değerlendirme yeri; doğum verisi kullanılmaz", needsPartner: false, needsTime: false },
  "vedic.dasha": { label: "Vimshottari Dasha", hint: "Mahadasha zaman çizelgesi; Antardasha / Pratyantardasha tıklayınca yüklenir", needsPartner: false, needsTime: true },
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
  /** KP an (ruling / transit / horary ortak): şimdi veya tarih-saat. */
  kpMomentMode: "now" | "custom";
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
    kpDate: iso,
    kpTime: "12:00",
    kpTz: "Europe/Istanbul",
    horaryNumber: 1,
    kpPlace: null,
    kpPlaceMode: "unset",
    fixedStarsOrb: 1,
    fixedStarsCatalog: false,
  };
}

/** Seçili teknikler → sunucu seçim listesi (sıra sabit: UI_TECHNIQUES sırası). */
export function buildSelections(
  checked: Partial<Record<UiTechniqueId, boolean>>,
  p: TechniqueParams,
  method: { houseSystem: HouseSystem; nodeType: NodeType },
): { technique: UiTechniqueId; options: Record<string, unknown> }[] {
  const out: { technique: UiTechniqueId; options: Record<string, unknown> }[] = [];
  for (const id of UI_TECHNIQUES) {
    if (!checked[id]) continue;
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
      case "vedic.d1":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.drishti":
      case "vedic.ashtakavarga":
      case "vedic.shadbala":
      case "vedic.panchanga":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.dasha":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa, mahadasha: p.dashaMd || null, antardasha: p.dashaMd && p.dashaAd ? p.dashaAd : null } });
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
        out.push({ technique: id, options: { ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType, mahadasha: p.kpDashaMd || null, antardasha: p.kpDashaMd && p.kpDashaAd ? p.kpDashaAd : null } });
        break;
      case "kp.ruling":
      case "kp.transit":
      case "kp.horary": {
        const at = p.kpMomentMode === "now" ? { now: true } : { date: p.kpDate, time: p.kpTime, timezone: p.kpTz };
        // Gözlem yeri seçilmemişse (veya "başka konum" seçili ama konum yok) ruling/horary plana alınmaz.
        if (id !== "kp.transit" && !kpPlaceReady(p)) break;
        if (id === "kp.ruling") out.push({ technique: id, options: { ...at, nodeType: p.kpNodeType, placeLocationId: p.kpPlaceMode === "other" ? (p.kpPlace?.id ?? null) : null } });
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

/** Ruling / horary için gözlem yeri açıkça belirlendi mi? */
export function kpPlaceReady(p: TechniqueParams): boolean {
  return p.kpPlaceMode === "birth" || (p.kpPlaceMode === "other" && !!p.kpPlace);
}

/** Seçili ama eksik ayar yüzünden plana alınmayan tekniğin kısa nedeni (yoksa null). */
export function missingReason(id: UiTechniqueId, p: TechniqueParams): string | null {
  if (TECHNIQUE_META[id].needsPartner && !p.partnerProfileId) return "karşı taraf seçin";
  if (id === "western.relocation" && !p.relocationTarget) return "hedef konum seçin";
  if ((id === "kp.ruling" || id === "kp.horary") && !kpPlaceReady(p)) return id === "kp.horary" ? "değerlendirme yeri seçin" : "gözlem yeri seçin";
  return null;
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
    case "vedic.panchanga":
      return "ayanamsa: Lahiri (sabit)";
    case "kp.chart":
      return `${o.ayanamsa ? `${KP_AY_LABEL[String(o.ayanamsa)] ?? String(o.ayanamsa)} · ` : ""}Placidus · düğüm ${o.nodeType === "true" ? "gerçek" : "ortalama"}`;
    case "kp.dasha": {
      const lord = (v: unknown) => DASHA_LORD_OPTIONS.find((x) => x[0] === v)?.[1] ?? String(v);
      const lv = o.antardasha ? `Pratyantardasha · ${lord(o.mahadasha)} / ${lord(o.antardasha)}` : o.mahadasha ? `Antardasha · ${lord(o.mahadasha)}` : "Mahadasha";
      return `${lv} · ${KP_AY_LABEL[String(o.ayanamsa)] ?? String(o.ayanamsa)}`;
    }
    case "kp.ruling":
    case "kp.transit":
    case "kp.horary": {
      const at = typeof o.atUtc === "string" ? `${fmtDate(o.atUtc)} ${o.atUtc.slice(11, 16)} UTC` : "";
      const pl = (o.place as { label?: string } | undefined)?.label;
      if (technique === "kp.horary") return `sayı ${String(o.horaryNumber)} · ${at}${pl ? ` · ${pl}` : ""}`;
      if (technique === "kp.ruling") return `${at}${pl ? ` · ${pl}` : ""}`;
      return `${at} · ${KP_AY_LABEL[String(o.ayanamsa)] ?? String(o.ayanamsa)}`;
    }
    case "vedic.transit":
      return typeof o.atUtc === "string" ? `${fmtDate(o.atUtc)} ${o.atUtc.slice(11, 16)} UTC · ayanamsa: Lahiri (sabit)` : "ayanamsa: Lahiri (sabit)";
    case "vedic.ashtakavarga":
    case "vedic.shadbala":
      return `ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "vedic.dasha": {
      const lord = (v: unknown) => DASHA_LORD_OPTIONS.find((x) => x[0] === v)?.[1] ?? String(v);
      const lv = o.antardasha ? `Pratyantardasha · ${lord(o.mahadasha)} / ${lord(o.antardasha)}` : o.mahadasha ? `Antardasha · ${lord(o.mahadasha)}` : "Mahadasha";
      return `${lv} · ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    }
    case "vedic.varga":
      return `D${Number(o.division ?? 9)} · ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "vedic.d1":
      return `ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "western.fixed_stars":
      return `orb ${Number(o.orb ?? 1).toLocaleString("tr-TR")}° · ekliptik boylam kavuşumu${o.reportCatalog === true ? " · raporda katalog" : ""}`;
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
