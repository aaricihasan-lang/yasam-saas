"use client";

import Link from "next/link";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken, isAdminUser } from "@/lib/auth/yasamUser";
import { useToast } from "@/components/ui/ToastProvider";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { useDigitalContentDemo } from "@/app/digital-content/useDigitalContentDemo";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { formatDateTime } from "@/lib/i18n/format";
import {
  BookOpen,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileCheck,
  FileDown,
  FileText,
  FileUp,
  Languages,
  ScanLine,
  X,
} from "lucide-react";

// ── Tipler ────────────────────────────────────────────────────────────────────

type CardId = "pdf-to-word" | "pdf-to-turkce-word" | "pdf-to-turkce-pdf" | "ocr";

type JobStatus = "pending" | "processing" | "completed" | "failed";

type HistoryJob = {
  id: string;
  file_name: string;
  status: string;
  job_type: string;
  total_pages: number;
  done_chunks: number;
  total_chunks: number;
  result_path: string | null;
  error_message: string | null;
  created_at: string;
  downloadUrl: string | null;
};

const SESSION_JOB_KEY = "belge_ceviri_active_job";

type ActiveJob = {
  jobId: string;
  tenantId: string;
  userId: string;
  cardId: CardId;
  status: JobStatus;
  doneChunks: number;
  totalChunks: number;
  downloadUrl: string | null;
  errorMessage: string | null;
};

// I18N: başlık / alt başlık docTranslate.cards.<msgKey>.{title,subtitle}; rozet + "… Seç" etiketi anahtarla.
type CardDef = {
  id: CardId;
  msgKey: "pdfToWord" | "pdfToTurkishWord" | "ocr";
  icon: React.ReactNode;
  accept: string;
  acceptKind: "pdf" | "image";
  gradient: string;
  border: string;
  iconWrap: string;
  badgeColor: string;
};

// ── Kart tanımları ────────────────────────────────────────────────────────────

const CARDS: CardDef[] = [
  {
    id: "pdf-to-word",
    msgKey: "pdfToWord",
    icon: <FileText className="h-5 w-5" strokeWidth={1.75} />,
    accept: ".pdf,application/pdf",
    acceptKind: "pdf",
    gradient: "from-violet-50/90 via-white to-indigo-50/80",
    border: "border-violet-200/70",
    iconWrap: "from-violet-500 to-indigo-600",
    badgeColor: "bg-green-100 text-green-700",
  },
  {
    id: "pdf-to-turkce-word",
    msgKey: "pdfToTurkishWord",
    icon: <Languages className="h-5 w-5" strokeWidth={1.75} />,
    accept: ".pdf,application/pdf",
    acceptKind: "pdf",
    gradient: "from-sky-50/90 via-white to-cyan-50/80",
    border: "border-sky-200/70",
    iconWrap: "from-sky-500 to-cyan-600",
    badgeColor: "bg-green-100 text-green-700",
  },
  {
    id: "ocr",
    msgKey: "ocr",
    icon: <ScanLine className="h-5 w-5" strokeWidth={1.75} />,
    accept: ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp",
    acceptKind: "image",
    gradient: "from-amber-50/90 via-white to-orange-50/80",
    border: "border-amber-200/70",
    iconWrap: "from-amber-500 to-orange-500",
    badgeColor: "bg-green-100 text-green-700",
  },
];

/**
 * FAZ1 FINAL HARDENING (AUTH): OpenAI maliyeti doğuran AI kartları (PDF → Türkçe Word, OCR)
 * YALNIZ yöneticiye gösterilir. Sunucu da aynı kuralı zorlar (belge_ceviri_ai → admin-only).
 * AI OLMAYAN "PDF → Word" uzmanda kalır.
 */
const AI_CARD_IDS = new Set<CardId>(["pdf-to-turkce-word", "pdf-to-turkce-pdf", "ocr"]);

const ENDPOINT: Partial<Record<CardId, string>> = {
  "pdf-to-word": "/api/belge-ceviri/pdf-to-word",
  "pdf-to-turkce-word": "/api/belge-ceviri/pdf-to-turkce-word",
  "ocr": "/api/belge-ceviri/ocr",
};

