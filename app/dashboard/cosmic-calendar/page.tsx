"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { getHijriDate, getHijriMonthYear } from "@/lib/cosmic/hijri";
import { getMoonPhase, getMoonSign } from "@/lib/cosmic/moon";
import { getDailyEnergySummary } from "@/lib/cosmic/energy";
import { getPlanetaryHour, getDayRuler, CHALDEAN_PLANETS } from "@/lib/cosmic/planetary-hours";
import { getDailyGuidance } from "@/lib/cosmic/guidance";
import {
  getActiveRetros, getUpcomingRetros, getNextRetro, parseRetroDate,
  RETRO_PERIODS,
  type RetroPeriod, type PlanetName,
} from "@/lib/cosmic/retro";

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
  { icon: "🌑", label: "Yeni Ay"    },
  { icon: "🌓", label: "İlk Dördün" },
  { icon: "🌕", label: "Dolunay"    },
  { icon: "🌗", label: "Son Dördün" },
  { icon: "☿",  label: "Retro"      },
] as const;

const BADGES = [
  "🌙 Hicri Takvim", "🩸 Hacamat Günleri", "🌕 Ay Fazları", "🪐 Gezegen Saatleri",
] as const;

const NUM_NAMES: Record<number, string> = {
  1: "Liderlik", 2: "Uyum", 3: "Yaratıcılık", 4: "Düzen",
  5: "Değişim",  6: "Sevgi", 7: "Derinlik",   8: "Güç",
  9: "Tamamlanma", 11: "Sezgi", 22: "Vizyon", 33: "Şefkat",
};

const PHASE_TOOLTIP: Record<string, string> = {
  "🌑": "Yeni Ay — Niyetler ve yeni başlangıçlar için en güçlü an",
  "🌓": "İlk Dördün — Zorlukları aşma ve kararlı eylem zamanı",
  "🌕": "Dolunay — Tamamlanma, berraklık ve serbest bırakma doruk noktası",
  "🌗": "Son Dördün — Arınma, bırakma ve yeni dönem hazırlığı",
};

// ─── Arama sabitleri ──────────────────────────────────────────────────────────

const PHASE_KEYWORDS: Record<string, { name: string; emoji: string }> = {
  "dolunay":    { name: "Dolunay",    emoji: "🌕" },
  "yeni ay":    { name: "Yeni Ay",    emoji: "🌑" },
  "ilk dördün": { name: "İlk Dördün", emoji: "🌓" },
  "son dördün": { name: "Son Dördün", emoji: "🌗" },
};

const MONTH_NAME_MAP: Record<string, number> = {
  "ocak": 0, "şubat": 1, "mart": 2,    "nisan": 3,  "mayıs": 4,  "haziran": 5,
  "temmuz": 6, "ağustos": 7, "eylül": 8, "ekim": 9, "kasım": 10, "aralık": 11,
};

const RETRO_PLANET_KEYWORDS: Record<string, PlanetName> = {
  "merkür": "Merkür", "merkur": "Merkür",
  "venüs":  "Venüs",  "venus":  "Venüs",
  "mars":   "Mars",
  "jüpiter":"Jüpiter","jupiter":"Jüpiter",
  "satürn": "Satürn", "saturn": "Satürn",
};

// ─── Tip tanımları ────────────────────────────────────────────────────────────

type PhaseEvent = { name: string; emoji: string; date: Date; daysFromNow: number };

type SearchResultPhase     = { kind: "phase" } & PhaseEvent;
type SearchResultDay       = { kind: "day";       date: Date };
type SearchResultError     = { kind: "error";     message: string };
type SearchResultRetro     = { kind: "retro";     period: RetroPeriod; daysUntilStart: number };
type SearchResultRetroList = { kind: "retroList"; periods: RetroPeriod[]; label: string };
type SearchResult =
  | SearchResultPhase | SearchResultDay | SearchResultError
  | SearchResultRetro | SearchResultRetroList | null;

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

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
    return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(date);
  } catch {
    return date.toLocaleDateString("tr-TR");
  }
}

function formatShortDate(date: Date): string {
  return `${date.getDate()} ${MONTH_NAMES_TR[date.getMonth()]} ${date.getFullYear()}`;
}

function numerologicalDay(date: Date): number {
  const digits = `${date.getDate()}${date.getMonth() + 1}${date.getFullYear()}`.split("").map(Number);
  let n = digits.reduce((a, b) => a + b, 0);
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n).split("").map(Number).reduce((a, b) => a + b, 0);
  }
  return n;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getMonthMoonMarkers(year: number, month: number): Map<number, string> {
  const markers    = new Map<number, string>();
  const mainPhases = new Set(["Yeni Ay", "İlk Dördün", "Dolunay", "Son Dördün"]);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const today = new Date(year, month, d, 12, 0, 0);
    const prev  = new Date(year, month, d - 1, 12, 0, 0);
    const tp    = getMoonPhase(today), pp = getMoonPhase(prev);
    if (mainPhases.has(tp.name) && tp.name !== pp.name) markers.set(d, tp.emoji);
  }
  return markers;
}

