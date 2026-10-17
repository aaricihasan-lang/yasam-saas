"use client";

// Hesaplanmış Human Design haritası — profesyonel DANIŞAN + HARİTA bilgi bloğu (SAF SUNUM).
//
// Kayıtlı veriden (computed_result + kayıt satırı) render edilir; hesap / fetch / sağlayıcı çağrısı YOK.
// Teknik kimlik: Danışan (ad, yerel/UTC doğum, tz, yer, koordinat, yaş) + HD (Tip, Strateji, Profil, Tanım,
// Enkarnasyon Teması, İç Otorite, İmza, Kendilik Dışı Tema). Strateji/İmza/Kendilik dışı tema KISA etiketlerdir
// (uygulama sözlüğü, tipten; owner kararı 2026-10-17 — ana panelde erişilebilir). Uzun sağlayıcı açıklamaları
// (tip/otorite/tanım/aura …) BURADA YOK: yetkili uzmanda "Sistem Yorumu" sekmesindedir.
// 2026-10-17 owner: kavram başlıkları ve değerleri Türkçe + (İngilizce) — Türkçe uygulama sözlüğünden,
// İngilizce kaydın sağlayıcı KANONİK değerinden (Roxy strategy/signature/notSelf; yoksa standart HD terimi).
// "İmza (Signature)" kısa açıklaması varsayılan KAPALI; "i" düğmesiyle açılır (dar kolonda sürekli yer kaplamaz).
// Yerleşim (2026-10-17 düzeltme): panel sabit yükseklikte DEĞİL — içerik uzarsa kart aşağı uzar (taşma yok).
// Yerleşim (tek DOM, yalnız CSS):
//   • mobil (< lg): BodyGraph'ın üstünde kart; alanlar 1–2 sütun, metin kesilmez, logo en altta
//   • lg şerit: sahnenin üstünde ince şerit (Danışan | Human Design | logo)
//   • hdwide (≥1280px ve en-boy ≥ 16:10): harita kartının İÇİNDE sol kolon (ayrı kart / iç kaydırma YOK)
// Sağlayıcının ham değeri görünür metni kalabalıklaştırmaz; title (üzerine gelince) olarak verilir.

