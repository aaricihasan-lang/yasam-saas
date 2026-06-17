"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import {
  RETRO_PERIODS,
  getActiveRetros,
  getUpcomingRetros,
  getNextRetro,
  parseRetroDate,
  type RetroPeriod,
  type PlanetName,
} from "@/lib/cosmic/retro";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const MONTH_NAMES_TR: ReadonlyArray<string> = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const DAY_HEADERS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

const PLANETS: readonly PlanetName[] = ["Merkür", "Venüs", "Mars", "Jüpiter", "Satürn"];

const PLANET_SYMBOLS: Record<PlanetName, string> = {
  "Merkür": "☿", "Venüs": "♀", "Mars": "♂", "Jüpiter": "♃", "Satürn": "♄",
};

type PlanetFilter = "Tümü" | PlanetName;

type PlanetStyle = {
  bg: string; lightBg: string; text: string; darkText: string;
  border: string; dot: string; calBg: string; calBorder: string;
};

const PLANET_STYLES: Record<PlanetName, PlanetStyle> = {
  "Merkür":  { bg: "bg-orange-100", lightBg: "bg-orange-50",  text: "text-orange-600",  darkText: "text-orange-700",  border: "border-orange-200",  dot: "bg-orange-400",  calBg: "bg-orange-100/70",  calBorder: "border-orange-300/50"  },
  "Venüs":   { bg: "bg-pink-100",   lightBg: "bg-pink-50",    text: "text-pink-600",    darkText: "text-pink-700",    border: "border-pink-200",    dot: "bg-pink-400",    calBg: "bg-pink-100/70",    calBorder: "border-pink-300/50"    },
  "Mars":    { bg: "bg-red-100",    lightBg: "bg-red-50",     text: "text-red-600",     darkText: "text-red-700",     border: "border-red-200",     dot: "bg-red-400",     calBg: "bg-red-100/70",     calBorder: "border-red-300/50"     },
  "Jüpiter": { bg: "bg-blue-100",   lightBg: "bg-blue-50",    text: "text-blue-600",    darkText: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-400",    calBg: "bg-blue-100/70",    calBorder: "border-blue-300/50"    },
  "Satürn":  { bg: "bg-slate-100",  lightBg: "bg-slate-50",   text: "text-slate-500",   darkText: "text-slate-600",   border: "border-slate-300",   dot: "bg-slate-400",   calBg: "bg-slate-100/70",   calBorder: "border-slate-300/50"   },
};

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth    = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatDate(date: Date): string {
  return `${date.getDate()} ${MONTH_NAMES_TR[date.getMonth()]} ${date.getFullYear()}`;
}

function durationDays(r: RetroPeriod): number {
  return Math.round(
    (parseRetroDate(r.end).getTime() - parseRetroDate(r.start).getTime()) / 86_400_000,
  );
}

type DayRetroData = { active: RetroPeriod[]; starts: RetroPeriod[]; ends: RetroPeriod[] };

function getMonthRetroData(year: number, month: number, filter: PlanetFilter): Map<number, DayRetroData> {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const periods     = filter === "Tümü" ? RETRO_PERIODS : RETRO_PERIODS.filter(r => r.planet === filter);
  const map         = new Map<number, DayRetroData>();

  for (let d = 1; d <= daysInMonth; d++) {
    const date   = new Date(year, month, d);
    const active = periods.filter(r => date >= parseRetroDate(r.start) && date <= parseRetroDate(r.end));
    const starts = periods.filter(r => {
      const s = parseRetroDate(r.start);
      return s.getFullYear() === year && s.getMonth() === month && s.getDate() === d;
    });
    const ends = periods.filter(r => {
      const e = parseRetroDate(r.end);
      return e.getFullYear() === year && e.getMonth() === month && e.getDate() === d;
    });
    if (active.length > 0 || starts.length > 0 || ends.length > 0) {
      map.set(d, { active, starts, ends });
    }
  }
  return map;
}

function getPlanetStats(planet: PlanetName) {
  const periods     = RETRO_PERIODS.filter(r => r.planet === planet);
  const avgDuration = periods.length > 0
    ? Math.round(periods.reduce((s, r) => s + durationDays(r), 0) / periods.length)
    : 0;
  const starts = periods.map(r => parseRetroDate(r.start).getTime()).sort((a, b) => a - b);
  const avgFrequency = starts.length > 1
    ? Math.round((starts[starts.length - 1]! - starts[0]!) / (starts.length - 1) / 86_400_000)
    : 0;
  return { count: periods.length, avgDuration, avgFrequency };
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function RetroCalendarPage() {
  const today      = useMemo(() => new Date(), []);
  const todayYear  = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay   = today.getDate();

  const [planetFilter, setPlanetFilter] = useState<PlanetFilter>("Tümü");
  const [viewYear,  setViewYear]  = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);
  const [searchInput,  setSearchInput]  = useState("");
  const [searchResult, setSearchResult] = useState<RetroPeriod[] | "none" | "invalid" | null>(null);

  const activeRetros = useMemo(() => {
    const all = getActiveRetros(today);
    return planetFilter === "Tümü" ? all : all.filter(r => r.planet === planetFilter);
  }, [today, planetFilter]);

  const upcomingRetros = useMemo(() => {
    const all = getUpcomingRetros(today, 365);
    return planetFilter === "Tümü" ? all : all.filter(r => r.planet === planetFilter);
  }, [today, planetFilter]);

  const cells          = useMemo(() => buildCalendarCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthRetroData = useMemo(
    () => getMonthRetroData(viewYear, viewMonth, planetFilter),
    [viewYear, viewMonth, planetFilter],
  );

  const planetStats = useMemo(() => ({
    "Merkür":  getPlanetStats("Merkür"),
    "Venüs":   getPlanetStats("Venüs"),
    "Mars":    getPlanetStats("Mars"),
    "Jüpiter": getPlanetStats("Jüpiter"),
    "Satürn":  getPlanetStats("Satürn"),
  }), []);

  const planetNextRetros: Record<PlanetName, RetroPeriod | null> = useMemo(() => ({
    "Merkür":  getNextRetro("Merkür",  today),
    "Venüs":   getNextRetro("Venüs",   today),
    "Mars":    getNextRetro("Mars",    today),
    "Jüpiter": getNextRetro("Jüpiter", today),
    "Satürn":  getNextRetro("Satürn",  today),
  }), [today]);

  const activeCountAll = useMemo(() => getActiveRetros(today).length, [today]);
  const nextRetroAny   = useMemo(() => getUpcomingRetros(today, 365)[0] ?? null, [today]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function handleSearch() {
    const t = searchInput.trim();
    const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) { setSearchResult("invalid"); return; }
    const d = parseInt(m[1]!), mo = parseInt(m[2]!) - 1, y = parseInt(m[3]!);
    if (mo < 0 || mo > 11 || d < 1 || d > 31) { setSearchResult("invalid"); return; }
    const date = new Date(y, mo, Math.min(d, new Date(y, mo + 1, 0).getDate()));
    const active = getActiveRetros(date);
    setSearchResult(active.length > 0 ? active : "none");
  }

  return (
    <main className="relative w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 -top-16 h-96 w-96 rounded-full bg-rose-300/20 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute -right-32 top-[20%] h-80 w-80 rounded-full bg-orange-200/[0.15] blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-pink-200/10 blur-3xl" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 pt-4 pb-12 lg:px-8">

        {/* ── Hero ── */}
        <section className="relative mb-4 overflow-hidden rounded-[20px] border border-white/90 bg-gradient-to-br from-rose-100 via-pink-50 to-orange-50 px-5 py-4 shadow-[0_12px_40px_rgba(244,63,94,0.15)] backdrop-blur-xl sm:px-6">
          <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-rose-400/15 blur-[80px]" aria-hidden />
          <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-orange-300/15 blur-[80px]" aria-hidden />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-xl text-white shadow-md">☿</div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-600">Kozmik Merkezler</p>
                  <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Retro Takvimi</h1>
                </div>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs font-medium text-slate-600 sm:text-sm">
                Merkür, Venüs, Mars, Jüpiter ve Satürn retro dönemleri.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 rounded-xl border border-rose-200/60 bg-white/70 px-2.5 py-1.5 backdrop-blur-sm">
                  <span className={`h-2 w-2 rounded-full ${activeCountAll > 0 ? "animate-pulse bg-rose-400" : "bg-emerald-400"}`} />
                  <span className="text-[11px] font-black text-slate-700">
                    {activeCountAll > 0 ? `${activeCountAll} Aktif Retro` : "Aktif Retro Yok"}
                  </span>
                </div>
                {nextRetroAny && (
                  <div className="flex items-center gap-1.5 rounded-xl border border-orange-200/60 bg-white/70 px-2.5 py-1.5 backdrop-blur-sm">
                    <span className="text-[11px] leading-none">{PLANET_SYMBOLS[nextRetroAny.planet]}</span>
                    <span className="text-[11px] font-semibold text-slate-600">
                      Sıradaki: <span className="text-slate-800">{nextRetroAny.planet}</span> — {formatDate(parseRetroDate(nextRetroAny.start))}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/60 bg-white/70 px-2.5 py-1.5 backdrop-blur-sm">
                  <span className="text-[11px] text-slate-500">Veri: 2026–2036</span>
                </div>
              </div>
            </div>
            <Link
              href="/dashboard/cosmic-calendar"
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/80 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm no-underline transition hover:bg-white hover:text-rose-600"
            >
              <ArrowLeft className="h-3 w-3" /> Geri
            </Link>
          </div>
        </section>

        {/* ── Filtreler ── */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {(["Tümü", ...PLANETS] as PlanetFilter[]).map(planet => {
            const isActive = planetFilter === planet;
            const style    = planet !== "Tümü" ? PLANET_STYLES[planet as PlanetName] : null;
            return (
              <button
                key={planet}
                onClick={() => setPlanetFilter(planet)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold transition-all ${
                  isActive
                    ? planet === "Tümü"
                      ? "border border-slate-300 bg-slate-800 text-white shadow-sm"
                      : `${style!.bg} ${style!.text} border ${style!.border} shadow-sm`
                    : "border border-slate-200 bg-white/60 text-slate-400 hover:border-slate-300 hover:text-slate-600"
                }`}
              >
                {planet !== "Tümü" && (
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? style!.dot : "bg-slate-300"}`} />
                )}
                {planet}
              </button>
            );
          })}
        </div>

        {/* ── Aktif Retrolar ── */}
        <section className="mb-4">
          <p className="mb-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-rose-600">
            🔴 Şu An Aktif Retrolar
          </p>
          {activeRetros.length === 0 ? (
            <div className="rounded-[18px] border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white/60 px-4 py-6 text-center shadow-sm backdrop-blur-md">
              <p className="mb-1 text-2xl">✅</p>
              <p className="text-[13px] font-black text-emerald-700">Şu anda aktif retro bulunmuyor</p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {planetFilter !== "Tümü" ? `${planetFilter} direkt harekette` : "Tüm gezegenler direkt hareket halinde"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activeRetros.map(r => {
                const style   = PLANET_STYLES[r.planet];
                const endDate = parseRetroDate(r.end);
                const kalan   = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / 86_400_000));
                const dur     = durationDays(r);
                return (
                  <div
                    key={`${r.planet}-${r.start}`}
                    className={`rounded-[18px] border ${style.border} bg-gradient-to-br ${style.lightBg} to-white/80 p-4 shadow-sm backdrop-blur-md`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl leading-none">{r.symbol}</span>
                        <div>
                          <p className={`text-[10px] font-black uppercase tracking-[0.12em] ${style.text}`}>Aktif Dönem</p>
                          <p className="text-[15px] font-black text-slate-900">{r.planet} Retrosu</p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full ${style.bg} ${style.darkText} px-2 py-0.5 text-[9px] font-black`}>
                        {kalan} gün kaldı
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {[
                        ["Başlangıç", formatDate(parseRetroDate(r.start))],
                        ["Bitiş",     formatDate(endDate)],
                        ["Süre",      `${dur} gün`],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between rounded-lg bg-white/50 px-2 py-1">
                          <span className="text-[9px] text-slate-400">{label}</span>
                          <span className="text-[10px] font-semibold text-slate-700">{value}</span>
                        </div>
                      ))}
                    </div>
                    {r.theme && (
                      <p className={`mt-2.5 text-[9px] leading-snug ${style.text}`}>{r.theme}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Yaklaşan Retrolar ── */}
        <section className="mb-4 rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
          <p className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">
            📋 Yaklaşan Retrolar — Önümüzdeki 365 Gün
          </p>

          {upcomingRetros.length === 0 ? (
            <p className="py-5 text-center text-[11px] text-slate-400">
              {planetFilter !== "Tümü" ? `${planetFilter} için yaklaşan retro bulunamadı.` : "Yaklaşan retro bulunamadı."}
            </p>
          ) : (
            <>
              <div className="mb-1.5 hidden grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr] gap-2 border-b border-slate-100 pb-1.5 sm:grid">
                {["Gezegen", "Başlangıç", "Bitiş", "Süre", "Kaç Gün Sonra"].map((h, i) => (
                  <span key={h} className={`text-[8px] font-bold uppercase tracking-wider text-slate-400 ${i >= 3 ? "text-right" : ""}`}>{h}</span>
                ))}
              </div>
              <div className="divide-y divide-slate-100/60">
                {upcomingRetros.map(r => {
                  const style     = PLANET_STYLES[r.planet];
                  const startDate = parseRetroDate(r.start);
                  const endDate   = parseRetroDate(r.end);
                  const daysUntil = Math.ceil((startDate.getTime() - today.getTime()) / 86_400_000);
                  const dur       = durationDays(r);
                  return (
                    <div
                      key={`${r.planet}-${r.start}`}
                      className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr] sm:items-center sm:gap-2"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${style.bg}`}>
                          {r.symbol}
                        </span>
                        <span className={`text-[12px] font-black ${style.darkText}`}>{r.planet}</span>
                        <span className={`ml-auto text-[9px] font-bold sm:hidden ${
                          daysUntil <= 30 ? "text-rose-600" : daysUntil <= 90 ? "text-orange-600" : "text-slate-400"
                        }`}>{daysUntil}g</span>
                      </div>
                      <span className="text-[10px] text-slate-600">{formatDate(startDate)}</span>
                      <span className="hidden text-[10px] text-slate-500 sm:block">{formatDate(endDate)}</span>
                      <span className="hidden text-right text-[10px] text-slate-500 sm:block">{dur}g</span>
                      <div className="hidden sm:flex sm:justify-end">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black tabular-nums ${
                          daysUntil <= 30 ? "bg-rose-100 text-rose-700" :
                          daysUntil <= 90 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          {daysUntil}g
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* ── Retro Takvimi ── */}
        <section className="mb-4 rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
          <p className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">📅 Retro Takvimi</p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_156px]">
            {/* Takvim */}
            <div>
              {/* Ay navigasyonu */}
              <div className="mb-2 flex items-center gap-2">
                <button
                  onClick={prevMonth}
                  aria-label="Önceki ay"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="flex-1 text-center text-[13px] font-black text-slate-800">
                  {MONTH_NAMES_TR[viewMonth]} {viewYear}
                </h2>
                <button
                  onClick={nextMonth}
                  aria-label="Sonraki ay"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Gün başlıkları */}
              <div className="mb-0.5 grid grid-cols-7 gap-0.5">
                {DAY_HEADERS.map(h => (
                  <div key={h} className="py-1 text-center text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    {h}
                  </div>
                ))}
              </div>

              {/* Hücreler */}
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((day, i) => {
                  if (day === null) return <div key={`e-${i}`} className="h-11 rounded-lg" />;
                  const isToday        = day === todayDay && viewMonth === todayMonth && viewYear === todayYear;
                  const data           = monthRetroData.get(day);
                  const active         = data?.active ?? [];
                  const primaryPlanet  = active[0]?.planet ?? null;
                  const pStyle         = primaryPlanet ? PLANET_STYLES[primaryPlanet] : null;

                  return (
                    <div
                      key={day}
                      className={`group/cell relative flex h-11 flex-col items-center justify-start gap-0.5 rounded-lg p-1 transition-colors ${
                        isToday
                          ? "bg-gradient-to-b from-slate-700 to-slate-800 shadow-md"
                          : active.length > 0
                          ? `${pStyle!.calBg} border ${pStyle!.calBorder}`
                          : "bg-white/30 hover:bg-white/60"
                      }`}
                    >
                      <span className={`text-xs font-black leading-tight ${isToday ? "text-white" : "text-slate-700"}`}>
                        {day}
                      </span>
                      {isToday && <span className="text-[7px] leading-none text-white/70">bugün</span>}

                      {/* Başlangıç / bitiş ikonları */}
                      {data && (data.starts.length > 0 || data.ends.length > 0) && !isToday && (
                        <div className="flex gap-px">
                          {data.starts.length > 0 && (
                            <span className={`text-[7px] font-black leading-none ${PLANET_STYLES[data.starts[0]!.planet].text}`}>▶</span>
                          )}
                          {data.ends.length > 0 && data.starts.length === 0 && (
                            <span className={`text-[7px] font-black leading-none ${PLANET_STYLES[data.ends[0]!.planet].text}`}>◀</span>
                          )}
                        </div>
                      )}

                      {/* Gezegen noktaları */}
                      {active.length > 0 && (
                        <div className="mt-auto flex items-center gap-px">
                          {active.slice(0, 4).map(r => (
                            <span
                              key={r.planet}
                              className={`h-1 w-1 rounded-full ${isToday ? "bg-white/60" : PLANET_STYLES[r.planet].dot}`}
                            />
                          ))}
                        </div>
                      )}

                      {/* Tooltip */}
                      {data && (
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 min-w-max max-w-[160px] rounded-lg bg-slate-800 px-2 py-1.5 shadow-xl group-hover/cell:block">
                          <p className="mb-0.5 text-[9px] font-black text-white">
                            {day} {MONTH_NAMES_TR[viewMonth]}
                          </p>
                          {active.map(r => (
                            <p key={r.planet} className={`text-[9px] ${PLANET_STYLES[r.planet].text}`}>
                              {r.symbol} {r.planet} Retrosu
                            </p>
                          ))}
                          {data.starts.map(r => (
                            <p key={`s-${r.planet}`} className="text-[8px] text-emerald-300">▶ {r.planet} başlıyor</p>
                          ))}
                          {data.ends.map(r => (
                            <p key={`e-${r.planet}`} className="text-[8px] text-rose-300">◀ {r.planet} bitiyor</p>
                          ))}
                          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Lejant */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <p className="mb-2.5 text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">Renk Kodları</p>
              <div className="space-y-1.5">
                {PLANETS.map(p => {
                  const style = PLANET_STYLES[p];
                  return (
                    <div key={p} className="flex items-center gap-2">
                      <span className={`h-3 w-3 shrink-0 rounded-sm ${style.bg}`} />
                      <span className="text-[10px] text-slate-500">{PLANET_SYMBOLS[p]} {p}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 border-t border-slate-200 pt-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-3 text-center text-[10px] font-black text-slate-500">▶</span>
                  <span className="text-[9px] text-slate-500">Başlangıç</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 text-center text-[10px] font-black text-slate-500">◀</span>
                  <span className="text-[9px] text-slate-500">Bitiş</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 ml-0.5" />
                  <span className="text-[9px] text-slate-500">Aktif gün</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Gezegen Kartları ── */}
        <section className="mb-4">
          <p className="mb-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">🪐 Gezegen Özeti</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PLANETS.map(planet => {
              const style   = PLANET_STYLES[planet];
              const stats   = planetStats[planet];
              const next    = planetNextRetros[planet];
              const daysUntilNext = next
                ? Math.ceil((parseRetroDate(next.start).getTime() - today.getTime()) / 86_400_000)
                : null;
              const isCurrentlyActive = getActiveRetros(today).some(r => r.planet === planet);
              return (
                <div
                  key={planet}
                  className={`rounded-[16px] border ${style.border} bg-gradient-to-br ${style.lightBg} to-white/80 p-3 shadow-sm backdrop-blur-md`}
                >
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg ${style.bg}`}>
                      {PLANET_SYMBOLS[planet]}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-[12px] font-black leading-tight ${style.darkText}`}>{planet}</p>
                      {isCurrentlyActive && (
                        <p className="text-[8px] font-bold text-rose-500">● Aktif</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div>
                      <p className="text-[8px] text-slate-400">Sonraki Retro</p>
                      {next ? (
                        <>
                          <p className="text-[10px] font-semibold text-slate-700">{formatDate(parseRetroDate(next.start))}</p>
                          {daysUntilNext !== null && (
                            <p className={`text-[9px] font-bold ${daysUntilNext <= 30 ? "text-rose-600" : daysUntilNext <= 90 ? "text-orange-600" : style.text}`}>
                              {daysUntilNext} gün sonra
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-[9px] text-slate-400">Veri yok</p>
                      )}
                    </div>
                    <div className="border-t border-slate-100/80 pt-1.5 space-y-0.5">
                      {[
                        ["Ort. sıklık", `~${stats.avgFrequency}g`],
                        ["Ort. süre",   `~${stats.avgDuration}g`],
                        ["Kayıt",       `${stats.count} retro`],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-[8px] text-slate-400">{label}</span>
                          <span className="text-[9px] font-bold text-slate-600">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Tarih Araması ── */}
        <section className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
          <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">🔍 Tarih Araması</p>
          <p className="mb-2.5 text-[10px] text-slate-500">
            Bir tarih girin, o günde aktif retro var mı göreceğinizi öğrenin.
          </p>

          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
              <input
                type="text"
                placeholder="Örn: 15.08.2030"
                value={searchInput}
                onChange={e => { setSearchInput(e.target.value); setSearchResult(null); }}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                className="w-full rounded-xl border border-slate-200 bg-white/80 py-1.5 pl-8 pr-7 text-[11px] text-slate-700 placeholder:text-slate-300 focus:border-indigo-300 focus:outline-none"
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(""); setSearchResult(null); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <button
              onClick={handleSearch}
              disabled={!searchInput.trim()}
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-40"
            >
              Sorgula
            </button>
          </div>

          {searchResult === "invalid" && (
            <p className="mt-2 rounded-xl border border-rose-100 bg-rose-50/60 px-2.5 py-2 text-[10px] text-rose-600">
              ⚠ Geçersiz tarih. GG.AA.YYYY formatında girin — örn: 15.08.2030
            </p>
          )}
          {searchResult === "none" && (
            <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
              <p className="text-[11px] font-black text-emerald-700">✅ Bu tarihte aktif retro bulunmuyor</p>
              <p className="mt-0.5 text-[9px] text-slate-400">Tüm gezegenler direkt hareket halinde</p>
            </div>
          )}
          {Array.isArray(searchResult) && searchResult.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {searchResult.map(r => {
                const style = PLANET_STYLES[r.planet];
                return (
                  <div
                    key={`${r.planet}-${r.start}`}
                    className={`rounded-xl border ${style.border} ${style.lightBg} px-3 py-2.5`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl leading-none">{r.symbol}</span>
                      <div>
                        <p className={`text-[11px] font-black ${style.darkText}`}>{r.planet} Retrosu — Aktif</p>
                        <p className="text-[9px] text-slate-500">
                          {formatDate(parseRetroDate(r.start))} – {formatDate(parseRetroDate(r.end))}
                        </p>
                        {r.theme && (
                          <p className={`mt-0.5 text-[9px] ${style.text}`}>{r.theme}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
