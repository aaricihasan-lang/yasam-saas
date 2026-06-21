"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { getHijriDate, getHijriMonthYear } from "@/lib/cosmic/hijri";
import {
  getMoonPhase, getMoonSign,
  getMonthPhaseEvents, getUpcomingPhaseEvents,
  type UpcomingPhaseEvent,
} from "@/lib/cosmic/moon";
import { getDailyEnergySummary } from "@/lib/cosmic/energy";
import { getPlanetaryHour, getDayRuler, CHALDEAN_PLANETS } from "@/lib/cosmic/planetary-hours";
import { getDailyGuidance } from "@/lib/cosmic/guidance";
import {
  getActiveRetros, getUpcomingRetros, getNextRetro, parseRetroDate,
  RETRO_PERIODS,
  type RetroPeriod, type PlanetName,
} from "@/lib/cosmic/retro";
import { getPlanetSigns } from "@/lib/cosmic/planets";
import { getTopTransits } from "@/lib/cosmic/transit-interpretations";
import { getPlanetSlug } from "@/lib/cosmic/planet-meta";
import { getUpcomingCosmicEvents, type CosmicEventType } from "@/lib/cosmic/events";
import { getHacamatMonthData, type CalendarDay } from "@/lib/cosmic/hacamat";

// ─── Sabit veriler ────────────────────────────────────────────────────────────

const MONTH_NAMES_TR: ReadonlyArray<string> = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const DAY_HEADERS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

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

