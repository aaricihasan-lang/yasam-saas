"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
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

// Takvim tooltip metinleri — 4 ana ay fazı geçiş ikonu için
const PHASE_TOOLTIP: Record<string, string> = {
  "🌑": "Yeni Ay — Başlangıçlar için en güçlü an",
  "🌓": "İlk Dördün — Karar ve azim zamanı",
  "🌕": "Dolunay — Tamamlanma ve serbest bırakma",
  "🌗": "Son Dördün — Arınma ve döngü kapama",
};

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
    .split("")
    .map(Number);
  let n = digits.reduce((a, b) => a + b, 0);
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n).split("").map(Number).reduce((a, b) => a + b, 0);
  }
  return n;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Her ay için 4 ana fazın (Yeni Ay, İlk Dördün, Dolunay, Son Dördün)
 * geçiş yaptığı günleri bulur. Önceki günden farklılaşan ilk gün işaretlenir.
 */
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

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default function CosmicCalendarPage() {
  // Sayfa yüklenme anı — kararlı referans
  const [realNow] = useState(() => new Date());
  const todayYear  = realNow.getFullYear();
  const todayMonth = realNow.getMonth();
  const todayDay   = realNow.getDate();

  // Seçili gün (varsayılan: bugün gece yarısı)
  const [selectedDate, setSelectedDate] = useState<Date>(
    () => new Date(todayYear, todayMonth, todayDay),
  );

  // Takvim görünüm ayı
  const [viewYear,  setViewYear]  = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);

  // ── Takvim hesapları ──────────────────────────────────────────────────────
  const cells      = useMemo(() => buildCalendarCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const moonMarkers = useMemo(() => getMonthMoonMarkers(viewYear, viewMonth), [viewYear, viewMonth]);
  const hijriMonthYear = useMemo(
    () => getHijriMonthYear(new Date(viewYear, viewMonth, 15)),
    [viewYear, viewMonth],
  );

  // ── Seçili güne ait kozmik veriler ────────────────────────────────────────
  const moonPhase  = useMemo(() => getMoonPhase(selectedDate),   [selectedDate]);
  const moonSign   = useMemo(() => getMoonSign(selectedDate),    [selectedDate]);
  const energy     = useMemo(() => getDailyEnergySummary(selectedDate), [selectedDate]);
  const hijriDate  = useMemo(() => getHijriDate(selectedDate),   [selectedDate]);
  const miladiDate = useMemo(() => formatMiladiDate(selectedDate), [selectedDate]);
  const numDay     = useMemo(() => numerologicalDay(selectedDate), [selectedDate]);
  const dayRuler   = useMemo(() => getDayRuler(selectedDate),    [selectedDate]);
  const guidance   = useMemo(() => getDailyGuidance(selectedDate), [selectedDate]);
  const isSelectedToday = useMemo(() => isSameDay(selectedDate, realNow), [selectedDate, realNow]);

  // Gerçek zamanlı gezegen saati (bugün için)
  const ph = useMemo(() => getPlanetaryHour(realNow), [realNow]);

  // ── Ay navigasyonu ────────────────────────────────────────────────────────
  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }
  function selectDay(day: number) {
    setSelectedDate(new Date(viewYear, viewMonth, day));
  }

  // ── Kozmik Özet satırları (seçili güne göre) ──────────────────────────────
  const cosmicSummary = [
    { icon: "📅",            label: "Miladi",         value: miladiDate },
    { icon: "🌙",            label: "Hicri",          value: hijriDate },
    { icon: moonPhase.emoji, label: "Ay Fazı",        value: moonPhase.name },
    { icon: moonSign.emoji,  label: "Ay Burcu",       value: moonSign.name },
    { icon: "🔢",            label: "Numeroloji",     value: `${numDay} · ${NUM_NAMES[numDay] ?? ""}` },
    { icon: dayRuler.symbol, label: "Gün Yöneticisi", value: dayRuler.name },
  ];

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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-xl text-white shadow-md">
                  🌙
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
                    Yaşam Sistemi
                  </p>
                  <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                    Yaşam Takvimi / Kozmik Ajanda
                  </h1>
                </div>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs font-medium text-slate-600 sm:text-sm">
                Günlük enerji, hicri takvim, hacamat günleri ve kozmik döngüler tek merkezde.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BADGES.map((b) => (
                  <span
                    key={b}
                    className="rounded-full border border-indigo-200/80 bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 backdrop-blur-sm"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>

            <Link
              href="/"
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/80 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm no-underline transition hover:bg-white hover:text-indigo-700"
            >
              <ArrowLeft className="h-3 w-3" />
              Geri
            </Link>
          </div>
        </section>

        {/* ── Seçili Günün Enerjisi — ana yıldız kart ── */}
        <section className="relative mb-3 overflow-hidden rounded-[20px] border border-indigo-500/20 bg-gradient-to-br from-indigo-900 via-violet-900 to-indigo-800 p-4 shadow-[0_24px_64px_rgba(109,40,217,0.30),0_8px_24px_rgba(99,102,241,0.20)] sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-white/[0.02]" aria-hidden />
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-12 left-1/4 h-40 w-40 rounded-full bg-indigo-400/15 blur-3xl" aria-hidden />

          <div className="relative">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-indigo-300/70">
              🌙 {isSelectedToday ? "Bugünün Enerjisi" : `${miladiDate} Enerjisi`}
            </p>
            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              {energy.title}
            </h2>
            <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-indigo-100/75 sm:text-[13px]">
              {energy.mainTheme}
            </p>

            {/* 3 vurgu kutusu */}
            <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 backdrop-blur-sm">
                <p className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-300/60">🎯 Odak</p>
                <p className="text-[12px] font-bold text-white">{energy.focus}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 backdrop-blur-sm">
                <p className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-300/60">⚡ Enerji Teması</p>
                <p className="text-[12px] font-bold text-white">{energy.theme}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 backdrop-blur-sm">
                <p className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-300/60">💡 Öneri</p>
                <p className="text-[12px] font-bold text-white">{energy.recommendation}</p>
              </div>
            </div>

            {/* 4 mini rehber */}
            <div className="mt-1.5 grid grid-cols-2 gap-1 sm:grid-cols-4">
              {([
                { label: "💞 İlişkiler",      value: energy.relationship },
                { label: "💼 İş / Üretim",    value: energy.work },
                { label: "🧘 Ruhsal Çalışma", value: energy.spiritualPractice },
                { label: "⚠️ Dikkat",          value: energy.caution },
              ] as const).map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-2 backdrop-blur-sm"
                >
                  <p className="mb-0.5 text-[8px] font-black uppercase tracking-wider text-indigo-300/50">{label}</p>
                  <p className="text-[11px] font-medium leading-snug text-indigo-100/80">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Kozmik Özet — kompakt ── */}
        <div className="mb-4 overflow-hidden rounded-[18px] border border-white/80 bg-gradient-to-br from-indigo-600/[0.07] via-violet-500/[0.05] to-cyan-400/[0.07] p-2.5 shadow-sm backdrop-blur-md sm:p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">
            🌙 Kozmik Özet
            {!isSelectedToday && (
              <span className="normal-case text-[9px] font-semibold text-slate-400">
                — {miladiDate}
              </span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-6">
            {cosmicSummary.map(({ icon, label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-white/80 bg-white/60 px-2 py-1.5 backdrop-blur-sm"
              >
                <p className="text-[8px] font-semibold text-slate-400">{icon} {label}</p>
                <p className="mt-0.5 truncate text-[11px] font-black leading-tight text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Ana Grid: Takvim (sol) + Seçili Gün Detayı (sağ) ── */}
        <div className="grid grid-cols-1 gap-4 lg:items-start lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px]">

          {/* ── Sol: Aylık Takvim + Yaklaşan Olaylar ── */}
          <div className="flex flex-col gap-4">

            <div className="rounded-3xl border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-md">

              {/* Ay navigasyon toolbar */}
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={prevMonth}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700"
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
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700"
                  aria-label="Sonraki ay"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
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
                {DAY_HEADERS.map((h) => (
                  <div key={h} className="py-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {h}
                  </div>
                ))}
              </div>

              {/* Takvim hücreleri */}
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((day, i) => {
                  if (day === null) {
                    return <div key={`e-${i}`} className="h-10 rounded-lg" />;
                  }

                  const isToday    = day === todayDay && viewMonth === todayMonth && viewYear === todayYear;
                  const isSelected = !isToday &&
                    day === selectedDate.getDate() &&
                    viewMonth === selectedDate.getMonth() &&
                    viewYear === selectedDate.getFullYear();
                  const moonMarker = moonMarkers.get(day);

                  return (
                    <button
                      key={day}
                      onClick={() => selectDay(day)}
                      className={`group/day relative flex h-10 flex-col items-center justify-start gap-0.5 rounded-lg p-1 transition-colors ${
                        isToday
                          ? "bg-gradient-to-b from-violet-500 to-indigo-600 shadow-md shadow-indigo-300/40"
                          : isSelected
                            ? "ring-2 ring-inset ring-indigo-400 bg-indigo-50"
                            : moonMarker
                              ? "border border-violet-100 bg-violet-50/60 hover:bg-violet-100/60"
                              : "bg-white/30 hover:bg-white/60"
                      }`}
                    >
                      <span className={`text-xs font-black leading-tight ${isToday ? "text-white" : "text-slate-700"}`}>
                        {day}
                      </span>
                      {isToday && (
                        <span className="text-[7px] leading-none text-white/80">bugün</span>
                      )}
                      {!isToday && moonMarker && (
                        <>
                          <span className="text-[10px] leading-none">{moonMarker}</span>
                          {/* Tooltip */}
                          <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-2 py-1 text-[9px] font-semibold leading-tight text-white shadow-xl group-hover/day:block">
                            {PHASE_TOOLTIP[moonMarker] ?? "Ay fazı geçişi"}
                            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Yaklaşan Olaylar */}
            <div className="rounded-3xl border border-white/80 bg-white/70 px-3 pt-2.5 pb-2 shadow-sm backdrop-blur-md">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-violet-700">
                Yaklaşan Olaylar
              </p>
              <div className="divide-y divide-slate-100/80">
                {UPCOMING_EVENTS.map(({ days, text, icon }) => (
                  <div key={text} className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0">
                    <span className="text-sm leading-none">{icon}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">{text}</span>
                    <span className="shrink-0 rounded-full bg-indigo-100/80 px-1.5 py-0.5 text-[9px] font-black tabular-nums text-indigo-700">
                      {days}g
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Sağ Panel: Seçili Gün Detayı ── */}
          <div className="flex flex-col gap-3">

            {/* Seçili Gün Detayı kartı */}
            <div className="rounded-3xl border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm text-white shadow-sm">
                  📅
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700">
                    Seçili Gün Detayı
                  </p>
                  {isSelectedToday && (
                    <span className="text-[9px] font-semibold text-emerald-600">● Bugün</span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                {/* Miladi Tarih */}
                <div className="rounded-xl bg-slate-50/70 px-2.5 py-2">
                  <p className="text-[9px] text-slate-400">📅 Miladi Tarih</p>
                  <p className="text-[12px] font-black text-slate-800">{miladiDate}</p>
                </div>

                {/* Hicri Tarih */}
                <div className="rounded-xl bg-slate-50/70 px-2.5 py-2">
                  <p className="text-[9px] text-slate-400">🕋 Hicri Tarih</p>
                  <p className="text-[12px] font-black text-slate-700">{hijriDate}</p>
                </div>

                {/* Ay Fazı */}
                <div className="rounded-xl bg-slate-50/70 px-2.5 py-2">
                  <p className="text-[9px] text-slate-400">{moonPhase.emoji} Ay Fazı</p>
                  <p className="text-[12px] font-black text-violet-700">{moonPhase.name}</p>
                </div>

                {/* Ay Burcu */}
                <div className="rounded-xl bg-slate-50/70 px-2.5 py-2">
                  <p className="text-[9px] text-slate-400">{moonSign.emoji} Ay Burcu</p>
                  <p className="text-[12px] font-black text-indigo-700">{moonSign.name}</p>
                </div>

                {/* Numeroloji */}
                <div className="rounded-xl bg-slate-50/70 px-2.5 py-2">
                  <p className="text-[9px] text-slate-400">🔢 Numeroloji</p>
                  <p className="text-[12px] font-black text-slate-800">
                    {numDay} · {NUM_NAMES[numDay] ?? ""}
                  </p>
                </div>

                {/* Retro Durumu */}
                <div className="rounded-xl bg-slate-50/70 px-2.5 py-2">
                  <p className="text-[9px] text-slate-400">🪐 Retro Durumu</p>
                  <p className="text-[12px] font-black text-emerald-600">Aktif Retro Yok</p>
                </div>

                {/* Gezegen Saati Özeti */}
                <div className="rounded-xl bg-slate-50/70 px-2.5 py-2">
                  <p className="text-[9px] text-slate-400">{dayRuler.symbol} Gezegen Saati Özeti</p>
                  <p className="text-[12px] font-black text-indigo-700">{dayRuler.name} Günü</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{dayRuler.description}</p>
                </div>

                {/* Günlük Enerji Yorumu */}
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-2.5 py-2">
                  <p className="text-[9px] text-slate-400">💫 Günlük Enerji Yorumu</p>
                  <p className="text-[12px] font-black text-violet-700">{energy.title}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">{energy.mainTheme}</p>
                </div>
              </div>

              {/* ── Tarih Rehberi Katmanı ── */}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-indigo-600">
                  🔮 Günlük Rehber
                </p>

                <div className="space-y-1.5">
                  {/* Günün Potansiyeli */}
                  <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-2 py-1.5">
                    <p className="mb-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-violet-600">
                      ✨ Günün Potansiyeli
                    </p>
                    <p className="text-[10px] leading-snug text-slate-700">{guidance.potential}</p>
                  </div>

                  {/* Uygun Aktiviteler */}
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-2 py-1.5">
                    <p className="mb-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-emerald-700">
                      ✓ Uygun Aktiviteler
                    </p>
                    <ul className="space-y-0.5">
                      {guidance.activities.map((a, i) => (
                        <li key={i} className="flex items-center gap-1 text-[10px] text-slate-700">
                          <span className="shrink-0 font-black text-emerald-500">✓</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Dikkat Edilmesi Gerekenler */}
                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-2 py-1.5">
                    <p className="mb-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-amber-700">
                      ⚠ Dikkat Edilmesi Gerekenler
                    </p>
                    <ul className="space-y-0.5">
                      {guidance.cautions.map((c, i) => (
                        <li key={i} className="flex items-center gap-1 text-[10px] text-slate-700">
                          <span className="shrink-0 font-black text-amber-500">⚠</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Ruhsal Öneri */}
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-2 py-1.5">
                    <p className="mb-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-indigo-700">
                      🧘 Ruhsal Öneri
                    </p>
                    <p className="text-[10px] leading-snug text-slate-600">{guidance.spiritualSuggestion}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bugün seçiliyse gerçek zamanlı gezegen saati widget'ı */}
            {isSelectedToday && (
              <div className="overflow-hidden rounded-3xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-violet-50/60 to-indigo-50 p-3 shadow-sm backdrop-blur-md">
                <p className="mb-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700">
                  ⏰ Şu Anki Gezegen Saati
                </p>

                {/* Aktif gezegen — büyük görsel */}
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

                {/* Aktif / Sonraki / Kalan */}
                <div className="mb-2 grid grid-cols-3 gap-1.5">
                  <div className="rounded-xl bg-white/70 px-2 py-1.5">
                    <p className="text-[9px] text-slate-400">Aktif</p>
                    <p className="text-[12px] font-black text-indigo-700">
                      {ph.aktifGezegen.symbol} {ph.aktifGezegen.name}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/70 px-2 py-1.5">
                    <p className="text-[9px] text-slate-400">Sonraki</p>
                    <p className="text-[12px] font-black text-slate-700">
                      {ph.sonrakiGezegen.symbol} {ph.sonrakiGezegen.name}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/70 px-2 py-1.5">
                    <p className="text-[9px] text-slate-400">Kalan</p>
                    <p className="text-[12px] font-black text-violet-700">{ph.kalanDakika} dk</p>
                  </div>
                </div>

                {/* 7 gezegen sırası — aktif vurgulu */}
                <div className="mb-2 flex items-center justify-between rounded-2xl border border-indigo-100/80 bg-white/60 px-2 py-1.5">
                  {CHALDEAN_PLANETS.map((planet, idx) => {
                    const isActive = idx === ph.aktifChaldeanIdx;
                    return (
                      <div
                        key={planet.name}
                        className={`flex flex-col items-center gap-0.5 transition-all ${isActive ? "scale-125" : "opacity-35"}`}
                      >
                        <span className={`text-base leading-none ${isActive ? "text-indigo-600" : "text-slate-500"}`}>
                          {planet.symbol}
                        </span>
                        <span className={`text-[8px] leading-none ${isActive ? "font-black text-indigo-700" : "text-slate-400"}`}>
                          {planet.name.substring(0, 3)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Gün doğumu / batımı */}
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
