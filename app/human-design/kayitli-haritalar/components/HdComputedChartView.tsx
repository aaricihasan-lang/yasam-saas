"use client";

// Hesaplanmış Human Design haritası — SAF SUNUM (fetch yok, hesap yok).
//
// Kayıtlı `computed_result`'tan (RECOMPUTE YOK) render edilir:
//   • bilgi bloğu (HdChartInfoPanel): Danışan (ad, yerel/UTC doğum, yer, koordinat, yaş) +
//     Tip / Strateji / Profil / Tanım / Enkarnasyon Haçı / İç Otorite / İmza / Benlik-dışı tema
//   • Design | BodyGraph | Personality (tek DOM; mobilde BodyGraph üstte, altında iki sütun)
//   • 9 merkez (tanımlı/açık), tanımlı kanallar, aktif kapılar
// Etiketler uygulama sözlüğünden (Türkçe); sağlayıcı değeri yalnız küçük "kaynak değeri" olarak.
// Sağlayıcı açıklama metinleri (typeDescription vb.) burada GÖSTERİLMEZ.

import { BodyGraph } from "../../harita/components/BodyGraph";
import { HdRoxyBodygraph, ROXY_BODYGRAPH_ASPECT } from "./HdRoxyBodygraph";
import { HdPlanetColumn } from "./HdPlanetColumn";
import { HdChartInfoPanel } from "./HdChartInfoPanel";
import type { HdChartSubjectInfo } from "@/lib/human-design/chart/chartSubjectInfo";
import { computedChartAppCodes, type HdComputedChart } from "@/lib/human-design/chart/computedChart";
import { hdCenterLabelFromCode, hdChannelLabelFromCode } from "@/lib/human-design/codeHelpers";
import { HUMAN_DESIGN_CENTERS } from "@/lib/human-design/constants";

