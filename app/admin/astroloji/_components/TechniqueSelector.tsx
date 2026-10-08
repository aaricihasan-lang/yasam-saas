"use client";

/**
 * Çoklu teknik seçimi — yalnız İŞARETLİ tekniklerin parametreleri gösterilir. Bu bileşen istek
 * SAYISI hesaplamaz (tahmin yok); gerçek X/Y/Z sunucu planlayıcısından gelir (sayfa gösterir).
 */

import { HOUSE_SYSTEMS, NODE_TYPES, type HouseSystem, type NodeType } from "@/lib/astrology/model/western";
import { Fragment } from "react";
import LocationPicker from "./LocationPicker";
import { HOUSE_SYSTEM_LABELS, NODE_TYPE_LABELS } from "@/lib/astrology/labels/tr";
import { FORECAST_MAX_DAYS, TECHNIQUE_META, UI_TECHNIQUES, DASHA_LORD_OPTIONS, KP_AYANAMSA_OPTIONS, VEDIC_AYANAMSA_OPTIONS, VEDIC_VARGA_OPTIONS, fmtUtcMinute, forecastPartCount, type LunarReturnInfo, type TechniqueParams, type UiTechniqueId } from "../_lib/techniques";

// max-w-full: uzun seçenek metni (ör. "Lahiri (Chitrapaksha) — varsayılan") 390 px'te kartı taşırmasın.
const inp = "max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm";
const TZ_OPTIONS = ["Europe/Istanbul", "UTC", "Europe/London", "Europe/Berlin", "America/New_York", "Asia/Dubai"];

export type PartnerOption = { id: string; label: string };

