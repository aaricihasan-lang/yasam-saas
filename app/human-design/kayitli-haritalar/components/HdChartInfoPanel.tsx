"use client";

// Hesaplanmış Human Design haritası — profesyonel DANIŞAN + HARİTA bilgi bloğu (SAF SUNUM).
//
// Kayıtlı veriden (computed_result + kayıt satırı) render edilir; hesap / fetch / sağlayıcı çağrısı YOK.
// İLK EKRAN (owner kararı 2026-10-17, #419 görsel FAIL sonrası sadeleştirme): yalnız ÇEKİRDEK bilgiler —
// Danışan (ad, doğum tarihi/saati, yer, koordinat, yaş) + HD (Tip, Profil, Tanım, Enkarnasyon Teması, İç Otorite).
// Harita ana kahramandır; ilk ekranda ek özet kartı yoktur. Strateji / İmza / Kendilik Dışı Tema SİLİNMEZ:
// haritanın altında, Kanallar/Kapılar yanındaki "Ek Human Design Bilgileri" kutusundadır (HdChartKeynotesCard).
// Başlık ve değerler Türkçe + (İngilizce); uzun sağlayıcı açıklamaları yetkili uzmanda "Sistem Yorumu"ndadır.
// Panel sabit yükseklikte DEĞİL — içerik uzarsa kart aşağı uzar (taşma yok).
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
  hdAuthorityDisplayLabel,
  hdDefinitionLabelFromCode,
  hdProfileLabelFromCode,
  hdTypeLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { HD_TERM_BI, hdCrossAngleLabel, hdProfileBilingual } from "@/lib/human-design/normalize/hdDisplayLabels";
import { crossThemeNames } from "@/lib/human-design/reporting/crossThemeTr";

/** Yaşam Sistemi logosu (İlişki / Transit görsellerinde kullanılır). Bireysel haritanın bilgi panelinde 2026-10-25 owner
 *  kararıyla GÖSTERİLMEZ; marka imzası BodyGraph'ın altında (HdPremiumBodygraph). */
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
  const title = [source ? `Kaynak değeri: ${source}` : null, sub && !subInStrip ? sub : null].filter(Boolean).join(" · ");
  return (
    // lg şerit: "ETİKET değer" satır-içi akış (kesilme yok, sarar) · hdwide/mobil: etiket üstte, değer altta.
    <div
      className={`min-w-0 lg:flex lg:max-w-full lg:flex-wrap lg:items-baseline lg:gap-x-1.5 hdwide:block ${wide ? "col-span-full" : ""}`}
      data-hd-info-field={field}
      title={title || undefined}
    >
      <dt className="text-[9.5px] font-semibold uppercase leading-tight tracking-[0.08em] text-slate-400 lg:shrink-0 lg:whitespace-nowrap hdwide:whitespace-normal hdwide:text-[10px]">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-[13px] font-medium leading-snug text-slate-800 lg:text-[12px] hdwide:text-[clamp(13px,1.35vh,14px)]">
        {text}
      </dd>
      {sub ? <dd className={`m-0 min-w-0 break-words text-[10.5px] font-normal leading-tight text-slate-500 hdwide:text-[11px] ${subInStrip ? "" : "lg:hidden hdwide:block"}`}>{sub}</dd> : null}
    </div>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 lg:mb-0 lg:mr-4 lg:shrink-0 lg:pt-px lg:tracking-[0.1em] hdwide:mb-2 hdwide:mr-0 hdwide:tracking-[0.14em]">
      {children}
    </p>
  );
}

export type HdInfoProps = {
  result: HdComputedChart;
  codes: HdAppChartCodes;
  subject: HdChartSubjectInfo | null;
};

export function HdChartInfoPanel({ result, codes, subject }: HdInfoProps) {
  const cross = result.incarnationCross;
  const [pSun, pEarth, dSun, dEarth] = cross.gates;
  const crossGates = `${pSun}/${pEarth} | ${dSun}/${dEarth}`;
  const crossSub = `${crossGates}${cross.angle ? ` · ${hdCrossAngleLabel(cross.angle)}` : ""}`;
  const definitionLabel = hdDefinitionLabelFromCode(codes.definition_code);
  // Haç değeri: bilinen temada "Türkçe tema (İngilizce kanonik ad)"; bilinmeyende yalnız kanonik ad (uydurma yok).
  const crossTheme = cross.name ? crossThemeNames(cross.name, cross.angle ?? null) : null;
  const crossValue = cross.name ? (crossTheme?.themeKnown ? `${crossTheme.tr} (${crossTheme.en})` : cross.name) : `${hdCrossAngleLabel(cross.angle)} (yalnız kapılar)`;

  return (
    <section
      aria-label="Danışan ve harita bilgileri"
      data-hd-info
      className="rounded-2xl border border-indigo-200/70 bg-white p-3 shadow-sm lg:flex-none lg:px-4 lg:py-2 hdwide:flex hdwide:w-[272px] hdwide:shrink-0 hdwide:flex-col hdwide:rounded-none hdwide:border-0 hdwide:border-r hdwide:border-indigo-100 hdwide:bg-transparent hdwide:py-4 hdwide:pl-5 hdwide:pr-4 hdwide:shadow-none"
    >
      <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-4 lg:gap-y-1 lg:space-y-0 hdwide:flex hdwide:min-h-0 hdwide:flex-1 hdwide:flex-col hdwide:gap-4 hdwide:space-y-0">
        {subject ? (
          <div className="lg:flex lg:items-start hdwide:block" data-hd-info-group="subject">
            <GroupTitle>Danışan</GroupTitle>
            <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-1.5 min-[420px]:grid-cols-2 lg:flex lg:min-w-0 lg:flex-1 lg:flex-wrap lg:gap-x-4 lg:gap-y-0.5 hdwide:grid hdwide:grid-cols-1 hdwide:gap-y-[clamp(5px,0.8vh,9px)]">
              <Item field="name" label="Ad Soyad" value={subject.name} wide />
              {/* Doğum yerinin YEREL saati. UTC anı veride/hesapta korunur (timing.birthUtcIso); künyede ayrı satır olarak gösterilmez. */}
              <Item field="local" label="Doğum Tarihi" value={subject.localDateTime} sub={subject.zoneLabel} />
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
          <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-1.5 min-[420px]:grid-cols-2 lg:flex lg:min-w-0 lg:flex-1 lg:flex-wrap lg:gap-x-4 lg:gap-y-0.5 hdwide:grid hdwide:grid-cols-1 hdwide:gap-y-[clamp(5px,0.8vh,9px)]">
            <Item field="type" label={HD_TERM_BI.type} value={hdTypeLabelFromCode(codes.type_code)} />
            <Item field="profile" label={HD_TERM_BI.profile} value={hdProfileBilingual(codes.profile_code) ?? hdProfileLabelFromCode(codes.profile_code)} />
            <Item
              field="definition"
              label={HD_TERM_BI.definition}
              value={definitionLabel}
              source={result.definition.kind && result.definition.kind !== definitionLabel ? result.definition.kind : null}
            />
            <Item field="cross" label={HD_TERM_BI.cross} value={crossValue} sub={crossSub} source={crossSub} subInStrip={false} />
            <Item field="authority" label={HD_TERM_BI.authority} value={hdAuthorityDisplayLabel(codes.authority_code, codes.type_code)} />
          </dl>
        </div>

      </div>
    </section>
  );
}