const MAX_FILE_BYTES = 50 * 1024 * 1024;   // 50 MB — sunucu limiti (client ile eşleşmeli)
const LARGE_FILE_BYTES = 3 * 1024 * 1024;  // ~50+ sayfa heuristic — çeviri süre uyarısı

/** Güvenli API çağrıları için kimlik başlıkları — x-user-id + x-session-token.
 *  FormData POST'larda Content-Type EKLENMEZ (tarayıcı multipart boundary ayarlar). */
function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "x-user-id": readYasamUser()?.id ?? "" };
  const token = readSessionToken();
  if (token) h["x-session-token"] = token;
  return h;
}

// ── Bileşen ───────────────────────────────────────────────────────────────────

export default function BelgeCeviriPage() {
  const { showToast } = useToast();
  const t = useTranslations("docTranslate");
  const locale = useLocale();
  const demo = useDigitalContentDemo();
  /**
   * Sunucu hata metni: kaynak dilde (tr) sunucunun Türkçe `message`'ı bugünkü gibi gösterilir; diğer
   * dillerde dil-bağımsız `code` → docTranslate.apiErrors, eşleşme yoksa çağıranın (çevrilmiş) yedeği.
   */
  function serverMessage(
    data: { code?: string; message?: string; maxMb?: number; totalPages?: number } | null | undefined,
    fallback: string,
  ): string {
    if (locale === DEFAULT_LOCALE) return data?.message ?? fallback;
    const code = data?.code;
    if (code && t.has(`apiErrors.${code}`)) {
      return t(`apiErrors.${code}`, { maxMb: String(data?.maxMb ?? 50), pages: String(data?.totalPages ?? "?") });
    }
    return fallback;
  }
  const isDemo = readYasamUser()?.is_demo_account === true;
  // Android dahil tüm cihazlarda Word indirme açık (2026-10-14 owner kararı); HD ve Astroloji kendi
  // kurallarını korur. Uygulama WebView blob indirmelerini (Word + TXT) kaydeder.

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  // AI kartları yalnız admin'e; mount sonrası okunur (SSR/hydration farkı olmasın).
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void getSyncedTenantId().then(setTenantId);
    setUserId(readYasamUser()?.id ?? null);
    setIsAdmin(isAdminUser(readYasamUser()));

    // Sayfa yenilemesinde devam eden job'ı geri yükle
    try {
      const raw = sessionStorage.getItem(SESSION_JOB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ActiveJob;
        if (
          parsed.jobId &&
          parsed.tenantId &&
          parsed.userId &&
          (parsed.status === "pending" || parsed.status === "processing")
        ) {
          setActiveJob(parsed);
        } else {
          sessionStorage.removeItem(SESSION_JOB_KEY);
        }
      }
    } catch {
      sessionStorage.removeItem(SESSION_JOB_KEY);
    }
  }, []);

  const [selectedFiles, setSelectedFiles] = useState<Record<CardId, File | null>>({
    "pdf-to-word": null,
    "pdf-to-turkce-word": null,
    "pdf-to-turkce-pdf": null,
    ocr: null,
  });
  const [submitting, setSubmitting] = useState<CardId | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [translationMode, setTranslationMode] = useState<"standard" | "academic">("standard");
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ocrResult, setOcrResult] = useState<{ text: string; isTurkish: boolean; translation?: string } | null>(null);
  const [downloadingWord, setDownloadingWord] = useState<"original" | "translation" | null>(null);
  const [historyJobs, setHistoryJobs] = useState<HistoryJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function openHistory() {
    setHistoryOpen(true);
    // Demo hesap — gerçek/örnek kayıt gösterilmez, temiz boş liste açılır.
    if (isDemo) return;
    if (!userId) return;
    setHistoryLoading(true);
    try {
      // Kimlik yalnız header'dan (x-user-id + x-session-token); query param gönderilmez.
      const res = await fetch(`/api/belge-ceviri/history`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { jobs?: HistoryJob[] };
      setHistoryJobs(data.jobs ?? []);
    } catch {
      // sessizce geç
    } finally {
      setHistoryLoading(false);
    }
  }

  // activeJob sessionStorage'a yaz — sayfa yenilemesinde devam etmek için
  useEffect(() => {
    if (!activeJob || activeJob.status === "completed" || activeJob.status === "failed") {
      sessionStorage.removeItem(SESSION_JOB_KEY);
      return;
    }
    try {
      sessionStorage.setItem(SESSION_JOB_KEY, JSON.stringify(activeJob));
    } catch {
      // sessionStorage dolu veya kullanılamaz
    }
  }, [activeJob]);

  // Job polling — 3 saniyede bir durum kontrolü
  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === "completed" || activeJob.status === "failed") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/belge-ceviri/job-status/${encodeURIComponent(activeJob.jobId)}`, {
          headers: authHeaders(),
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          status: JobStatus;
          doneChunks: number;
          totalChunks: number;
          downloadUrl: string | null;
          errorMessage: string | null;
        };
        setActiveJob((prev) => prev ? { ...prev, ...data } : null);
      } catch {
        // polling hatalarını sessizce geç
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeJob?.jobId, activeJob?.status]);

  const inputRefs = useRef<Record<CardId, HTMLInputElement | null>>({
    "pdf-to-word": null,
    "pdf-to-turkce-word": null,
    "pdf-to-turkce-pdf": null,
    ocr: null,
  });

  function handleFileChange(cardId: CardId, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFiles((prev) => ({ ...prev, [cardId]: file }));
    if (cardId === "ocr") setOcrResult(null);
    e.target.value = "";
  }

  // P38/P44: indirme adı ekran dilinde (tr birebir: ocr-metin / ocr-ceviri). Sunucu adı iki türü ayırmadığı için istemci üretir.
  function downloadTxt(text: string, filename = `${t("fileName.ocrText")}.txt`) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleOcrWordDownload(text: string, which: "original" | "translation", filename = `${t("fileName.ocrText")}.docx`) {
    if (isDemo) { demo.notify(showToast); return; }
    if (downloadingWord) return;
    setDownloadingWord(which);
    try {
      const form = new FormData();
      form.append("text", text);
      const res = await fetch("/api/belge-ceviri/ocr-to-word", { method: "POST", body: form, headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { code?: string; message?: string };
        showToast({ title: t("toast.errorTitle"), message: serverMessage(data, t("toast.wordFailed")), type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("toast.unknownError");
      showToast({ title: t("toast.connectionErrorTitle"), message: msg, type: "error" });
    } finally {
      setDownloadingWord(null);
    }
  }

  function clearFile(cardId: CardId) {
    setSelectedFiles((prev) => ({ ...prev, [cardId]: null }));
  }

  async function handleSubmit(cardId: CardId) {
    // Demo hesapta belge işleme engeli
    if (isDemo) {
      demo.notify(showToast);
      return;
    }

    const file = selectedFiles[cardId];
    const endpoint = ENDPOINT[cardId];
    if (!file || !endpoint || submitting) return;

    // pdf-to-turkce-word için oturum gerekli
    if (cardId === "pdf-to-turkce-word" && (!tenantId || !userId)) {
      showToast({ title: t("toast.errorTitle"), message: t("toast.sessionMissing"), type: "error" });
      return;
    }

    setSubmitting(cardId);
    try {
      const form = new FormData();
      form.append("file", file);
      if (cardId === "pdf-to-turkce-word") {
        form.append("mode", translationMode);
        form.append("tenantId", tenantId!);
      }

      const res = await fetch(endpoint, { method: "POST", body: form, headers: authHeaders() });

      if (!res.ok) {
        let errorMsg = t("toast.serverError", { status: String(res.status) });
        try {
          const data = (await res.json()) as { code?: string; message?: string; maxMb?: number; totalPages?: number };
          if (data.message || data.code) errorMsg = serverMessage(data, errorMsg);
        } catch {
          // non-JSON hata sayfası (örn. Vercel 500 HTML)
        }
        showToast({ title: t("toast.errorTitle"), message: errorMsg, type: "error" });
        return;
      }

      // PDF → Türkçe Word: async job akışı
      if (cardId === "pdf-to-turkce-word") {
        const data = (await res.json()) as {
          success: boolean;
          jobId?: string;
          totalPages?: number;
          code?: string;
          message?: string;
        };
        if (!data.success || !data.jobId) {
          showToast({ title: t("toast.errorTitle"), message: serverMessage(data, t("toast.unknownError")), type: "error" });
          return;
        }
        setActiveJob({
          jobId: data.jobId,
          tenantId: tenantId!,
          userId: userId!,
          cardId,
          status: "pending",
          doneChunks: 0,
          totalChunks: 0,
          downloadUrl: null,
          errorMessage: null,
        });
        clearFile(cardId);
        showToast({
          title: t("toast.queuedTitle"),
          message: t("toast.queuedMsg", { pages: String(data.totalPages ?? "?") }),
          type: "success",
        });
        return;
      }

      // OCR: JSON ile metin + dil bilgisi döner
      if (cardId === "ocr") {
        const data = (await res.json()) as {
          success: boolean;
          text?: string;
          isTurkish?: boolean;
          translation?: string;
          code?: string;
          message?: string;
        };
        if (!data.success || !data.text) {
          showToast({ title: t("toast.errorTitle"), message: serverMessage(data, t("toast.ocrFailed")), type: "error" });
          return;
        }
        setOcrResult({ text: data.text, isTurkish: data.isTurkish ?? true, translation: data.translation });
        clearFile(cardId);
        showToast({ title: t("toast.successTitle"), message: t("toast.ocrSuccess"), type: "success" });
        return;
      }

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("application/pdf") || contentType.includes("application/vnd.openxmlformats")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const ext = contentType.includes("application/pdf") ? ".pdf" : ".docx";
        a.href = url;
        a.download = file.name.replace(/\.[^.]+$/, "") + ext;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast({ title: t("toast.successTitle"), message: t("toast.fileDownloaded"), type: "success" });
        clearFile(cardId);
      } else {
        const data = (await res.json()) as { success: boolean; code?: string; message: string };
        if (data.success) {
          showToast({ title: t("toast.successTitle"), message: locale === DEFAULT_LOCALE ? data.message : t("toast.fileDownloaded"), type: "success" });
          clearFile(cardId);
        } else {
          showToast({ title: t("toast.errorTitle"), message: serverMessage(data, t("toast.unknownError")), type: "error" });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("toast.unknownError");
      showToast({ title: t("toast.connectionErrorTitle"), message: msg, type: "error" });
    } finally {
      setSubmitting(null);
    }
  }

  const isDisabled = (cardId: CardId) => !ENDPOINT[cardId];

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <BfcacheRefreshHandler />
      {/* arka plan ışıkları */}
      <div className="pointer-events-none absolute -left-32 top-0 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 top-[20%] h-72 w-72 rounded-full bg-sky-300/18 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-[30%] h-64 w-64 rounded-full bg-emerald-300/15 blur-3xl" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] min-w-0 px-4 pb-4 pt-3 sm:px-6 sm:pb-5 lg:px-8">

        {isDemo && (
          <DemoModuleBanner message={demo.banner} />
        )}

        {/* hero — rozet + başlık + buton tek satırda */}
        <header className="mb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50/95 px-2.5 py-0.5 text-[10px] font-bold text-sky-800 shadow-sm">
                <BookOpen className="h-3 w-3" aria-hidden />
                {t("header.badge")}
              </div>
              <h1 className="mt-1 text-xl font-black leading-tight tracking-tight text-slate-950 sm:text-2xl">
                {t("header.titleLead")}{" "}
                <span className="bg-gradient-to-r from-sky-600 via-violet-600 to-emerald-600 bg-clip-text text-transparent">
                  {t("header.titleAccent")}
                </span>
              </h1>
              <p className="mt-0.5 max-w-[700px] text-[11px] leading-relaxed text-slate-500 sm:text-xs">
                {isAdmin ? t("header.descAdmin") : t("header.descExpert")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void openHistory()}
              className="inline-flex h-8 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white/90 px-3 text-[11px] font-bold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:w-auto"
            >
              <Clock className="h-3 w-3" strokeWidth={2.25} />
              {t("header.history")}
            </button>
          </div>
        </header>

        {/* kartlar — lg+ 3 sütun, sm 2 sütun, mobil tek sütun */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS
            // AI kartları (OCR, PDF → Türkçe Word) yalnız yöneticiye.
            .filter((card) => isAdmin || !AI_CARD_IDS.has(card.id))
            .map((card) => {
            const file = selectedFiles[card.id];
            const disabled = isDisabled(card.id);
            return (
              <div
                key={card.id}
                className={`flex flex-col rounded-xl border bg-gradient-to-br p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.gradient} ${card.border}`}
              >
                {/* ikon + badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm ${card.iconWrap}`}>
                    {card.icon}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${card.badgeColor}`}>
                    {t("cards.badgeActive")}
                  </span>
                </div>

                {/* başlık */}
                <h2 className="mt-1.5 text-sm font-black text-slate-900">{t(`cards.${card.msgKey}.title`)}</h2>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{t(`cards.${card.msgKey}.subtitle`)}</p>

                {/* dosya seçici alanı */}
                <div className="mt-1.5 space-y-1">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => inputRefs.current[card.id]?.click()}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300/70 bg-white/60 px-3 py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-slate-400/80 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="flex items-center gap-1.5">
                      <FileUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                      {file ? t("cards.changeFile") : card.acceptKind === "pdf" ? t("cards.selectPdf") : t("cards.selectImage")}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                  </button>

                  {file && !disabled && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {t("cards.selectedFile")}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] font-bold text-slate-700" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[10px] font-medium text-slate-400">
                          {t("cards.fileSize", { size: (file.size / 1024 / 1024).toFixed(2) })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => clearFile(card.id)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
                        aria-label={t("cards.removeFile")}
                      >
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    </div>
                  )}

                  <input
                    ref={(el) => { inputRefs.current[card.id] = el; }}
                    type="file"
                    accept={card.accept}
                    className="hidden"
                    onChange={(e) => handleFileChange(card.id, e)}
                  />
                </div>

                {/* çeviri modu seçici — sadece pdf-to-turkce-word */}
                {card.id === "pdf-to-turkce-word" && !disabled && (
                  <div className="mt-1 rounded-lg border border-slate-200/80 bg-white/70 p-1.5">
                    <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {t("cards.modeTitle")}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {(["standard", "academic"] as const).map((m) => (
                        <label
                          key={m}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 transition ${
                            translationMode === m
                              ? "bg-slate-100 ring-1 ring-slate-300"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`mode-${card.id}`}
                            value={m}
                            checked={translationMode === m}
                            onChange={() => setTranslationMode(m)}
                            className="accent-slate-800 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold leading-none text-slate-800">
                              {m === "standard" ? t("cards.modeStandard") : t("cards.modeAcademic")}
                            </p>
                            <p className="text-[10px] font-medium leading-tight text-slate-400">
                              {m === "standard" ? t("cards.modeStandardHint") : t("cards.modeAcademicHint")}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* boyut uyarıları */}
                {file && !disabled && file.size > MAX_FILE_BYTES && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-medium leading-relaxed text-red-800">
                    {t("cards.tooLarge")}
                  </p>
                )}
                {file && !disabled && card.id === "pdf-to-turkce-word" && file.size > LARGE_FILE_BYTES && file.size <= MAX_FILE_BYTES && (
                  <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-medium leading-relaxed text-sky-800">
                    {t("cards.largeWarning")}
                  </p>
                )}

                {/* işlem başlat butonu */}
                <button
                  type="button"
                  disabled={!file || !!submitting || disabled || (file?.size ?? 0) > MAX_FILE_BYTES || (card.id === "pdf-to-turkce-word" && !!activeJob && activeJob.status !== "completed" && activeJob.status !== "failed")}
                  onClick={() => void handleSubmit(card.id)}
                  className="mt-1.5 flex h-7 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-slate-900 via-slate-700 to-slate-800 text-[11px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {submitting === card.id ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      {card.id === "pdf-to-turkce-word" ? t("cards.translating") : t("cards.processing")}
                    </>
                  ) : (
                    <>
                      {card.id === "pdf-to-word" && t("cards.actionPdfToWord")}
                      {card.id === "pdf-to-turkce-word" && t("cards.actionPdfToTurkishWord")}
                      {card.id === "ocr" && t("cards.actionOcr")}
                    </>
                  )}
                </button>

                {isDisabled(card.id) && (
                  <p className="mt-2 text-center text-xs font-medium text-slate-400">
                    {t("cards.comingSoon")}
                  </p>
                )}

                {/* OCR sonuç paneli */}
                {card.id === "ocr" && ocrResult && (
                  <div className="mt-3 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">

                    {/* Başlık + kapat */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-amber-800">{t("ocr.extracted")}</p>
                      <button
                        type="button"
                        onClick={() => setOcrResult(null)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-400 transition hover:bg-amber-50"
                        aria-label={t("ocr.closeResult")}
                      >
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    </div>

                    {/* Orijinal metin */}
                    <textarea
                      readOnly
                      value={ocrResult.text}
                      rows={8}
                      className="w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm font-medium leading-relaxed text-slate-700 focus:outline-none"
                    />

                    {/* Orijinal metin butonları */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(ocrResult.text);
                          showToast({ title: t("toast.copiedTitle"), message: t("toast.textCopied"), type: "success" });
                        }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-white py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
                      >
                        <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />
                        {t("ocr.copy")}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTxt(ocrResult.text)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-white py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
                      >
                        <FileDown className="h-3.5 w-3.5" strokeWidth={2.25} />
                        {t("ocr.downloadTxt")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleOcrWordDownload(ocrResult.text, "original")}
                        disabled={downloadingWord === "original"}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2 text-xs font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
                      >
                        {downloadingWord === "original" ? (
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        ) : (
                          <FileCheck className="h-3.5 w-3.5" strokeWidth={2.25} />
                        )}
                        {t("ocr.downloadWord")}
                      </button>
                    </div>

                    {/* Dil durumu ve çeviri */}
                    {ocrResult.isTurkish ? (
                      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                        {t("ocr.isTurkish")}
                      </p>
                    ) : ocrResult.translation ? (
                      <div className="space-y-2 border-t border-amber-200 pt-3">
                        <p className="text-sm font-bold text-amber-800">{t("ocr.translationTitle")}</p>

                        <textarea
                          readOnly
                          value={ocrResult.translation}
                          rows={8}
                          className="w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm font-medium leading-relaxed text-slate-700 focus:outline-none"
                        />

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(ocrResult.translation ?? "");
                              showToast({ title: t("toast.copiedTitle"), message: t("toast.translationCopied"), type: "success" });
                            }}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-white py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
                          >
                            <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />
                            {t("ocr.copyTranslation")}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadTxt(ocrResult.translation ?? "", `${t("fileName.ocrTranslation")}.txt`)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-white py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
                          >
                            <FileDown className="h-3.5 w-3.5" strokeWidth={2.25} />
                            {t("ocr.downloadTxt")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleOcrWordDownload(ocrResult.translation ?? "", "translation", `${t("fileName.ocrTranslation")}.docx`)}
                            disabled={downloadingWord === "translation"}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2 text-xs font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
                          >
                            {downloadingWord === "translation" ? (
                              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            ) : (
                              <FileCheck className="h-3.5 w-3.5" strokeWidth={2.25} />
                            )}
                            {t("ocr.downloadWord")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      // isTurkish=false ama çeviri gelmedi (API hatası)
                      !ocrResult.isTurkish && (
                        <p className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700">
                          {t("ocr.translationMissing")}
                        </p>
                      )
                    )}

                  </div>
                )}

                {/* Job takip paneli */}
                {activeJob && activeJob.cardId === card.id && (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white/80 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {activeJob.status === "pending" && (
                          <p className="text-sm font-bold text-slate-700">{t("job.queued")}</p>
                        )}
                        {activeJob.status === "processing" && (
                          <>
                            <p className="text-sm font-bold text-sky-700">{t("job.translating")}</p>
                            {activeJob.totalChunks > 0 && (
                              <p className="mt-0.5 text-xs font-medium text-slate-500">
                                {t("job.progress", { done: String(activeJob.doneChunks), total: String(activeJob.totalChunks) })}
                              </p>
                            )}
                            {activeJob.totalChunks > 0 && (
                              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-sky-500 transition-all"
                                  style={{ width: `${Math.round((activeJob.doneChunks / activeJob.totalChunks) * 100)}%` }}
                                />
                              </div>
                            )}
                          </>
                        )}
                        {activeJob.status === "completed" && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.25} />
                            <p className="text-sm font-bold text-emerald-700">{t("job.completed")}</p>
                          </div>
                        )}
                        {activeJob.status === "failed" && (
                          <p className="text-sm font-bold text-red-600">
                            {t("job.failed", { message: activeJob.errorMessage ?? t("toast.unknownError") })}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveJob(null)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 transition hover:bg-slate-100"
                        aria-label={t("job.close")}
                      >
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    </div>

                    {activeJob.status === "completed" && activeJob.downloadUrl && (
                      <a
                        href={activeJob.downloadUrl}
                        download
                        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white transition hover:bg-emerald-700"
                      >
                        <Download className="h-4 w-4" strokeWidth={2.25} />
                        {t("job.downloadDocx")}
                      </a>
                    )}

                    {(activeJob.status === "pending" || activeJob.status === "processing") && (
                      <p className="mt-2 text-[11px] font-medium text-slate-400">
                        {t("job.keepOpen")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Büyük PDF Yardım Accordion */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200/70 bg-white/80 px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
          >
            <span className="text-base">📄</span>
            {t("help.toggle")}
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${helpOpen ? "rotate-180" : ""}`}
              strokeWidth={2.25}
            />
          </button>

          {helpOpen && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-violet-100 bg-white/90 shadow-md">
              <div className="px-4 py-3">
                <h3 className="text-base font-black text-slate-900">{t("help.title")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {t("help.intro")}
                </p>
                <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-bold text-emerald-700">
                  {t("help.maxSize")}
                </div>

                <div className="mt-5 space-y-4">
                  {/* Bölüm 1 — PDF Sıkıştırma */}
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-700">1</div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{t("help.s1Title")}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{t("help.s1Sub")}</p>
                      <ol className="mt-1.5 space-y-1">
                        {[
                          t("help.s1Step1"),
                          t("help.s1Step2"),
                          t("help.s1Step3"),
                          t("help.s1Step4"),
                          t("help.s1Step5"),
                        ].map((step, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs font-medium text-slate-600">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-500">{i + 1}</span>
                            {step}
                          </li>
                        ))}
                      </ol>
                      <p className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs font-medium leading-relaxed text-emerald-700">
                        {t("help.s1Note")}
                      </p>
                    </div>
                  </div>

                  {/* Bölüm 2 — PDF'i Bölümlere Ayırma */}
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-700">2</div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{t("help.s2Title")}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{t("help.s2Body")}</p>
                      <ul className="mt-1.5 space-y-0.5">
                        {[t("help.s2Range1"), t("help.s2Range2"), t("help.s2Range3")].map((l) => (
                          <li key={l} className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                            <span className="h-1 w-1 rounded-full bg-slate-400" />
                            {l}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Bölüm 3 — Görsel Kalitesini Azaltma */}
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-700">3</div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{t("help.s3Title")}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{t("help.s3Body")}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-5">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">{t("help.faqTitle")}</p>
                  {[
                    { q: t("help.faq1Q"), a: t("help.faq1A") },
                    { q: t("help.faq2Q"), a: t("help.faq2A") },
                    { q: t("help.faq3Q"), a: t("help.faq3A") },
                  ].map((faq) => (
                    <div key={faq.q} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                      <p className="text-xs font-bold text-slate-700">{faq.q}</p>
                      <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">{faq.a}</p>
                    </div>
                  ))}
                </div>

                {/* Önerilen araçlar */}
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">{t("help.toolsTitle")}</p>
                  <p className="mt-1.5 text-xs font-medium text-slate-500">{t("help.toolsBody")}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {["Adobe Acrobat", "SmallPDF", "ILovePDF"].map((tool) => (
                      <span key={tool} className="rounded-full border border-violet-200/70 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* bilgi şeridi */}
        <div className="mt-3 overflow-hidden rounded-lg border border-indigo-900/20 bg-gradient-to-r from-indigo-950 via-slate-900 to-sky-950 shadow-lg">
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-3">
            {[
              { icon: "🔒", title: t("info.secureTitle"), desc: t("info.secureDesc") },
              { icon: "🌐", title: t("info.multiTitle"), desc: t("info.multiDesc") },
              { icon: "📄", title: t("info.formatTitle"), desc: t("info.formatDesc") },
            ].map((item, i) => (
              <div key={item.title} className={`flex items-center gap-2 px-4 py-2 sm:flex-col sm:items-center sm:gap-1 sm:px-3 sm:py-2 sm:text-center ${i < 2 ? "sm:border-r sm:border-white/10" : ""}`}>
                <span className="text-sm shrink-0" aria-hidden>{item.icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-white">{item.title}</p>
                  <p className="text-[10px] font-medium leading-tight text-indigo-200/70">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Çevrilen Belgeler Modali ─────────────────────────────────────────── */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[32px] border border-white/80 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 rounded-t-[32px] border-b border-slate-100 px-7 py-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">{t("history.title")}</h2>
                <p className="mt-0.5 text-sm font-medium text-slate-400">
                  {t("history.subtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label={t("history.close")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>

            <div className="px-7 py-5">
              {historyLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600" />
                  <p className="mt-4 text-sm font-medium text-slate-400">{t("history.loading")}</p>
                </div>
              ) : historyJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
                    <BookOpen className="h-8 w-8" strokeWidth={1.75} />
                  </div>
                  <p className="mt-5 text-lg font-black text-slate-700">{t("history.emptyTitle")}</p>
                  <p className="mt-2 max-w-xs text-sm font-medium leading-relaxed text-slate-400">
                    {t("history.emptyBody")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(false)}
                    className="mt-7 inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 px-7 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5"
                  >
                    {t("history.upload")}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {historyJobs.map((job) => {
                    const isCompleted = job.status === "completed";
                    const isFailed    = job.status === "failed";
                    const isPending   = job.status === "pending" || job.status === "processing";
                    const jobLabel =
                      job.job_type === "pdf-to-turkce-word" ? t("cards.pdfToTurkishWord.title") : t("cards.pdfToWord.title");
                    const statusStyle = isCompleted
                      ? "bg-emerald-100 text-emerald-800"
                      : isFailed
                        ? "bg-rose-100 text-rose-800"
                        : "bg-slate-100 text-slate-600";
                    const statusLabel = isCompleted
                      ? t("history.statusCompleted")
                      : isFailed
                        ? t("history.statusFailed")
                        : t("history.statusProcessing");
                    const dateStr = formatDateTime(job.created_at, {
                      day: "2-digit", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    }, locale === "en" ? "en" : DEFAULT_LOCALE);

                    return (
                      <div key={job.id} className="flex flex-col gap-2 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-slate-800" title={job.file_name}>
                              {job.file_name}
                            </p>
                            <p className="mt-0.5 text-xs font-medium text-slate-400">
                              {jobLabel} · {dateStr}
                              {job.total_pages > 0 && t("history.pages", { count: job.total_pages })}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusStyle}`}>
                            {statusLabel}
                          </span>
                        </div>

                        {isPending && job.total_chunks > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-slate-500">
                              {t("job.progress", { done: String(job.done_chunks), total: String(job.total_chunks) })}
                            </p>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-sky-500 transition-all"
                                style={{ width: `${Math.round((job.done_chunks / job.total_chunks) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {isFailed && job.error_message && (
                          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                            {job.error_message}
                          </p>
                        )}

                        {isCompleted && job.downloadUrl && (
                          <a
                            href={job.downloadUrl}
                            download
                            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-xs font-bold text-white transition hover:bg-emerald-700 sm:w-auto sm:px-5"
                          >
                            <Download className="h-3.5 w-3.5" strokeWidth={2.25} />
                            {t("job.downloadDocx")}
                          </a>
                        )}

                        {isCompleted && !job.downloadUrl && (
                          <p className="text-xs font-medium text-slate-400">
                            {t("history.linkExpired")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
