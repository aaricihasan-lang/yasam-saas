"use client";

import { useParams }  from "next/navigation";
import { useState }   from "react";
import Link            from "next/link";
import { ArrowLeft }  from "lucide-react";
import { getMoonSign, getMoonSignPeriod } from "@/lib/cosmic/moon";
import { getPlanetSigns, getPlanetSignPeriod, type PlanetKey } from "@/lib/cosmic/planets";
import { getTransitInterpretation } from "@/lib/cosmic/transit-interpretations";
import { getPlanetBySlug, getPlanetSlug } from "@/lib/cosmic/planet-meta";

// ─── Tarih formatlama ─────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("tr-TR", {
    day: "numeric", month: "long",
  });
}

function fmtDateObj(date: Date): string {
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function TransitDetailPage() {
  const params = useParams();
  const slug   = typeof params.planet === "string" ? params.planet : "";

  const [today] = useState(() => new Date());

  const meta = getPlanetBySlug(slug);

  if (!meta) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)] px-4">
        <div className="max-w-sm w-full text-center">
          <p className="mb-1 text-4xl">🪐</p>
          <h1 className="mb-1 text-lg font-black text-slate-800">Gezegen Bulunamadı</h1>
          <p className="mb-4 text-[12px] text-slate-500">
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">{slug || "(boş)"}</code> geçerli bir gezegen değil.
          </p>
          <Link
            href="/cosmic-calendar"
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white/80 px-4 py-2 text-[12px] font-semibold text-indigo-700 no-underline transition hover:bg-indigo-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Kozmik Ajanda&apos;ya Dön
          </Link>
        </div>
      </main>
    );
  }

  const allSigns  = getPlanetSigns(today);
  const moonSign  = getMoonSign(today);

  const currentSign = (() => {
    if (meta.key === "Ay") return moonSign.name;
    return allSigns.find(p => p.key === meta.key)?.sign ?? "";
  })();

  const transit = getTransitInterpretation(meta.key, currentSign);

  const transitPeriod = (() => {
    if (meta.key === "Ay") {
      const { from, to } = getMoonSignPeriod(today);
      return { from: fmtDateObj(from), to: fmtDateObj(to) };
    }
    const result = getPlanetSignPeriod(meta.key as PlanetKey, today);
    if (!result) return null;
    return { from: fmtDate(result.from), to: fmtDate(result.to) };
  })();

  const miladiDate = today.toLocaleDateString("tr-TR", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)] text-slate-900 antialiased">

      {/* Dekoratif blur blob'lar */}
      <div className="pointer-events-none fixed -left-32 -top-16 h-96 w-96 rounded-full bg-indigo-400/10 blur-[100px]" aria-hidden />
      <div className="pointer-events-none fixed -right-32 top-[20%] h-80 w-80 rounded-full bg-violet-300/[0.10] blur-3xl" aria-hidden />

      <div className="relative z-10 w-full px-4 pt-3 pb-6 sm:px-5 lg:px-6 xl:px-8">

        {/* ── Hero Kartı ── */}
        <section className={`relative mb-3 overflow-hidden rounded-[18px] border border-white/80 bg-gradient-to-br ${meta.cardBg} p-4 shadow-sm backdrop-blur-md`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.iconBg} text-2xl text-white shadow-md`}>
              {meta.symbol}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Transit Detayı</p>
                <p className="shrink-0 text-[10px] text-slate-400">{miladiDate}</p>
              </div>
              <h1 className={`text-xl font-black leading-tight ${meta.titleClr}`}>
                {meta.symbol} {meta.key} · {currentSign}
              </h1>
              {transitPeriod && (
                <p className="mt-0.5 text-xs leading-relaxed break-words text-slate-400">
                  Aralık:{" "}
                  <span className="font-semibold text-slate-600">{transitPeriod.from} → {transitPeriod.to}</span>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── İki Kolon ── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_290px] xl:grid-cols-[1fr_310px] lg:items-start">

          {/* ── Sol ── */}
          <div className="flex flex-col gap-3">

            {/* 1. Transit Yorumu */}
            <div className="overflow-hidden rounded-[16px] border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-md">
              <div className="mb-2.5 flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-xl leading-none">{meta.symbol}</span>
                <div>
                  <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${meta.titleClr}`}>
                    {meta.key} {currentSign} Transit
                  </p>
                  <h2 className="text-base font-black leading-tight text-slate-900">{transit.title}</h2>
                </div>
              </div>

              <p className="mb-2.5 text-sm leading-relaxed text-slate-700">{transit.summary}</p>

              {transit.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {transit.tags.map(tag => (
                    <span
                      key={tag}
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black ${meta.badgeBg} border-white/60 ${meta.badgeClr}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Bu Transit Ne Destekler? */}
            <div className="overflow-hidden rounded-[16px] border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-md">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="text-base leading-none">✨</span>
                <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${meta.titleClr}`}>
                  Bu Transit Ne Destekler?
                </h3>
              </div>
              {transit.supportiveActions && transit.supportiveActions.length > 0 ? (
                <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {transit.supportiveActions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={`mt-0.5 shrink-0 text-[11px] font-black ${meta.badgeClr}`}>✓</span>
                      <span className="text-sm leading-snug text-slate-700">{action}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Bu transit için destekleyici alanlar hazırlanıyor.</p>
              )}
            </div>

            {/* 3. Dikkat Edilecek Konular */}
            <div className="overflow-hidden rounded-[16px] border border-amber-200/60 bg-amber-50/60 p-4 shadow-sm backdrop-blur-md">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="text-base leading-none">⚠️</span>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">
                  Dikkat Edilecek Konular
                </h3>
              </div>
              {transit.challengePoints && transit.challengePoints.length > 0 ? (
                <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {transit.challengePoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-[11px] text-amber-500">•</span>
                      <span className="text-sm leading-snug text-amber-900">{point}</span>
                    </li>
                  ))}
                </ul>
              ) : transit.caution ? (
                <p className="text-sm leading-relaxed text-amber-800">{transit.caution}</p>
              ) : (
                <p className="text-sm text-amber-700">Bu transit için dikkat alanları hazırlanıyor.</p>
              )}
            </div>

            {/* 4. Kozmik Bağlam */}
            <div className="rounded-[16px] border border-white/80 bg-white/50 px-4 py-3 shadow-sm backdrop-blur-md">
              <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">🌌 Kozmik Bağlam</p>
              <p className="text-xs leading-relaxed text-slate-600">
                Transit yorumları kişiye özel değildir. Gökyüzünün genel enerjisini ve kolektif temaları
                yansıtır. Natal haritanızdaki gezegenler bu enerjiyle birlikte değerlendirilmelidir.
              </p>
            </div>

          </div>

          {/* ── Sağ: Gezegen Bilgisi ── */}
          <div className="flex flex-col gap-3">

            {/* Bu gezegen neyi temsil eder? */}
            <div className={`overflow-hidden rounded-[16px] border border-white/80 bg-gradient-to-br ${meta.cardBg} p-4 shadow-sm backdrop-blur-md`}>
              <p className={`mb-2 text-[9px] font-black uppercase tracking-[0.2em] ${meta.titleClr}`}>
                🪐 Bu Gezegen Neyi Temsil Eder?
              </p>
              <div className="flex items-start gap-2.5">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${meta.iconBg} text-base text-white shadow-sm`}>
                  {meta.symbol}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-black leading-snug ${meta.titleClr}`}>{meta.key}</p>
                  <p className="mt-0.5 text-xs leading-snug text-slate-600">{meta.meaning}</p>
                  <p className="mt-0.5 text-xs leading-snug text-slate-500">{meta.detail}</p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {meta.keywords.map(kw => (
                  <span
                    key={kw}
                    className={`rounded-full border border-white/60 px-2 py-0.5 text-[10px] font-semibold ${meta.badgeBg} ${meta.badgeClr}`}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            {/* Diğer gezegenler kısa listesi */}
            <div className="overflow-hidden rounded-[16px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">✨ Diğer Gezegenler</p>
              <div className="space-y-0.5">
                {[
                  { key: "Ay",   symbol: "☽", sign: moonSign.name,     signSymbol: moonSign.emoji },
                  ...allSigns.map(p => ({ key: p.key, symbol: p.symbol, sign: p.sign, signSymbol: p.signSymbol })),
                ].map(p => {
                  const isCurrent = p.key === meta.key;
                  const planetSlug = getPlanetSlug(p.key);
                  if (!planetSlug) return null;
                  return (
                    <Link
                      key={p.key}
                      href={`/cosmic-calendar/transits/${planetSlug}`}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1 no-underline transition ${
                        isCurrent
                          ? "bg-indigo-100 ring-1 ring-inset ring-indigo-300"
                          : "hover:bg-white/60"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-center text-[13px] leading-none text-indigo-400">{p.symbol}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600">{p.key}</span>
                      <span className="shrink-0 text-xs font-black text-slate-800">{p.signSymbol} {p.sign}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

      </div>
    </main>
  );
}
