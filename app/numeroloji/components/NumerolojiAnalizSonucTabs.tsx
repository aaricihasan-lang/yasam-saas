"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { HarfYankilanisiSegment, NumerolojiResult } from "@/lib/numeroloji";
import { ELEMENT_ORDER, type ElementName } from "@/lib/numeroloji";
import {
  getKnowledgeNotesForAnalysis,
  type KnowledgeNote,
  type KnowledgeNotesForAnalysis,
} from "../bilgi-bankasi/helpers/knowledgeLookup";
import {
  getStoneAssignmentsForAnalysis,
  type StoneAssignmentForAnalysis,
} from "../bilgi-bankasi/helpers/stoneLookup";

const STONE_TYPE_CAKRA = "cakra-omurga";
const STONE_TYPE_ELEMENT = "element";
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
    <div className="grid grid-cols-1 gap-1 border-b border-slate-100/90 py-3 last:border-b-0 sm:grid-cols-[minmax(9rem,12rem)_1fr] sm:items-baseline sm:gap-4">
      <div className={`${typo.label} text-slate-500`}>{label}</div>
      <div className={`${typo.body} font-semibold text-slate-900`}>{value}</div>
    </div>
  );
}

function OzetSectionCard({ title, children }: { title: string; children: ReactNode }) {
  const typo = useContentTypography();
  return (
    <div className={`min-w-0 border-[3px] border-violet-200/90 bg-white/85 shadow-[0_0_32px_rgba(139,92,246,0.10)] ${typo.boxPadding}`}>
      <h3 className="text-lg font-black tracking-wide text-slate-950">{title}</h3>
      <div className="mt-4 w-full min-w-0">{children}</div>
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
      className={`block h-1.5 min-w-20 w-full max-w-32 shrink-0 rounded-full bg-black/80 shadow-sm ${align === "left" ? "ml-auto" : "mr-auto"}`}
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
      className={`flex min-h-[1.5rem] min-w-0 flex-1 flex-wrap content-center gap-2 sm:gap-2.5 ${align === "left" ? "justify-end" : "justify-start"}`}
    >
      {count === 0 ? (
        <CakraBosCizgi align={align} />
      ) : (
        Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="h-5 w-5 shrink-0 rounded-full ring-2 ring-white/90 sm:h-6 sm:w-6"
            style={{
              backgroundColor: hex,
              opacity: tone === "pasif" ? 0.48 : 1,
              filter: tone === "aktif" ? "brightness(0.65) saturate(1.25)" : "saturate(0.85) brightness(1.08)",
              boxShadow: tone === "aktif" ? `0 2px 8px ${hex}77` : `0 1px 4px ${hex}33`,
            }}
          />
        ))
      )}
    </div>
  );
}

