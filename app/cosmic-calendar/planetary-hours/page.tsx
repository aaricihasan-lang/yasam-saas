"use client";

/**
 * app/cosmic-calendar/planetary-hours/page.tsx
 * Gezegen Saati Planlayıcısı — AYRI profesyonel sayfa.
 *
 * Ana /cosmic-calendar sayfasındaki eski gömülü planner buradan taşındı. Astronomik/
 * planetary-hour motoru DEĞİŞMEDİ: hesap tek canonical view-model'den gelir
 * (./plannerData → getPlanetaryHoursForRange). Başlangıç tarihi ?date=YYYY-MM-DD
 * query'sinden okunur (deep-link); konum ise ortak getUserLocationPref üzerinden.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CHALDEAN_PLANETS } from "@/lib/cosmic/planetary-hours";
import { getUserLocationPref } from "@/lib/location/userLocationPref";
import {
  buildPlannerData, parseDateParam, toDateParam, PLANNER_PRESETS,
  type PlannerResult,
} from "./plannerData";

type ResolvedLoc = { lat: number; lon: number; tz: string; name: string };
const ANKARA: ResolvedLoc = { lat: 39.9334, lon: 32.8597, tz: "Europe/Istanbul", name: "Ankara" };

function PlannerScreen() {
  const sp = useSearchParams();
  const dateParam = sp.get("date");

  // Başlangıç: geçerli ?date varsa ondan (SSR↔CSR aynı); yoksa bugün. Bu bileşen Suspense +
  // useSearchParams sınırı altında CLIENT tarafında render edilir (sunucu fallback gösterir) →
  // new Date() yalnız client'ta çalışır, hydration uyuşmazlığı OLUŞMAZ.
  const [start, setStart] = useState<Date>(() => parseDateParam(dateParam) ?? new Date());

  const [days, setDays] = useState<number>(30);
  const [planets, setPlanets] = useState<ReadonlySet<string>>(() => new Set(["Merkür", "Venüs"]));

  // Konum: ana sayfayla AYNI canonical kaynak (kayıtlı tercih); yoksa Ankara fallback.
  const [loc, setLoc] = useState<ResolvedLoc | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const pref = await getUserLocationPref();
      if (!alive) return;
      if (pref && pref.tz && Number.isFinite(pref.lat) && Number.isFinite(pref.lon)) {
        setLoc({ lat: pref.lat, lon: pref.lon, tz: pref.tz, name: pref.name });
      } else {
        setLoc(ANKARA);
      }
    })();
    return () => { alive = false; };
  }, []);

  const data: PlannerResult | null = useMemo(
    () => (loc ? buildPlannerData({ start, days, planets, lat: loc.lat, lon: loc.lon, tz: loc.tz }) : null),
    [start, loc, days, planets],
  );

  const togglePlanet = (name: string) =>
    setPlanets(prev => {
      const next = new Set(prev);
      if (next.has(name)) { if (next.size > 1) next.delete(name); }  // min 1 korunur
      else next.add(name);
      return next;
    });

  return (
    <main className="min-h-screen w-full max-w-none px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      {/* Üst alan: geri dön + başlık */}
      <div className="mb-4">
        <Link
          href="/cosmic-calendar"
          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50/80 px-3.5 py-2 text-[13px] font-black text-indigo-700 shadow-sm transition-colors hover:border-indigo-400 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <span aria-hidden="true">←</span> Kozmik Ajanda&apos;ya Dön
        </Link>
        <h1 className="mt-3 text-lg font-black tracking-tight text-slate-900 sm:text-xl">🗓️ Gezegen Saati Planlayıcısı</h1>
        <p className="mt-1 text-[12px] leading-snug text-slate-500">
          Seçili günden başlayarak gezegen saatlerini listeler — danışan seansı planlaması için.
        </p>
      </div>

      {/* Kontrol alanı */}
      <section className="mb-4 rounded-[18px] border border-indigo-100/80 bg-gradient-to-br from-indigo-50/90 via-violet-50/70 to-cyan-50/80 p-4 shadow-sm backdrop-blur-md">
        {/* Başlangıç tarihi */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label htmlFor="planner-start" className="text-[11px] font-black uppercase tracking-wide text-slate-500">Başlangıç</label>
          <input
            id="planner-start"
            type="date"
            value={toDateParam(start)}
            onChange={e => { const d = parseDateParam(e.target.value); if (d) setStart(d); }}
            className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-bold tabular-nums text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {data && <span className="text-[11px] font-bold text-indigo-600 tabular-nums">{data.startLabel}</span>}
        </div>

        {/* Aralık */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] font-semibold text-slate-500">Aralık:</span>
          {PLANNER_PRESETS.map(d => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums transition-colors ${days === d ? "border-indigo-400 bg-indigo-600 text-white" : "border-indigo-200/70 bg-white/70 text-indigo-500 hover:bg-white"}`}>
              {d} gün
            </button>
          ))}
          {data && <span className="ml-1 text-[11px] font-semibold text-indigo-500 tabular-nums">{data.rangeLabel}</span>}
        </div>

        {/* Gezegen filtresi (varsayılan Merkür + Venüs; en az biri seçili) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] font-semibold text-slate-500">Gezegenler:</span>
          {CHALDEAN_PLANETS.map(p => {
            const on = planets.has(p.name);
            return (
              <button key={p.name} type="button" aria-pressed={on} onClick={() => togglePlanet(p.name)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors ${on ? "border-violet-400 bg-violet-600 text-white" : "border-slate-200 bg-white/70 text-slate-500 hover:bg-white"}`}>
                {p.symbol} {p.name}
              </button>
            );
          })}
        </div>
      </section>

      {/* Sonuçlar */}
      {!loc ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-4 text-xs text-slate-500">📍 Konum yükleniyor…</p>
      ) : data ? (
        <>
          <p className="mb-2 text-[12px] font-bold text-indigo-600 tabular-nums">
            {data.days} günlük aralık · {data.total} uygun saat · 📍 {loc.name}
          </p>
          {data.total === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-4 text-xs text-slate-500">
              Seçilen aralıkta bu filtrelere uygun gezegen saati bulunamadı.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.groups.map(g => (
                <div key={g.dayKey} className="rounded-xl border border-indigo-100/70 bg-white/70 px-3 py-2.5 shadow-sm backdrop-blur-sm">
                  <p className="mb-1.5 text-[12px] font-black text-indigo-700">
                    {g.dateLabel} <span className="font-semibold text-slate-400">· {g.weekday}</span>
                  </p>
                  <div className="flex flex-col gap-1">
                    {g.slots.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="w-5 shrink-0 text-center text-sm leading-none text-indigo-500">{s.symbol}</span>
                        <span className="w-[3.5rem] shrink-0 font-semibold text-slate-700">{s.planet}</span>
                        <span className="font-bold tabular-nums text-slate-800">{s.startLabel}–{s.endLabel}</span>
                        <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{s.period === "day" ? "Gündüz" : "Gece"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
            📍 {loc.name} konumuna göre ({loc.tz}). Gündoğumu/günbatımı astronomik hesaptır; gezegen saati ataması geleneksel sistemdir.
          </p>
        </>
      ) : null}
    </main>
  );
}

export default function PlanetaryHoursPlannerPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-5xl px-4 py-6 text-xs text-slate-500">Yükleniyor…</main>}>
      <PlannerScreen />
    </Suspense>
  );
}
