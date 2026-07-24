"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { HarfYankilanisiSegment, NumerolojiResult } from "@/lib/numeroloji";
import { ELEMENT_ORDER, type ElementName } from "@/lib/numeroloji";
import {
  getKnowledgeNotesForAnalysis,
  type KnowledgeNote,
  type KnowledgeNotesForAnalysis,
} from "../bilgi-bankasi/helpers/knowledgeLookup";
import { noteHeading, resolveNoteSectionsForView } from "../bilgi-bankasi/helpers/noteLogic";
import {
  getStoneAssignmentsForAnalysis,
  type StoneAssignmentForAnalysis,
} from "../bilgi-bankasi/helpers/stoneLookup";

const STONE_TYPE_CAKRA = "cakra-omurga";
const STONE_TYPE_ELEMENT = "element";

// "Taş Notlarım" sekmesinde gösterilecek tüm taş bölümleri (Doğaltaş Ata türleriyle bire bir).
const STONE_SECTION_ORDER: { key: string; title: string }[] = [
  { key: "ana-kulvar", title: "Ana Kulvar Taş Destekleri" },
  { key: "yan-kulvar", title: "Yan Kulvar Taş Destekleri" },
  { key: "ifade-sayisi", title: "İfade Sayısı Taş Destekleri" },
  { key: "hayat-yolu", title: "Hayat Yolu Taş Destekleri" },
  { key: STONE_TYPE_CAKRA, title: "Çakra Omurgası Taş Destekleri" },
  { key: STONE_TYPE_ELEMENT, title: "Element Taş Destekleri" },
];
import {
  buildPlainAnalizFull,
  harfSegmentsToText,
  nrDisplay,
  elementShort,
  pinOneLine,
  type NumerolojiMotorOut,
} from "../utils/numerolojiPlainMetin";
import { useContentTypography } from "./numerolojiContentTypography";

const OZET_VERI_YOK = "Bu bölüm için veri üretilemedi.";

function OzetRow({ label, value }: { label: string; value: string }) {
  const typo = useContentTypography();
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-slate-100/90 py-2 last:border-b-0 sm:grid-cols-[minmax(8rem,10rem)_1fr] sm:items-baseline sm:gap-3">
      <div className={`${typo.label} text-slate-500`}>{label}</div>
      <div className={`${typo.body} font-semibold text-slate-900`}>{value}</div>
    </div>
  );
}

function OzetSectionCard({ title, children }: { title: string; children: ReactNode }) {
  const typo = useContentTypography();
  return (
    <div className={`min-w-0 border border-violet-200/70 bg-white/85 shadow-[0_0_10px_rgba(139,92,246,0.06)] ${typo.boxPadding}`}>
      <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">{title}</h3>
      <div className="mt-1.5 w-full min-w-0">{children}</div>
    </div>
  );
}

function OzetMetinPre({ text }: { text: string | undefined | null }) {
  const typo = useContentTypography();
  const metin = (text || "").trim();
  if (!metin) return <p className={`${typo.body} text-slate-600`}>{OZET_VERI_YOK}</p>;
  return <pre className={`whitespace-pre-wrap ${typo.pre} text-slate-800`}>{text}</pre>;
}

const CAKRA_TABLO_SIRA: readonly number[] = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const CHAKRA_TABLO_HEX: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#f59e0b",
  4: "#84cc16",
  5: "#10b981",
  6: "#14b8a6",
  7: "#0ea5e9",
  8: "#6366f1",
  9: "#8b5cf6",
  10: "#d946ef",
};

function CakraBosCizgi({ align }: { align: "left" | "right" }) {
  return (
    <span
      className={`block h-1 min-w-12 w-full max-w-24 shrink-0 rounded-full bg-black/25 ${align === "left" ? "ml-auto" : "mr-auto"}`}
      aria-hidden
    />
  );
}

