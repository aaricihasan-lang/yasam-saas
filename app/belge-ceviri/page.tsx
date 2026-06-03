"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Clock,
  FileCheck,
  FileText,
  FileUp,
  Languages,
  ScanLine,
  X,
} from "lucide-react";

// ── Tipler ────────────────────────────────────────────────────────────────────

type CardId = "pdf-to-word" | "pdf-to-turkce-word" | "pdf-to-turkce-pdf" | "ocr";

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
    icon: <FileText className="h-7 w-7" strokeWidth={1.75} />,
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
    icon: <Languages className="h-7 w-7" strokeWidth={1.75} />,
    accept: ".pdf,application/pdf",
    acceptLabel: "PDF",
    gradient: "from-sky-50/90 via-white to-cyan-50/80",
    border: "border-sky-200/70",
    iconWrap: "from-sky-500 to-cyan-600",
    badge: "Aktif",
    badgeColor: "bg-green-100 text-green-700",
  },
  {
    id: "pdf-to-turkce-pdf",
    title: "PDF → Türkçe PDF",
    subtitle: "PDF belgesini Türkçeye çevir, PDF formatında indir.",
    icon: <FileCheck className="h-7 w-7" strokeWidth={1.75} />,
    accept: ".pdf,application/pdf",
    acceptLabel: "PDF",
    gradient: "from-emerald-50/90 via-white to-teal-50/80",
    border: "border-emerald-200/70",
    iconWrap: "from-emerald-500 to-teal-600",
    badge: "Yakında",
    badgeColor: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "ocr",
    title: "OCR Okuma",
    subtitle: "Taranmış PDF veya görüntüdeki yazıları dijital metne dönüştür.",
    icon: <ScanLine className="h-7 w-7" strokeWidth={1.75} />,
    accept: ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp",
    acceptLabel: "PDF / Görüntü",
    gradient: "from-amber-50/90 via-white to-orange-50/80",
    border: "border-amber-200/70",
    iconWrap: "from-amber-500 to-orange-500",
    badge: "Yakında",
    badgeColor: "bg-amber-100 text-amber-700",
  },
];

