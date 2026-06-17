"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { getHijriDate, getHijriMonthYear } from "@/lib/cosmic/hijri";
import { getMoonPhase, getMoonSign } from "@/lib/cosmic/moon";
import { getDailyEnergySummary } from "@/lib/cosmic/energy";
import { getPlanetaryHour, getDayRuler, CHALDEAN_PLANETS } from "@/lib/cosmic/planetary-hours";
import { getDailyGuidance } from "@/lib/cosmic/guidance";

// ─── Sabit veriler ────────────────────────────────────────────────────────────

const MONTH_NAMES_TR: ReadonlyArray<string> = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const DAY_HEADERS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

const UPCOMING_EVENTS = [
  { days: 3,  text: "Beyaz Gün",                icon: "📅" },
  { days: 5,  text: "Hacamat için uygun gün",    icon: "🩸" },
  { days: 8,  text: "Dolunay",                   icon: "🌕" },
  { days: 12, text: "Merkür retrosu başlangıcı", icon: "🪐" },
] as const;

const LEGEND_ITEMS = [
  { icon: "🌑", label: "Yeni Ay" },
  { icon: "🌓", label: "İlk Dördün" },
  { icon: "🌕", label: "Dolunay" },
  { icon: "🌗", label: "Son Dördün" },
] as const;

const BADGES = [
  "🌙 Hicri Takvim",
  "🩸 Hacamat Günleri",
  "🌕 Ay Fazları",
  "🪐 Gezegen Saatleri",
] as const;

const NUM_NAMES: Record<number, string> = {
  1: "Liderlik", 2: "Uyum", 3: "Yaratıcılık", 4: "Düzen",
  5: "Değişim", 6: "Sevgi", 7: "Derinlik", 8: "Güç",
  9: "Tamamlanma", 11: "Sezgi", 22: "Vizyon", 33: "Şefkat",
};

const PHASE_TOOLTIP: Record<string, string> = {
  "🌑": "Yeni Ay — Niyetler ve yeni başlangıçlar için en güçlü an",
  "🌓": "İlk Dördün — Zorlukları aşma ve kararlı eylem zamanı",
  "🌕": "Dolunay — Tamamlanma, berraklık ve serbest bırakma doruk noktası",
  "🌗": "Son Dördün — Arınma, bırakma ve yeni dönem hazırlığı",
};

const MEDAL = ["🥇", "🥈", "🥉"] as const;

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth    = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatMiladiDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "numeric", month: "long", year: "numeric",
    }).format(date);
  } catch {
    return date.toLocaleDateString("tr-TR");
  }
}

function numerologicalDay(date: Date): number {
  const digits = `${date.getDate()}${date.getMonth() + 1}${date.getFullYear()}`
    .split("").map(Number);
  let n = digits.reduce((a, b) => a + b, 0);
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n).split("").map(Number).reduce((a, b) => a + b, 0);
  }
  return n;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getMonthMoonMarkers(year: number, month: number): Map<number, string> {
  const markers    = new Map<number, string>();
  const mainPhases = new Set(["Yeni Ay", "İlk Dördün", "Dolunay", "Son Dördün"]);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const today      = new Date(year, month, d, 12, 0, 0);
    const prev       = new Date(year, month, d - 1, 12, 0, 0);
    const todayPhase = getMoonPhase(today);
    const prevPhase  = getMoonPhase(prev);
    if (mainPhases.has(todayPhase.name) && todayPhase.name !== prevPhase.name) {
      markers.set(d, todayPhase.emoji);
    }
  }
  return markers;
}

