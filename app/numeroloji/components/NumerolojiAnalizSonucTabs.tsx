"use client";

import type { ReactNode } from "react";
import type { HarfYankilanisiSegment, NumerolojiResult } from "@/lib/numeroloji";
import { ELEMENT_ORDER, repeatX, type ElementName } from "@/lib/numeroloji";
import { harfSegmentsToText, nrDisplay, elementShort, pinOneLine, type NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";

const OZET_VERI_YOK = "Bu bölüm için veri üretilemedi.";

function OzetRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-slate-100/90 py-3 last:border-b-0 sm:grid-cols-[minmax(9rem,12rem)_1fr] sm:items-baseline sm:gap-4">
      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="text-sm font-semibold leading-snug text-slate-900">{value}</div>
    </div>
  );
}

function OzetSectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm ring-1 ring-slate-100/70 sm:p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-700/90">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function OzetMetinPre(s: string | undefined | null) {
  const t = (s || "").trim();
  if (!t) return <p className="text-sm leading-relaxed text-slate-600">{OZET_VERI_YOK}</p>;
  return <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800 sm:text-sm">{s}</pre>;
}

const CAKRA_TABLO_SIRA: readonly number[] = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const CHAKRA_TABLO_AD: Record<number, string> = {
  10: "10 — Taç",
  9: "9 — Üçüncü Göz",
  8: "8 — Ruh Yıldızı",
  7: "7 — Taç",
  6: "6 — Alın",
  5: "5 — Boğaz",
  4: "4 — Kalp",
  3: "3 — Solar Pleksus",
  2: "2 — Sakral",
  1: "1 — Kök",
};

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

const CHAKRA_TABLO_SEMBOL: Record<number, string> = {
  10: "✦",
  9: "◉",
  8: "☆",
  7: "△",
  6: "◇",
  5: "◎",
  4: "♡",
  3: "☀",
  2: "◐",
  1: "▼",
};

function cakraXAlani(count: number): string {
  return count > 0 ? repeatX(count) : "—";
}

function cakraDegerGoster(count: number): string {
  return count > 0 ? "●".repeat(count) : "—";
}