/** Görüntülenen ay içindeki retro başlangıç günleri */
function getMonthRetroMarkers(year: number, month: number): Map<number, RetroPeriod[]> {
  const map = new Map<number, RetroPeriod[]>();
  for (const r of RETRO_PERIODS) {
    const s = parseRetroDate(r.start);
    if (s.getFullYear() === year && s.getMonth() === month) {
      const d = s.getDate();
      map.set(d, [...(map.get(d) ?? []), r]);
    }
  }
  return map;
}

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

function getMonthNumeroDays(year: number, month: number): Map<number, number> {
  const map = new Map<number, number>();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) map.set(d, numerologicalDay(new Date(year, month, d)));
  return map;
}

// ─── Arama motoru ─────────────────────────────────────────────────────────────

function findNextPhase(from: Date, phaseName: string, maxDays = 120): SearchResultPhase | null {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 1; i <= maxDays; i++) {
    const d    = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12, 0, 0);
    const prev = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i - 1, 12, 0, 0);
    const dp = getMoonPhase(d), pp = getMoonPhase(prev);
    if (dp.name === phaseName && pp.name !== phaseName) {
      return { kind: "phase", name: dp.name, emoji: dp.emoji, date: d, daysFromNow: i };
    }
  }
  return null;
}

function findPhaseInMonth(year: number, month: number, phaseName: string, from: Date): SearchResultPhase | null {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const today = new Date(year, month, d, 12, 0, 0);
    const prev  = new Date(year, month, d - 1, 12, 0, 0);
    const tp = getMoonPhase(today), pp = getMoonPhase(prev);
    if (tp.name === phaseName && tp.name !== pp.name) {
      const daysFromNow = Math.round((today.getTime() - from.getTime()) / 86_400_000);
      return { kind: "phase", name: tp.name, emoji: tp.emoji, date: today, daysFromNow };
    }
  }
  return null;
}