import { useId, useState, type ReactNode } from "react";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import type { HdAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import type { HdChartSubjectInfo } from "@/lib/human-design/chart/chartSubjectInfo";
import {
  hdAuthorityDisplayLabel,
  hdDefinitionLabelFromCode,
  hdProfileLabelFromCode,
  hdTypeLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { HD_SIGNATURE_HELP, HD_TERM_BI, hdCrossAngleLabel, hdProfileBilingual, hdTypeKeynotes } from "@/lib/human-design/normalize/hdDisplayLabels";
import { crossThemeNames } from "@/lib/human-design/reporting/crossThemeTr";

export const HD_CHART_LOGO_SRC = "/assets/yasam-sistemi-chart-logo.png";

function Item({
  label,
  value,
  sub,
  source,
  field,
  wide = false,
  subInStrip = true,
  help = null,
  wideMode = "show",
  helpOverlay = false,
}: {
  label: string;
  value: string | null;
  sub?: string | null;
  source?: string | null;
  field: string;
  wide?: boolean;
  /** false → alt satır lg şeritte gizlenir (bilgi title'da kalır), mobil/geniş kolonda görünür. */
  subInStrip?: boolean;
  /** Kavram açıklaması: varsayılan KAPALI; "ⓘ" düğmesiyle açılır (dar kolonda sürekli yer kaplamaz; mobilde dokunulabilir). */
  help?: { text: string; label: string } | null;
  /** Geniş masaüstünde (hdwide) gizle — o düzende alan sağdaki tamamlayıcı kartta gösterilir. */
  wideMode?: "show" | "hide";
  /** true → açıklama yerleşimi BÜYÜTMEZ: kartın (relative) sınırları içinde üstte açılır (dar sağ kart). */
  helpOverlay?: boolean;
}) {
  const text = value ?? "—";
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();
  const title = [source ? `Kaynak değeri: ${source}` : null, sub && !subInStrip ? sub : null].filter(Boolean).join(" · ");
  return (
    // lg şerit: "ETİKET değer" satır-içi akış (kesilme yok, sarar) · hdwide/mobil: etiket üstte, değer altta.
    <div
      className={`min-w-0 lg:flex lg:max-w-full lg:flex-wrap lg:items-baseline lg:gap-x-1.5 ${wideMode === "hide" ? "hdwide:hidden" : "hdwide:block"} ${wide ? "col-span-full" : ""}`}
      data-hd-info-field={field}
      title={title || undefined}
    >
      <dt className="text-[9.5px] font-semibold uppercase leading-tight tracking-[0.08em] text-slate-400 lg:shrink-0 lg:whitespace-nowrap hdwide:whitespace-normal hdwide:text-[10px]">
        {label}
        {help ? (
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            aria-expanded={helpOpen}
            aria-controls={helpId}
            aria-label={help.label}
            title={help.label}
            className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 align-[-2px] text-[9px] font-bold normal-case leading-none text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
            data-hd-signature-help-toggle
          >
            i
          </button>
        ) : null}
      </dt>
      <dd className="m-0 min-w-0 break-words text-[13px] font-medium leading-snug text-slate-800 lg:text-[12px] hdwide:text-[clamp(13px,1.35vh,14px)]">
        {text}
      </dd>
      {sub ? <dd className={`m-0 min-w-0 break-words text-[10.5px] font-normal leading-tight text-slate-500 hdwide:text-[11px] ${subInStrip ? "" : "lg:hidden hdwide:block"}`}>{sub}</dd> : null}
      {help && helpOpen ? (
        <dd
          id={helpId}
          // Katman: kartın ÜST kısmında açılır (kendi "i" düğmesini örtmez); tıklanınca kapanır.
          onClick={helpOverlay ? () => setHelpOpen(false) : undefined}
          className={
            helpOverlay
              ? "absolute inset-x-1.5 top-1.5 z-10 m-0 cursor-pointer break-words rounded-lg border border-indigo-100 bg-white px-2.5 py-2 text-[11px] font-normal leading-snug text-slate-600 shadow-lg"
              : "m-0 mt-1 min-w-0 break-words rounded-lg bg-indigo-50/70 px-2 py-1.5 text-[11px] font-normal leading-snug text-slate-600 lg:basis-full"
          }
          data-hd-signature-help
        >
          {help.text}
        </dd>
      ) : null}
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

/** Yaşam Sistemi logosu (şeffaf PNG; logo alan adını içerir → ayrıca metin yazılmaz). BodyGraph'ın DIŞINDA,
 *  bilgi alanının altında marka imzası.
 *  Geniş kolon: logo kutusu kolonun KALAN yüksekliğini alır (flex-1); görsel bu kutuya oranı korunarak
 *  sığdırılır (abs + max-h/max-w, en fazla 200×150). Önceki hata: logo ekran yüksekliğine (20vh) göre
 *  sabit boyutlanıyor, içerik sabit yükseklikli harita kartından taşınca logonun alt kısmı (Yaşam Sistemi /
 *  yasamsistemi.com) kartın dışında kalıyordu. */
function Brand() {
  return (
    <div
      className="flex justify-center border-t border-slate-200/80 pt-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:items-center lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0 hdwide:relative hdwide:block hdwide:min-h-[60px] hdwide:flex-1 hdwide:border-l-0 hdwide:border-t hdwide:pl-0 hdwide:pt-0"
      data-hd-brand
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- statik, küçük, şeffaf marka görseli */}
      <img
        src={HD_CHART_LOGO_SRC}
        alt="Yaşam Sistemi — yasamsistemi.com"
        width={520}
        height={390}
        className="block h-auto w-[160px] max-w-full select-none object-contain lg:w-[100px] hdwide:absolute hdwide:inset-x-0 hdwide:bottom-0 hdwide:top-3 hdwide:mx-auto hdwide:mb-auto hdwide:mt-0 hdwide:w-auto hdwide:max-h-[min(150px,calc(100%-0.75rem))] hdwide:max-w-[200px]"
        draggable={false}
      />
    </div>
  );
}

type HdInfoProps = {
  result: HdComputedChart;
  codes: HdAppChartCodes;
  subject: HdChartSubjectInfo | null;
};

/** Ortak görünen değerler (tek kaynak: sol panel + sağ tamamlayıcı kart aynı hesaplamayı kullanır). */
function useInfoValues({ result, codes }: Omit<HdInfoProps, "subject">) {
  const cross = result.incarnationCross;
  const [pSun, pEarth, dSun, dEarth] = cross.gates;
  const crossGates = `${pSun}/${pEarth} | ${dSun}/${dEarth}`;
  const definitionLabel = hdDefinitionLabelFromCode(codes.definition_code);
  // Haç değeri: bilinen temada "Türkçe tema (İngilizce kanonik ad)"; bilinmeyende yalnız kanonik ad (uydurma yok).
  const crossTheme = cross.name ? crossThemeNames(cross.name, cross.angle ?? null) : null;
  return {
    typeLabel: hdTypeLabelFromCode(codes.type_code),
    authorityLabel: hdAuthorityDisplayLabel(codes.authority_code, codes.type_code),
    profileLabel: hdProfileBilingual(codes.profile_code) ?? hdProfileLabelFromCode(codes.profile_code),
    definitionLabel,
    definitionSource: result.definition.kind && result.definition.kind !== definitionLabel ? result.definition.kind : null,
    crossValue: cross.name ? (crossTheme?.themeKnown ? `${crossTheme.tr} (${crossTheme.en})` : cross.name) : `${hdCrossAngleLabel(cross.angle)} (yalnız kapılar)`,
    crossSub: `${crossGates}${cross.angle ? ` · ${hdCrossAngleLabel(cross.angle)}` : ""}`,
    keynotes: hdTypeKeynotes(codes.type_code, { canonical: { strategy: result.strategy, signature: result.signature, notSelf: result.notSelf } }),
  };
}

/** Tamamlayıcı alanlar (Tanım · Enkarnasyon Teması · İmza · Kendilik Dışı Tema) — sol panelde (mobil / lg şerit)
 *  ve geniş masaüstünde sağdaki tamamlayıcı kartta AYNI bileşenle. */
function ExtraItems({ v, wide, helpOverlay = false }: { v: ReturnType<typeof useInfoValues>; wide: "show" | "hide"; helpOverlay?: boolean }) {
  return (
    <>
      <Item field="definition" label={HD_TERM_BI.definition} value={v.definitionLabel} source={v.definitionSource} wide={false} wideMode={wide} />
      <Item field="cross" label={HD_TERM_BI.cross} value={v.crossValue} sub={v.crossSub} source={v.crossSub} subInStrip={false} wideMode={wide} />
      {v.keynotes ? (
        <Item field="signature" label={HD_TERM_BI.signature} value={v.keynotes.signature} help={{ text: HD_SIGNATURE_HELP, label: `${HD_TERM_BI.signature} nedir?` }} wideMode={wide} helpOverlay={helpOverlay} />
      ) : null}
      {v.keynotes ? <Item field="notSelf" label={HD_TERM_BI.notSelf} value={v.keynotes.notSelf} wideMode={wide} /> : null}
    </>
  );
}

export function HdChartInfoPanel({ result, codes, subject }: HdInfoProps) {
  const v = useInfoValues({ result, codes });

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
            <Item field="type" label={HD_TERM_BI.type} value={v.typeLabel} />
            {v.keynotes ? <Item field="strategy" label={HD_TERM_BI.strategy} value={v.keynotes.strategy} /> : null}
            <Item field="profile" label={HD_TERM_BI.profile} value={v.profileLabel} />
            <Item field="authority" label={HD_TERM_BI.authority} value={v.authorityLabel} />
            {/* Mobil + lg şerit: tamamlayıcı alanlar burada; geniş masaüstünde sağdaki kartta (hdwide:hidden). */}
            <ExtraItems v={v} wide="hide" />
          </dl>
        </div>

        <Brand />
      </div>
    </section>
  );
}

/**
 * Geniş masaüstü (hdwide) TAMAMLAYICI BİLGİLER kartı — Personality sütununun altında (owner 2026-10-17: ilk ekran
 * dengesi). Sol panel yalnız kimlik + çekirdek HD'yi taşır → kısalır, logo ilk ekranda kalır. Mobil ve lg şeritte
 * gizli (orada aynı alanlar sol/üst paneldedir).
 */
export function HdChartInfoExtra({ result, codes }: Omit<HdInfoProps, "subject">) {
  const v = useInfoValues({ result, codes });
  return (
    <section
      aria-label="Tamamlayıcı Human Design bilgileri"
      data-hd-info-extra
      className="relative hidden rounded-xl border border-indigo-100 bg-white/90 px-3 py-2 hdwide:order-last hdwide:block"
    >
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Tamamlayıcı Bilgiler</p>
      <dl className="m-0 grid grid-cols-1 gap-y-[clamp(3px,0.6vh,8px)]">
        <ExtraItems v={v} wide="show" helpOverlay />
      </dl>
    </section>
  );
}