export function CakraOmurgasiTablo({ out }: { out: NumerolojiMotorOut }) {
  return (
    <section className="col-span-full min-w-0 w-full rounded-[28px] border-[3px] border-violet-200/90 bg-white/85 p-7 shadow-[0_0_32px_rgba(139,92,246,0.10)]">
      <h3 className="text-lg font-black tracking-wide text-slate-950">Çakra Sütunu & Çakra Omurgası</h3>
      <div className="mt-5 space-y-1.5 sm:space-y-2">
        {CAKRA_TABLO_SIRA.map((cNo) => {
          const sol = out.cakraOmurgasi.sayilar[cNo] ?? 0;
          const sag = out.cakraOmurgasi.harfler[cNo] ?? 0;
          const hex = CHAKRA_TABLO_HEX[cNo] ?? "#8b5cf6";
          return (
            <div
              key={cNo}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-violet-100/70 bg-white/65 px-4 py-2.5 shadow-sm ring-1 ring-white/80 transition-colors hover:bg-violet-50/30 sm:gap-6 sm:px-6 sm:py-3"
            >
              <CakraEnerjiDaireleri count={sol} hex={hex} tone="pasif" align="left" />
              <span className="shrink-0 px-2 text-center text-lg font-black tracking-wide text-slate-800 sm:px-4">
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
    <section className="col-span-full min-w-0 w-full rounded-[28px] border-[3px] border-amber-300/45 bg-white/80 p-7 shadow-[0_0_45px_rgba(245,158,11,0.14)] backdrop-blur-xl">
      <h3 className="text-lg font-black tracking-wide text-violet-700">Harflerin Yankılanışı</h3>
      <div className="mt-6 flex w-full min-w-0 flex-wrap justify-center gap-4">
        {segments.length === 0 ? (
          <p className="w-full min-h-[140px] px-6 py-5 text-center text-lg font-medium leading-9 text-slate-700">
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
                className={`relative flex min-h-[120px] min-w-[95px] shrink-0 flex-col items-center justify-center rounded-2xl border-2 p-5 text-center shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${tint} ${aktif ? "ring-2 ring-violet-500/50" : ""}`}
              >
                {aktif ? (
                  <span className="absolute -top-2 left-1/2 z-10 w-full max-w-[calc(100%+1rem)] -translate-x-1/2 whitespace-normal break-words rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1 text-center text-sm font-black leading-8 tracking-wide text-white shadow-md">
                    Aktif
                  </span>
                ) : null}
                <span className="w-full text-4xl font-black leading-none text-slate-900">{seg.letter}</span>
                <span className="mt-2 w-full text-2xl font-black tabular-nums text-violet-700">{seg.chakra}</span>
                <span className="mt-2 w-full whitespace-normal break-words text-lg font-medium leading-9 text-slate-700">
                  {harfYasMetni(seg.ageStart, seg.ageEnd)}
                </span>
                {yilMetin ? (
                  <span className="mt-1 w-full whitespace-normal break-words text-lg font-medium leading-9 tabular-nums text-slate-600">
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
}: {
  title: string;
  value: string;
  icon: ReactNode;
  tint: string;
}) {
  return (
    <div
      className={`group relative min-w-0 overflow-hidden rounded-[28px] border-[3px] border-violet-200 bg-white/85 p-7 shadow-[0_0_32px_rgba(139,92,246,0.10)] transition-all duration-300 hover:-translate-y-1 ${tint}`}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-violet-400/10 blur-2xl transition group-hover:bg-violet-400/20" />
      <div className="relative flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 w-full flex-1">
          <p className="text-base font-black text-slate-600">{title}</p>
          <p className="mt-2 w-full whitespace-normal break-words text-5xl font-black leading-tight text-slate-950">
            {value}
          </p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-violet-700 shadow-sm ring-1 ring-violet-100/80">
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
    { title: "Ana Kulvar", value: nrDisplay(out.anaKulvar), tint: "from-violet-50/80", icon: "♔" },
    { title: "Yan Kulvar", value: nrDisplay(out.yanKulvar), tint: "from-indigo-50/80", icon: "⚖" },
    { title: "İfade Sayısı", value: nrDisplay(out.ifadeSayisi), tint: "from-fuchsia-50/80", icon: "✦" },
    { title: "Hayat Yolu / DM", value: nrDisplay(out.hayatYolu), tint: "from-amber-50/80", icon: "☤" },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="min-w-0 rounded-[28px] border-[3px] border-violet-300/40 bg-gradient-to-br from-white/85 via-violet-50/60 to-amber-50/50 p-7 shadow-[0_0_40px_rgba(139,92,246,0.13)]">
        <p className="text-lg font-black tracking-wide text-violet-700">Numerolojik sonuç özeti</p>
        <p className="mt-3 w-full text-xl font-black leading-9 text-slate-950">{isimGoster}</p>
        <p className="mt-2 w-full text-xl font-medium leading-9 text-slate-700">Doğum tarihi: {dogumGoster}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ustKartlar.map((k) => (
          <OzetPremiumKart key={k.title} title={k.title} value={k.value} tint={`bg-gradient-to-br ${k.tint} to-white/90`} icon={<span className="text-lg">{k.icon}</span>} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:gap-6">
        <HarflerBuyukPanel segments={Array.isArray(out.harflerinYankilanisi) ? out.harflerinYankilanisi : []} />

        <section className={`min-w-0 w-full border-[3px] border-violet-200/90 bg-white/85 shadow-[0_0_32px_rgba(139,92,246,0.10)] ${typo.boxPadding}`}>
          <h3 className="text-lg font-black tracking-wide text-slate-950">Elementler</h3>
          <div className="mt-6 w-full min-w-0 space-y-5">
            {ELEMENT_ORDER.map((name) => (
              <div key={name} className="min-w-0 w-full">
                <div className="mb-2 flex w-full min-w-0 justify-between gap-4 text-lg font-black tracking-wide text-slate-700">
                  <span className="min-w-0">{name}</span>
                  <span>{el[name]}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
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
    <div className="space-y-4 sm:space-y-5">
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
  const typo = useContentTypography();
  return (
    <section
      className={`min-w-0 border-[3px] border-violet-200/90 bg-white/85 shadow-[0_0_32px_rgba(139,92,246,0.10)] ${typo.boxPadding}`}
    >
      <h3 className="border-b border-violet-100/80 pb-4 text-lg font-black tracking-wide text-slate-950">{title}</h3>
      <div className="w-full min-w-0 pt-5">{children}</div>
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

function BilgiBankasiYorumBlock({ notes }: { notes: KnowledgeNote[] }) {
  const typo = useContentTypography();
  if (!notes.length) return null;

  return (
    <div
      className={`mt-4 rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white/95 ring-1 ring-violet-100/70 ${typo.infoBoxPadding}`}
    >
      <p className={`${typo.sectionTitle} text-violet-800/95`}>Bilgi Bankası Yorumu</p>
      <div className="mt-3 space-y-4">
        {notes.map((note) => (
          <div
            key={note.id}
            className="border-t border-violet-100/90 pt-3 first:border-t-0 first:pt-0"
          >
            <p className={`${typo.body} font-bold text-violet-900`}>{note.value}</p>
            {note.source?.trim() ? (
              <p className={`mt-1 ${typo.caption} text-slate-500`}>Kaynak: {note.source.trim()}</p>
            ) : null}
            {note.description?.trim() ? (
              <p className={`mt-2 whitespace-pre-wrap ${typo.body} text-slate-800`}>{note.description.trim()}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function NumeroCardBody({
  r,
  layout = "default",
  knowledgeNotes,
}: {
  r: NumerolojiResult;
  layout?: "default" | "detay";
  knowledgeNotes?: KnowledgeNote[];
}) {
  const k = (r.key || "").trim();
  const typo = useContentTypography();
  const stepsPre = `mt-2 whitespace-pre-wrap border-t border-slate-100 pt-3 ${typo.pre} text-slate-800`;
  return (
    <div className="space-y-2">
      <p className={`${typo.display} text-violet-900`}>{nrDisplay(r)}</p>
      {k ? <p className={`${typo.caption} font-semibold uppercase tracking-wide text-slate-500`}>Anahtar: {k}</p> : null}
      {r.steps?.length ? (
        <pre
          className={
            layout === "detay" ? stepsPre : `max-h-[min(50vh,24rem)] overflow-y-auto ${stepsPre}`
          }
        >
          {r.steps.join("\n")}
        </pre>
      ) : null}
      {knowledgeNotes?.length ? <BilgiBankasiYorumBlock notes={knowledgeNotes} /> : null}
    </div>
  );
}

export function TabPlainAnaliz({ out }: { out: NumerolojiMotorOut }) {
  const typo = useContentTypography();
  return (
    <pre
      className={`min-w-0 w-full whitespace-pre-wrap border-[3px] border-violet-200/90 bg-white/85 shadow-[0_0_32px_rgba(139,92,246,0.10)] ${typo.boxPadding} ${typo.pre}`}
    >
      {buildPlainAnalizFull(out)}
    </pre>
  );
}

export function TabTasAtamalari({ out }: { out: NumerolojiMotorOut }) {
  const [stoneAssignments, setStoneAssignments] = useState<StoneAssignmentForAnalysis[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getStoneAssignmentsForAnalysis(out).then((items) => {
      if (!cancelled) setStoneAssignments(items);
    });
    return () => {
      cancelled = true;
    };
  }, [out]);

  const cakraItems = stoneAssignments.filter((s) => s.typeKey === STONE_TYPE_CAKRA);
  const elementItems = stoneAssignments.filter((s) => s.typeKey === STONE_TYPE_ELEMENT);

  if (!cakraItems.length && !elementItems.length) return null;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <TasDestekSectionBlock title="Çakra Omurgası Taş Destekleri" items={cakraItems} />
      <TasDestekSectionBlock title="Element Taş Destekleri" items={elementItems} />
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
    <div className="flex flex-col gap-4 sm:gap-5">
      <DetayCard title="Ana Kulvar">
        <NumeroCardBody
          r={out.anaKulvar}
          layout={layout}
          knowledgeNotes={knowledgeNotes?.anaKulvar}
        />
      </DetayCard>
      <DetayCard title="Yan Kulvar">
        <NumeroCardBody
          r={out.yanKulvar}
          layout={layout}
          knowledgeNotes={knowledgeNotes?.yanKulvar}
        />
      </DetayCard>
      <DetayCard title="İfade Sayısı">
        <NumeroCardBody
          r={out.ifadeSayisi}
          layout={layout}
          knowledgeNotes={knowledgeNotes?.ifadeSayisi}
        />
      </DetayCard>
      <DetayCard title="Hayat Yolu">
        <NumeroCardBody
          r={out.hayatYolu}
          layout={layout}
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
