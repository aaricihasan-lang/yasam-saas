"use client";

import type { ReactNode } from "react";
import type { NumerolojiResult } from "@/lib/numeroloji";
import { ELEMENT_ORDER, type ElementName } from "@/lib/numeroloji";
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

const CHAKRA_DOT: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-amber-400",
  4: "bg-lime-500",
  5: "bg-emerald-500",
  6: "bg-teal-500",
  7: "bg-sky-500",
  8: "bg-indigo-500",
  9: "bg-violet-500",
  10: "bg-fuchsia-500",
};

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
}: {
  out: NumerolojiMotorOut;
  isimGoster: string;
  dogumGoster: string;
}) {
  const hy = out.harflerinYankilanisi;
  const harfKisa =
    Array.isArray(hy) && hy.length > 0
      ? hy
          .map((s) => s.letter)
          .slice(0, 12)
          .join(", ")
      : "—";
  const zirveKisa = out.zirveYillari?.peaks?.[0] ? String(out.zirveYillari.peaks[0].topic) : nrDisplay(out.hayatYolu);
  const mucadeleKisa = out.mucadeleYillari?.method1?.[0] ? String(out.mucadeleYillari.method1[0].topic) : "—";
  const degisimKisa =
    (out.degisimDonusumMetni || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /değişim/i.test(l) && /\d/.test(l))?.replace(/^.*?(\d+.*)$/i, "$1")
      .slice(0, 12) || "—";
  const pinKisa = `${out.pinKodu.k1}${out.pinKodu.k2}${out.pinKodu.k3}${out.pinKodu.k4}` || pinOneLine(out.pinKodu).slice(0, 8);
  const el = out.elementler.counts;
  const elMax = Math.max(...ELEMENT_ORDER.map((n) => el[n]), 1);
  const harfTop = Object.values(out.cakraOmurgasi.harfler).reduce((a, b) => a + b, 0);
  const sayiTop = Object.values(out.cakraOmurgasi.sayilar).reduce((a, b) => a + b, 0);
  const dengeTop = harfTop + sayiTop || 1;
  const sezgisel = Math.round((el.Su / (el.Hava + el.Su + el.Ateş + el.Toprak || 1)) * 100) || 33;
  const fiziksel = Math.round((el.Ateş + el.Toprak) / (el.Hava + el.Su + el.Ateş + el.Toprak || 1) * 100) || 33;
  const zihinsel = Math.max(0, 100 - sezgisel - fiziksel) || 34;

  const ustKartlar = [
    { title: "Ana Kulvar", value: nrDisplay(out.anaKulvar), tint: "from-violet-50/80", icon: "♔" },
    { title: "Yan Kulvar", value: nrDisplay(out.yanKulvar), tint: "from-indigo-50/80", icon: "⚖" },
    { title: "İfade Sayısı", value: nrDisplay(out.ifadeSayisi), tint: "from-fuchsia-50/80", icon: "✦" },
    { title: "Hayat Yolu / DM", value: nrDisplay(out.hayatYolu), tint: "from-amber-50/80", icon: "☤" },
    { title: "PIN Kodu", value: pinKisa, tint: "from-sky-50/80", icon: "🔒" },
    { title: "Çakra", value: String(sayiTop || harfTop || "—"), tint: "from-teal-50/80", icon: "◎" },
    { title: "Mücadele", value: mucadeleKisa, tint: "from-rose-50/80", icon: "⚑" },
    { title: "Zirve", value: zirveKisa, tint: "from-orange-50/80", icon: "▲" },
    { title: "Harflerin Yankılanışı", value: harfKisa, tint: "from-violet-50/80", icon: "🔊" },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="rounded-3xl border border-violet-200/60 bg-gradient-to-r from-violet-100/50 via-white/80 to-amber-100/40 px-6 py-5 shadow-inner ring-1 ring-white/60 backdrop-blur-sm sm:px-8">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-700/90">Numerolojik sonuç özeti</p>
        <p className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{isimGoster}</p>
        <p className="mt-1 text-sm font-medium text-slate-600">Doğum tarihi: {dogumGoster}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {ustKartlar.map((k) => (
          <OzetPremiumKart key={k.title} title={k.title} value={k.value} tint={`bg-gradient-to-br ${k.tint} to-white/90`} icon={<span className="text-lg">{k.icon}</span>} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-3xl border border-white/80 bg-white/75 p-6 shadow-[0_12px_40px_-16px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/50 backdrop-blur-md">
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-800">Çakra Omurgası</h3>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            {[7, 6, 5, 4, 3, 2, 1].map((c) => {
              const n = (out.cakraOmurgasi.sayilar[c] || 0) + (out.cakraOmurgasi.harfler[c] || 0);
              return (
                <div key={c} className="flex flex-col items-center gap-2">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-black text-white shadow-lg ring-2 ring-white/80 ${CHAKRA_DOT[c] || "bg-violet-500"}`}
                  >
                    {n > 0 ? n : c}
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">{c}. çakra</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-white/80 bg-white/75 p-6 shadow-[0_12px_40px_-16px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/50 backdrop-blur-md">
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

        <section className="rounded-3xl border border-white/80 bg-white/75 p-6 shadow-[0_12px_40px_-16px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/50 backdrop-blur-md">
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-800">Denge</h3>
          <div className="mt-6 flex flex-col items-center">
            <div
              className="relative h-36 w-36 rounded-full shadow-inner ring-4 ring-white/90"
              style={{
                background: `conic-gradient(#8b5cf6 0% ${sezgisel}%, #f59e0b ${sezgisel}% ${sezgisel + fiziksel}%, #38bdf8 ${sezgisel + fiziksel}% 100%)`,
              }}
            >
              <div className="absolute inset-5 flex items-center justify-center rounded-full bg-white/95 text-center text-[10px] font-bold leading-tight text-slate-600 shadow-sm">
                Harf {harfTop}
                <br />
                Sayı {sayiTop}
              </div>
            </div>
            <ul className="mt-5 w-full space-y-2 text-xs font-semibold text-slate-700">
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                Sezgisel (Su) %{sezgisel}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                Fiziksel (Ateş+Toprak) %{fiziksel}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                Zihinsel (Hava) %{zihinsel}
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

export function TabSonucOzeti({
  out,
  isimGoster,
  dogumGoster,
  layout = "default",
}: {
  out: NumerolojiMotorOut;
  isimGoster: string;
  dogumGoster: string;
  layout?: "default" | "detay" | "premium";
}) {
  if (layout === "premium") {
    return <TabSonucOzetiPremium out={out} isimGoster={isimGoster} dogumGoster={dogumGoster} />;
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
