"use client";

import { useState, useMemo, useId, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText, Plus, Trash2, Pencil, Check, X, Loader2 } from "lucide-react";
import {
  getHacamatMonthData,
  getAllAltinDays,
  MONTH_NAMES_TR,
  type HacamatStatus,
  type HacamatMonthData,
  type HijamRule,
} from "@/lib/cosmic/hacamat";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const DAY_HEADERS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

type Tab = "bu-ay" | "altin" | "diger" | "kurallar" | "word";
type RuleCategory = HijamRule["category"];

const YEAR_RANGE = Array.from({ length: 21 }, (_, i) => 2020 + i);

const CAT_LABEL: Record<RuleCategory, string> = {
  before:  "A) Hacamat Öncesi",
  after:   "B) Hacamat Sonrası",
  general: "C) Genel Kurallar",
};

const CAT_PLACEHOLDER: Record<RuleCategory, string> = {
  before:  "Hacamat öncesi kural ekle…",
  after:   "Hacamat sonrası kural ekle…",
  general: "Genel kural ekle…",
};

// ─── Durum stilleri ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<HacamatStatus, {
  row: string; badge: string; badgeText: string;
  calBg: string; calBorder: string; calText: string;
  label: string; stars: string; descColor: string;
}> = {
  altin:   { row: "bg-amber-50 border-amber-300",     badge: "bg-amber-400",   badgeText: "text-amber-900",  label: "ALTIN GÜN",   stars: "⭐⭐⭐⭐⭐", calBg: "bg-amber-200/80",    calBorder: "border-2 border-amber-400",  calText: "text-amber-900",  descColor: "text-amber-700"   },
  sunnet:  { row: "bg-emerald-50 border-emerald-300",  badge: "bg-emerald-600", badgeText: "text-white",      label: "SÜNNET GÜN",  stars: "⭐⭐⭐",     calBg: "bg-emerald-200/70",  calBorder: "border border-emerald-400", calText: "text-emerald-900", descColor: "text-emerald-700" },
  uygun:   { row: "bg-yellow-50 border-yellow-300",    badge: "bg-yellow-400",  badgeText: "text-slate-900",  label: "UYGUN GÜN",   stars: "⭐",         calBg: "bg-yellow-200/70",   calBorder: "border border-yellow-400",  calText: "text-yellow-900", descColor: "text-yellow-700"  },
  yasakli: { row: "bg-red-100 border-red-400",         badge: "bg-red-600",     badgeText: "text-white",      label: "YASAKLI GÜN", stars: "⛔",         calBg: "bg-red-200/70",      calBorder: "border border-red-400",     calText: "text-red-900",    descColor: "text-red-700"     },
  normal:  { row: "bg-white border-slate-200",         badge: "bg-slate-100",   badgeText: "text-slate-500",  label: "",            stars: "",           calBg: "bg-white/30",        calBorder: "border-transparent",        calText: "text-slate-700",  descColor: "text-slate-500"   },
};

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ─── Özet çipleri ─────────────────────────────────────────────────────────────

