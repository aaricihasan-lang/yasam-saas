"use client";

/**
 * Teknik parametre alanları (Aşama D3: Göksel Analiz Hazırlık Merkezi'nin ayar paneli kullanır).
 * Bu bileşenler istek SAYISI hesaplamaz (tahmin yok); gerçek X/Y/Z sunucu planlayıcısından gelir (sayfa gösterir).
 * Alan adları, aria etiketleri ve parametre → seçim dönüşümü (buildSelections) önceki teknik listesiyle AYNIDIR;
 * D3 yalnız yerleşimi değiştirir. Ortak parametreler (Vedik ayanamsa, KP an/yer, ev sistemi, ay düğümü) tek
 * durumdadır → bir teknikte değiştirmek aynı ortak alanı kullanan tüm teknikleri etkiler (etiketlerde belirtilir).
 */

import { HOUSE_SYSTEMS, NODE_TYPES, type HouseSystem, type NodeType } from "@/lib/astrology/model/western";
import LocationPicker from "./LocationPicker";
import { FIXED_STAR_ORB_DEFAULT, FIXED_STAR_ORB_OPTIONS } from "@/lib/astrology/model/westernFixedStars";
import { HOUSE_SYSTEM_LABELS, NODE_TYPE_LABELS } from "@/lib/astrology/labels/tr";
import { KP_POSITIONS_INTERVALS, KP_POSITIONS_MAX_DAYS, KP_TIMING_MAX_DAYS, kpRangeRequestCount, FORECAST_MAX_DAYS, DASHA_LORD_OPTIONS, KP_AYANAMSA_OPTIONS, VEDIC_AYANAMSA_OPTIONS, VEDIC_VARGA_OPTIONS, fmtUtcMinute, forecastPartCount, type LunarReturnInfo, type TechniqueParams, type UiTechniqueId } from "../_lib/techniques";

// max-w-full: uzun seçenek metni (ör. "Lahiri (Chitrapaksha) — varsayılan") 390 px'te kartı taşırmasın.
const inp = "max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm";
const TZ_OPTIONS = ["Europe/Istanbul", "UTC", "Europe/London", "Europe/Berlin", "America/New_York", "Asia/Dubai"];

export type PartnerOption = { id: string; label: string };

/** Ev sistemi kullanan Batı teknikleri (ortak seçim). */
export const USES_HOUSE_SYSTEM: readonly UiTechniqueId[] = ["western.natal", "western.solar_return", "western.lunar_return", "western.relocation", "western.synastry", "western.composite"];
/** Ay düğümü türü kullanan Batı teknikleri (ortak seçim). */
export const USES_NODE_TYPE: readonly UiTechniqueId[] = ["western.natal", "western.transit", "western.progression", "western.solar_arc", "western.synastry", "western.composite"];

