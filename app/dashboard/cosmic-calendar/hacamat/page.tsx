"use client";

import { useState, useMemo, useId } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Plus, Trash2 } from "lucide-react";
import {
  getHacamatMonthData,
  DEFAULT_HIJAMA_RULES,
  MONTH_NAMES_TR,
  WEEK_DAY_NAMES_TR,
  type HacamatStatus,
  type HijamRule,
  type CalendarDay,
} from "@/lib/cosmic/hacamat";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const DAY_HEADERS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

type RuleCategory = HijamRule["category"];

const CATEGORY_LABELS: Record<RuleCategory, string> = {
  oncesi:  "Öncesi",
  sonrasi: "Sonrası",
  genel:   "Genel",
};

const CATEGORY_COLORS: Record<RuleCategory, string> = {
  oncesi:  "bg-blue-100 text-blue-700",
  sonrasi: "bg-emerald-100 text-emerald-700",
  genel:   "bg-slate-100 text-slate-600",
};

// ─── Durum stilleri ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<HacamatStatus, {
  row: string; badge: string; badgeText: string; icon: string; label: string;
  calBg: string; calBorder: string; calText: string;
}> = {
  altin: {
    row:        "bg-amber-50  border-amber-300",
    badge:      "bg-amber-400", badgeText: "text-white",
    icon:       "⭐⭐⭐⭐⭐",
    label:      "ALTIN GÜN",
    calBg:      "bg-amber-200/80",
    calBorder:  "border-2 border-amber-400",
    calText:    "text-amber-900",
  },
  sunnet: {
    row:        "bg-emerald-50 border-emerald-300",
    badge:      "bg-emerald-600", badgeText: "text-white",
    icon:       "⭐⭐⭐",
    label:      "SÜNNET GÜN",
    calBg:      "bg-emerald-200/70",
    calBorder:  "border border-emerald-400",
    calText:    "text-emerald-900",
  },
  uygun: {
    row:        "bg-yellow-50  border-yellow-300",
    badge:      "bg-yellow-400", badgeText: "text-slate-900",
    icon:       "⭐",
    label:      "UYGUN GÜN",
    calBg:      "bg-yellow-200/70",
    calBorder:  "border border-yellow-400",
    calText:    "text-yellow-900",
  },
  yasakli: {
    row:        "bg-red-100   border-red-400",
    badge:      "bg-red-600",   badgeText: "text-white",
    icon:       "⛔",
    label:      "YASAKLI GÜN",
    calBg:      "bg-red-200/70",
    calBorder:  "border border-red-400",
    calText:    "text-red-900",
  },
  normal: {
    row:        "bg-white border-slate-200",
    badge:      "bg-slate-100", badgeText: "text-slate-500",
    icon:       "",
    label:      "",
    calBg:      "bg-white/30",
    calBorder:  "border-transparent",
    calText:    "text-slate-700",
  },
};

