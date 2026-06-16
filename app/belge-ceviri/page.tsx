"use client";

import Link from "next/link";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  ArrowLeft,
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

type ActiveJob = {
  jobId: string;
  cardId: CardId;
  status: JobStatus;
  doneChunks: number;
  totalChunks: number;
  downloadUrl: string | null;
  errorMessage: string | null;
};

type CardDef = {
  id: CardId;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accept: string;
  acceptLabel: string;
  gradient: string;
  border: string;
  iconWrap: string;
  badge: string;
  badgeColor: string;
};

// ── Kart tanımları ────────────────────────────────────────────────────────────

const CARDS: CardDef[] = [
  {
    id: "pdf-to-word",
    title: "PDF → Word",
    subtitle: "PDF belgeni düzenlenebilir Word dosyasına dönüştür.",
    icon: <FileText className="h-5 w-5" strokeWidth={1.75} />,
    accept: ".pdf,application/pdf",
    acceptLabel: "PDF",
    gradient: "from-violet-50/90 via-white to-indigo-50/80",
    border: "border-violet-200/70",
    iconWrap: "from-violet-500 to-indigo-600",
    badge: "Aktif",
    badgeColor: "bg-green-100 text-green-700",
  },
  {
    id: "pdf-to-turkce-word",
    title: "PDF → Türkçe Word",
    subtitle: "PDF içeriğini Türkçeye çevir, düzenlenebilir Word belgesi olarak indir.",
    icon: <Languages className="h-5 w-5" strokeWidth={1.75} />,
    accept: ".pdf,application/pdf",
    acceptLabel: "PDF",
    gradient: "from-sky-50/90 via-white to-cyan-50/80",
    border: "border-sky-200/70",
    iconWrap: "from-sky-500 to-cyan-600",
    badge: "Aktif",
    badgeColor: "bg-green-100 text-green-700",
  },
  {
    id: "ocr",
    title: "📷 Görsel OCR",
    subtitle: "Fotoğraf veya ekran görüntüsündeki yazıları dijital metne dönüştürün. PNG, JPG, WEBP desteklenir.",
    icon: <ScanLine className="h-5 w-5" strokeWidth={1.75} />,
    accept: ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp",
    acceptLabel: "Görüntü",
    gradient: "from-amber-50/90 via-white to-orange-50/80",
    border: "border-amber-200/70",
    iconWrap: "from-amber-500 to-orange-500",
    badge: "Aktif",
    badgeColor: "bg-green-100 text-green-700",
  },
];

const ENDPOINT: Partial<Record<CardId, string>> = {
  "pdf-to-word": "/api/belge-ceviri/pdf-to-word",
  "pdf-to-turkce-word": "/api/belge-ceviri/pdf-to-turkce-word",
  "ocr": "/api/belge-ceviri/ocr",
};

const MAX_FILE_BYTES = 50 * 1024 * 1024;        // 50 MB — sunucu limiti
const LARGE_FILE_BYTES = 3 * 1024 * 1024;       // ~50+ sayfa heuristic (çeviri uyarısı)
const RECOMMENDED_MAX_BYTES = 80 * 1024 * 1024; // 80 MB — önerilen üst sınır (bilgilendirme)

// ── Bileşen ───────────────────────────────────────────────────────────────────

