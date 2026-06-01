"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Clock,
  FileText,
  Loader2,
  Mic,
  Video,
} from "lucide-react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { useToast } from "@/components/ui/ToastProvider";
import VideoUploadZone from "./components/VideoUploadZone";
import {
  fetchVideoJobs,
  formatFileSizeTr,
  formatJobDateTr,
  type VideoJobRow,
} from "@/lib/video-ceviri/videoJobHelpers";

const STEPS = [
  { icon: "🎬", label: "Video yüklenir" },
  { icon: "🎙️", label: "Ses metne çevrilir" },
  { icon: "🌐", label: "Türkçeye çevrilir" },
  { icon: "📄", label: "Word ve PDF oluşturulur" },
];

const STATUS_STYLE: Record<string, string> = {
  completed:   "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
  transcribing:"bg-violet-100 text-violet-800 ring-violet-200/80",
  translating: "bg-blue-100 text-blue-800 ring-blue-200/80",
  generating:  "bg-amber-100 text-amber-800 ring-amber-200/80",
  uploaded:    "bg-slate-100 text-slate-700 ring-slate-200/80",
  failed:      "bg-rose-100 text-rose-800 ring-rose-200/80",
};

const STATUS_LABEL: Record<string, string> = {
  completed:    "Tamamlandı",
  transcribing: "Metne çevriliyor…",
  translating:  "Türkçeye çevriliyor…",
  generating:   "Dosya oluşturuluyor…",
  uploaded:     "Yüklendi",
  failed:       "Başarısız",
};