export function HdComputedChartView({
  result,
  roxyRender = null,
  subject = null,
}: {
  result: HdComputedChart;
  /** RoxyAPI kaydı: resmi renderer için KAYITLI yanıttan yapısal yük (sunucu üretir). */
  roxyRender?: Record<string, unknown> | null;
  /** Danışan bilgi bloğu (kayıt satırından; buildChartSubjectInfo). Yoksa yalnız HD bilgileri. */
  subject?: HdChartSubjectInfo | null;
}) {
  const codes = computedChartAppCodes(result);
  const isProvider = result.provider?.id === "roxyapi";
  const definedSet = new Set(codes.active_centers);

  return (
    <div className="space-y-5" data-hd-computed-view={isProvider ? "roxyapi" : "engine"}>
      {/* Masaüstü tek bakış: bilgi bloğu + sahne; sahne ekranın KALAN yüksekliğinin tamamını alır
          (üst bar ~3.5rem + kenar boşluğu düşülür). BodyGraph yükseklik-öncelikli büyür; küçültülmez.
          lg: bilgi bloğu sahnenin üstünde ince şerit · hdwide (geniş+yatay): solda dar kolon
          [Bilgi] [Design] [BodyGraph] [Personality] — üst şerit kalkar, BodyGraph dikeyde büyür. */}
      <div className="space-y-3 lg:flex lg:h-[calc(100dvh-5.25rem)] lg:min-h-[520px] lg:flex-col lg:gap-2 lg:space-y-0 hdwide:flex-row hdwide:gap-3" data-hd-onelook>
      <HdChartInfoPanel result={result} codes={codes} subject={subject} />

      {/* Design | BodyGraph | Personality — masaüstünde tek bakış: BodyGraph yüksekliği ekrana göre
          ölçeklenir (Head→Root dikey kaydırmasız); mobilde BodyGraph üstte, altında iki sütun. */}
      <div className="rounded-2xl border border-indigo-200/70 bg-gradient-to-b from-white to-indigo-50/40 p-3 shadow-sm lg:min-h-0 lg:flex-1 lg:px-4 lg:py-2 hdwide:min-w-0" data-hd-stage>
        <div className="flex flex-wrap items-start justify-center gap-x-3 gap-y-4 lg:h-full lg:flex-nowrap lg:items-center lg:justify-center lg:gap-x-[clamp(20px,3vw,64px)] hdwide:gap-x-[clamp(16px,2vw,40px)]">
          <div className="order-2 w-[calc(50%-0.375rem)] max-w-[220px] rounded-xl border border-rose-100 bg-white/90 p-2 lg:order-1 lg:w-[clamp(190px,17vw,280px)] lg:max-w-none lg:shrink-0 lg:p-3">
            <HdPlanetColumn activations={result.activations} side="design" />
          </div>
          {/* Orta: yükseklik-öncelikli BodyGraph (SVG viewBox 340×600 korunur; yalnız ölçek). */}
          {/* hdwide: alan yetmezse (dikey uzun pencere) taşma yerine yalnız BodyGraph genişliği daralır. */}
          <div className="order-1 flex w-full justify-center lg:order-2 lg:h-full lg:w-auto lg:flex-none hdwide:min-w-0 hdwide:shrink">
            {roxyRender ? (
              // RoxyAPI otomatik harita → Roxy'nin RESMİ BodyGraph'ı (eski Yaşam Sistemi renderer'ı KULLANILMAZ).
              <div className="w-full max-w-[440px] lg:h-full lg:w-auto lg:max-w-none" style={{ aspectRatio: ROXY_BODYGRAPH_ASPECT }} data-hd-renderer="roxy-official">
                <HdRoxyBodygraph data={roxyRender} />
              </div>
            ) : (
              // Eski (dahili motor) hesaplanmış kayıtlar: mevcut görünüm korunur (veri silinmez).
              <div className="w-full max-w-[420px] lg:h-full lg:w-auto lg:max-w-none [&_svg]:max-w-[420px] lg:[&_svg]:h-full lg:[&_svg]:w-auto lg:[&_svg]:max-w-none" data-hd-renderer="legacy">
                <BodyGraph result={result} />
              </div>
            )}
          </div>
          <div className="order-3 w-[calc(50%-0.375rem)] max-w-[220px] rounded-xl border border-slate-200 bg-white/90 p-2 lg:w-[clamp(190px,17vw,280px)] lg:max-w-none lg:shrink-0 lg:p-3">
            <HdPlanetColumn activations={result.activations} side="personality" />
          </div>
        </div>
      </div>

      </div>

      {/* Merkezler / Kanallar / Kapılar */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-indigo-100 bg-white px-4 py-3">
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-indigo-600">Merkezler</p>
          <ul className="m-0 grid list-none grid-cols-1 gap-1 p-0 min-[420px]:grid-cols-2">
            {HUMAN_DESIGN_CENTERS.map((c) => {
              const on = definedSet.has(c.code);
              return (
                <li key={c.code} data-hd-center={`${c.code}:${on ? "defined" : "open"}`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-slate-700">{hdCenterLabelFromCode(c.code)}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                      on ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {on ? "Tanımlı" : "Açık"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-indigo-100 bg-white px-4 py-3">
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-indigo-600">Tanımlı Kanallar ({codes.channels.length})</p>
            {codes.channels.length === 0 ? (
              <p className="text-xs text-slate-500">Tanımlı kanal yok.</p>
            ) : (
              <ul className="m-0 list-none space-y-1 p-0">
                {codes.channels.map((ch) => (
                  <li key={ch} data-hd-channel={ch} className="text-xs text-slate-800">
                    {hdChannelLabelFromCode(ch)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-indigo-100 bg-white px-4 py-3">
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-indigo-600">Aktif Kapılar ({codes.gates.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {codes.gates.map((g) => (
                <span key={g} data-hd-gate={g} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-bold tabular-nums text-indigo-800">
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        {isProvider
          ? `Hesaplama kaynağı: RoxyAPI (nodeType: ${result.provider?.nodeType ?? "—"}). Kayıtlı sonuç gösterilmektedir; görüntülemede yeniden hesap yapılmaz.`
          : "Hesaplama kaynağı: Yaşam Sistemi dahili motoru (eski kayıt)."}
      </p>
    </div>
  );
}