function SummaryChips({ data }: { data: HacamatMonthData }) {
  const items = [
    { count: data.altin.length,          label: "Altın Gün",       cls: "bg-amber-100 text-amber-700 border-amber-200" },
    { count: data.sunnet.length,         label: "Sünnet Gün",      cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { count: data.uygun.length,          label: "Uygun Gün",       cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    { count: data.yasakliNotable.length, label: "Yasaklı (17-24)", cls: "bg-red-100 text-red-700 border-red-200" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ count, label, cls }) => (
        <div key={label} className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-black ${cls}`}>
          {count} {label}
        </div>
      ))}
    </div>
  );
}

// ─── Aylık takvim + tablo + notlar ────────────────────────────────────────────

function MonthContent({
  data, todayYear, todayMonth, todayDay,
}: {
  data: HacamatMonthData;
  todayYear: number;
  todayMonth: number;
  todayDay: number;
}) {
  const cells  = useMemo(() => buildCalendarCells(data.year, data.month), [data.year, data.month]);
  const dayMap = useMemo(() => new Map(data.days.map(d => [d.day, d])), [data.days]);

  return (
    <div className="space-y-4">
      {/* Grid: Takvim 45% + Tablo 55% */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[9fr_11fr]">

        {/* Aylık Takvim */}
        <section className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
          <p className="mb-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">📅 Aylık Görünüm</p>
          <div className="mb-2.5 flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-100 pb-2.5">
            {[
              { color: "bg-amber-200",   label: "Altın" },
              { color: "bg-emerald-200", label: "Sünnet" },
              { color: "bg-yellow-200",  label: "Uygun" },
              { color: "bg-red-200",     label: "Yasaklı (17-24)" },
              { color: "bg-red-50",      label: "Çar/Cum/Cmt" },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-[9px] text-slate-500">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${color}`} /> {label}
              </span>
            ))}
          </div>
          <div className="mb-0.5 grid grid-cols-7 gap-0.5">
            {DAY_HEADERS.map(h => (
              <div key={h} className={`py-1 text-center text-[9px] font-bold uppercase tracking-wide ${
                h === "Çar" || h === "Cum" || h === "Cmt" ? "text-red-400" : "text-slate-400"
              }`}>{h}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (day === null) return <div key={`e-${i}`} className="h-12 rounded-lg" />;
              const isToday          = day === todayDay && data.month === todayMonth && data.year === todayYear;
              const d                = dayMap.get(day);
              if (!d) return <div key={day} className="h-12 rounded-lg" />;
              const isYasakliWeekday = [3, 5, 6].includes(d.weekDay);
              const st               = STATUS_STYLES[d.status];
              const cellCls = isToday
                ? "bg-gradient-to-b from-teal-600 to-emerald-700 shadow-md"
                : d.isNotable
                ? `${st.calBg} ${st.calBorder}`
                : isYasakliWeekday
                ? "bg-red-50/70"
                : "bg-white/30 hover:bg-white/60";
              return (
                <div key={day} className={`group/cell relative flex h-12 flex-col items-center justify-start gap-0.5 rounded-lg p-1 transition-colors ${cellCls}`}>
                  <span className={`text-xs font-black leading-tight ${
                    isToday ? "text-white" : d.isNotable ? st.calText : isYasakliWeekday ? "text-red-400" : "text-slate-600"
                  }`}>{day}</span>
                  {isToday && <span className="text-[7px] leading-none text-white/70">bugün</span>}
                  {!isToday && d.isNotable && d.status !== "normal" && (
                    <span className="text-[10px] leading-none">{st.stars}</span>
                  )}
                  {!isToday && d.isNotable && (
                    <span className={`text-[7px] font-black leading-none ${st.calText}`}>{d.hijriDay}. gün</span>
                  )}
                  {d.isNotable && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 min-w-max max-w-[200px] rounded-lg bg-slate-800 px-2.5 py-2 shadow-xl group-hover/cell:block">
                      <p className="mb-0.5 text-[9px] font-black text-white">{d.miladiFull}</p>
                      <p className="text-[9px] text-slate-300">{d.hijriFormatted}</p>
                      <p className={`mt-1 text-[9px] font-black ${
                        d.status === "altin" ? "text-amber-300" : d.status === "sunnet" ? "text-emerald-300" :
                        d.status === "uygun" ? "text-yellow-300" : d.status === "yasakli" ? "text-red-300" : "text-slate-300"
                      }`}>{st.stars} {st.label}</p>
                      {d.description && <p className="text-[8px] text-slate-400">{d.description}</p>}
                      <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Detaylı Tablo */}
        <section className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
          <p className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">📋 Hacamat Takvimi — Hicri 17–24</p>
          {data.notable.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-slate-400">Bu ay Hicri 17–24 günü bulunamadı.</p>
          ) : (
            <div className="space-y-1.5">
              {data.notable.map(d => {
                const st = STATUS_STYLES[d.status];
                return (
                  <div key={`${d.day}-${d.hijriDay}`} className={`rounded-xl border px-3 py-2.5 ${st.row}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-black ${st.badge} ${st.badgeText}`}>
                          {d.hijriDay}
                        </span>
                        {d.status !== "normal" && (
                          <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${st.badge} ${st.badgeText}`}>{st.label}</span>
                        )}
                        {st.stars && <span className="text-[11px] text-amber-400">{st.stars}</span>}
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-[10px] font-semibold text-slate-700">{d.miladiFull}</p>
                        <p className="text-[9px] text-slate-400">{d.weekDayName} · {d.hijriFormatted}</p>
                      </div>
                    </div>
                    {d.description && d.status !== "normal" && (
                      <p className={`mt-1 text-[9px] leading-snug ${st.descColor}`}>{d.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Dinamik Notlar */}
      <section className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
        <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">🌙 Dinamik Hicri Gün Notları</p>
        <p className="mb-3 text-[10px] text-slate-400">
          Hicri günlerin akşamdan başlaması kuralına ve akşam geçişinin gerçek statüsüne göre otomatik üretilir.
        </p>
        {data.notes.length === 0 ? (
          <p className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3 text-[11px] text-slate-400">
            Bu ay için özel not bulunmuyor.
          </p>
        ) : (
          <div className="space-y-2">
            {data.notes.map((note, i) => (
              <div key={i} className="flex gap-2.5 rounded-xl border border-teal-100 bg-teal-50/60 px-3 py-2.5">
                <span className="mt-0.5 shrink-0 text-[14px] leading-none">🌙</span>
                <p className="text-[11px] leading-relaxed text-teal-800">{note}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default function HacamatPage() {
  const today      = useMemo(() => new Date(), []);
  const todayYear  = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay   = today.getDate();

  const [activeTab,   setActiveTab]   = useState<Tab>("bu-ay");
  const [digerYear,   setDigerYear]   = useState(todayYear);
  const [digerMonth,  setDigerMonth]  = useState(todayMonth);
  const [wordYear,    setWordYear]    = useState(todayYear);
  const [wordMonth,   setWordMonth]   = useState(todayMonth);
  const [isGenerating,    setIsGenerating]    = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Word rapor ayarları
  const [wordTitle,      setWordTitle]      = useState("HACAMAT TAKVİMİ");
  const [wordExpertName, setWordExpertName] = useState("");
  const [expertNotes,    setExpertNotes]    = useState("");
  const [showPreview,    setShowPreview]    = useState(false);
  const [includeSections, setIncludeSections] = useState({
    altin:     true,
    sunnet:    true,
    uygun:     true,
    yasakli:   true,
    kurallar:  true,
    uzmanNotu: true,
  });

  // Kurallar state (DB'den yüklenir)
  const [rules,          setRules]          = useState<HijamRule[]>([]);
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [rulesError,     setRulesError]     = useState<string | null>(null);

  // Kural ekleme
  const [newRuleText,  setNewRuleText]  = useState("");
  const [newRuleCat,   setNewRuleCat]   = useState<RuleCategory>("before");
  const [isAddingRule, setIsAddingRule] = useState(false);

  // Kural düzenleme
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText,  setEditText]  = useState("");

  const addFormId = useId();

  const buAyData   = useMemo(() => getHacamatMonthData(todayYear, todayMonth), [todayYear, todayMonth]);
  const digerData  = useMemo(() => getHacamatMonthData(digerYear, digerMonth), [digerYear, digerMonth]);
  const wordData   = useMemo(() => getHacamatMonthData(wordYear, wordMonth),   [wordYear, wordMonth]);
  const altinDays  = useMemo(() => getAllAltinDays(2026, 2036),                []);
  const altinByYear = useMemo(() => {
    const map = new Map<number, typeof altinDays>();
    for (const d of altinDays) {
      const arr = map.get(d.year) ?? [];
      arr.push(d);
      map.set(d.year, arr);
    }
    return map;
  }, [altinDays]);

  // ─── Kuralları DB'den yükle ───────────────────────────────────────────────

  const loadRules = useCallback(async () => {
    setIsLoadingRules(true);
    setRulesError(null);
    try {
      const res  = await fetch("/api/hacamat/rules");
      const json = await res.json() as { ok: boolean; data?: HijamRule[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Kurallar yüklenemedi.");
      setRules(json.data ?? []);
    } catch (err) {
      setRulesError(err instanceof Error ? err.message : "Kurallar yüklenemedi.");
    } finally {
      setIsLoadingRules(false);
    }
  }, []);

  useEffect(() => { void loadRules(); }, [loadRules]);

  // ─── CRUD ────────────────────────────────────────────────────────────────

  async function addRule() {
    const t = newRuleText.trim();
    if (!t || isAddingRule) return;
    setIsAddingRule(true);
    try {
      const res  = await fetch("/api/hacamat/rules", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          category:   newRuleCat,
          rule_text:  t,
          sort_order: rules.filter(r => r.category === newRuleCat).length,
        }),
      });
      const json = await res.json() as { ok: boolean; data?: HijamRule; error?: string };
      if (!json.ok || !json.data) throw new Error(json.error ?? "Eklenemedi.");
      setRules(prev => [...prev, json.data!]);
      setNewRuleText("");
    } catch { /* hata görmezden gelinir */ }
    finally { setIsAddingRule(false); }
  }

  async function deleteRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id)); // optimistic
    await fetch(`/api/hacamat/rules/${id}`, { method: "DELETE" });
  }

  function startEdit(rule: HijamRule) {
    setEditingId(rule.id);
    setEditText(rule.rule_text);
  }

  async function saveEdit(id: string) {
    const t = editText.trim();
    if (!t) { cancelEdit(); return; }
    setRules(prev => prev.map(r => r.id === id ? { ...r, rule_text: t } : r)); // optimistic
    setEditingId(null);
    await fetch(`/api/hacamat/rules/${id}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ rule_text: t }),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  // ─── Word / PDF export ───────────────────────────────────────────────────

  function buildReportPayload() {
    return {
      year:       wordYear,
      month:      wordMonth,
      rules:      rules.map(r => ({ rule_text: r.rule_text, category: r.category })),
      expertNotes,
      title:      wordTitle,
      expertName: wordExpertName,
      includeSections,
    };
  }

  // Desktop blob download — mobil <a> anchor'ları CSS ile ayrı render edilir
  async function downloadReport(format: "docx" | "pdf") {
    const endpoint = format === "pdf" ? "/api/hacamat/pdf-report" : "/api/hacamat/word-report";
    const filename = `hacamat-takvimi-${wordYear}-${String(wordMonth + 1).padStart(2, "0")}.${format}`;
    try {
      const resp = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(buildReportPayload()),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Rapor oluşturulamadı.");
      }
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      console.error("Rapor indirme hatası:", err);
      alert(`${format.toUpperCase()} raporu oluşturulamadı. Lütfen tekrar deneyin.`);
    }
  }

  async function handleWordReport() {
    setIsGenerating(true);
    await downloadReport("docx");
    setIsGenerating(false);
  }

  async function handlePdfReport() {
    setIsGeneratingPdf(true);
    await downloadReport("pdf");
    setIsGeneratingPdf(false);
  }

  function toggleSection(key: keyof typeof includeSections) {
    setIncludeSections(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const TABS: { key: Tab; label: string; emoji: string }[] = [
    { key: "bu-ay",    label: "Bu Ay",        emoji: "🩸" },
    { key: "altin",    label: "Altın Günler", emoji: "⭐" },
    { key: "diger",    label: "Diğer Aylar",  emoji: "📆" },
    { key: "kurallar", label: "Kurallar",     emoji: "📜" },
    { key: "word",     label: "Word",          emoji: "📄" },
  ];

  return (
    <main className="relative w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f0f0ff_45%,#fff0f8_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 -top-16 h-96 w-96 rounded-full bg-teal-300/20 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute -right-32 top-[20%] h-80 w-80 rounded-full bg-cyan-200/[0.15] blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-red-200/10 blur-3xl" aria-hidden />

      <div className="relative z-10 w-full px-4 pt-4 pb-8 sm:px-6 lg:px-8 xl:px-10">

        {/* ── Hero ── */}
        <section className="relative mb-4 overflow-hidden rounded-[20px] border border-white/90 bg-gradient-to-br from-teal-100 via-cyan-50 to-emerald-50 px-5 py-4 shadow-[0_12px_40px_rgba(20,184,166,0.18)] backdrop-blur-xl sm:px-6">
          <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-teal-400/15 blur-[80px]" aria-hidden />
          <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-cyan-400/15 blur-[80px]" aria-hidden />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-700 text-xl text-white shadow-md">🩸</div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700">Kozmik Merkezler</p>
                  <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Hacamat Takvimi</h1>
                </div>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs font-medium text-slate-600 sm:text-sm">
                Hicri takvime göre hacamat günleri — profesyonel karar destek ekranı
              </p>
              <div className="mt-3">
                <SummaryChips data={buAyData} />
              </div>
            </div>
            <Link
              href="/cosmic-calendar"
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/80 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm no-underline transition hover:bg-white hover:text-teal-700"
            >
              <ArrowLeft className="h-3 w-3" /> Geri
            </Link>
          </div>
        </section>

        {/* ── Tıbbi Uyarı ── */}
        <div className="mb-4 flex items-start gap-2.5 rounded-[14px] border border-amber-200/70 bg-amber-50/70 px-3.5 py-2.5" role="note">
          <span className="mt-0.5 shrink-0 text-[14px] leading-none text-amber-600" aria-hidden>⚠</span>
          <p className="text-[10px] leading-relaxed text-amber-800">
            Bu takvim, geleneksel İslami tıp geleneğine dayanan <strong>bilgi amaçlı</strong> içerik sunmaktadır. Hacamat uygulaması için mutlaka uzman bir sağlık profesyoneliyle görüşün. Bu bilgiler tıbbi tavsiye niteliği taşımaz.
          </p>
        </div>

        {/* ── Aylık Özet Kartı (Bu Ay) ── */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { count: buAyData.altin.length,          label: "Altın Gün",       bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   num: "text-amber-500"   },
            { count: buAyData.sunnet.length,         label: "Sünnet Gün",      bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", num: "text-emerald-500" },
            { count: buAyData.uygun.length,          label: "Uygun Gün",       bg: "bg-yellow-50",  border: "border-yellow-200",  text: "text-yellow-700",  num: "text-yellow-500"  },
            { count: buAyData.yasakliNotable.length, label: "Yasaklı (17-24)", bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700",     num: "text-red-400"     },
          ].map(({ count, label, bg, border, text, num }) => (
            <div key={label} className={`rounded-[14px] border ${bg} ${border} px-3 py-2 shadow-sm backdrop-blur-md`}>
              <p className={`text-xl font-black ${num}`}>{count}</p>
              <p className={`text-[10px] font-semibold ${text}`}>{label}</p>
              <p className="text-[9px] text-slate-400">{MONTH_NAMES_TR[todayMonth]} {todayYear}</p>
            </div>
          ))}
        </div>

        {/* ── Sekmeler ── */}
        <div className="mb-4 flex flex-wrap gap-1.5 rounded-[18px] border border-white/80 bg-white/70 p-2 shadow-sm backdrop-blur-md">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-all ${
                activeTab === tab.key
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              <span>{tab.emoji}</span> {tab.label}
            </button>
          ))}
        </div>

        {/* ════════ Bu Ay Sekmesi ════════ */}
        {activeTab === "bu-ay" && (
          <div>
            <p className="mb-3 text-[11px] font-semibold text-slate-500">
              {MONTH_NAMES_TR[todayMonth]} {todayYear} · Hicri Ay: {buAyData.hijriMonthName}
            </p>
            <MonthContent data={buAyData} todayYear={todayYear} todayMonth={todayMonth} todayDay={todayDay} />
          </div>
        )}

        {/* ════════ Altın Günler Sekmesi ════════ */}
        {activeTab === "altin" && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-600">⭐ Altın Günler 2026–2036</p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Hicri 17 + Salı günü koşulunu karşılayan tarihler · Toplam: {altinDays.length} gün
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {Array.from({ length: 11 }, (_, i) => 2026 + i).map(yr => {
                const days = altinByYear.get(yr) ?? [];
                return (
                  <div key={yr} className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[12px] font-black text-slate-800">{yr}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                        days.length > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"
                      }`}>
                        {days.length > 0 ? `${days.length} Altın Gün` : "Altın Gün yok"}
                      </span>
                    </div>
                    {days.length === 0 ? (
                      <p className="text-[10px] text-slate-400">Bu yılda Hicri 17 + Salı eşleşmesi bulunmuyor.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {days.map((d, idx) => (
                          <div key={idx} className="flex items-center gap-3 rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-2.5">
                            <span className="text-xl leading-none">⭐</span>
                            <div className="flex-1">
                              <p className="text-[12px] font-black text-amber-800">{d.miladiFull}</p>
                              <p className="text-[9px] text-amber-600">{d.hijriFormatted} · {d.weekDayName}</p>
                            </div>
                            <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-[8px] font-black text-amber-900">
                              ⭐⭐⭐⭐⭐ ALTIN GÜN
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ════════ Diğer Aylar Sekmesi ════════ */}
        {activeTab === "diger" && (
          <section>
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[18px] border border-white/80 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-md">
              <span className="text-[10px] font-black text-teal-700">Ay Seç:</span>
              <select
                value={digerMonth}
                onChange={e => setDigerMonth(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 focus:border-teal-300 focus:outline-none"
              >
                {MONTH_NAMES_TR.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>
              <select
                value={digerYear}
                onChange={e => setDigerYear(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 focus:border-teal-300 focus:outline-none"
              >
                {YEAR_RANGE.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <div className="ml-auto">
                <SummaryChips data={digerData} />
              </div>
            </div>
            <p className="mb-3 text-[11px] font-semibold text-slate-500">
              {MONTH_NAMES_TR[digerMonth]} {digerYear} · Hicri Ay: {digerData.hijriMonthName}
            </p>
            <MonthContent data={digerData} todayYear={todayYear} todayMonth={todayMonth} todayDay={todayDay} />
          </section>
        )}

        {/* ════════ Kurallar Sekmesi ════════ */}
        {activeTab === "kurallar" && (
          <section className="space-y-4">

            {/* Başlık kartı */}
            <div className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">📜 Hacamat Kuralları</p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                Veritabanından yüklenir. Ekleyebilir, düzenleyebilir, silebilirsiniz.
                Kayıtlar Word raporuna birebir aktarılır — sistem metni değiştirmez.
              </p>
            </div>

            {/* Yükleme / Hata */}
            {isLoadingRules ? (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[11px]">Kurallar yükleniyor…</span>
              </div>
            ) : rulesError ? (
              <div className="rounded-[18px] border border-red-200 bg-red-50 p-4 text-center">
                <p className="text-[11px] text-red-600">{rulesError}</p>
                <button
                  onClick={() => void loadRules()}
                  className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50"
                >
                  Tekrar dene
                </button>
              </div>
            ) : (
              <>
                {/* Üç bölüm: before, after, general */}
                {(["before", "after", "general"] as RuleCategory[]).map(cat => {
                  const catRules = rules.filter(r => r.category === cat);
                  return (
                    <div key={cat} className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
                      <p className="mb-3 text-[9px] font-black uppercase tracking-[0.15em] text-teal-700">
                        {CAT_LABEL[cat]}
                      </p>

                      {catRules.length === 0 ? (
                        <p className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3 text-[11px] text-slate-400">
                          Henüz kural eklenmemiş.
                        </p>
                      ) : (
                        <div className="mb-3 space-y-1.5">
                          {catRules.map((rule, idx) => (
                            <div key={rule.id} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                              <span className="mt-0.5 min-w-[18px] shrink-0 text-[10px] font-black text-teal-500">{idx + 1}.</span>
                              {editingId === rule.id ? (
                                <>
                                  <input
                                    value={editText}
                                    onChange={e => setEditText(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") void saveEdit(rule.id); if (e.key === "Escape") cancelEdit(); }}
                                    className="flex-1 rounded-lg border border-teal-200 bg-white px-2.5 py-1 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-300"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => void saveEdit(rule.id)}
                                    className="shrink-0 rounded p-1 text-teal-500 transition hover:bg-teal-50 hover:text-teal-700"
                                    title="Kaydet"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                                    title="İptal"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <p className="flex-1 text-[10px] leading-snug text-slate-700">{rule.rule_text}</p>
                                  <button
                                    onClick={() => startEdit(rule)}
                                    className="shrink-0 rounded p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"
                                    title="Düzenle"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => void deleteRule(rule.id)}
                                    className="shrink-0 rounded p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                                    title="Sil"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Bu kategori için ekle formu */}
                      <div className={catRules.length > 0 ? "border-t border-slate-100 pt-3" : ""}>
                        <div className="flex flex-wrap gap-1.5">
                          <input
                            id={`${addFormId}-${cat}`}
                            type="text"
                            placeholder={CAT_PLACEHOLDER[cat]}
                            value={newRuleCat === cat ? newRuleText : ""}
                            onChange={e => { setNewRuleCat(cat); setNewRuleText(e.target.value); }}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                setNewRuleCat(cat);
                                void addRule();
                              }
                            }}
                            disabled={editingId !== null}
                            className="flex-1 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[10px] text-slate-700 placeholder:text-slate-300 focus:border-teal-300 focus:outline-none disabled:opacity-50"
                          />
                          <button
                            onClick={() => {
                              setNewRuleCat(cat);
                              void addRule();
                            }}
                            disabled={
                              isAddingRule ||
                              editingId !== null ||
                              newRuleCat !== cat ||
                              !newRuleText.trim()
                            }
                            className="flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[10px] font-semibold text-teal-700 transition hover:bg-teal-100 disabled:opacity-40"
                          >
                            {isAddingRule && newRuleCat === cat
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Plus className="h-3 w-3" />
                            }
                            Ekle
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </section>
        )}

        {/* ════════ Word Sekmesi ════════ */}
        {activeTab === "word" && (
          <section className="space-y-4">

            {/* Rapor Ayı */}
            <div className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
              <p className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">📅 Rapor Ayı</p>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={wordMonth}
                  onChange={e => setWordMonth(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 focus:border-teal-300 focus:outline-none"
                >
                  {MONTH_NAMES_TR.map((m, idx) => (
                    <option key={m} value={idx}>{m}</option>
                  ))}
                </select>
                <select
                  value={wordYear}
                  onChange={e => setWordYear(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 focus:border-teal-300 focus:outline-none"
                >
                  {YEAR_RANGE.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400">
                  Hicri: {wordData.hijriMonthName} · {wordData.altin.length} Altın, {wordData.sunnet.length} Sünnet, {wordData.uygun.length} Uygun
                </span>
              </div>
            </div>

            {/* Rapor Ayarları */}
            <div className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
              <p className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">⚙️ Rapor Ayarları</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[8px] font-black uppercase tracking-[0.15em] text-slate-400">Rapor Başlığı</label>
                  <input
                    type="text"
                    value={wordTitle}
                    onChange={e => setWordTitle(e.target.value)}
                    placeholder="HACAMAT TAKVİMİ"
                    className="w-full rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[11px] text-slate-700 placeholder:text-slate-300 focus:border-teal-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[8px] font-black uppercase tracking-[0.15em] text-slate-400">Uzman Adı</label>
                  <input
                    type="text"
                    value={wordExpertName}
                    onChange={e => setWordExpertName(e.target.value)}
                    placeholder="Uzman adı veya klinik adı…"
                    className="w-full rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[11px] text-slate-700 placeholder:text-slate-300 focus:border-teal-300 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Dahil Edilecek Bölümler */}
            <div className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
              <p className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">📋 Dahil Edilecek Bölümler</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {([
                  { key: "altin",     label: "Altın Günler",   color: "text-amber-600"   },
                  { key: "sunnet",    label: "Sünnet Günleri", color: "text-emerald-600" },
                  { key: "uygun",     label: "Uygun Günler",   color: "text-yellow-600"  },
                  { key: "yasakli",   label: "Yasak Günler",   color: "text-red-600"     },
                  { key: "kurallar",  label: "Kurallar",       color: "text-teal-600"    },
                  { key: "uzmanNotu", label: "Uzman Notları",  color: "text-slate-600"   },
                ] as { key: keyof typeof includeSections; label: string; color: string }[]).map(({ key, label, color }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-100 bg-white/60 px-3 py-2 transition hover:bg-white/90"
                  >
                    <input
                      type="checkbox"
                      checked={includeSections[key]}
                      onChange={() => toggleSection(key)}
                      className="h-3.5 w-3.5 rounded accent-teal-600"
                    />
                    <span className={`text-[11px] font-semibold ${color}`}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Uzman Notları (sadece toggle açıksa görünür) */}
            {includeSections.uzmanNotu && (
              <div className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
                <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">📝 Uzman Notları</p>
                <p className="mb-2 text-[10px] text-slate-400">Word raporuna olduğu gibi aktarılır.</p>
                <textarea
                  value={expertNotes}
                  onChange={e => setExpertNotes(e.target.value)}
                  placeholder={"Örn: Bu ay altın günlerde yoğunluk beklenmektedir.\nHava sıcaklıkları nedeniyle su tüketimi artırılmalıdır."}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white/80 p-2.5 text-[11px] text-slate-700 placeholder:text-slate-300 focus:border-teal-300 focus:outline-none"
                />
              </div>
            )}

            {/* Önizleme */}
            <div className="rounded-[18px] border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md sm:p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-teal-700">👁️ Word Önizleme</p>
                <button
                  onClick={() => setShowPreview(p => !p)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  {showPreview ? "Gizle" : "Göster"}
                </button>
              </div>
              {showPreview && (
                <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
                  <p className="mb-0.5 text-center text-[14px] font-black uppercase text-teal-800">
                    {wordTitle || "HACAMAT TAKVİMİ"}
                  </p>
                  <p className="mb-1 text-center text-[10px] text-slate-500">
                    {MONTH_NAMES_TR[wordMonth]} {wordYear} · Hicri Ay: {wordData.hijriMonthName}
                  </p>
                  {wordExpertName && (
                    <p className="mb-3 text-center text-[10px] italic text-slate-400">{wordExpertName}</p>
                  )}
                  <div className="mb-3 flex flex-wrap gap-1.5 justify-center">
                    {includeSections.altin   && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-700">{wordData.altin.length} Altın</span>}
                    {includeSections.sunnet  && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">{wordData.sunnet.length} Sünnet</span>}
                    {includeSections.uygun   && <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[9px] font-semibold text-yellow-700">{wordData.uygun.length} Uygun</span>}
                    {includeSections.yasakli && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-semibold text-red-700">{wordData.yasakliNotable.length} Yasaklı</span>}
                  </div>
                  <div className="space-y-1 border-t border-teal-100 pt-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">İçerik</p>
                    <ul className="space-y-0.5">
                      <li className="text-[10px] text-slate-600">✓ Aylık Hacamat Takvimi</li>
                      {wordData.notes.length > 0 && <li className="text-[10px] text-slate-600">✓ Hicri Gün Notları ({wordData.notes.length})</li>}
                      {includeSections.kurallar && rules.filter(r => r.category !== "general").length > 0 && (
                        <li className="text-[10px] text-slate-600">
                          ✓ Kurallar ({rules.filter(r => r.category === "before").length} öncesi, {rules.filter(r => r.category === "after").length} sonrası)
                        </li>
                      )}
                      {includeSections.uzmanNotu && expertNotes.trim() && <li className="text-[10px] text-slate-600">✓ Uzman Notları</li>}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* ── Mobil: sadece rapor linki — md altında görünür ── */}
            <div className="flex flex-col gap-2 md:hidden">
              {/* Raporu Aç — PWA içinde kalır, rapor sayfasına gider */}
              <Link
                href={`/cosmic-calendar/hacamat/report?month=${wordMonth}&year=${wordYear}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-[12px] font-black text-teal-800 shadow-sm no-underline transition active:scale-[0.98]"
              >
                <ExternalLink className="h-4 w-4" />
                {MONTH_NAMES_TR[wordMonth]} {wordYear} — Raporu Aç
              </Link>
            </div>

            {/* ── Tablet+: blob POST download — md ve üzerinde görünür ── */}
            <div className="hidden gap-2 md:flex md:justify-end">
              <button
                onClick={() => void handlePdfReport()}
                disabled={isGeneratingPdf || isGenerating}
                className="flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-[12px] font-black text-teal-700 shadow-sm transition hover:bg-teal-50 disabled:opacity-50"
              >
                {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {isGeneratingPdf ? "Hazırlanıyor…" : `${MONTH_NAMES_TR[wordMonth]} ${wordYear} — PDF Oluştur`}
              </button>
              <button
                onClick={() => void handleWordReport()}
                disabled={isGenerating || isGeneratingPdf}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-700 px-5 py-2.5 text-[12px] font-black text-white shadow-lg shadow-teal-300/30 transition hover:from-teal-700 hover:to-emerald-800 disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {isGenerating ? "Hazırlanıyor…" : `${MONTH_NAMES_TR[wordMonth]} ${wordYear} — Word Oluştur`}
              </button>
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
