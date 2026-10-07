"use client";

// Hesaplanmış Human Design haritası — profesyonel DANIŞAN + HARİTA bilgi bloğu (SAF SUNUM).
//
// Kayıtlı veriden (computed_result + kayıt satırı) render edilir; hesap / fetch / sağlayıcı çağrısı YOK.
// YALNIZ teknik kimlik: Danışan (ad, yerel/UTC doğum, tz, yer, koordinat, yaş) + HD (Tip, Profil, Tanım,
// Enkarnasyon Haçı, İç Otorite). Yorum niteliğindeki / aşağıda tekrar gösterilen bilgiler (Strateji, İmza,
// Benlik-dışı tema, kanallar, merkezler, kapılar, Bilgi Bankası) BURADA YOK.
// Yerleşim (tek DOM, yalnız CSS):
//   • mobil (< lg): BodyGraph'ın üstünde kart; alanlar 1–2 sütun, metin kesilmez, logo en altta
//   • lg şerit: sahnenin üstünde ince şerit (Danışan | Human Design | logo)
//   • hdwide (≥1280px ve en-boy ≥ 16:10): harita kartının İÇİNDE sol kolon (ayrı kart / iç kaydırma YOK)
// Sağlayıcının ham değeri görünür metni kalabalıklaştırmaz; title (üzerine gelince) olarak verilir.

import type { ReactNode } from "react";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import type { HdAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import type { HdChartSubjectInfo } from "@/lib/human-design/chart/chartSubjectInfo";
import {
  hdAuthorityLabelFromCode,
  hdDefinitionLabelFromCode,
  hdProfileLabelFromCode,
  hdTypeLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { hdCrossAngleLabel } from "@/lib/human-design/normalize/hdDisplayLabels";

export const HD_CHART_LOGO_SRC = "/assets/yasam-sistemi-chart-logo.png";

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
      <dt className="text-[9px] font-black uppercase leading-tight tracking-wide text-indigo-500 lg:shrink-0 lg:whitespace-nowrap hdwide:whitespace-normal hdwide:text-[clamp(9px,1vh,11px)]">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-[13px] font-bold leading-snug text-slate-900 lg:text-[12px] hdwide:text-[clamp(13px,1.4vh,15px)]">
        {text}
      </dd>
      {sub ? <dd className={`m-0 min-w-0 break-words text-[10px] font-semibold leading-tight text-slate-500 hdwide:text-[clamp(10px,1.05vh,12px)] ${subInStrip ? "" : "lg:hidden hdwide:block"}`}>{sub}</dd> : null}
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

/** Yaşam Sistemi logosu (şeffaf PNG; logo alan adını içerir → ayrıca metin yazılmaz). BodyGraph'ın DIŞINDA,
 *  bilgi alanının altında marka imzası. Geniş kolonda boyut ekran yüksekliğine bağlı (20vh, 144–216px) →
 *  kısa ekranda iç kaydırma oluşmaz, büyük ekranda logodaki alan adı okunur kalır. */
function Brand() {
  return (
    <div
      className="flex justify-center border-t border-indigo-100 pt-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:items-center lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0 hdwide:border-l-0 hdwide:border-t hdwide:pl-0 hdwide:pt-3"
      data-hd-brand
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- statik, küçük, şeffaf marka görseli */}
      <img
        src={HD_CHART_LOGO_SRC}
        alt="Yaşam Sistemi — yasamsistemi.com"
        width={520}
        height={390}
        className="block h-auto w-[160px] max-w-full select-none lg:w-[100px] hdwide:w-[clamp(144px,20vh,216px)]"
        draggable={false}
      />
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
  const cross = result.incarnationCross;
  const [pSun, pEarth, dSun, dEarth] = cross.gates;
  const showRaw = (raw: string | undefined, label: string) => (raw && raw !== label ? raw : null);
  const typeLabel = hdTypeLabelFromCode(codes.type_code);
  const authorityLabel = hdAuthorityLabelFromCode(codes.authority_code);
  const profileLabel = hdProfileLabelFromCode(codes.profile_code);
  const definitionLabel = hdDefinitionLabelFromCode(codes.definition_code);
  const crossGates = `${pSun}/${pEarth} | ${dSun}/${dEarth}`;

  return (
    <section
      aria-label="Danışan ve harita bilgileri"
      data-hd-info
      className="rounded-2xl border border-indigo-200/70 bg-white p-3 shadow-sm lg:flex-none lg:px-4 lg:py-2 hdwide:flex hdwide:w-[252px] hdwide:shrink-0 hdwide:flex-col hdwide:rounded-none hdwide:border-0 hdwide:border-r hdwide:border-indigo-100 hdwide:bg-transparent hdwide:py-4 hdwide:pl-5 hdwide:pr-4 hdwide:shadow-none"
    >
      <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-4 lg:gap-y-1 lg:space-y-0 hdwide:flex hdwide:flex-1 hdwide:flex-col hdwide:gap-4 hdwide:space-y-0">
        {subject ? (
          <div className="lg:flex lg:items-start hdwide:block" data-hd-info-group="subject">
            <GroupTitle>Danışan</GroupTitle>
            <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-1.5 min-[420px]:grid-cols-2 lg:flex lg:min-w-0 lg:flex-1 lg:flex-wrap lg:gap-x-4 lg:gap-y-0.5 hdwide:grid hdwide:grid-cols-1 hdwide:gap-y-[clamp(6px,1vh,12px)]">
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
          <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-1.5 min-[420px]:grid-cols-2 lg:flex lg:min-w-0 lg:flex-1 lg:flex-wrap lg:gap-x-4 lg:gap-y-0.5 hdwide:grid hdwide:grid-cols-1 hdwide:gap-y-[clamp(6px,1vh,12px)]">
            <Item field="type" label="Tip" value={typeLabel} source={showRaw(result.type, typeLabel)} />
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
          </dl>
        </div>

        <Brand />
      </div>
    </section>
  );
}