export default function VideoCeviriPage() {
  const { showToast } = useToast();
  const [tenantId, setTenantId]           = useState<string | null>(null);
  const [jobs, setJobs]                   = useState<VideoJobRow[]>([]);
  const [jobsLoading, setJobsLoading]     = useState(true);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);

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
  }, [loadJobs]);

  function handleUploadSuccess() {
    if (tenantId) void loadJobs(tenantId);
  }

  async function handleTranscribe(job: VideoJobRow) {
    if (!tenantId || transcribingId) return;
    setTranscribingId(job.id);
    try {
      const res = await fetch("/api/video-ceviri/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, tenantId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        showToast({
          title: "Transkripsiyon başarısız",
          message: data.error ?? "Bilinmeyen hata.",
          type: "error",
        });
      }
    } catch {
      showToast({
        title: "Bağlantı hatası",
        message: "Sunucuya ulaşılamadı.",
        type: "error",
      });
    } finally {
      setTranscribingId(null);
      if (tenantId) void loadJobs(tenantId);
    }
  }

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 top-[20%] h-72 w-72 rounded-full bg-cyan-300/18 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-[30%] h-64 w-64 rounded-full bg-fuchsia-300/15 blur-3xl" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pt-7">

        {/* nav */}
        <nav className="mb-8 flex items-center gap-3" aria-label="Üst navigasyon">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-violet-200/80 bg-white/90 px-5 text-sm font-bold text-slate-700 shadow-sm no-underline transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            Ana Panele Dön
          </Link>
        </nav>

        {/* header */}
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200/80 bg-violet-50/95 px-5 py-2 text-sm font-bold text-violet-800 shadow-sm">
            <Video className="h-4 w-4" aria-hidden />
            Yapay Zeka Destekli Çeviri
          </div>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
            Video{" "}
            <span className="bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 bg-clip-text text-transparent">
              →
            </span>{" "}
            Türkçe Word/PDF Merkezi
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Video yükleyin; konuşma otomatik metne çevrilir, Türkçeye
            aktarılır ve Word ile PDF olarak indirilebilir hale gelir.
          </p>
        </header>

        {/* steps */}
        <section
          className="mb-10 overflow-hidden rounded-[28px] border border-indigo-900/20 bg-gradient-to-r from-indigo-950 via-violet-950 to-indigo-900 shadow-lg"
          aria-label="İşlem adımları"
        >
          <div className="grid grid-cols-2 gap-0 sm:grid-cols-4">
            {STEPS.map((step, i) => (
              <div
                key={step.label}
                className={`flex flex-col items-center gap-3 px-5 py-6 text-center ${i < STEPS.length - 1 ? "sm:border-r sm:border-white/10" : ""}`}
              >
                <span className="text-3xl" aria-hidden>{step.icon}</span>
                <p className="text-sm font-bold leading-snug text-indigo-100/90">
                  <span className="mr-1.5 text-xs font-black text-white/50">{i + 1}.</span>
                  {step.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">

          {/* upload zone */}
          <section aria-label="Video yükleme alanı">
            <VideoUploadZone onSuccess={handleUploadSuccess} />
          </section>

          {/* right column */}
          <div className="flex flex-col gap-6">
            <div className="rounded-[28px] border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/80 p-6 shadow-md">
              <h3 className="mb-4 flex items-center gap-2.5 text-lg font-black text-slate-900">
                <span className="text-xl" aria-hidden>🔒</span>
                Gizlilik & Güvenlik
              </h3>
              <ul className="space-y-2.5 text-sm font-medium leading-relaxed text-slate-700">
                <li className="flex items-start gap-2"><span className="mt-0.5 text-emerald-600" aria-hidden>✓</span>Yüklenen video işlem sonrası otomatik silinir</li>
                <li className="flex items-start gap-2"><span className="mt-0.5 text-emerald-600" aria-hidden>✓</span>Metin ve çeviriler yalnızca size aittir</li>
                <li className="flex items-start gap-2"><span className="mt-0.5 text-emerald-600" aria-hidden>✓</span>Yönetici içeriklerinize erişemez</li>
                <li className="flex items-start gap-2"><span className="mt-0.5 text-emerald-600" aria-hidden>✓</span>Word ve PDF isteğe bağlı kaydedilebilir</li>
              </ul>
            </div>

            <div className="rounded-[28px] border border-violet-200/70 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/80 p-6 shadow-md">
              <h3 className="mb-4 flex items-center gap-2.5 text-lg font-black text-slate-900">
                <FileText className="h-5 w-5 text-violet-600" strokeWidth={2.25} />
                Desteklenen Formatlar
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {["MP4", "MOV", "WEBM", "MKV", "AVI", "OGG"].map((fmt) => (
                  <div key={fmt} className="rounded-xl border border-violet-100 bg-white/80 px-3 py-2 text-center text-xs font-black text-violet-700">
                    {fmt}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs font-medium text-slate-500">
                Maksimum: 200 MB yükleme · 25 MB Whisper limiti
              </p>
            </div>
          </div>
        </div>

        {/* job history */}
        <section className="mt-8" aria-labelledby="history-heading">
          <div className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-md sm:p-8">
            <h2
              id="history-heading"
              className="mb-6 flex items-center gap-2.5 text-xl font-black text-slate-900"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-md">
                <Clock className="h-5 w-5" strokeWidth={2.25} />
              </span>
              İşlem Geçmişi
            </h2>

            {jobsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
              </div>
            ) : jobs.length === 0 ? (
              <p className="py-10 text-center text-sm font-medium text-slate-400">
                Henüz işlem kaydı yok. İlk videoyu yükleyerek başlayın.
              </p>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => {
                  const isBeingTranscribed = transcribingId === job.id;

                  return (
                    <div
                      key={job.id}
                      className="rounded-2xl border border-slate-100/90 bg-slate-50/70 px-5 py-4"
                    >
                      {/* üst satır: dosya adı + durum */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500">
                            <Video className="h-5 w-5" strokeWidth={1.75} />
                          </div>
                          <div className="min-w-0">
                            <p className="max-w-[200px] truncate text-sm font-black text-slate-700 sm:max-w-sm">
                              {job.original_filename}
                            </p>
                            <p className="text-xs font-medium text-slate-400">
                              {formatFileSizeTr(job.file_size_bytes)} · {formatJobDateTr(job.created_at)}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {/* Transkripsiyon Başlat butonu — sadece 'uploaded' durumunda */}
                          {job.status === "uploaded" && (
                            <button
                              type="button"
                              onClick={() => void handleTranscribe(job)}
                              disabled={!!transcribingId}
                              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-xs font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isBeingTranscribed ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  İşleniyor…
                                </>
                              ) : (
                                <>
                                  <Mic className="h-3.5 w-3.5" strokeWidth={2.25} />
                                  Transkripsiyon Başlat
                                </>
                              )}
                            </button>
                          )}

                          {/* 'transcribing' durumunda satır içi spinner */}
                          {job.status === "transcribing" && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-700">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              İşleniyor…
                            </span>
                          )}

                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${STATUS_STYLE[job.status] ?? STATUS_STYLE.uploaded}`}
                          >
                            {STATUS_LABEL[job.status] ?? job.status}
                          </span>
                        </div>
                      </div>

                      {/* hata mesajı */}
                      {job.status === "failed" && job.error_message && (
                        <p className="mt-3 rounded-xl border border-rose-200/80 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700">
                          {job.error_message}
                        </p>
                      )}

                      {/* transkript preview — sadece completed */}
                      {job.status === "completed" && job.transcript_original && (
                        <div className="mt-3 rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3">
                          <p className="mb-1 text-xs font-black uppercase tracking-wider text-emerald-700">
                            Transkript
                          </p>
                          <p className="text-sm leading-relaxed text-slate-700">
                            {job.transcript_original.length > 300
                              ? `${job.transcript_original.slice(0, 300)}…`
                              : job.transcript_original}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
