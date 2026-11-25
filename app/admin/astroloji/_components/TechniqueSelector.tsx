"use client";

/**
 * Teknik parametre alanları (Aşama D3: Göksel Analiz Hazırlık Merkezi'nin ayar paneli kullanır).
 * Bu bileşenler istek SAYISI hesaplamaz (tahmin yok); gerçek X/Y/Z sunucu planlayıcısından gelir (sayfa gösterir).
 * Alan adları, aria etiketleri ve parametre → seçim dönüşümü (buildSelections) önceki teknik listesiyle AYNIDIR;
 * D3 yalnız yerleşimi değiştirir. Ortak parametreler (Vedik ayanamsa, KP an/yer, ev sistemi, ay düğümü) tek
 * durumdadır → bir teknikte değiştirmek aynı ortak alanı kullanan tüm teknikleri etkiler (etiketlerde belirtilir).
 */

import { useLocale, useTranslations } from "next-intl";
import trSelector from "@/messages/tr/atlas.techniqueSelector.json";
import { addDaysIso, dateInputIssue, daysBetweenIso, localToUtcPreview, timeInputIssue } from "@/lib/astrology/transitDetail";
import { PROFECTION_AGE_MAX, isLeapDayBirth, profectionAgeOn, profectionYearRange } from "@/lib/astrology/model/westernProfections";
import { HOUSE_SYSTEMS, NODE_TYPES, type HouseSystem, type NodeType } from "@/lib/astrology/model/western";
import LocationPicker from "./LocationPicker";
import { KpRulingIntervalFields } from "./KpRulingIntervalFields";
// 2026-10-22 — Vedik aylık zamanlama (ayrı satır: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { VedicMonthlyFields } from "./VedicMonthlyFields";
import { FIXED_STAR_ORB_DEFAULT, FIXED_STAR_ORB_OPTIONS } from "@/lib/astrology/model/westernFixedStars";
import { EXTRA_SECTIONS } from "@/lib/astrology/model/westernExtraPoints";
import {
  CLASSIC_NATAL_HOUSE_SYSTEMS,
  NATAL_HIGH_LATITUDE,
  isClassicNatalHouseSystem,
  natalHouseSystemUndefinedAtLatitude,
  type NatalHouseSystemOption,
} from "@/lib/astrology/model/natalHouseSystems";
import { KP_POSITIONS_INTERVALS, KP_POSITIONS_MAX_DAYS, KP_TIMING_MAX_DAYS, kpRangeRequestCount, FORECAST_MAX_DAYS, DASHA_LORD_OPTIONS, KP_AYANAMSA_OPTIONS, VEDIC_AYANAMSA_OPTIONS, VEDIC_VARGA_OPTIONS, fmtUtcMinute, forecastPartCount, istanbulDateIso, techniqueLabel, type LunarReturnInfo, type TechText, type TechniqueParams, type UiTechniqueId } from "../_lib/techniques";
// 2026-10-22 — Gezegen dönüşleri (ayrı satırlar: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import type { PlanetaryReturnInfo, PlanetaryReturnNeighbors, WesternMethod } from "../_lib/techniques";
import { PLANETARY_RETURN_PLANETS, type PlanetaryReturnPlanet } from "@/lib/astrology/model/westernPlanetaryReturn";
// 2026-10-22 — Deklinasyon paralelleri (ayrı satır: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { DeclinationParallelsFields } from "./DeclinationParallelsFields";
import { ClassicalDignitiesFields } from "./ClassicalDignitiesFields";
import { TransitScanFields } from "./TransitScanFields";

// max-w-full: uzun seçenek metni (ör. "Lahiri (Chitrapaksha) — varsayılan") 390 px'te kartı taşırmasın.
const inp = "max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm";
const TZ_OPTIONS = ["Europe/Istanbul", "UTC", "Europe/London", "Europe/Berlin", "America/New_York", "Asia/Dubai"];

let ALL_TZ: string[] | null = null;
/** ATL-P3-06 (2026-10-20): KP-Newcomb ile KP-Old (eski tablo) farkı günümüzde ~5″ — seçimin etkisi açıklanır (yalnız ipucu). */

/**
 * I18N-F1-R5 (ATLAS-B): ekran metinleri katalogdan (atlas.techniqueSelector; seçenek etiketleri atlas.techniques + terms).
 * Alan adları / aria etiketleri / seçim dönüşümü TR'de bayt-bayt aynı. Lib'in kaynak dilde (tr) ürettiği giriş uyarıları
 * (dateInputIssue / timeInputIssue / localToUtcPreview) TR'de olduğu gibi; diğer dillerde aynı kural katalogla gösterilir.
 */
/** Lib (transitDetail) giriş uyarılarının kaynak dil kalıpları = TR katalog `lib.*` (harness kilitli). */
const TR_LIB = (trSelector as unknown as { atlas: { techniqueSelector: { lib: Record<string, string> } } }).atlas.techniqueSelector.lib;
function useSel() {
  const ts = useTranslations("atlas.techniqueSelector");
  const tq = useTranslations("atlas.techniques");
  const tt = useTranslations("terms");
  const locale = useLocale();
  const L = tq as unknown as TechText;
  const lib = (x: string | null): string | null => {
    if (x === null || locale === "tr") return x;
    // Lib kaynak dil kalıpları TR kataloğundan (lib.*) türetilir: "{ad}" → yakalama; GG.AA.YYYY yakalaması ekran ayırıcısıyla.
    for (const [key, tpl] of Object.entries(TR_LIB)) {
      const names: string[] = [];
      const re = new RegExp(`^${tpl.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, (_m, n: string) => (names.push(n), "(.+?)"))}$`);
      const m = re.exec(x);
      if (!m) continue;
      const values: Record<string, string> = {};
      names.forEach((n, i) => (values[n] = m[i + 1].replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, "$1/$2/$3")));
      return ts(`lib.${key}`, values);
    }
    return x;
  };
  return { ts, tq, tt, L, locale, lib };
}
function allTimeZones(): string[] {
  if (ALL_TZ) return ALL_TZ;
  try {
    ALL_TZ = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    ALL_TZ = [];
  }
  return ALL_TZ;
}

