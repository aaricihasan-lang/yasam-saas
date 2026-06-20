"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMonthPhaseEvents, getUpcomingPhaseEvents } from "@/lib/cosmic/moon";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const MONTH_NAMES_TR: ReadonlyArray<string> = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const MEDAL = ["🥇", "🥈", "🥉"] as const;

// ─── Tip tanımları ─────────────────────────────────────────────────────────────

type StrongDayReason = { label: string; pts: number };

type PowerDay = {
  date:         Date;
  daysFromNow:  number;
  score:        number;
  moonLabel:    string;
  moonEmoji:    string;
  moonPts:      number;
  numValue:     number;
  numPts:       number;
  reasons:      StrongDayReason[];
};

type PowerFilter = "all" | "min3" | "min4" | "thisMonth" | "days90";

// ─── Hesaplama ─────────────────────────────────────────────────────────────────

function numerologicalDay(date: Date): number {
  const digits = `${date.getDate()}${date.getMonth() + 1}${date.getFullYear()}`.split("").map(Number);
  let n = digits.reduce((a, b) => a + b, 0);
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n).split("").map(Number).reduce((a, b) => a + b, 0);
  }
  return n;
}

// AE tabanlı faz olayından skor — noon-scan yok
function scoreDay(
  date: Date,
  phaseEvt?: { name: string; emoji: string },
): PowerDay | null {
  const num = numerologicalDay(date);
  let score = 0;
  const reasons: StrongDayReason[] = [];
  let moonLabel = "", moonEmoji = "", moonPts = 0, numPts = 0;

  if (phaseEvt) {
    if      (phaseEvt.name === "Dolunay")    { moonPts = 3; moonLabel = "Dolunay";    moonEmoji = phaseEvt.emoji; }
    else if (phaseEvt.name === "Yeni Ay")    { moonPts = 2; moonLabel = "Yeni Ay";    moonEmoji = phaseEvt.emoji; }
    else if (phaseEvt.name === "İlk Dördün") { moonPts = 1; moonLabel = "İlk Dördün"; moonEmoji = phaseEvt.emoji; }
  }

  if      (num === 11 || num === 22 || num === 33) numPts = 3;
  else if (num === 1  || num === 8)                numPts = 1;

  score = moonPts + numPts;
  if (score === 0) return null;

  if (moonPts > 0) reasons.push({ label: `${moonEmoji} ${moonLabel}`, pts: moonPts });
  if (numPts  > 0) reasons.push({ label: `${num} sayısı`,             pts: numPts  });

  return { date, daysFromNow: 0, score, moonLabel, moonEmoji, moonPts, numValue: num, numPts, reasons };
}

function getMonthPowerDays(year: number, month: number): PowerDay[] {
  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const result: PowerDay[] = [];
  const today         = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // AE tabanlı faz olayları — gerçek TR takvim günleri (noon-scan değil)
  const phaseMap = new Map<number, { name: string; emoji: string }>();
  for (const evt of getMonthPhaseEvents(year, month)) {
    if (!phaseMap.has(evt.day)) phaseMap.set(evt.day, { name: evt.name, emoji: evt.emoji });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d, 12, 0, 0);
    const raw  = scoreDay(date, phaseMap.get(d));
    if (!raw) continue;
    const df = Math.ceil((date.getTime() - todayMidnight.getTime()) / 86_400_000);
    result.push({ ...raw, daysFromNow: df });
  }
  return result.sort((a, b) => b.score - a.score || a.date.getDate() - b.date.getDate());
}