const KP_PLANET_OPTIONS: [string, string][] = [
  ["sun", "Güneş"],
  ["moon", "Ay"],
  ["mars", "Mars"],
  ["mercury", "Merkür"],
  ["jupiter", "Jüpiter"],
  ["venus", "Venüs"],
  ["saturn", "Satürn"],
];
const KP_KIND_OPTIONS: [string, string][] = [
  ["sublord", "Sub-Lord değişimleri"],
  ["rasi", "Rasi (burç) geçişleri"],
  ["positions", "KP konum tablosu (≤ 7 gün)"],
];
/** TRANSİT-03: KP Transit zaman aralığı ayarları + istek sayısı ön izlemesi (kesin sayı sunucu planında). */
function KpRangeFields({ params, onParams }: { params: TechniqueParams; onParams: (next: TechniqueParams) => void }) {
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
      <legend className="px-1 text-[11px] font-semibold text-slate-700">KP zaman aralığı</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          Başlangıç (UTC günü)
          <input type="date" className={inp} min="1600-01-01" max="2600-12-31" value={params.kpRangeStart} onChange={(e) => set("kpRangeStart", e.target.value)} aria-label="KP aralık başlangıcı" />
        </label>
        <label className="flex items-center gap-1">
          Süre
          <select className={inp} value={params.kpRangeDays} onChange={(e) => set("kpRangeDays", Number(e.target.value))} aria-label="KP aralık süresi">
            {[1, 3, 7, 14, 30, 60, KP_TIMING_MAX_DAYS].map((d) => (
              <option key={d} value={d}>
                {d} gün
              </option>
            ))}
          </select>
        </label>
        <select className={inp} value={params.kpRangeTz ?? "Europe/Istanbul"} onChange={(e) => set("kpRangeTz", e.target.value)} aria-label="KP aralık gösterim saat dilimi">
          {[...new Set([params.kpRangeTz ?? "Europe/Istanbul", ...TZ_OPTIONS])].map((z) => (
            <option key={z} value={z}>
              {z} (gösterim)
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="KP aralık türleri">
        {KP_KIND_OPTIONS.map(([v, l]) => (
          <label key={v} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${kinds.includes(v) ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-slate-200 text-slate-600"}`}>
            <input type="checkbox" checked={kinds.includes(v)} onChange={() => toggle("kpRangeKinds", v)} data-kp-kind={v} /> {l}
          </label>
        ))}
      </div>
      {(kinds.includes("sublord") || kinds.includes("rasi")) && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="KP aralık gezegenleri">
          {KP_PLANET_OPTIONS.map(([v, l]) => (
            <label key={v} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${planets.includes(v) ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-slate-200 text-slate-600"}`}>
              <input type="checkbox" checked={planets.includes(v)} onChange={() => toggle("kpRangePlanets", v)} data-kp-planet={v} /> {l}
            </label>
          ))}
          <span className="self-center text-[11px] text-slate-500">Rahu/Ketu bu uçlarda yok.</span>
        </div>
      )}
      {kinds.includes("positions") && (
        <label className="flex items-center gap-1">
          Konum aralığı
          <select className={inp} value={params.kpRangeInterval} onChange={(e) => set("kpRangeInterval", Number(e.target.value))} aria-label="KP konum aralığı">
            {KP_POSITIONS_INTERVALS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} dk` : m === 1440 ? "günlük" : `${m / 60} saat`}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className={`text-[11px] leading-snug ${posTooLong ? "text-rose-700" : "text-slate-600"}`} data-testid="astro-kp-range-note">
        {posTooLong
          ? `Konum tablosu en çok ${KP_POSITIONS_MAX_DAYS} gün olabilir; süreyi kısaltın veya konum tablosunu kaldırın.`
          : `Tahmini ${n} sağlayıcı isteği (gezegen × tür başına 1; konum tablosu 1). Kayıtlı parçalar yeniden istenmez; kesin sayı plan önizlemesindedir. En çok ${KP_TIMING_MAX_DAYS} gün; Ay günde ~9 Sub-Lord değiştirir.`}
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
}: {
  id: UiTechniqueId;
  params: TechniqueParams;
  onParams: (next: TechniqueParams) => void;
  /** FINAL: danışanın kayıtlı doğum yeri (gözlem yeri seçiminde ÖNERİ olarak gösterilir; otomatik seçilmez). */
  birthPlaceLabel?: string | null;
  /** Sunucu planının bildirdiği, seçilen aydaki lunar return'ler (henüz plan yoksa null). */
  lunarReturns?: LunarReturnInfo[] | null;
}) {
  const set = <K extends keyof TechniqueParams>(k: K, v: TechniqueParams[K]) => onParams({ ...params, [k]: v });

  // Aşama 4.1 — dönüş konumu: doğum yeri (varsayılan) veya sistemdeki konum listesinden başka bir yer.
  // Doğum anı/dönüş anı DEĞİŞMEZ; yalnız dönüş haritasının ASC/MC/evleri seçilen yere göre hesaplanır.
  const returnLocationChooser = (key: "solarReturnLocation" | "lunarReturnLocation", label: string) => {
    const v = params[key];
    return (
      <div className="flex flex-col gap-1 text-xs" data-testid={`astro-${key}`}>
        <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label={`${label} konumu`}>
          <label className="flex items-center gap-1">
            <input type="radio" checked={v === null} onChange={() => set(key, null)} data-return-loc="birth" /> Doğum yerine göre
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={v !== null} readOnly disabled={v === null} data-return-loc="other" /> Farklı konumda{v ? `: ${v.label}` : " (aşağıdan seçin)"}
          </label>
        </div>
        <LocationPicker value={v} onChange={(x) => set(key, x)} />
      </div>
    );
  };

  const params_ = (id: UiTechniqueId) => {
    switch (id) {
      case "western.transit":
        return (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              <input type="radio" checked={params.transitMode === "now"} onChange={() => set("transitMode", "now")} /> Şimdi (UTC saat başı)
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input type="radio" checked={params.transitMode === "custom"} onChange={() => set("transitMode", "custom")} /> Tarih/saat
            </label>
            {params.transitMode === "custom" && (
              <>
                <input type="date" className={inp} value={params.transitDate} onChange={(e) => set("transitDate", e.target.value)} aria-label="Transit tarihi" />
                <input type="time" className={inp} value={params.transitTime} onChange={(e) => set("transitTime", e.target.value)} aria-label="Transit saati" />
                <select className={inp} value={params.transitTz} onChange={(e) => set("transitTz", e.target.value)} aria-label="Transit saat dilimi">
                  {TZ_OPTIONS.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        );
      case "western.forecast":
        return (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className={inp} value={params.forecastStart} onChange={(e) => set("forecastStart", e.target.value)} aria-label="Takvim başlangıcı" />
            <select className={inp} value={params.forecastDays} onChange={(e) => set("forecastDays", Number(e.target.value))} aria-label="Takvim süresi">
              {[30, 90, 180, 365, FORECAST_MAX_DAYS].map((d) => (
                <option key={d} value={d}>
                  {d} gün
                </option>
              ))}
            </select>
            <span className="text-xs text-amber-800">
              {forecastPartCount(params.forecastDays)} parça (sağlayıcı sınırı 90 gün/istek)
            </span>
          </div>
        );
      case "western.progression":
      case "western.solar_arc":
        return (
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            Hedef tarih (progression + solar arc ortak)
            <input type="date" className={inp} value={params.targetDate} onChange={(e) => set("targetDate", e.target.value)} aria-label="Hedef tarih" />
          </label>
        );
      case "western.solar_return":
        return (
          <div className="flex flex-col gap-1.5">
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            Dönüş yılı
            <input
              type="number"
              className={`${inp} w-24`}
              min={1600}
              max={2600}
              value={params.returnYear}
              onChange={(e) => set("returnYear", Number(e.target.value))}
              aria-label="Solar return yılı"
            />
          </label>
            {returnLocationChooser("solarReturnLocation", "Solar return")}
          </div>
        );
      case "western.lunar_return":
        return (
          <div className="flex flex-col gap-1.5">
            <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
              Dönüş ayı (UTC)
              <input
                type="month"
                className={inp}
                value={params.lunarMonth}
                onChange={(e) => onParams({ ...params, lunarMonth: e.target.value, lunarSequence: 1 })}
                aria-label="Lunar return ayı"
              />
            </label>
            {/* Ayın dönüşleri SUNUCU planından gelir (natal Ay sunucuda hesaplanır); her seçilen dönüş = 1 istek. */}
            <div className="flex flex-wrap items-center gap-3 text-xs" role="radiogroup" aria-label="Ay içindeki lunar return">
              {([1, 2] as const).map((seq) => {
                const r = lunarReturns?.find((x) => x.sequence === seq) ?? null;
                const disabled = lunarReturns !== null && !r;
                return (
                  <label key={seq} className={`flex items-center gap-1 ${disabled ? "text-slate-400" : ""}`}>
                    <input type="radio" disabled={disabled} checked={params.lunarSequence === seq} onChange={() => set("lunarSequence", seq)} data-lunar-seq={seq} />
                    {seq}. dönüş{r ? ` — ~${fmtUtcMinute(r.approxUtc)}` : disabled ? " (bu ayda yok)" : ""}
                  </label>
                );
              })}
            </div>
            {returnLocationChooser("lunarReturnLocation", "Lunar return")}
            {lunarReturns && lunarReturns.length > 1 && <span className="text-xs text-sky-800">Bu ayda {lunarReturns.length} lunar return var. Diğerini hesaplamak için sırayı değiştirip yeniden hesaplayın (her dönüş 1 istek; ikisi de ayrı kayıt olarak kalır).</span>}
          </div>
        );
      case "vedic.drishti":
      case "vedic.panchanga":
        return params.vedicAyanamsa === "lahiri" ? (
          <p className="text-xs text-slate-500">Lahiri (sabit) — sağlayıcı bu hesapta ayanamsa seçeneği almaz.</p>
        ) : (
          <p className="text-xs text-amber-800">Seçili ayanamsa Lahiri değil: bu hesap yapılmaz (sağlayıcı yalnız Lahiri ile hesaplar). Vedik seçimlerde ayanamsa&apos;yı Lahiri yapın.</p>
        );
      case "kp.chart":
      case "kp.dasha":
      case "kp.ruling":
      case "kp.transit":
      case "kp.horary": {
        const kpCommon = (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {id !== "kp.ruling" && (
              <label className="flex min-w-0 flex-wrap items-center gap-2">
                KP ayanamsa (tüm KP)
                <select className={inp} value={params.kpAyanamsa} onChange={(e) => set("kpAyanamsa", e.target.value)} aria-label={`KP ayanamsa (${id})`}>
                  {KP_AYANAMSA_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              Düğüm
              <select className={inp} value={params.kpNodeType} onChange={(e) => set("kpNodeType", e.target.value)} aria-label={`KP düğüm (${id})`}>
                <option value="mean">Ortalama (KP geleneği)</option>
                <option value="true">Gerçek</option>
              </select>
            </label>
          </div>
        );
        const moment = (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              <input type="radio" checked={params.kpMomentMode === "now"} onChange={() => set("kpMomentMode", "now")} /> Şimdi (UTC saat başı)
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={params.kpMomentMode === "custom"} onChange={() => set("kpMomentMode", "custom")} /> Tarih/saat
            </label>
            {params.kpMomentMode === "custom" && (
              <>
                <input type="date" className={inp} value={params.kpDate} onChange={(e) => set("kpDate", e.target.value)} aria-label="KP tarihi" />
                <input type="time" className={inp} value={params.kpTime} onChange={(e) => set("kpTime", e.target.value)} aria-label="KP saati" />
                <select className={inp} value={params.kpTz} onChange={(e) => set("kpTz", e.target.value)} aria-label="KP saat dilimi">
                  {TZ_OPTIONS.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </>
            )}
            <span className="text-slate-500">(ruling / transit / horary ortak an)</span>
          </div>
        );
        const place = (
          <fieldset className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-slate-300/80 bg-white/50 px-2.5 py-2" data-testid="astro-kp-place">
            <legend className="px-1 text-[11px] font-semibold text-slate-700">{id === "kp.horary" ? "Değerlendirme yeri" : "Gözlem yeri"} (ruling + horary ortak)</legend>
            <p className="text-[11px] leading-snug text-slate-600">
              Sorunun veya olayın ele alındığı konum — <strong>doğum yeri değildir</strong>. Doğum haritası gereken teknikler kayıtlı doğum yerini ayrıca kullanır.
            </p>
            <label className="flex items-start gap-1.5">
              <input type="radio" className="mt-0.5" checked={params.kpPlaceMode === "birth"} onChange={() => onParams({ ...params, kpPlaceMode: "birth" })} data-kp-place="birth" />
              <span>Doğum yerini gözlem yeri olarak kullan{birthPlaceLabel ? `: ${birthPlaceLabel}` : ""}</span>
            </label>
            <label className="flex items-start gap-1.5">
              <input type="radio" className="mt-0.5" checked={params.kpPlaceMode === "other"} onChange={() => onParams({ ...params, kpPlaceMode: "other" })} data-kp-place="other" />
              <span>Başka konum{params.kpPlaceMode === "other" && params.kpPlace ? `: ${params.kpPlace.label}` : ""}</span>
            </label>
            {params.kpPlaceMode === "other" && <LocationPicker value={params.kpPlace} onChange={(v) => set("kpPlace", v)} />}
            {params.kpPlaceMode === "unset" && <p className="text-[11px] text-amber-800">Gözlem yeri seçilmeden bu teknik plana alınmaz.</p>}
            {params.kpPlaceMode === "other" && !params.kpPlace && <p className="text-[11px] text-amber-800">Konumu seçin.</p>}
          </fieldset>
        );
        return (
          <div className="flex min-w-0 flex-col gap-1.5 text-xs" data-testid={`astro-kp-params-${id}`}>
            {id === "kp.dasha" && (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <select className={inp} value={params.kpDashaMd} onChange={(e) => onParams({ ...params, kpDashaMd: e.target.value, kpDashaAd: "" })} aria-label="KP dasha mahadasha">
                  <option value="">Mahadasha listesi</option>
                  {DASHA_LORD_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l} → antardashalar
                    </option>
                  ))}
                </select>
                {params.kpDashaMd && (
                  <select className={inp} value={params.kpDashaAd} onChange={(e) => set("kpDashaAd", e.target.value)} aria-label="KP dasha antardasha">
                    <option value="">(antardasha listesi)</option>
                    {DASHA_LORD_OPTIONS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l} → pratyantardashalar
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {id === "kp.horary" && (
              <label className="flex min-w-0 flex-wrap items-center gap-2">
                Horary sayısı (1–249)
                <input
                  type="number"
                  min={1}
                  max={249}
                  className={`${inp} w-24`}
                  value={params.horaryNumber}
                  onChange={(e) => set("horaryNumber", Math.max(1, Math.min(249, Math.trunc(Number(e.target.value) || 1))))}
                  aria-label="Horary sayısı"
                />
              </label>
            )}
            {id === "kp.transit" && (
              <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label="KP transit kipi" data-testid="astro-kp-transit-mode">
                <label className="flex items-center gap-1">
                  <input type="radio" checked={params.kpTransitMode !== "range"} onChange={() => set("kpTransitMode", "moment")} data-kp-mode="moment" /> Tek an (KP gökyüzü)
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={params.kpTransitMode === "range"} onChange={() => set("kpTransitMode", "range")} data-kp-mode="range" /> Zaman aralığı (Sub-Lord · Rasi geçişleri)
                </label>
              </div>
            )}
            {id === "kp.transit" && params.kpTransitMode === "range" && <KpRangeFields params={params} onParams={onParams} />}
            {(id === "kp.ruling" || id === "kp.horary" || (id === "kp.transit" && params.kpTransitMode !== "range")) && moment}
            {(id === "kp.ruling" || id === "kp.horary") && place}
            {kpCommon}
            {id === "kp.ruling" && <p className="text-slate-500">Ruling planets hesabı ayanamsa seçeneği almaz (KP-Newcomb dahili).</p>}
            {id === "kp.transit" && params.kpTransitMode !== "range" && <p className="text-amber-800">Tek an: sağlayıcı natal cusp&apos;lara göre transit analizi vermez; anın KP gökyüzü. Geçiş zamanları için “Zaman aralığı”.</p>}
          </div>
        );
      }
      case "vedic.transit":
        return (
          <div className="flex flex-col gap-1.5 text-xs" data-testid="astro-vedic-transit-params">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1">
                <input type="radio" checked={params.vedicTransitMode === "now"} onChange={() => set("vedicTransitMode", "now")} /> Şimdi (UTC saat başı)
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={params.vedicTransitMode === "custom"} onChange={() => set("vedicTransitMode", "custom")} /> Tarih/saat
              </label>
              {params.vedicTransitMode === "custom" && (
                <>
                  <input type="date" className={inp} value={params.vedicTransitDate} onChange={(e) => set("vedicTransitDate", e.target.value)} aria-label="Gochara tarihi" />
                  <input type="time" className={inp} value={params.vedicTransitTime} onChange={(e) => set("vedicTransitTime", e.target.value)} aria-label="Gochara saati" />
                  <select className={inp} value={params.vedicTransitTz} onChange={(e) => set("vedicTransitTz", e.target.value)} aria-label="Gochara saat dilimi">
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
              <p className="text-slate-500">Lahiri (sabit) — Gochara hesabı ayanamsa seçeneği almaz. Batı transitinden ayrı hesap ve kayıttır.</p>
            ) : (
              <p className="text-amber-800">Seçili ayanamsa Lahiri değil: Gochara hesaplanmaz (sağlayıcı yalnız Lahiri ile hesaplar).</p>
            )}
          </div>
        );
      case "vedic.ashtakavarga":
      case "vedic.shadbala":
        return (
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            Ayanamsa (tüm Vedik hesaplar)
            <select className={inp} value={params.vedicAyanamsa} onChange={(e) => set("vedicAyanamsa", e.target.value)} aria-label={`Vedik ayanamsa (${id})`}>
              {VEDIC_AYANAMSA_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        );
      case "vedic.dasha":
        return (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              Düzey
              <select className={inp} value={params.dashaMd} onChange={(e) => onParams({ ...params, dashaMd: e.target.value, dashaAd: "" })} aria-label="Dasha mahadasha">
                <option value="">Mahadasha listesi (120 yıl)</option>
                {DASHA_LORD_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l} mahadashası → antardashalar
                  </option>
                ))}
              </select>
            </label>
            {params.dashaMd && (
              <label className="flex min-w-0 flex-wrap items-center gap-2">
                <select className={inp} value={params.dashaAd} onChange={(e) => set("dashaAd", e.target.value)} aria-label="Dasha antardasha">
                  <option value="">(antardasha listesi)</option>
                  {DASHA_LORD_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l} antardashası → pratyantardashalar
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              Ayanamsa (tüm Vedik hesaplar)
              <select className={inp} value={params.vedicAyanamsa} onChange={(e) => set("vedicAyanamsa", e.target.value)} aria-label="Vedik ayanamsa (dasha)">
                {VEDIC_AYANAMSA_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
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
              Bölüm
              <select className={inp} value={params.vargaDivision} onChange={(e) => set("vargaDivision", Number(e.target.value))} aria-label="Varga bölümü">
                {VEDIC_VARGA_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              Ayanamsa (tüm Vedik hesaplar)
              <select className={inp} value={params.vedicAyanamsa} onChange={(e) => set("vedicAyanamsa", e.target.value)} aria-label="Vedik ayanamsa (varga)">
                {VEDIC_AYANAMSA_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
        );
      case "vedic.d1":
        return (
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            Ayanamsa (tüm Vedik hesaplar)
            <select className={inp} value={params.vedicAyanamsa} onChange={(e) => set("vedicAyanamsa", e.target.value)} aria-label="Vedik ayanamsa">
              {VEDIC_AYANAMSA_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        );
      case "western.relocation":
        return (
          <div className="flex flex-col gap-1 text-xs" data-testid="astro-relocation-target">
            <span>Hedef konum (doğum anı aynı kalır; yalnız konum değişir)</span>
            <LocationPicker value={params.relocationTarget} onChange={(v) => set("relocationTarget", v)} />
          </div>
        );
      case "western.local_space":
        return (
          <div className="flex flex-col gap-1 text-xs" data-testid="astro-local-space-ref">
            <label className="flex items-center gap-1">
              <input type="radio" checked={params.localSpaceReference === null} onChange={() => set("localSpaceReference", null)} /> Merkez: doğum yeri
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={params.localSpaceReference !== null} onChange={() => undefined} disabled={params.localSpaceReference === null} /> Merkez: başka konum
            </label>
            <LocationPicker value={params.localSpaceReference} onChange={(v) => set("localSpaceReference", v)} />
          </div>
        );
      case "western.fixed_stars":
        return (
          <div className="flex flex-col gap-1.5 text-xs" data-testid="astro-fixed-stars-params">
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              Kavuşum orbu
              <select className={inp} value={String(params.fixedStarsOrb)} onChange={(e) => set("fixedStarsOrb", Number(e.target.value))} aria-label="Sabit yıldız orbu">
                {FIXED_STAR_ORB_OPTIONS.map((o) => (
                  <option key={o} value={String(o)}>
                    {o.toLocaleString("tr-TR")}°{o === FIXED_STAR_ORB_DEFAULT ? " (varsayılan)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-slate-500">Orb yalnız filtredir: veri sağlayıcıdan 3° ile bir kez alınır; orbu değiştirmek yeni istek oluşturmaz.</span>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={params.fixedStarsCatalog} onChange={(e) => set("fixedStarsCatalog", e.target.checked)} /> Word/PDF raporuna 43 yıldızlık katalog ekini ekle
            </label>
          </div>
        );
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
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="text-slate-600">Karşı taraf (sinastri / composite ortak)</span>
      {onPartnerQuery && (
        <input type="search" className={inp} value={partnerQuery ?? ""} onChange={(e) => onPartnerQuery(e.target.value)} maxLength={100} placeholder="Karşı tarafı ara" aria-label="Karşı taraf ara" />
      )}
      <select className={inp} value={params.partnerProfileId} onChange={(e) => onParams({ ...params, partnerProfileId: e.target.value })} aria-label="Karşı taraf profili">
        <option value="">— seçin —</option>
        {partners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Batı yöntem alanları (ev sistemi / ay düğümü) — yalnız ilgili teknik için gösterilir; değer tüm Batı tekniklerinde ortaktır. */
export function MethodFields({
  id,
  method,
  onMethod,
}: {
  id: UiTechniqueId;
  method: { houseSystem: HouseSystem; nodeType: NodeType };
  onMethod: (next: { houseSystem: HouseSystem; nodeType: NodeType }) => void;
}) {
  const house = USES_HOUSE_SYSTEM.includes(id);
  const node = USES_NODE_TYPE.includes(id);
  if (!house && !node) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-3">
      {house && (
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-slate-600">Ev sistemi (Batı ortak)</span>
          <select className={inp} value={method.houseSystem} onChange={(e) => onMethod({ ...method, houseSystem: e.target.value as HouseSystem })} aria-label="Ev sistemi">
            {HOUSE_SYSTEMS.map((h) => (
              <option key={h} value={h}>
                {HOUSE_SYSTEM_LABELS[h]}
              </option>
            ))}
          </select>
        </label>
      )}
      {node && (
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-slate-600">Ay düğümü (Batı ortak)</span>
          <select className={inp} value={method.nodeType} onChange={(e) => onMethod({ ...method, nodeType: e.target.value as NodeType })} aria-label="Ay düğümü">
            {NODE_TYPES.map((n) => (
              <option key={n} value={n}>
                {NODE_TYPE_LABELS[n]}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