export default function BelgeCeviriPage() {
  const { showToast } = useToast();

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

  // Job polling — 3 saniyede bir durum kontrolü
  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === "completed" || activeJob.status === "failed") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/belge-ceviri/job-status/${activeJob.jobId}`);
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

  function downloadTxt(text: string, filename = "ocr-metin.txt") {
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

  async function handleOcrWordDownload(text: string, which: "original" | "translation", filename = "ocr-metin.docx") {
    if (downloadingWord) return;
    setDownloadingWord(which);
    try {
      const form = new FormData();
      form.append("text", text);
      const res = await fetch("/api/belge-ceviri/ocr-to-word", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string };
        showToast({ title: "Hata", message: data.message ?? "Word dosyası oluşturulamadı.", type: "error" });
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
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      showToast({ title: "Bağlantı hatası", message: msg, type: "error" });
    } finally {
      setDownloadingWord(null);
    }
  }

  function clearFile(cardId: CardId) {
    setSelectedFiles((prev) => ({ ...prev, [cardId]: null }));
  }

  async function handleSubmit(cardId: CardId) {
    const file = selectedFiles[cardId];
    const endpoint = ENDPOINT[cardId];
    if (!file || !endpoint || submitting) return;

    setSubmitting(cardId);
    try {
      const form = new FormData();
      form.append("file", file);
      if (cardId === "pdf-to-turkce-word") {
        form.append("mode", translationMode);
      }

      const res = await fetch(endpoint, { method: "POST", body: form });

      if (!res.ok) {
        let errorMsg = `Sunucu hatası (HTTP ${res.status})`;
        try {
          const data = (await res.json()) as { message?: string };
          if (data.message) errorMsg = data.message;
        } catch {
          // non-JSON hata sayfası (örn. Vercel 500 HTML)
        }
        showToast({ title: "Hata", message: errorMsg, type: "error" });
        return;
      }

      // PDF → Türkçe Word: async job akışı
      if (cardId === "pdf-to-turkce-word") {
        const data = (await res.json()) as {
          success: boolean;
          jobId?: string;
          totalPages?: number;
          message?: string;
        };
        if (!data.success || !data.jobId) {
          showToast({ title: "Hata", message: data.message ?? "Bilinmeyen hata", type: "error" });
          return;
        }
        setActiveJob({
          jobId: data.jobId,
          cardId,
          status: "pending",
          doneChunks: 0,
          totalChunks: 0,
          downloadUrl: null,
          errorMessage: null,
        });
        clearFile(cardId);
        showToast({
          title: "Kuyruğa alındı",
          message: `${data.totalPages ?? "?"} sayfalık belge çeviri kuyruğuna eklendi.`,
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
          message?: string;
        };
        if (!data.success || !data.text) {
          showToast({ title: "Hata", message: data.message ?? "Metin çıkarılamadı.", type: "error" });
          return;
        }
        setOcrResult({ text: data.text, isTurkish: data.isTurkish ?? true, translation: data.translation });
        clearFile(cardId);
        showToast({ title: "Başarılı", message: "Metin başarıyla çıkarıldı.", type: "success" });
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
        showToast({ title: "Başarılı", message: "Dosya oluşturuldu ve indirildi.", type: "success" });
        clearFile(cardId);
      } else {
        const data = (await res.json()) as { success: boolean; message: string };
        if (data.success) {
          showToast({ title: "Başarılı", message: data.message, type: "success" });
          clearFile(cardId);
        } else {
          showToast({ title: "Hata", message: data.message, type: "error" });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      showToast({ title: "Bağlantı hatası", message: msg, type: "error" });
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

      <div className="relative z-10 mx-auto w-full max-w-[1400px] min-w-0 px-4 pb-6 pt-4 sm:px-6 sm:pb-8 lg:px-8">

        {/* hero — rozet + başlık + buton tek satırda */}
        <header className="mb-2 sm:mb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50/95 px-2.5 py-0.5 text-[10px] font-bold text-sky-800 shadow-sm">
                <BookOpen className="h-3 w-3" aria-hidden />
                Belge Dönüştürme ve Çeviri
              </div>
              <h1 className="mt-1 text-xl font-black leading-tight tracking-tight text-slate-950 sm:text-2xl">
                Belge{" "}
                <span className="bg-gradient-to-r from-sky-600 via-violet-600 to-emerald-600 bg-clip-text text-transparent">
                  Çeviri Merkezi
                </span>
              </h1>
              <p className="mt-0.5 max-w-[700px] text-[11px] leading-relaxed text-slate-500 sm:text-xs">
                PDF belgelerini dönüştür, farklı dillere çevir, taranmış metinleri oku. Tüm işlemler güvenli sunucuda gerçekleşir.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex h-8 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white/90 px-3 text-[11px] font-bold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:w-auto"
            >
              <Clock className="h-3 w-3" strokeWidth={2.25} />
              Çevrilen Belgeler
            </button>
          </div>
        </header>

        {/* kartlar — lg+ 3 sütun, sm 2 sütun, mobil tek sütun */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => {
            const file = selectedFiles[card.id];
            const disabled = isDisabled(card.id);
            return (
              <div
                key={card.id}
                className={`flex flex-col rounded-xl border bg-gradient-to-br p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.gradient} ${card.border}`}
              >
                {/* ikon + badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm ${card.iconWrap}`}>
                    {card.icon}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${card.badgeColor}`}>
                    {card.badge}
                  </span>
                </div>

                {/* başlık */}
                <h2 className="mt-2 text-sm font-black text-slate-900">{card.title}</h2>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{card.subtitle}</p>

                {/* dosya seçici alanı */}
                <div className="mt-2 space-y-1.5">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => inputRefs.current[card.id]?.click()}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300/70 bg-white/60 px-3 py-2 text-[11px] font-bold text-slate-500 transition hover:border-slate-400/80 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="flex items-center gap-1.5">
                      <FileUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                      {file ? "Dosyayı Değiştir" : `${card.acceptLabel} Seç`}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                  </button>

                  {file && !disabled && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Seçilen Dosya
                        </p>
                        <p className="mt-0.5 truncate text-[11px] font-bold text-slate-700" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[10px] font-medium text-slate-400">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => clearFile(card.id)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
                        aria-label="Dosyayı kaldır"
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
                  <div className="mt-1.5 rounded-lg border border-slate-200/80 bg-white/70 p-1.5">
                    <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Çeviri Modu
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {(["standard", "academic"] as const).map((m) => (
                        <label
                          key={m}
                          className={`flex cursor-pointer items-start gap-1.5 rounded-md px-1.5 py-1 transition ${
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
                            className="mt-0.5 accent-slate-800"
                          />
                          <div>
                            <p className="text-[11px] font-bold text-slate-800">
                              {m === "standard" ? "Standart Çeviri" : "Akademik Çeviri"}
                            </p>
                            <p className="text-[10px] font-medium text-slate-500">
                              {m === "standard"
                                ? "gpt-4o-mini · Hızlı ve ekonomik"
                                : "gpt-4.1 · Kitap, tez ve araştırma metinleri"}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* boyut uyarıları */}
                {file && !disabled && file.size > RECOMMENDED_MAX_BYTES && (
                  <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-1.5 text-[11px] font-medium leading-relaxed text-yellow-800">
                    Bu PDF 80 MB üzerindedir. Yükleme devam edebilir ancak büyük dosyalarda yükleme süresi uzayabilir. Sorun yaşarsanız PDF'i sıkıştırmanız önerilir.
                  </p>
                )}
                {file && !disabled && card.id === "pdf-to-turkce-word" && file.size > LARGE_FILE_BYTES && file.size <= RECOMMENDED_MAX_BYTES && (
                  <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-medium leading-relaxed text-sky-800">
                    Bu belge büyük olduğu için çeviri uzun sürebilir. İşlem sırasında sayfayı kapatmayın.
                  </p>
                )}

                {/* işlem başlat butonu */}
                <button
                  type="button"
                  disabled={!file || !!submitting || disabled || (card.id === "pdf-to-turkce-word" && !!activeJob && activeJob.status !== "completed" && activeJob.status !== "failed")}
                  onClick={() => void handleSubmit(card.id)}
                  className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-slate-900 via-slate-700 to-slate-800 text-[11px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {submitting === card.id ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      {card.id === "pdf-to-turkce-word" ? "Çeviriliyor..." : "İşleniyor..."}
                    </>
                  ) : (
                    <>
                      {card.id === "pdf-to-word" && "Word'e Dönüştür"}
                      {card.id === "pdf-to-turkce-word" && "Türkçeye Çevir + Word"}
                      {card.id === "ocr" && "Metni Oku"}
                    </>
                  )}
                </button>

                {isDisabled(card.id) && (
                  <p className="mt-2 text-center text-xs font-medium text-slate-400">
                    Bu özellik yakında aktif olacak.
                  </p>
                )}

                {/* OCR sonuç paneli */}
                {card.id === "ocr" && ocrResult && (
                  <div className="mt-3 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">

                    {/* Başlık + kapat */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-amber-800">Çıkarılan Metin</p>
                      <button
                        type="button"
                        onClick={() => setOcrResult(null)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-400 transition hover:bg-amber-50"
                        aria-label="Sonucu kapat"
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
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(ocrResult.text);
                          showToast({ title: "Kopyalandı", message: "Metin panoya kopyalandı.", type: "success" });
                        }}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-white py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
                      >
                        <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />
                        Kopyala
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTxt(ocrResult.text)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-white py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
                      >
                        <FileDown className="h-3.5 w-3.5" strokeWidth={2.25} />
                        TXT İndir
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
                        Word İndir
                      </button>
                    </div>

                    {/* Dil durumu ve çeviri */}
                    {ocrResult.isTurkish ? (
                      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                        Metin Türkçe görünüyor — çeviri yapılmadı.
                      </p>
                    ) : ocrResult.translation ? (
                      <div className="space-y-2 border-t border-amber-200 pt-3">
                        <p className="text-sm font-bold text-amber-800">Türkçe Çeviri</p>

                        <textarea
                          readOnly
                          value={ocrResult.translation}
                          rows={8}
                          className="w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm font-medium leading-relaxed text-slate-700 focus:outline-none"
                        />

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(ocrResult.translation ?? "");
                              showToast({ title: "Kopyalandı", message: "Çeviri panoya kopyalandı.", type: "success" });
                            }}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-white py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
                          >
                            <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />
                            Çeviriyi Kopyala
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadTxt(ocrResult.translation ?? "", "ocr-ceviri.txt")}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-white py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
                          >
                            <FileDown className="h-3.5 w-3.5" strokeWidth={2.25} />
                            TXT İndir
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleOcrWordDownload(ocrResult.translation ?? "", "translation", "ocr-ceviri.docx")}
                            disabled={downloadingWord === "translation"}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2 text-xs font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
                          >
                            {downloadingWord === "translation" ? (
                              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            ) : (
                              <FileCheck className="h-3.5 w-3.5" strokeWidth={2.25} />
                            )}
                            Word İndir
                          </button>
                        </div>
                      </div>
                    ) : (
                      // isTurkish=false ama çeviri gelmedi (API hatası)
                      !ocrResult.isTurkish && (
                        <p className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700">
                          Metin yabancı dilde görünüyor ancak çeviri alınamadı. Lütfen tekrar deneyin.
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
                          <p className="text-sm font-bold text-slate-700">Kuyruğa alındı...</p>
                        )}
                        {activeJob.status === "processing" && (
                          <>
                            <p className="text-sm font-bold text-sky-700">Çevriliyor...</p>
                            {activeJob.totalChunks > 0 && (
                              <p className="mt-0.5 text-xs font-medium text-slate-500">
                                {activeJob.doneChunks} / {activeJob.totalChunks} bölüm tamamlandı
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
                            <p className="text-sm font-bold text-emerald-700">Çeviri tamamlandı</p>
                          </div>
                        )}
                        {activeJob.status === "failed" && (
                          <p className="text-sm font-bold text-red-600">
                            Hata: {activeJob.errorMessage ?? "Bilinmeyen hata"}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveJob(null)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 transition hover:bg-slate-100"
                        aria-label="Kapat"
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
                        DOCX İndir
                      </a>
                    )}

                    {(activeJob.status === "pending" || activeJob.status === "processing") && (
                      <p className="mt-2 text-[11px] font-medium text-slate-400">
                        Sayfayı kapatmayın — işlem arka planda devam ediyor.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Büyük PDF Yardım Accordion */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200/70 bg-white/80 px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
          >
            <span className="text-base">📄</span>
            Büyük PDF Yardımı
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${helpOpen ? "rotate-180" : ""}`}
              strokeWidth={2.25}
            />
          </button>

          {helpOpen && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-violet-100 bg-white/90 shadow-md">
              <div className="px-5 py-4">
                <h3 className="text-base font-black text-slate-900">📄 Büyük PDF Yükleme Rehberi</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Belge Çeviri Merkezi yüksek boyutlu PDF dosyalarını çevirebilir. Ancak bazı PDF'ler yüksek
                  çözünürlüklü taramalar ve büyük görseller nedeniyle çok yüksek dosya boyutlarına ulaşabilir.
                </p>
                <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-bold text-emerald-700">
                  Önerilen PDF boyutu: 80 MB ve altı
                </div>

                <div className="mt-5 space-y-4">
                  {/* Bölüm 1 — PDF Sıkıştırma */}
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-700">1</div>
                    <div>
                      <p className="text-sm font-black text-slate-800">PDF Sıkıştırma</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">Windows Kullanıcıları İçin:</p>
                      <ol className="mt-1.5 space-y-1">
                        {[
                          "PDF dosyanızı bilgisayarınıza kaydedin.",
                          "Bir PDF sıkıştırma aracı açın.",
                          "Orta Kalite veya Yüksek Kalite seçeneğini tercih edin.",
                          "Yeni PDF dosyasını kaydedin.",
                          "Yeni PDF dosyasını sisteme tekrar yükleyin.",
                        ].map((step, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs font-medium text-slate-600">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-500">{i + 1}</span>
                            {step}
                          </li>
                        ))}
                      </ol>
                      <p className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs font-medium leading-relaxed text-emerald-700">
                        Çoğu durumda 100–200 MB boyutundaki PDF dosyaları kalite kaybı yaşamadan çok daha düşük boyutlara indirilebilir.
                      </p>
                    </div>
                  </div>

                  {/* Bölüm 2 — PDF'i Bölümlere Ayırma */}
                  <div className="flex gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-700">2</div>
                    <div>
                      <p className="text-sm font-black text-slate-800">PDF'i Bölümlere Ayırma</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-600">Büyük PDF'leri birkaç parçaya bölerek ayrı ayrı çevirebilirsiniz.</p>
                      <ul className="mt-1.5 space-y-0.5">
                        {["1–100 sayfa", "101–200 sayfa", "201–300 sayfa"].map((l) => (
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
                      <p className="text-sm font-black text-slate-800">Görsel Kalitesini Azaltma</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-600">Bazı PDF'lerde dosya boyutunu yüksek çözünürlüklü görseller oluşturur. PDF optimizasyonu sonrasında aynı içerik çok daha düşük boyutlarda yüklenebilir.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-5">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">Sık Sorulan Sorular</p>
                  {[
                    {
                      q: "PDF'im çok büyük. Çevrilir mi?",
                      a: "Çoğu durumda evet. Ancak büyük dosyalarda yükleme süresi uzayabilir.",
                    },
                    {
                      q: "Taranmış kitapları çevirebilir miyim?",
                      a: "Evet. Sistem OCR kullanarak metni algılamaya çalışır.",
                    },
                    {
                      q: "Tablolu PDF'leri çevirebilir miyim?",
                      a: "Evet. Basit tablolar genellikle korunur. Karmaşık tablolarda düzen farklılıkları oluşabilir.",
                    },
                  ].map((faq) => (
                    <div key={faq.q} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                      <p className="text-xs font-bold text-slate-700">{faq.q}</p>
                      <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">{faq.a}</p>
                    </div>
                  ))}
                </div>

                {/* Önerilen araçlar */}
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">📌 Önerilen PDF Sıkıştırma Araçları</p>
                  <p className="mt-1.5 text-xs font-medium text-slate-500">Bu araçlar PDF dosyalarının boyutunu azaltmak için kullanılabilir.</p>
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
        <div className="mt-4 overflow-hidden rounded-xl border border-indigo-900/20 bg-gradient-to-r from-indigo-950 via-slate-900 to-sky-950 shadow-lg">
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-3">
            {[
              { icon: "🔒", title: "Güvenli İşlem", desc: "Belgeler işlem sonrası sunucudan silinir." },
              { icon: "🌐", title: "Çoklu Dil", desc: "İngilizce, Almanca, Fransızca ve daha fazlası." },
              { icon: "📄", title: "Format Koruma", desc: "Çeviri sonrası belge formatı korunur." },
            ].map((item, i) => (
              <div key={item.title} className={`flex items-center gap-3 px-4 py-3 sm:flex-col sm:items-center sm:gap-1 sm:px-3 sm:py-3 sm:text-center ${i < 2 ? "sm:border-r sm:border-white/10" : ""}`}>
                <span className="text-base shrink-0" aria-hidden>{item.icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-white">{item.title}</p>
                  <p className="mt-0.5 text-[10px] font-medium leading-relaxed text-indigo-200/80">{item.desc}</p>
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
                <h2 className="text-xl font-black text-slate-900">Çevrilen Belgeler</h2>
                <p className="mt-0.5 text-sm font-medium text-slate-400">
                  Daha önce dönüştürdüğünüz veya çevirdiğiniz belgeler
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>

            <div className="flex flex-col items-center justify-center px-7 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
                <BookOpen className="h-8 w-8" strokeWidth={1.75} />
              </div>
              <p className="mt-5 text-lg font-black text-slate-700">Henüz çevrilmiş belge yok.</p>
              <p className="mt-2 max-w-xs text-sm font-medium leading-relaxed text-slate-400">
                PDF dosyanızı yükleyip dönüştürdükten sonra kayıtlar burada görünecek.
              </p>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="mt-7 inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 px-7 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5"
              >
                Belge Yükle
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