const COSMIC_EVENT_STYLE: Record<CosmicEventType, { bg: string; border: string; text: string; badge: string }> = {
  new_moon:    { bg: "bg-violet-50/70",  border: "border-violet-100/70",  text: "text-violet-800",  badge: "bg-violet-100 text-violet-700"  },
  full_moon:   { bg: "bg-amber-50/70",   border: "border-amber-100/70",   text: "text-amber-800",   badge: "bg-amber-100 text-amber-700"   },
  retro_start: { bg: "bg-rose-50/70",    border: "border-rose-100/70",    text: "text-rose-800",    badge: "bg-rose-100 text-rose-700"    },
  retro_end:   { bg: "bg-emerald-50/70", border: "border-emerald-100/70", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700" },
  sign_change: { bg: "bg-sky-50/70",     border: "border-sky-100/70",     text: "text-sky-800",     badge: "bg-sky-100 text-sky-700"     },
};

const COSMIC_EVENT_TYPE_LABEL: Record<CosmicEventType, string> = {
  new_moon:    "Yeni Ay",
  full_moon:   "Dolunay",
  retro_start: "Retro Başlıyor",
  retro_end:   "Retro Bitiyor",
  sign_change: "Burç Değişimi",
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

// AE tabanlı: gerçek TR tarihiyle marker — gece gerçekleşen fazlar doğru güne düşer
function getMonthMoonMarkers(year: number, month: number): Map<number, string> {
  const markers    = new Map<number, string>();
  const mainPhases = new Set(["Yeni Ay", "İlk Dördün", "Dolunay", "Son Dördün"]);
  for (const evt of getMonthPhaseEvents(year, month)) {
    if (mainPhases.has(evt.name) && !markers.has(evt.day)) {
      markers.set(evt.day, evt.emoji);
    }
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

// AE tabanlı arama — gerçek TR tarihiyle sonuç döner
function findNextPhase(from: Date, phaseName: string, maxDays = 120): SearchResultPhase | null {
  const found = getUpcomingPhaseEvents(from, maxDays).find(e => e.name === phaseName);
  if (!found) return null;
  return { kind: "phase", name: found.name, emoji: found.emoji, date: found.date, daysFromNow: found.daysFromNow };
}

function findPhaseInMonth(year: number, month: number, phaseName: string, from: Date): SearchResultPhase | null {
  const found = getMonthPhaseEvents(year, month).find(e => e.name === phaseName);
  if (!found) return null;
  const date        = new Date(year, month, found.day, 12, 0, 0);
  const todayMs     = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const daysFromNow = Math.round((new Date(year, month, found.day).getTime() - todayMs) / 86_400_000);
  return { kind: "phase", name: found.name, emoji: found.emoji, date, daysFromNow };
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

// Doğrulanmış veri destek aralığı (20.06.2026 – 31.12.2030)
const SUPPORT_END_YEAR = 2030;

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
  const [showAllEvents,    setShowAllEvents]    = useState(false);
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
  const isAfterSupportEnd = useMemo(
    () => selectedDate.getFullYear() > SUPPORT_END_YEAR,
    [selectedDate],
  );

  // ── Güncel Gökyüzü — bugünkü (realNow) gezegen konumları ─────────────────
  const todayMoonSign  = useMemo(() => getMoonSign(realNow),        [realNow]);
  const todayPlanets   = useMemo(() => getPlanetSigns(realNow),     [realNow]);
  const gokyuzuRows = useMemo(() => {
    const sun = todayPlanets[0];
    const rest = todayPlanets.slice(1);
    return [
      ...(sun ? [sun] : []),
      { key: "Ay" as const, symbol: "☽", sign: todayMoonSign.name, signSymbol: todayMoonSign.emoji, outOfRange: false },
      ...rest,
    ];
  }, [todayPlanets, todayMoonSign]);

  const topTransits    = useMemo(() => getTopTransits(gokyuzuRows.filter(r => !r.outOfRange), 4), [gokyuzuRows]);
  const cosmicEvents   = useMemo(() => getUpcomingCosmicEvents(realNow, 10), [realNow]);

  // ── Yaklaşan bilgi blokları ───────────────────────────────────────────────

  // Yaklaşan Güçlü Günler — numeroloji 1/8/9/11/22/33 (sonraki 60 gün)
  // Ay fazları ayrıca upcomingMoonPhases üzerinden gösterilir; burada noon-scan kullanılmaz.
  const upcomingPowerDays = useMemo(() => {
    const result: { date: Date; label: string; numDay: number }[] = [];
    const base = new Date(todayYear, todayMonth, todayDay);
    const POWER_NUMS = new Set([1, 8, 9, 11, 22, 33]);
    for (let i = 1; i <= 60 && result.length < 6; i++) {
      const d   = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12);
      const num = numerologicalDay(d);
      if (POWER_NUMS.has(num)) {
        result.push({
          date: d,
          label: `🔢 Numeroloji ${num} · ${NUM_NAMES[num] ?? ""}`,
          numDay: num,
        });
      }
    }
    return result.slice(0, 5);
  }, [todayYear, todayMonth, todayDay]);

  // Yaklaşan Retro Dönemleri — sonraki 180 gün
  const upcomingRetrosList = useMemo(() => getUpcomingRetros(realNow, 180).slice(0, 4), [realNow]);

  // Yaklaşan Ay Fazları — sonraki 4 ana faz (AE tabanlı, doğru TR tarihi)
  const upcomingMoonPhases = useMemo((): UpcomingPhaseEvent[] => {
    const result: UpcomingPhaseEvent[] = [];
    const found  = new Set<string>();
    const today  = new Date(todayYear, todayMonth, todayDay);
    for (const evt of getUpcomingPhaseEvents(today, 120)) {
      if (!evt.isMain || found.has(evt.name)) continue;
      found.add(evt.name);
      result.push(evt);
      if (result.length >= 4) break;
    }
    return result;
  }, [todayYear, todayMonth, todayDay]);

  // Yaklaşan Hacamat Günleri — bu ve sonraki ay içinden altin+sunnet (bugünden sonra, maks 6)
  const upcomingHacamatDays = useMemo(() => {
    const today = new Date(todayYear, todayMonth, todayDay);
    const result: CalendarDay[] = [];
    const monthsToCheck = [
      { year: todayYear, month: todayMonth },
      { year: todayMonth === 11 ? todayYear + 1 : todayYear, month: (todayMonth + 1) % 12 },
    ];
    for (const { year, month } of monthsToCheck) {
      const data = getHacamatMonthData(year, month);
      for (const day of data.days) {
        if ((day.status === "altin" || day.status === "sunnet" || day.status === "uygun") && day.miladi >= today) {
          result.push(day);
        }
      }
      if (result.length >= 6) break;
    }
    return result.slice(0, 6);
  }, [todayYear, todayMonth, todayDay]);

  // ── Kozmik Merkez kartları — mini özet ───────────────────────────────────────
  const cosmicCenterCards = useMemo(() => {
    const pd = upcomingPowerDays[0];
    const rt = upcomingRetrosList[0];
    const mp = upcomingMoonPhases[0];
    const hd = upcomingHacamatDays[0];
    return [
      {
        emoji: "⭐", title: "Güçlü Günler", href: "/cosmic-calendar/power-days",
        color: "from-amber-50/90 to-yellow-50/60 border-amber-200/70 hover:border-amber-300",
        titleColor: "text-amber-700", summaryColor: "text-amber-600",
        s1: pd ? pd.label.replace(/^🔢 Numeroloji /, "🔢 ").slice(0, 20) : "—",
        s2: pd ? pd.date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", weekday: "short" }) : "Hesaplanıyor",
      },
      {
        emoji: "☿", title: "Retro Takvimi", href: "/cosmic-calendar/retro-calendar",
        color: "from-rose-50/80 to-pink-50/60 border-rose-100/70 hover:border-rose-200",
        titleColor: "text-rose-700", summaryColor: "text-rose-600",
        s1: rt ? `${rt.symbol} ${rt.planet}` : "Retro yok",
        s2: rt ? (() => { const d = Math.ceil((parseRetroDate(rt.start).getTime() - realNow.getTime()) / 86_400_000); return d > 0 ? `${d} gün sonra` : "Şu an aktif"; })() : "—",
      },
      {
        emoji: "🌙", title: "Ay Fazları", href: "/cosmic-calendar/moon-phases",
        color: "from-violet-50/80 to-indigo-50/60 border-violet-100/70 hover:border-violet-200",
        titleColor: "text-violet-700", summaryColor: "text-violet-600",
        s1: mp ? `${mp.emoji} ${mp.name}` : "—",
        s2: mp ? (mp.daysFromNow === 1 ? "Yarın" : `${mp.daysFromNow} gün sonra`) : "",
      },
      {
        emoji: "🩸", title: "Hacamat Takvimi", href: "/cosmic-calendar/hacamat",
        color: "from-teal-50/80 to-cyan-50/60 border-teal-100/70 hover:border-teal-200",
        titleColor: "text-teal-700", summaryColor: "text-teal-600",
        s1: hd ? (hd.status === "altin" ? "⭐ Altın Gün" : hd.status === "sunnet" ? "Sünnet Günü" : "Uygun Gün") : "Bu ay yok",
        s2: hd ? hd.miladi.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", weekday: "short" }) : "—",
      },
    ];
  }, [upcomingPowerDays, upcomingRetrosList, upcomingMoonPhases, upcomingHacamatDays, realNow]);

  // ── Bugün Gökyüzünde — özet hesapları ────────────────────────────────────────
  const todaySummary = useMemo(() => {
    const rt = upcomingRetrosList[0];
    const mp = upcomingMoonPhases[0];
    const sc = cosmicEvents.find(e => e.type === "sign_change");
    const rtDays = rt
      ? Math.max(0, Math.ceil((parseRetroDate(rt.start).getTime() - realNow.getTime()) / 86_400_000))
      : 0;
    let scDays = 0;
    if (sc) {
      const [y, m, d] = sc.date.split("-");
      scDays = Math.max(0, Math.ceil(
        (new Date(parseInt(y ?? "2026"), parseInt(m ?? "1") - 1, parseInt(d ?? "1")).getTime() - realNow.getTime()) / 86_400_000
      ));
    }
    return {
      retro:   rt ? { symbol: rt.symbol, planet: rt.planet, daysLeft: rtDays } : null,
      moon:    mp ? { emoji: mp.emoji, name: mp.name, daysFromNow: mp.daysFromNow } : null,
      transit: sc ? { symbol: sc.symbol, title: sc.title, daysLeft: scDays } : null,
    };
  }, [upcomingRetrosList, upcomingMoonPhases, cosmicEvents, realNow]);

  // ── Birleşik Yaklaşan Olaylar ─────────────────────────────────────────────────
  const mergedUpcomingEvents = useMemo(() => {
    type EventItem = { date: Date; daysFromNow: number; icon: string; label: string; detail: string; badgeClass: string };
    const today = new Date(todayYear, todayMonth, todayDay);
    const events: EventItem[] = [];

    for (const { date, label } of upcomingPowerDays) {
      const d = Math.round((date.getTime() - today.getTime()) / 86_400_000);
      events.push({ date, daysFromNow: d, icon: "⭐", label, detail: date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }), badgeClass: "bg-amber-100 text-amber-700" });
    }
    for (const r of upcomingRetrosList) {
      const sd = parseRetroDate(r.start);
      const d = Math.ceil((sd.getTime() - today.getTime()) / 86_400_000);
      events.push({ date: sd, daysFromNow: d, icon: r.symbol, label: `${r.planet} Retrosu`, detail: sd.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }), badgeClass: "bg-rose-100 text-rose-700" });
    }
    // upcomingMoonPhases artık UpcomingPhaseEvent — timeTR dahil
    for (const { name, emoji, date, daysFromNow, timeTR } of upcomingMoonPhases) {
      const dateLbl = date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
      events.push({ date, daysFromNow, icon: emoji, label: name, detail: timeTR ? `${dateLbl} ${timeTR}` : dateLbl, badgeClass: "bg-violet-100 text-violet-700" });
    }
    for (const day of upcomingHacamatDays) {
      const d = Math.round((day.miladi.getTime() - today.getTime()) / 86_400_000);
      const statusLabel = day.status === "altin" ? "⭐ Altın" : day.status === "sunnet" ? "Sünnet" : "Uygun";
      events.push({ date: day.miladi, daysFromNow: d, icon: "🩸", label: `Hacamat · ${statusLabel}`, detail: day.miladi.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }), badgeClass: "bg-teal-100 text-teal-700" });
    }
    return events.sort((a, b) => a.daysFromNow - b.daysFromNow).slice(0, 12);
  }, [upcomingPowerDays, upcomingRetrosList, upcomingMoonPhases, upcomingHacamatDays, todayYear, todayMonth, todayDay]);

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

  const cellHeight = (showHicriDays || showNumeroloji) ? "h-10" : "h-8";

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

      <div className="relative z-10 w-full px-4 pt-4 pb-4 sm:px-6 lg:px-8 xl:px-10">

        {/* ── Hero ── */}
        <section className="relative mb-4 overflow-hidden rounded-[20px] border border-white/90 bg-gradient-to-br from-indigo-200 via-violet-100 to-cyan-100 px-5 py-3.5 shadow-[0_12px_40px_rgba(99,102,241,0.18)] backdrop-blur-xl sm:px-6">
          <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-violet-400/20 blur-[80px]" aria-hidden />
          <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-cyan-400/20 blur-[80px]" aria-hidden />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-lg text-white shadow-md">🌙</div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Yaşam Sistemi</p>
                  <h1 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">Yaşam Takvimi / Kozmik Ajanda</h1>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BADGES.map(b => (
                  <span key={b} className="rounded-full border border-indigo-200/80 bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 backdrop-blur-sm">{b}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Bugün Gökyüzünde ── */}
        <section className="mb-4 overflow-hidden rounded-[18px] border border-indigo-200/70 bg-gradient-to-br from-indigo-600/[0.09] via-violet-500/[0.07] to-indigo-400/[0.05] p-4 shadow-[0_6px_28px_rgba(99,102,241,0.14)] backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-700">🌙 Bugün Gökyüzünde</p>
            <span className="rounded-full border border-indigo-200/60 bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-indigo-500">{miladiDate}</span>
          </div>
          {/* Güneş + Ay — büyük kartlar */}
          <div className="mb-2.5 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-amber-100/80 bg-white/70 px-3 py-2.5 backdrop-blur-sm">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-500/80">☀️ Güneş</p>
              {gokyuzuRows[0] && !gokyuzuRows[0].outOfRange
                ? (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg leading-none text-indigo-500">{gokyuzuRows[0].signSymbol}</span>
                    <span className="text-sm font-black text-slate-900">{gokyuzuRows[0].sign} Burcunda</span>
                  </div>
                )
                : <p className="text-sm font-black text-amber-600">⚠ Veri yok</p>
              }
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-white/70 px-3 py-2.5 backdrop-blur-sm">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400/80">🌙 Ay</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg leading-none text-indigo-500">{todayMoonSign.emoji}</span>
                <span className="text-sm font-black text-slate-900">{todayMoonSign.name} Burcunda</span>
              </div>
            </div>
          </div>
          {/* 3 yaklaşan olay */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-rose-100/80 bg-rose-50/60 px-2.5 py-2 backdrop-blur-sm">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-rose-500/80">☿ Sonraki Retro</p>
              {todaySummary.retro ? (
                <>
                  <p className="text-xs font-black text-slate-900 leading-tight">{todaySummary.retro.symbol} {todaySummary.retro.planet}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-rose-600">
                    {todaySummary.retro.daysLeft > 0 ? `${todaySummary.retro.daysLeft} gün kaldı` : "Şu an aktif"}
                  </p>
                </>
              ) : <p className="text-xs text-slate-400">—</p>}
            </div>
            <div className="rounded-xl border border-violet-100/80 bg-violet-50/60 px-2.5 py-2 backdrop-blur-sm">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-violet-500/80">🌙 Sonraki Ay Fazı</p>
              {todaySummary.moon ? (
                <>
                  <p className="text-xs font-black text-slate-900 leading-tight">{todaySummary.moon.emoji} {todaySummary.moon.name}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-violet-600">
                    {todaySummary.moon.daysFromNow === 0 ? "Bugün" : todaySummary.moon.daysFromNow === 1 ? "Yarın" : `${todaySummary.moon.daysFromNow} gün kaldı`}
                  </p>
                </>
              ) : <p className="text-xs text-slate-400">—</p>}
            </div>
            <div className="rounded-xl border border-sky-100/80 bg-sky-50/60 px-2.5 py-2 backdrop-blur-sm">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-sky-500/80">🪐 Burç Geçişi</p>
              {todaySummary.transit ? (
                <>
                  <p className="text-xs font-black text-slate-900 leading-tight line-clamp-2">{todaySummary.transit.symbol} {todaySummary.transit.title}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-sky-600">
                    {todaySummary.transit.daysLeft === 0 ? "Bugün" : `${todaySummary.transit.daysLeft} gün kaldı`}
                  </p>
                </>
              ) : <p className="text-xs text-slate-400">—</p>}
            </div>
          </div>
        </section>

        {/* ── Gezegenlerin Güncel Burç Konumları ── */}
        <section className="mb-4 overflow-hidden rounded-[18px] border border-indigo-100/80 bg-gradient-to-br from-indigo-50/90 via-violet-50/70 to-cyan-50/80 p-4 shadow-sm backdrop-blur-md">

          {/* Başlık */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-indigo-600">🪐 Gezegenlerin Güncel Burç Konumları</p>
            <span className="rounded-full border border-indigo-200/60 bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-indigo-500">{miladiDate}</span>
          </div>

          {/* Gezegen grid */}
          <div className="grid grid-cols-1 gap-y-0.5 sm:grid-cols-2">
            {gokyuzuRows.map(({ key, symbol, sign, signSymbol, outOfRange }) => (
              <div key={key} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/50">
                <span className="w-5 shrink-0 text-center text-[18px] leading-none text-indigo-500">{symbol}</span>
                <span className="w-[4.5rem] shrink-0 text-xs font-semibold text-slate-700">{key}</span>
                <span className="shrink-0 select-none text-indigo-400/60">→</span>
                {outOfRange
                  ? <span className="text-xs font-semibold text-amber-500">⚠ Veri yok</span>
                  : <span className="text-sm font-black text-slate-900">{signSymbol} {sign} Burcunda</span>
                }
              </div>
            ))}
          </div>

          {/* Ayırıcı + Transit temaları */}
          <div className="mt-3 border-t border-indigo-100/70 pt-3">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-indigo-500">🌌 Bugünün Transit Temaları</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {topTransits.map(({ planet, sign, symbol, title, summary, tags, caution }) => {
                const slug = getPlanetSlug(planet);
                const Inner = (
                  <>
                    {/* Planet + title */}
                    <div className="mb-1 flex items-start gap-1.5">
                      <span className="mt-px shrink-0 text-[15px] leading-none text-indigo-400">{symbol}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black leading-tight text-indigo-700">{title}</p>
                        <p className="text-[10px] font-semibold text-slate-400">{planet} · {sign}</p>
                      </div>
                      {slug && <span className="mt-0.5 shrink-0 text-[10px] font-bold text-indigo-400">→</span>}
                    </div>
                    {/* Summary */}
                    <p className="mb-1.5 line-clamp-2 text-xs leading-snug text-slate-600">{summary}</p>
                    {/* Tags */}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map(tag => (
                          <span
                            key={tag}
                            className="rounded-full border border-indigo-200/70 bg-indigo-50/80 px-1.5 py-px text-[10px] font-semibold text-indigo-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Caution */}
                    {caution && (
                      <p className="mt-1.5 flex items-start gap-1 text-xs leading-snug text-amber-600">
                        <span className="mt-px shrink-0">⚠</span>
                        <span>{caution}</span>
                      </p>
                    )}
                  </>
                );
                const baseClass = "overflow-hidden rounded-xl border border-indigo-100/70 bg-white/65 px-2.5 py-2 backdrop-blur-sm transition";
                return slug ? (
                  <Link
                    key={planet}
                    href={`/cosmic-calendar/transits/${slug}`}
                    className={`${baseClass} no-underline hover:border-indigo-200 hover:bg-white/80 hover:shadow-sm`}
                  >
                    {Inner}
                  </Link>
                ) : (
                  <div key={planet} className={baseClass}>{Inner}</div>
                );
              })}
            </div>
          </div>

        </section>

        {/* ── Ana 2-Kolon Grid ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_310px] lg:items-start">

          {/* ── Sol Kolon ── */}
          <div className="flex flex-col gap-3">

            {/* Kozmik Merkezler */}
            <section>
              <p className="mb-1.5 text-xs font-black uppercase tracking-[0.15em] text-indigo-600">🪐 Kozmik Merkezler</p>
              <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
                {cosmicCenterCards.map(({ emoji, title, href, color, titleColor, summaryColor, s1, s2 }) => (
                  <Link
                    key={title}
                    href={href}
                    className={`group flex h-24 flex-none w-[175px] flex-col justify-between rounded-2xl border bg-gradient-to-br p-2.5 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-md snap-start sm:w-auto ${color}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xl leading-none">{emoji}</span>
                      <span className={`text-[10px] font-bold transition-transform group-hover:translate-x-0.5 ${titleColor}`}>→</span>
                    </div>
                    <div>
                      <p className={`text-sm font-black leading-tight ${titleColor}`}>{title}</p>
                      <p className={`mt-0.5 truncate text-xs font-semibold leading-tight ${summaryColor}`}>{s1}</p>
                      <p className={`truncate text-[10px] leading-tight opacity-80 ${summaryColor}`}>{s2}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Kozmik Özet */}
            <div className="overflow-hidden rounded-[18px] border border-indigo-100/60 bg-gradient-to-br from-indigo-600/[0.07] via-violet-500/[0.05] to-cyan-400/[0.07] p-3 shadow-sm backdrop-blur-md">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.15em] text-indigo-600">
                🌙 Kozmik Özet
                {!isSelectedToday && <span className="normal-case text-[10px] font-semibold text-slate-400">— {miladiDate}</span>}
              </p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-6">
                {cosmicSummary.map(({ icon, label, value }) => (
                  <div key={label} className="rounded-xl border border-indigo-100/60 bg-white/75 px-2 py-1.5 backdrop-blur-sm">
                    <p className="text-[10px] font-semibold text-slate-500">{icon} {label}</p>
                    <p className="mt-0.5 truncate text-xs font-black leading-tight text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Veri aralığı dışı uyarısı */}
            {isAfterSupportEnd && (
              <div className="rounded-[14px] border border-amber-200/80 bg-amber-50/80 px-3 py-2.5" role="alert">
                <p className="text-[10px] font-black text-amber-800">⚠ Doğrulanmış Veri Aralığı Dışında</p>
                <p className="mt-0.5 text-[10px] leading-snug text-amber-700">
                  Bu tarih henüz doğrulanmış veri aralığında değildir (destek: 20.06.2026 – 31.12.2030). Gezegen konumları ve diğer veriler yaklaşık olabilir.
                </p>
              </div>
            )}

            {/* Kozmik Arama */}
            <div className="rounded-[18px] border border-slate-200/80 bg-white/85 px-3 py-2 shadow-md backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 items-center gap-1">
                  <Search className="h-3 w-3 text-indigo-500" />
                  <p className="whitespace-nowrap text-xs font-black uppercase tracking-[0.15em] text-indigo-600">Kozmik Arama</p>
                </div>
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Dolunay, Retro, Hacamat, Altın Gün veya tarih ara..."
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSearchResult(null); }}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                    className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-8 text-[12px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/30"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(""); setSearchResult(null); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button onClick={handleSearch} disabled={!searchQuery.trim()} className="shrink-0 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-[12px] font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:opacity-40">
                  Ara
                </button>
              </div>
              {searchResult && (
                <div className="mt-2">
                  {searchResult.kind === "error" && (
                    <p className="rounded-xl border border-rose-100 bg-rose-50/60 px-2.5 py-2 text-[10px] text-rose-600">⚠ {searchResult.message}</p>
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
                      <button onClick={() => navigateToDate(searchResult.date)} className="shrink-0 rounded-xl border border-indigo-200 bg-white/80 px-2.5 py-1.5 text-[9px] font-bold text-indigo-700 transition hover:bg-indigo-50">Takvimde Göster →</button>
                    </div>
                  )}
                  {searchResult.kind === "day" && searchDayData && (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[12px] font-black text-slate-900">{searchDayData.miladi}</p>
                        <button onClick={() => navigateToDate(searchResult.date)} className="shrink-0 rounded-xl border border-indigo-200 bg-white/80 px-2.5 py-1 text-[9px] font-bold text-indigo-700 transition hover:bg-indigo-50">Takvimde Göster →</button>
                      </div>
                      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-5">
                        {[
                          { icon: "🕋", label: "Hicri", val: searchDayData.hicri },
                          { icon: searchDayData.phase.emoji, label: "Ay Fazı", val: searchDayData.phase.name },
                          { icon: searchDayData.sign.emoji, label: "Ay Burcu", val: searchDayData.sign.name },
                          { icon: "🔢", label: "Numeroloji", val: `${searchDayData.num} · ${NUM_NAMES[searchDayData.num] ?? ""}` },
                          { icon: "💫", label: "Gün Yorumu", val: searchDayData.energyTitle },
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
                            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-rose-700">{searchResult.daysUntilStart < 0 ? "Aktif Dönem" : "Yaklaşan Retro"}</p>
                            <p className="text-[13px] font-black text-slate-900">{searchResult.period.planet} Retrosu</p>
                            <p className="text-[10px] text-slate-500">{formatShortDate(parseRetroDate(searchResult.period.start))} – {formatShortDate(parseRetroDate(searchResult.period.end))}</p>
                            <p className="text-[9px] text-rose-500">{searchResult.daysUntilStart < 0 ? "Şu an aktif" : `${searchResult.daysUntilStart} gün sonra başlıyor`}</p>
                          </div>
                        </div>
                        <button onClick={() => navigateToDate(parseRetroDate(searchResult.period.start))} className="shrink-0 rounded-xl border border-rose-200 bg-white/80 px-2.5 py-1.5 text-[9px] font-bold text-rose-700 transition hover:bg-rose-50">Takvimde Göster →</button>
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
                                <p className="text-[9px] text-slate-400">{formatShortDate(parseRetroDate(r.start))} – {formatShortDate(parseRetroDate(r.end))}</p>
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

            {/* Kompakt Takvim */}
            <div className="rounded-2xl border border-indigo-100/60 bg-gradient-to-br from-white/85 via-white/75 to-indigo-50/50 p-3 shadow-sm backdrop-blur-md">
              <div className="mb-1.5 flex items-center gap-2">
                <button onClick={prevMonth} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700" aria-label="Önceki ay">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <div className="flex flex-1 items-center justify-between">
                  <h2 className="text-sm font-black text-slate-800">{MONTH_NAMES_TR[viewMonth]} {viewYear}</h2>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-200/80">🌙 {hijriMonthYear}</span>
                </div>
                <button onClick={nextMonth} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700" aria-label="Sonraki ay">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-300" />
                  <input ref={dateInputRef} type="text" placeholder="GG.AA.YYYY veya 15 Ağustos 2026" value={dateInput} onChange={e => setDateInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleDateJump()} className="w-full rounded-lg border border-slate-200 bg-white/80 py-0.5 pl-6 pr-2 text-[10px] text-slate-700 placeholder:text-slate-300 focus:border-indigo-300 focus:outline-none" />
                </div>
                <button onClick={handleDateJump} disabled={!dateInput.trim()} className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-40">Git</button>
              </div>
              <div className="mb-1.5 flex flex-wrap gap-1">
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
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-slate-100/80 pb-1.5 mb-1.5">
                {LEGEND_ITEMS.map(({ icon, label }) => (
                  <span key={label} className="flex items-center gap-0.5 text-[10px] text-slate-400">{icon} {label}</span>
                ))}
              </div>
              <div className="mb-0.5 grid grid-cols-7 gap-0.5">
                {DAY_HEADERS.map(h => <div key={h} className="py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</div>)}
              </div>
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
                      className={`group/day relative flex ${cellHeight} flex-col items-center justify-start gap-0 rounded-lg p-0.5 transition-colors ${
                        isToday    ? "bg-gradient-to-b from-violet-500 to-indigo-600 shadow-md shadow-indigo-300/40" :
                        isSelected ? "ring-2 ring-inset ring-indigo-400 bg-indigo-50" :
                        hasMoonBg  ? "border border-violet-200/80 bg-violet-100/70 hover:bg-violet-200/70" :
                        (retroList && retroList.length > 0) ? "border border-rose-100/80 bg-rose-50/60 hover:bg-rose-100/60" :
                                     "bg-white/30 hover:bg-white/60"
                      }`}
                    >
                      <span className={`text-[11px] font-black leading-tight ${isToday ? "text-white" : "text-slate-700"}`}>{day}</span>
                      {isToday && <span className="text-[6px] leading-none text-white/80">bugün</span>}
                      {!isToday && moonMarker && (
                        <>
                          <span className="text-[9px] leading-none">{moonMarker}</span>
                          <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-2 py-1 text-[9px] font-semibold leading-tight text-white shadow-xl group-hover/day:block">
                            {PHASE_TOOLTIP[moonMarker] ?? "Ay fazı geçişi"}
                            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                          </span>
                        </>
                      )}
                      {showSub && (
                        <div className="mt-auto flex items-center gap-0.5">
                          {showHicriDays && hijriNum && <span className={`text-[5px] font-bold leading-none ${isToday ? "text-white/60" : "text-slate-300"}`}>H{hijriNum}</span>}
                          {showNumeroloji && numeroNum && <span className={`text-[5px] font-bold leading-none ${isToday ? "text-white/60" : "text-indigo-300"}`}>N{numeroNum}</span>}
                        </div>
                      )}
                      {retroList && retroList.length > 0 && (
                        <div className="group/retro absolute bottom-0.5 right-0.5 flex gap-px">
                          {retroList.map(r => (
                            <span key={r.planet} className={`text-[6px] leading-none ${isToday ? "text-white/70" : "text-rose-400"}`}>{r.symbol}</span>
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

            {/* Seçili Gün Detayı */}
            <div className="rounded-2xl border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs text-white shadow-sm">📅</div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.15em] text-indigo-700">Seçili Gün</p>
                  {isSelectedToday && <span className="text-[10px] font-semibold text-emerald-600">● Bugün</span>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
                {[
                  { icon: "📅",            label: "Miladi",     value: miladiDate,                               color: "text-slate-800" },
                  { icon: "🕋",            label: "Hicri",      value: hijriDate,                                color: "text-slate-700" },
                  { icon: moonPhase.emoji, label: "Ay Fazı",    value: moonPhase.name,                           color: "text-violet-700" },
                  { icon: moonSign.emoji,  label: "Ay Burcu",   value: moonSign.name,                            color: "text-indigo-700" },
                  { icon: "🔢",            label: "Numeroloji", value: `${numDay} · ${NUM_NAMES[numDay] ?? ""}`, color: "text-slate-800" },
                  { icon: dayRuler.symbol, label: "Gezegen",    value: dayRuler.name,                            color: "text-indigo-600" },
                ].map(({ icon, label, value, color }) => (
                  <div key={label} className="rounded-xl bg-slate-50/70 px-2 py-1.5">
                    <p className="text-[10px] text-slate-400">{icon} {label}</p>
                    <p className={`truncate text-xs font-black leading-snug ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">🕋 Hicri tarihler Ümmü'l-Kurâ sistemine göredir · Hilal gözlemi esaslı takvimlerde ±1 gün fark olabilir</p>

              <div className={`mt-1.5 rounded-xl px-2.5 py-1.5 ${activeRetros.length > 0 ? "border border-rose-100 bg-rose-50/60" : "bg-slate-50/70"}`}>
                <p className="text-[10px] text-slate-400">🪐 Retro Durumu</p>
                {activeRetros.length === 0 ? (
                  <p className="text-xs font-black text-emerald-600">Aktif Retro Yok</p>
                ) : (
                  <div className="mt-0.5 space-y-0.5">
                    {activeRetros.map(r => {
                      const endDate = parseRetroDate(r.end);
                      const kalan   = Math.max(0, Math.ceil((endDate.getTime() - new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime()) / 86_400_000));
                      return (
                        <div key={r.planet} className="flex items-center justify-between gap-2">
                          <p className="text-xs font-black text-rose-700">{r.symbol} {r.planet} Retrosu</p>
                          <span className="shrink-0 text-[10px] text-slate-500">{kalan}g kaldı</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── Sağ Kolon ── */}
          <div className="flex flex-col gap-3">

            {/* Günlük Rehber */}
            <div className="rounded-2xl border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-indigo-600">🔮 Günlük Rehber</p>
              <div className="space-y-1.5">
                <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-2.5 py-2">
                  <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-violet-600">✨ Potansiyel</p>
                  <p className="line-clamp-3 text-xs leading-snug text-slate-700">{guidance.potential}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-2 py-1.5">
                  <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700">✓ Uygun</p>
                  <ul className="space-y-0.5">
                    {guidance.activities.slice(0, 3).map((a, i) => (
                      <li key={i} className="flex items-start gap-1 text-xs leading-snug text-slate-700">
                        <span className="mt-0.5 shrink-0 font-black text-emerald-500">✓</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50/50 px-2 py-1.5">
                  <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">⚠ Dikkat</p>
                  <ul className="space-y-0.5">
                    {guidance.cautions.slice(0, 3).map((c, i) => (
                      <li key={i} className="flex items-start gap-1 text-xs leading-snug text-slate-700">
                        <span className="mt-0.5 shrink-0 font-black text-amber-500">⚠</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-2 py-1.5">
                  <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-indigo-700">🧘 Ruhsal</p>
                  <p className="line-clamp-2 text-xs leading-snug text-slate-600">{guidance.spiritualSuggestion}</p>
                </div>
              </div>
            </div>

            {/* Yaklaşan Olaylar — max 8 */}
            <div className="rounded-2xl border border-white/80 bg-white/70 px-3 pt-2.5 pb-2 shadow-sm backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-600">📆 Yaklaşan Olaylar</p>
                {mergedUpcomingEvents.length > 8 && (
                  <button type="button" onClick={() => setShowAllEvents(v => !v)} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700">
                    {showAllEvents ? "Daha Az" : `Tümü (${mergedUpcomingEvents.length})`}
                  </button>
                )}
              </div>
              {mergedUpcomingEvents.length === 0 ? (
                <p className="text-[10px] text-slate-400">Yaklaşan olay yok.</p>
              ) : (
                <div className="divide-y divide-slate-100/80">
                  {(showAllEvents ? mergedUpcomingEvents : mergedUpcomingEvents.slice(0, 8)).map((ev, i) => (
                    <button key={i} type="button" onClick={() => navigateToDate(ev.date)} className="flex w-full items-center gap-1.5 py-1.5 text-left transition hover:opacity-75 first:pt-0 last:pb-0">
                      <span className="shrink-0 w-4 text-center text-sm leading-none">{ev.icon}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{ev.label}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${ev.badgeClass}`}>{ev.detail}</span>
                      <span className="shrink-0 w-8 text-right text-[10px] text-slate-400 tabular-nums">
                        {ev.daysFromNow === 0 ? "Bugün" : ev.daysFromNow === 1 ? "Yarın" : `${ev.daysFromNow}g`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Gezegen Saati mini */}
            {isSelectedToday && (
              <div className="rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-violet-50/60 to-indigo-50 px-3 py-2.5 shadow-sm backdrop-blur-md">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-indigo-700">⏰ Gezegen Saati</p>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg text-white shadow-md">{ph.aktifGezegen.symbol}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900">{ph.aktifGezegen.name} Saati</p>
                    <p className="text-xs text-slate-500">{ph.isDayHour ? "Gündüz" : "Gece"} · {ph.kalanDakika} dk kaldı</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-slate-400">Sonraki</p>
                    <p className="text-xs font-black text-slate-700">{ph.sonrakiGezegen.symbol} {ph.sonrakiGezegen.name}</p>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-indigo-400/70">📍 İstanbul koordinatlarına göre hesaplanmaktadır</p>
              </div>
            )}

          </div>
        </div>

        {/* ── Yaklaşan Kozmik Olaylar ── */}
        {cosmicEvents.length > 0 && (
          <section className="mt-4 rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md">
            <p className="mb-2.5 text-xs font-black uppercase tracking-[0.15em] text-indigo-600">🗓 Yaklaşan Kozmik Olaylar</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-2">
              {cosmicEvents.map((evt, i) => {
                const [evtY, evtM, evtD] = evt.date.split("-");
                const monthShort = (MONTH_NAMES_TR[parseInt(evtM ?? "1") - 1] ?? "").slice(0, 3);
                const dateLabel  = `${parseInt(evtD ?? "1")} ${monthShort} ${evtY}`;
                const st = COSMIC_EVENT_STYLE[evt.type];
                const typeLabel = COSMIC_EVENT_TYPE_LABEL[evt.type];
                return (
                  <div
                    key={`${evt.date}-${i}`}
                    className={`flex items-start gap-2.5 rounded-xl border ${st.border} ${st.bg} px-3 py-2.5`}
                  >
                    {/* Sembol */}
                    <span className="mt-0.5 shrink-0 text-[18px] leading-none">{evt.symbol}</span>
                    {/* İçerik */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <p className={`text-xs font-black leading-tight ${st.text}`}>{evt.title}</p>
                        <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${st.badge}`}>
                          {typeLabel}
                        </span>
                      </div>
                      <p className="mb-0.5 text-[10px] font-semibold text-slate-400">
                        {dateLabel}{evt.time ? ` · ${evt.time}` : ""}
                      </p>
                      <p className="line-clamp-2 text-xs leading-snug text-slate-500">{evt.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Bugünün Enerjisi — kompakt, tam genişlik ── */}
        <section className="relative mt-4 overflow-hidden rounded-[20px] border border-indigo-500/20 bg-gradient-to-br from-indigo-900 via-violet-900 to-indigo-800 p-4 shadow-[0_24px_64px_rgba(109,40,217,0.30),0_8px_24px_rgba(99,102,241,0.20)]">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-white/[0.02]" aria-hidden />
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" aria-hidden />
          <div className="relative">
            <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300/70">
              🌙 {isSelectedToday ? "Bugünün Enerjisi" : `${miladiDate} Enerjisi`}
            </p>
            <h2 className="text-lg font-black tracking-tight text-white">{energy.title}</h2>
            <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-relaxed text-indigo-100/75">{energy.mainTheme}</p>
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {[
                { lbl: "🎯 Odak", val: energy.focus },
                { lbl: "⚡ Tema", val: energy.theme },
                { lbl: "💡 Öneri", val: energy.recommendation },
              ].map(({ lbl, val }) => (
                <div key={lbl} className="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 backdrop-blur-sm">
                  <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-300/60">{lbl}</p>
                  <p className="text-xs font-bold text-white">{val}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