function CakraEnerjiDaireleri({
  count,
  hex,
  tone,
  align,
}: {
  count: number;
  hex: string;
  tone: "pasif" | "aktif";
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex min-h-[1.25rem] min-w-0 flex-1 flex-wrap content-center gap-1.5 ${align === "left" ? "justify-end" : "justify-start"}`}
    >
      {count === 0 ? (
        <CakraBosCizgi align={align} />
      ) : (
        Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/90"
            style={{
              backgroundColor: hex,
              opacity: tone === "pasif" ? 0.48 : 1,
              filter: tone === "aktif" ? "brightness(0.65) saturate(1.25)" : "saturate(0.85) brightness(1.08)",
              boxShadow: tone === "aktif" ? `0 2px 6px ${hex}77` : `0 1px 3px ${hex}33`,
            }}
          />
        ))
      )}
    </div>
  );
}

export function CakraOmurgasiTablo({ out }: { out: NumerolojiMotorOut }) {
  return (
    <section className="col-span-full min-w-0 w-full rounded-[14px] border border-violet-200/70 bg-white/85 p-3 shadow-[0_0_12px_rgba(139,92,246,0.06)]">
      <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Çakra Sütunu & Çakra Omurgası</h3>
      <div className="mt-2 space-y-0.5">
        {CAKRA_TABLO_SIRA.map((cNo) => {
          const sol = out.cakraOmurgasi.sayilar[cNo] ?? 0;
          const sag = out.cakraOmurgasi.harfler[cNo] ?? 0;
          const hex = CHAKRA_TABLO_HEX[cNo] ?? "#8b5cf6";
          return (
            <div
              key={cNo}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-violet-100/60 bg-white/65 px-2 py-1.5 shadow-sm ring-1 ring-white/80 transition-colors hover:bg-violet-50/30"
            >
              <CakraEnerjiDaireleri count={sol} hex={hex} tone="pasif" align="left" />
              <span className="shrink-0 px-1 text-center text-[10px] font-black tracking-wide text-slate-700">
                {cNo}. Çakra
              </span>
              <CakraEnerjiDaireleri count={sag > 0 ? sag : 0} hex={hex} tone="aktif" align="right" />
            </div>
          );
        })}
      </div>
    </section>
  );
}

const HARF_KART_TINT: Record<number, string> = {
  1: "border-rose-200/70 bg-gradient-to-b from-rose-50/95 to-rose-100/70 hover:from-rose-100 hover:to-rose-50/90 hover:shadow-rose-200/50",
  2: "border-orange-200/70 bg-gradient-to-b from-orange-50/95 to-orange-100/70 hover:from-orange-100 hover:to-orange-50/90 hover:shadow-orange-200/50",
  3: "border-amber-200/70 bg-gradient-to-b from-amber-50/95 to-amber-100/70 hover:from-amber-100 hover:to-amber-50/90 hover:shadow-amber-200/50",
  4: "border-lime-200/70 bg-gradient-to-b from-lime-50/95 to-lime-100/70 hover:from-lime-100 hover:to-lime-50/90 hover:shadow-lime-200/50",
  5: "border-emerald-200/70 bg-gradient-to-b from-emerald-50/95 to-emerald-100/70 hover:from-emerald-100 hover:to-emerald-50/90 hover:shadow-emerald-200/50",
  6: "border-teal-200/70 bg-gradient-to-b from-teal-50/95 to-teal-100/70 hover:from-teal-100 hover:to-teal-50/90 hover:shadow-teal-200/50",
  7: "border-sky-200/70 bg-gradient-to-b from-sky-50/95 to-sky-100/70 hover:from-sky-100 hover:to-sky-50/90 hover:shadow-sky-200/50",
  8: "border-indigo-200/70 bg-gradient-to-b from-indigo-50/95 to-indigo-100/70 hover:from-indigo-100 hover:to-indigo-50/90 hover:shadow-indigo-200/50",
  9: "border-violet-200/70 bg-gradient-to-b from-violet-50/95 to-violet-100/70 hover:from-violet-100 hover:to-violet-50/90 hover:shadow-violet-200/50",
};

function harfYasMetni(ageStart: number, ageEnd: number): string {
  return ageStart === ageEnd ? `${ageStart} yaş` : `${ageStart}–${ageEnd} yaş`;
}

function harfYilMetni(yearStart?: number, yearEnd?: number): string | null {
  if (yearStart === undefined || yearEnd === undefined) return null;
  return yearStart === yearEnd ? `${yearStart}` : `${yearStart}–${yearEnd}`;
}

function harfDonemAktif(seg: HarfYankilanisiSegment): boolean {
  const yil = new Date().getFullYear();
  if (seg.yearStart !== undefined && seg.yearEnd !== undefined) {
    return seg.yearStart <= yil && yil <= seg.yearEnd;
  }
  return false;
}

function HarflerBuyukPanel({ segments }: { segments: HarfYankilanisiSegment[] }) {
  return (
    <section className="col-span-full min-w-0 w-full rounded-[14px] border border-amber-300/35 bg-white/80 p-3 shadow-[0_0_12px_rgba(245,158,11,0.07)] backdrop-blur-xl">
      <h3 className="text-xs font-black uppercase tracking-wider text-violet-600">Harflerin Yankılanışı</h3>
      <div className="mt-2 grid w-full min-w-0 grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5">
        {segments.length === 0 ? (
          <p className="col-span-full py-3 text-center text-xs font-medium text-slate-600">
            Harf dönemi hesaplanamadı.
          </p>
        ) : (
          segments.map((seg, idx) => {
            const tint = HARF_KART_TINT[seg.chakra] ?? HARF_KART_TINT[9];
            const aktif = harfDonemAktif(seg);
            const yilMetin = harfYilMetni(seg.yearStart, seg.yearEnd);
            return (
              <div
                key={`${idx}-${seg.letter}-${seg.ageStart}`}
                className={`relative flex min-h-[60px] flex-col items-center justify-center rounded-lg border p-1.5 text-center shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${tint} ${aktif ? "ring-2 ring-violet-500/45" : ""}`}
              >
                {aktif ? (
                  <span className="absolute -top-1.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-1.5 py-px text-center text-[8px] font-black tracking-wide text-white shadow-sm">
                    Aktif
                  </span>
                ) : null}
                <span className="w-full text-lg font-black leading-none text-slate-900">{seg.letter}</span>
                <span className="mt-0.5 w-full text-sm font-black tabular-nums text-violet-700">{seg.chakra}</span>
                <span className="mt-0.5 w-full whitespace-nowrap text-[9px] font-medium leading-3 text-slate-600">
                  {harfYasMetni(seg.ageStart, seg.ageEnd)}
                </span>
                {yilMetin ? (
                  <span className="mt-0.5 w-full whitespace-nowrap text-[9px] font-medium leading-3 tabular-nums text-slate-500">
                    {yilMetin}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

const ELEMENT_BAR: Record<ElementName, string> = {
  Hava: "bg-sky-400",
  Su: "bg-blue-500",
  Ateş: "bg-orange-500",
  Toprak: "bg-amber-600",
};

function OzetPremiumKart({
  title,
  value,
  icon,
  tint,
  gold = false,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  tint: string;
  gold?: boolean;
}) {
  return (
    <div
      className={`relative min-w-0 overflow-hidden rounded-[12px] border p-3 shadow-[0_0_10px_rgba(139,92,246,0.06)] transition-all duration-200 hover:-translate-y-0.5 ${
        gold
          ? "border-amber-300/80 ring-1 ring-amber-200/60 shadow-[0_4px_18px_-6px_rgba(217,119,6,0.28)]"
          : "border-violet-200/70"
      } ${tint}`}
    >
      <div
        className={`pointer-events-none absolute -right-3 -top-3 h-10 w-10 rounded-full blur-lg ${gold ? "bg-amber-400/15" : "bg-violet-400/8"}`}
        aria-hidden
      />
      <div className="relative flex min-w-0 items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p className={`text-[9px] font-black uppercase tracking-wider ${gold ? "text-amber-700/90" : "text-slate-500"}`}>{title}</p>
          <p className={`mt-0.5 w-full whitespace-normal break-words text-2xl font-black leading-tight ${gold ? "text-amber-700" : "text-slate-950"}`}>
            {value}
          </p>
        </div>
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] shadow-sm ring-1 ${
            gold ? "bg-amber-50 text-amber-600 ring-amber-200/70" : "bg-white/80 text-violet-600 ring-violet-100/60"
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function TabSonucOzetiPremium({
  out,
  isimGoster,
  dogumGoster,
}: {
  out: NumerolojiMotorOut;
  isimGoster: string;
  dogumGoster: string;
  firstName?: string;
  lastName?: string;
}) {
  const typo = useContentTypography();
  const el = out.elementler.counts;
  const elMax = Math.max(...ELEMENT_ORDER.map((n) => el[n]), 1);

  const ustKartlar = [
    { title: "Ana Kulvar", value: nrDisplay(out.anaKulvar), tint: "bg-gradient-to-br from-violet-50/80 to-white/90", icon: "♔", gold: false },
    { title: "Yan Kulvar", value: nrDisplay(out.yanKulvar), tint: "bg-gradient-to-br from-indigo-50/80 to-white/90", icon: "⚖", gold: false },
    { title: "İfade Sayısı", value: nrDisplay(out.ifadeSayisi), tint: "bg-gradient-to-br from-fuchsia-50/80 to-white/90", icon: "✦", gold: false },
    { title: "Hayat Yolu / DM", value: nrDisplay(out.hayatYolu), tint: "bg-gradient-to-br from-amber-50/90 to-white/90", icon: "☤", gold: true },
  ];

  return (
    <div className="space-y-3">
      <div className="relative min-w-0 overflow-hidden rounded-[14px] border border-violet-200/60 bg-gradient-to-br from-white/90 via-violet-50/40 to-amber-50/30 px-4 py-3 shadow-[0_0_12px_rgba(139,92,246,0.07)]">
        <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-violet-200/14 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute right-4 top-3 opacity-[0.10]" aria-hidden>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-violet-700">
            <path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.5L12 15.3 6.4 19.3l2.1-6.5L3 8.8h6.8L12 2z" stroke="currentColor" strokeWidth="0.5" fill="currentColor" fillOpacity="0.2" />
          </svg>
        </div>
        <div className="relative max-w-[calc(100%-3rem)]">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-violet-500">Numerolojik sonuç özeti</p>
          <p className="mt-1 text-xl font-black text-slate-950">{isimGoster}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-500">Doğum: {dogumGoster}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {ustKartlar.map((k) => (
          <OzetPremiumKart key={k.title} title={k.title} value={k.value} tint={k.tint} gold={k.gold} icon={<span className="text-sm">{k.icon}</span>} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <HarflerBuyukPanel segments={Array.isArray(out.harflerinYankilanisi) ? out.harflerinYankilanisi : []} />

        <section className={`min-w-0 w-full rounded-[14px] border border-violet-200/70 bg-white/85 shadow-[0_0_10px_rgba(139,92,246,0.06)] ${typo.boxPadding}`}>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Elementler</h3>
          <div className="mt-2 w-full min-w-0 space-y-2">
            {ELEMENT_ORDER.map((name) => (
              <div key={name} className="min-w-0 w-full">
                <div className="mb-1 flex w-full min-w-0 justify-between gap-3 text-xs font-black tracking-wide text-slate-700">
                  <span className="min-w-0">{name}</span>
                  <span>{el[name]}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${ELEMENT_BAR[name]} transition-all`}
                    style={{ width: `${Math.max(8, (el[name] / elMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <CakraOmurgasiTablo out={out} />
      </div>
    </div>
  );
}

export function TabSonucOzeti({
  out,
  isimGoster,
  dogumGoster,
  firstName,
  lastName,
  layout = "default",
}: {
  out: NumerolojiMotorOut;
  isimGoster: string;
  dogumGoster: string;
  firstName?: string;
  lastName?: string;
  layout?: "default" | "detay" | "premium";
}) {
  if (layout === "premium") {
    return (
      <TabSonucOzetiPremium
        out={out}
        isimGoster={isimGoster}
        dogumGoster={dogumGoster}
        firstName={firstName ?? ""}
        lastName={lastName ?? ""}
      />
    );
  }

  const pinMetin = (out.pinKoduMetni || "—").trim() || "—";
  const elementMetinKisa = (out.elementlerMetni || "").trim().split("\n").slice(0, 3).join("\n") || "—";

  const zirveStr = out.zirveYillariMetni?.trim() ?? "";
  const zirveObj = out.zirveYillari;
  const zirveHasArray = Boolean(zirveObj?.peaks?.length);

  const mucadeleStr = out.mucadeleYillariMetni?.trim() ?? "";
  const mucadeleObj = out.mucadeleYillari;
  const mucadeleHasArray = Boolean(mucadeleObj?.method1?.length);

  const hy = out.harflerinYankilanisi;
  const harfStr = out.harflerinYankilanisiMetni?.trim() ?? "";
  const harfIsArray = Array.isArray(hy);
  const harfHasSegments = harfIsArray && hy.length > 0;
  const typo = useContentTypography();

  return (
    <div className="space-y-3">
      <div className={`rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/95 via-white to-amber-50/25 shadow-sm ring-1 ring-violet-100/50 ${typo.boxPadding}`}>
        <p className={`${typo.sectionTitle} text-violet-700/90`}>Numerolojik sonuç özeti</p>
        <p className={`mt-2 ${typo.body} font-bold tracking-tight text-slate-900`}>{isimGoster}</p>
        <p className={`mt-1 ${typo.caption} text-slate-600`}>Doğum tarihi: {dogumGoster}</p>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-1 px-4 shadow-sm ring-1 ring-slate-100/80 sm:px-5">
        <OzetRow label="Ana Kulvar" value={nrDisplay(out.anaKulvar)} />
        <OzetRow label="Yan Kulvar" value={nrDisplay(out.yanKulvar)} />
        <OzetRow label="İfade Sayısı" value={nrDisplay(out.ifadeSayisi)} />
        <OzetRow label="Hayat Yolu / DM" value={nrDisplay(out.hayatYolu)} />
      </div>

      <div className={`rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white shadow-sm ring-1 ring-sky-100/50 ${typo.boxPadding}`}>
        <p className={`${typo.sectionTitle} text-sky-800/90`}>PIN Kodu</p>
        <p className={`mt-2 break-all ${typo.pre} font-semibold text-slate-800`}>{pinOneLine(out.pinKodu)}</p>
        <pre
          className={
            layout === "detay"
              ? `mt-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-white/80 p-3 ${typo.pre} text-slate-700`
              : `mt-3 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-white/80 p-3 ${typo.pre} text-slate-700`
          }
        >
          {pinMetin}
        </pre>
      </div>

      <div className={`rounded-2xl border border-slate-200/90 bg-white/90 shadow-sm ring-1 ring-amber-100/60 ${typo.boxPadding}`}>
        <p className={`${typo.sectionTitle} text-amber-900/85`}>Elementler (kısa)</p>
        <p className={`mt-2 ${typo.body} font-semibold text-slate-900`}>{elementShort(out.elementler)}</p>
        <pre className={`mt-2 line-clamp-4 whitespace-pre-wrap ${typo.pre} text-slate-600`}>{elementMetinKisa}</pre>
      </div>

      <OzetSectionCard title="Çakra Omurgası Özeti"><OzetMetinPre text={out.cakraOmurgasiMetni} /></OzetSectionCard>
      <OzetSectionCard title="Değişim-Dönüşüm Yılları Özeti"><OzetMetinPre text={out.degisimDonusumMetni} /></OzetSectionCard>

      <OzetSectionCard title="Zirve Yılları Özeti">
        {zirveStr ? (
          <OzetMetinPre text={out.zirveYillariMetni} />
        ) : zirveHasArray && zirveObj ? (
          <ul className={`space-y-2 ${typo.body} font-medium text-slate-800`}>
            {zirveObj.peaks.map((p) => (
              <li key={p.index} className="border-b border-slate-100/80 pb-1.5 last:border-b-0 last:pb-0">
                {p.index}. zirve — yaş {p.age}, konu {p.topic}
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${typo.body} text-slate-600`}>{OZET_VERI_YOK}</p>
        )}
      </OzetSectionCard>

      <OzetSectionCard title="Mücadele Yılları Özeti">
        {mucadeleStr ? (
          <OzetMetinPre text={out.mucadeleYillariMetni} />
        ) : mucadeleHasArray && mucadeleObj ? (
          <ul className={`space-y-2 ${typo.body} font-medium text-slate-800`}>
            {mucadeleObj.method1.map((m) => (
              <li key={m.index} className="border-b border-slate-100/80 pb-1.5 last:border-b-0 last:pb-0">
                {m.index}. mücadele — yaş {m.age}, konu {m.topic}
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${typo.body} text-slate-600`}>{OZET_VERI_YOK}</p>
        )}
      </OzetSectionCard>

      <OzetSectionCard title="Harflerin Yankılanışı Özeti">
        {harfHasSegments ? (
          <ul className={`space-y-2 ${typo.body} font-medium text-slate-800`}>
            {hy.map((seg, idx) => {
              const y =
                seg.yearStart != null
                  ? ` · yıl ${seg.yearStart}${seg.yearEnd != null ? `–${seg.yearEnd}` : ""}`
                  : "";
              return (
                <li key={`${seg.letter}-${idx}`} className="border-b border-slate-100/80 pb-1.5 last:border-b-0 last:pb-0">
                  {idx + 1}. {seg.letter} — çakra {seg.chakra} — yaş {seg.ageStart}–{seg.ageEnd}
                  {y}
                </li>
              );
            })}
          </ul>
        ) : null}
        {harfStr ? (
          <div className={harfHasSegments ? "mt-3 border-t border-slate-100 pt-3" : ""}><OzetMetinPre text={out.harflerinYankilanisiMetni} /></div>
        ) : null}
        {!harfHasSegments && !harfStr ? <p className={`${typo.body} text-slate-600`}>{OZET_VERI_YOK}</p> : null}
      </OzetSectionCard>
    </div>
  );
}

function DetayCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[12px] border border-violet-200/70 bg-white/85 p-3 shadow-[0_0_10px_rgba(139,92,246,0.06)]">
      <h3 className="border-b border-violet-100/60 pb-1.5 text-xs font-black uppercase tracking-wider text-slate-500">{title}</h3>
      <div className="w-full min-w-0 pt-2">{children}</div>
    </section>
  );
}

function TasDestekItem({ item }: { item: StoneAssignmentForAnalysis }) {
  const typo = useContentTypography();
  return (
    <div className="border-t border-emerald-100/90 pt-3 first:border-t-0 first:pt-0">
      <p className={`${typo.body} font-bold text-emerald-950`}>{item.value}</p>
      {item.reason ? (
        <p className={`mt-2 ${typo.body} text-slate-800`}>
          <span className="font-bold text-slate-700">Öneri:</span> {item.reason}
        </p>
      ) : null}
      {item.stones.length ? (
        <p className={`mt-2 ${typo.body} text-slate-800`}>
          <span className="font-bold text-slate-700">Taşlar:</span> {item.stones.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function TasDestekSectionBlock({
  title,
  items,
}: {
  title: string;
  items: StoneAssignmentForAnalysis[];
}) {
  const typo = useContentTypography();
  if (!items.length) return null;

  return (
    <div
      className={`mt-4 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white/95 ring-1 ring-emerald-100/70 ${typo.infoBoxPadding}`}
    >
      <p className={`${typo.sectionTitle} text-emerald-900/95`}>{title}</p>
      <div className="mt-3 space-y-4">
        {items.map((item) => (
          <TasDestekItem key={`${item.typeKey}:${item.value}`} item={item} />
        ))}
      </div>
    </div>
  );
}

// NKB-V2-H: content_sections canonical yorum kaynağı; her not için "Ana Kulvar — 19" başlığı +
// yalnız DOLU bölümler (Genel Açıklama/Yapıcı/Olumsuz/Yıkıcı). Kulvar dışı türlerde legacy
// description (etiketsiz). "Kaynak:" satırı KALDIRILDI (danışan gizlilik sınırı).
function BilgiBankasiYorumBlock({ notes }: { notes: KnowledgeNote[] }) {
  const typo = useContentTypography();
  if (!notes.length) return null;

  const kartlar = notes
    .map((note) => ({ note, sections: resolveNoteSectionsForView(note) }))
    .filter((x) => x.sections.length > 0);
  if (!kartlar.length) return null;

  return (
    <div
      className={`mt-4 rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white/95 ring-1 ring-violet-100/70 ${typo.infoBoxPadding}`}
    >
      <p className={`${typo.sectionTitle} text-violet-800/95`}>Bilgi Bankası Yorumu</p>
      <div className="mt-3 space-y-3">
        {kartlar.map(({ note, sections }) => (
          <div key={note.id} className="rounded-xl border border-violet-100 bg-white/85 p-3 shadow-sm ring-1 ring-violet-100/60">
            <p className={`${typo.body} font-black text-violet-900`}>{noteHeading(note.analysisType, note.value)}</p>
            <div className="mt-2 space-y-2.5">
              {sections.map((s, i) => (
                <div key={`${note.id}:${i}`}>
                  {s.label ? (
                    <p className={`${typo.caption} font-bold uppercase tracking-wide text-violet-700/90`}>{s.label}</p>
                  ) : null}
                  <p className={`${s.label ? "mt-1 " : ""}whitespace-pre-wrap ${typo.body} text-slate-800`}>{s.body.trim()}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NumeroCardBody({
  r,
  knowledgeNotes,
}: {
  r: NumerolojiResult;
  knowledgeNotes?: KnowledgeNote[];
}) {
  const k = (r.key || "").trim();
  const typo = useContentTypography();
  const stepsPre = `mt-2 whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2 ${typo.pre} text-slate-700`;
  return (
    <div className="space-y-1.5">
      <p className="text-3xl font-black text-violet-900">{nrDisplay(r)}</p>
      {k ? <p className={`${typo.caption} font-semibold uppercase tracking-wide text-slate-500`}>Anahtar: {k}</p> : null}
      {/* NKB-V2-H: iç scroll kaldırıldı → hesap dökümü normal document-scroll ile akar. */}
      {r.steps?.length ? (
        <pre className={stepsPre}>
          {r.steps.join("\n")}
        </pre>
      ) : null}
      {knowledgeNotes?.length ? <BilgiBankasiYorumBlock notes={knowledgeNotes} /> : null}
    </div>
  );
}

export function TabPlainAnaliz({ out }: { out: NumerolojiMotorOut }) {
  const raw = buildPlainAnalizFull(out);
  const blocks = raw
    .split(/\n——————————\n/)
    .map((chunk) => {
      const trimmed = chunk.replace(/^\n+|\n+$/g, "");
      const nl = trimmed.indexOf("\n");
      if (nl === -1) return { title: trimmed, body: "" };
      return { title: trimmed.slice(0, nl), body: trimmed.slice(nl + 1).trim() };
    })
    .filter((b) => b.title);

  return (
    <>
    <p className="mb-2 rounded-lg border border-violet-100 bg-violet-50/70 px-3 py-1.5 text-[11px] font-medium text-violet-800">
      💡 Bilgi bankası yorumlarınız ve doğaltaş önerileriniz <span className="font-black">Sayısal Hesaplama</span> sekmesinde her sayının altında görünür.
    </p>
    <div className="overflow-hidden rounded-[12px] border border-violet-200/70 bg-white/90 shadow-[0_0_12px_rgba(139,92,246,0.06)]">
      {blocks.map((blok, i) => (
        <div
          key={i}
          className={`grid grid-cols-[6rem_1fr] items-start gap-2 px-3 py-2 sm:grid-cols-[9rem_1fr]${i > 0 ? " border-t border-violet-100/60" : ""}`}
        >
          <p className="shrink-0 pt-0.5 text-[9px] font-black uppercase leading-tight tracking-wider text-slate-400">
            {blok.title}
          </p>
          {i < 4 ? (
            <p className="whitespace-normal break-words text-xl font-black leading-tight text-violet-700">{blok.body || "—"}</p>
          ) : (
            <pre className="min-w-0 whitespace-pre-wrap rounded-md bg-slate-50/80 px-2 py-1 font-mono text-[11px] leading-[1.45] text-slate-700">
              {blok.body || "—"}
            </pre>
          )}
        </div>
      ))}
    </div>
    </>
  );
}

export function TabTasAtamalari({ out }: { out: NumerolojiMotorOut }) {
  const [stoneAssignments, setStoneAssignments] = useState<StoneAssignmentForAnalysis[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void getStoneAssignmentsForAnalysis(out).then((items) => {
      if (!cancelled) {
        setStoneAssignments(items);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [out]);

  // Taş atamaları TÜM analiz türlerini kapsar (Doğaltaş Ata formundaki dropdown ile bire bir).
  const stoneSections = STONE_SECTION_ORDER.map((sec) => ({
    ...sec,
    items: stoneAssignments.filter((s) => s.typeKey === sec.key),
  })).filter((sec) => sec.items.length > 0);

  if (!stoneAssignments.length) {
    if (!loaded) {
      return (
        <div className="py-12 text-center text-sm font-medium text-slate-400">Taş notlarınız yükleniyor…</div>
      );
    }
    return (
      <div className="rounded-2xl border border-dashed border-violet-300/70 bg-gradient-to-br from-violet-50/55 via-white to-amber-50/40 px-6 py-12 text-center shadow-sm ring-1 ring-violet-100/55">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/60 bg-gradient-to-br from-violet-100/70 to-amber-50/80 text-2xl text-violet-700 shadow-inner" aria-hidden>
          ◈
        </div>
        <h3 className="mt-4 text-base font-black text-violet-950">Bu analiz için henüz taş notunuz yok</h3>
        <p className="mx-auto mt-1.5 max-w-md text-sm font-medium leading-relaxed text-slate-600">
          Taş önerileriniz kendi sisteminize aittir. Sayı ve değerlere kendi taş notlarınızı tanımladığınızda
          bu sayfada otomatik olarak görünür.
        </p>
        <Link
          href="/numeroloji/bilgi-bankasi"
          className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300/70 bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white no-underline shadow-[0_8px_22px_-8px_rgba(91,33,182,0.45)] ring-1 ring-amber-300/30 transition hover:brightness-110"
        >
          Bilgi Bankası › Doğaltaş Ata
          <span aria-hidden>→</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {stoneSections.map((sec) => (
        <TasDestekSectionBlock key={sec.key} title={sec.title} items={sec.items} />
      ))}
    </div>
  );
}

export function TabAnalizOzetli({ out, layout = "default" }: { out: NumerolojiMotorOut; layout?: "default" | "detay" }) {
  const [knowledgeNotes, setKnowledgeNotes] = useState<KnowledgeNotesForAnalysis | null>(null);
  const [stoneAssignments, setStoneAssignments] = useState<StoneAssignmentForAnalysis[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getKnowledgeNotesForAnalysis(out).then((notes) => {
      if (!cancelled) setKnowledgeNotes(notes);
    });
    void getStoneAssignmentsForAnalysis(out).then((items) => {
      if (!cancelled) setStoneAssignments(items);
    });
    return () => {
      cancelled = true;
    };
  }, [out]);

  const cakraStoneItems = stoneAssignments.filter((s) => s.typeKey === STONE_TYPE_CAKRA);
  const elementStoneItems = stoneAssignments.filter((s) => s.typeKey === STONE_TYPE_ELEMENT);

  const hy = out.harflerinYankilanisi;
  const harfListe = Array.isArray(hy) && hy.length ? harfSegmentsToText(hy) : "";
  const harfMetin = out.harflerinYankilanisiMetni?.trim() ?? "";
  const typo = useContentTypography();
  const preScroll =
    layout === "detay"
      ? `whitespace-pre-wrap ${typo.pre} text-slate-800`
      : `max-h-[min(55vh,28rem)] overflow-y-auto whitespace-pre-wrap ${typo.pre} text-slate-800`;
  const preScrollSm =
    layout === "detay"
      ? `mt-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/50 p-3 ${typo.pre} text-slate-800`
      : `mt-3 max-h-[min(55vh,28rem)] overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/50 p-3 ${typo.pre} text-slate-800`;
  const preSteps =
    layout === "detay"
      ? `mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 ${typo.pre} text-slate-700`
      : `mt-3 max-h-[min(40vh,20rem)] overflow-y-auto whitespace-pre-wrap border-t border-slate-100 pt-3 ${typo.pre} text-slate-700`;
  const harfPre =
    layout === "detay"
      ? `mb-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/40 p-3 ${typo.pre} text-slate-800`
      : `mb-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/40 p-3 ${typo.pre} text-slate-800`;
  return (
    <div className="flex flex-col gap-2 sm:gap-3">
      <DetayCard title="Ana Kulvar">
        <NumeroCardBody
          r={out.anaKulvar}
          knowledgeNotes={knowledgeNotes?.anaKulvar}
        />
      </DetayCard>
      <DetayCard title="Yan Kulvar">
        <NumeroCardBody
          r={out.yanKulvar}
          knowledgeNotes={knowledgeNotes?.yanKulvar}
        />
      </DetayCard>
      <DetayCard title="İfade Sayısı">
        <NumeroCardBody
          r={out.ifadeSayisi}
          knowledgeNotes={knowledgeNotes?.ifadeSayisi}
        />
      </DetayCard>
      <DetayCard title="Hayat Yolu">
        <NumeroCardBody
          r={out.hayatYolu}
          knowledgeNotes={knowledgeNotes?.hayatYolu}
        />
      </DetayCard>
      <DetayCard title="PIN">
        <p className={`break-all ${typo.pre} font-semibold text-slate-800`}>{pinOneLine(out.pinKodu)}</p>
        <pre className={preScrollSm}>{out.pinKoduMetni || "—"}</pre>
      </DetayCard>
      <DetayCard title="Çakra">
        <pre className={preScroll}>{out.cakraOmurgasiMetni || "—"}</pre>
        {knowledgeNotes?.cakraOmurga.length ? (
          <BilgiBankasiYorumBlock notes={knowledgeNotes.cakraOmurga} />
        ) : null}
        <TasDestekSectionBlock title="Çakra Omurgası Taş Destekleri" items={cakraStoneItems} />
      </DetayCard>
      <DetayCard title="Elementler">
        <pre className={preScroll}>{out.elementlerMetni || "—"}</pre>
        {out.elementler.steps?.length ? (
          <pre className={preSteps}>{out.elementler.steps.join("\n")}</pre>
        ) : null}
        {knowledgeNotes?.element.length ? (
          <BilgiBankasiYorumBlock notes={knowledgeNotes.element} />
        ) : null}
        <TasDestekSectionBlock title="Element Taş Destekleri" items={elementStoneItems} />
      </DetayCard>
      <DetayCard title="Değişim Dönüşüm">
        <pre className={preScroll}>{out.degisimDonusumMetni || "—"}</pre>
      </DetayCard>
      <DetayCard title="Zirve">
        <pre className={preScroll}>{out.zirveYillariMetni || "—"}</pre>
      </DetayCard>
      <DetayCard title="Mücadele">
        <pre className={preScroll}>{out.mucadeleYillariMetni || "—"}</pre>
      </DetayCard>
      <DetayCard title="Harflerin Yankılanışı">
        {harfListe ? <pre className={harfPre}>{harfListe}</pre> : null}
        {harfMetin ? (
          <pre className={preScroll}>{harfMetin}</pre>
        ) : !harfListe ? (
          <p className={`${typo.body} text-slate-600`}>—</p>
        ) : null}
      </DetayCard>
    </div>
  );
}