/** Sonraki N gün içindeki 4 ana faz geçişlerini döndürür */
type PhaseEvent = { name: string; emoji: string; date: Date; daysFromNow: number };
function getUpcomingPhaseEvents(from: Date, daysAhead: number): PhaseEvent[] {
  const events: PhaseEvent[] = [];
  const mainPhases = new Set(["Yeni Ay", "İlk Dördün", "Dolunay", "Son Dördün"]);
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 1; i <= daysAhead; i++) {
    const today = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12, 0, 0);
    const prev  = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i - 1, 12, 0, 0);
    const tp    = getMoonPhase(today);
    const pp    = getMoonPhase(prev);
    if (mainPhases.has(tp.name) && tp.name !== pp.name) {
      events.push({ name: tp.name, emoji: tp.emoji, date: today, daysFromNow: i });
    }
  }
  return events;
}

/** Ay bazlı güçlü gün puanlaması */
type StrongDay = { day: number; score: number; reasons: string[] };
function getStrongDays(year: number, month: number): StrongDay[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const scored: StrongDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date  = new Date(year, month, d, 12, 0, 0);
    const phase = getMoonPhase(date);
    const num   = numerologicalDay(date);
    let score = 0;
    const reasons: string[] = [];
    if      (phase.name === "Dolunay")    { score += 3; reasons.push(`${phase.emoji} Dolunay`); }
    else if (phase.name === "Yeni Ay")    { score += 2; reasons.push(`${phase.emoji} Yeni Ay`); }
    else if (phase.name === "İlk Dördün") { score += 1; reasons.push(`${phase.emoji} İlk Dördün`); }
    if      (num === 11 || num === 22 || num === 33) { score += 3; reasons.push(`${num} üstay`); }
    else if (num === 1 || num === 8)                  { score += 1; reasons.push(`${num} sayısı`); }
    if (score > 0) scored.push({ day: d, score, reasons });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

/** Ay içindeki hicri gün numaraları */
function getMonthHijriDays(year: number, month: number): Map<number, number> {
  const map = new Map<number, number>();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  try {
    const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric" });
    for (let d = 1; d <= daysInMonth; d++) {
      const parts = fmt.formatToParts(new Date(year, month, d));
      const day   = parseInt(parts.find(p => p.type === "day")?.value ?? "0");
      if (!isNaN(day)) map.set(d, day);
    }
  } catch {}
  return map;
}

/** Ay içindeki numeroloji gün sayıları */
function getMonthNumeroDays(year: number, month: number): Map<number, number> {
  const map = new Map<number, number>();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    map.set(d, numerologicalDay(new Date(year, month, d)));
  }
  return map;
}

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default function CosmicCalendarPage() {
  const [realNow] = useState(() => new Date());
  const todayYear  = realNow.getFullYear();
  const todayMonth = realNow.getMonth();
  const todayDay   = realNow.getDate();

  // ── Temel state ───────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<Date>(
    () => new Date(todayYear, todayMonth, todayDay),
  );
  const [viewYear,  setViewYear]  = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);

  // ── Filtre state ──────────────────────────────────────────────────────────
  const [showMoonPhases,   setShowMoonPhases]   = useState(true);
  const [showHicriDays,    setShowHicriDays]    = useState(false);
  const [showNumeroloji,   setShowNumeroloji]   = useState(false);
  const [showOnemliGunler, setShowOnemliGunler] = useState(true);

  // ── Tarih atlama state ────────────────────────────────────────────────────
  const [dateInput, setDateInput] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);

  // ── Takvim hesapları ──────────────────────────────────────────────────────
  const cells       = useMemo(() => buildCalendarCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const moonMarkers = useMemo(() => getMonthMoonMarkers(viewYear, viewMonth), [viewYear, viewMonth]);
  const hijriMonthYear = useMemo(
    () => getHijriMonthYear(new Date(viewYear, viewMonth, 15)),
    [viewYear, viewMonth],
  );
  const hijriDayNumbers = useMemo(
    () => showHicriDays ? getMonthHijriDays(viewYear, viewMonth) : new Map<number, number>(),
    [viewYear, viewMonth, showHicriDays],
  );
  const numeroDayNumbers = useMemo(
    () => showNumeroloji ? getMonthNumeroDays(viewYear, viewMonth) : new Map<number, number>(),
    [viewYear, viewMonth, showNumeroloji],
  );

  // ── Faz 9: yeni hesaplar ──────────────────────────────────────────────────
  const upcomingEvents = useMemo(() => getUpcomingPhaseEvents(realNow, 60), [realNow]);
  const strongDays     = useMemo(() => getStrongDays(viewYear, viewMonth), [viewYear, viewMonth]);

  // ── Seçili güne ait veriler ───────────────────────────────────────────────
  const moonPhase  = useMemo(() => getMoonPhase(selectedDate),         [selectedDate]);
  const moonSign   = useMemo(() => getMoonSign(selectedDate),          [selectedDate]);
  const energy     = useMemo(() => getDailyEnergySummary(selectedDate),[selectedDate]);
  const hijriDate  = useMemo(() => getHijriDate(selectedDate),         [selectedDate]);
  const miladiDate = useMemo(() => formatMiladiDate(selectedDate),     [selectedDate]);
  const numDay     = useMemo(() => numerologicalDay(selectedDate),      [selectedDate]);
  const dayRuler   = useMemo(() => getDayRuler(selectedDate),          [selectedDate]);
  const guidance   = useMemo(() => getDailyGuidance(selectedDate),     [selectedDate]);
  const isSelectedToday = useMemo(() => isSameDay(selectedDate, realNow), [selectedDate, realNow]);

  const ph = useMemo(() => getPlanetaryHour(realNow), [realNow]);

  // ── Ay navigasyonu ────────────────────────────────────────────────────────
  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function selectDay(day: number) {
    setSelectedDate(new Date(viewYear, viewMonth, day));
  }

  // ── Tarih atlama ──────────────────────────────────────────────────────────
  function handleDateJump() {
    const t = dateInput.trim();
    // GG.AA.YYYY
    const m1 = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m1) {
      const d = parseInt(m1[1]!), mo = parseInt(m1[2]!) - 1, y = parseInt(m1[3]!);
      if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31) {
        setViewYear(y); setViewMonth(mo);
        setSelectedDate(new Date(y, mo, Math.min(d, new Date(y, mo + 1, 0).getDate())));
        setDateInput("");
      }
      return;
    }
    // "15 Ağustos 2026"
    const m2 = t.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
    if (m2) {
      const d = parseInt(m2[1]!), y = parseInt(m2[3]!);
      const mIdx = MONTH_NAMES_TR.findIndex(n => n.toLowerCase() === (m2[2] ?? "").toLowerCase());
      if (mIdx >= 0 && d >= 1 && d <= 31) {
        setViewYear(y); setViewMonth(mIdx);
        setSelectedDate(new Date(y, mIdx, Math.min(d, new Date(y, mIdx + 1, 0).getDate())));
        setDateInput("");
      }
    }
  }

  // ── Kozmik Özet satırları ─────────────────────────────────────────────────
  const cosmicSummary = [
    { icon: "📅",            label: "Miladi",         value: miladiDate },
    { icon: "🌙",            label: "Hicri",          value: hijriDate },
    { icon: moonPhase.emoji, label: "Ay Fazı",        value: moonPhase.name },
    { icon: moonSign.emoji,  label: "Ay Burcu",       value: moonSign.name },
    { icon: "🔢",            label: "Numeroloji",     value: `${numDay} · ${NUM_NAMES[numDay] ?? ""}` },
    { icon: dayRuler.symbol, label: "Gün Yöneticisi", value: dayRuler.name },
  ];

  // Hicri veya numeroloji filtresi açıksa hücreler biraz uzar
  const cellHeight = (showHicriDays || showNumeroloji) ? "h-12" : "h-10";

  return (
    <main className="relative w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)] text-slate-900 antialiased">

      {/* Ambient glows */}
      <div className="pointer-events-none absolute -left-32 -top-16 h-96 w-96 rounded-full bg-indigo-400/15 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute -right-32 top-[20%] h-80 w-80 rounded-full bg-violet-300/[0.12] blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pt-4 pb-12 lg:px-8">

        {/* ── Hero ── */}
        <section className="relative mb-3 overflow-hidden rounded-[20px] border border-white/90 bg-gradient-to-br from-indigo-200 via-violet-100 to-cyan-100 px-5 py-4 shadow-[0_12px_40px_rgba(99,102,241,0.18)] backdrop-blur-xl sm:px-6">
          <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-violet-400/20 blur-[80px]" aria-hidden />
          <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-cyan-400/20 blur-[80px]" aria-hidden />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-xl text-white shadow-md">🌙</div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Yaşam Sistemi</p>
                  <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Yaşam Takvimi / Kozmik Ajanda</h1>
                </div>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs font-medium text-slate-600 sm:text-sm">
                Günlük enerji, hicri takvim, hacamat günleri ve kozmik döngüler tek merkezde.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BADGES.map(b => (
                  <span key={b} className="rounded-full border border-indigo-200/80 bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 backdrop-blur-sm">{b}</span>
                ))}
              </div>
            </div>
            <Link href="/" className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/80 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm no-underline transition hover:bg-white hover:text-indigo-700">
              <ArrowLeft className="h-3 w-3" /> Geri
            </Link>
          </div>
        </section>

        {/* ── Seçili Günün Enerjisi ── */}
        <section className="relative mb-3 overflow-hidden rounded-[20px] border border-indigo-500/20 bg-gradient-to-br from-indigo-900 via-violet-900 to-indigo-800 p-4 shadow-[0_24px_64px_rgba(109,40,217,0.30),0_8px_24px_rgba(99,102,241,0.20)] sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-white/[0.02]" aria-hidden />
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-12 left-1/4 h-40 w-40 rounded-full bg-indigo-400/15 blur-3xl" aria-hidden />
          <div className="relative">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-indigo-300/70">
              🌙 {isSelectedToday ? "Bugünün Enerjisi" : `${miladiDate} Enerjisi`}
            </p>
            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">{energy.title}</h2>
            <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-indigo-100/75 sm:text-[13px]">{energy.mainTheme}</p>
            <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {[
                { lbl: "🎯 Odak", val: energy.focus },
                { lbl: "⚡ Enerji Teması", val: energy.theme },
                { lbl: "💡 Öneri", val: energy.recommendation },
              ].map(({ lbl, val }) => (
                <div key={lbl} className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 backdrop-blur-sm">
                  <p className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-300/60">{lbl}</p>
                  <p className="text-[12px] font-bold text-white">{val}</p>
                </div>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1 sm:grid-cols-4">
              {([
                { label: "💞 İlişkiler",      value: energy.relationship },
                { label: "💼 İş / Üretim",    value: energy.work },
                { label: "🧘 Ruhsal Çalışma", value: energy.spiritualPractice },
                { label: "⚠️ Dikkat",          value: energy.caution },
              ] as const).map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-2 backdrop-blur-sm">
                  <p className="mb-0.5 text-[8px] font-black uppercase tracking-wider text-indigo-300/50">{label}</p>
                  <p className="text-[11px] font-medium leading-snug text-indigo-100/80">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Kozmik Özet — kompakt ── */}
        <div className="mb-3 overflow-hidden rounded-[18px] border border-white/80 bg-gradient-to-br from-indigo-600/[0.07] via-violet-500/[0.05] to-cyan-400/[0.07] p-2.5 shadow-sm backdrop-blur-md sm:p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">
            🌙 Kozmik Özet
            {!isSelectedToday && (
              <span className="normal-case text-[9px] font-semibold text-slate-400">— {miladiDate}</span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-6">
            {cosmicSummary.map(({ icon, label, value }) => (
              <div key={label} className="rounded-xl border border-white/80 bg-white/60 px-2 py-1.5 backdrop-blur-sm">
                <p className="text-[8px] font-semibold text-slate-400">{icon} {label}</p>
                <p className="mt-0.5 truncate text-[11px] font-black leading-tight text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Kozmik Zaman Çizelgesi — Faz 9 ── */}
        <div className="mb-4 rounded-[18px] border border-white/80 bg-white/70 p-2.5 shadow-sm backdrop-blur-md sm:p-3">
          <p className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">
            🌙 Önümüzdeki Önemli Kozmik Olaylar
          </p>
          <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
            {upcomingEvents.map((ev) => {
              const dateStr = `${ev.date.getDate()} ${MONTH_NAMES_TR[ev.date.getMonth()]}`;
              return (
                <button
                  key={ev.date.toISOString()}
                  onClick={() => {
                    const y = ev.date.getFullYear(), mo = ev.date.getMonth(), d = ev.date.getDate();
                    setViewYear(y); setViewMonth(mo);
                    setSelectedDate(new Date(y, mo, d));
                  }}
                  className="flex shrink-0 flex-col items-center rounded-2xl border border-indigo-100/80 bg-gradient-to-b from-indigo-50/80 to-violet-50/60 px-3 py-2 transition-colors hover:border-indigo-300 hover:bg-indigo-100/60"
                >
                  <span className="text-xl leading-none">{ev.emoji}</span>
                  <p className="mt-1 text-[9px] font-black text-indigo-700 whitespace-nowrap">{ev.name}</p>
                  <p className="text-[11px] font-black text-slate-800">
                    {ev.daysFromNow === 1 ? "Yarın" : `${ev.daysFromNow} gün`}
                  </p>
                  <p className="text-[8px] text-slate-400 whitespace-nowrap">{dateStr}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Ana Grid: Takvim (sol) + Sağ Panel ── */}
        <div className="grid grid-cols-1 gap-4 lg:items-start lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px]">

          {/* ── Sol: Aylık Takvim + Yaklaşan Olaylar ── */}
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-md">

              {/* Ay nav + Tarih Atlama */}
              <div className="mb-2 flex items-center gap-2">
                <button
                  onClick={prevMonth}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700"
                  aria-label="Önceki ay"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex flex-1 items-center justify-between">
                  <h2 className="text-base font-black text-slate-800">
                    {MONTH_NAMES_TR[viewMonth]} {viewYear}
                  </h2>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200/80">
                    🌙 {hijriMonthYear}
                  </span>
                </div>
                <button
                  onClick={nextMonth}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700"
                  aria-label="Sonraki ay"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Tarih Atlama input */}
              <div className="mb-2 flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-300" />
                  <input
                    ref={dateInputRef}
                    type="text"
                    placeholder="GG.AA.YYYY veya 15 Ağustos 2026"
                    value={dateInput}
                    onChange={e => setDateInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleDateJump()}
                    className="w-full rounded-lg border border-slate-200 bg-white/80 py-1 pl-6 pr-2 text-[10px] text-slate-700 placeholder:text-slate-300 focus:border-indigo-300 focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleDateJump}
                  disabled={!dateInput.trim()}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-40"
                >
                  Git
                </button>
              </div>

              {/* Filtre çubuğu */}
              <div className="mb-2 flex flex-wrap gap-1">
                {([
                  { label: "Ay Fazları", emoji: "🌕", active: showMoonPhases,   toggle: () => setShowMoonPhases(v => !v) },
                  { label: "Hicri",      emoji: "🌙", active: showHicriDays,    toggle: () => setShowHicriDays(v => !v) },
                  { label: "Numeroloji", emoji: "🔢", active: showNumeroloji,   toggle: () => setShowNumeroloji(v => !v) },
                  { label: "Önemli",     emoji: "⭐", active: showOnemliGunler, toggle: () => setShowOnemliGunler(v => !v) },
                ] as const).map(({ label, emoji, active, toggle }) => (
                  <button
                    key={label}
                    onClick={toggle}
                    className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-semibold transition-colors ${
                      active
                        ? "border border-indigo-200 bg-indigo-100 text-indigo-700"
                        : "border border-slate-200 bg-slate-100 text-slate-400"
                    }`}
                  >
                    {emoji} {label}
                  </button>
                ))}
              </div>

              {/* Lejant */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-slate-100/80 pb-2 mb-2">
                {LEGEND_ITEMS.map(({ icon, label }) => (
                  <span key={label} className="flex items-center gap-0.5 text-[10px] text-slate-400">
                    {icon} {label}
                  </span>
                ))}
              </div>

              {/* Gün başlıkları */}
              <div className="mb-0.5 grid grid-cols-7 gap-0.5">
                {DAY_HEADERS.map(h => (
                  <div key={h} className="py-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</div>
                ))}
              </div>

              {/* Takvim hücreleri */}
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((day, i) => {
                  if (day === null) return <div key={`e-${i}`} className={`${cellHeight} rounded-lg`} />;

                  const isToday    = day === todayDay && viewMonth === todayMonth && viewYear === todayYear;
                  const isSelected = !isToday &&
                    day === selectedDate.getDate() &&
                    viewMonth === selectedDate.getMonth() &&
                    viewYear === selectedDate.getFullYear();
                  const moonMarker  = showMoonPhases ? moonMarkers.get(day) : undefined;
                  const hasMoonBg   = showOnemliGunler && !!moonMarkers.get(day);
                  const hijriNum    = hijriDayNumbers.get(day);
                  const numeroNum   = numeroDayNumbers.get(day);
                  const showSub     = (showHicriDays && hijriNum) || (showNumeroloji && numeroNum);

                  return (
                    <button
                      key={day}
                      onClick={() => selectDay(day)}
                      className={`group/day relative flex ${cellHeight} flex-col items-center justify-start gap-0.5 rounded-lg p-1 transition-colors ${
                        isToday
                          ? "bg-gradient-to-b from-violet-500 to-indigo-600 shadow-md shadow-indigo-300/40"
                          : isSelected
                            ? "ring-2 ring-inset ring-indigo-400 bg-indigo-50"
                            : hasMoonBg
                              ? "border border-violet-100 bg-violet-50/60 hover:bg-violet-100/60"
                              : "bg-white/30 hover:bg-white/60"
                      }`}
                    >
                      <span className={`text-xs font-black leading-tight ${isToday ? "text-white" : "text-slate-700"}`}>
                        {day}
                      </span>
                      {isToday && <span className="text-[7px] leading-none text-white/80">bugün</span>}
                      {!isToday && moonMarker && (
                        <>
                          <span className="text-[10px] leading-none">{moonMarker}</span>
                          <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-2 py-1 text-[9px] font-semibold leading-tight text-white shadow-xl group-hover/day:block">
                            {PHASE_TOOLTIP[moonMarker] ?? "Ay fazı geçişi"}
                            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                          </span>
                        </>
                      )}
                      {showSub && (
                        <div className="mt-auto flex items-center gap-0.5">
                          {showHicriDays && hijriNum && (
                            <span className={`text-[6px] font-bold leading-none ${isToday ? "text-white/60" : "text-slate-300"}`}>
                              H{hijriNum}
                            </span>
                          )}
                          {showNumeroloji && numeroNum && (
                            <span className={`text-[6px] font-bold leading-none ${isToday ? "text-white/60" : "text-indigo-300"}`}>
                              N{numeroNum}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Yaklaşan Olaylar */}
            <div className="rounded-3xl border border-white/80 bg-white/70 px-3 pt-2.5 pb-2 shadow-sm backdrop-blur-md">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-violet-700">Yaklaşan Olaylar</p>
              <div className="divide-y divide-slate-100/80">
                {UPCOMING_EVENTS.map(({ days, text, icon }) => (
                  <div key={text} className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0">
                    <span className="text-sm leading-none">{icon}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">{text}</span>
                    <span className="shrink-0 rounded-full bg-indigo-100/80 px-1.5 py-0.5 text-[9px] font-black tabular-nums text-indigo-700">{days}g</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Sağ Panel ── */}
          <div className="flex flex-col gap-3">

            {/* Seçili Gün Detayı */}
            <div className="rounded-3xl border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm text-white shadow-sm">📅</div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700">Seçili Gün Detayı</p>
                  {isSelectedToday && <span className="text-[9px] font-semibold text-emerald-600">● Bugün</span>}
                </div>
              </div>
              <div className="space-y-1.5">
                {[
                  { icon: "📅", label: "Miladi Tarih",       value: miladiDate,                        color: "text-slate-800" },
                  { icon: "🕋", label: "Hicri Tarih",        value: hijriDate,                          color: "text-slate-700" },
                  { icon: moonPhase.emoji, label: "Ay Fazı", value: moonPhase.name,                    color: "text-violet-700" },
                  { icon: moonSign.emoji,  label: "Ay Burcu", value: moonSign.name,                    color: "text-indigo-700" },
                  { icon: "🔢", label: "Numeroloji",          value: `${numDay} · ${NUM_NAMES[numDay] ?? ""}`, color: "text-slate-800" },
                  { icon: "🪐", label: "Retro Durumu",        value: "Aktif Retro Yok",                 color: "text-emerald-600" },
                ].map(({ icon, label, value, color }) => (
                  <div key={label} className="rounded-xl bg-slate-50/70 px-2.5 py-2">
                    <p className="text-[9px] text-slate-400">{icon} {label}</p>
                    <p className={`text-[12px] font-black ${color}`}>{value}</p>
                  </div>
                ))}
                <div className="rounded-xl bg-slate-50/70 px-2.5 py-2">
                  <p className="text-[9px] text-slate-400">{dayRuler.symbol} Gezegen Saati Özeti</p>
                  <p className="text-[12px] font-black text-indigo-700">{dayRuler.name} Günü</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{dayRuler.description}</p>
                </div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-2.5 py-2">
                  <p className="text-[9px] text-slate-400">💫 Günlük Enerji Yorumu</p>
                  <p className="text-[12px] font-black text-violet-700">{energy.title}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">{energy.mainTheme}</p>
                </div>
              </div>

              {/* Tarih Rehberi */}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-indigo-600">🔮 Günlük Rehber</p>
                <div className="space-y-1.5">
                  <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-2 py-1.5">
                    <p className="mb-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-violet-600">✨ Günün Potansiyeli</p>
                    <p className="text-[10px] leading-snug text-slate-700">{guidance.potential}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-2 py-1.5">
                    <p className="mb-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-emerald-700">✓ Uygun Aktiviteler</p>
                    <ul className="space-y-0.5">
                      {guidance.activities.map((a, i) => (
                        <li key={i} className="flex items-center gap-1 text-[10px] text-slate-700">
                          <span className="shrink-0 font-black text-emerald-500">✓</span>{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-2 py-1.5">
                    <p className="mb-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-amber-700">⚠ Dikkat Edilmesi Gerekenler</p>
                    <ul className="space-y-0.5">
                      {guidance.cautions.map((c, i) => (
                        <li key={i} className="flex items-center gap-1 text-[10px] text-slate-700">
                          <span className="shrink-0 font-black text-amber-500">⚠</span>{c}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-2 py-1.5">
                    <p className="mb-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-indigo-700">🧘 Ruhsal Öneri</p>
                    <p className="text-[10px] leading-snug text-slate-600">{guidance.spiritualSuggestion}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bu Ayın Güçlü Günleri — Faz 9 */}
            <div className="rounded-3xl border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">🏆 Bu Ayın Güçlü Günleri</p>
              <p className="mb-2 text-[9px] text-slate-400">{MONTH_NAMES_TR[viewMonth]} {viewYear}</p>
              {strongDays.length === 0 ? (
                <p className="text-[10px] text-slate-400">Bu ay öne çıkan gün hesaplanamadı.</p>
              ) : (
                <div className="space-y-1.5">
                  {strongDays.map((sd, i) => (
                    <button
                      key={sd.day}
                      onClick={() => {
                        setSelectedDate(new Date(viewYear, viewMonth, sd.day));
                      }}
                      className="flex w-full items-center gap-2 rounded-xl bg-slate-50/70 px-2.5 py-2 text-left transition-colors hover:bg-amber-50/60"
                    >
                      <span className="text-base leading-none">{MEDAL[i]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black text-slate-800">
                          {sd.day} {MONTH_NAMES_TR[viewMonth]}
                        </p>
                        <p className="text-[9px] text-slate-400">{sd.reasons.join(" · ")}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700">
                        {sd.score}p
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Bugün seçiliyse gerçek zamanlı gezegen saati */}
            {isSelectedToday && (
              <div className="overflow-hidden rounded-3xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-violet-50/60 to-indigo-50 p-3 shadow-sm backdrop-blur-md">
                <p className="mb-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700">⏰ Şu Anki Gezegen Saati</p>
                <div className="mb-2 flex items-center gap-3 rounded-2xl border border-indigo-200/50 bg-white/80 px-3 py-2.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl text-white shadow-md">
                    {ph.aktifGezegen.symbol}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500">
                      {ph.isDayHour ? "Gündüz Saati" : "Gece Saati"} · {ph.isDayHour ? ph.saatIndex + 1 : ph.saatIndex - 11}. saat
                    </p>
                    <p className="text-sm font-black text-slate-900">{ph.aktifGezegen.name} Saati</p>
                    <p className="text-[11px] leading-snug text-slate-500">{ph.aktifGezegen.description}</p>
                  </div>
                </div>
                <div className="mb-2 grid grid-cols-3 gap-1.5">
                  <div className="rounded-xl bg-white/70 px-2 py-1.5">
                    <p className="text-[9px] text-slate-400">Aktif</p>
                    <p className="text-[12px] font-black text-indigo-700">{ph.aktifGezegen.symbol} {ph.aktifGezegen.name}</p>
                  </div>
                  <div className="rounded-xl bg-white/70 px-2 py-1.5">
                    <p className="text-[9px] text-slate-400">Sonraki</p>
                    <p className="text-[12px] font-black text-slate-700">{ph.sonrakiGezegen.symbol} {ph.sonrakiGezegen.name}</p>
                  </div>
                  <div className="rounded-xl bg-white/70 px-2 py-1.5">
                    <p className="text-[9px] text-slate-400">Kalan</p>
                    <p className="text-[12px] font-black text-violet-700">{ph.kalanDakika} dk</p>
                  </div>
                </div>
                <div className="mb-2 flex items-center justify-between rounded-2xl border border-indigo-100/80 bg-white/60 px-2 py-1.5">
                  {CHALDEAN_PLANETS.map((planet, idx) => {
                    const isActive = idx === ph.aktifChaldeanIdx;
                    return (
                      <div key={planet.name} className={`flex flex-col items-center gap-0.5 transition-all ${isActive ? "scale-125" : "opacity-35"}`}>
                        <span className={`text-base leading-none ${isActive ? "text-indigo-600" : "text-slate-500"}`}>{planet.symbol}</span>
                        <span className={`text-[8px] leading-none ${isActive ? "font-black text-indigo-700" : "text-slate-400"}`}>
                          {planet.name.substring(0, 3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>☀️ Doğum: {ph.gunDogumuStr}</span>
                  <span>🌅 Batım: {ph.gunBatimiStr}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