function parseSearchQuery(query: string, from: Date): SearchResult {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // "Retro" sorguları — önce kontrol et
  if (q.includes("retro")) {
    // "aktif retro" / "aktif retrolar"
    if (q.includes("aktif")) {
      const active = getActiveRetros(from);
      return { kind: "retroList", periods: active, label: "Aktif Retrolar" };
    }
    // "Merkür retrosu" gibi gezegen + retro
    for (const [key, planet] of Object.entries(RETRO_PLANET_KEYWORDS)) {
      if (q.includes(key)) {
        // Önce aktif mi?
        const active = getActiveRetros(from).find(r => r.planet === planet);
        if (active) return { kind: "retro", period: active, daysUntilStart: -1 };
        // Sonraki
        const next = getNextRetro(planet, from);
        if (next) {
          const daysUntilStart = Math.ceil(
            (parseRetroDate(next.start).getTime() - from.getTime()) / 86_400_000
          );
          return { kind: "retro", period: next, daysUntilStart };
        }
        return { kind: "error", message: `${planet} retrosu veri aralığında bulunamadı.` };
      }
    }
    // Genel "retrolar"
    const active = getActiveRetros(from);
    if (active.length > 0) return { kind: "retroList", periods: active, label: "Aktif Retrolar" };
    const upcoming = getUpcomingRetros(from, 90);
    return { kind: "retroList", periods: upcoming.slice(0, 5), label: "Yaklaşan Retrolar" };
  }

  // "42 gün sonra"
  const daysMatch = q.match(/^(\d+)\s*gün\s*sonra$/);
  if (daysMatch) {
    const n    = parseInt(daysMatch[1]!);
    const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    return { kind: "day", date: new Date(base.getFullYear(), base.getMonth(), base.getDate() + n) };
  }

  // "15 Ağustos 2026"
  const trDate = q.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (trDate) {
    const d = parseInt(trDate[1]!), mName = trDate[2]!.toLowerCase(), y = parseInt(trDate[3]!);
    const mIdx = MONTH_NAME_MAP[mName];
    if (mIdx !== undefined && d >= 1 && d <= 31)
      return { kind: "day", date: new Date(y, mIdx, Math.min(d, new Date(y, mIdx + 1, 0).getDate())) };
  }

  // "15.08.2026"
  const numDate = q.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (numDate) {
    const d = parseInt(numDate[1]!), mo = parseInt(numDate[2]!) - 1, y = parseInt(numDate[3]!);
    if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31)
      return { kind: "day", date: new Date(y, mo, Math.min(d, new Date(y, mo + 1, 0).getDate())) };
  }

  // Faz + ay kombinasyonu
  let phaseKey:  string | null = null;
  let monthIdx:  number | null = null;
  let yearVal:   number | null = null;

  for (const key of Object.keys(PHASE_KEYWORDS))    { if (q.includes(key)) { phaseKey  = key;      break; } }
  for (const [name, idx] of Object.entries(MONTH_NAME_MAP)) { if (q.includes(name)) { monthIdx = idx; break; } }
  const yearMatch = q.match(/\b(20\d\d)\b/);
  if (yearMatch) yearVal = parseInt(yearMatch[1]!);

  if (phaseKey && monthIdx !== null) {
    const pd = PHASE_KEYWORDS[phaseKey]!;
    let yr = yearVal ?? from.getFullYear();
    if (!yearVal && monthIdx < from.getMonth()) yr++;
    const r = findPhaseInMonth(yr, monthIdx, pd.name, from);
    if (r) return r;
    const r2 = findPhaseInMonth(yr + 1, monthIdx, pd.name, from);
    return r2 ?? { kind: "error", message: `${pd.name} ${MONTH_NAMES_TR[monthIdx]}'da bulunamadı.` };
  }

  if (phaseKey) {
    const pd = PHASE_KEYWORDS[phaseKey]!;
    return findNextPhase(from, pd.name) ?? { kind: "error", message: `${pd.name} 120 gün içinde bulunamadı.` };
  }

  if (monthIdx !== null) {
    let yr = yearVal ?? from.getFullYear();
    if (!yearVal && monthIdx < from.getMonth()) yr++;
    return { kind: "day", date: new Date(yr, monthIdx, 1) };
  }

  return {
    kind: "error",
    message: "Anlasilamadi. \"Dolunay\", \"Merkur retrosu\", \"42 gun sonra\" veya \"15 Agustos 2026\" gibi yazin.",
  };
}

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default function CosmicCalendarPage() {
  const [realNow] = useState(() => new Date());
  const todayYear = realNow.getFullYear(), todayMonth = realNow.getMonth(), todayDay = realNow.getDate();

  const [selectedDate,     setSelectedDate]     = useState<Date>(() => new Date(todayYear, todayMonth, todayDay));
  const [viewYear,         setViewYear]         = useState(todayYear);
  const [viewMonth,        setViewMonth]        = useState(todayMonth);
  const [showMoonPhases,   setShowMoonPhases]   = useState(true);
  const [showHicriDays,    setShowHicriDays]    = useState(false);
  const [showNumeroloji,   setShowNumeroloji]   = useState(false);
  const [showOnemliGunler, setShowOnemliGunler] = useState(true);
  const [dateInput,        setDateInput]        = useState("");
  const [searchQuery,      setSearchQuery]      = useState("");
  const [searchResult,     setSearchResult]     = useState<SearchResult>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const searchRef    = useRef<HTMLInputElement>(null);

  // ── Takvim hesapları ──────────────────────────────────────────────────────
  const cells           = useMemo(() => buildCalendarCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const moonMarkers     = useMemo(() => getMonthMoonMarkers(viewYear, viewMonth), [viewYear, viewMonth]);
  const retroMarkers    = useMemo(() => getMonthRetroMarkers(viewYear, viewMonth), [viewYear, viewMonth]);
  const hijriMonthYear  = useMemo(() => getHijriMonthYear(new Date(viewYear, viewMonth, 15)), [viewYear, viewMonth]);
  const hijriDayNumbers = useMemo(
    () => showHicriDays  ? getMonthHijriDays(viewYear, viewMonth)  : new Map<number, number>(),
    [viewYear, viewMonth, showHicriDays],
  );
  const numeroDayNumbers = useMemo(
    () => showNumeroloji ? getMonthNumeroDays(viewYear, viewMonth) : new Map<number, number>(),
    [viewYear, viewMonth, showNumeroloji],
  );
  // ── Seçili güne ait veriler ───────────────────────────────────────────────
  const moonPhase   = useMemo(() => getMoonPhase(selectedDate),          [selectedDate]);
  const moonSign    = useMemo(() => getMoonSign(selectedDate),           [selectedDate]);
  const energy      = useMemo(() => getDailyEnergySummary(selectedDate), [selectedDate]);
  const hijriDate   = useMemo(() => getHijriDate(selectedDate),          [selectedDate]);
  const miladiDate  = useMemo(() => formatMiladiDate(selectedDate),      [selectedDate]);
  const numDay      = useMemo(() => numerologicalDay(selectedDate),       [selectedDate]);
  const dayRuler    = useMemo(() => getDayRuler(selectedDate),           [selectedDate]);
  const guidance    = useMemo(() => getDailyGuidance(selectedDate),      [selectedDate]);
  const activeRetros = useMemo(() => getActiveRetros(selectedDate),      [selectedDate]);
  const isSelectedToday = useMemo(() => isSameDay(selectedDate, realNow), [selectedDate, realNow]);
  const ph          = useMemo(() => getPlanetaryHour(realNow),           [realNow]);

  // Arama sonucu gün verisi
  const searchDayData = useMemo(() => {
    if (!searchResult || searchResult.kind !== "day") return null;
    const d = searchResult.date;
    return {
      miladi:      formatMiladiDate(d),
      hicri:       getHijriDate(d),
      phase:       getMoonPhase(d),
      sign:        getMoonSign(d),
      num:         numerologicalDay(d),
      energyTitle: getDailyEnergySummary(d).title,
    };
  }, [searchResult]);

  const cosmicSummary = [
    { icon: "📅",            label: "Miladi",         value: miladiDate },
    { icon: "🌙",            label: "Hicri",          value: hijriDate },
    { icon: moonPhase.emoji, label: "Ay Fazı",        value: moonPhase.name },
    { icon: moonSign.emoji,  label: "Ay Burcu",       value: moonSign.name },
    { icon: "🔢",            label: "Numeroloji",     value: `${numDay} · ${NUM_NAMES[numDay] ?? ""}` },
    { icon: dayRuler.symbol, label: "Gün Yöneticisi", value: dayRuler.name },
  ];

  const cellHeight = (showHicriDays || showNumeroloji) ? "h-12" : "h-10";

  // ── Navigasyon ────────────────────────────────────────────────────────────
  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function selectDay(day: number) { setSelectedDate(new Date(viewYear, viewMonth, day)); }
  function navigateToDate(date: Date) {
    setViewYear(date.getFullYear()); setViewMonth(date.getMonth());
    setSelectedDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
    setSearchQuery(""); setSearchResult(null);
  }

  // ── Tarih atlama ──────────────────────────────────────────────────────────
  function handleDateJump() {
    const t = dateInput.trim();
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
    const m2 = t.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
    if (m2) {
      const d = parseInt(m2[1]!), y = parseInt(m2[3]!);
      const mIdx = MONTH_NAME_MAP[m2[2]!.toLowerCase() ?? ""];
      if (mIdx !== undefined && d >= 1 && d <= 31) {
        setViewYear(y); setViewMonth(mIdx);
        setSelectedDate(new Date(y, mIdx, Math.min(d, new Date(y, mIdx + 1, 0).getDate())));
        setDateInput("");
      }
    }
  }

  // ── Arama ─────────────────────────────────────────────────────────────────
  function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearchResult(parseSearchQuery(searchQuery, realNow));
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main className="relative w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)] text-slate-900 antialiased">
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
                Günlük enerji, hicri takvim, ay fazları ve retro dönemleri tek merkezde.
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

        {/* ── Enerji Kartı ── */}
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
              {[{ lbl: "🎯 Odak", val: energy.focus }, { lbl: "⚡ Enerji Teması", val: energy.theme }, { lbl: "💡 Öneri", val: energy.recommendation }].map(({ lbl, val }) => (
                <div key={lbl} className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 backdrop-blur-sm">
                  <p className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-300/60">{lbl}</p>
                  <p className="text-[12px] font-bold text-white">{val}</p>
                </div>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1 sm:grid-cols-4">
              {([
                { label: "💞 İlişkiler", value: energy.relationship },
                { label: "💼 İş / Üretim", value: energy.work },
                { label: "🧘 Ruhsal Çalışma", value: energy.spiritualPractice },
                { label: "⚠️ Dikkat", value: energy.caution },
              ] as const).map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-2 backdrop-blur-sm">
                  <p className="mb-0.5 text-[8px] font-black uppercase tracking-wider text-indigo-300/50">{label}</p>
                  <p className="text-[11px] font-medium leading-snug text-indigo-100/80">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Kozmik Özet ── */}
        <div className="mb-3 overflow-hidden rounded-[18px] border border-white/80 bg-gradient-to-br from-indigo-600/[0.07] via-violet-500/[0.05] to-cyan-400/[0.07] p-2.5 shadow-sm backdrop-blur-md sm:p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">
            🌙 Kozmik Özet
            {!isSelectedToday && <span className="normal-case text-[9px] font-semibold text-slate-400">— {miladiDate}</span>}
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

        {/* ── Kozmik Arama ── */}
        <div className="mb-3 rounded-[18px] border border-white/80 bg-white/70 p-2.5 shadow-sm backdrop-blur-md sm:p-3">
          <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">🔍 Kozmik Arama</p>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Dolunay, Merkür retrosu, 15 Ağustos 2026 veya 42 gün sonra…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchResult(null); }}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                className="w-full rounded-xl border border-slate-200 bg-white/80 py-1.5 pl-7 pr-7 text-[11px] text-slate-700 placeholder:text-slate-300 focus:border-indigo-300 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setSearchResult(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <button onClick={handleSearch} disabled={!searchQuery.trim()} className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-40">
              Ara
            </button>
          </div>

          {/* Arama Sonucu */}
          {searchResult && (
            <div className="mt-2">
              {searchResult.kind === "error" && (
                <p className="rounded-xl border border-rose-100 bg-rose-50/60 px-2.5 py-2 text-[10px] text-rose-600">
                  ⚠ {searchResult.message}
                </p>
              )}
              {searchResult.kind === "phase" && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl leading-none">{searchResult.emoji}</span>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-700">Sonraki {searchResult.name}</p>
                      <p className="text-[13px] font-black text-slate-900">{formatShortDate(searchResult.date)}</p>
                      <p className="text-[10px] text-slate-500">{searchResult.daysFromNow === 1 ? "Yarın" : `${searchResult.daysFromNow} gün sonra`}</p>
                    </div>
                  </div>
                  <button onClick={() => navigateToDate(searchResult.date)} className="shrink-0 rounded-xl border border-indigo-200 bg-white/80 px-2.5 py-1.5 text-[9px] font-bold text-indigo-700 transition hover:bg-indigo-50">
                    Takvimde Göster →
                  </button>
                </div>
              )}
              {searchResult.kind === "day" && searchDayData && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[12px] font-black text-slate-900">{searchDayData.miladi}</p>
                    <button onClick={() => navigateToDate(searchResult.date)} className="shrink-0 rounded-xl border border-indigo-200 bg-white/80 px-2.5 py-1 text-[9px] font-bold text-indigo-700 transition hover:bg-indigo-50">
                      Takvimde Göster →
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-5">
                    {[
                      { icon: "🕋",                     label: "Hicri",       val: searchDayData.hicri },
                      { icon: searchDayData.phase.emoji, label: "Ay Fazı",    val: searchDayData.phase.name },
                      { icon: searchDayData.sign.emoji,  label: "Ay Burcu",   val: searchDayData.sign.name },
                      { icon: "🔢", label: "Numeroloji",                       val: `${searchDayData.num} · ${NUM_NAMES[searchDayData.num] ?? ""}` },
                      { icon: "💫", label: "Gün Yorumu",                       val: searchDayData.energyTitle },
                    ].map(({ icon, label, val }) => (
                      <div key={label} className="rounded-xl border border-white/80 bg-white/70 px-2 py-1.5">
                        <p className="text-[8px] font-semibold text-slate-400">{icon} {label}</p>
                        <p className="mt-0.5 truncate text-[10px] font-black text-slate-800">{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {searchResult.kind === "retro" && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50/60 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl leading-none">{searchResult.period.symbol}</span>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-rose-700">
                          {searchResult.daysUntilStart < 0 ? "Aktif Dönem" : "Yaklaşan Retro"}
                        </p>
                        <p className="text-[13px] font-black text-slate-900">{searchResult.period.planet} Retrosu</p>
                        <p className="text-[10px] text-slate-500">
                          {formatShortDate(parseRetroDate(searchResult.period.start))} – {formatShortDate(parseRetroDate(searchResult.period.end))}
                        </p>
                        <p className="text-[9px] text-rose-500">
                          {searchResult.daysUntilStart < 0 ? "Şu an aktif" : `${searchResult.daysUntilStart} gün sonra başlıyor`}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => navigateToDate(parseRetroDate(searchResult.period.start))} className="shrink-0 rounded-xl border border-rose-200 bg-white/80 px-2.5 py-1.5 text-[9px] font-bold text-rose-700 transition hover:bg-rose-50">
                      Takvimde Göster →
                    </button>
                  </div>
                  <p className="mt-1.5 text-[9px] text-slate-400">{searchResult.period.theme}</p>
                </div>
              )}
              {searchResult.kind === "retroList" && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50/60 px-3 py-2.5">
                  <p className="mb-2 text-[10px] font-black text-rose-700">{searchResult.label}</p>
                  {searchResult.periods.length === 0 ? (
                    <p className="text-[10px] text-slate-500">Aktif retro bulunmuyor.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {searchResult.periods.map(r => (
                        <button key={`${r.planet}-${r.start}`} onClick={() => navigateToDate(parseRetroDate(r.start))} className="flex w-full items-center gap-2 rounded-xl bg-white/60 px-2 py-1.5 text-left transition hover:bg-white/80">
                          <span className="text-base leading-none">{r.symbol}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-black text-slate-800">{r.planet} Retrosu</p>
                            <p className="text-[9px] text-slate-400">
                              {formatShortDate(parseRetroDate(r.start))} – {formatShortDate(parseRetroDate(r.end))}
                            </p>
                          </div>
                          <span className="text-[9px] text-rose-500">→</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Ana Grid ── */}
        <div className="grid grid-cols-1 gap-4 lg:items-start lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px]">

          {/* ── Sol Kolon ── */}
          <div className="flex flex-col gap-4">

            {/* Takvim */}
            <div className="rounded-3xl border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-md">
              {/* Ay nav */}
              <div className="mb-2 flex items-center gap-2">
                <button onClick={prevMonth} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700" aria-label="Önceki ay">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex flex-1 items-center justify-between">
                  <h2 className="text-base font-black text-slate-800">{MONTH_NAMES_TR[viewMonth]} {viewYear}</h2>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200/80">🌙 {hijriMonthYear}</span>
                </div>
                <button onClick={nextMonth} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700" aria-label="Sonraki ay">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Tarih atlama */}
              <div className="mb-2 flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-300" />
                  <input ref={dateInputRef} type="text" placeholder="GG.AA.YYYY veya 15 Ağustos 2026"
                    value={dateInput} onChange={e => setDateInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleDateJump()}
                    className="w-full rounded-lg border border-slate-200 bg-white/80 py-1 pl-6 pr-2 text-[10px] text-slate-700 placeholder:text-slate-300 focus:border-indigo-300 focus:outline-none" />
                </div>
                <button onClick={handleDateJump} disabled={!dateInput.trim()} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-40">Git</button>
              </div>

              {/* Filtreler */}
              <div className="mb-2 flex flex-wrap gap-1">
                {([
                  { label: "Ay Fazları", emoji: "🌕", active: showMoonPhases,   toggle: () => setShowMoonPhases(v => !v) },
                  { label: "Hicri",      emoji: "🌙", active: showHicriDays,    toggle: () => setShowHicriDays(v => !v) },
                  { label: "Numeroloji", emoji: "🔢", active: showNumeroloji,   toggle: () => setShowNumeroloji(v => !v) },
                  { label: "Önemli",     emoji: "⭐", active: showOnemliGunler, toggle: () => setShowOnemliGunler(v => !v) },
                ] as const).map(({ label, emoji, active, toggle }) => (
                  <button key={label} onClick={toggle} className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-semibold transition-colors ${active ? "border border-indigo-200 bg-indigo-100 text-indigo-700" : "border border-slate-200 bg-slate-100 text-slate-400"}`}>
                    {emoji} {label}
                  </button>
                ))}
              </div>

              {/* Lejant */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-slate-100/80 pb-2 mb-2">
                {LEGEND_ITEMS.map(({ icon, label }) => (
                  <span key={label} className="flex items-center gap-0.5 text-[10px] text-slate-400">{icon} {label}</span>
                ))}
              </div>

              {/* Gün başlıkları */}
              <div className="mb-0.5 grid grid-cols-7 gap-0.5">
                {DAY_HEADERS.map(h => <div key={h} className="py-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</div>)}
              </div>

              {/* Takvim hücreleri */}
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((day, i) => {
                  if (day === null) return <div key={`e-${i}`} className={`${cellHeight} rounded-lg`} />;
                  const isToday    = day === todayDay && viewMonth === todayMonth && viewYear === todayYear;
                  const isSelected = !isToday && day === selectedDate.getDate() && viewMonth === selectedDate.getMonth() && viewYear === selectedDate.getFullYear();
                  const moonMarker = showMoonPhases ? moonMarkers.get(day) : undefined;
                  const hasMoonBg  = showOnemliGunler && !!moonMarkers.get(day);
                  const retroList  = retroMarkers.get(day);
                  const hijriNum   = hijriDayNumbers.get(day);
                  const numeroNum  = numeroDayNumbers.get(day);
                  const showSub    = (showHicriDays && hijriNum) || (showNumeroloji && numeroNum);
                  return (
                    <button key={day} onClick={() => selectDay(day)}
                      className={`group/day relative flex ${cellHeight} flex-col items-center justify-start gap-0.5 rounded-lg p-1 transition-colors ${
                        isToday    ? "bg-gradient-to-b from-violet-500 to-indigo-600 shadow-md shadow-indigo-300/40" :
                        isSelected ? "ring-2 ring-inset ring-indigo-400 bg-indigo-50" :
                        hasMoonBg  ? "border border-violet-100 bg-violet-50/60 hover:bg-violet-100/60" :
                                     "bg-white/30 hover:bg-white/60"
                      }`}
                    >
                      <span className={`text-xs font-black leading-tight ${isToday ? "text-white" : "text-slate-700"}`}>{day}</span>
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
                          {showHicriDays && hijriNum && <span className={`text-[6px] font-bold leading-none ${isToday ? "text-white/60" : "text-slate-300"}`}>H{hijriNum}</span>}
                          {showNumeroloji && numeroNum && <span className={`text-[6px] font-bold leading-none ${isToday ? "text-white/60" : "text-indigo-300"}`}>N{numeroNum}</span>}
                        </div>
                      )}
                      {/* Retro başlangıç işaretçisi */}
                      {retroList && retroList.length > 0 && (
                        <div className="group/retro absolute bottom-0.5 right-0.5 flex gap-px">
                          {retroList.map(r => (
                            <span key={r.planet} className={`text-[7px] leading-none ${isToday ? "text-white/70" : "text-rose-400"}`}>{r.symbol}</span>
                          ))}
                          <span className="pointer-events-none absolute bottom-full right-0 z-50 mb-1 hidden whitespace-nowrap rounded-lg bg-rose-800 px-2 py-1 text-[9px] text-white shadow-xl group-hover/retro:block">
                            {retroList.map(r => r.planet).join(", ")} Retrosu Başlangıcı
                            <span className="absolute right-2 top-full border-4 border-transparent border-t-rose-800" />
                          </span>
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
                  { icon: "📅",            label: "Miladi Tarih", value: miladiDate,                               color: "text-slate-800" },
                  { icon: "🕋",            label: "Hicri Tarih",  value: hijriDate,                                color: "text-slate-700" },
                  { icon: moonPhase.emoji, label: "Ay Fazı",      value: moonPhase.name,                           color: "text-violet-700" },
                  { icon: moonSign.emoji,  label: "Ay Burcu",     value: moonSign.name,                            color: "text-indigo-700" },
                  { icon: "🔢",            label: "Numeroloji",   value: `${numDay} · ${NUM_NAMES[numDay] ?? ""}`, color: "text-slate-800" },
                ].map(({ icon, label, value, color }) => (
                  <div key={label} className="rounded-xl bg-slate-50/70 px-2.5 py-2">
                    <p className="text-[9px] text-slate-400">{icon} {label}</p>
                    <p className={`text-[12px] font-black ${color}`}>{value}</p>
                  </div>
                ))}

                {/* Retro Durumu — tema + kalan gün */}
                <div className={`rounded-xl px-2.5 py-2 ${activeRetros.length > 0 ? "border border-rose-100 bg-rose-50/60" : "bg-slate-50/70"}`}>
                  <p className="text-[9px] text-slate-400">🪐 Retro Durumu</p>
                  {activeRetros.length === 0 ? (
                    <p className="text-[12px] font-black text-emerald-600">Aktif Retro Bulunmuyor</p>
                  ) : (
                    <div className="mt-0.5 space-y-2.5">
                      {activeRetros.map(r => {
                        const selMidnight = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                        const endDate     = parseRetroDate(r.end);
                        const kalan       = Math.max(0, Math.ceil((endDate.getTime() - selMidnight.getTime()) / 86_400_000));
                        return (
                          <div key={r.planet} className="space-y-0.5">
                            <p className="text-[12px] font-black text-rose-700">{r.symbol} {r.planet} Retrosu</p>
                            {r.theme && (
                              <p className="text-[9px] leading-snug text-slate-500">{r.theme}</p>
                            )}
                            <p className="text-[9px] text-slate-400">
                              {formatShortDate(parseRetroDate(r.start))} – {formatShortDate(endDate)}
                            </p>
                            <div className="flex items-center gap-2 pt-0.5">
                              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[8px] font-black text-rose-600">Aktif dönemde</span>
                              <span className="text-[9px] font-semibold text-slate-600">{kalan} gün kaldı</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

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
                        <li key={i} className="flex items-center gap-1 text-[10px] text-slate-700"><span className="shrink-0 font-black text-emerald-500">✓</span>{a}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-2 py-1.5">
                    <p className="mb-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-amber-700">⚠ Dikkat Edilmesi Gerekenler</p>
                    <ul className="space-y-0.5">
                      {guidance.cautions.map((c, i) => (
                        <li key={i} className="flex items-center gap-1 text-[10px] text-slate-700"><span className="shrink-0 font-black text-amber-500">⚠</span>{c}</li>
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

            {/* Gezegen Saati — bugün seçiliyse */}
            {isSelectedToday && (
              <div className="overflow-hidden rounded-3xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-violet-50/60 to-indigo-50 p-3 shadow-sm backdrop-blur-md">
                <p className="mb-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700">⏰ Şu Anki Gezegen Saati</p>
                <div className="mb-2 flex items-center gap-3 rounded-2xl border border-indigo-200/50 bg-white/80 px-3 py-2.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl text-white shadow-md">{ph.aktifGezegen.symbol}</div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-500">
                      {ph.isDayHour ? "Gündüz Saati" : "Gece Saati"} · {ph.isDayHour ? ph.saatIndex + 1 : ph.saatIndex - 11}. saat
                    </p>
                    <p className="text-sm font-black text-slate-900">{ph.aktifGezegen.name} Saati</p>
                    <p className="text-[11px] leading-snug text-slate-500">{ph.aktifGezegen.description}</p>
                  </div>
                </div>
                <div className="mb-2 grid grid-cols-3 gap-1.5">
                  {[
                    { label: "Aktif",   val: `${ph.aktifGezegen.symbol} ${ph.aktifGezegen.name}`,    color: "text-indigo-700" },
                    { label: "Sonraki", val: `${ph.sonrakiGezegen.symbol} ${ph.sonrakiGezegen.name}`, color: "text-slate-700" },
                    { label: "Kalan",   val: `${ph.kalanDakika} dk`,                                 color: "text-violet-700" },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="rounded-xl bg-white/70 px-2 py-1.5">
                      <p className="text-[9px] text-slate-400">{label}</p>
                      <p className={`text-[12px] font-black ${color}`}>{val}</p>
                    </div>
                  ))}
                </div>
                <div className="mb-2 flex items-center justify-between rounded-2xl border border-indigo-100/80 bg-white/60 px-2 py-1.5">
                  {CHALDEAN_PLANETS.map((planet, idx) => {
                    const isActive = idx === ph.aktifChaldeanIdx;
                    return (
                      <div key={planet.name} className={`flex flex-col items-center gap-0.5 transition-all ${isActive ? "scale-125" : "opacity-35"}`}>
                        <span className={`text-base leading-none ${isActive ? "text-indigo-600" : "text-slate-500"}`}>{planet.symbol}</span>
                        <span className={`text-[8px] leading-none ${isActive ? "font-black text-indigo-700" : "text-slate-400"}`}>{planet.name.substring(0, 3)}</span>
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

        {/* ── Kozmik Merkezler ── */}
        <div className="mt-4">
          <p className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">🪐 Kozmik Merkezler</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              {
                emoji: "⭐",
                title: "Güçlü Günler Merkezi",
                desc:  "Numeroloji + Ay Fazı en güçlü günler",
                href:  "/dashboard/cosmic-calendar/power-days",
                color: "from-amber-50/90 to-yellow-50/60 border-amber-200/70 hover:border-amber-300",
                titleColor: "text-amber-700",
                descColor:  "text-amber-500",
                live: true,
              },
              {
                emoji: "☿",
                title: "Retro Takvimi",
                desc:  "Gezegen retro dönemleri ve etkileri",
                href:  "/dashboard/cosmic-calendar/retro-calendar",
                color: "from-rose-50/80 to-pink-50/60 border-rose-100/70 hover:border-rose-200",
                titleColor: "text-rose-700",
                descColor:  "text-rose-400",
                live: true,
              },
              {
                emoji: "🌙",
                title: "Ay Fazları Rehberi",
                desc:  "Yeni Ay, Dolunay ve dördünler rehberi",
                href:  "#",
                color: "from-violet-50/80 to-indigo-50/60 border-violet-100/70 hover:border-violet-200",
                titleColor: "text-violet-700",
                descColor:  "text-violet-400",
                live: false,
              },
              {
                emoji: "🩸",
                title: "Hacamat Takvimi",
                desc:  "Hicri takvime göre hacamat günleri",
                href:  "#",
                color: "from-teal-50/80 to-cyan-50/60 border-teal-100/70 hover:border-teal-200",
                titleColor: "text-teal-700",
                descColor:  "text-teal-400",
                live: false,
              },
            ] as const).map(({ emoji, title, desc, href, color, titleColor, descColor, live }) => (
              <Link
                key={title}
                href={href}
                className={`group flex flex-col gap-2 rounded-2xl border bg-gradient-to-br p-3.5 shadow-sm backdrop-blur-md transition-all hover:shadow-md ${color} ${!live ? "pointer-events-none opacity-60" : ""}`}
                aria-disabled={!live}
                tabIndex={live ? 0 : -1}
              >
                <div className="flex items-start justify-between">
                  <span className="text-2xl leading-none">{emoji}</span>
                  {!live && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-bold text-slate-400">Yakında</span>
                  )}
                </div>
                <div>
                  <p className={`text-[12px] font-black leading-snug ${titleColor}`}>{title}</p>
                  <p className={`mt-0.5 text-[10px] leading-snug ${descColor}`}>{desc}</p>
                </div>
                {live && (
                  <span className={`mt-auto self-end text-[10px] font-bold transition-transform group-hover:translate-x-0.5 ${titleColor}`}>→</span>
                )}
              </Link>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
