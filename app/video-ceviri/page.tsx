"use client";

import Link from "next/link";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { useCallback, useEffect, useState } from "react";
import {
  AlignLeft,
  ChevronDown,
  Clock,
  Download,
  FileText,
  Languages,
  List,
  Loader2,
  Maximize2,
  Mic,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import {
  downloadTranscriptAsPdf,
  type ExportMode,
} from "@/lib/video-ceviri/exportHelpers";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { useToast } from "@/components/ui/ToastProvider";
import VideoUploadZone from "./components/VideoUploadZone";
import {
  fetchVideoJobs,
  formatFileSizeTr,
  formatJobDateTr,
  type VideoJobRow,
} from "@/lib/video-ceviri/videoJobHelpers";

// ── Sabitler ─────────────────────────────────────────────────────────────────

const STEPS = [
  { icon: "🎬", label: "Video yüklenir" },
  { icon: "🎙️", label: "Ses metne çevrilir" },
  { icon: "🌐", label: "Türkçeye çevrilir" },
  { icon: "📄", label: "Word ve PDF oluşturulur" },
];

const STATUS_STYLE: Record<string, string> = {
  completed:    "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
  transcribing: "bg-violet-100 text-violet-800 ring-violet-200/80",
  translating:  "bg-blue-100 text-blue-800 ring-blue-200/80",
  generating:   "bg-amber-100 text-amber-800 ring-amber-200/80",
  uploaded:     "bg-slate-100 text-slate-700 ring-slate-200/80",
  failed:       "bg-rose-100 text-rose-800 ring-rose-200/80",
};

const STATUS_LABEL: Record<string, string> = {
  completed:    "Tamamlandı",
  transcribing: "Metne çevriliyor…",
  translating:  "Türkçeye çevriliyor…",
  generating:   "Dosya oluşturuluyor…",
  uploaded:     "Yüklendi",
  failed:       "Başarısız",
};

const LANGUAGE_DISPLAY: Record<string, string> = {
  de: "Almanca", en: "İngilizce", fr: "Fransızca", es: "İspanyolca",
  tr: "Türkçe",  ar: "Arapça",   ru: "Rusça",     it: "İtalyanca",
  pt: "Portekizce", nl: "Felemenkçe", pl: "Lehçe",
  ja: "Japonca", zh: "Çince",    ko: "Korece",
};

// ── Bileşen ───────────────────────────────────────────────────────────────────

export default function VideoCeviriPage() {
  const { showToast } = useToast();

  // veri
  const [tenantId, setTenantId]       = useState<string | null>(null);
  const [userId, setUserId]           = useState<string | null>(null);
  const [jobs, setJobs]               = useState<VideoJobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  // işlem state'leri — mevcut handler'larla birebir uyumlu, değişmedi
  const [transcribingId, setTranscribingId]   = useState<string | null>(null);
  const [translatingId, setTranslatingId]     = useState<string | null>(null);
  const [pdfGeneratingId, setPdfGeneratingId] = useState<string | null>(null);
  const [dropdownOpenId, setDropdownOpenId]   = useState<string | null>(null);
  const [summarizingId, setSummarizingId]     = useState<string | null>(null);
  const [headliningId, setHeadliningId]       = useState<string | null>(null);

  // UI state'leri (yeni)
  const [panelOpen, setPanelOpen]     = useState(false);
  const [detailJob, setDetailJob]     = useState<VideoJobRow | null>(null);

  // ── Veri yükleme ────────────────────────────────────────────────────────────

  const loadJobs = useCallback(async (tid: string) => {
    setJobsLoading(true);
    const rows = await fetchVideoJobs(tid);
    setJobs(rows);
    setJobsLoading(false);
  }, []);

  useEffect(() => {
    void getSyncedTenantId().then((tid) => {
      if (!tid) { setJobsLoading(false); return; }
      setTenantId(tid);
      void loadJobs(tid);
    });
    setUserId(readYasamUser()?.id ?? null);
  }, [loadJobs]);

  function handleUploadSuccess() {
    if (tenantId) void loadJobs(tenantId);
  }

  // ── API handler'ları — DEĞIŞMEDI ────────────────────────────────────────────

  function handleDownloadWord(job: VideoJobRow, mode: ExportMode) {
    if (!tenantId || !userId || !job.transcript_original) return;
    if ((mode === "turkish" || mode === "comparison") && !job.transcript_tr) return;
    const url =
      `/api/video-ceviri/export-word` +
      `?jobId=${encodeURIComponent(job.id)}` +
      `&tenantId=${encodeURIComponent(tenantId)}` +
      `&userId=${encodeURIComponent(userId)}` +
      `&mode=${mode}`;
    window.open(url, "_blank");
  }

  async function handleDownloadPdf(job: VideoJobRow, mode: ExportMode) {
    if (!job.transcript_original || pdfGeneratingId) return;
    if ((mode === "turkish" || mode === "comparison") && !job.transcript_tr) return;
    const key = `${job.id}-${mode}`;
    setPdfGeneratingId(key);
    try {
      const safeName = job.original_filename
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      const suffix =
        mode === "original" ? "orijinal" : mode === "turkish" ? "turkce" : "karsilastirmali";
      await downloadTranscriptAsPdf(
        job.transcript_original,
        job.transcript_tr,
        mode,
        `${safeName}_${suffix}.pdf`,
      );
    } catch {
      showToast({ title: "PDF oluşturulamadı", message: "Lütfen tekrar deneyin.", type: "error" });
    } finally {
      setPdfGeneratingId(null);
    }
  }

  async function handleTranslate(job: VideoJobRow) {
    if (!tenantId || !userId || !job.transcript_original || translatingId) return;
    setTranslatingId(job.id);
    try {
      const res = await fetch("/api/video-ceviri/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, tenantId, userId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; alreadyTurkish?: boolean };
      if (!data.ok) {
        showToast({ title: "Çeviri başarısız", message: data.error ?? "Bilinmeyen hata.", type: "error" });
      } else if (data.alreadyTurkish) {
        showToast({ title: "Zaten Türkçe", message: "Bu metin zaten Türkçe görünüyor.", type: "warning" });
      }
    } catch {
      showToast({ title: "Bağlantı hatası", message: "Sunucuya ulaşılamadı.", type: "error" });
    } finally {
      setTranslatingId(null);
      if (tenantId) void loadJobs(tenantId);
    }
  }

  async function handleSummarize(job: VideoJobRow) {
    if (!tenantId || !userId || !job.transcript_tr || summarizingId) return;
    setSummarizingId(job.id);
    try {
      const res = await fetch("/api/video-ceviri/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, tenantId, userId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        showToast({ title: "Özet oluşturulamadı", message: data.error ?? "Bilinmeyen hata.", type: "error" });
      }
    } catch {
      showToast({ title: "Bağlantı hatası", message: "Sunucuya ulaşılamadı.", type: "error" });
    } finally {
      setSummarizingId(null);
      if (tenantId) void loadJobs(tenantId);
    }
  }

  async function handleHeadings(job: VideoJobRow) {
    if (!tenantId || !userId || !job.transcript_tr || headliningId) return;
    setHeadliningId(job.id);
    try {
      const res = await fetch("/api/video-ceviri/headings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, tenantId, userId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        showToast({ title: "Başlıklar oluşturulamadı", message: data.error ?? "Bilinmeyen hata.", type: "error" });
      }
    } catch {
      showToast({ title: "Bağlantı hatası", message: "Sunucuya ulaşılamadı.", type: "error" });
    } finally {
      setHeadliningId(null);
      if (tenantId) void loadJobs(tenantId);
    }
  }

  async function handleTranscribe(job: VideoJobRow) {
    if (!tenantId || !userId || transcribingId) return;
    setTranscribingId(job.id);
    try {
      const res = await fetch("/api/video-ceviri/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, tenantId, userId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        showToast({ title: "Transkripsiyon başarısız", message: data.error ?? "Bilinmeyen hata.", type: "error" });
      }
    } catch {
      showToast({ title: "Bağlantı hatası", message: "Sunucuya ulaşılamadı.", type: "error" });
    } finally {
      setTranscribingId(null);
      if (tenantId) void loadJobs(tenantId);
    }
  }

  // ── Render yardımcıları ──────────────────────────────────────────────────────

  /** İndir dropdown — hem panelde hem detayda kullanılır */
  function renderDownloadDropdown(job: VideoJobRow) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setDropdownOpenId(dropdownOpenId === job.id ? null : job.id)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 text-xs font-bold text-violet-700 shadow-sm transition hover:border-violet-300 hover:shadow-md"
        >
          {pdfGeneratingId?.startsWith(`${job.id}-`) ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" strokeWidth={2.25} />
          )}
          İndir
          <ChevronDown className={`h-3 w-3 transition-transform ${dropdownOpenId === job.id ? "rotate-180" : ""}`} strokeWidth={2.5} />
        </button>

        {dropdownOpenId === job.id && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setDropdownOpenId(null)} />
            <div className="absolute left-0 top-full z-[9999] mt-1.5 min-w-[240px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="px-3 pb-1 pt-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Word</p>
              </div>
              {(["original","turkish","comparison"] as ExportMode[]).map((mode) => {
                const labels: Record<ExportMode,string> = { original:"Orijinal Word", turkish:"Türkçe Word", comparison:"Karşılaştırmalı Word" };
                const disabled = (mode === "turkish" || mode === "comparison") && !job.transcript_tr;
                return (
                  <button key={mode} type="button" disabled={disabled}
                    title={disabled ? "Önce Türkçeye Çevir" : undefined}
                    onClick={() => { setDropdownOpenId(null); handleDownloadWord(job, mode); }}
                    className={`w-full px-4 py-2 text-left text-xs font-semibold transition ${disabled ? "cursor-not-allowed text-slate-300" : "text-slate-800 hover:bg-violet-50 hover:text-violet-800"}`}>
                    {labels[mode]}
                  </button>
                );
              })}
              <div className="mx-3 my-1.5 border-t border-slate-100" />
              <div className="px-3 pb-1">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-600">PDF</p>
              </div>
              {(["original","turkish","comparison"] as ExportMode[]).map((mode) => {
                const labels: Record<ExportMode,string> = { original:"Orijinal PDF", turkish:"Türkçe PDF", comparison:"Karşılaştırmalı PDF" };
                const isGen = pdfGeneratingId === `${job.id}-${mode}`;
                const disabled = ((mode === "turkish" || mode === "comparison") && !job.transcript_tr) || !!pdfGeneratingId;
                return (
                  <button key={mode} type="button" disabled={disabled}
                    title={(mode === "turkish" || mode === "comparison") && !job.transcript_tr ? "Önce Türkçeye Çevir" : undefined}
                    onClick={() => { setDropdownOpenId(null); void handleDownloadPdf(job, mode); }}
                    className={`w-full px-4 py-2 text-left text-xs font-semibold transition ${disabled ? "cursor-not-allowed text-slate-300" : "text-slate-800 hover:bg-rose-50 hover:text-rose-700"}`}>
                    {isGen ? "Oluşturuluyor…" : labels[mode]}
                  </button>
                );
              })}
              <div className="h-1.5" />
            </div>
          </>
        )}
      </div>
    );
  }

  /** Tek iş kartı — full-screen panelde kullanılır */
  function renderJobCard(job: VideoJobRow) {
    const isFailed    = job.status === "failed";
    const isCompleted = job.status === "completed";
    const isUploaded  = job.status === "uploaded";
    const isProcessing = ["transcribing","translating","generating"].includes(job.status);

    const cardBg = isFailed
      ? "border-rose-200/70 bg-rose-50/40"
      : isCompleted
        ? "border-emerald-200/60 bg-white"
        : "border-slate-200/80 bg-white/80";

    return (
      <div key={job.id} className={`flex flex-col rounded-2xl border p-5 shadow-sm transition ${cardBg}`}>
        {/* başlık satırı */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-slate-800" title={job.original_filename}>
              {job.original_filename}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-400">
              {formatFileSizeTr(job.file_size_bytes)} · {formatJobDateTr(job.created_at)}
            </p>
            {job.source_language && job.source_language !== "auto" && (
              <span className="mt-1 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                {LANGUAGE_DISPLAY[job.source_language] ?? job.source_language.toUpperCase()}
              </span>
            )}
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${STATUS_STYLE[job.status] ?? STATUS_STYLE.uploaded}`}>
            {STATUS_LABEL[job.status] ?? job.status}
          </span>
        </div>

        {/* içerik önizlemeleri */}
        {isCompleted && (
          <div className="mt-3 space-y-2">
            {job.transcript_original && (
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Transkript</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-600">
                  {job.transcript_original.slice(0, 120)}{job.transcript_original.length > 120 ? "…" : ""}
                </p>
              </div>
            )}
            {job.transcript_tr && (
              <div className="rounded-lg bg-blue-50/70 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-blue-600">Türkçe Çeviri</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-600">
                  {job.transcript_tr.slice(0, 120)}{job.transcript_tr.length > 120 ? "…" : ""}
                </p>
              </div>
            )}
            {job.summary_text && (
              <div className="rounded-lg bg-emerald-50/70 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Özet</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-600">{job.summary_text.split("\n")[0]}</p>
              </div>
            )}
          </div>
        )}

        {/* hata — tek satır, uzunsa kırpılır */}
        {isFailed && job.error_message && (
          <p className="mt-2 line-clamp-2 rounded-lg border border-rose-200/80 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {job.error_message}
          </p>
        )}

        {/* işlem spinner */}
        {isProcessing && (
          <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-violet-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {STATUS_LABEL[job.status]}
          </div>
        )}

        {/* aksiyonlar */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {isUploaded && (
            <button type="button"
              onClick={() => void handleTranscribe(job)}
              disabled={!!transcribingId}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 text-[11px] font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
              {transcribingId === job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" strokeWidth={2.25} />}
              Transkripsiyon Başlat
            </button>
          )}
          {isCompleted && job.transcript_original && (
            <>
              {renderDownloadDropdown(job)}
              {!job.transcript_tr && (
                job.source_language === "tr" ? (
                  <span className="text-[11px] font-medium text-slate-400">Zaten Türkçe</span>
                ) : (
                  <button type="button" onClick={() => void handleTranslate(job)}
                    disabled={!!translatingId}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 text-[11px] font-bold text-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {translatingId === job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" strokeWidth={2.25} />}
                    {translatingId === job.id ? "Çevriliyor…" : "Türkçeye Çevir"}
                  </button>
                )
              )}
              {job.transcript_tr && !job.summary_text && (
                <button type="button" onClick={() => void handleSummarize(job)}
                  disabled={!!summarizingId}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-bold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {summarizingId === job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" strokeWidth={2.25} />}
                  {summarizingId === job.id ? "Hazırlanıyor…" : "Özet Çıkar"}
                </button>
              )}
              {job.transcript_tr && !job.headings_text && (
                <button type="button" onClick={() => void handleHeadings(job)}
                  disabled={!!headliningId}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-[11px] font-bold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {headliningId === job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <List className="h-3 w-3" strokeWidth={2.25} />}
                  {headliningId === job.id ? "Oluşturuluyor…" : "Başlıklandır"}
                </button>
              )}
            </>
          )}
          {(isCompleted || isFailed) && (
            <button type="button"
              onClick={() => setDetailJob(job)}
              className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-100">
              <FileText className="h-3 w-3" strokeWidth={2.25} />
              Detay
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── JSX ────────────────────────────────────────────────────────────────────

  const recentJobs = jobs.slice(0, 3);
  const completedCount = jobs.filter(j => j.status === "completed").length;

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <BfcacheRefreshHandler />
      <div className="pointer-events-none absolute -left-32 top-0 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 top-[20%] h-72 w-72 rounded-full bg-cyan-300/18 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-[30%] h-64 w-64 rounded-full bg-fuchsia-300/15 blur-3xl" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] min-w-0 px-4 pb-4 pt-3 sm:px-6 sm:pb-5 lg:px-8">

        {/* header */}
        <header className="mb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 rounded-full border border-violet-200/80 bg-violet-50/95 px-2.5 py-0.5 text-[10px] font-bold text-violet-800 shadow-sm">
                <Video className="h-3 w-3" aria-hidden />
                Yapay Zeka Destekli Çeviri
              </div>
              <h1 className="mt-1 text-xl font-black leading-tight tracking-tight text-slate-950 sm:text-2xl">
                Video{" "}
                <span className="bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 bg-clip-text text-transparent">&rarr;</span>{" "}
                Türkçe Word/PDF Merkezi
              </h1>
              <p className="mt-0.5 max-w-[700px] text-[11px] leading-relaxed text-slate-500 sm:text-xs">
                Video yükleyin; konuşma otomatik metne çevrilir, Türkçeye aktarılır ve Word ile PDF olarak indirilebilir hale gelir.
              </p>
            </div>
          </div>
        </header>

        {/* adımlar */}
        <section className="mb-3 overflow-hidden rounded-xl border border-indigo-900/20 bg-gradient-to-r from-indigo-950 via-violet-950 to-indigo-900 shadow-sm" aria-label="İşlem adımları">
          <div className="grid grid-cols-2 gap-0 sm:grid-cols-4">
            {STEPS.map((step, i) => (
              <div key={step.label} className={`flex items-center gap-2 px-3 py-2 sm:flex-col sm:items-center sm:gap-1 sm:py-2 sm:text-center ${i < STEPS.length - 1 ? "sm:border-r sm:border-white/10" : ""}`}>
                <span className="text-base shrink-0" aria-hidden>{step.icon}</span>
                <p className="text-[11px] font-bold leading-snug text-indigo-100/90">
                  <span className="mr-0.5 text-[10px] font-black text-white/50">{i + 1}.</span>
                  {step.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* upload + bilgi kartları */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
          <section aria-label="Video yükleme alanı">
            <VideoUploadZone onSuccess={handleUploadSuccess} />
          </section>

          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/80 p-3 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-black text-slate-900">
                <span className="text-sm" aria-hidden>🔒</span>Gizlilik &amp; Güvenlik
              </h3>
              <ul className="space-y-1 text-[11px] font-medium leading-relaxed text-slate-600">
                <li className="flex items-start gap-1.5"><span className="text-emerald-600" aria-hidden>✓</span>Yüklenen video işlem sonrası otomatik silinir</li>
                <li className="flex items-start gap-1.5"><span className="text-emerald-600" aria-hidden>✓</span>Metin ve çeviriler yalnızca size aittir</li>
                <li className="flex items-start gap-1.5"><span className="text-emerald-600" aria-hidden>✓</span>Yönetici içeriklerinize erişemez</li>
                <li className="flex items-start gap-1.5"><span className="text-emerald-600" aria-hidden>✓</span>Word ve PDF isteğe bağlı kaydedilebilir</li>
              </ul>
            </div>

            <div className="rounded-xl border border-violet-200/70 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/80 p-3 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-black text-slate-900">
                <FileText className="h-3.5 w-3.5 text-violet-600" strokeWidth={2.25} />
                Desteklenen Formatlar
              </h3>
              <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">Video</p>
              <div className="grid grid-cols-3 gap-1">
                {["MP4","MOV","WEBM","MKV","AVI","OGG"].map(f => (
                  <div key={f} className="rounded-lg border border-violet-100 bg-white/80 px-1.5 py-1 text-center text-[10px] font-black text-violet-700">{f}</div>
                ))}
              </div>
              <p className="mb-1 mt-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Ses</p>
              <div className="grid grid-cols-3 gap-1">
                {["MP3","M4A","WAV","AAC","AMR","OGG"].map(f => (
                  <div key={f} className="rounded-lg border border-indigo-100 bg-white/80 px-1.5 py-1 text-center text-[10px] font-black text-indigo-600">{f}</div>
                ))}
              </div>
              <p className="mt-2 text-[11px] font-medium text-slate-400">Transkripsiyon limiti: 25 MB</p>
            </div>
          </div>
        </div>

        {/* ── Son Çevrilenler (kompakt) ──────────────────────────────────── */}
        <section className="mt-4" aria-labelledby="recent-heading">
          <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 id="recent-heading" className="flex items-center gap-2.5 text-xl font-black text-slate-900">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-md">
                  <Clock className="h-5 w-5" strokeWidth={2.25} />
                </span>
                Son Çevrilenler
                {!jobsLoading && jobs.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-bold text-slate-500">{jobs.length}</span>
                )}
              </h2>

              {jobs.length > 0 && (
                <button type="button"
                  onClick={() => setPanelOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 px-5 text-sm font-bold text-violet-700 shadow-sm transition hover:border-violet-300 hover:shadow-md">
                  <Maximize2 className="h-4 w-4" strokeWidth={2.25} />
                  Tüm Çevrilen Kayıtları Gör
                </button>
              )}
            </div>

            {/* son 3 kayıt — kompakt liste */}
            <div className="mt-5">
              {jobsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
                </div>
              ) : jobs.length === 0 ? (
                <p className="py-8 text-center text-sm font-medium text-slate-400">
                  Henüz işlem kaydı yok. İlk videoyu yükleyerek başlayın.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentJobs.map((job) => (
                    <div key={job.id} className="flex items-center gap-3 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                        <Video className="h-4 w-4" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-700">{job.original_filename}</p>
                        <p className="text-xs font-medium text-slate-400">
                          {formatJobDateTr(job.created_at)}
                          {job.source_language && job.source_language !== "auto" && (
                            <> · {LANGUAGE_DISPLAY[job.source_language] ?? job.source_language.toUpperCase()}</>
                          )}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${STATUS_STYLE[job.status] ?? STATUS_STYLE.uploaded}`}>
                        {STATUS_LABEL[job.status] ?? job.status}
                      </span>
                    </div>
                  ))}
                  {jobs.length > 3 && (
                    <div className="pt-3 text-center">
                      <button type="button"
                        onClick={() => setPanelOpen(true)}
                        className="text-sm font-bold text-violet-600 hover:text-violet-800">
                        + {jobs.length - 3} kayıt daha →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ── Full-Screen Kayıt Paneli ──────────────────────────────────────── */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[linear-gradient(135deg,#edf5ff_0%,#eef2ff_42%,#f0fdfa_100%)]">
          {/* panel header */}
          <div className="shrink-0 border-b border-slate-200/80 bg-white/95 px-4 py-4 shadow-sm sm:px-8">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Çevrilen Kayıtlar</h2>
                <p className="text-sm font-medium text-slate-500">
                  Daha önce yüklediğiniz video ve ses çeviri işlemleri
                  {completedCount > 0 && ` · ${completedCount} tamamlanan`}
                </p>
              </div>
              <button type="button"
                onClick={() => setPanelOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50">
                <X className="h-5 w-5" strokeWidth={2.25} />
              </button>
            </div>
          </div>

          {/* panel içerik */}
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
            <div className="mx-auto max-w-[1600px]">
              {jobs.length === 0 ? (
                <p className="py-20 text-center text-sm font-medium text-slate-400">
                  Henüz kayıt yok.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {jobs.map((job) => renderJobCard(job))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Detay Modalı ──────────────────────────────────────────────────── */}
      {detailJob && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl rounded-[32px] border border-white/80 bg-white shadow-2xl">
            {/* modal header */}
            <div className="sticky top-0 flex items-start justify-between gap-4 rounded-t-[32px] border-b border-slate-100 bg-white px-7 py-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-black text-slate-900">{detailJob.original_filename}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${STATUS_STYLE[detailJob.status] ?? STATUS_STYLE.uploaded}`}>
                    {STATUS_LABEL[detailJob.status] ?? detailJob.status}
                  </span>
                  {detailJob.source_language && detailJob.source_language !== "auto" && (
                    <span className="text-xs font-medium text-slate-500">
                      {LANGUAGE_DISPLAY[detailJob.source_language] ?? detailJob.source_language.toUpperCase()}
                    </span>
                  )}
                  <span className="text-xs font-medium text-slate-400">
                    {formatFileSizeTr(detailJob.file_size_bytes)} · {formatJobDateTr(detailJob.created_at)}
                  </span>
                </div>
              </div>
              <button type="button"
                onClick={() => setDetailJob(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100">
                <X className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>

            {/* modal içerik */}
            <div className="space-y-5 px-7 py-6">
              {/* hata */}
              {detailJob.status === "failed" && detailJob.error_message && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
                  <p className="mb-1 text-xs font-black uppercase tracking-wider text-rose-600">Hata</p>
                  <p className="text-sm font-medium leading-relaxed text-rose-800">{detailJob.error_message}</p>
                </div>
              )}

              {/* transkript */}
              {detailJob.transcript_original && (
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-5 py-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Orijinal Transkript</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{detailJob.transcript_original}</p>
                </div>
              )}

              {/* türkçe çeviri */}
              {detailJob.transcript_tr && (
                <div className="rounded-2xl border border-blue-200/70 bg-blue-50/50 px-5 py-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-wider text-blue-600">Türkçe Çeviri</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{detailJob.transcript_tr}</p>
                </div>
              )}

              {/* özet */}
              {detailJob.summary_text && (
                <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/50 px-5 py-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-wider text-emerald-600">Kısa Özet</p>
                  <div className="space-y-1.5 text-sm leading-relaxed text-slate-700">
                    {detailJob.summary_text.split("\n").filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}
                  </div>
                </div>
              )}

              {/* başlıklar */}
              {detailJob.headings_text && (
                <div className="rounded-2xl border border-indigo-200/70 bg-indigo-50/50 px-5 py-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-wider text-indigo-600">Bölüm Başlıkları</p>
                  <div className="space-y-1.5 text-sm leading-relaxed text-slate-700">
                    {detailJob.headings_text.split("\n").filter(Boolean).map((line, i) => <p key={i} className="font-medium">{line}</p>)}
                  </div>
                </div>
              )}

              {/* aksiyonlar */}
              {detailJob.status === "completed" && detailJob.transcript_original && (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  {renderDownloadDropdown(detailJob)}
                  {!detailJob.transcript_tr && detailJob.source_language !== "tr" && (
                    <button type="button" onClick={() => void handleTranslate(detailJob)}
                      disabled={!!translatingId}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 text-xs font-bold text-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
                      <Languages className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Türkçeye Çevir
                    </button>
                  )}
                  {detailJob.transcript_tr && !detailJob.summary_text && (
                    <button type="button" onClick={() => void handleSummarize(detailJob)}
                      disabled={!!summarizingId}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-bold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Özet Çıkar
                    </button>
                  )}
                  {detailJob.transcript_tr && !detailJob.headings_text && (
                    <button type="button" onClick={() => void handleHeadings(detailJob)}
                      disabled={!!headliningId}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-xs font-bold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                      <List className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Başlıklandır
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
