"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { getHijriDate, getHijriMonthYear } from "@/lib/cosmic/hijri";
import {
  getMoonPhase, getMoonSign,
  getMonthPhaseEvents, getUpcomingPhaseEvents,
  type UpcomingPhaseEvent,
} from "@/lib/cosmic/moon";
import { getPlanetaryHour, getDayRuler, CHALDEAN_PLANETS } from "@/lib/cosmic/planetary-hours";
import {
  getActiveRetros, getUpcomingRetros, getNextRetro, parseRetroDate,
  RETRO_PERIODS,
  type RetroPeriod, type PlanetName,
} from "@/lib/cosmic/retro";
import { getPlanetSigns } from "@/lib/cosmic/planets";
import { getUpcomingCosmicEvents } from "@/lib/cosmic/events";
import { getDailyAspects, getPlanetLongitude, type AspectEvent, type AspectBody, type AspectName } from "@/lib/cosmic/aspects";
import { getAspectMotion, getNearestPass, type AspectPass, type AspectMotionState } from "@/lib/cosmic/aspectMotion";
import {
  getAllEclipses, getSolarCityVisibility, getLunarCityVisibility,
  type AnyEclipse, type LunarEclipse, type SolarCityVisibility, type LunarCityVisibility, type EclipseType, type EclipseObserver,
} from "@/lib/cosmic/eclipses";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { WORLD_LOCATIONS } from "@/lib/location/world";
import { searchLocations, normalizeLocationQuery, type Location } from "@/lib/location";
import { getUserLocationPref } from "@/lib/location/userLocationPref";
import { formatInTimeZone, formatDateTimeInTimeZone, getTimeZoneOffsetMinutes } from "@/lib/location/tz";
import { getCurrentVoidMoon, getUpcomingVoidMoonPeriods, getVoidMoonPeriods, type VoidMoonPeriod } from "@/lib/cosmic/voidMoon";
import {
  getLunarDistanceSnapshot, getUpcomingLunarApsisEvents, getSupermoonEvents, getMicromoonEvents,
  getLunarApsisEvents, getLunarSyzygyEvents,
  type LunarApsisEvent, type LunarSyzygyEvent,
} from "@/lib/cosmic/lunarOrbit";

// ─── Uzman Modu aspect yardımcıları (FAZ 2C Adım 3) ────────────────────────────

type ExpertAspectRow = { a: AspectEvent; motion: AspectMotionState | null; pass: AspectPass | null };

const TR_TZ = "Europe/Istanbul";

// P5c — Tutulma şehir seçici veri kaynağı: TR (81 il) + pilot global şehirler.
// Salt okunur; motor/DB'ye dokunmaz. Seçim id-tabanlıdır (aynı-isim ayrımı: Paris/FR ↔ Paris/TX).
const ECLIPSE_LOCATIONS: ReadonlyArray<Location> = [...TR_LOCATIONS, ...WORLD_LOCATIONS];
const DEFAULT_ECLIPSE_LOC_ID =
  ECLIPSE_LOCATIONS.find(l => l.name === "Ankara" && l.countryCode === "TR")?.id
  ?? ECLIPSE_LOCATIONS[0]?.id ?? "";

const fmtAspectTime    = new Intl.DateTimeFormat("tr-TR", { timeZone: TR_TZ, hour: "2-digit", minute: "2-digit" });
const fmtAspectDay     = new Intl.DateTimeFormat("tr-TR", { timeZone: TR_TZ, day: "numeric", month: "short" });
const fmtAspectDayYear = new Intl.DateTimeFormat("tr-TR", { timeZone: TR_TZ, day: "numeric", month: "long", year: "numeric" });

/** Exact saat etiketi — hassasiyet politikasına göre. Yavaş çiftlerde ASLA saat göstermez. */
function exactAspectLabel(pass: AspectPass | null, selected: Date): { text: string; precision: string } {
  if (!pass) return { text: "Exact doğrulanamadı", precision: "" };
  if (pass.displayPrecision === "date") {
    return { text: `Tam tarih: ${fmtAspectDayYear.format(pass.exactAt)}`, precision: "Tarih hassasiyetinde" };
  }
  const sameDay = fmtAspectDayYear.format(pass.exactAt) === fmtAspectDayYear.format(selected);
  const t = fmtAspectTime.format(pass.exactAt);
  return {
    text: sameDay ? `Tam: ${t}` : `Tam: ${fmtAspectDay.format(pass.exactAt)} ${t}`,
    precision: "Dakika hassasiyetinde",
  };
}

const motionDirTR = (d: AspectMotionState["direction"]): string =>
  d === "applying" ? "Yaklaşıyor" : d === "separating" ? "Ayrılıyor" : "Tam";

// ─── Void of Course Moon (FAZ 3B Adım 3 — normal kullanıcı) ────────────────────
// Yalnız production voidMoon engine verisi. Teknik alanlar (source/validation/id) gizli.

