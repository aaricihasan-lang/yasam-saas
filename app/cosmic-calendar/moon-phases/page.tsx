"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getMoonPhase,
  getMoonSign,
  getMoonAge,
  getMoonIllumination,
  SYNODIC_MONTH_DAYS,
  MOON_PHASE_BOUNDS,
  getMonthPhaseEvents,
  getUpcomingPhaseEvents,
  type MonthPhaseEvent,
} from "@/lib/cosmic/moon";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const MONTH_NAMES_TR: ReadonlyArray<string> = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const DAY_HEADERS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

const MAIN_PHASE_NAMES = new Set(["Yeni Ay", "İlk Dördün", "Dolunay", "Son Dördün"]);

type UpcomingFilter = "all" | "main";

// ─── Faz renk paleti (yalnız stil — yorum/öneri içermez) ─────────────────────

const PHASE_GUIDE: Record<string, {
  textColor: string;
  bgFrom: string;
  bgTo: string;
  border: string;
  badge: string;
  badgeText: string;
}> = {
  "Yeni Ay":       { textColor: "text-slate-200", bgFrom: "from-slate-800", bgTo: "to-slate-900",     border: "border-slate-600",  badge: "bg-slate-700",  badgeText: "text-slate-200"  },
  "Büyüyen Hilal": { textColor: "text-slate-700", bgFrom: "from-slate-50",  bgTo: "to-white",          border: "border-slate-200",  badge: "bg-slate-100",  badgeText: "text-slate-600"  },
  "İlk Dördün":    { textColor: "text-indigo-800", bgFrom: "from-indigo-50", bgTo: "to-indigo-100/60",  border: "border-indigo-200", badge: "bg-indigo-100", badgeText: "text-indigo-700" },
  "Şişen Ay":      { textColor: "text-violet-800", bgFrom: "from-violet-50", bgTo: "to-purple-50/60",   border: "border-violet-200", badge: "bg-violet-100", badgeText: "text-violet-700" },
  "Dolunay":       { textColor: "text-amber-800",  bgFrom: "from-amber-50",  bgTo: "to-yellow-50/80",   border: "border-amber-200",  badge: "bg-amber-100",  badgeText: "text-amber-700"  },
  "Azalan Ay":     { textColor: "text-orange-800", bgFrom: "from-orange-50", bgTo: "to-amber-50/60",    border: "border-orange-200", badge: "bg-orange-100", badgeText: "text-orange-700" },
  "Son Dördün":    { textColor: "text-rose-800",   bgFrom: "from-rose-50",   bgTo: "to-pink-50/60",     border: "border-rose-200",   badge: "bg-rose-100",   badgeText: "text-rose-700"   },
  "Balsamik":      { textColor: "text-purple-800", bgFrom: "from-purple-50", bgTo: "to-violet-50/60",   border: "border-purple-200", badge: "bg-purple-100", badgeText: "text-purple-700" },
};

// ─── Tip tanımları ─────────────────────────────────────────────────────────────

type PhaseTransition = {
  day:         number;
  date:        Date;
  phase:       { name: string; emoji: string };
  isMain:      boolean;
  daysFromNow: number;
  timeTR?:     string;  // AE tabanlı saat "HH:MM" (tüm fazlar için)
};

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatDate(date: Date): string {
  return `${date.getDate()} ${MONTH_NAMES_TR[date.getMonth()]} ${date.getFullYear()}`;
}

type CalDayData = {
  phaseName:    string;
  phaseEmoji:   string;
  isTransition: boolean;
  isMain:       boolean;
};

// AE tabanlı: gerçek TR günü kullanılır — noon-scan +1 gün kayması ortadan kalkar
function getMonthCalData(year: number, month: number): Map<number, CalDayData> {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const map         = new Map<number, CalDayData>();

  // AE faz olayları: hangi günde hangi faz başlıyor?
  const eventsByDay = new Map<number, MonthPhaseEvent>();
  for (const evt of getMonthPhaseEvents(year, month)) {
    eventsByDay.set(evt.day, evt); // aynı günde birden fazla olay imkânsız (~3.7 gün min aralık)
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const event = eventsByDay.get(d);
    if (event) {
      map.set(d, {
        phaseName:    event.name,
        phaseEmoji:   event.emoji,
        isTransition: true,
        isMain:       MAIN_PHASE_NAMES.has(event.name),
      });
    } else {
      // Geçişsiz gün: öğle-noon fazı sadece arka plan rengi için (tooltip yok)
      const tp = getMoonPhase(new Date(year, month, d, 12, 0, 0));
      map.set(d, { phaseName: tp.name, phaseEmoji: tp.emoji, isTransition: false, isMain: false });
    }
  }
  return map;
}