// ─── Takvim grid ─────────────────────────────────────────────────────────────

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default function HacamatPage() {
  const today      = useMemo(() => new Date(), []);
  const todayYear  = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay   = today.getDate();

  const [viewYear,  setViewYear]  = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);

  const [rules, setRules]               = useState<HijamRule[]>([...DEFAULT_HIJAMA_RULES]);
  const [newRuleText, setNewRuleText]   = useState("");
  const [newRuleCat,  setNewRuleCat]    = useState<RuleCategory>("genel");
  const [expertNotes, setExpertNotes]   = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const newRuleId = useId();

  const monthData = useMemo(
    () => getHacamatMonthData(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const cells   = useMemo(() => buildCalendarCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const dayMap  = useMemo(
    () => new Map(monthData.days.map(d => [d.day, d])),
    [monthData],
  );

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function addRule() {
    const t = newRuleText.trim();
    if (!t) return;
    const maxId = rules.reduce((m, r) => Math.max(m, r.id), 0);
    setRules(prev => [...prev, { id: maxId + 1, text: t, category: newRuleCat }]);
    setNewRuleText("");
  }

  async function handleWordReport() {
    setIsGenerating(true);
    try {
      const resp = await fetch("/api/hacamat/word-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: viewYear,
          month: viewMonth,
          rules: rules.map(r => ({ text: r.text, category: r.category })),
          expertNotes,
        }),
      });
      if (!resp.ok) throw new Error("Rapor oluşturulamadı");
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `hacamat-takvimi-${viewYear}-${String(viewMonth + 1).padStart(2, "0")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Word raporu oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setIsGenerating(false);
    }
  }

  const statusSummary: { label: string; count: number; color: string }[] = [
    { label: "Altın Gün",    count: monthData.altin.length,          color: "bg-amber-100 text-amber-700" },
    { label: "Sünnet Gün",   count: monthData.sunnet.length,         color: "bg-emerald-100 text-emerald-700" },
    { label: "Uygun Gün",    count: monthData.uygun.length,          color: "bg-yellow-100 text-yellow-700" },
    { label: "Yasaklı (17-24)", count: monthData.yasakliNotable.length, color: "bg-red-100 text-red-700" },
  ];

  return (
    <main className="relative w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 -top-16 h-96 w-96 rounded-full bg-teal-300/20 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute -right-32 top-[20%] h-80 w-80 rounded-full bg-cyan-200/[0.15] blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-red-200/10 blur-3xl" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 pt-4 pb-12 lg:px-8">

        {/* ── Hero ── */}
        <section className="relative mb-4 overflow-hidden rounded-[20px] border border-white/90 bg-gradient-to-br from-teal-100 via-cyan-50 to-emerald-50 px-5 py-4 shadow-[0_12px_40px_rgba(20,184,166,0.18)] backdrop-blur-xl sm:px-6">
          <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-teal-400/15 blur-[80px]" aria-hidden />
          <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-cyan-400/15 blur-[80px]" aria-hidden />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-700 text-xl text-white shadow-md">🩸</div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700">Kozmik Merkezler</p>
                  <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Hacamat Takvimi</h1>
                </div>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs font-medium text-slate-600 sm:text-sm">
                Hicri takvime göre hacamat günleri — profesyonel karar destek ekranı
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {statusSummary.map(s => (
                  <div key={s.label} className={`rounded-xl border border-white/60 px-2.5 py-1.5 text-[11px] font-black backdrop-blur-sm ${s.color}`}>
                    {s.count} {s.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <Link
                href="/dashboard/cosmic-calendar"
                className="flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm no-underline transition hover:bg-white hover:text-teal-700"
              >
                <ArrowLeft className="h-3 w-3" /> Geri
              </Link>
              <button
                onClick={handleWordReport}
                disabled={isGenerating}
                className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
              >
                <FileText className="h-3 w-3" />
                {isGenerating ? "Hazırlanıyor…" : "Word Rapor"}
              </button>
            </div>
          </div>
        </section>

        {/* ── Ay Navigasyonu ── */}
        <div className="mb-4 flex items-center gap-3 rounded-[18px] border border-white/80 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-md">
          <button onClick={prevMonth} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-teal-50 hover:text-teal-700">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-[15px] font-black text-slate-800">{MONTH_NAMES_TR[viewMonth]} {viewYear}</p>
            <p className="text-[10px] text-slate-400">Baskın Hicri Ay: {monthData.hijriMonthName}</p>
          </div>
          <button onClick={nextMonth} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-teal-50 hover:text-teal-700">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* ── Ana Grid: Takvim + Tablo ── */}
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_560px]">

          {/* Aylık Takvim Grid */}
          <section className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
            <p className="mb-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">📅 Aylık Görünüm</p>

            {/* Renk lejantı */}
            <div className="mb-2.5 flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-100 pb-2.5">
              {[
                { color: "bg-amber-200", label: "Altın Gün" },
                { color: "bg-emerald-200", label: "Sünnet" },
                { color: "bg-yellow-200", label: "Uygun" },
                { color: "bg-red-200", label: "Yasaklı (17-24)" },
                { color: "bg-red-50", label: "Çar/Cum/Cmt" },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5 text-[9px] text-slate-500">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${color}`} /> {label}
                </span>
              ))}
            </div>

            {/* Gün başlıkları */}
            <div className="mb-0.5 grid grid-cols-7 gap-0.5">
              {DAY_HEADERS.map(h => (
                <div key={h} className={`py-1 text-center text-[9px] font-bold uppercase tracking-wide ${
                  h === "Çar" || h === "Cum" || h === "Cmt" ? "text-red-400" : "text-slate-400"
                }`}>{h}</div>
              ))}
            </div>

            {/* Hücreler */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, i) => {
                if (day === null) return <div key={`e-${i}`} className="h-12 rounded-lg" />;
                const isToday = day === todayDay && viewMonth === todayMonth && viewYear === todayYear;
                const d       = dayMap.get(day);
                if (!d) return <div key={day} className="h-12 rounded-lg" />;

                const isYasakliWeekday = [3, 5, 6].includes(d.weekDay);
                const st               = STATUS_STYLES[d.status];

                // Renk: notable → status rengi, yasaklı hafta günü → kırmızı tint, diğer → plain
                const cellClass = isToday
                  ? "bg-gradient-to-b from-teal-600 to-emerald-700 shadow-md"
                  : d.isNotable
                  ? `${st.calBg} ${st.calBorder}`
                  : isYasakliWeekday
                  ? "bg-red-50/70"
                  : "bg-white/30 hover:bg-white/60";

                return (
                  <div
                    key={day}
                    className={`group/cell relative flex h-12 flex-col items-center justify-start gap-0.5 rounded-lg p-1 transition-colors ${cellClass}`}
                  >
                    <span className={`text-xs font-black leading-tight ${
                      isToday ? "text-white" : d.isNotable ? st.calText : isYasakliWeekday ? "text-red-400" : "text-slate-600"
                    }`}>{day}</span>
                    {isToday && <span className="text-[7px] leading-none text-white/70">bugün</span>}
                    {!isToday && d.isNotable && d.status !== "normal" && (
                      <span className="text-[10px] leading-none">{d.stars}</span>
                    )}
                    {!isToday && d.isNotable && (
                      <span className={`text-[7px] font-black leading-none ${st.calText}`}>{d.hijriDay}. gün</span>
                    )}

                    {/* Tooltip */}
                    {d.isNotable && (
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 min-w-max max-w-[200px] rounded-lg bg-slate-800 px-2.5 py-2 shadow-xl group-hover/cell:block">
                        <p className="mb-0.5 text-[9px] font-black text-white">{d.miladiFull}</p>
                        <p className="text-[9px] text-slate-300">{d.hijriFormatted}</p>
                        <p className={`mt-1 text-[9px] font-black ${
                          d.status === "altin" ? "text-amber-300" :
                          d.status === "sunnet" ? "text-emerald-300" :
                          d.status === "uygun" ? "text-yellow-300" :
                          d.status === "yasakli" ? "text-red-300" : "text-slate-300"
                        }`}>{d.stars} {d.statusLabel}</p>
                        {d.description && <p className="text-[8px] text-slate-400">{d.description}</p>}
                        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Detaylı Tablo: Hicri 17-24 */}
          <section className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
            <p className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">
              📋 Aylık Hacamat Takvimi — Hicri 17–24
            </p>

            {monthData.notable.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-slate-400">Bu ay Hicri 17–24 günü bulunamadı.</p>
            ) : (
              <div className="space-y-1.5">
                {monthData.notable.map(d => {
                  const st = STATUS_STYLES[d.status];
                  return (
                    <div
                      key={`${d.day}-${d.hijriDay}`}
                      className={`rounded-xl border px-3 py-2.5 ${st.row}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Hicri Gün + Status */}
                        <div className="flex items-center gap-1.5">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-black text-white ${st.badge === "bg-amber-400" ? "bg-amber-400 text-slate-900" : st.badge}`}>
                            {d.hijriDay}
                          </span>
                          {d.status !== "normal" && (
                            <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${st.badge} ${st.badgeText}`}>
                              {st.label}
                            </span>
                          )}
                        </div>

                        {/* Stars */}
                        {d.stars && (
                          <span className="text-[12px] leading-none text-amber-400">{d.stars}</span>
                        )}

                        {/* Tarihler sağa */}
                        <div className="ml-auto text-right">
                          <p className="text-[10px] font-semibold text-slate-700">{d.miladiFull}</p>
                          <p className="text-[9px] text-slate-400">{d.weekDayName} · {d.hijriFormatted}</p>
                        </div>
                      </div>

                      {d.description && d.status !== "normal" && (
                        <p className={`mt-1 text-[9px] leading-snug ${
                          d.status === "altin"   ? "text-amber-700"   :
                          d.status === "sunnet"  ? "text-emerald-700" :
                          d.status === "uygun"   ? "text-yellow-700"  :
                          d.status === "yasakli" ? "text-red-700"     : "text-slate-500"
                        }`}>{d.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── Dinamik Hicri Gün Notları ── */}
        <section className="mb-4 rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
          <p className="mb-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">
            🌙 Dinamik Hicri Gün Notları
          </p>
          <p className="mb-3 text-[10px] text-slate-400">
            Hicri günlerin akşamdan başlaması kuralına göre otomatik üretilmiştir.
          </p>

          {monthData.notes.length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3 text-[11px] text-slate-400">
              Bu ay için özel not bulunmuyor.
            </p>
          ) : (
            <div className="space-y-2">
              {monthData.notes.map((note, i) => (
                <div key={i} className="flex gap-2.5 rounded-xl border border-teal-100 bg-teal-50/60 px-3 py-2.5">
                  <span className="mt-0.5 shrink-0 text-[14px] leading-none">🌙</span>
                  <p className="text-[11px] leading-relaxed text-teal-800">{note}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Hacamat Kuralları ── */}
        <section className="mb-4 rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
          <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">
            📜 Hacamat Öncesi ve Sonrası Dikkat Edilecek Kurallar
          </p>
          <p className="mb-3 text-[10px] text-slate-400">Kural ekleyebilir, silebilirsiniz.</p>

          {/* Kurallar listesi */}
          {(["oncesi", "sonrasi", "genel"] as RuleCategory[]).map(cat => {
            const catRules = rules.filter(r => r.category === cat);
            if (!catRules.length) return null;
            return (
              <div key={cat} className="mb-3">
                <p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.15em] text-slate-400">
                  {cat === "oncesi" ? "Hacamat Öncesi" : cat === "sonrasi" ? "Hacamat Sonrası" : "Genel Kurallar"}
                </p>
                <div className="space-y-1">
                  {catRules.map(rule => (
                    <div key={rule.id} className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
                      <p className="flex-1 text-[10px] leading-snug text-slate-700">{rule.text}</p>
                      <button
                        onClick={() => setRules(prev => prev.filter(r => r.id !== rule.id))}
                        className="shrink-0 rounded p-0.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                        aria-label="Kuralı sil"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Kural ekleme */}
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.15em] text-slate-400">Yeni Kural Ekle</p>
            <div className="flex flex-wrap gap-1.5">
              <select
                value={newRuleCat}
                onChange={e => setNewRuleCat(e.target.value as RuleCategory)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-700 focus:border-teal-300 focus:outline-none"
              >
                <option value="oncesi">Öncesi</option>
                <option value="sonrasi">Sonrası</option>
                <option value="genel">Genel</option>
              </select>
              <input
                id={newRuleId}
                type="text"
                placeholder="Kural metni girin…"
                value={newRuleText}
                onChange={e => setNewRuleText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addRule()}
                className="flex-1 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[10px] text-slate-700 placeholder:text-slate-300 focus:border-teal-300 focus:outline-none"
              />
              <button
                onClick={addRule}
                disabled={!newRuleText.trim()}
                className="flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[10px] font-semibold text-teal-700 transition hover:bg-teal-100 disabled:opacity-40"
              >
                <Plus className="h-3 w-3" /> Ekle
              </button>
            </div>
          </div>
        </section>

        {/* ── Uzman Notları ── */}
        <section className="mb-4 rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
          <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">
            📝 Hacamat Uzmanı Notları
          </p>
          <p className="mb-2 text-[10px] text-slate-400">Word raporuna dahil edilir.</p>
          <textarea
            value={expertNotes}
            onChange={e => setExpertNotes(e.target.value)}
            placeholder={"Örn: Bu ay altın günlerde yoğunluk beklenmektedir.\nHava sıcaklıkları nedeniyle su tüketimi artırılmalıdır."}
            rows={4}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white/80 p-2.5 text-[11px] text-slate-700 placeholder:text-slate-300 focus:border-teal-300 focus:outline-none"
          />
        </section>

        {/* ── Word Rapor Butonu (tekrar, alt) ── */}
        <div className="flex justify-end">
          <button
            onClick={handleWordReport}
            disabled={isGenerating}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-700 px-5 py-2.5 text-[12px] font-black text-white shadow-lg shadow-teal-300/30 transition hover:from-teal-700 hover:to-emerald-800 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            {isGenerating ? "Word Raporu Hazırlanıyor…" : `${MONTH_NAMES_TR[viewMonth]} ${viewYear} — Word Raporu İndir`}
          </button>
        </div>

      </div>
    </main>
  );
}