const VOC_MONTHS_SHORT: ReadonlyArray<string> = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
/** TR ISO ("2026-06-29T16:43:29+03:00") → "29 Haz · 16:43" (yerel duvar saati). */
function vocDateTime(tr: string): string {
  const [, mo, d] = tr.slice(0, 10).split("-").map(Number);
  return `${d} ${VOC_MONTHS_SHORT[(mo ?? 1) - 1]} · ${tr.slice(11, 16)}`;
}
/** Dakika → kısa süre etiketi ("2 gün 3 sa", "5 sa 59 dk", "12 dk"). */
function vocDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} gün`);
  if (h) parts.push(`${h} sa`);
  if (mm || parts.length === 0) parts.push(`${mm} dk`);
  return parts.join(" ");
}

const VOC_CLASSICAL_BODIES = ["Güneş", "Merkür", "Venüs", "Mars", "Jüpiter", "Satürn"] as const;
const VOC_ASPECT_NAMES = ["Kavuşum", "Sekstil", "Kare", "Üçgen", "Karşıt"] as const;

type VocFilterState = {
  scope: "all" | "ongoing" | "upcoming";
  duration: "all" | "short" | "long";   // kısa <3sa, uzun ≥3sa
  noAspectOnly: boolean;
  moonSign: string;   // "all" | burç
  planet: string;     // "all" | klasik cisim
  aspect: string;     // "all" | aspect türü
};
const DEFAULT_VOC_FILTERS: VocFilterState = { scope: "all", duration: "all", noAspectOnly: false, moonSign: "all", planet: "all", aspect: "all" };

// ─── Ay Yörüngesi (FAZ 3C Adım 3 — normal kullanıcı) ───────────────────────────
// Yalnız production lunarOrbit engine. Teknik alanlar (source/validation/id) gizli.

const fmtKm = (n: number): string => `${Math.round(n).toLocaleString("tr-TR")} km`;

function LunarApsisCard({ ev }: { ev: LunarApsisEvent }) {
  const perigee = ev.kind === "perigee";
  return (
    <div className={`rounded-xl border px-3 py-2.5 backdrop-blur-sm ${perigee ? "border-indigo-200/80 bg-indigo-50/60" : "border-slate-200/80 bg-slate-50/60"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm font-black ${perigee ? "text-indigo-700" : "text-slate-600"}`}>
          {perigee ? "Sonraki Perigee (en yakın Ay)" : "Sonraki Apogee (en uzak Ay)"}
        </p>
        <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-slate-500 tabular-nums">{fmtKm(ev.distanceKm)}</span>
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">{vocDateTime(ev.timeTR)} (TR)</p>
      <p className="mt-0.5 text-[11px] text-slate-500">Görünen çap: {ev.apparentDiameterDeg}° · <span className="text-slate-400">Zaman hassasiyeti: dakika düzeyi</span></p>
    </div>
  );
}

function LunarSyzygyCard({ ev, label }: { ev: LunarSyzygyEvent; label: string }) {
  const phase = ev.kind === "new-moon" ? "Yeniay" : "Dolunay";
  const super_ = ev.isSupermoon;
  return (
    <div className={`rounded-xl border px-3 py-2.5 backdrop-blur-sm ${super_ ? "border-amber-200/80 bg-amber-50/55" : "border-sky-200/80 bg-sky-50/55"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm font-black ${super_ ? "text-amber-700" : "text-sky-700"}`}>{label}</p>
        <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-slate-500 tabular-nums">{fmtKm(ev.distanceKm)}</span>
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">{phase} · {vocDateTime(ev.timeTR)} (TR)</p>
      <p className="mt-0.5 text-[11px] text-slate-400">Nolle/Espenak %90 yaklaşımı</p>
    </div>
  );
}

type LunarItem =
  | { type: "apsis"; ev: LunarApsisEvent; timeMs: number }
  | { type: "syzygy"; ev: LunarSyzygyEvent; timeMs: number };
type LunarFilterState = {
  kind: "all" | "perigee" | "apogee" | "supermoon" | "micromoon" | "new-moon" | "full-moon";
  period: "all" | "upcoming" | "past";
};
const DEFAULT_LUNAR_FILTERS: LunarFilterState = { kind: "all", period: "all" };

function LunarExpertCard({ item, onClick }: { item: LunarItem; onClick: () => void }) {
  const click = { role: "button" as const, tabIndex: 0, onClick,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } };
  const base = "cursor-pointer rounded-xl border px-3 py-2.5 backdrop-blur-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-300";
  if (item.type === "apsis") {
    const ev = item.ev; const perigee = ev.kind === "perigee";
    return (
      <div {...click} className={`${base} ${perigee ? "border-indigo-200/80 bg-indigo-50/55" : "border-slate-200/80 bg-slate-50/55"}`}>
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-sm font-black ${perigee ? "text-indigo-700" : "text-slate-600"}`}>{perigee ? "Perigee (en yakın Ay)" : "Apogee (en uzak Ay)"}</p>
          <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-slate-500 tabular-nums">{fmtKm(ev.distanceKm)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="min-w-0 truncate">{vocDateTime(ev.timeTR)} (TR) · çap {ev.apparentDiameterDeg}°</span>
          <span className="shrink-0 text-[10px] font-bold text-indigo-400">Detay →</span>
        </div>
      </div>
    );
  }
  const ev = item.ev; const phase = ev.kind === "new-moon" ? "Yeniay" : "Dolunay";
  return (
    <div {...click} className={`${base} ${ev.isSupermoon ? "border-amber-200/80 bg-amber-50/50" : ev.isMicromoon ? "border-sky-200/80 bg-sky-50/50" : "border-violet-100/70 bg-white/60"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-black text-slate-700">{phase}{ev.isSupermoon ? " · Supermoon" : ev.isMicromoon ? " · Micromoon" : ""}</p>
        <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-slate-500 tabular-nums">{fmtKm(ev.distanceKm)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="min-w-0 truncate">{vocDateTime(ev.timeTR)} (TR) · nolle %{ev.nollePercent}</span>
        <span className="shrink-0 text-[10px] font-bold text-indigo-400">Detay →</span>
      </div>
    </div>
  );
}

/** Uzman lunar detay paneli — tüm doğrulanmış alanlar. */
function LunarDetail({ item, onClose }: { item: LunarItem; onClose: () => void }) {
  const utc = (s: string) => s.slice(0, 16).replace("T", " ");
  let title: string; let fields: [string, string][]; let notes: string[]; let definition: string | null = null; let source: string;
  if (item.type === "apsis") {
    const ev = item.ev;
    title = `🌕 ${ev.kind === "perigee" ? "Perigee (en yakın Ay)" : "Apogee (en uzak Ay)"}`;
    fields = [
      ["Tür", ev.kind === "perigee" ? "Perigee" : "Apogee"],
      ["Tarih (TR)", vocDateTime(ev.timeTR)],
      ["UTC", utc(ev.timeUTC)],
      ["Mesafe", fmtKm(ev.distanceKm)],
      ["Mesafe (AU)", String(ev.distanceAu)],
      ["Görünen çap", `${ev.apparentDiameterDeg}°`],
      ["Zaman hassasiyeti", "dakika düzeyi"],
      ["Doğrulama", "harness-doğrulanmış"],
      ["Güven", ev.confidence],
    ];
    notes = ev.notes; source = ev.source;
  } else {
    const ev = item.ev;
    title = `🌕 ${ev.kind === "new-moon" ? "Yeniay" : "Dolunay"}${ev.isSupermoon ? " · Supermoon" : ev.isMicromoon ? " · Micromoon" : ""}`;
    fields = [
      ["Tür", ev.kind === "new-moon" ? "Yeniay" : "Dolunay"],
      ["Tarih (TR)", vocDateTime(ev.timeTR)],
      ["UTC", utc(ev.timeUTC)],
      ["Mesafe", fmtKm(ev.distanceKm)],
      ["Mesafe (AU)", String(ev.distanceAu)],
      ["Görünen çap", `${ev.apparentDiameterDeg}°`],
      ["Nolle %", String(ev.nollePercent)],
      ["Supermoon", ev.isSupermoon ? "Evet" : "Hayır"],
      ["Micromoon", ev.isMicromoon ? "Evet" : "Hayır"],
      ["Sabit ≤360k (yardımcı)", ev.fixedThresholdSuperCheck ? "Evet" : "Hayır"],
      ["Sabit ≥405k (yardımcı)", ev.fixedThresholdMicroCheck ? "Evet" : "Hayır"],
      ["En yakın perigee", ev.nearestPerigee ? fmtKm(ev.nearestPerigee.distanceKm) : "—"],
      ["En yakın apogee", ev.nearestApogee ? fmtKm(ev.nearestApogee.distanceKm) : "—"],
      ["Mesafe tipi", "geocentric merkez-merkez"],
      ["Doğrulama", "harness-doğrulanmış"],
      ["Güven", ev.confidence],
    ];
    notes = ev.notes; definition = ev.definition; source = ev.source;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div onClick={e => e.stopPropagation()} className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-indigo-100 bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="text-base font-black text-indigo-700">{title}</p>
          <button type="button" onClick={onClose} aria-label="Kapat" className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-500 hover:bg-slate-50">✕</button>
        </div>
        <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {fields.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-50/70 px-2.5 py-1.5">
              <dt className="text-[11px] font-semibold text-slate-500">{k}</dt>
              <dd className="text-right text-[11px] font-bold tabular-nums text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
        {notes.length > 0 && <p className="mt-2 rounded-lg bg-amber-50/70 px-2.5 py-1.5 text-[10px] leading-snug text-amber-700">{notes.join(" ")}</p>}
        {definition && <p className="mt-2 rounded-lg bg-indigo-50/70 px-2.5 py-1.5 text-[10px] leading-snug text-indigo-600">{definition}</p>}
        <p className="mt-1 text-[10px] leading-snug text-slate-400">Kaynak: {source}. Yalnız doğrulanmış astronomik veri; yorum/kehanet içermez.</p>
      </div>
    </div>
  );
}

function VocCard({ period, onClick }: { period: VoidMoonPeriod; onClick?: () => void }) {
  const p = period;
  const clickable = Boolean(onClick);
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); } } : undefined}
      className={`rounded-xl border border-violet-100/70 bg-white/65 px-3 py-2.5 backdrop-blur-sm ${
        clickable ? "cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-300" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-black text-violet-700">{p.moonSign} → {p.nextMoonSign}</p>
        <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-600">{p.durationLabel}</span>
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">
        {vocDateTime(p.voidStartTR)} → {vocDateTime(p.voidEndTR)} (TR)
      </p>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="min-w-0 truncate">
          {p.noAspectInSign
            ? "Bu burç periyodunda klasik kapsamda majör aspect bulunmadı."
            : <>Son aspect: <span className="font-semibold text-slate-700">Ay {p.lastAspect!.aspect} {p.lastAspect!.planet}</span></>}
        </span>
        {clickable && <span className="shrink-0 text-[10px] font-bold text-violet-400">Detay →</span>}
      </div>
    </div>
  );
}

/** Uzman VOC detay paneli — tüm doğrulanmış alanlar (teknik dahil). */
function VocDetail({ period, onClose }: { period: VoidMoonPeriod; onClose: () => void }) {
  const p = period;
  const fields: [string, string][] = [
    ["Ay burcu → sonraki", `${p.moonSign} → ${p.nextMoonSign}`],
    ["Burç başlangıcı (TR)", vocDateTime(p.signStartTR)],
    ["Burç bitişi (TR)", vocDateTime(p.signEndTR)],
    ["VOC başlangıcı (TR)", vocDateTime(p.voidStartTR)],
    ["VOC bitişi (TR)", vocDateTime(p.voidEndTR)],
    ["Süre", `${p.durationLabel} (${p.durationMinutes} dk)`],
    ["Son aspect", p.lastAspect ? `Ay ${p.lastAspect.aspect} ${p.lastAspect.planet}` : "—"],
    ["Son aspect (TR)", p.lastAspect ? vocDateTime(p.lastAspect.exactTR) : "—"],
    ["Aspectsiz burç", p.noAspectInSign ? "Evet" : "Hayır"],
    ["Doğrulama", p.validationStatus === "harness-verified" ? "harness-doğrulanmış" : p.validationStatus],
    ["Güven", p.confidence],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div onClick={e => e.stopPropagation()} className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-violet-100 bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="text-base font-black text-violet-700">🌙 {p.moonSign} → {p.nextMoonSign} · Void</p>
          <button type="button" onClick={onClose} aria-label="Kapat" className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-500 hover:bg-slate-50">✕</button>
        </div>
        <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {fields.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-50/70 px-2.5 py-1.5">
              <dt className="text-[11px] font-semibold text-slate-500">{k}</dt>
              <dd className="text-right text-[11px] font-bold text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Kapsam (klasik tanım)</p>
        <div className="space-y-1 text-[11px]">
          <p><span className="font-semibold text-slate-500">Dahil cisimler:</span> {p.includedBodies.join(", ")}</p>
          <p><span className="font-semibold text-slate-500">Dahil aspektler:</span> {p.includedAspects.join(", ")}</p>
          <p><span className="font-semibold text-slate-500">Hariç:</span> {p.excludedBodies.join(", ")}, minör aspektler</p>
        </div>
        {p.notes.length > 0 && <p className="mt-2 rounded-lg bg-amber-50/70 px-2.5 py-1.5 text-[10px] leading-snug text-amber-700">{p.notes.join(" ")}</p>}
        <p className="mt-2 rounded-lg bg-violet-50/70 px-2.5 py-1.5 text-[10px] leading-snug text-violet-600">{p.definition}</p>
        <p className="mt-1 text-[10px] leading-snug text-slate-400">Kaynak: {p.source}. Yalnız doğrulanmış astronomik veri; yorum/kehanet içermez.</p>
      </div>
    </div>
  );
}

// ─── Tutulmalar (FAZ 3A — normal + uzman) ──────────────────────────────────────
// Yalnız doğrulanmış production engine verisi. Saros/magnitude null iken gizlenir;
// obscuration "örtülme oranı" olarak gösterilir (magnitude DEĞİL); “Türkiye geneli” YOK.

type EclipsePeriod = "upcoming" | "past";
type EclipseCityVis = SolarCityVisibility | LunarCityVisibility;
type EclipseRow = { e: AnyEclipse; period: EclipsePeriod; vis: EclipseCityVis[]; visibleCount: number; totalCities: number };
type EclipseFilterState = {
  kind: "all" | "solar" | "lunar";
  visibility: "all" | "visible" | "invisible";
  type: "all" | EclipseType;
  period: "all" | EclipsePeriod;
};
const DEFAULT_ECLIPSE_FILTERS: EclipseFilterState = { kind: "all", visibility: "all", type: "all", period: "all" };
/**
 * Seçili ilin tutulma görünürlüğü — YALNIZ o il için hesaplanır (81 il peşin
 * hesaplanmaz). İl, 8 referans şehirden biriyse mevcut sonuçtan alınır (yeni hesap
 * yok); değilse yalnız o ilin koordinatı observer olarak geçirilir (motor cache'ler).
 */
function resolveSelVis(row: EclipseRow, loc: Location | undefined): EclipseCityVis | undefined {
  if (!loc) return undefined;
  const inRef = row.vis.find(v => v.city === loc.name);
  if (inRef) return inRef;
  const observers: EclipseObserver[] = [{ name: loc.name, lat: loc.lat, lon: loc.lon, elev: loc.elev }];
  const arr = row.e.kind === "solar"
    ? getSolarCityVisibility(row.e.id, observers)
    : getLunarCityVisibility(row.e.id, observers);
  return arr[0];
}

const ECLIPSE_TYPE_TR: Record<string, string> = {
  total: "Tam", partial: "Parçalı", annular: "Halkalı", penumbral: "Yarıgölge", hybrid: "Hibrit",
};
const eclipseTitleTR = (e: AnyEclipse): string =>
  `${ECLIPSE_TYPE_TR[e.eclipseType] ?? e.eclipseType} ${e.kind === "solar" ? "Güneş" : "Ay"} Tutulması`;
// P5c — +03:00 ISO string'i (isoTR) MUTLAK UTC anına çevirip seçili tz'de gösterir.
// Artık slice YOK; Europe/Istanbul için sonuç eski slice ile birebir aynı (P5e-1 doğruladı).
const zonedHHMM = (iso: string | null, tz: string): string | null =>
  iso ? formatInTimeZone(new Date(Date.parse(iso)), tz) : null;
const zonedDateTime = (iso: string, tz: string): string =>
  formatDateTimeInTimeZone(new Date(Date.parse(iso)), tz);
// Seçili tz'nin kısa etiketi — Europe/Istanbul mevcut "(TR)" etiketiyle birebir kalır.
const tzLabel = (tz: string): string => (tz === TR_TZ ? "TR" : tz);
// Aynı-isim ayrımı için alt satır etiketi (Paris/FR "Île-de-France · France" ↔ Paris/TX "Texas · United States").
const locSubLabel = (loc: Location): string =>
  loc.adminRegion && loc.adminRegion !== loc.name ? `${loc.adminRegion} · ${loc.country}` : loc.country;

// P5f-3: TR (authoritative) sonuçları ÖNCE, global/pilot sonuçlar SONRA; id ile dedup; limit korunur.
// Aynı-isim ayrımı id/tz/adminRegion/country ile korunur (Paris FR ↔ Paris US ayrı id).
function mergeCityResults(tr: ReadonlyArray<Location>, global: ReadonlyArray<Location>, limit: number): Location[] {
  const out: Location[] = [];
  const seen = new Set<string>();
  for (const l of [...tr, ...global]) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    out.push(l);
    if (out.length >= limit) break;
  }
  return out;
}

/** Seçili şehir için kısa görünürlük rozeti (genelleme yok). */
function cityVisBadge(vis: EclipseCityVis[], city: string): { text: string; visible: boolean } {
  const v = vis.find(x => x.city === city);
  if (!v) return { text: `${city}'dan görülmez`, visible: false };
  if (v.visible) {
    const near = v.visibilityStatus.includes("ufuk yakını");
    return { text: near ? `${city}'dan ufuk yakını` : `${city}'dan görülür`, visible: true };
  }
  return { text: `${city}'dan görülmez`, visible: false };
}

function EclipseCard({ e, tz, statusText, visible, coverage, onClick }: {
  e: AnyEclipse; tz: string; statusText: string; visible: boolean; coverage?: string | null; onClick?: () => void;
}) {
  const solar = e.kind === "solar";
  const obsc = e.obscuration;
  const clickable = Boolean(onClick);
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onClick!(); } } : undefined}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 backdrop-blur-sm ${
        clickable ? "cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300" : ""
      } ${solar ? "border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-orange-50/60" : "border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-fuchsia-50/60"}`}
    >
      <span className="shrink-0 text-2xl leading-none">{solar ? "☀️" : "🌙"}</span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-black ${solar ? "text-amber-700" : "text-violet-700"}`}>{eclipseTitleTR(e)}</p>
        <p className="text-[11px] font-semibold text-slate-500">
          {/* Europe/Istanbul: eski "tarih · HH:mm (TR)" birebir korunur. Diğer tz'lerde gün
              kayması olabildiği için tam yerel tarih-saat + IANA tz etiketi gösterilir. */}
          {tz === TR_TZ
            ? <>{e.dateTR} · {zonedHHMM(e.peakTR, tz)} (TR)</>
            : <>{zonedDateTime(e.peakUTC, tz)} ({tz})</>}
          {obsc != null ? ` · Örtülme oranı %${Math.round(obsc * 100)}` : ""}
          {coverage ? <span className="text-slate-400"> · {coverage}</span> : null}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        visible ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}>
        {statusText}
      </span>
    </div>
  );
}