// AE tabanlı — gerçek TR tarihi, saat bilgisi dahil
function getMonthTransitions(year: number, month: number, today: Date): PhaseTransition[] {
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return getMonthPhaseEvents(year, month).map(evt => ({
    day:         evt.day,
    date:        new Date(year, month, evt.day, 12, 0, 0),
    phase:       { name: evt.name, emoji: evt.emoji },
    isMain:      MAIN_PHASE_NAMES.has(evt.name),
    daysFromNow: Math.round((new Date(year, month, evt.day).getTime() - todayMs) / 86_400_000),
    timeTR:      evt.timeTR,
  }));
}

function getUpcomingTransitions(from: Date, days: number): PhaseTransition[] {
  return getUpcomingPhaseEvents(from, days).map(evt => ({
    day:         evt.day,
    date:        evt.date,
    phase:       { name: evt.name, emoji: evt.emoji },
    isMain:      evt.isMain,
    daysFromNow: evt.daysFromNow,
    timeTR:      evt.timeTR,
  }));
}

// ─── Saat yardımcısı ─────────────────────────────────────────────────────────

/** PhaseTransition.timeTR'yi döner — AE tabanlı, tüm fazlar için mevcut. */
function getPhaseTime(t: PhaseTransition): string | undefined {
  return t.timeTR;
}

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default function MoonPhasesPage() {
  const today      = useMemo(() => new Date(), []);
  const todayYear  = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay   = today.getDate();

  const [viewYear,  setViewYear]  = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);
  const [upcomingFilter, setUpcomingFilter] = useState<UpcomingFilter>("all");

  // Bugünün ay verileri
  const todayPhase       = useMemo(() => getMoonPhase(today),       [today]);
  const todaySign        = useMemo(() => getMoonSign(today),        [today]);
  const todayAge         = useMemo(() => getMoonAge(today),         [today]);
  const todayIllumination = useMemo(() => getMoonIllumination(today), [today]);

  // Döngü ilerleme yüzdesi
  const cycleProgress = useMemo(() => (todayAge / SYNODIC_MONTH_DAYS) * 100, [todayAge]);

  // Sonraki faz geçişi
  const nextTransition = useMemo(() => getUpcomingTransitions(today, 30)[0] ?? null, [today]);

  // Takvim verisi
  const cells    = useMemo(() => buildCalendarCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const calData  = useMemo(() => getMonthCalData(viewYear, viewMonth),    [viewYear, viewMonth]);

  // Bu ay geçişleri
  const monthTransitions = useMemo(
    () => getMonthTransitions(viewYear, viewMonth, today),
    [viewYear, viewMonth, today],
  );

  // Yaklaşan geçişler (45 gün)
  const upcoming45 = useMemo(() => getUpcomingTransitions(today, 45), [today]);
  const upcomingFiltered = useMemo(
    () => upcomingFilter === "main" ? upcoming45.filter(t => t.isMain) : upcoming45,
    [upcoming45, upcomingFilter],
  );

  // Saat bilgisi artık upcoming45'teki timeTR'den geliyor — ayrı events lookup gerekmez

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  return (
    <main className="relative w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 -top-16 h-96 w-96 rounded-full bg-violet-300/20 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute -right-32 top-[20%] h-80 w-80 rounded-full bg-indigo-200/[0.15] blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-cyan-200/10 blur-3xl" aria-hidden />

      <div className="relative z-10 w-full px-4 pt-4 pb-8 sm:px-6 lg:px-8 xl:px-10">

        {/* ── Hero ── */}
        <section className="relative mb-4 overflow-hidden rounded-[20px] border border-white/90 bg-gradient-to-br from-indigo-100 via-violet-50 to-cyan-50 px-5 py-4 shadow-[0_12px_40px_rgba(99,102,241,0.15)] backdrop-blur-xl sm:px-6">
          <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-violet-400/15 blur-[80px]" aria-hidden />
          <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-cyan-400/15 blur-[80px]" aria-hidden />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-xl text-white shadow-md">🌙</div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">Kozmik Merkezler</p>
                  <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Ay Fazları Rehberi</h1>
                </div>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs font-medium text-slate-600 sm:text-sm">
                8 faz · Dinamik hesaplama · Geçmiş ve gelecek herhangi bir tarih
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 rounded-xl border border-violet-200/60 bg-white/70 px-2.5 py-1.5 backdrop-blur-sm">
                  <span className="text-lg leading-none">{todayPhase.emoji}</span>
                  <span className="text-[11px] font-black text-slate-800">{todayPhase.name}</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-xl border border-indigo-200/60 bg-white/70 px-2.5 py-1.5 backdrop-blur-sm">
                  <span className="text-[11px] font-semibold text-slate-600">
                    {todaySign.emoji} {todaySign.name} Burcu
                  </span>
                </div>
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/60 bg-white/70 px-2.5 py-1.5 backdrop-blur-sm">
                  <span className="text-[11px] text-slate-500">💡 {todayIllumination}% aydınlık</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Üst 2 Kolon: Bugünün Durumu + Bu Ayın Ana Fazları ── */}
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">

          {/* Bugünün Ay Durumu */}
          <section className="relative overflow-hidden rounded-[20px] border border-indigo-500/20 bg-gradient-to-br from-indigo-900 via-violet-900 to-indigo-800 p-4 shadow-[0_24px_64px_rgba(109,40,217,0.30)] sm:p-5">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-white/[0.02]" aria-hidden />
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" aria-hidden />
            <div className="relative">
              <p className="mb-3 text-[9px] font-black uppercase tracking-[0.25em] text-indigo-300/70">
                🌙 Bugünün Ay Durumu
              </p>
              <div className="flex items-center gap-4">
                <span className="text-5xl leading-none sm:text-6xl">{todayPhase.emoji}</span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300/60">Şu Anki Faz</p>
                  <h2 className="text-xl font-black text-white sm:text-2xl">{todayPhase.name}</h2>
                  <p className="mt-0.5 text-[11px] text-indigo-200/70">
                    {todaySign.emoji} {todaySign.name} Burcu · {todayIllumination}% aydınlık
                  </p>
                </div>
              </div>

              {/* Döngü ilerleme çubuğu */}
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[9px] text-indigo-300/60">
                  <span>Yeni Ay</span>
                  <span className="font-semibold text-indigo-200">
                    Gün {todayAge.toFixed(1)} / {SYNODIC_MONTH_DAYS.toFixed(1)}
                  </span>
                  <span>Yeni Ay</span>
                </div>
                <div className="relative h-3 w-full rounded-full bg-white/10">
                  {/* Faz segment'leri */}
                  {MOON_PHASE_BOUNDS.map(p => (
                    <div
                      key={p.name}
                      className="absolute top-0 h-full rounded-full opacity-30"
                      style={{
                        left:  `${(p.ageMin / SYNODIC_MONTH_DAYS) * 100}%`,
                        width: `${((p.ageMax - p.ageMin) / SYNODIC_MONTH_DAYS) * 100}%`,
                        background: MAIN_PHASE_NAMES.has(p.name) ? "rgba(255,255,255,0.3)" : "transparent",
                      }}
                    />
                  ))}
                  {/* İlerleme */}
                  <div
                    className="absolute top-0 h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-all"
                    style={{ width: `${cycleProgress}%` }}
                  />
                  {/* Faz ikonları */}
                  {MOON_PHASE_BOUNDS.map(p => (
                    <span
                      key={p.name}
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] leading-none"
                      style={{ left: `${(p.ageMin / SYNODIC_MONTH_DAYS) * 100}%` }}
                      title={p.name}
                    >
                      {p.emoji}
                    </span>
                  ))}
                  {/* Mevcut konum */}
                  <div
                    className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-violet-400 shadow-lg shadow-violet-400/50"
                    style={{ left: `${cycleProgress}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[8px] text-indigo-300/40">
                  <span>🌑 0g</span>
                  <span>🌓 7.4g</span>
                  <span>🌕 14.8g</span>
                  <span>🌗 22.1g</span>
                  <span>🌑 29.5g</span>
                </div>
              </div>

              {/* Sonraki geçiş */}
              {nextTransition && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2">
                  <span className="text-xl leading-none">{nextTransition.phase.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-300/60">Sonraki Faz</p>
                    <p className="text-[12px] font-black text-white">{nextTransition.phase.name}</p>
                    <p className="text-[9px] text-indigo-300/60">
                      {formatDate(nextTransition.date)}
                      {getPhaseTime(nextTransition) && ` · ${getPhaseTime(nextTransition)}`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-violet-500/30 px-2.5 py-1 text-[10px] font-black text-violet-200">
                    {nextTransition.daysFromNow === 1 ? "yarın" : `${nextTransition.daysFromNow}g`}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Bu Ayın Ana Fazları */}
          <section className="rounded-[20px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
            <p className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-violet-600">
              ✨ Bu Ayın Ana Fazları
            </p>
            <p className="mb-2 text-[10px] text-slate-400">
              {MONTH_NAMES_TR[viewMonth]} {viewYear}
            </p>

            {(() => {
              const mainThisMonth = getMonthTransitions(viewYear, viewMonth, today).filter(t => t.isMain);
              if (mainThisMonth.length === 0) {
                return <p className="py-4 text-center text-[11px] text-slate-400">Bu ayda ana faz bulunamadı.</p>;
              }
              return (
                <div className="space-y-2">
                  {mainThisMonth.map(t => {
                    const guide     = PHASE_GUIDE[t.phase.name];
                    const isPast    = t.daysFromNow < 0;
                    const isToday   = t.daysFromNow === 0;
                    const phaseTime = getPhaseTime(t);
                    return (
                      <div
                        key={`${t.phase.name}-${t.day}`}
                        className={`rounded-xl border bg-gradient-to-br px-3 py-2.5 ${guide?.border ?? "border-slate-200"} ${guide?.bgFrom ?? "from-slate-50"} ${guide?.bgTo ?? "to-white"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xl leading-none">{t.phase.emoji}</span>
                            <div>
                              <p className={`text-[11px] font-black ${guide?.textColor ?? "text-slate-800"}`}>
                                {t.phase.name}
                              </p>
                              <p className="text-[9px] text-slate-500">{formatDate(t.date)}</p>
                              {phaseTime && (
                                <p className="text-[9px] font-semibold tabular-nums text-slate-600">{phaseTime}</p>
                              )}
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black ${
                            isToday ? "bg-emerald-100 text-emerald-700" :
                            isPast  ? "bg-slate-100 text-slate-400" :
                            t.daysFromNow <= 7 ? "bg-violet-100 text-violet-700" : "bg-indigo-50 text-indigo-600"
                          }`}>
                            {isToday ? "Bugün" : isPast ? `${Math.abs(t.daysFromNow)}g önce` : `${t.daysFromNow}g sonra`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Tüm bu ay geçişleri (secondary) */}
            {monthTransitions.filter(t => !t.isMain).length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-2 text-[8px] font-black uppercase tracking-[0.15em] text-slate-400">Diğer Geçişler</p>
                <div className="flex flex-wrap gap-1.5">
                  {monthTransitions.filter(t => !t.isMain).map(t => (
                    <div
                      key={`${t.phase.name}-${t.day}`}
                      className="flex items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50/70 px-2 py-1"
                    >
                      <span className="text-[12px] leading-none">{t.phase.emoji}</span>
                      <span className="text-[9px] text-slate-600">{t.phase.name}</span>
                      <span className="text-[8px] text-slate-400">· {t.day} {MONTH_NAMES_TR[viewMonth]?.slice(0, 3)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── Aylık Takvim ── */}
        <section className="mb-4 rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
          <p className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">📅 Aylık Faz Takvimi</p>

          {/* Ay nav */}
          <div className="mb-2 flex items-center gap-2">
            <button
              onClick={prevMonth}
              aria-label="Önceki ay"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-violet-50 hover:text-violet-600"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="flex-1 text-center text-[13px] font-black text-slate-800">
              {MONTH_NAMES_TR[viewMonth]} {viewYear}
            </h2>
            <button
              onClick={nextMonth}
              aria-label="Sonraki ay"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-violet-50 hover:text-violet-600"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Lejant */}
          <div className="mb-2.5 flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-100 pb-2.5">
            <span className="flex items-center gap-1 text-[9px] text-slate-400">🌑🌒🌓🌔🌕🌖🌗🌘 8 faz geçişi işaretli</span>
            <span className="flex items-center gap-1.5 text-[9px] text-slate-400">
              <span className="inline-block h-3 w-3 rounded-sm bg-violet-200/70" /> Ana faz (4)
            </span>
            <span className="flex items-center gap-1.5 text-[9px] text-slate-400">
              <span className="inline-block h-3 w-3 rounded-sm bg-slate-100/80" /> İkincil faz (4)
            </span>
          </div>

          {/* Gün başlıkları */}
          <div className="mb-0.5 grid grid-cols-7 gap-0.5">
            {DAY_HEADERS.map(h => (
              <div key={h} className="py-1 text-center text-[9px] font-bold uppercase tracking-wide text-slate-400">{h}</div>
            ))}
          </div>

          {/* Hücreler */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (day === null) return <div key={`e-${i}`} className="h-12 rounded-lg" />;
              const isToday  = day === todayDay && viewMonth === todayMonth && viewYear === todayYear;
              const data     = calData.get(day);
              const isMain   = data?.isMain ?? false;
              const isSec    = (data?.isTransition ?? false) && !isMain;
              const guide    = data?.isTransition ? PHASE_GUIDE[data.phaseName] : undefined;

              return (
                <div
                  key={day}
                  className={`group/cell relative flex h-12 flex-col items-center justify-start gap-0.5 rounded-lg p-1 transition-colors ${
                    isToday
                      ? "bg-gradient-to-b from-violet-600 to-indigo-700 shadow-md shadow-violet-300/40"
                      : isMain
                      ? `bg-gradient-to-br ${guide?.bgFrom ?? "from-violet-50"} ${guide?.bgTo ?? "to-white"} border ${guide?.border ?? "border-violet-200"}`
                      : isSec
                      ? "border border-slate-200/60 bg-slate-50/70"
                      : "bg-white/30 hover:bg-white/60"
                  }`}
                >
                  <span className={`text-xs font-black leading-tight ${isToday ? "text-white" : "text-slate-700"}`}>
                    {day}
                  </span>
                  {isToday && <span className="text-[7px] leading-none text-white/70">bugün</span>}
                  {!isToday && data?.isTransition && (
                    <span className={`text-[11px] leading-none ${isMain ? "text-[13px]" : ""}`}>
                      {data.phaseEmoji}
                    </span>
                  )}

                  {/* Tooltip */}
                  {data?.isTransition && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 min-w-max max-w-[160px] rounded-lg bg-slate-800 px-2 py-1.5 shadow-xl group-hover/cell:block">
                      <p className="text-[9px] font-black text-white">{data.phaseEmoji} {data.phaseName}</p>
                      <p className="text-[8px] text-slate-300">{day} {MONTH_NAMES_TR[viewMonth]} {viewYear}</p>
                      <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Yaklaşan Fazlar ── */}
        <section className="mb-4 rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">
              🔮 Yaklaşan Fazlar — Önümüzdeki 45 Gün
            </p>
            <div className="flex gap-1">
              {([
                { key: "all",  label: "Tüm Fazlar" },
                { key: "main", label: "Ana Fazlar"  },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => setUpcomingFilter(f.key)}
                  className={`rounded-full px-2.5 py-0.5 text-[9px] font-semibold transition-colors ${
                    upcomingFilter === f.key
                      ? "border border-violet-200 bg-violet-100 text-violet-700"
                      : "border border-slate-200 bg-slate-100 text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {upcomingFiltered.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-slate-400">Bu dönemde faz bulunamadı.</p>
          ) : (
            <>
              {/* Masaüstü başlık */}
              <div className="mb-1.5 hidden grid-cols-[2rem_1fr_1fr_auto_1fr_1fr] gap-2 border-b border-slate-100 pb-1.5 sm:grid">
                {["", "Faz", "Tarih", "Saat", "Tür", "Kaç Gün"].map((h, i) => (
                  <span key={i} className={`text-[8px] font-bold uppercase tracking-wider text-slate-400 ${i === 5 ? "text-right" : ""}`}>{h}</span>
                ))}
              </div>
              <div className="divide-y divide-slate-100/60">
                {upcomingFiltered.map((t, idx) => {
                  const guide     = PHASE_GUIDE[t.phase.name];
                  const phaseTime = getPhaseTime(t);
                  return (
                    <div
                      key={`${t.phase.name}-${t.date.toISOString()}-${idx}`}
                      className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 py-2 sm:grid-cols-[2rem_1fr_1fr_auto_1fr_1fr]"
                    >
                      <span className="text-xl leading-none">{t.phase.emoji}</span>
                      <div>
                        <p className="text-[12px] font-black text-slate-800">{t.phase.name}</p>
                        <p className="text-[9px] text-slate-400 sm:hidden">
                          {formatDate(t.date)}{phaseTime && ` · ${phaseTime}`}
                        </p>
                      </div>
                      <span className="hidden text-[10px] text-slate-600 sm:block">{formatDate(t.date)}</span>
                      <span className="hidden sm:block">
                        {phaseTime
                          ? <span className="tabular-nums text-[10px] font-semibold text-slate-700">{phaseTime}</span>
                          : <span className="text-[10px] text-slate-300">—</span>}
                      </span>
                      <div className="hidden sm:block">
                        <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold ${
                          guide?.badge ?? "bg-slate-100"} ${guide?.badgeText ?? "text-slate-600"
                        }`}>
                          {t.isMain ? "Ana Faz" : "İkincil"}
                        </span>
                      </div>
                      <div className="sm:flex sm:justify-end">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black tabular-nums ${
                          t.daysFromNow <= 7  ? "bg-violet-100 text-violet-700" :
                          t.daysFromNow <= 21 ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"
                        }`}>
                          {t.daysFromNow === 1 ? "yarın" : `${t.daysFromNow}g`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* ── 8 Ay Fazı — Astronomik Referans ── */}
        <section>
          <p className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">
            📖 8 Ay Fazı — Astronomik Referans
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MOON_PHASE_BOUNDS.map(bound => {
              const guide       = PHASE_GUIDE[bound.name];
              const isCurrent   = todayPhase.name === bound.name;
              const isMainPhase = MAIN_PHASE_NAMES.has(bound.name);
              if (!guide) return null;
              return (
                <div
                  key={bound.name}
                  className={`relative rounded-[16px] border bg-gradient-to-br p-3 shadow-sm backdrop-blur-md transition-shadow ${
                    guide.bgFrom} ${guide.bgTo} ${guide.border
                  } ${isCurrent ? "ring-2 ring-violet-400 shadow-lg shadow-violet-200/40" : ""}`}
                >
                  {isCurrent && (
                    <div className="absolute -right-1.5 -top-1.5 rounded-full bg-violet-500 px-2 py-0.5 text-[8px] font-black text-white shadow-sm">
                      Şu An
                    </div>
                  )}
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xl leading-none">{bound.emoji}</span>
                    {isMainPhase && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[7px] font-black ${guide.badge} ${guide.badgeText}`}>
                        Ana Faz
                      </span>
                    )}
                  </div>
                  <h3 className={`mb-1.5 text-[12px] font-black ${guide.textColor}`}>{bound.name}</h3>
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between rounded-lg bg-white/40 px-2 py-1">
                      <span className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">Ay yaşı</span>
                      <span className="tabular-nums text-[10px] font-semibold text-slate-600">
                        {bound.ageMin.toFixed(1)}–{bound.ageMax.toFixed(1)} gün
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-white/40 px-2 py-1">
                      <span className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">Tür</span>
                      <span className="text-[10px] font-semibold text-slate-600">
                        {isMainPhase ? "Ana faz" : "İkincil faz"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
            Faz sınırları sinodik ay yaşına (0–{SYNODIC_MONTH_DAYS.toFixed(1)} gün) göre astronomy-engine ile hesaplanır.
            Bu sayfa yalnız doğrulanmış astronomik faz verisini gösterir; yorum, öneri veya tavsiye içermez.
          </p>
        </section>

      </div>
    </main>
  );
}
