"use client";

// Hesaplanmış Human Design haritası — profesyonel DANIŞAN + HARİTA bilgi bloğu (SAF SUNUM).
//
// Kayıtlı veriden (computed_result + kayıt satırı) render edilir; hesap / fetch / sağlayıcı çağrısı YOK.
// Yerleşim (tek DOM, yalnız CSS):
//   • mobil (< lg): BodyGraph'ın üstünde kart; alanlar 1–2 sütun, metin kesilmez
//   • lg şerit: sahnenin üstünde ince şerit (Danışan | Human Design | marka)
//   • hdwide (≥1280px ve en-boy ≥ 16:10): sahnenin SOLUNDA dar kolon → BodyGraph dikeyde tam yükseklik
// Sağlayıcının ham değeri görünür metni kalabalıklaştırmaz; title (üzerine gelince) olarak verilir.

import type { ReactNode } from "react";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import type { HdAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import type { HdChartSubjectInfo } from "@/lib/human-design/chart/chartSubjectInfo";
import {
  hdAuthorityLabelFromCode,
  hdChannelLabelFromCode,
  hdDefinitionLabelFromCode,
  hdProfileLabelFromCode,
  hdTypeLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { HD_NOT_SELF_TR, HD_SIGNATURE_TR, HD_STRATEGY_TR, hdCrossAngleLabel } from "@/lib/human-design/normalize/hdDisplayLabels";

function Item({
  label,
  value,
  sub,
  source,
  field,
  wide = false,
  subInStrip = true,
}: {
  label: string;
  value: string | null;
  sub?: string | null;
  source?: string | null;
  field: string;
  wide?: boolean;
  /** false → alt satır lg şeritte gizlenir (bilgi title'da kalır), mobil/geniş kolonda görünür. */
  subInStrip?: boolean;
}) {
  const text = value ?? "—";
  return (
    // lg şerit: "ETİKET değer" satır-içi akış (kesilme yok, sarar) · hdwide/mobil: etiket üstte, değer altta.
    <div
      className={`min-w-0 lg:flex lg:max-w-full lg:items-baseline lg:gap-1.5 hdwide:block ${wide ? "col-span-full" : ""}`}
      data-hd-info-field={field}
      title={source ? `Kaynak değeri: ${source}` : undefined}
    >
      <dt className="text-[9px] font-black uppercase leading-tight tracking-wide text-indigo-500 lg:shrink-0 lg:whitespace-nowrap hdwide:whitespace-normal">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-[13px] font-bold leading-snug text-slate-900 lg:text-[12px] hdwide:text-[13px]">
        {text}
      </dd>
      {sub ? <dd className={`m-0 min-w-0 break-words text-[10px] font-semibold leading-tight text-slate-500 ${subInStrip ? "" : "lg:hidden hdwide:block"}`}>{sub}</dd> : null}
    </div>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700 lg:mb-0 lg:mr-4 lg:shrink-0 lg:pt-px lg:tracking-[0.1em] hdwide:mb-1.5 hdwide:mr-0 hdwide:tracking-[0.16em]">
      {children}
    </p>
  );
}

/** Hafif marka: logo karosu + ad + alan adı (BodyGraph'ın DIŞINDA, panelin içinde; geniş kolonda altta sabit). */
function Brand() {
  return (
    <div
      className="flex items-center gap-2 border-t border-indigo-100 pt-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:flex-col lg:items-end lg:justify-center lg:gap-0.5 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0 hdwide:sticky hdwide:bottom-0 hdwide:mt-auto hdwide:bg-white hdwide:flex-row hdwide:items-center hdwide:justify-start hdwide:gap-2 hdwide:border-l-0 hdwide:border-t hdwide:pl-0 hdwide:pt-2"
      data-hd-brand
    >
      <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-[10px] text-white">
        ✨
      </span>
      <span className="min-w-0 leading-tight lg:text-right hdwide:text-left">
        <span className="block text-[10px] font-black tracking-wide text-slate-700">YAŞAM SİSTEMİ</span>
        <span className="block text-[10px] font-medium text-slate-400">yasamsistemi.com</span>
      </span>
    </div>
  );
}

export function HdChartInfoPanel({
  result,
  codes,
  subject,
}: {
  result: HdComputedChart;
  codes: HdAppChartCodes;
  subject: HdChartSubjectInfo | null;
}) {
  const typeCode = codes.type_code;
  const cross = result.incarnationCross;
  const [pSun, pEarth, dSun, dEarth] = cross.gates;
  const showRaw = (raw: string | undefined, label: string) => (raw && raw !== label ? raw : null);
  const typeLabel = hdTypeLabelFromCode(typeCode);
  const authorityLabel = hdAuthorityLabelFromCode(codes.authority_code);
  const profileLabel = hdProfileLabelFromCode(codes.profile_code);
  const definitionLabel = hdDefinitionLabelFromCode(codes.definition_code);
  const crossGates = `${pSun}/${pEarth} | ${dSun}/${dEarth}`;

  return (
    <section
      aria-label="Danışan ve harita bilgileri"
      data-hd-info
      className="rounded-2xl border border-indigo-200/70 bg-white p-3 shadow-sm lg:flex-none lg:px-4 lg:py-2 hdwide:w-[252px] hdwide:shrink-0 hdwide:overflow-y-auto hdwide:px-4 hdwide:py-3"
    >
      <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-4 lg:gap-y-1 lg:space-y-0 hdwide:flex hdwide:min-h-full hdwide:flex-col hdwide:gap-3 hdwide:space-y-0">
        {subject ? (
          <div className="lg:flex lg:items-start hdwide:block" data-hd-info-group="subject">
            <GroupTitle>Danışan</GroupTitle>
            <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-1.5 min-[420px]:grid-cols-2 lg:flex lg:min-w-0 lg:flex-1 lg:flex-wrap lg:gap-x-4 lg:gap-y-0.5 hdwide:grid hdwide:grid-cols-1 hdwide:gap-y-1.5">
              <Item field="name" label="Ad Soyad" value={subject.name} wide />
              <Item field="local" label="Doğum Tarihi (Yerel)" value={subject.localDateTime} sub={subject.zoneLabel} />
              <Item field="utc" label="Doğum Tarihi (UTC)" value={subject.utcDateTime} />
              <Item field="place" label="Doğum Yeri" value={subject.place} />
              <Item field="coords" label="Koordinatlar" value={subject.coordinates} />
              <Item field="age" label="Yaş" value={subject.age != null ? String(subject.age) : null} />
            </dl>
          </div>
        ) : null}

        <div className="lg:flex lg:items-start hdwide:block" data-hd-info-group="chart" data-hd-summary>
          <GroupTitle>
            <span lang="en">Human Design</span>
          </GroupTitle>
          <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-1.5 min-[420px]:grid-cols-2 lg:flex lg:min-w-0 lg:flex-1 lg:flex-wrap lg:gap-x-4 lg:gap-y-0.5 hdwide:grid hdwide:grid-cols-1 hdwide:gap-y-1.5">
            <Item field="type" label="Tip" value={typeLabel} source={showRaw(result.type, typeLabel)} />
            <Item field="strategy" label="Strateji" value={typeCode ? HD_STRATEGY_TR[typeCode] : null} source={result.strategy ?? null} />
            <Item field="profile" label="Profil" value={profileLabel} />
            <Item field="definition" label="Tanım" value={definitionLabel} source={showRaw(result.definition.kind, definitionLabel)} />
            <Item
              field="cross"
              label="Enkarnasyon Haçı"
              value={cross.name ?? `${hdCrossAngleLabel(cross.angle)} (yalnız kapılar)`}
              sub={`${crossGates}${cross.angle ? ` · ${hdCrossAngleLabel(cross.angle)}` : ""}`}
              source={`${crossGates}${cross.angle ? ` · ${hdCrossAngleLabel(cross.angle)}` : ""}`}
              subInStrip={false}
            />
            <Item field="authority" label="İç Otorite" value={authorityLabel} source={showRaw(result.authority, authorityLabel)} />
            <Item field="signature" label="İmza" value={typeCode ? HD_SIGNATURE_TR[typeCode] : null} source={result.signature ?? null} />
            <Item field="notself" label="Benlik-dışı Tema" value={typeCode ? HD_NOT_SELF_TR[typeCode] : null} source={result.notSelf ?? null} />
          </dl>
        </div>

        {/* Kanallar yalnız geniş masaüstü kolonunda; diğer düzenlerde aşağıdaki "Tanımlı Kanallar" bölümü gösterir. */}
        <div className="hidden hdwide:block" data-hd-info-group="channels">
          <GroupTitle>Tanımlı Kanallar ({codes.channels.length})</GroupTitle>
          {codes.channels.length === 0 ? (
            <p className="m-0 text-xs text-slate-500">Tanımlı kanal yok.</p>
          ) : (
            <ul className="m-0 list-none space-y-0.5 p-0">
              {codes.channels.map((ch) => (
                <li key={ch} className="break-words text-xs font-semibold leading-snug text-slate-800">
                  {hdChannelLabelFromCode(ch)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Brand />
      </div>
    </section>
  );
}