/** Uzman detay paneli — yalnız doğrulanmış alanlar. Saros/magnitude null ise GÖSTERİLMEZ. */
function EclipseDetail({ row, city, tz, sel, onClose }: { row: EclipseRow; city: string; tz: string; sel: EclipseCityVis | undefined; onClose: () => void }) {
  const e = row.e;
  const solar = e.kind === "solar";
  const lbl = tzLabel(tz);
  const zt = (iso: string | null): string | null => zonedHHMM(iso, tz); // yerel HH:mm (mutlak an → seçili tz)
  const fields: [string, string][] = [
    ["Tür", eclipseTitleTR(e)],
    ["Saat dilimi", tz],
    ["Tarih", e.dateTR],
    [`Peak (${lbl})`, zonedDateTime(e.peakUTC, tz)],
    ["Peak (UTC)", e.peakUTC.slice(0, 16).replace("T", " ")],
  ];
  if (e.obscuration != null) fields.push(["Örtülme oranı", `%${Math.round(e.obscuration * 100)}`]);
  if (solar && sel) {
    const sv = sel as SolarCityVisibility;
    fields.push([`${city} görünürlük`, sv.visibilityStatus]);
    if (sv.altitudeAtPeak != null) fields.push([`${city} Güneş yüks.`, `${sv.altitudeAtPeak}°`]);
    if (zt(sv.partialBeginTR)) fields.push([`Parçalı başl. (${lbl})`, zt(sv.partialBeginTR)!]);
    if (zt(sv.totalBeginTR)) fields.push([`Tam başl. (${lbl})`, zt(sv.totalBeginTR)!]);
    if (zt(sv.peakTR)) fields.push([`${city} peak (${lbl})`, zt(sv.peakTR)!]);
    if (zt(sv.totalEndTR)) fields.push([`Tam bitiş (${lbl})`, zt(sv.totalEndTR)!]);
    if (zt(sv.partialEndTR)) fields.push([`Parçalı bitiş (${lbl})`, zt(sv.partialEndTR)!]);
  }
  if (!solar) {
    const le = e as LunarEclipse;
    if (zt(le.penumbralBeginTR)) fields.push([`Yarıgölge başl. (${lbl})`, zt(le.penumbralBeginTR)!]);
    if (zt(le.partialBeginTR)) fields.push([`Parçalı başl. (${lbl})`, zt(le.partialBeginTR)!]);
    if (zt(le.totalBeginTR)) fields.push([`Tam başl. (${lbl})`, zt(le.totalBeginTR)!]);
    if (zt(le.totalEndTR)) fields.push([`Tam bitiş (${lbl})`, zt(le.totalEndTR)!]);
    if (zt(le.partialEndTR)) fields.push([`Parçalı bitiş (${lbl})`, zt(le.partialEndTR)!]);
    if (zt(le.penumbralEndTR)) fields.push([`Yarıgölge bitiş (${lbl})`, zt(le.penumbralEndTR)!]);
    if (le.durTotalMin) fields.push(["Tam süre", `${le.durTotalMin} dk`]);
    if (le.durPartialMin) fields.push(["Parçalı süre", `${le.durPartialMin} dk`]);
    if (le.durPenumMin) fields.push(["Yarıgölge süre", `${le.durPenumMin} dk`]);
    if (sel) fields.push([`${city} Ay yüks.`, `${(sel as LunarCityVisibility).moonAltitudeAtPeak}°`]);
  }
  if (e.eclipseType === "hybrid") fields.push(["Hibrit", "katalog doğrulamalı"]);
  fields.push(["Doğrulama", e.validationStatus === "catalog-verified" ? "katalog-doğrulanmış" : "motor-doğrulanmış"]);
  if (e.saros != null) fields.push(["Saros", String(e.saros)]);
  if (e.magnitude != null) fields.push(["Magnitude", String(e.magnitude)]);

  const solarCov = solar ? `${row.visibleCount}/${row.totalCities} referans şehirde görülür` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div onClick={ev => ev.stopPropagation()} className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-amber-100 bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className={`text-base font-black ${solar ? "text-amber-700" : "text-violet-700"}`}>{solar ? "☀️" : "🌙"} {eclipseTitleTR(e)}</p>
          <button type="button" onClick={onClose} aria-label="Kapat" className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-500 hover:bg-slate-50">✕</button>
        </div>
        {solarCov && <p className="mb-2 text-[11px] font-semibold text-slate-500">{solarCov}</p>}
        <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {fields.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-50/70 px-2.5 py-1.5">
              <dt className="text-[11px] font-semibold text-slate-500">{k}</dt>
              <dd className="text-right text-[11px] font-bold tabular-nums text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
        {/* 8 şehir görünürlük listesi — şehir bazlı, genelleme yok */}
        <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Referans şehir görünürlüğü</p>
        <div className="grid grid-cols-2 gap-1">
          {row.vis.map(v => (
            <div key={v.city} className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1 text-[11px] ${v.visible ? "bg-emerald-50" : "bg-slate-50"}`}>
              <span className="font-semibold text-slate-600">{v.city}</span>
              <span className={`font-bold ${v.visible ? "text-emerald-700" : "text-slate-400"}`}>{v.visible ? "görülür" : "görülmez"}</span>
            </div>
          ))}
        </div>
        {e.notes.length > 0 && <p className="mt-2 rounded-lg bg-amber-50/70 px-2.5 py-1.5 text-[10px] leading-snug text-amber-700">{e.notes.join(" ")}</p>}
        <p className="mt-2 text-[10px] leading-snug text-slate-400">Yalnız doğrulanmış astronomik veri. Görünürlük şehir bazlıdır; “Türkiye geneli” iddiası içermez. Yorum/kehanet içermez.</p>
      </div>
    </div>
  );
}

// Uzman filtre paneli için tüm cisimler ve açı türleri
const ALL_BODIES: ReadonlyArray<AspectBody> = [
  "Güneş", "Ay", "Merkür", "Venüs", "Mars", "Jüpiter", "Satürn", "Uranüs", "Neptün", "Plüton",
];
const ALL_ASPECTS: ReadonlyArray<{ name: AspectName; symbol: string }> = [
  { name: "Kavuşum", symbol: "☌" }, { name: "Sekstil", symbol: "⚹" }, { name: "Kare", symbol: "□" },
  { name: "Üçgen", symbol: "△" }, { name: "Karşıt", symbol: "☍" },
];

type AspectFilters = {
  bodies: AspectBody[];        // boş = tümü
  aspects: AspectName[];       // boş = tümü
  orbMax: number;              // derece (üst sınır)
  applying: boolean;
  separating: boolean;
  onlyExact: boolean;          // yalnız exact saati doğrulanmış (pass var)
  stationOnly: boolean;        // yalnız istasyon yakını
  tripleOnly: boolean;         // yalnız çoklu geçiş (totalPassCount > 1)
};
const DEFAULT_FILTERS: AspectFilters = {
  bodies: [], aspects: [], orbMax: 8,
  applying: true, separating: true,
  onlyExact: false, stationOnly: false, tripleOnly: false,
};

const ZODIAC_TR: ReadonlyArray<string> = [
  "Koç", "Boğa", "İkizler", "Yengeç", "Aslan", "Başak",
  "Terazi", "Akrep", "Yay", "Oğlak", "Kova", "Balık",
];
/** Ekliptik boylamdan burç + burç-içi derece (yalnız konum; yorum yok). */
function signDegreeTR(lon: number): string {
  if (Number.isNaN(lon)) return "—";
  const n = ((lon % 360) + 360) % 360;
  const sign = ZODIAC_TR[Math.floor(n / 30) % 12];
  const deg = n % 30;
  return `${sign} ${deg.toFixed(2)}°`;
}

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
  "🌙 Hicri Takvim", "🌕 Ay Fazları", "🪐 Gezegen Saatleri",
] as const;

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


// ─── Arama motoru ─────────────────────────────────────────────────────────────

/**
 * Güvenli Türkçe normalize — arama eşleştirmesi için.
 * Büyük/küçük + diakritik bağımsız hâle getirir:
 *   "İlk Dördün" / "ilk dördün" / "ILK DORDUN" / "İLK DÖRDÜN" → hepsi "ilk dordun".
 * (Varsayılan toLowerCase, "İ" → "i̇" (i + U+0307) ürettiği için doğrudan eşleşme bozuluyordu.)
 */
function foldTR(s: string): string {
  return s
    .toLowerCase()                       // İ→i̇ (U+0307), I→i, diğerleri normal
    .replace(/ı/g, "i")                  // noktasız ı → i
    .normalize("NFD")                    // ö→o+combining, ş→s+combining, İ kalıntısı i+U+0307 ...
    .replace(/[̀-ͯ]/g, "")     // tüm birleşik işaretleri (U+0307 dahil) at
    .trim();
}

// Diakritiksiz ay adı → index (foldTR ile eşleşmesi için önceden katlanmış)
const MONTH_NAME_FOLDED: Record<string, number> = Object.fromEntries(
  Object.entries(MONTH_NAME_MAP).map(([name, idx]) => [foldTR(name), idx]),
);

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
  // Türkçe-güvenli normalize: büyük/küçük + diakritik bağımsız eşleşme (bkz. foldTR)
  const q = foldTR(query);
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
      if (q.includes(foldTR(key))) {
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

  // "42 gün sonra" (q diakritiksiz olduğundan "gun")
  const daysMatch = q.match(/^(\d+)\s*gun\s*sonra$/);
  if (daysMatch) {
    const n    = parseInt(daysMatch[1]!);
    const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    return { kind: "day", date: new Date(base.getFullYear(), base.getMonth(), base.getDate() + n) };
  }

  // "15 Ağustos 2026"
  const trDate = q.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (trDate) {
    const d = parseInt(trDate[1]!), mName = trDate[2]!, y = parseInt(trDate[3]!);
    const mIdx = MONTH_NAME_FOLDED[mName];
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

  for (const key of Object.keys(PHASE_KEYWORDS))    { if (q.includes(foldTR(key))) { phaseKey  = key; break; } }
  for (const [name, idx] of Object.entries(MONTH_NAME_FOLDED)) { if (q.includes(name)) { monthIdx = idx; break; } }
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

// Doğrulanmış veri destek aralığı (20.06.2026 – 31.12.2050)
// FAZ 1A/1B/1C sonrası gezegen konumları, retro ve burç geçişleri astronomy-engine ile
// hesaplandığından destek ufku AE pencerelerinin bittiği 2050'ye taşındı.
const SUPPORT_END_YEAR = 2050;

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default function CosmicCalendarPage() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [realNow] = useState(() => new Date());
  const todayYear = realNow.getFullYear(), todayMonth = realNow.getMonth(), todayDay = realNow.getDate();

  const [selectedDate,     setSelectedDate]     = useState<Date>(() => new Date(todayYear, todayMonth, todayDay));
  const [viewYear,         setViewYear]         = useState(todayYear);
  const [viewMonth,        setViewMonth]        = useState(todayMonth);
  const [showMoonPhases,   setShowMoonPhases]   = useState(true);
  const [showHicriDays,    setShowHicriDays]    = useState(false);
  const [showOnemliGunler, setShowOnemliGunler] = useState(true);
  const [dateInput,        setDateInput]        = useState("");
  const [searchQuery,      setSearchQuery]      = useState("");
  const [searchResult,     setSearchResult]     = useState<SearchResult>(null);
  const [showAllEvents,    setShowAllEvents]    = useState(false);
  const [expertMode,       setExpertMode]       = useState(false);  // Uzman Modu (FAZ 2C)
  const [includeMoonAsp,   setIncludeMoonAsp]   = useState(false);  // Ay açılarını dahil et (yalnız uzman)
  const [showFilters,      setShowFilters]      = useState(false);  // filtre paneli aç/kapa
  const [filters,          setFilters]          = useState<AspectFilters>(DEFAULT_FILTERS);
  const [detailRow,        setDetailRow]        = useState<ExpertAspectRow | null>(null);
  const [eclipseExpert,    setEclipseExpert]    = useState(false);   // Tutulmalar uzman modu
  const [eclipseLocId,     setEclipseLocId]     = useState<string>(DEFAULT_ECLIPSE_LOC_ID); // seçili konum (id-tabanlı; aynı-isim ayrımı)
  const [eclipseCityQuery, setEclipseCityQuery] = useState("Ankara"); // typeahead arama metni
  const [eclipseCityOpen,  setEclipseCityOpen]  = useState(false);    // typeahead açık mı
  const [eclipseCityActive, setEclipseCityActive] = useState(-1);     // klavye ile vurgulanan sonuç (aria-activedescendant)
  const [eclipseCityResults,   setEclipseCityResults]   = useState<Location[]>([]); // TR + global birleşik (async)
  const [eclipseCitySearching, setEclipseCitySearching] = useState(false);          // global API bekleniyor
  const [eclipseCityFallback,  setEclipseCityFallback]  = useState(false);          // global kısım pilot WORLD fallback'ten
  const [eclipseFilters,   setEclipseFilters]   = useState<EclipseFilterState>(DEFAULT_ECLIPSE_FILTERS);
  const [eclipseDetail,    setEclipseDetail]    = useState<EclipseRow | null>(null);
  const [vocExpert,        setVocExpert]        = useState(false);   // VOC uzman modu
  const [vocFilters,       setVocFilters]       = useState<VocFilterState>(DEFAULT_VOC_FILTERS);
  const [vocDetail,        setVocDetail]        = useState<VoidMoonPeriod | null>(null);
  const [lunarExpert,      setLunarExpert]      = useState(false);   // Ay Yörüngesi uzman modu
  const [lunarFilters,     setLunarFilters]     = useState<LunarFilterState>(DEFAULT_LUNAR_FILTERS);
  const [lunarDetail,      setLunarDetail]      = useState<LunarItem | null>(null);
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
  // ── Seçili güne ait veriler ───────────────────────────────────────────────
  const moonPhase   = useMemo(() => getMoonPhase(selectedDate),          [selectedDate]);
  // Seçili gün bir ana faz günüyse (Yeni Ay/İlk Dördün/Dolunay/Son Dördün), o günün
  // ayrık faz adını göster — takvim işareti (🌕/🌑…) ile gün kartı çelişmesin.
  // (Faz saati 00:00'dan farklı olsa bile kullanıcı için o gün "Dolunay günü" sayılır.)
  const selectedMainPhase = useMemo(() => {
    const main = new Set(["Yeni Ay", "İlk Dördün", "Dolunay", "Son Dördün"]);
    const hit = getMonthPhaseEvents(selectedDate.getFullYear(), selectedDate.getMonth())
      .find(e => e.day === selectedDate.getDate() && main.has(e.name));
    return hit ? { name: hit.name, emoji: hit.emoji } : null;
  }, [selectedDate]);
  // Gün kartı/özet için görüntülenecek faz: ana faz günüyse ayrık ad, değilse sürekli faz.
  const displayPhase = selectedMainPhase ?? moonPhase;
  const moonSign    = useMemo(() => getMoonSign(selectedDate),           [selectedDate]);
  const lunarSnap   = useMemo(() => getLunarDistanceSnapshot(selectedDate), [selectedDate]); // factual hero (doğrulanmış mesafe)
  const hijriDate   = useMemo(() => getHijriDate(selectedDate),          [selectedDate]);
  const miladiDate  = useMemo(() => formatMiladiDate(selectedDate),      [selectedDate]);
  const todayMiladi = useMemo(() => formatMiladiDate(realNow),           [realNow]); // "Şu An Gökyüzünde" rozeti — gerçek bugün
  const activeRetros = useMemo(() => getActiveRetros(selectedDate),      [selectedDate]);
  const isSelectedToday = useMemo(() => isSameDay(selectedDate, realNow), [selectedDate, realNow]);
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

  const cosmicEvents   = useMemo(() => getUpcomingCosmicEvents(realNow, 10), [realNow]);

  // ── Gökyüzü Açıları — seçili güne göre majör aspect'ler (FAZ 2B) ──────────────
  // Ay açıları (includesMoon) ve background gizli; yalnız very-strong/strong, maks 5.
  const skyAspects = useMemo<AspectEvent[]>(
    () => getDailyAspects(selectedDate)
      .filter(a => !a.includesMoon && a.strength !== "background")
      .slice(0, 5),
    [selectedDate],
  );

  // Normal kart yönü artık türev-tabanlı motordan gelir (eski heuristic UI'da kullanılmaz).
  const skyAspectsView = useMemo(
    () => skyAspects.map(a => ({
      a,
      dir: getAspectMotion(a.bodyA, a.bodyB, a.aspect, selectedDate)?.direction ?? a.direction,
    })),
    [skyAspects, selectedDate],
  );

  // ── Uzman Modu: exact saat + aspectMotion (FAZ 2C Adım 3) ──────────────────────
  // Yalnız expertMode açıkken hesaplanır. Ay açıları yalnız includeMoonAsp ile dahil.
  const expertAspects = useMemo<ExpertAspectRow[]>(() => {
    if (!expertMode) return [];
    return getDailyAspects(selectedDate)
      .filter(a => a.strength !== "background")
      .filter(a => includeMoonAsp || !a.includesMoon)
      .map(a => ({
        a,
        motion: getAspectMotion(a.bodyA, a.bodyB, a.aspect, selectedDate),
        pass:   getNearestPass(a.bodyA, a.bodyB, a.aspect, selectedDate),
      }));
  }, [expertMode, includeMoonAsp, selectedDate]);

  // Filtreler yalnız mevcut listeyi süzer — yeni hesap YAPMAZ.
  const filteredExpert = useMemo<ExpertAspectRow[]>(() => {
    return expertAspects.filter(({ a, motion, pass }) => {
      if (filters.bodies.length && !filters.bodies.includes(a.bodyA) && !filters.bodies.includes(a.bodyB)) return false;
      if (filters.aspects.length && !filters.aspects.includes(a.aspect)) return false;
      if (a.orbDeg > filters.orbMax) return false;
      const dir = motion?.direction ?? a.direction;
      if (dir === "applying" && !filters.applying) return false;
      if (dir === "separating" && !filters.separating) return false;
      if (filters.onlyExact && pass == null) return false;
      if (filters.stationOnly && !(motion?.isStationNearby || pass?.isStationNearby)) return false;
      if (filters.tripleOnly && !(pass != null && pass.totalPassCount > 1)) return false;
      return true;
    });
  }, [expertAspects, filters]);

  const filtersActive =
    filters.bodies.length > 0 || filters.aspects.length > 0 || filters.orbMax !== DEFAULT_FILTERS.orbMax ||
    !filters.applying || !filters.separating || filters.onlyExact || filters.stationOnly || filters.tripleOnly;

  // ── Tutulmalar (FAZ 3A) — yalnız production engine; şehir bağımsız zenginleştirme ──
  const eclipseData = useMemo<EclipseRow[]>(() => {
    const now = realNow.getTime();
    const all = getAllEclipses();
    const upcoming = all.filter(e => Date.parse(e.peakUTC) >= now).slice(0, 10);
    const past = all.filter(e => Date.parse(e.peakUTC) < now).slice(-6).reverse();
    const enrich = (e: AnyEclipse, period: EclipsePeriod): EclipseRow => {
      const vis = e.kind === "solar" ? getSolarCityVisibility(e.id) : getLunarCityVisibility(e.id);
      return { e, period, vis, visibleCount: vis.filter(v => v.visible).length, totalCities: vis.length };
    };
    return [...upcoming.map(e => enrich(e, "upcoming")), ...past.map(e => enrich(e, "past"))];
  }, [realNow]);

  // Konum cache'i (id → Location). ECLIPSE_LOCATIONS ile tohumlanır; global API'den gelen gn-*
  // sonuçları ve kayıtlı pref buraya yazılır → seçim client dataset'te olmasa da çözülür.
  const locCacheRef = useRef<Map<string, Location> | null>(null);
  const locCache = (locCacheRef.current ??= new Map(ECLIPSE_LOCATIONS.map((l): [string, Location] => [l.id, l])));

  // Seçili konum — kimlik id-tabanlı; nesne önce cache'ten (global gn-* dahil), yoksa statik dataset'ten.
  // Ad ve tz sunum için türetilir; Ankara yalnız gerçekten çözülemezse fallback.
  const selEclipseLoc = useMemo(
    () => locCache.get(eclipseLocId) ?? ECLIPSE_LOCATIONS.find(l => l.id === eclipseLocId),
    [eclipseLocId, locCache],
  );
  const eclipseCity = selEclipseLoc?.name ?? "Ankara";
  const eclipseTz = selEclipseLoc?.tz ?? TR_TZ;

  // P5g — Gezegen Saati / Gün Yöneticisi SEÇİLİ KONUMA göre: koordinat + IANA tz'nin DST-doğru
  // offset'i (getTimeZoneOffsetMinutes, lib/location/tz.ts salt kullanım). Motor default UTC+3 →
  // İstanbul/TR birebir korunur; global şehirde yerel gün doğumu/batımı + haftanın günü doğru olur.
  const eclipseOffsetNow = useMemo(() => getTimeZoneOffsetMinutes(realNow, eclipseTz), [realNow, eclipseTz]);
  const eclipseOffsetSel = useMemo(() => getTimeZoneOffsetMinutes(selectedDate, eclipseTz), [selectedDate, eclipseTz]);
  const dayRuler = useMemo(() => getDayRuler(selectedDate, eclipseOffsetSel), [selectedDate, eclipseOffsetSel]);
  const ph = useMemo(
    () => getPlanetaryHour(realNow, selEclipseLoc?.lat, selEclipseLoc?.lon, eclipseOffsetNow),
    [realNow, selEclipseLoc, eclipseOffsetNow],
  );

  // Combobox sunum yardımcıları (a11y). Popup: açık + (sonuç var VEYA sorgu var → durum satırı).
  const eclipseCityHasQuery = eclipseCityQuery.trim() !== "";
  const eclipseCityShowPopup = eclipseCityOpen && (eclipseCityResults.length > 0 || eclipseCityHasQuery);
  const eclipseActiveId = eclipseCityActive >= 0 && eclipseCityActive < eclipseCityResults.length
    ? `eclipse-opt-${eclipseCityResults[eclipseCityActive].id}` : undefined;

  // Seçim uygula — loc'u cache'e yazar (global gn-* dahil → çözülebilir), yalnız local state; DB'ye YAZMAZ.
  const selectEclipseLoc = (loc: Location) => {
    locCache.set(loc.id, loc);
    setEclipseLocId(loc.id);
    setEclipseCityQuery(loc.name);
    setEclipseCityOpen(false);
    setEclipseCityActive(-1);
  };

  // Async arama: TR daima client-side (TR_LOCATIONS, authoritative, anında); global ≥2 karakterde
  // debounce ile /api/location/search'ten; API hatasında pilot WORLD fallback. Race guard:
  // AbortController + artan requestId. Query cache (client-memory) tekrar sorguyu API'ye götürmez.
  const searchReqIdRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const globalQueryCacheRef = useRef<Map<string, Location[]>>(new Map());
  const apiCooldownUntilRef = useRef(0);
  useEffect(() => {
    if (!eclipseCityOpen) return;                       // yalnız açıkken ara → mount'ta API çağrısı yok
    const raw = eclipseCityQuery;
    const trimmed = raw.trim();
    const trMatches = trimmed.length >= 1 ? searchLocations(raw, { dataset: TR_LOCATIONS, limit: 10 }) : [];

    // <2 karakter: global API YOK; yalnız TR (P5d davranışı korunur).
    if (trimmed.length < 2) {
      setEclipseCitySearching(false);
      setEclipseCityFallback(false);
      setEclipseCityResults(mergeCityResults(trMatches, [], 10));
      return;
    }

    const norm = normalizeLocationQuery(raw);
    const cached = globalQueryCacheRef.current.get(norm);
    if (cached) {                                       // query cache → API'ye gitme
      setEclipseCitySearching(false);
      setEclipseCityFallback(false);
      setEclipseCityResults(mergeCityResults(trMatches, cached, 10));
      return;
    }
    if (Date.now() < apiCooldownUntilRef.current) {     // API kısa süre hata verdi → pilot fallback (agresif retry yok)
      const world = searchLocations(raw, { dataset: WORLD_LOCATIONS, limit: 10 });
      setEclipseCitySearching(false);
      setEclipseCityFallback(true);
      setEclipseCityResults(mergeCityResults(trMatches, world, 10));
      return;
    }

    setEclipseCityResults(mergeCityResults(trMatches, [], 10)); // TR'yi anında göster
    setEclipseCitySearching(true);
    setEclipseCityFallback(false);
    const myReqId = ++searchReqIdRef.current;
    const timer = setTimeout(() => {
      const ac = new AbortController();
      searchAbortRef.current = ac;
      fetch(`/api/location/search?q=${encodeURIComponent(raw)}&limit=10`, { signal: ac.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`http ${res.status}`);
          const json = await res.json();
          if (!json || json.ok !== true || !Array.isArray(json.results)) throw new Error("shape");
          if (myReqId !== searchReqIdRef.current) return;      // stale response → ignore
          const global = json.results as Location[];
          globalQueryCacheRef.current.set(norm, global);
          for (const g of global) locCache.set(g.id, g);
          apiCooldownUntilRef.current = 0;
          setEclipseCitySearching(false);
          setEclipseCityFallback(false);
          setEclipseCityResults(mergeCityResults(trMatches, global, 10));
        })
        .catch(() => {
          if (ac.signal.aborted) return;                       // abort hata sayılmaz
          if (myReqId !== searchReqIdRef.current) return;
          apiCooldownUntilRef.current = Date.now() + 15000;    // kısa cooldown
          const world = searchLocations(raw, { dataset: WORLD_LOCATIONS, limit: 10 });
          setEclipseCitySearching(false);
          setEclipseCityFallback(true);
          setEclipseCityResults(mergeCityResults(trMatches, world, 10));
        });
    }, 250);
    return () => { clearTimeout(timer); searchAbortRef.current?.abort(); };
  }, [eclipseCityQuery, eclipseCityOpen, locCache]);

  // Açılışta kullanıcının kayıtlı varsayılan konumunu yansıt. İlk render Ankara kalır
  // (hydration mismatch yok); fetch yalnız client'ta mount sonrası. Kayıt global konumsa ve
  // birleşik dataset'te varsa yansıtılır; bulunamazsa sessizce Ankara'da kalınır. Yalnız
  // yerel state günceller — DB'ye YAZMAZ, geçici seçimi EZMEZ (açılışta bir kez).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const pref = await getUserLocationPref();
      if (!alive || !pref) return;
      // Önce cache/statik dataset; yoksa pref alanlarından DOĞRUDAN Location kur (dataset lookup'a
      // bağımlı değil → pilotta olmayan global kayıtlı konum da yansır, Ankara'ya DÜŞMEZ).
      let loc = locCache.get(pref.location_id) ?? ECLIPSE_LOCATIONS.find(l => l.name === pref.name);
      if (!loc) {
        if (!pref.tz || !Number.isFinite(pref.lat) || !Number.isFinite(pref.lon)) return; // geçersiz pref → Ankara'da kal
        const src: Location["source"] =
          pref.source === "geonames" || pref.source === "manual" || pref.source === "geolocation" || pref.source === "nominatim"
            ? pref.source : "manual"; // yanlış "geonames"/"bundled" yazma → doğru kaynak/köken
        loc = {
          id: pref.location_id, name: pref.name,
          country: "", countryCode: (pref.country_code ?? "").toUpperCase(), adminRegion: "",
          lat: pref.lat, lon: pref.lon, elev: Number.isFinite(pref.elev) ? pref.elev : 0,
          tz: pref.tz, source: src, verified: true, origin: "user-added",
        };
      }
      locCache.set(loc.id, loc);
      setEclipseLocId(loc.id);
      setEclipseCityQuery(loc.name);
    })();
    return () => { alive = false; };
  }, [locCache]);

  // Uzman filtreleri — yalnız mevcut listeyi süzer; görünürlük YALNIZ seçili il için hesaplanır
  const eclipseFiltered = useMemo<EclipseRow[]>(() => {
    return eclipseData.filter(row => {
      if (eclipseFilters.kind !== "all" && row.e.kind !== eclipseFilters.kind) return false;
      if (eclipseFilters.period !== "all" && row.period !== eclipseFilters.period) return false;
      if (eclipseFilters.type !== "all" && row.e.eclipseType !== eclipseFilters.type) return false;
      const selVisible = Boolean(resolveSelVis(row, selEclipseLoc)?.visible);
      if (eclipseFilters.visibility === "visible" && !selVisible) return false;
      if (eclipseFilters.visibility === "invisible" && selVisible) return false;
      return true;
    });
  }, [eclipseData, eclipseFilters, selEclipseLoc]);
  const eclipseFiltersActive =
    eclipseFilters.kind !== "all" || eclipseFilters.visibility !== "all" ||
    eclipseFilters.type !== "all" || eclipseFilters.period !== "all";

  // ── Void of Course Moon (FAZ 3B) — yalnız production engine ──
  const vocData = useMemo(() => {
    const nowMs = realNow.getTime();
    const cur = getCurrentVoidMoon(realNow);
    const voidStartMs = cur ? Date.parse(cur.voidStartUTC) : 0;
    const voidEndMs = cur ? Date.parse(cur.voidEndUTC) : 0;
    const isVoidNow = cur ? nowMs >= voidStartMs && nowMs < voidEndMs : false;
    const upcoming = getUpcomingVoidMoonPeriods(realNow, 6);
    return { cur, isVoidNow, nowMs, voidStartMs, voidEndMs, upcoming };
  }, [realNow]);

  // ── Ay Yörüngesi (FAZ 3C) — yalnız production engine ──
  const lunarData = useMemo(() => {
    const snap = getLunarDistanceSnapshot(realNow);
    const apsides = getUpcomingLunarApsisEvents(realNow, 4);
    const nextPerigee = apsides.find(a => a.kind === "perigee") ?? null;
    const nextApogee = apsides.find(a => a.kind === "apogee") ?? null;
    const horizon = new Date(realNow.getTime() + 400 * 86_400_000);
    const nextSuper = getSupermoonEvents(realNow, horizon)[0] ?? null;
    const nextMicro = getMicromoonEvents(realNow, horizon)[0] ?? null;
    return { snap, nextPerigee, nextApogee, nextSuper, nextMicro };
  }, [realNow]);

  // Uzman: ~230 günlük apsis + syzygy listesi (filtrelenir; yeni hesap yok)
  const lunarExpertList = useMemo<LunarItem[]>(() => {
    if (!lunarExpert) return [];
    const from = new Date(realNow.getTime() - 30 * 86_400_000);
    const end = new Date(realNow.getTime() + 200 * 86_400_000);
    const apsides: LunarItem[] = getLunarApsisEvents(from, end).map(a => ({ type: "apsis", ev: a, timeMs: Date.parse(a.timeUTC) }));
    const syzygies: LunarItem[] = getLunarSyzygyEvents(from, end).map(s => ({ type: "syzygy", ev: s, timeMs: Date.parse(s.timeUTC) }));
    return [...apsides, ...syzygies].sort((a, b) => a.timeMs - b.timeMs);
  }, [lunarExpert, realNow]);

  const lunarFiltered = useMemo<LunarItem[]>(() => {
    const now = realNow.getTime();
    return lunarExpertList.filter(it => {
      const future = it.timeMs >= now;
      if (lunarFilters.period === "upcoming" && !future) return false;
      if (lunarFilters.period === "past" && future) return false;
      const k = lunarFilters.kind;
      if (k === "all") return true;
      if (it.type === "apsis") return k === it.ev.kind;
      if (k === "supermoon") return it.ev.isSupermoon;
      if (k === "micromoon") return it.ev.isMicromoon;
      return k === it.ev.kind;
    });
  }, [lunarExpertList, lunarFilters, realNow]);
  const lunarFiltersActive = lunarFilters.kind !== "all" || lunarFilters.period !== "all";

  // Uzman: ~60 günlük VOC listesi (filtrelenir; yeni hesap yok — engine'den)
  const vocExpertList = useMemo<VoidMoonPeriod[]>(() => {
    if (!vocExpert) return [];
    const from = new Date(realNow.getTime() - 86_400_000);
    const end = new Date(realNow.getTime() + 60 * 86_400_000);
    return getVoidMoonPeriods(from, end).filter(p => Date.parse(p.voidEndUTC) >= realNow.getTime());
  }, [vocExpert, realNow]);

  const vocFiltered = useMemo<VoidMoonPeriod[]>(() => {
    const now = realNow.getTime();
    return vocExpertList.filter(p => {
      const sMs = Date.parse(p.voidStartUTC), eMs = Date.parse(p.voidEndUTC);
      const ongoing = now >= sMs && now < eMs;
      if (vocFilters.scope === "ongoing" && !ongoing) return false;
      if (vocFilters.scope === "upcoming" && !(sMs > now)) return false;
      if (vocFilters.duration === "short" && p.durationMinutes >= 180) return false;
      if (vocFilters.duration === "long" && p.durationMinutes < 180) return false;
      if (vocFilters.noAspectOnly && !p.noAspectInSign) return false;
      if (vocFilters.moonSign !== "all" && p.moonSign !== vocFilters.moonSign) return false;
      if (vocFilters.planet !== "all" && p.lastAspect?.planet !== vocFilters.planet) return false;
      if (vocFilters.aspect !== "all" && p.lastAspect?.aspect !== vocFilters.aspect) return false;
      return true;
    });
  }, [vocExpertList, vocFilters, realNow]);
  const vocSignsPresent = useMemo(() => Array.from(new Set(vocExpertList.map(p => p.moonSign))), [vocExpertList]);
  const vocFiltersActive =
    vocFilters.scope !== "all" || vocFilters.duration !== "all" || vocFilters.noAspectOnly ||
    vocFilters.moonSign !== "all" || vocFilters.planet !== "all" || vocFilters.aspect !== "all";

  // ── Yaklaşan bilgi blokları ───────────────────────────────────────────────

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

  // ── Kozmik Merkez kartları — mini özet ───────────────────────────────────────
  const cosmicCenterCards = useMemo(() => {
    const rt = upcomingRetrosList[0];
    const mp = upcomingMoonPhases[0];
    return [
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
        // FAZ 6C: FAZ 4'te kaldırılan Hacamat navigasyon linki geri eklendi (route zaten mevcut).
        emoji: "🩸", title: "Hacamat Takvimi", href: "/cosmic-calendar/hacamat",
        color: "from-emerald-50/80 to-teal-50/60 border-emerald-100/70 hover:border-emerald-200",
        titleColor: "text-emerald-700", summaryColor: "text-emerald-600",
        s1: "Ay fazları ve destekleyici",
        s2: "dönem bilgileri",
      },
    ];
  }, [upcomingRetrosList, upcomingMoonPhases, realNow]);

  // ── Şu An Gökyüzünde — özet hesapları (realNow) ──────────────────────────────
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
    // B1 (FAZ 6A): burç değişimi + retro bitişi de tek listeye. Yeni/dolunay ve retro-başlangıç
    // zaten yukarıda (upcomingMoonPhases / upcomingRetrosList) → onları tekrar ekleme (çift sayım yok).
    for (const e of cosmicEvents) {
      if (e.type !== "sign_change" && e.type !== "retro_end") continue;
      const [y, m, d] = e.date.split("-");
      const dt = new Date(parseInt(y ?? "2026"), parseInt(m ?? "1") - 1, parseInt(d ?? "1"));
      const days = Math.ceil((dt.getTime() - today.getTime()) / 86_400_000);
      const dateLbl = dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
      events.push({
        date: dt, daysFromNow: days, icon: e.symbol, label: e.title,
        detail: e.time ? `${dateLbl} ${e.time}` : dateLbl,
        badgeClass: e.type === "retro_end" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700",
      });
    }
    return events.sort((a, b) => a.daysFromNow - b.daysFromNow).slice(0, 12);
  }, [upcomingRetrosList, upcomingMoonPhases, cosmicEvents, todayYear, todayMonth, todayDay]);

  // Arama sonucu gün verisi
  const searchDayData = useMemo(() => {
    if (!searchResult || searchResult.kind !== "day") return null;
    const d = searchResult.date;
    return {
      miladi:      formatMiladiDate(d),
      hicri:       getHijriDate(d),
      phase:       getMoonPhase(d),
      sign:        getMoonSign(d),
    };
  }, [searchResult]);

  const cellHeight = showHicriDays ? "h-10" : "h-8";

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

      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-4 pt-4 pb-4 sm:px-6 lg:px-8 xl:px-10">

        {isDemo && (
          <DemoModuleBanner message="Kozmik takvim hesaplamaları anlık ve gerçek verilerle çalışır. Tüm içerikler demo hesabında görüntülenebilir." />
        )}

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
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
                <span className="mt-px shrink-0 text-indigo-400" aria-hidden>🔭</span>
                <span>Kozmik Ajanda yalnız doğrulanmış astronomik veri sunar; yorum, kehanet veya kişisel tavsiye içermez.</span>
              </p>
            </div>
          </div>
        </section>

        {/* ── Şu An Gökyüzünde (realNow) ── */}
        <section className="mb-4 overflow-hidden rounded-[18px] border border-indigo-200/70 bg-gradient-to-br from-indigo-600/[0.09] via-violet-500/[0.07] to-indigo-400/[0.05] p-4 shadow-[0_6px_28px_rgba(99,102,241,0.14)] backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-700">🌙 Şu An Gökyüzünde</p>
            <span className="rounded-full border border-indigo-200/60 bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-indigo-500">{todayMiladi}</span>
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

        {/* ── Yaklaşan Olaylar (full-width) ── */}
        <div className="mb-4 rounded-2xl border border-white/80 bg-white/70 px-3 pt-2.5 pb-2 shadow-sm backdrop-blur-md">
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
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {(showAllEvents ? mergedUpcomingEvents : mergedUpcomingEvents.slice(0, 8)).map((ev, i) => (
                <button key={i} type="button" onClick={() => navigateToDate(ev.date)} className="flex w-full items-center gap-1.5 border-b border-slate-100/80 py-1.5 text-left transition hover:opacity-75">
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

        {/* ── Ana 2-Kolon Grid ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_310px] lg:items-start">

          {/* ── Sol Kolon ── */}
          <div className="flex flex-col gap-3">

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
                  const showSub    = showHicriDays && hijriNum;
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
                    placeholder="Dolunay, Retro veya tarih ara..."
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
                  { icon: displayPhase.emoji, label: "Ay Fazı",    value: displayPhase.name,                        color: "text-violet-700" },
                  { icon: moonSign.emoji,  label: "Ay Burcu",   value: moonSign.name,                            color: "text-indigo-700" },
                  { icon: dayRuler.symbol, label: "Gezegen",    value: dayRuler.name,                            color: "text-indigo-600" },
                  { icon: "📏",            label: "Ay Mesafesi", value: fmtKm(lunarSnap.distanceKm),             color: "text-cyan-700" },
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

            {/* Veri aralığı dışı uyarısı */}
            {isAfterSupportEnd && (
              <div className="rounded-[14px] border border-amber-200/80 bg-amber-50/80 px-3 py-2.5" role="alert">
                <p className="text-[10px] font-black text-amber-800">⚠ Doğrulanmış Veri Aralığı Dışında</p>
                <p className="mt-0.5 text-[10px] leading-snug text-amber-700">
                  Bu tarih henüz doğrulanmış veri aralığında değildir (destek: 20.06.2026 – 31.12.2050). Gezegen konumları ve diğer veriler yaklaşık olabilir.
                </p>
              </div>
            )}

          </div>

          {/* ── Sağ Kolon ── */}
          <div className="flex flex-col gap-3">

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
                <p className="mt-2 text-[10px] text-indigo-400/70">📍 {eclipseCity} konumuna göre hesaplanmaktadır</p>
                {ph.isFallback && (
                  <p className="mt-1 text-[10px] leading-relaxed text-amber-600">
                    Bu enlemde bugün gün doğumu/batımı oluşmadığı için gezegen saati yaklaşık gösterilir.
                  </p>
                )}
                <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                  Gündoğumu/günbatımı astronomik hesaptır; gezegen saati ataması geleneksel sistemdir.
                </p>
              </div>
            )}

          </div>
        </div>

        {/* ── Gezegenlerin Güncel Burç Konumları ── */}
        <section className="mb-4 overflow-hidden rounded-[18px] border border-indigo-100/80 bg-gradient-to-br from-indigo-50/90 via-violet-50/70 to-cyan-50/80 p-4 shadow-sm backdrop-blur-md">

          {/* Başlık */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-indigo-600">🪐 Gezegenlerin Güncel Burç Konumları</p>
            <span className="rounded-full border border-indigo-200/60 bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-indigo-500">{todayMiladi}</span>
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

        </section>

        {/* ── Gökyüzü Açıları (FAZ 2B + 2C Uzman Modu) ── */}
        <section className="mb-4 overflow-hidden rounded-[18px] border border-indigo-100/80 bg-gradient-to-br from-indigo-50/90 via-violet-50/70 to-cyan-50/80 p-4 shadow-sm backdrop-blur-md">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-indigo-600">🪐 Gökyüzü Açıları</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setExpertMode(v => !v)}
                aria-pressed={expertMode}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors ${
                  expertMode
                    ? "border-violet-300 bg-violet-600 text-white"
                    : "border-indigo-200/70 bg-white/70 text-indigo-500 hover:bg-white"
                }`}
              >
                {expertMode ? "Uzman Modu: Açık" : "Uzman Modu"}
              </button>
              <span className="rounded-full border border-indigo-200/60 bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-indigo-500">{miladiDate}</span>
            </div>
          </div>

          {expertMode && (
            <div className="mb-3 space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-violet-100 bg-white/60 px-3 py-2">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={includeMoonAsp}
                    onChange={e => setIncludeMoonAsp(e.target.checked)}
                    className="h-3.5 w-3.5 accent-violet-600"
                  />
                  Ay açılarını dahil et
                </label>
                <button
                  type="button"
                  onClick={() => setShowFilters(v => !v)}
                  aria-pressed={showFilters}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors ${
                    showFilters ? "border-violet-300 bg-violet-100 text-violet-700" : "border-slate-200 bg-white/70 text-slate-500 hover:bg-white"
                  }`}
                >
                  ⚙ Filtreler{filtersActive ? " •" : ""}
                </button>
                <span className="ml-auto text-[10px] font-semibold text-slate-400">{filteredExpert.length}/{expertAspects.length} açı</span>
              </div>

              {showFilters && (
                <div className="space-y-2.5 rounded-xl border border-violet-100 bg-white/70 px-3 py-2.5">
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Cisim</p>
                    <div className="flex flex-wrap gap-1">
                      {ALL_BODIES.map(b => {
                        const on = filters.bodies.includes(b);
                        return (
                          <button key={b} type="button"
                            onClick={() => setFilters(f => ({ ...f, bodies: on ? f.bodies.filter(x => x !== b) : [...f.bodies, b] }))}
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${on ? "border-violet-400 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-500"}`}>
                            {b}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Açı türü</p>
                    <div className="flex flex-wrap gap-1">
                      {ALL_ASPECTS.map(asp => {
                        const on = filters.aspects.includes(asp.name);
                        return (
                          <button key={asp.name} type="button"
                            onClick={() => setFilters(f => ({ ...f, aspects: on ? f.aspects.filter(x => x !== asp.name) : [...f.aspects, asp.name] }))}
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${on ? "border-violet-400 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-500"}`}>
                            {asp.symbol} {asp.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                      Orb ≤
                      <input type="range" min={0} max={8} step={0.5} value={filters.orbMax}
                        onChange={e => setFilters(f => ({ ...f, orbMax: Number(e.target.value) }))}
                        className="accent-violet-600" />
                      <span className="w-8 tabular-nums">{filters.orbMax}°</span>
                    </label>
                    {([
                      ["applying", "Applying"], ["separating", "Separating"],
                      ["onlyExact", "Yalnız exact"], ["stationOnly", "İstasyon yakını"], ["tripleOnly", "Çoklu geçiş"],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                        <input type="checkbox" checked={filters[key]} onChange={e => setFilters(f => ({ ...f, [key]: e.target.checked }))} className="h-3.5 w-3.5 accent-violet-600" />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] leading-snug text-slate-400">Yalnız doğrulanmış majör açılar; filtre yeni hesap yapmaz.</span>
                    <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} disabled={!filtersActive}
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${filtersActive ? "border-slate-300 bg-white text-slate-600 hover:bg-slate-50" : "border-slate-100 bg-slate-50 text-slate-300"}`}>
                      Filtreleri temizle
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!expertMode ? (
            skyAspectsView.length === 0 ? (
              <p className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 text-xs text-slate-500">
                Seçili gün için öne çıkan majör açı görünmüyor.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {skyAspectsView.map(({ a, dir }) => {
                  const dirTR = motionDirTR(dir);
                  const strongest = a.strength === "very-strong";
                  return (
                    <div
                      key={a.id}
                      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2 backdrop-blur-sm ${
                        strongest ? "border-violet-200/80 bg-white/80" : "border-indigo-100/70 bg-white/60"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-sm font-black text-slate-900">
                        <span className="text-indigo-500">{a.bodyASymbol}</span>
                        <span className="truncate">{a.bodyA}</span>
                        <span className="shrink-0 px-0.5 text-base text-indigo-400">{a.aspectSymbol}</span>
                        <span className="text-indigo-500">{a.bodyBSymbol}</span>
                        <span className="truncate">{a.bodyB}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] font-semibold text-slate-500">
                        <span className="text-slate-400">·</span>
                        <span className="tabular-nums">{a.orbText}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-indigo-600">{dirTR}</span>
                        <span className="text-slate-300">·</span>
                        <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${
                          strongest ? "bg-violet-100 text-violet-700" : "bg-indigo-50 text-indigo-600"
                        }`}>
                          {strongest ? "Çok güçlü" : "Güçlü"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            filteredExpert.length === 0 ? (
              <p className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 text-xs text-slate-500">
                {expertAspects.length === 0
                  ? `Seçili gün için majör açı görünmüyor${includeMoonAsp ? "" : " (Ay açıları kapalı)"}.`
                  : "Filtrelerle eşleşen açı yok — filtreleri gevşetin veya temizleyin."}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {filteredExpert.map((row) => {
                  const { a, motion, pass } = row;
                  const dirTR = motionDirTR(motion?.direction ?? a.direction);
                  const strongest = a.strength === "very-strong";
                  const exact = exactAspectLabel(pass, selectedDate);
                  const rel = motion ? `${motion.relativeAngularSpeed.toFixed(2)}°/gün` : null;
                  const station = Boolean(motion?.isStationNearby || pass?.isStationNearby);
                  const triple = pass != null && pass.totalPassCount > 1;
                  return (
                    <div
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailRow(row)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailRow(row); } }}
                      className={`cursor-pointer rounded-xl border px-3 py-2 backdrop-blur-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-300 ${
                        strongest ? "border-violet-200/80 bg-white/85" : "border-indigo-100/70 bg-white/65"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="flex min-w-0 items-center gap-1.5 text-sm font-black text-slate-900">
                          <span className="text-indigo-500">{a.bodyASymbol}</span>
                          <span className="truncate">{a.bodyA}</span>
                          <span className="shrink-0 px-0.5 text-base text-indigo-400">{a.aspectSymbol}</span>
                          <span className="text-indigo-500">{a.bodyBSymbol}</span>
                          <span className="truncate">{a.bodyB}</span>
                        </span>
                        {a.includesMoon && <span className="rounded-full bg-cyan-50 px-1.5 py-px text-[10px] font-bold text-cyan-600">☽ Ay</span>}
                        {station && <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-700">⚠ İstasyon yakını</span>}
                        {triple && <span className="rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-bold text-violet-700">{pass!.passNumber}/{pass!.totalPassCount} geçiş</span>}
                        <span className="ml-auto shrink-0 text-[10px] font-bold text-violet-400">Detay →</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-slate-500">
                        <span className="font-bold text-slate-700">{exact.text}</span>
                        {exact.precision && (<><span className="text-slate-300">·</span><span className="text-slate-400">{exact.precision}</span></>)}
                        <span className="text-slate-300">·</span>
                        <span className="text-indigo-600">{dirTR}</span>
                        <span className="text-slate-300">·</span>
                        <span className="tabular-nums">orb {a.orbText}</span>
                        {rel && (<><span className="text-slate-300">·</span><span className="tabular-nums">{rel}</span></>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          <p className="mt-2.5 text-[10px] leading-snug text-slate-400">
            Bu bölüm gezegenlerin gökyüzündeki açısal konumlarını gösterir. Astronomik veriye dayanır; yorum içermez.
          </p>

          {/* ── Aspect Detay Penceresi (yalnız doğrulanmış astronomik alanlar) ── */}
          {detailRow && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
              onClick={() => setDetailRow(null)}
              role="dialog"
              aria-modal="true"
            >
              <div
                onClick={e => e.stopPropagation()}
                className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-violet-100 bg-white p-4 shadow-xl sm:rounded-2xl"
              >
                {(() => {
                  const { a, motion, pass } = detailRow;
                  const exact = exactAspectLabel(pass, selectedDate);
                  const confTR = pass ? (pass.confidence === "high" ? "Yüksek" : pass.confidence === "medium" ? "Orta" : "Yalnız konum") : "—";
                  const stationOn = Boolean(motion?.isStationNearby || pass?.isStationNearby);
                  const stationBody = pass?.stationBody ?? motion?.stationBody ?? null;
                  const rows: [string, string][] = [
                    ["Açı türü", `${a.aspect} (${a.aspectAngle}°) ${a.aspectSymbol}`],
                    [exact.text.startsWith("Tam tarih") ? "Exact tarih" : "Exact", exact.text.replace(/^Tam(\s*tarih)?:\s*/, "")],
                    ["Hassasiyet", pass ? (pass.displayPrecision === "minute" ? "Dakika düzeyi" : "Tarih düzeyi") : "Doğrulanamadı"],
                    ["Güven", confTR],
                    ["Orb", a.orbText],
                    ["Yön", motionDirTR(motion?.direction ?? a.direction)],
                    ["Göreli hız", motion ? `${motion.relativeAngularSpeed.toFixed(3)}°/gün` : "—"],
                    ["İşaretli hız", motion ? `${motion.signedSpeed.toFixed(3)}°/gün (${motion.relativeMotion === "retrograde" ? "retro" : "direkt"})` : "—"],
                    ["Orb türevi", motion ? `${motion.orbDerivative.toFixed(3)}°/gün` : "—"],
                    ["Geçiş", pass ? `${pass.passNumber}/${pass.totalPassCount}` : "—"],
                    ["İstasyon yakını", stationOn ? `Evet${stationBody ? ` (${stationBody})` : ""}` : "Hayır"],
                    [`${a.bodyA} retro`, motion ? (motion.retroA ? "Evet" : "Hayır") : "—"],
                    [`${a.bodyB} retro`, motion ? (motion.retroB ? "Evet" : "Hayır") : "—"],
                    [`${a.bodyA} konum`, signDegreeTR(getPlanetLongitude(a.bodyA, selectedDate))],
                    [`${a.bodyB} konum`, signDegreeTR(getPlanetLongitude(a.bodyB, selectedDate))],
                  ];
                  if (pass) rows.push(["Artık (residual)", `${pass.residualArcsec}″`]);
                  return (
                    <>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="flex flex-wrap items-center gap-1.5 text-base font-black text-slate-900">
                          <span className="text-indigo-500">{a.bodyASymbol}</span>{a.bodyA}
                          <span className="px-0.5 text-indigo-400">{a.aspectSymbol}</span>
                          <span className="text-indigo-500">{a.bodyBSymbol}</span>{a.bodyB}
                        </p>
                        <button type="button" onClick={() => setDetailRow(null)} aria-label="Kapat"
                          className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-500 hover:bg-slate-50">✕</button>
                      </div>
                      <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {rows.map(([k, v]) => (
                          <div key={k} className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-50/70 px-2.5 py-1.5">
                            <dt className="text-[11px] font-semibold text-slate-500">{k}</dt>
                            <dd className="text-right text-[11px] font-bold tabular-nums text-slate-800">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      {pass ? (
                        <p className="mt-2 rounded-lg bg-violet-50/70 px-2.5 py-1.5 text-[10px] leading-snug text-violet-600">{pass.precisionPolicy}</p>
                      ) : (
                        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] leading-snug text-amber-700">Bu açı için exact an doğrulanamadı; yalnız anlık konum bilgisi gösterilir.</p>
                      )}
                      <p className="mt-2 text-[10px] leading-snug text-slate-400">Yalnız doğrulanmış astronomik veri. Yorum, ev sistemi veya kişisel transit içermez.</p>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </section>

        {/* ── Tutulmalar (FAZ 3A Adım 3+4) ── */}
        <section className="mb-4 overflow-hidden rounded-[18px] border border-amber-100/80 bg-gradient-to-br from-amber-50/70 via-white/55 to-violet-50/70 p-4 shadow-sm backdrop-blur-md">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-amber-700">🌑 Tutulmalar</p>
            <button
              type="button"
              onClick={() => setEclipseExpert(v => !v)}
              aria-pressed={eclipseExpert}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors ${
                eclipseExpert ? "border-amber-300 bg-amber-600 text-white" : "border-amber-200/70 bg-white/70 text-amber-600 hover:bg-white"
              }`}
            >
              {eclipseExpert ? "Uzman Modu: Açık" : "Uzman Modu"}
            </button>
          </div>
          <p className="mb-3 mt-0.5 text-[11px] text-slate-500">Yaklaşan ve geçmiş doğrulanmış Güneş ve Ay tutulmaları.</p>

          {!eclipseExpert ? (
            <>
              {eclipseData.filter(r => r.period === "upcoming").length > 0 && (
                <>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Yaklaşan</p>
                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {eclipseData.filter(r => r.period === "upcoming").map(row => {
                      const b = cityVisBadge(row.vis, "Ankara");
                      return <EclipseCard key={row.e.id} e={row.e} tz={TR_TZ} statusText={b.text} visible={b.visible} />;
                    })}
                  </div>
                </>
              )}
              {eclipseData.filter(r => r.period === "past").length > 0 && (
                <>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Geçmiş</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {eclipseData.filter(r => r.period === "past").map(row => {
                      const b = cityVisBadge(row.vis, "Ankara");
                      return <EclipseCard key={row.e.id} e={row.e} tz={TR_TZ} statusText={b.text} visible={b.visible} />;
                    })}
                  </div>
                </>
              )}
              <p className="mt-2.5 text-[10px] leading-snug text-slate-400">
                Astronomik veriye dayanır; yorum içermez. Görünürlük Ankara referans alınarak gösterilir.
              </p>
            </>
          ) : (
            <>
              {/* Şehir seçici + filtreler */}
              <div className="mb-3 space-y-2 rounded-xl border border-amber-100 bg-white/60 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600" htmlFor="eclipse-city-search">Şehir ara (TR + global):</label>
                  <div className="relative">
                    <input
                      id="eclipse-city-search"
                      type="text"
                      role="combobox"
                      aria-expanded={eclipseCityShowPopup}
                      aria-controls="eclipse-city-listbox"
                      aria-autocomplete="list"
                      aria-activedescendant={eclipseActiveId}
                      value={eclipseCityQuery}
                      onChange={ev => { setEclipseCityQuery(ev.target.value); setEclipseCityOpen(true); setEclipseCityActive(-1); }}
                      onFocus={() => setEclipseCityOpen(true)}
                      onBlur={() => setTimeout(() => setEclipseCityOpen(false), 150)}
                      onKeyDown={ev => {
                        if (ev.key === "ArrowDown") {
                          ev.preventDefault();
                          if (!eclipseCityOpen) { setEclipseCityOpen(true); return; }
                          setEclipseCityActive(i => Math.min(i + 1, eclipseCityResults.length - 1));
                        } else if (ev.key === "ArrowUp") {
                          ev.preventDefault();
                          setEclipseCityActive(i => (i <= 0 ? 0 : i - 1));
                        } else if (ev.key === "Enter") {
                          if (eclipseCityOpen && eclipseCityActive >= 0 && eclipseCityActive < eclipseCityResults.length) {
                            ev.preventDefault();
                            selectEclipseLoc(eclipseCityResults[eclipseCityActive]);
                          }
                        } else if (ev.key === "Escape") {
                          setEclipseCityOpen(false); setEclipseCityActive(-1);
                        }
                      }}
                      placeholder="Örn. Manisa, Berlin, Tokyo…"
                      autoComplete="off"
                      aria-label="Tutulma için şehir ara"
                      className="w-44 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 focus:border-amber-300 focus:outline-none"
                    />
                    {eclipseCityShowPopup && (
                      <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg">
                        {eclipseCityResults.length > 0 ? (
                          <ul id="eclipse-city-listbox" role="listbox" aria-label="Şehir sonuçları" className="max-h-56 overflow-y-auto py-1">
                            {eclipseCityResults.map((loc, idx) => {
                              const active = idx === eclipseCityActive;
                              const current = loc.id === eclipseLocId;
                              return (
                                <li
                                  key={loc.id}
                                  id={`eclipse-opt-${loc.id}`}
                                  role="option"
                                  aria-selected={active}
                                  onMouseDown={ev => ev.preventDefault()}
                                  onMouseEnter={() => setEclipseCityActive(idx)}
                                  onClick={() => selectEclipseLoc(loc)}
                                  className={`flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-1 text-left text-[11px] ${active ? "bg-amber-100 text-amber-800" : current ? "bg-amber-50 font-bold text-amber-700" : "text-slate-700 hover:bg-amber-50"}`}
                                >
                                  <span className="min-w-0 flex-1 truncate">{loc.name}</span>
                                  <span className="max-w-[112px] shrink-0 truncate text-[9px] text-slate-400">{locSubLabel(loc)}</span>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          // Sonuç yok: aria-safe listbox (option DEĞİL) — klavye buraya gitmez.
                          <div id="eclipse-city-listbox" role="listbox" aria-label="Şehir sonuçları" className="px-2.5 py-1.5 text-[11px] text-slate-400">
                            {eclipseCitySearching ? "Global aranıyor…" : "Eşleşen şehir yok"}
                          </div>
                        )}
                        {/* Durum satırları: seçilebilir option DEĞİL; aktif index'e girmez. */}
                        {eclipseCityResults.length > 0 && eclipseCitySearching && (
                          <div role="status" aria-live="polite" className="border-t border-slate-100 px-2.5 py-1 text-[9px] text-slate-400">Global aranıyor…</div>
                        )}
                        {eclipseCityResults.length > 0 && !eclipseCitySearching && eclipseCityFallback && (
                          <div role="note" className="border-t border-slate-100 px-2.5 py-1 text-[9px] text-amber-600">Global arama sınırlı listeden gösteriliyor.</div>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">Seçili: <span className="font-semibold text-slate-600">{eclipseCity}</span>{selEclipseLoc && locSubLabel(selEclipseLoc) ? <span className="text-slate-400"> — {locSubLabel(selEclipseLoc)}</span> : null} <span className="text-slate-400">({eclipseTz})</span> · görünürlük seçili ile göredir, “Türkiye geneli” iddiası değildir.</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {([["all", "Tümü"], ["solar", "Güneş"], ["lunar", "Ay"]] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setEclipseFilters(f => ({ ...f, kind: k }))}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${eclipseFilters.kind === k ? "border-amber-400 bg-amber-600 text-white" : "border-slate-200 bg-white text-slate-500"}`}>{l}</button>
                  ))}
                  <span className="mx-1 text-slate-300">|</span>
                  {([["all", "Hepsi"], ["visible", "Görülebilen"], ["invisible", "Görülemeyen"]] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setEclipseFilters(f => ({ ...f, visibility: k }))}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${eclipseFilters.visibility === k ? "border-emerald-400 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-500"}`}>{l}</button>
                  ))}
                  <span className="mx-1 text-slate-300">|</span>
                  {([["all", "Tümü"], ["upcoming", "Yaklaşan"], ["past", "Geçmiş"]] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setEclipseFilters(f => ({ ...f, period: k }))}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${eclipseFilters.period === k ? "border-violet-400 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-500"}`}>{l}</button>
                  ))}
                  <span className="mx-1 text-slate-300">|</span>
                  <select value={eclipseFilters.type}
                    onChange={ev => setEclipseFilters(f => ({ ...f, type: ev.target.value as EclipseFilterState["type"] }))}
                    className="rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    <option value="all">Tüm türler</option>
                    <option value="total">Tam</option>
                    <option value="partial">Parçalı</option>
                    <option value="annular">Halkalı</option>
                    <option value="hybrid">Hibrit</option>
                    <option value="penumbral">Yarıgölge</option>
                  </select>
                  {eclipseFiltersActive && (
                    <button type="button" onClick={() => setEclipseFilters(DEFAULT_ECLIPSE_FILTERS)}
                      className="ml-auto rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50">Temizle</button>
                  )}
                </div>
              </div>

              {eclipseFiltered.length === 0 ? (
                <p className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 text-xs text-slate-500">Filtrelerle eşleşen tutulma yok.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {eclipseFiltered.map(row => {
                    const selVis = resolveSelVis(row, selEclipseLoc);
                    const b = cityVisBadge(selVis ? [selVis] : [], eclipseCity);
                    const coverage = `${row.visibleCount}/${row.totalCities} ref. şehir`;
                    return <EclipseCard key={row.e.id} e={row.e} tz={eclipseTz} statusText={b.text} visible={b.visible} coverage={coverage} onClick={() => setEclipseDetail(row)} />;
                  })}
                </div>
              )}
              <p className="mt-2.5 text-[10px] leading-snug text-slate-400">
                Şehir bazlı görünürlük; “Türkiye geneli” iddiası içermez. Karta tıklayarak detay açabilirsiniz.
              </p>
            </>
          )}

          {eclipseDetail && <EclipseDetail row={eclipseDetail} city={eclipseCity} tz={eclipseTz} sel={resolveSelVis(eclipseDetail, selEclipseLoc)} onClose={() => setEclipseDetail(null)} />}
        </section>

        {/* ── Ay Boşlukta mı? (FAZ 3B Adım 3) ── */}
        <section className="mb-4 overflow-hidden rounded-[18px] border border-violet-100/80 bg-gradient-to-br from-violet-50/80 via-indigo-50/55 to-white/60 p-4 shadow-sm backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-violet-700">🌙 Ay Boşlukta mı?</p>
            <button
              type="button"
              onClick={() => setVocExpert(v => !v)}
              aria-pressed={vocExpert}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors ${
                vocExpert ? "border-violet-300 bg-violet-600 text-white" : "border-violet-200/70 bg-white/70 text-violet-600 hover:bg-white"
              }`}
            >
              {vocExpert ? "Uzman Modu: Açık" : "Uzman Modu"}
            </button>
          </div>
          <p className="mb-3 mt-0.5 text-[11px] text-slate-500">Klasik Void of Course Moon hesabına göre Ay&apos;ın boşlukta olduğu zaman aralıkları.</p>

          {/* Şu an durumu */}
          {vocData.cur && (
            <div className={`mb-3 rounded-xl border px-3 py-2.5 ${
              vocData.isVoidNow ? "border-amber-200/80 bg-amber-50/70" : "border-violet-200/70 bg-white/70"
            }`}>
              {vocData.isVoidNow ? (
                <>
                  <p className="text-sm font-black text-amber-700">🌙 Ay şu an boşlukta</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-slate-600">{vocData.cur.moonSign} → {vocData.cur.nextMoonSign}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                    {vocDateTime(vocData.cur.voidStartTR)} → {vocDateTime(vocData.cur.voidEndTR)} (TR) · Kalan: {vocDuration((vocData.voidEndMs - vocData.nowMs) / 60000)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-black text-violet-700">Ay şu an boşlukta değil</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-slate-600">Sonraki boşluk: {vocData.cur.moonSign} → {vocData.cur.nextMoonSign}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                    {vocDateTime(vocData.cur.voidStartTR)} → {vocDateTime(vocData.cur.voidEndTR)} (TR) · Süre: {vocData.cur.durationLabel}
                  </p>
                </>
              )}
            </div>
          )}

          {!vocExpert ? (
            /* Normal: yaklaşan kartlar (tıklanmaz) */
            vocData.upcoming.length > 0 && (
              <>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Yaklaşan</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {vocData.upcoming.map(p => <VocCard key={p.id} period={p} />)}
                </div>
              </>
            )
          ) : (
            /* Uzman: filtreler + tıklanabilir kartlar */
            <>
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-violet-100 bg-white/60 px-3 py-2.5">
                {([["all", "Tümü"], ["ongoing", "Şu an"], ["upcoming", "Yaklaşan"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setVocFilters(f => ({ ...f, scope: k }))}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${vocFilters.scope === k ? "border-violet-400 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-500"}`}>{l}</button>
                ))}
                <span className="mx-0.5 text-slate-300">|</span>
                {([["all", "Süre"], ["short", "Kısa <3sa"], ["long", "Uzun ≥3sa"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setVocFilters(f => ({ ...f, duration: k }))}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${vocFilters.duration === k ? "border-indigo-400 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-500"}`}>{l}</button>
                ))}
                <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-600">
                  <input type="checkbox" checked={vocFilters.noAspectOnly} onChange={e => setVocFilters(f => ({ ...f, noAspectOnly: e.target.checked }))} className="h-3 w-3 accent-violet-600" />
                  Aspectsiz
                </label>
                <select value={vocFilters.moonSign} onChange={e => setVocFilters(f => ({ ...f, moonSign: e.target.value }))}
                  className="rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  <option value="all">Tüm burçlar</option>
                  {vocSignsPresent.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={vocFilters.planet} onChange={e => setVocFilters(f => ({ ...f, planet: e.target.value }))}
                  className="rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  <option value="all">Tüm gezegenler</option>
                  {VOC_CLASSICAL_BODIES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select value={vocFilters.aspect} onChange={e => setVocFilters(f => ({ ...f, aspect: e.target.value }))}
                  className="rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  <option value="all">Tüm aspektler</option>
                  {VOC_ASPECT_NAMES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                {vocFiltersActive && (
                  <button type="button" onClick={() => setVocFilters(DEFAULT_VOC_FILTERS)}
                    className="ml-auto rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50">Temizle</button>
                )}
              </div>

              {vocFiltered.length === 0 ? (
                <p className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 text-xs text-slate-500">Filtrelerle eşleşen VOC penceresi yok.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {vocFiltered.map(p => <VocCard key={p.id} period={p} onClick={() => setVocDetail(p)} />)}
                </div>
              )}
            </>
          )}

          {/* Tanım etiketi */}
          <p className="mt-3 text-[10px] leading-snug text-slate-400">
            Hesap tanımı: klasik VOC — Ay&apos;ın Güneş, Merkür, Venüs, Mars, Jüpiter ve Satürn ile yaptığı son majör aspectten sonraki burç girişine kadar olan süre.
            Uranüs, Neptün, Plüton, Chiron, asteroidler ve minör aspectler varsayılan hesaba dahil değildir.
          </p>

          {vocDetail && <VocDetail period={vocDetail} onClose={() => setVocDetail(null)} />}
        </section>

        {/* ── Ay Yörüngesi (FAZ 3C Adım 3) ── */}
        <section className="mb-4 overflow-hidden rounded-[18px] border border-indigo-100/80 bg-gradient-to-br from-indigo-50/70 via-slate-50/55 to-sky-50/70 p-4 shadow-sm backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-indigo-700">🌕 Ay Yörüngesi</p>
            <button
              type="button"
              onClick={() => setLunarExpert(v => !v)}
              aria-pressed={lunarExpert}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors ${
                lunarExpert ? "border-indigo-300 bg-indigo-600 text-white" : "border-indigo-200/70 bg-white/70 text-indigo-600 hover:bg-white"
              }`}
            >
              {lunarExpert ? "Uzman Modu: Açık" : "Uzman Modu"}
            </button>
          </div>
          <p className="mb-3 mt-0.5 text-[11px] text-slate-500">Ay-Dünya mesafesi, perigee/apogee ve Supermoon/Micromoon olayları.</p>

          {/* 1. Şu anki mesafe */}
          <div className="mb-3 rounded-xl border border-indigo-200/70 bg-white/70 px-3 py-2.5">
            <p className="text-[12px] font-semibold text-slate-600">Ay-Dünya mesafesi: <span className="text-base font-black text-indigo-700 tabular-nums">{fmtKm(lunarData.snap.distanceKm)}</span></p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Görünen çap: {lunarData.snap.apparentDiameterDeg}° · Mesafe tipi: Dünya merkezi ↔ Ay merkezi (geocentric)</p>
          </div>

          {!lunarExpert ? (
            <>
              {/* 2. Yaklaşan perigee/apogee */}
              {(lunarData.nextPerigee || lunarData.nextApogee) && (
                <>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Yaklaşan en yakın / en uzak Ay</p>
                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {lunarData.nextPerigee && <LunarApsisCard ev={lunarData.nextPerigee} />}
                    {lunarData.nextApogee && <LunarApsisCard ev={lunarData.nextApogee} />}
                  </div>
                </>
              )}
              {/* 3. Yaklaşan supermoon/micromoon */}
              {(lunarData.nextSuper || lunarData.nextMicro) && (
                <>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Yaklaşan Supermoon / Micromoon</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {lunarData.nextSuper && <LunarSyzygyCard ev={lunarData.nextSuper} label="Yaklaşan Supermoon" />}
                    {lunarData.nextMicro && <LunarSyzygyCard ev={lunarData.nextMicro} label="Yaklaşan Micromoon" />}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* Kapsam / tanım paneli */}
              <div className="mb-2 rounded-xl border border-indigo-100 bg-white/60 px-3 py-2 text-[10px] leading-snug text-slate-500">
                Mesafe tipi: <b>geocentric merkez-merkez</b> · Supermoon/Micromoon: <b>Nolle/Espenak %90</b> · Sabit eşikler: yalnız yardımcı · Topocentric: varsayılan değil · Apsis zamanı: dakika düzeyi.
              </div>
              {/* Filtreler */}
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-indigo-100 bg-white/60 px-3 py-2.5">
                {([["all", "Tümü"], ["perigee", "Perigee"], ["apogee", "Apogee"], ["supermoon", "Supermoon"], ["micromoon", "Micromoon"], ["new-moon", "Yeniay"], ["full-moon", "Dolunay"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setLunarFilters(f => ({ ...f, kind: k }))}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${lunarFilters.kind === k ? "border-indigo-400 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-500"}`}>{l}</button>
                ))}
                <span className="mx-0.5 text-slate-300">|</span>
                {([["all", "Hepsi"], ["upcoming", "Yaklaşan"], ["past", "Geçmiş"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setLunarFilters(f => ({ ...f, period: k }))}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${lunarFilters.period === k ? "border-sky-400 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-500"}`}>{l}</button>
                ))}
                {lunarFiltersActive && (
                  <button type="button" onClick={() => setLunarFilters(DEFAULT_LUNAR_FILTERS)}
                    className="ml-auto rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50">Temizle</button>
                )}
              </div>
              {lunarFiltered.length === 0 ? (
                <p className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 text-xs text-slate-500">Filtrelerle eşleşen olay yok.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {lunarFiltered.map(it => <LunarExpertCard key={it.ev.id} item={it} onClick={() => setLunarDetail(it)} />)}
                </div>
              )}
            </>
          )}

          {/* Tanım etiketi */}
          <p className="mt-3 text-[10px] leading-snug text-slate-400">
            Mesafe: geocentric merkez-merkez Ay-Dünya mesafesidir (Dünya merkezi ↔ Ay merkezi).
            Supermoon/Micromoon etiketi Nolle/Espenak %90 perigee-apogee yaklaşımına göre hesaplanır; ham mesafe (km) her zaman gösterilir.
            Sabit km eşikleri (≤360.000 / ≥405.000 km) yalnız yardımcı çapraz kontroldür; birincil tanım değildir.
          </p>

          {lunarDetail && <LunarDetail item={lunarDetail} onClose={() => setLunarDetail(null)} />}
        </section>

        {/* ── Kozmik Merkezler (kapanış, en alt — yardımcı bağlantılar) ── */}
        <section className="mt-6 border-t border-slate-200/70 pt-4">
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

      </div>
    </main>
  );
}