/** TRANSİT-01: sık kullanılan saat dilimleri + tarayıcının desteklediği tüm IANA bölgeleri (seçili değer listede yoksa eklenir). */
function TzSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { ts } = useSel();
  const all = allTimeZones();
  const rest = all.filter((z) => !TZ_OPTIONS.includes(z));
  return (
    <select className={inp} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <optgroup label={ts("tzCommon")}>
        {TZ_OPTIONS.map((z) => (
          <option key={z} value={z}>
            {z}
          </option>
        ))}
        {!TZ_OPTIONS.includes(value) && !rest.includes(value) && <option value={value}>{value}</option>}
      </optgroup>
      {rest.length > 0 && (
        <optgroup label={ts("tzAll")}>
          {rest.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/** Tarih/saat alanı uyarısı (eksik / geçersiz giriş). Yazma sırasında oluşan ara değerler hata değildir; yalnız açıklanır. */
/**
 * 2026-10-21: "Güncel dönem zinciri" (Vedik + KP dasha ortak): seçilen anda çalışan Maha → Prana. Kayıt tek düzey kalır; zincir
 * kayda ve rapora o anki 5 dönem olarak eklenir. Kapalıyken istek gövdesi/önbellek birebir eski.
 */
function DashaChainControls({ params, onParams }: { params: TechniqueParams; onParams: (p: TechniqueParams) => void }) {
  const { ts, lib } = useSel();
  const mode = params.dashaChainMode ?? "off";
  const set = <K extends keyof TechniqueParams>(k: K, v: TechniqueParams[K]) => onParams({ ...params, [k]: v });
  const custom = mode === "custom";
  const issue = custom ? (dateInputIssue(params.dashaChainDate ?? "") ?? timeInputIssue(params.dashaChainTime ?? "")) : null;
  const preview = custom && !issue ? localToUtcPreview(params.dashaChainDate ?? "", params.dashaChainTime ?? "", params.dashaChainTz || "Europe/Istanbul") : null;
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-slate-300/80 bg-white/50 px-2.5 py-2 text-xs" data-testid="astro-dasha-chain-params">
      <legend className="px-1 text-[11px] font-semibold text-slate-700">{ts("chain.legend")}</legend>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "off"} onChange={() => set("dashaChainMode", "off")} data-dasha-chain="off" /> {ts("chain.off")}
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "now"} onChange={() => set("dashaChainMode", "now")} data-dasha-chain="now" /> {ts("chain.now")}
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={custom}
            onChange={() => onParams({ ...params, dashaChainMode: "custom", dashaChainDate: params.dashaChainDate || istanbulDateIso(new Date()), dashaChainTime: params.dashaChainTime || "12:00", dashaChainTz: params.dashaChainTz || "Europe/Istanbul" })}
            data-dasha-chain="custom"
          />{" "}
          {ts("chain.custom")}
        </label>
      </div>
      {custom && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <input type="date" className={inp} value={params.dashaChainDate ?? ""} onChange={(e) => set("dashaChainDate", e.target.value)} aria-label={ts("chain.dateAria")} />
          <input type="time" className={inp} value={params.dashaChainTime ?? ""} onChange={(e) => set("dashaChainTime", e.target.value)} aria-label={ts("chain.timeAria")} />
          <select className={inp} value={params.dashaChainTz || "Europe/Istanbul"} onChange={(e) => set("dashaChainTz", e.target.value)} aria-label={ts("chain.tzAria")}>
            {TZ_OPTIONS.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <FieldIssue text={issue ?? (preview && !preview.ok ? preview.text : null)} testId="astro-dasha-chain-issue" />
          {preview?.ok && <span className="text-slate-600">{lib(preview.text)}</span>}
        </div>
      )}
      {mode !== "off" && <p className="text-[11px] text-slate-600">{ts("chain.note")}</p>}
    </fieldset>
  );
}

function FieldIssue({ text: raw, testId }: { text: string | null; testId: string }) {
  const { lib } = useSel();
  const text = lib(raw);
  if (!text) return null;
  return (
    <span className="text-[11px] font-medium text-rose-700" role="alert" data-testid={testId}>
      {text}
    </span>
  );
}

/**
 * Takvim bitiş tarihi: değer başlangıç + gün sayısından türetilir. Kullanıcı yazarken (yıl rakam rakam) oluşan ara
 * değerler TASLAKTA tutulur (parametre `forecastEndDraft`) — kontrollü değere geri dönüp girişi silmez; yalnız geçerli ve
 * aralık içi tarih süreyi değiştirir. Taslak geçersizken takvim plana girmez (dateInputReason) → Başlat kapalı.
 */
function ForecastEndInput({ start, days, draft, onChange }: { start: string; days: number; draft: string | null; onChange: (next: { days?: number; draft: string | null }) => void }) {
  const { ts, lib } = useSel();
  const end = addDaysIso(start, days - 1);
  const value = draft ?? end ?? "";
  const d = draft === null ? null : daysBetweenIso(start, draft);
  const issue =
    draft === null
      ? null
      : (lib(dateInputIssue(draft)) ?? (d === null ? ts("forecast.endInvalid") : d < 1 ? ts("forecast.endBefore") : d > FORECAST_MAX_DAYS ? ts("forecast.endMax", { max: FORECAST_MAX_DAYS }) : null));
  return (
    <>
      <input
        type="date"
        className={inp}
        min={dateInputIssue(start) ? undefined : start}
        max={addDaysIso(start, FORECAST_MAX_DAYS - 1) ?? undefined}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          const n = daysBetweenIso(start, v);
          if (!dateInputIssue(v) && n !== null && n >= 1 && n <= FORECAST_MAX_DAYS) onChange({ days: n, draft: null });
          else onChange({ draft: v });
        }}
        aria-invalid={issue ? true : undefined}
        aria-label={ts("forecast.endAria")}
      />
      <FieldIssue text={issue ? ts("forecast.endIssue", { issue }) : null} testId="astro-forecast-end-issue" />
    </>
  );
}

export type PartnerOption = { id: string; label: string };

/** Ev sistemi kullanan Batı teknikleri (ortak seçim). */
export const USES_HOUSE_SYSTEM: readonly UiTechniqueId[] = ["western.natal", "western.solar_return", "western.lunar_return", "western.relocation", "western.synastry", "western.composite", "western.extra_points", "western.planetary_return"];
/** Ay düğümü türü kullanan Batı teknikleri (ortak seçim). */
export const USES_NODE_TYPE: readonly UiTechniqueId[] = ["western.natal", "western.transit", "western.progression", "western.solar_arc", "western.synastry", "western.composite", "western.classical_dignities", "western.transit_scan"];