const ENDPOINT: Partial<Record<CardId, string>> = {
  "pdf-to-word": "/api/belge-ceviri/pdf-to-word",
  "pdf-to-turkce-word": "/api/belge-ceviri/pdf-to-turkce-word",
};

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const LARGE_FILE_BYTES = 3 * 1024 * 1024; // ~50+ sayfa heuristic

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

  const inputRefs = useRef<Record<CardId, HTMLInputElement | null>>({
    "pdf-to-word": null,
    "pdf-to-turkce-word": null,
    "pdf-to-turkce-pdf": null,
    ocr: null,
  });

  function handleFileChange(cardId: CardId, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFiles((prev) => ({ ...prev, [cardId]: file }));
    e.target.value = "";
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
      {/* arka plan ışıkları */}
      <div className="pointer-events-none absolute -left-32 top-0 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 top-[20%] h-72 w-72 rounded-full bg-sky-300/18 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-[30%] h-64 w-64 rounded-full bg-emerald-300/15 blur-3xl" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-[1800px] px-4 pb-24 pt-5 sm:px-6 lg:px-6 xl:px-8 2xl:px-10 lg:pt-7">

        {/* nav */}
        <nav className="mb-8 flex items-center justify-between gap-4" aria-label="Üst navigasyon">
          <Link href="/"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-violet-200/80 bg-white/90 px-5 text-sm font-bold text-slate-700 shadow-sm no-underline transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md">
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            Ana Panele Dön
          </Link>

          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-5 text-sm font-bold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            <Clock className="h-4 w-4" strokeWidth={2.25} />
            Çevrilen Belgeler
          </button>
        </nav>

        {/* header */}
        <header className="mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50/95 px-5 py-2 text-sm font-bold text-sky-800 shadow-sm">
            <BookOpen className="h-4 w-4" aria-hidden />
            Belge Dönüştürme ve Çeviri
          </div>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
            Belge{" "}
            <span className="bg-gradient-to-r from-sky-600 via-violet-600 to-emerald-600 bg-clip-text text-transparent">
              Çeviri Merkezi
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            PDF belgelerini dönüştür, farklı dillere çevir, taranmış metinleri oku. Tüm işlemler güvenli sunucuda gerçekleşir.
          </p>
        </header>

        {/* 4 kart — masaüstü 4 sütun, tablet 2 sütun, mobil tek sütun */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {CARDS.map((card) => {
            const file = selectedFiles[card.id];
            const disabled = isDisabled(card.id);
            return (
              <div
                key={card.id}
                className={`flex flex-col rounded-[32px] border bg-gradient-to-br p-7 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg ${card.gradient} ${card.border}`}
              >
                {/* ikon + badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md ${card.iconWrap}`}>
                    {card.icon}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${card.badgeColor}`}>
                    {card.badge}
                  </span>
                </div>

                {/* başlık */}
                <h2 className="mt-5 text-xl font-black text-slate-900">{card.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{card.subtitle}</p>

                {/* dosya seçici alanı */}
                <div className="mt-6 space-y-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => inputRefs.current[card.id]?.click()}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-slate-300/70 bg-white/60 px-5 py-4 text-sm font-bold text-slate-500 transition hover:border-slate-400/80 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="flex items-center gap-2">
                      <FileUp className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                      {file ? "Dosyayı Değiştir" : `${card.acceptLabel} Seç`}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                  </button>

                  {file && !disabled && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/80 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Seçilen Dosya
                        </p>
                        <p className="mt-0.5 truncate text-sm font-bold text-slate-700" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[11px] font-medium text-slate-400">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => clearFile(card.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
                        aria-label="Dosyayı kaldır"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
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
                  <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Çeviri Modu
                    </p>
                    <div className="flex flex-col gap-2">
                      {(["standard", "academic"] as const).map((m) => (
                        <label
                          key={m}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 transition ${
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
                            <p className="text-sm font-bold text-slate-800">
                              {m === "standard" ? "Standart Çeviri" : "Akademik Çeviri"}
                            </p>
                            <p className="text-[11px] font-medium text-slate-500">
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
                {file && !disabled && file.size > MAX_FILE_BYTES && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium leading-relaxed text-amber-800">
                    Bu işlem için maksimum dosya boyutu 50 MB. Büyük PDF dosyaları için yakında Büyük Dosya Modu eklenecek.
                  </p>
                )}
                {file && !disabled && card.id === "pdf-to-turkce-word" && file.size > LARGE_FILE_BYTES && file.size <= MAX_FILE_BYTES && (
                  <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs font-medium leading-relaxed text-sky-800">
                    Bu belge büyük olduğu için çeviri uzun sürebilir. İşlem sırasında sayfayı kapatmayın.
                  </p>
                )}

                {/* işlem başlat butonu */}
                <button
                  type="button"
                  disabled={!file || !!submitting || disabled || (!!file && file.size > MAX_FILE_BYTES)}
                  onClick={() => void handleSubmit(card.id)}
                  className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-700 to-slate-800 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
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
                      {card.id === "pdf-to-turkce-pdf" && "Türkçeye Çevir + PDF"}
                      {card.id === "ocr" && "Metni Oku"}
                    </>
                  )}
                </button>

                {isDisabled(card.id) && (
                  <p className="mt-2 text-center text-xs font-medium text-slate-400">
                    Bu özellik yakında aktif olacak.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* bilgi şeridi */}
        <div className="mt-10 overflow-hidden rounded-[28px] border border-indigo-900/20 bg-gradient-to-r from-indigo-950 via-slate-900 to-sky-950 shadow-lg">
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-3">
            {[
              { icon: "🔒", title: "Güvenli İşlem", desc: "Belgeler işlem sonrası sunucudan silinir." },
              { icon: "🌐", title: "Çoklu Dil", desc: "İngilizce, Almanca, Fransızca ve daha fazlası." },
              { icon: "📄", title: "Format Koruma", desc: "Çeviri sonrası belge formatı korunur." },
            ].map((item, i) => (
              <div key={item.title} className={`flex flex-col items-center gap-3 px-6 py-7 text-center ${i < 2 ? "sm:border-r sm:border-white/10" : ""}`}>
                <span className="text-3xl" aria-hidden>{item.icon}</span>
                <div>
                  <p className="text-sm font-black text-white">{item.title}</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-indigo-200/80">{item.desc}</p>
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

            <div className="flex flex-col items-center justify-center px-7 py-20 text-center">
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
