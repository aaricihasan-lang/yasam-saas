"use client";

// Hesaplanmış Human Design haritası — SAF SUNUM (fetch yok, hesap yok).
//
// Kayıtlı `computed_result`'tan (RECOMPUTE YOK) render edilir:
//   • özet: Tip / Strateji / Otorite / İmza / Benlik-dışı tema / Profil / Tanım / Enkarnasyon Haçı
//   • Design | BodyGraph | Personality (tek DOM; mobilde BodyGraph üstte, altında iki sütun)
//   • 9 merkez (tanımlı/açık), tanımlı kanallar, aktif kapılar
// Etiketler uygulama sözlüğünden (Türkçe); sağlayıcı değeri yalnız küçük "kaynak değeri" olarak.
// Sağlayıcı açıklama metinleri (typeDescription vb.) burada GÖSTERİLMEZ.

import { BodyGraph } from "../../harita/components/BodyGraph";
import { HdPlanetColumn } from "./HdPlanetColumn";
import { computedChartAppCodes, type HdComputedChart } from "@/lib/human-design/chart/computedChart";
import {
  hdAuthorityLabelFromCode,
  hdCenterLabelFromCode,
  hdChannelLabelFromCode,
  hdDefinitionLabelFromCode,
  hdProfileLabelFromCode,
  hdTypeLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { HUMAN_DESIGN_CENTERS } from "@/lib/human-design/constants";
import { HD_NOT_SELF_TR, HD_SIGNATURE_TR, HD_STRATEGY_TR, hdCrossAngleLabel } from "@/lib/human-design/normalize/hdDisplayLabels";

function Field({ label, value, source }: { label: string; value: string; source?: string | null }) {
  return (
    <div className="min-w-0 rounded-xl border border-indigo-100 bg-white px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-wide text-indigo-500">{label}</p>
      <p className="break-words text-sm font-bold text-slate-900">{value}</p>
      {source ? <p className="break-words text-[10px] text-slate-400">Kaynak değeri: {source}</p> : null}
    </div>
  );
}

export function HdComputedChartView({ result }: { result: HdComputedChart }) {
  const codes = computedChartAppCodes(result);
  const isProvider = result.provider?.id === "roxyapi";
  const typeCode = codes.type_code;
  const definedSet = new Set(codes.active_centers);
  const cross = result.incarnationCross;
  const [pSun, pEarth, dSun, dEarth] = cross.gates;
  const showRaw = (raw: string | undefined, label: string) => (raw && raw !== label ? raw : null);

  const typeLabel = hdTypeLabelFromCode(typeCode);
  const authorityLabel = hdAuthorityLabelFromCode(codes.authority_code);
  const profileLabel = hdProfileLabelFromCode(codes.profile_code);
  const definitionLabel = hdDefinitionLabelFromCode(codes.definition_code);

  return (
    <div className="space-y-5" data-hd-computed-view={isProvider ? "roxyapi" : "engine"}>
      {/* Özet */}
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Field label="Tip" value={typeLabel} source={showRaw(result.type, typeLabel)} />
        <Field label="Strateji" value={typeCode ? HD_STRATEGY_TR[typeCode] : "—"} source={result.strategy ?? null} />
        <Field label="Otorite" value={authorityLabel} source={showRaw(result.authority, authorityLabel)} />
        <Field label="Profil" value={profileLabel} />
        <Field label="İmza (Signature)" value={typeCode ? HD_SIGNATURE_TR[typeCode] : "—"} source={result.signature ?? null} />
        <Field label="Benlik-dışı Tema (Not-Self)" value={typeCode ? HD_NOT_SELF_TR[typeCode] : "—"} source={result.notSelf ?? null} />
        <Field label="Tanım" value={definitionLabel} source={showRaw(result.definition.kind, definitionLabel)} />
        <Field
          label="Enkarnasyon Haçı"
          value={cross.name ?? `${hdCrossAngleLabel(cross.angle)} (yalnız kapılar)`}
          source={`${pSun}/${pEarth} | ${dSun}/${dEarth}${cross.angle ? ` · ${hdCrossAngleLabel(cross.angle)}` : ""}`}
        />
      </div>

      {/* Design | BodyGraph | Personality */}
      <div className="rounded-2xl border border-indigo-200/70 bg-gradient-to-b from-white to-indigo-50/40 p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-center gap-x-3 gap-y-4 lg:flex-nowrap lg:gap-x-8">
          <div className="order-2 w-[calc(50%-0.375rem)] max-w-[150px] lg:order-1 lg:w-[132px] lg:shrink-0">
            <HdPlanetColumn activations={result.activations} side="design" />
          </div>
          {/* Orta hücre sabit genişlik: sütunlar grafiğe yakın durur (geniş ekranda araya boşluk açılmaz). */}
          <div className="order-1 flex w-full justify-center lg:order-2 lg:w-[360px] lg:flex-none">
            <div className="w-full max-w-[360px]">
              <BodyGraph result={result} />
            </div>
          </div>
          <div className="order-3 w-[calc(50%-0.375rem)] max-w-[150px] lg:w-[132px] lg:shrink-0">
            <HdPlanetColumn activations={result.activations} side="personality" />
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