const KP_PLANET_OPTIONS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"] as const;
const KP_KIND_OPTIONS = ["sublord", "rasi", "positions"] as const;
/** TRANSİT-03: KP Transit zaman aralığı ayarları + istek sayısı ön izlemesi (kesin sayı sunucu planında). */
function KpRangeFields({ params, onParams }: { params: TechniqueParams; onParams: (next: TechniqueParams) => void }) {
  const { ts, tq } = useSel();
  const set = <K extends keyof TechniqueParams>(k: K, v: TechniqueParams[K]) => onParams({ ...params, [k]: v });
  const toggle = (k: "kpRangePlanets" | "kpRangeKinds", v: string) => {
    const cur = params[k] ?? [];
    set(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };
  const planets = params.kpRangePlanets ?? [];
  const kinds = params.kpRangeKinds ?? [];
  const n = kpRangeRequestCount(params);
  const posTooLong = kinds.includes("positions") && params.kpRangeDays > KP_POSITIONS_MAX_DAYS;
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-300/80 bg-white/50 px-2.5 py-2" data-testid="astro-kp-range">
      <legend className="px-1 text-[11px] font-semibold text-slate-700">{ts("kpRange.legend")}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          {ts("kpRange.start")}
          <input
            type="date"
            className={inp}
            min="1600-01-01"
            max="2600-12-31"
            value={params.kpRangeStart}
            onChange={(e) => set("kpRangeStart", e.target.value)}
            aria-invalid={dateInputIssue(params.kpRangeStart) ? true : undefined}
            aria-label={ts("kpRange.startAria")}
          />
        </label>
        <FieldIssue text={dateInputIssue(params.kpRangeStart)} testId="astro-kp-range-date-issue" />
        <label className="flex items-center gap-1">
          {ts("kpRange.duration")}
          <select className={inp} value={params.kpRangeDays} onChange={(e) => set("kpRangeDays", Number(e.target.value))} aria-label={ts("kpRange.durationAria")}>
            {[1, 3, 7, 14, 30, 60, KP_TIMING_MAX_DAYS].map((d) => (
              <option key={d} value={d}>
                {ts("days", { n: d })}
              </option>
            ))}
          </select>
        </label>
        <select className={inp} value={params.kpRangeTz ?? "Europe/Istanbul"} onChange={(e) => set("kpRangeTz", e.target.value)} aria-label={ts("kpRange.tzAria")}>
          {[...new Set([params.kpRangeTz ?? "Europe/Istanbul", ...TZ_OPTIONS])].map((z) => (
            <option key={z} value={z}>
              {ts("kpRange.tzDisplay", { z })}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={ts("kpRange.kindsAria")}>
        {KP_KIND_OPTIONS.map((v) => (
          <label key={v} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${kinds.includes(v) ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-slate-200 text-slate-600"}`}>
            <input type="checkbox" checked={kinds.includes(v)} onChange={() => toggle("kpRangeKinds", v)} data-kp-kind={v} /> {ts(`kpRange.kind.${v}`)}
          </label>
        ))}
      </div>
      {(kinds.includes("sublord") || kinds.includes("rasi")) && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={ts("kpRange.planetsAria")}>
          {KP_PLANET_OPTIONS.map((v) => (
            <label key={v} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${planets.includes(v) ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-slate-200 text-slate-600"}`}>
              <input type="checkbox" checked={planets.includes(v)} onChange={() => toggle("kpRangePlanets", v)} data-kp-planet={v} /> {tq(`kpPlanet.${v}`)}
            </label>
          ))}
          <span className="self-center text-[11px] text-slate-500">{ts("kpRange.noNodes")}</span>
        </div>
      )}
      {kinds.includes("positions") && (
        <label className="flex items-center gap-1">
          {ts("kpRange.interval")}
          <select className={inp} value={params.kpRangeInterval} onChange={(e) => set("kpRangeInterval", Number(e.target.value))} aria-label={ts("kpRange.intervalAria")}>
            {KP_POSITIONS_INTERVALS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? ts("minutes", { n: m }) : m === 1440 ? ts("daily") : ts("hours", { n: m / 60 })}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className={`text-[11px] leading-snug ${posTooLong ? "text-rose-700" : "text-slate-600"}`} data-testid="astro-kp-range-note">
        {posTooLong
          ? ts("kpRange.posTooLong", { max: KP_POSITIONS_MAX_DAYS })
          : ts("kpRange.estimate", { n, max: KP_TIMING_MAX_DAYS })}
      </p>
    </fieldset>
  );
}

/** Tek bir tekniğin kendi parametreleri (yoksa null). */
export function TechniqueParamFields({
  id,
  params,
  onParams,
  lunarReturns = null,
  birthPlaceLabel = null,
  birthDate = null,
  planetaryReturns = null,
  planetaryReturnNeighbors = null,
  natalHouseSystem = "placidus",
}: {
  /** 02.11.2026 — Klasik asalet: varsayılan ev sistemi (Natal'ın 8'li seçimi). */
  natalHouseSystem?: NatalHouseSystemOption;
  id: UiTechniqueId;
  params: TechniqueParams;
  onParams: (next: TechniqueParams) => void;
  /** Yıllık profeksiyonlar: danışanın doğum tarihi (YYYY-MM-DD; yaş ↔ yıl aralığı gösterimi için). */
  birthDate?: string | null;
  /** FINAL: danışanın kayıtlı doğum yeri (gözlem yeri seçiminde ÖNERİ olarak gösterilir; otomatik seçilmez). */
  birthPlaceLabel?: string | null;
  /** Sunucu planının bildirdiği, seçilen aydaki lunar return'ler (henüz plan yoksa null). */
  lunarReturns?: LunarReturnInfo[] | null;
  /** 2026-10-22: sunucu planının bildirdiği, hedef tarihe en yakın dönüş kümesinin kavuşumları (henüz plan yoksa null). */
  planetaryReturns?: PlanetaryReturnInfo[] | null;
  /** 2026-10-22: önceki / sonraki dönüş kümesinin ilk kavuşum günü (plan bilgisi; henüz plan yoksa null). */
  planetaryReturnNeighbors?: PlanetaryReturnNeighbors | null;
}) {
  const set = <K extends keyof TechniqueParams>(k: K, v: TechniqueParams[K]) => onParams({ ...params, [k]: v });
  const { ts, tq, L, locale, lib } = useSel();
  const tp = useTranslations("atlas.planetaryReturn");
  const sep = locale === "en" ? "/" : ".";

  // Yıllık profeksiyonlar: "(bu yıl)" işareti için içinde bulunulan profeksiyon yaşı (Türkiye takvim günü). Öneri ve danışan bağlamı
  // (P2-01) durumun sahibi sayfada (syncProfectionContext) yönetilir; bu alan seçimi kendiliğinden DEĞİŞTİRMEZ.
  const profectionNow = birthDate ? profectionAgeOn(birthDate, istanbulDateIso(new Date())) : null;

  // Aşama 4.1 — dönüş konumu: doğum yeri (varsayılan) veya sistemdeki konum listesinden başka bir yer.
  // Doğum anı/dönüş anı DEĞİŞMEZ; yalnız dönüş haritasının ASC/MC/evleri seçilen yere göre hesaplanır.
  const returnLocationChooser = (key: "solarReturnLocation" | "lunarReturnLocation" | "planetaryReturnLocation", label: string) => {
    const v = params[key] ?? null;
    return (
      <div className="flex flex-col gap-1 text-xs" data-testid={`astro-${key}`}>
        <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label={ts("returnLoc.aria", { label })}>
          <label className="flex items-center gap-1">
            <input type="radio" checked={v === null} onChange={() => set(key, null)} data-return-loc="birth" /> {ts("returnLoc.birth")}
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={v !== null} readOnly disabled={v === null} data-return-loc="other" /> {ts("returnLoc.other")}{v ? `: ${v.label}` : ts("returnLoc.pick")}
          </label>
        </div>
        <LocationPicker value={v} onChange={(x) => set(key, x)} />
      </div>
    );
  };

  const params_ = (id: UiTechniqueId) => {
    switch (id) {
      case "western.transit": {
        // TRANSİT-01: üç kip — şimdi (UTC saat başı, önbellek dostu), seçilen gün (yerel 12:00), seçilen gün + saat (dakika).
        // Saat dilimi doğum haritasından AYRIDIR; hesaplanacak UTC anı seçimden önce açıkça gösterilir.
        const preview =
          params.transitMode === "now"
            ? null
            : localToUtcPreview(params.transitDate, params.transitMode === "date" ? "12:00" : params.transitTime, params.transitTz);
        return (
          <div className="flex flex-col gap-1.5" data-testid="astro-transit-moment">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1" role="radiogroup" aria-label={ts("transit.aria")}>
              <label className="flex items-center gap-1 text-xs">
                <input type="radio" checked={params.transitMode === "now"} onChange={() => set("transitMode", "now")} data-transit-mode="now" /> {ts("transit.now")}
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input type="radio" checked={params.transitMode === "date"} onChange={() => set("transitMode", "date")} data-transit-mode="date" /> {ts("transit.date")}
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input type="radio" checked={params.transitMode === "custom"} onChange={() => set("transitMode", "custom")} data-transit-mode="custom" /> {ts("transit.custom")}
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {params.transitMode !== "now" && (
                <input
                  type="date"
                  className={inp}
                  min="1600-01-01"
                  max="2600-12-31"
                  value={params.transitDate}
                  onChange={(e) => set("transitDate", e.target.value)}
                  aria-invalid={dateInputIssue(params.transitDate) ? true : undefined}
                  aria-label={ts("transit.dateAria")}
                />
              )}
              {params.transitMode === "custom" && (
                <input type="time" className={inp} value={params.transitTime} onChange={(e) => set("transitTime", e.target.value)} aria-invalid={timeInputIssue(params.transitTime) ? true : undefined} aria-label={ts("transit.timeAria")} />
              )}
              <TzSelect value={params.transitTz} onChange={(v) => set("transitTz", v)} label={ts("transit.tzAria")} />
            </div>
            <p className="text-[11px] leading-snug text-slate-500" data-testid="astro-transit-moment-note">
              {params.transitMode === "now"
                ? ts("transit.noteNow")
                : params.transitMode === "date"
                  ? ts("transit.noteDate")
                  : ts("transit.noteCustom")}
              {preview && (
                <span className={`ml-1 font-medium ${preview.ok ? "text-slate-700" : "text-rose-700"}`} role={preview.ok ? undefined : "alert"} data-testid="astro-transit-utc-preview">
                  {lib(preview.text)}
                </span>
              )}
            </p>
          </div>
        );
      }
      case "western.forecast": {
        const startIssue = dateInputIssue(params.forecastStart);
        return (
          <div className="flex flex-col gap-1.5" data-testid="astro-forecast-range">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-xs">
                {ts("forecast.start")}
                <input
                  type="date"
                  className={inp}
                  min="1600-01-01"
                  max="2600-12-31"
                  value={params.forecastStart}
                  onChange={(e) => onParams({ ...params, forecastStart: e.target.value, forecastEndDraft: null })}
                  aria-invalid={startIssue ? true : undefined}
                  aria-label={ts("forecast.startAria")}
                />
              </label>
              <label className="flex items-center gap-1 text-xs">
                {ts("forecast.end")}
                <ForecastEndInput
                  start={params.forecastStart}
                  days={params.forecastDays}
                  draft={params.forecastEndDraft ?? null}
                  onChange={(n) => onParams({ ...params, forecastDays: n.days ?? params.forecastDays, forecastEndDraft: n.draft })}
                />
              </label>
              <select className={inp} value={[30, 90, 180, 365, FORECAST_MAX_DAYS].includes(params.forecastDays) ? params.forecastDays : ""} onChange={(e) => e.target.value && onParams({ ...params, forecastDays: Number(e.target.value), forecastEndDraft: null })} aria-label={ts("forecast.daysAria")}>
                {![30, 90, 180, 365, FORECAST_MAX_DAYS].includes(params.forecastDays) && <option value="">{ts("days", { n: params.forecastDays })}</option>}
                {[30, 90, 180, 365, FORECAST_MAX_DAYS].map((d) => (
                  <option key={d} value={d}>
                    {ts("days", { n: d })}
                  </option>
                ))}
              </select>
              <TzSelect value={params.forecastTz ?? "Europe/Istanbul"} onChange={(v) => set("forecastTz", v)} label={ts("forecast.tzAria")} />
            </div>
            <FieldIssue text={startIssue ? ts("forecast.startIssue", { issue: lib(startIssue) ?? startIssue }) : null} testId="astro-forecast-start-issue" />
            <span className="text-xs text-amber-800">
              {ts("forecast.summary", { days: params.forecastDays, parts: forecastPartCount(params.forecastDays), max: FORECAST_MAX_DAYS })}
            </span>
          </div>
        );
      }
      case "western.progression":
      case "western.solar_arc":
        return (
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            {ts("targetShared")}
            <input type="date" className={inp} value={params.targetDate} onChange={(e) => set("targetDate", e.target.value)} aria-invalid={dateInputIssue(params.targetDate) ? true : undefined} aria-label={ts("targetAria")} />
            <FieldIssue text={dateInputIssue(params.targetDate)} testId="astro-target-date-issue" />
          </label>
        );
      case "western.solar_return":
        return (
          <div className="flex flex-col gap-1.5">
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            {ts("solar.year")}
            <input
              type="number"
              className={`${inp} w-24`}
              min={1600}
              max={2600}
              value={params.returnYear}
              onChange={(e) => set("returnYear", Number(e.target.value))}
              aria-label={ts("solar.yearAria")}
            />
          </label>
            {returnLocationChooser("solarReturnLocation", ts("solar.name"))}
          </div>
        );
      case "western.lunar_return":
        return (
          <div className="flex flex-col gap-1.5">
            <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
              {ts("lunar.month")}
              <input
                type="month"
                className={inp}
                value={params.lunarMonth}
                onChange={(e) => onParams({ ...params, lunarMonth: e.target.value, lunarSequence: 1 })}
                aria-label={ts("lunar.monthAria")}
              />
            </label>
            {/* Ayın dönüşleri SUNUCU planından gelir (natal Ay sunucuda hesaplanır); her seçilen dönüş = 1 istek. */}
            <div className="flex flex-wrap items-center gap-3 text-xs" role="radiogroup" aria-label={ts("lunar.seqAria")}>
              {([1, 2] as const).map((seq) => {
                const r = lunarReturns?.find((x) => x.sequence === seq) ?? null;
                const disabled = lunarReturns !== null && !r;
                return (
                  <label key={seq} className={`flex items-center gap-1 ${disabled ? "text-slate-400" : ""}`}>
                    <input type="radio" disabled={disabled} checked={params.lunarSequence === seq} onChange={() => set("lunarSequence", seq)} data-lunar-seq={seq} />
                    {ts("lunar.seq", { n: seq })}{r ? ` — ~${fmtUtcMinute(r.approxUtc, L)}` : disabled ? ts("lunar.none") : ""}
                  </label>
                );
              })}
            </div>
            {returnLocationChooser("lunarReturnLocation", ts("lunar.name"))}
            {lunarReturns && lunarReturns.length > 1 && <span className="text-xs text-sky-800">{ts("lunar.two", { n: lunarReturns.length })}</span>}
          </div>
        );
      case "vedic.drishti":
      case "vedic.panchanga":
        return params.vedicAyanamsa === "lahiri" ? (
          <div className="flex min-w-0 flex-col gap-1.5 text-xs">
            <p className="text-slate-500">{ts("lahiriFixed")}</p>
            {id === "vedic.panchanga" && (
              <fieldset className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-slate-300/80 bg-white/50 px-2.5 py-2" data-testid="astro-panchanga-detail-params">
                <label className="flex items-start gap-1.5">
                  <input type="checkbox" className="mt-0.5" checked={!!params.panchangaDetail} onChange={(e) => set("panchangaDetail", e.target.checked)} data-panchanga-detail="toggle" />
                  <span>
                    {ts("panchanga.detail")} <strong>{ts("panchanga.plus1")}</strong>
                  </span>
                </label>
                <label className="flex items-start gap-1.5">
                  <input type="checkbox" className="mt-0.5" checked={!!params.panchangaHours} onChange={(e) => set("panchangaHours", e.target.checked)} data-panchanga-hours="toggle" />
                  <span>
                    {ts("panchanga.hours")} <strong>{ts("panchanga.plus2")}</strong> {ts("panchanga.sameDay")}
                  </span>
                </label>
                {(params.panchangaDetail || params.panchangaHours) && (
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <label className="flex min-w-0 flex-wrap items-center gap-2">
                      {ts("panchanga.day")}
                      <input type="date" className={inp} value={params.panchangaDate ?? ""} onChange={(e) => set("panchangaDate", e.target.value)} aria-label={ts("panchanga.dayAria")} />
                    </label>
                    <span className="text-slate-500">{ts("emptyBirthday")}</span>
                    <FieldIssue text={params.panchangaDate ? dateInputIssue(params.panchangaDate) : null} testId="astro-panchanga-date-issue" />
                  </div>
                )}
                {(params.panchangaDetail || params.panchangaHours) && (
                  <div className="flex min-w-0 flex-col gap-1">
                    <span>{ts("panchanga.place")} {params.panchangaPlace ? params.panchangaPlace.label : `${ts("birthPlace")}${birthPlaceLabel ? ` (${birthPlaceLabel})` : ""}`}</span>
                    <LocationPicker value={params.panchangaPlace ?? null} onChange={(v) => set("panchangaPlace", v)} />
                    <span className="text-[11px] text-slate-500">{ts("panchanga.polar")}</span>
                  </div>
                )}
              </fieldset>
            )}
          </div>
        ) : (
          <p className="text-xs text-amber-800">{ts("notLahiri")}</p>
        );
      case "kp.chart":
      case "kp.dasha":
      case "kp.ruling":
      case "kp.transit":
      case "kp.ruling_interval":
      case "kp.horary": {
        const kpCommon = (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {id !== "kp.ruling" && (
              <label className="flex min-w-0 flex-wrap items-center gap-2" title={ts("kpAyanamsaHint")}>
                {ts("kp.ayanamsa")}
                <select className={inp} value={params.kpAyanamsa} onChange={(e) => set("kpAyanamsa", e.target.value)} aria-label={ts("kp.ayanamsaAria", { tech: techniqueLabel(id, L) })}>
                  {KP_AYANAMSA_OPTIONS.map(([v]) => (
                    <option key={v} value={v}>
                      {tq(`kpAyanamsaOption.${v}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("kp.node")}
              <select className={inp} value={params.kpNodeType} onChange={(e) => set("kpNodeType", e.target.value)} aria-label={ts("kp.nodeAria", { id })}>
                <option value="mean">{ts("kp.nodeMean")}</option>
                <option value="true">{ts("kp.nodeTrue")}</option>
              </select>
            </label>
          </div>
        );
        const moment = (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              <input type="radio" checked={params.kpMomentMode === "now"} onChange={() => set("kpMomentMode", "now")} />{" "}
              {id === "kp.horary" ? ts("kp.nowHorary") : ts("nowHour")}
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={params.kpMomentMode === "custom"} onChange={() => set("kpMomentMode", "custom")} /> {ts("dateTime")}
            </label>
            {params.kpMomentMode === "custom" && (
              <>
                <input type="date" className={inp} value={params.kpDate} onChange={(e) => set("kpDate", e.target.value)} aria-label={ts("kp.dateAria")} />
                <input type="time" className={inp} value={params.kpTime} onChange={(e) => set("kpTime", e.target.value)} aria-label={ts("kp.timeAria")} />
                <FieldIssue text={dateInputIssue(params.kpDate) ?? timeInputIssue(params.kpTime)} testId="astro-kp-date-issue" />
                {/* K5 (15.11.2026): 6 sabit seçenek yerine tüm IANA bölgeleri (sunucu her geçerli IANA adını kabul eder; ör. Pacific/Apia). */}
                <TzSelect value={params.kpTz} onChange={(v) => set("kpTz", v)} label={ts("kp.tzAria")} />
              </>
            )}
            <span className="text-slate-500">{ts("kp.sharedMoment")}</span>
          </div>
        );
        const place = (
          <fieldset className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-slate-300/80 bg-white/50 px-2.5 py-2" data-testid="astro-kp-place">
            <legend className="px-1 text-[11px] font-semibold text-slate-700">{id === "kp.horary" ? ts("kp.assessPlace") : ts("kp.observePlace")} {ts("kp.placeShared")}</legend>
            <p className="text-[11px] leading-snug text-slate-600">
              {ts("kp.placeIntro")} <strong>{ts("kp.notBirth")}</strong>
              {ts("kp.placeTail")}
            </p>
            <label className="flex items-start gap-1.5">
              <input type="radio" className="mt-0.5" checked={params.kpPlaceMode === "birth"} onChange={() => onParams({ ...params, kpPlaceMode: "birth" })} data-kp-place="birth" />
              <span>{ts("kp.useBirth")}{birthPlaceLabel ? `: ${birthPlaceLabel}` : ""}</span>
            </label>
            <label className="flex items-start gap-1.5">
              <input type="radio" className="mt-0.5" checked={params.kpPlaceMode === "other"} onChange={() => onParams({ ...params, kpPlaceMode: "other" })} data-kp-place="other" />
              <span>{ts("kp.otherPlace")}{params.kpPlaceMode === "other" && params.kpPlace ? `: ${params.kpPlace.label}` : ""}</span>
            </label>
            {params.kpPlaceMode === "other" && <LocationPicker value={params.kpPlace} onChange={(v) => set("kpPlace", v)} />}
            {params.kpPlaceMode === "unset" && <p className="text-[11px] text-amber-800">{ts("kp.placeRequired")}</p>}
            {params.kpPlaceMode === "other" && !params.kpPlace && <p className="text-[11px] text-amber-800">{ts("kp.pickPlace")}</p>}
          </fieldset>
        );
        return (
          <div className="flex min-w-0 flex-col gap-1.5 text-xs" data-testid={`astro-kp-params-${id}`}>
            {id === "kp.dasha" && (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <select className={inp} value={params.kpDashaMd} onChange={(e) => onParams({ ...params, kpDashaMd: e.target.value, kpDashaAd: "" })} aria-label={ts("kp.mdAria")}>
                  <option value="">{ts("dasha.mdList")}</option>
                  {DASHA_LORD_OPTIONS.map(([v]) => (
                    <option key={v} value={v}>
                      {ts("dasha.kpTo.ad", { lord: tq(`dashaLord.${v}`) })}
                    </option>
                  ))}
                </select>
                {params.kpDashaMd && (
                  <select className={inp} value={params.kpDashaAd} onChange={(e) => onParams({ ...params, kpDashaAd: e.target.value, kpDashaPd: "", kpDashaSd: "" })} aria-label={ts("kp.adAria")}>
                    <option value="">{ts("dasha.adList")}</option>
                    {DASHA_LORD_OPTIONS.map(([v]) => (
                      <option key={v} value={v}>
                        {ts("dasha.kpTo.pd", { lord: tq(`dashaLord.${v}`) })}
                      </option>
                    ))}
                  </select>
                )}
                {params.kpDashaMd && params.kpDashaAd && (
                  <select className={inp} value={params.kpDashaPd ?? ""} onChange={(e) => onParams({ ...params, kpDashaPd: e.target.value, kpDashaSd: "" })} aria-label={ts("kp.pdAria")}>
                    <option value="">{ts("dasha.pdList")}</option>
                    {DASHA_LORD_OPTIONS.map(([v]) => (
                      <option key={v} value={v}>
                        {ts("dasha.kpTo.sd", { lord: tq(`dashaLord.${v}`) })}
                      </option>
                    ))}
                  </select>
                )}
                {params.kpDashaMd && params.kpDashaAd && params.kpDashaPd && (
                  <select className={inp} value={params.kpDashaSd ?? ""} onChange={(e) => set("kpDashaSd", e.target.value)} aria-label={ts("kp.sdAria")}>
                    <option value="">{ts("dasha.sdList")}</option>
                    {DASHA_LORD_OPTIONS.map(([v]) => (
                      <option key={v} value={v}>
                        {ts("dasha.kpTo.pr", { lord: tq(`dashaLord.${v}`) })}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {id === "kp.dasha" && <DashaChainControls params={params} onParams={onParams} />}
            {id === "kp.horary" && (
              <label className="flex min-w-0 flex-wrap items-center gap-2">
                {ts("kp.horaryNumber")}
                <input
                  type="number"
                  min={1}
                  max={249}
                  className={`${inp} w-24`}
                  value={params.horaryNumber}
                  onChange={(e) => set("horaryNumber", Math.max(1, Math.min(249, Math.trunc(Number(e.target.value) || 1))))}
                  aria-label={ts("kp.horaryAria")}
                />
              </label>
            )}
            {id === "kp.transit" && (
              <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label={ts("kp.transitModeAria")} data-testid="astro-kp-transit-mode">
                <label className="flex items-center gap-1">
                  <input type="radio" checked={params.kpTransitMode !== "range"} onChange={() => set("kpTransitMode", "moment")} data-kp-mode="moment" /> {ts("kp.moment")}
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={params.kpTransitMode === "range"} onChange={() => set("kpTransitMode", "range")} data-kp-mode="range" /> {ts("kp.range")}
                </label>
              </div>
            )}
            {id === "kp.transit" && params.kpTransitMode === "range" && <KpRangeFields params={params} onParams={onParams} />}
            {(id === "kp.ruling" || id === "kp.horary" || id === "kp.ruling_interval" || (id === "kp.transit" && params.kpTransitMode !== "range")) && moment}
            {(id === "kp.ruling" || id === "kp.horary" || id === "kp.ruling_interval") && place}
            {id === "kp.ruling_interval" && <KpRulingIntervalFields params={params} onParams={onParams} />}
            {kpCommon}
            {id === "kp.ruling" && <p className="text-slate-500">{ts("kp.rulingNote")}</p>}
            {id === "kp.transit" && params.kpTransitMode !== "range" && <p className="text-amber-800">{ts("kp.momentNote")}</p>}
          </div>
        );
      }
      case "vedic.transit":
        return (
          <div className="flex flex-col gap-1.5 text-xs" data-testid="astro-vedic-transit-params">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1">
                <input type="radio" checked={params.vedicTransitMode === "now"} onChange={() => set("vedicTransitMode", "now")} /> {ts("nowHour")}
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={params.vedicTransitMode === "custom"} onChange={() => set("vedicTransitMode", "custom")} /> {ts("dateTime")}
              </label>
              {params.vedicTransitMode === "custom" && (
                <>
                  <input type="date" className={inp} value={params.vedicTransitDate} onChange={(e) => set("vedicTransitDate", e.target.value)} aria-label={ts("gochara.dateAria")} />
                  <input type="time" className={inp} value={params.vedicTransitTime} onChange={(e) => set("vedicTransitTime", e.target.value)} aria-label={ts("gochara.timeAria")} />
                  <FieldIssue text={dateInputIssue(params.vedicTransitDate) ?? timeInputIssue(params.vedicTransitTime)} testId="astro-gochara-date-issue" />
                  <select className={inp} value={params.vedicTransitTz} onChange={(e) => set("vedicTransitTz", e.target.value)} aria-label={ts("gochara.tzAria")}>
                    {TZ_OPTIONS.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            {params.vedicAyanamsa === "lahiri" ? (
              <p className="text-slate-500">{ts("gochara.lahiri")}</p>
            ) : (
              <p className="text-amber-800">{ts("gochara.notLahiri")}</p>
            )}
          </div>
        );
      case "vedic.chara_karaka":
        return (
          <div className="flex flex-wrap items-center gap-3 text-xs" data-testid="astro-chara-karaka-params">
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("chara.scheme")}
              <select className={inp} value={params.charaKarakaScheme ?? "eight"} onChange={(e) => set("charaKarakaScheme", e.target.value === "seven" ? "seven" : "eight")} aria-label={ts("chara.schemeAria")} data-chara-scheme="select">
                <option value="eight">{ts("chara.eight")}</option>
                <option value="seven">{ts("chara.seven")}</option>
              </select>
            </label>
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("vedicAyanamsa")}
              <select className={inp} value={params.vedicAyanamsa} onChange={(e) => set("vedicAyanamsa", e.target.value)} aria-label={ts("chara.ayAria")}>
                {VEDIC_AYANAMSA_OPTIONS.map(([v]) => (
                  <option key={v} value={v}>
                    {tq(`vedicAyanamsaOption.${v}`)}
                  </option>
                ))}
              </select>
            </label>
            <p className="w-full text-slate-500">{ts("chara.note")}</p>
          </div>
        );
      // 22.10.2026 Vedik noktalar: Upagraha yalnız ayanamsa (Vedik ortak).
      case "vedic.upagraha":
      case "vedic.bhav_chalit":
      case "vedic.arudha":
      case "vedic.bhava_bala":
      case "vedic.ashtakavarga":
      case "vedic.shadbala":
        return (
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            {ts("vedicAyanamsa")}
            <select className={inp} value={params.vedicAyanamsa} onChange={(e) => set("vedicAyanamsa", e.target.value)} aria-label={ts("vedicAyAria", { tech: techniqueLabel(id, L) })}>
              {VEDIC_AYANAMSA_OPTIONS.map(([v]) => (
                <option key={v} value={v}>
                  {tq(`vedicAyanamsaOption.${v}`)}
                </option>
              ))}
            </select>
          </label>
        );
      case "vedic.dasha":
        return (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("dasha.level")}
              <select className={inp} value={params.dashaMd} onChange={(e) => onParams({ ...params, dashaMd: e.target.value, dashaAd: "", dashaPd: "", dashaSd: "" })} aria-label={ts("dasha.mdAria")}>
                <option value="">{ts("dasha.mdList120")}</option>
                {DASHA_LORD_OPTIONS.map(([v]) => (
                  <option key={v} value={v}>
                    {ts("dasha.vTo.ad", { lord: tq(`dashaLord.${v}`) })}
                  </option>
                ))}
              </select>
            </label>
            {params.dashaMd && (
              <label className="flex min-w-0 flex-wrap items-center gap-2">
                <select className={inp} value={params.dashaAd} onChange={(e) => onParams({ ...params, dashaAd: e.target.value, dashaPd: "", dashaSd: "" })} aria-label={ts("dasha.adAria")}>
                  <option value="">{ts("dasha.adList")}</option>
                  {DASHA_LORD_OPTIONS.map(([v]) => (
                    <option key={v} value={v}>
                      {ts("dasha.vTo.pd", { lord: tq(`dashaLord.${v}`) })}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {params.dashaMd && params.dashaAd && (
              <label className="flex min-w-0 flex-wrap items-center gap-2">
                <select className={inp} value={params.dashaPd ?? ""} onChange={(e) => onParams({ ...params, dashaPd: e.target.value, dashaSd: "" })} aria-label={ts("dasha.pdAria")}>
                  <option value="">{ts("dasha.pdList")}</option>
                  {DASHA_LORD_OPTIONS.map(([v]) => (
                    <option key={v} value={v}>
                      {ts("dasha.vTo.sd", { lord: tq(`dashaLord.${v}`) })}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {params.dashaMd && params.dashaAd && params.dashaPd && (
              <label className="flex min-w-0 flex-wrap items-center gap-2">
                <select className={inp} value={params.dashaSd ?? ""} onChange={(e) => set("dashaSd", e.target.value)} aria-label={ts("dasha.sdAria")}>
                  <option value="">{ts("dasha.sdList")}</option>
                  {DASHA_LORD_OPTIONS.map(([v]) => (
                    <option key={v} value={v}>
                      {ts("dasha.vTo.pr", { lord: tq(`dashaLord.${v}`) })}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <DashaChainControls params={params} onParams={onParams} />
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("vedicAyanamsa")}
              <select className={inp} value={params.vedicAyanamsa} onChange={(e) => set("vedicAyanamsa", e.target.value)} aria-label={ts("dasha.ayAria")}>
                {VEDIC_AYANAMSA_OPTIONS.map(([v]) => (
                  <option key={v} value={v}>
                    {tq(`vedicAyanamsaOption.${v}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        );
      case "vedic.varga":
        return (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("varga.division")}
              <select className={inp} value={params.vargaDivision} onChange={(e) => set("vargaDivision", Number(e.target.value))} aria-label={ts("varga.aria")}>
                {VEDIC_VARGA_OPTIONS.map(([v]) => (
                  <option key={v} value={v}>
                    {tq(`varga.${v}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("vedicAyanamsa")}
              <select className={inp} value={params.vedicAyanamsa} onChange={(e) => set("vedicAyanamsa", e.target.value)} aria-label={ts("varga.ayAria")}>
                {VEDIC_AYANAMSA_OPTIONS.map(([v]) => (
                  <option key={v} value={v}>
                    {tq(`vedicAyanamsaOption.${v}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        );
      case "vedic.d1":
        return (
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            {ts("vedicAyanamsa")}
            <select className={inp} value={params.vedicAyanamsa} onChange={(e) => set("vedicAyanamsa", e.target.value)} aria-label={ts("d1.ayAria")}>
              {VEDIC_AYANAMSA_OPTIONS.map(([v]) => (
                <option key={v} value={v}>
                  {tq(`vedicAyanamsaOption.${v}`)}
                </option>
              ))}
            </select>
          </label>
        );
      case "western.relocation":
        return (
          <div className="flex flex-col gap-1 text-xs" data-testid="astro-relocation-target">
            <span>{ts("relocation")}</span>
            <LocationPicker value={params.relocationTarget} onChange={(v) => set("relocationTarget", v)} />
          </div>
        );
      case "western.local_space":
        return (
          <div className="flex flex-col gap-1 text-xs" data-testid="astro-local-space-ref">
            <label className="flex items-center gap-1">
              <input type="radio" checked={params.localSpaceReference === null} onChange={() => set("localSpaceReference", null)} /> {ts("ls.birth")}
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={params.localSpaceReference !== null} onChange={() => undefined} disabled={params.localSpaceReference === null} /> {ts("ls.other")}
            </label>
            <LocationPicker value={params.localSpaceReference} onChange={(v) => set("localSpaceReference", v)} />
          </div>
        );
      case "western.profections": {
        const fmt = (iso: string) => iso.split("-").reverse().join(sep);
        const sel = params.profectionAge;
        const range = birthDate && sel !== null ? profectionYearRange(birthDate, sel) : null;
        const maxAge = Math.min(PROFECTION_AGE_MAX, Math.max(12, (profectionNow ?? 0) + 12));
        return (
          <div className="flex min-w-0 flex-col gap-1.5 text-xs" data-testid="astro-profections-params">
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("prof.year")}
              {birthDate ? (
                <select
                  className={inp}
                  value={sel === null ? "" : String(sel)}
                  onChange={(e) => set("profectionAge", e.target.value === "" ? null : Number(e.target.value))}
                  aria-label={ts("prof.year")}
                  data-testid="astro-profection-age"
                >
                  {sel === null && <option value="">{ts("prof.pick")}</option>}
                  {Array.from({ length: Math.max(maxAge, sel ?? 0) + 1 }, (_, a) => a).map((a) => {
                    const r = profectionYearRange(birthDate, a);
                    return (
                      <option key={a} value={String(a)}>
                        {ts("prof.age", { n: a })}{r ? ` · ${fmt(r.start)} – ${fmt(r.end)}` : ""}
                        {a === profectionNow ? ts("prof.thisYear") : ""}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input
                  type="number"
                  className={`${inp} w-24`}
                  min={0}
                  max={PROFECTION_AGE_MAX}
                  value={sel ?? ""}
                  onChange={(e) => set("profectionAge", e.target.value === "" ? null : Number(e.target.value))}
                  aria-label={ts("prof.ageAria")}
                  data-testid="astro-profection-age"
                />
              )}
            </label>
            {range && (
              <span className="text-slate-600" data-testid="astro-profection-range">
                {ts("prof.range", { n: sel ?? 0, start: fmt(range.start), end: fmt(range.end) })}
              </span>
            )}
            <span className="text-slate-500">{ts("prof.wholeSign")}</span>
            {birthDate && isLeapDayBirth(birthDate) && (
              <span className="text-slate-500" data-testid="astro-profection-leapday">
                {ts("prof.leap")}
              </span>
            )}
          </div>
        );
      }
      case "western.extra_points": {
        // 2026-10-22: her bölüm ayrı sağlayıcı isteğidir; yalnız işaretlenenler hesaplanır (önbellekte varsa istek yok).
        const sel = params.extraSections ?? [...EXTRA_SECTIONS];
        return (
          <div className="flex min-w-0 flex-col gap-1.5 text-xs" data-testid="astro-extra-points-params">
            <span className="text-slate-600">{ts("extra.sections")}</span>
            {EXTRA_SECTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sel.includes(s)}
                  onChange={(e) => set("extraSections", EXTRA_SECTIONS.filter((x) => (x === s ? e.target.checked : sel.includes(x))))}
                  data-extra-section={s}
                />{" "}
                {ts(`extra.label.${s}`)}
              </label>
            ))}
            <span className="text-slate-500">{ts("extra.note")}</span>
          </div>
        );
      }
      case "western.planetary_return": {
        // 2026-10-22 — Gezegen dönüşü: gezegen + hedef tarih → sunucu planı o tarihe en yakın dönüş KÜMESİNİN kavuşumlarını listeler;
        // retro döngüsünde 2–3 kavuşum olur ve uzman hangisinin hesaplanacağını seçer (otomatik seçim yok; her kavuşum 1 istek).
        const crossing = params.planetaryReturnCrossing ?? 1;
        const date = params.planetaryReturnDate ?? params.targetDate;
        const list = planetaryReturns;
        return (
          <div className="flex min-w-0 flex-col gap-1.5 text-xs" data-testid="astro-planetary-return-params">
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("pr.planet")}
              <select
                className={inp}
                value={params.planetaryReturnPlanet ?? "saturn"}
                onChange={(e) => onParams({ ...params, planetaryReturnPlanet: e.target.value as PlanetaryReturnPlanet, planetaryReturnCrossing: 1 })}
                aria-label={ts("pr.planetAria")}
                data-testid="astro-pr-planet"
              >
                {PLANETARY_RETURN_PLANETS.map((pl) => (
                  <option key={pl} value={pl}>
                    {tp(`title.${pl}`)} ({tp(`interval.${pl}`)})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("pr.target")}
              <input
                type="date"
                className={inp}
                value={date}
                onChange={(e) => onParams({ ...params, planetaryReturnDate: e.target.value, planetaryReturnCrossing: 1 })}
                aria-invalid={dateInputIssue(date) ? true : undefined}
                aria-label={ts("pr.targetAria")}
                data-testid="astro-pr-date"
              />
              <FieldIssue text={dateInputIssue(date)} testId="astro-pr-date-issue" />
            </label>
            <span className="text-slate-500">{ts("pr.note")}</span>
            {/* 2026-10-22: önceki / sonraki dönüş kısayolu — yalnız hedef tarihi komşu kümenin ilk kavuşum gününe taşır; o kümenin tüm
                kavuşumları yine listelenir (retro kavuşumu atlanmaz). Ücretli istek yalnız onaylı hesaplamada yapılır. */}
            <div className="flex flex-wrap items-center gap-2" data-testid="astro-pr-nav">
              {(["previous", "next"] as const).map((k) => {
                const d = planetaryReturnNeighbors?.[k] ?? null;
                return (
                  <button
                    key={k}
                    type="button"
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!d}
                    onClick={() => d && onParams({ ...params, planetaryReturnDate: d, planetaryReturnCrossing: 1 })}
                    title={d ? ts("pr.navTitle", { d }) : ts("pr.navNone")}
                    data-testid={`astro-pr-${k}`}
                  >
                    {k === "previous" ? ts("pr.prev") : ts("pr.next")}
                    {d ? ` (${d.slice(0, 4)})` : ""}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label={ts("pr.crossingAria")} data-testid="astro-pr-crossings">
              {([1, 2, 3] as const).map((n) => {
                const r = list?.find((x) => x.crossing === n) ?? null;
                if (list && !r) return null;
                return (
                  <label key={n} className="flex items-center gap-1">
                    <input type="radio" checked={crossing === n} onChange={() => set("planetaryReturnCrossing", n)} data-pr-crossing={n} />
                    {ts("pr.crossing", { n })}{r ? ` — ~${fmtUtcMinute(r.approxUtc, L)} · ${tp(`motion.${r.motion}`)}` : ""}
                  </label>
                );
              })}
            </div>
            {list && list.length > 1 && (
              <span className="text-sky-800" data-testid="astro-pr-loop-note">
                {ts("pr.loop", { n: list.length })}
              </span>
            )}
            {list && list.length === 0 && <span className="text-amber-800">{ts("pr.none")}</span>}
            {returnLocationChooser("planetaryReturnLocation", ts("pr.name"))}
          </div>
        );
      }
      case "western.transit_scan":
        return <TransitScanFields params={params} onParams={onParams} tzSelect={<TzSelect value={params.scanTz ?? "Europe/Istanbul"} onChange={(v) => set("scanTz", v)} label={ts("displayTz")} />} />;
      case "western.classical_dignities":
        return <ClassicalDignitiesFields params={params} onParams={onParams} natalHouseSystem={natalHouseSystem} />;
      case "western.declination_parallels":
        return <DeclinationParallelsFields params={params} onParams={onParams} tzSelect={<TzSelect value={params.declinationTz ?? "Europe/Istanbul"} onChange={(v) => set("declinationTz", v)} label={ts("displayTz")} />} />;
      case "western.fixed_stars":
        return (
          <div className="flex flex-col gap-1.5 text-xs" data-testid="astro-fixed-stars-params">
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("fs.orb")}
              <select className={inp} value={String(params.fixedStarsOrb)} onChange={(e) => set("fixedStarsOrb", Number(e.target.value))} aria-label={ts("fs.orbAria")}>
                {FIXED_STAR_ORB_OPTIONS.map((o) => (
                  <option key={o} value={String(o)}>
                    {o.toLocaleString(locale === "en" ? "en-GB" : "tr-TR")}°{o === FIXED_STAR_ORB_DEFAULT ? ts("defaultSuffix") : ""}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-slate-500">{ts("fs.note")}</span>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={params.fixedStarsCatalog} onChange={(e) => set("fixedStarsCatalog", e.target.checked)} /> {ts("fs.catalog")}
            </label>
          </div>
        );
      // 22.10.2026 Vedik noktalar: Graha Asta / Udaya — değerlendirme günü + gözlem yeri (doğum anı kullanılmaz; ayanamsa yok).
      case "vedic.heliacal":
        return (
          <div className="flex min-w-0 flex-col gap-1.5 text-xs" data-testid="astro-heliacal-params">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <label className="flex min-w-0 flex-wrap items-center gap-2">
                {ts("hel.day")}
                <input type="date" className={inp} value={params.heliacalDate ?? ""} onChange={(e) => set("heliacalDate", e.target.value)} aria-label={ts("hel.dayAria")} />
              </label>
              <span className="text-slate-500">{ts("emptyBirthday")}</span>
              <FieldIssue text={params.heliacalDate ? dateInputIssue(params.heliacalDate) : null} testId="astro-heliacal-date-issue" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span>{ts("hel.place")} {params.heliacalPlace ? params.heliacalPlace.label : `${ts("birthPlace")}${birthPlaceLabel ? ` (${birthPlaceLabel})` : ""}`}</span>
              <LocationPicker value={params.heliacalPlace ?? null} onChange={(v) => set("heliacalPlace", v)} />
            </div>
            <span className="text-slate-500">
              {ts("hel.note")}
            </span>
          </div>
        );
      // 2026-10-22 (yalnız ek): Vedik eşleştirme + Sade Sati — ayanamsa (Vedik ortak) + açıklama.
      case "vedic.gun_milan":
      case "vedic.sade_sati":
        return (
          <div className="flex min-w-0 flex-col gap-1.5 text-xs" data-testid={id === "vedic.gun_milan" ? "astro-gun-milan-params" : "astro-sade-sati-params"}>
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("vedicAyanamsa")}
              <select className={inp} value={params.vedicAyanamsa} onChange={(e) => set("vedicAyanamsa", e.target.value)} aria-label={ts("vedicAyAria", { tech: techniqueLabel(id, L) })}>
                {VEDIC_AYANAMSA_OPTIONS.map(([v]) => (
                  <option key={v} value={v}>
                    {tq(`vedicAyanamsaOption.${v}`)}
                  </option>
                ))}
              </select>
            </label>
            {id === "vedic.gun_milan" ? (
              <>
                {/* 22.10: hesaplama rolü uzmanın seçimi (sistem cinsiyet tahmin etmez); seçim sağlayıcı gövdesindeki sırayı GERÇEKTEN değiştirir. */}
                <div className="flex min-w-0 flex-col gap-1" role="radiogroup" aria-label={ts("gm.rolesAria")} data-testid="astro-gun-milan-order">
                  <span className="text-slate-700">{ts("gm.roles")}</span>
                  {(
                    [
                      ["client_first", ts("role.clientFirst")],
                      ["partner_first", ts("role.partnerFirst")],
                    ] as const
                  ).map(([v, l]) => (
                    <label key={v} className="flex min-w-0 items-center gap-1.5">
                      <input type="radio" checked={(params.gunMilanOrder ?? "client_first") === v} onChange={() => set("gunMilanOrder", v)} data-gun-milan-order={v} />
                      {l}
                    </label>
                  ))}
                </div>
                <span className="text-slate-500">
                  {ts("gm.note")}
                </span>
              </>
            ) : (
              <span className="text-slate-500">{ts("sadeSati.note")}</span>
            )}
          </div>
        );
      // 2026-10-22 gece (yalnız ek): On Porutham + Papasamyam — ayanamsa (Vedik ortak) + uzmanın seçtiği hesaplama rolleri.
      case "vedic.dashakoot":
      case "vedic.papasamyam": {
        const key = id === "vedic.dashakoot" ? "dashakootOrder" : "papasamyamOrder";
        const tid = id === "vedic.dashakoot" ? "dashakoot" : "papasamyam";
        return (
          <div className="flex min-w-0 flex-col gap-1.5 text-xs" data-testid={`astro-${tid}-params`}>
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              {ts("vedicAyanamsa")}
              <select className={inp} value={params.vedicAyanamsa} onChange={(e) => set("vedicAyanamsa", e.target.value)} aria-label={ts("vedicAyAria", { tech: techniqueLabel(id, L) })}>
                {VEDIC_AYANAMSA_OPTIONS.map(([v]) => (
                  <option key={v} value={v}>
                    {tq(`vedicAyanamsaOption.${v}`)}
                  </option>
                ))}
              </select>
            </label>
            {/* Rol uzmanın seçimidir (sistem cinsiyet tahmin etmez); seçim sağlayıcı gövdesindeki sırayı GERÇEKTEN değiştirir. */}
            <div className="flex min-w-0 flex-col gap-1" role="radiogroup" aria-label={ts("rolesAria", { tech: techniqueLabel(id, L) })} data-testid={`astro-${tid}-order`}>
              <span className="text-slate-700">{ts("dk.roles")}</span>
              {(
                [
                  ["client_first", ts("role.clientFirst")],
                  ["partner_first", ts("role.partnerFirst")],
                ] as const
              ).map(([v, l]) => (
                <label key={v} className="flex min-w-0 items-center gap-1.5">
                  <input type="radio" checked={(params[key] ?? "client_first") === v} onChange={() => set(key, v)} data-porutham-order={v} />
                  {l}
                </label>
              ))}
            </div>
            <span className="text-slate-500">
              {id === "vedic.dashakoot"
                ? ts("dk.noteDashakoot")
                : ts("dk.notePapasamyam")}{" "}
              {ts("dk.note")}
            </span>
          </div>
        );
      }
      // 2026-10-22 (yalnız ek): Vedik aylık zamanlama — ay, bölümler, gösterim saat dilimi (ayanamsa sabit Lahiri).
      case "vedic.monthly":
        return <VedicMonthlyFields params={params} onParams={onParams} />;
      default:
        return null;
    }
  };

  return params_(id);
}

/** Karşı taraf seçimi (sinastri / composite ortak). Liste sunucu aramasıyla gelir (Aşama 7B). */
export function PartnerField({
  params,
  onParams,
  partners,
  partnerQuery,
  onPartnerQuery,
}: {
  params: TechniqueParams;
  onParams: (next: TechniqueParams) => void;
  partners: PartnerOption[];
  partnerQuery?: string;
  onPartnerQuery?: (q: string) => void;
}) {
  const { ts } = useSel();
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="text-slate-600">{ts("partner.label")}</span>
      {onPartnerQuery && (
        <input type="search" className={inp} value={partnerQuery ?? ""} onChange={(e) => onPartnerQuery(e.target.value)} maxLength={100} placeholder={ts("partner.search")} aria-label={ts("partner.searchAria")} />
      )}
      <select className={inp} value={params.partnerProfileId} onChange={(e) => onParams({ ...params, partnerProfileId: e.target.value })} aria-label={ts("partner.aria")}>
        <option value="">{ts("partner.pick")}</option>
        {partners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Natal yöntem bağlamı (Aşama 3, #643): bildirimler ve ortak seçim satırı için. Verilmezse yalnız seçiciler gösterilir. */
export type NatalMethodContext = {
  /** Doğum yeri enlemi (kutup engeli / yüksek enlem uyarısı). */
  latitude?: number | null;
  timeKnown?: boolean;
  /** Natal ile birlikte seçili, ORTAK ev sistemini kullanan Batı teknikleri. */
  sharedTechniques?: { id: UiTechniqueId; label: string }[];
  onFocusTechnique?: (id: UiTechniqueId) => void;
};


/** Natal'ın 8 sistemli ev seçicisi + bildirimleri (onaylı prototip: gokyuzu-atlasi-natal-ev-sistemleri). YALNIZ Natal'a uygulanır. */
function NatalHouseFields({ method, onMethod, ctx }: { method: WesternMethod; onMethod: (next: WesternMethod) => void; ctx?: NatalMethodContext }) {
  const { ts, tt, locale } = useSel();
  const hs = method.natalHouseSystem;
  const lat = typeof ctx?.latitude === "number" && Number.isFinite(ctx.latitude) ? ctx.latitude : null;
  const timeUnknown = ctx?.timeKnown === false;
  const polar = lat !== null && natalHouseSystemUndefinedAtLatitude(hs, lat);
  const high = !polar && !timeUnknown && lat !== null && Math.abs(lat) > NATAL_HIGH_LATITUDE;
  const latTxt = lat === null ? "" : `${locale === "en" ? Math.abs(lat).toFixed(1) : Math.abs(lat).toFixed(1).replace(".", ",")}°${lat >= 0 ? ts("natal.north") : ts("natal.south")}`;
  const shared = ctx?.sharedTechniques ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-2.5" data-testid="atlas-natal-house-fields">
      {polar && (
        <p className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[12.5px] leading-snug text-rose-900" role="alert" data-testid="atlas-natal-polar">
          <span>
            <b className="font-semibold">{ts("natal.polarLead")}</b> {ts("natal.polar", { hs: tt(`houseSystem.${hs}`), lat: latTxt })}
          </span>
        </p>
      )}
      {high && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900" data-testid="atlas-natal-high-lat">
          <b className="font-semibold">{ts("natal.highLead", { lat: latTxt })}</b> {ts("natal.high")}
        </p>
      )}
      {timeUnknown && (
        <p className="rounded-lg border border-[#6f55c9]/25 bg-[#f7f3ff] px-3 py-2 text-[12.5px] leading-snug text-[#5a42b0]" data-testid="atlas-natal-time-unknown">
          <b className="font-semibold">{ts("natal.tuLead")}</b> {ts("natal.tu")}
        </p>
      )}
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="flex flex-wrap items-center gap-2 text-slate-600">
          {ts("natal.hs")}
          <span className="rounded-md border border-[#6f55c9]/30 bg-[#efeafd] px-1.5 py-px text-[10.5px] font-bold tracking-wide text-[#5a42b0]">{ts("natal.only")}</span>
        </span>
        <select
          className={`${inp} min-h-[40px]`}
          value={hs}
          onChange={(e) => onMethod({ ...method, natalHouseSystem: e.target.value as NatalHouseSystemOption })}
          aria-label={ts("natal.hsAria")}
          data-testid="atlas-natal-house-system"
        >
          <optgroup label={ts("natal.basic")}>
            {HOUSE_SYSTEMS.map((h) => (
              <option key={h} value={h}>
                {tt(`houseSystem.${h}`)}
                {h === "placidus" ? ts("defaultSuffix") : ""}
              </option>
            ))}
          </optgroup>
          <optgroup label={ts("natal.classic")}>
            {CLASSIC_NATAL_HOUSE_SYSTEMS.map((h) => (
              <option key={h} value={h}>
                {tt(`houseSystem.${h}`)}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {isClassicNatalHouseSystem(hs) && (
        <p className="rounded-lg border border-[#6f55c9]/20 bg-[#f7f3ff] px-3 py-2 text-[12px] leading-snug text-[#5a42b0]" data-testid="atlas-natal-classic-note">
          {ts("natal.note")}
        </p>
      )}
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-slate-600">{ts("method.node")}</span>
        <select className={inp} value={method.nodeType} onChange={(e) => onMethod({ ...method, nodeType: e.target.value as NodeType })} aria-label={ts("method.nodeAria")}>
          {NODE_TYPES.map((n) => (
            <option key={n} value={n}>
              {tt(`nodeType.${n}`)}
            </option>
          ))}
        </select>
      </label>
      {shared.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] leading-snug text-slate-700" data-testid="atlas-natal-shared-line">
          <span>{ts("natal.shared", { list: shared.map((s) => s.label).join(", ") })}</span>
          <b className="font-semibold">{tt(`houseSystem.${method.houseSystem}`)}</b>
          {ctx?.onFocusTechnique && (
            <button type="button" className="font-semibold text-[#5a42b0] underline underline-offset-2" onClick={() => ctx.onFocusTechnique!(shared[0].id)}>
              {ts("natal.change")}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Batı yöntem alanları (ev sistemi / ay düğümü) — yalnız ilgili teknik için gösterilir. Natal: 8 sistemli AYRI seçici
 * (NatalHouseFields). Diğer Batı teknikleri: 4 sistemli ORTAK seçici (aynen). Ay düğümü tüm Batı tekniklerinde ortak.
 */
export function MethodFields({
  id,
  method,
  onMethod,
  natalContext,
}: {
  id: UiTechniqueId;
  method: WesternMethod;
  onMethod: (next: WesternMethod) => void;
  natalContext?: NatalMethodContext;
}) {
  const { ts, tt } = useSel();
  const house = USES_HOUSE_SYSTEM.includes(id);
  const node = USES_NODE_TYPE.includes(id);
  if (!house && !node) return null;
  if (id === "western.natal") return <NatalHouseFields method={method} onMethod={onMethod} ctx={natalContext} />;
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-3">
      {house && (
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-slate-600">{ts("method.hs")}</span>
          <select className={inp} value={method.houseSystem} onChange={(e) => onMethod({ ...method, houseSystem: e.target.value as HouseSystem })} aria-label={ts("method.hsAria")}>
            {HOUSE_SYSTEMS.map((h) => (
              <option key={h} value={h}>
                {tt(`houseSystem.${h}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      {node && (
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-slate-600">{ts("method.node")}</span>
          <select className={inp} value={method.nodeType} onChange={(e) => onMethod({ ...method, nodeType: e.target.value as NodeType })} aria-label={ts("method.nodeAria")}>
            {NODE_TYPES.map((n) => (
              <option key={n} value={n}>
                {tt(`nodeType.${n}`)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