export default function TechniqueSelector({
  checked,
  onChecked,
  params,
  onParams,
  method,
  onMethod,
  partners,
  timeKnown,
  lunarReturns = null,
}: {
  checked: Partial<Record<UiTechniqueId, boolean>>;
  onChecked: (next: Partial<Record<UiTechniqueId, boolean>>) => void;
  params: TechniqueParams;
  onParams: (next: TechniqueParams) => void;
  method: { houseSystem: HouseSystem; nodeType: NodeType };
  onMethod: (next: { houseSystem: HouseSystem; nodeType: NodeType }) => void;
  partners: PartnerOption[];
  timeKnown: boolean;
  /** Sunucu planının bildirdiği, seçilen aydaki lunar return'ler (henüz plan yoksa null). */
  lunarReturns?: LunarReturnInfo[] | null;
}) {
  const set = <K extends keyof TechniqueParams>(k: K, v: TechniqueParams[K]) => onParams({ ...params, [k]: v });
  const anyPartner = !!(checked["western.synastry"] || checked["western.composite"]);
  const anyHouse = !!(checked["western.natal"] || checked["western.solar_return"] || checked["western.lunar_return"] || checked["western.relocation"] || anyPartner);
  const anyNode = !!(checked["western.natal"] || checked["western.transit"] || checked["western.progression"] || checked["western.solar_arc"] || anyPartner);

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
            {lunarReturns && lunarReturns.length > 1 && <span className="text-xs text-violet-800">Bu ayda {lunarReturns.length} lunar return var. Diğerini hesaplamak için sırayı değiştirip yeniden hesaplayın (her dönüş 1 istek; ikisi de ayrı kayıt olarak kalır).</span>}
          </div>
        );
      case "vedic.drishti":
      case "vedic.panchanga":
        return params.vedicAyanamsa === "lahiri" ? (
          <p className="text-xs text-slate-500">Lahiri (sabit) — Roxy bu uçta ayanamsa almaz.</p>
        ) : (
          <p className="text-xs text-amber-800">Seçili ayanamsa Lahiri değil: bu hesap yapılmaz (Roxy yalnız Lahiri ile hesaplar). Vedik seçimlerde ayanamsa&apos;yı Lahiri yapın.</p>
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
          <div className="flex min-w-0 flex-col gap-1">
            <span>{id === "kp.horary" ? "Değerlendirme yeri" : "Gözlem yeri"}: {params.kpPlace ? params.kpPlace.label : "doğum yeri (varsayılan)"}</span>
            <LocationPicker value={params.kpPlace} onChange={(v) => set("kpPlace", v)} />
          </div>
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
            {(id === "kp.ruling" || id === "kp.transit" || id === "kp.horary") && moment}
            {(id === "kp.ruling" || id === "kp.horary") && place}
            {kpCommon}
            {id === "kp.ruling" && <p className="text-slate-500">Roxy ruling planets ucu ayanamsa almaz (KP-Newcomb dahili).</p>}
            {id === "kp.transit" && <p className="text-amber-800">Kısmi: Roxy natal cusp&apos;lara göre transit analizi vermez; yalnız anın KP gökyüzü.</p>}
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
              <p className="text-slate-500">Lahiri (sabit) — Roxy Gochara ucu ayanamsa almaz. Batı transitinden ayrı hesap ve kayıttır.</p>
            ) : (
              <p className="text-amber-800">Seçili ayanamsa Lahiri değil: Gochara hesaplanmaz (Roxy yalnız Lahiri ile hesaplar).</p>
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
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="astro-technique-selector">
      {/* fieldset varsayılanı min-inline-size: min-content → mobilde taşar; min-w-0 ile sıfırlanır. */}
      <fieldset className="grid min-w-0 gap-2 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-slate-700">Hesaplanacak teknikler</legend>
        {UI_TECHNIQUES.map((id, i) => {
          const m = TECHNIQUE_META[id];
          // 6G: gelenek başlıkları (Batı / Vedik / KP) — 24 teknik tek düz listede ayırt edilemiyordu.
          const fam = id.split(".")[0];
          const head = i === 0 || UI_TECHNIQUES[i - 1].split(".")[0] !== fam ? (fam === "western" ? "Batı (tropikal)" : fam === "vedic" ? "Vedik / Jyotish (sidereal)" : "KP — Krishnamurti Paddhati (sidereal, Placidus)") : null;
          const on = !!checked[id];
          return (
            <Fragment key={id}>
            {head && <h3 className="col-span-full mt-1 text-xs font-semibold uppercase tracking-wide text-violet-800" data-technique-group={fam}>{head}</h3>}
            <div className={`min-w-0 rounded-xl border px-3 py-2 ${on ? "border-violet-300 bg-violet-50/50" : "border-slate-200 bg-white"}`}>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={on} onChange={(e) => onChecked({ ...checked, [id]: e.target.checked })} data-technique={id} />
                <span>
                  <span className="text-sm font-medium text-slate-800">{m.label}</span>
                  <span className="block text-xs text-slate-500">{m.hint}</span>
                  {m.needsTime && !timeKnown && <span className="block text-xs text-amber-800">Doğum saati bilinmiyor — bu teknik hesaplanmaz.</span>}
                </span>
              </label>
              {on && <div className="mt-2 pl-6">{params_(id)}</div>}
            </div>
            </Fragment>
          );
        })}
      </fieldset>

      {(anyHouse || anyNode || anyPartner) && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          {anyPartner && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Karşı taraf (sinastri / composite)</span>
              <select className={inp} value={params.partnerProfileId} onChange={(e) => set("partnerProfileId", e.target.value)} aria-label="Karşı taraf profili">
                <option value="">— seçin —</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {anyHouse && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Ev sistemi</span>
              <select className={inp} value={method.houseSystem} onChange={(e) => onMethod({ ...method, houseSystem: e.target.value as HouseSystem })}>
                {HOUSE_SYSTEMS.map((h) => (
                  <option key={h} value={h}>
                    {HOUSE_SYSTEM_LABELS[h]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {anyNode && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Ay düğümü</span>
              <select className={inp} value={method.nodeType} onChange={(e) => onMethod({ ...method, nodeType: e.target.value as NodeType })}>
                {NODE_TYPES.map((n) => (
                  <option key={n} value={n}>
                    {NODE_TYPE_LABELS[n]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="text-sm text-slate-500">Zodyak: Tropikal (bu satır yalnız Batı tekniklerini etkiler)</span>
        </div>
      )}
    </div>
  );
}