function CakraOmurgasiTablo({ out }: { out: NumerolojiMotorOut }) {
  return (
    <section className="col-span-full w-full rounded-3xl border border-white/80 bg-white/75 p-5 shadow-[0_12px_40px_-16px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/50 backdrop-blur-md sm:p-7">
      <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-800 sm:text-base">Çakra Omurgası</h3>
      <div className="mt-5 w-full overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-violet-200/60 bg-gradient-to-r from-violet-50/90 to-indigo-50/50">
              {["Çakra adı", "Enerji değeri", "X alanı", "Renk", "Sembol", "Değer"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-3.5 text-[11px] font-black uppercase tracking-[0.14em] text-violet-900/85 first:pl-4 last:pr-4 sm:px-4 sm:py-4 sm:text-xs"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAKRA_TABLO_SIRA.map((cNo) => {
              const sol = out.cakraOmurgasi.sayilar[cNo] ?? 0;
              const sag = out.cakraOmurgasi.harfler[cNo] ?? 0;
              const enerji = sol + sag;
              const hex = CHAKRA_TABLO_HEX[cNo] ?? "#8b5cf6";
              return (
                <tr
                  key={cNo}
                  className="border-b border-slate-100/90 transition-colors last:border-b-0 hover:bg-violet-50/35"
                >
                  <td className="px-3 py-4 pl-4 text-sm font-bold text-slate-900 sm:px-4 sm:py-5 sm:text-base">
                    {CHAKRA_TABLO_AD[cNo] ?? `${cNo}. Çakra`}
                  </td>
                  <td className="px-3 py-4 text-center text-lg font-black tabular-nums text-violet-800 sm:px-4 sm:py-5 sm:text-xl">
                    {enerji > 0 ? enerji : "—"}
                  </td>
                  <td className="px-3 py-4 font-mono text-sm font-bold tracking-wider text-slate-700 sm:px-4 sm:py-5 sm:text-base">
                    {cakraXAlani(sol)}
                  </td>
                  <td className="px-3 py-4 sm:px-4 sm:py-5">
                    <span
                      className="inline-block h-7 w-7 rounded-full shadow-md ring-2 ring-white/90 sm:h-8 sm:w-8"
                      style={{ backgroundColor: hex }}
                      aria-hidden
                    />
                  </td>
                  <td className="px-3 py-4 text-center text-xl text-violet-800 sm:px-4 sm:py-5 sm:text-2xl">
                    {CHAKRA_TABLO_SEMBOL[cNo] ?? "·"}
                  </td>
                  <td className="pr-4 px-3 py-4 font-mono text-sm font-bold tracking-wide text-violet-700 sm:px-4 sm:py-5 sm:text-base">
                    {cakraDegerGoster(sag)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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

function HarflerBuyukPanel({
  segments,
  aciklamaMetni,
}: {
  segments: HarfYankilanisiSegment[];
  aciklamaMetni?: string | null;
}) {
  const aciklama = (aciklamaMetni || "").trim();

  return (
    <section className="col-span-full w-full rounded-3xl border border-violet-200/50 bg-gradient-to-br from-violet-50/60 via-white/80 to-fuchsia-50/40 p-5 shadow-[0_16px_48px_-20px_rgba(91,33,182,0.22)] ring-1 ring-violet-100/55 backdrop-blur-md sm:p-8">
      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-violet-900/90 sm:text-base">Harflerin Yankılanışı</h3>
      <div className="mt-6 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {segments.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm font-medium text-slate-600">Harf dönemi hesaplanamadı.</p>
        ) : (
          segments.map((seg, idx) => {
            const tint = HARF_KART_TINT[seg.chakra] ?? HARF_KART_TINT[9];
            const aktif = harfDonemAktif(seg);
            const yilMetin = harfYilMetni(seg.yearStart, seg.yearEnd);
            return (
              <div
                key={`${idx}-${seg.letter}-${seg.ageStart}`}
                className={`relative flex min-h-[9.5rem] flex-col items-center justify-center rounded-2xl border-2 px-3 py-4 text-center shadow-md ring-1 ring-white/60 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[10.5rem] sm:px-4 ${tint} ${aktif ? "ring-2 ring-violet-500/50" : ""}`}
              >
                {aktif ? (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-md sm:text-[10px]">
                    Aktif Dönem
                  </span>
                ) : null}
                <span className="text-3xl font-black leading-none text-slate-900 sm:text-4xl">{seg.letter}</span>
                <span className="mt-2 text-xl font-black tabular-nums text-violet-800 sm:text-2xl">{seg.chakra}</span>
                <span className="mt-2 text-[11px] font-bold text-slate-700 sm:text-xs">{harfYasMetni(seg.ageStart, seg.ageEnd)}</span>
                {yilMetin ? (
                  <span className="mt-1 text-[11px] font-semibold tabular-nums text-slate-500 sm:text-xs">{yilMetin}</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {aciklama ? (
        <div className="mt-8 rounded-2xl border border-violet-100/80 bg-white/70 p-5 ring-1 ring-violet-50/80 sm:p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-800/90">Detaylı Açıklama</p>
          <pre className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-700 sm:text-sm">{aciklama}</pre>
        </div>
      ) : null}
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
      className={`group relative overflow-hidden rounded-2xl border border-white/80 bg-white/70 p-5 shadow-[0_8px_30px_-12px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/50 backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-12px_rgba(91,33,182,0.28)] ${tint}`}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-violet-400/10 blur-2xl transition group-hover:bg-violet-400/20" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{title}</p>
          <p className="mt-2 truncate text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{value}</p>
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
  firstName,
  lastName,
}: {
  out: NumerolojiMotorOut;
  isimGoster: string;
  dogumGoster: string;
  firstName: string;
  lastName: string;
}) {
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
      <div className="rounded-3xl border border-violet-200/60 bg-gradient-to-r from-violet-100/50 via-white/80 to-amber-100/40 px-6 py-5 shadow-inner ring-1 ring-white/60 backdrop-blur-sm sm:px-8">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-700/90">Numerolojik sonuç özeti</p>
        <p className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{isimGoster}</p>
        <p className="mt-1 text-sm font-medium text-slate-600">Doğum tarihi: {dogumGoster}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ustKartlar.map((k) => (
          <OzetPremiumKart key={k.title} title={k.title} value={k.value} tint={`bg-gradient-to-br ${k.tint} to-white/90`} icon={<span className="text-lg">{k.icon}</span>} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:gap-6">
        <HarflerBuyukPanel
          segments={Array.isArray(out.harflerinYankilanisi) ? out.harflerinYankilanisi : []}
          aciklamaMetni={out.harflerinYankilanisiMetni}
        />

        <section className="w-full rounded-3xl border border-white/80 bg-white/75 p-6 shadow-[0_12px_40px_-16px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/50 backdrop-blur-md">
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-800">Elementler</h3>
          <div className="mt-6 space-y-4">
            {ELEMENT_ORDER.map((name) => (
              <div key={name}>
                <div className="mb-1.5 flex justify-between text-xs font-bold text-slate-600">
                  <span>{name}</span>
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

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/95 via-white to-amber-50/25 p-4 shadow-sm ring-1 ring-violet-100/50 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700/90">Numerolojik sonuç özeti</p>
        <p className="mt-2 text-base font-bold tracking-tight text-slate-900">{isimGoster}</p>
        <p className="mt-0.5 text-xs font-medium text-slate-600">Doğum tarihi: {dogumGoster}</p>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-1 px-4 shadow-sm ring-1 ring-slate-100/80 sm:px-5">
        <OzetRow label="Ana Kulvar" value={nrDisplay(out.anaKulvar)} />
        <OzetRow label="Yan Kulvar" value={nrDisplay(out.yanKulvar)} />
        <OzetRow label="İfade Sayısı" value={nrDisplay(out.ifadeSayisi)} />
        <OzetRow label="Hayat Yolu / DM" value={nrDisplay(out.hayatYolu)} />
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white p-4 shadow-sm ring-1 ring-sky-100/50 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-800/90">PIN Kodu</p>
        <p className="mt-2 break-all font-mono text-[11px] font-semibold leading-relaxed text-slate-800 sm:text-xs">
          {pinOneLine(out.pinKodu)}
        </p>
        <pre
          className={
            layout === "detay"
              ? "mt-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-white/80 p-3 font-mono text-[11px] leading-relaxed text-slate-700 sm:text-xs"
              : "mt-3 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-white/80 p-3 font-mono text-[11px] leading-relaxed text-slate-700 sm:text-xs"
          }
        >
          {pinMetin}
        </pre>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm ring-1 ring-amber-100/60 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-900/85">Elementler (kısa)</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">{elementShort(out.elementler)}</p>
        <pre className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{elementMetinKisa}</pre>
      </div>

      <OzetSectionCard title="Çakra Omurgası Özeti">{OzetMetinPre(out.cakraOmurgasiMetni)}</OzetSectionCard>
      <OzetSectionCard title="Değişim-Dönüşüm Yılları Özeti">{OzetMetinPre(out.degisimDonusumMetni)}</OzetSectionCard>

      <OzetSectionCard title="Zirve Yılları Özeti">
        {zirveStr ? (
          OzetMetinPre(out.zirveYillariMetni)
        ) : zirveHasArray && zirveObj ? (
          <ul className="space-y-1.5 text-xs font-medium leading-snug text-slate-800 sm:text-sm">
            {zirveObj.peaks.map((p) => (
              <li key={p.index} className="border-b border-slate-100/80 pb-1.5 last:border-b-0 last:pb-0">
                {p.index}. zirve — yaş {p.age}, konu {p.topic}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed text-slate-600">{OZET_VERI_YOK}</p>
        )}
      </OzetSectionCard>

      <OzetSectionCard title="Mücadele Yılları Özeti">
        {mucadeleStr ? (
          OzetMetinPre(out.mucadeleYillariMetni)
        ) : mucadeleHasArray && mucadeleObj ? (
          <ul className="space-y-1.5 text-xs font-medium leading-snug text-slate-800 sm:text-sm">
            {mucadeleObj.method1.map((m) => (
              <li key={m.index} className="border-b border-slate-100/80 pb-1.5 last:border-b-0 last:pb-0">
                {m.index}. mücadele — yaş {m.age}, konu {m.topic}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed text-slate-600">{OZET_VERI_YOK}</p>
        )}
      </OzetSectionCard>

      <OzetSectionCard title="Harflerin Yankılanışı Özeti">
        {harfHasSegments ? (
          <ul className="space-y-1.5 text-xs font-medium leading-snug text-slate-800 sm:text-sm">
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
          <div className={harfHasSegments ? "mt-3 border-t border-slate-100 pt-3" : ""}>{OzetMetinPre(out.harflerinYankilanisiMetni)}</div>
        ) : null}
        {!harfHasSegments && !harfStr ? <p className="text-sm leading-relaxed text-slate-600">{OZET_VERI_YOK}</p> : null}
      </OzetSectionCard>
    </div>
  );
}

function DetayCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-violet-50/30 p-4 shadow-md ring-1 ring-violet-100/35 sm:p-5">
      <h3 className="border-b border-amber-200/50 pb-2.5 text-[11px] font-black uppercase tracking-[0.16em] text-amber-950/90">
        {title}
      </h3>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function NumeroCardBody({ r, layout = "default" }: { r: NumerolojiResult; layout?: "default" | "detay" }) {
  const k = (r.key || "").trim();
  return (
    <div className="space-y-2">
      <p className="text-xl font-black tracking-tight text-violet-900 sm:text-2xl">{nrDisplay(r)}</p>
      {k ? <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Anahtar: {k}</p> : null}
      {r.steps?.length ? (
        <pre
          className={
            layout === "detay"
              ? "mt-2 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-800"
              : "mt-2 max-h-[min(50vh,24rem)] overflow-y-auto whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-800"
          }
        >
          {r.steps.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}

export function TabAnalizOzetli({ out, layout = "default" }: { out: NumerolojiMotorOut; layout?: "default" | "detay" }) {
  const hy = out.harflerinYankilanisi;
  const harfListe = Array.isArray(hy) && hy.length ? harfSegmentsToText(hy) : "";
  const harfMetin = out.harflerinYankilanisiMetni?.trim() ?? "";
  const preScroll =
    layout === "detay"
      ? "whitespace-pre-wrap text-sm leading-relaxed text-slate-800"
      : "max-h-[min(55vh,28rem)] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800";
  const preScrollSm =
    layout === "detay"
      ? "mt-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs leading-relaxed text-slate-800 sm:text-sm"
      : "mt-3 max-h-[min(55vh,28rem)] overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs leading-relaxed text-slate-800 sm:text-sm";
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <DetayCard title="Ana Kulvar">
        <NumeroCardBody r={out.anaKulvar} layout={layout} />
      </DetayCard>
      <DetayCard title="Yan Kulvar">
        <NumeroCardBody r={out.yanKulvar} layout={layout} />
      </DetayCard>
      <DetayCard title="İfade Sayısı">
        <NumeroCardBody r={out.ifadeSayisi} layout={layout} />
      </DetayCard>
      <DetayCard title="Hayat Yolu">
        <NumeroCardBody r={out.hayatYolu} layout={layout} />
      </DetayCard>
      <DetayCard title="PIN">
        <p className="break-all font-mono text-xs font-semibold text-slate-800 sm:text-sm">{pinOneLine(out.pinKodu)}</p>
        <pre className={preScrollSm}>{out.pinKoduMetni || "—"}</pre>
      </DetayCard>
      <DetayCard title="Çakra">
        <pre className={preScroll}>{out.cakraOmurgasiMetni || "—"}</pre>
      </DetayCard>
      <DetayCard title="Elementler">
        <pre className={preScroll}>{out.elementlerMetni || "—"}</pre>
        {out.elementler.steps?.length ? (
          <pre
            className={
              layout === "detay"
                ? "mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-700"
                : "mt-3 max-h-[min(40vh,20rem)] overflow-y-auto whitespace-pre-wrap border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-700"
            }
          >
            {out.elementler.steps.join("\n")}
          </pre>
        ) : null}
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
        {harfListe ? (
          <pre
            className={
              layout === "detay"
                ? "mb-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/40 p-3 text-xs leading-relaxed text-slate-800 sm:text-sm"
                : "mb-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/40 p-3 text-xs leading-relaxed text-slate-800 sm:text-sm"
            }
          >
            {harfListe}
          </pre>
        ) : null}
        {harfMetin ? (
          <pre className={preScroll}>{harfMetin}</pre>
        ) : !harfListe ? (
          <p className="text-sm text-slate-600">—</p>
        ) : null}
      </DetayCard>
    </div>
  );
}