function getUpcomingPowerDays(from: Date, days: number): PowerDay[] {
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const result: PowerDay[] = [];

  // AE tabanlı faz olayları — gerçek TR takvim günleri
  const phaseDateMap = new Map<string, { name: string; emoji: string }>();
  for (const evt of getUpcomingPhaseEvents(from, days)) {
    const key = `${evt.date.getFullYear()}-${evt.date.getMonth()}-${evt.date.getDate()}`;
    if (!phaseDateMap.has(key)) phaseDateMap.set(key, { name: evt.name, emoji: evt.emoji });
  }

  for (let i = 1; i <= days; i++) {
    const date = new Date(fromMidnight.getFullYear(), fromMidnight.getMonth(), fromMidnight.getDate() + i, 12, 0, 0);
    const key  = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const raw  = scoreDay(date, phaseDateMap.get(key));
    if (!raw) continue;
    result.push({ ...raw, daysFromNow: i });
  }
  return result.sort((a, b) => a.daysFromNow - b.daysFromNow);
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export default function PowerDaysPage() {
  const now = useMemo(() => new Date(), []);
  const [filter,   setFilter]   = useState<PowerFilter>("all");
  const [showAll,  setShowAll]  = useState(false);
  const INITIAL_SHOW = 20;

  const thisMonthDays = useMemo(
    () => getMonthPowerDays(now.getFullYear(), now.getMonth()),
    [now],
  );
  const top3 = useMemo(() => thisMonthDays.slice(0, 3), [thisMonthDays]);

  const upcoming90 = useMemo(() => getUpcomingPowerDays(now, 90),  [now]);
  const upcoming30 = useMemo(() => getUpcomingPowerDays(now, 30),  [now]);

  const filtered = useMemo((): PowerDay[] => {
    if (filter === "thisMonth") return upcoming30;
    const base = upcoming90;
    if (filter === "min3") return base.filter(d => d.score >= 3);
    if (filter === "min4") return base.filter(d => d.score >= 4);
    return base;
  }, [filter, upcoming90, upcoming30]);

  const todayYear  = now.getFullYear();
  const todayMonth = now.getMonth();

  const FILTERS: { key: PowerFilter; label: string }[] = [
    { key: "all",       label: "Tümü"              },
    { key: "min3",      label: "3+ Puan"            },
    { key: "min4",      label: "4+ Puan"            },
    { key: "thisMonth", label: "Bu Ay"              },
    { key: "days90",    label: "Önümüzdeki 90 Gün"  },
  ];

  return (
    <main className="relative w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)] text-slate-900 antialiased">
      {/* Arka plan parlamaları */}
      <div className="pointer-events-none absolute -left-32 -top-16 h-96 w-96 rounded-full bg-amber-300/20 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute -right-32 top-[20%] h-80 w-80 rounded-full bg-yellow-200/[0.15] blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-orange-200/10 blur-3xl" aria-hidden />

      <div className="relative z-10 w-full px-4 pt-4 pb-8 sm:px-6 lg:px-8 xl:px-10">

        {/* ── Başlık ── */}
        <div className="mb-4 flex items-center gap-3">
          <Link
            href="/cosmic-calendar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-500 shadow-sm transition hover:bg-indigo-50 hover:text-indigo-600"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-black text-slate-800">⭐ Güçlü Günler</h1>
            <p className="text-[11px] text-slate-400">Numeroloji + Ay fazı etkisinin en yüksek olduğu günler</p>
          </div>
        </div>

        {/* ── Bu Ayın En Güçlü Günleri ── */}
        <div className="mb-4 rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
          <p className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-amber-600">
            🏆 {MONTH_NAMES_TR[todayMonth]} {todayYear} — En Güçlü Günler
          </p>

          {top3.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-slate-400">Bu ay güçlü gün bulunamadı.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {top3.map((day, i) => (
                <div
                  key={day.date.toISOString()}
                  className={`rounded-2xl border p-2.5 ${
                    i === 0
                      ? "border-amber-200/80 bg-gradient-to-br from-amber-50 to-yellow-50/60"
                      : i === 1
                      ? "border-slate-200/80 bg-gradient-to-br from-slate-50 to-white/60"
                      : "border-orange-100/80 bg-gradient-to-br from-orange-50/60 to-white/60"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-lg leading-none">{MEDAL[i]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                      i === 0 ? "bg-amber-100 text-amber-700" :
                      i === 1 ? "bg-slate-100 text-slate-600" : "bg-orange-50 text-orange-600"
                    }`}>
                      {day.score}p
                    </span>
                  </div>
                  <p className="text-[13px] font-black text-slate-800">
                    {day.date.getDate()} {MONTH_NAMES_TR[day.date.getMonth()]}
                  </p>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {day.reasons.map(r => (
                      <span key={r.label} className="text-[9px] text-slate-500">
                        {r.label} <span className="font-bold text-amber-600">+{r.pts}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Filtreler + Liste ── */}
        <div className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
          {/* Filtreler */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-600">
              📋 Önümüzdeki Güçlü Günler
            </p>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full px-2.5 py-0.5 text-[9px] font-semibold transition-colors ${
                    filter === f.key
                      ? "border border-amber-200 bg-amber-100 text-amber-700"
                      : "border border-slate-200 bg-slate-100 text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Liste */}
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-slate-400">
              Bu filtreyle güçlü gün bulunamadı.
            </p>
          ) : (
            <>
              <div className="mb-1.5 grid grid-cols-[3rem_1fr_4rem_auto] gap-2 border-b border-slate-100 pb-1.5 sm:grid-cols-[3rem_1fr_5rem_5rem_4rem]">
                <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Süre</span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Tarih</span>
                <span className="hidden text-[8px] font-bold uppercase tracking-wider text-slate-400 sm:block">Ay Fazı</span>
                <span className="hidden text-[8px] font-bold uppercase tracking-wider text-slate-400 sm:block">Numeroloji</span>
                <span className="text-right text-[8px] font-bold uppercase tracking-wider text-slate-400">Puan</span>
              </div>

              <div className="divide-y divide-slate-100/60">
                {(showAll ? filtered : filtered.slice(0, INITIAL_SHOW)).map((day, idx) => (
                  <div
                    key={`${day.date.toISOString()}-${idx}`}
                    className="grid grid-cols-[3rem_1fr_4rem] items-center gap-2 py-1.5 sm:grid-cols-[3rem_1fr_5rem_5rem_4rem]"
                  >
                    <span className={`text-right text-[10px] font-black tabular-nums ${
                      day.daysFromNow <= 7  ? "text-rose-600" :
                      day.daysFromNow <= 21 ? "text-amber-600" : "text-slate-400"
                    }`}>
                      {day.daysFromNow === 1 ? "yarın" : `${day.daysFromNow}g`}
                    </span>
                    <div>
                      <p className="text-[12px] font-black text-slate-800">
                        {day.date.getDate()} {MONTH_NAMES_TR[day.date.getMonth()]}
                      </p>
                      <p className="text-[9px] text-slate-400 sm:hidden">
                        {day.moonPts > 0 ? `${day.moonEmoji} ${day.moonLabel}` : "—"}
                        {" · "}{day.numValue} sayısı
                      </p>
                    </div>
                    <span className="hidden truncate text-[10px] text-slate-600 sm:block">
                      {day.moonPts > 0 ? `${day.moonEmoji} ${day.moonLabel}` : <span className="text-slate-300">—</span>}
                    </span>
                    <span className="hidden text-[10px] text-slate-600 sm:block">
                      {day.numPts > 0 ? `${day.numValue} sayısı` : <span className="text-slate-300">—</span>}
                    </span>
                    <span className={`justify-self-end rounded-full px-2 py-0.5 text-[10px] font-black ${
                      day.score >= 4 ? "bg-amber-100 text-amber-700" :
                      day.score >= 3 ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"
                    }`}>
                      {day.score}p
                    </span>
                  </div>
                ))}
              </div>

              {filtered.length > INITIAL_SHOW && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  {showAll
                    ? "Daha Az Göster ↑"
                    : `Daha Fazla Göster — ${filtered.length - INITIAL_SHOW} kayıt daha ↓`}
                </button>
              )}
            </>
          )}
        </div>

      </div>
    </main>
  );
}
