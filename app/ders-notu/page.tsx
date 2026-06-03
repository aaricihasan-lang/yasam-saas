"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  FileCheck,
  FileDown,
  FileUp,
  Loader2,
  Sparkles,
} from "lucide-react";

const MAX_CHARS = 40_000;
const WARN_CHARS = 30_000;

// ── Yardımcı ──────────────────────────────────────────────────────────────────

function charCountColor(len: number): string {
  if (len > MAX_CHARS) return "text-red-600 font-bold";
  if (len > WARN_CHARS) return "text-amber-600 font-bold";
  return "text-slate-400";
}

// ── Bileşen ───────────────────────────────────────────────────────────────────

export default function DersNotuPage() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [downloadingWord, setDownloadingWord] = useState(false);

  // ── .txt dosya yükleme ─────────────────────────────────────────────────────

  function handleTxtUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === "string") setInputText(text);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  // ── İndirme yardımcıları ────────────────────────────────────────────────────

  function downloadTxt(text: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ders-notu.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleWordDownload() {
    if (!result || downloadingWord) return;
    setDownloadingWord(true);
    try {
      const form = new FormData();
      form.append("text", result);
      const res = await fetch("/api/ders-notu/to-word", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string };
        showToast({ title: "Hata", message: data.message ?? "Word dosyası oluşturulamadı.", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ders-notu.docx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      showToast({ title: "Bağlantı hatası", message: msg, type: "error" });
    } finally {
      setDownloadingWord(false);
    }
  }

  // ── Temizleme işlemi ───────────────────────────────────────────────────────

  async function handleSubmit() {
    const trimmed = inputText.trim();
    if (!trimmed || processing) return;

    if (trimmed.length > MAX_CHARS) {
      showToast({
        title: "Metin çok uzun",
        message: `Maksimum 40.000 karakter. Şu an: ${trimmed.length.toLocaleString("tr-TR")} karakter.`,
        type: "error",
      });
      return;
    }

    setProcessing(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("text", trimmed);
      const res = await fetch("/api/ders-notu/temizle", { method: "POST", body: form });

      if (!res.ok) {
        let errorMsg = `Sunucu hatası (HTTP ${res.status})`;
        try {
          const data = (await res.json()) as { message?: string };
          if (data.message) errorMsg = data.message;
        } catch { /* non-JSON hata */ }
        showToast({ title: "Hata", message: errorMsg, type: "error" });
        return;
      }

      const data = (await res.json()) as { success: boolean; text?: string; message?: string };
      if (!data.success || !data.text) {
        showToast({ title: "Hata", message: data.message ?? "Çıktı boş geldi.", type: "error" });
        return;
      }

      setResult(data.text);
      showToast({ title: "Tamamlandı", message: "Ders notu başarıyla temizlendi.", type: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      showToast({ title: "Bağlantı hatası", message: msg, type: "error" });
    } finally {
      setProcessing(false);
    }
  }

  const charLen = inputText.length;
  const isOverLimit = charLen > MAX_CHARS;
  const canSubmit = inputText.trim().length > 0 && !processing && !isOverLimit;

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#f0fdf4_0%,#ecfdf5_38%,#f0fdfa_70%,#f8fafc_100%)] text-slate-900 antialiased">
      {/* arka plan ışıkları */}
      <div className="pointer-events-none absolute -left-32 top-0 h-80 w-80 rounded-full bg-teal-300/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 top-[20%] h-72 w-72 rounded-full bg-emerald-300/18 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-[35%] h-64 w-64 rounded-full bg-cyan-300/15 blur-3xl" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-[1800px] px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pt-7">

        {/* nav */}
        <nav className="mb-8 flex items-center gap-4" aria-label="Üst navigasyon">
          <Link href="/"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-teal-200/80 bg-white/90 px-5 text-sm font-bold text-slate-700 shadow-sm no-underline transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            Ana Panele Dön
          </Link>
        </nav>

        {/* header */}
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-200/80 bg-teal-50/95 px-5 py-2 text-sm font-bold text-teal-800 shadow-sm">
            <ClipboardList className="h-4 w-4" aria-hidden />
            Transkript Düzenleme
          </div>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
            Temizlenmiş{" "}
            <span className="bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 bg-clip-text text-transparent">
              Ders Notu Merkezi
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Ham transkripti yapıştır veya TXT olarak yükle. Sistem gereksiz konuşmaları temizler, ders notuna dönüştürür — eğitmenin bilgisine dokunmadan.
          </p>
        </header>

        {/* Ana grid: mobil tek sütun, masaüstü iki sütun */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* ── Sol: Girdi ── */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-col rounded-[32px] border border-teal-200/70 bg-gradient-to-br from-teal-50/90 via-white to-emerald-50/80 p-6 shadow-md">

              {/* Başlık + TXT yükle */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-700 text-white shadow">
                    <BookOpen className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">Ham Transkript</p>
                    <p className="text-[11px] font-medium text-slate-500">Yapıştır veya TXT yükle</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-teal-200 bg-white px-3 text-xs font-bold text-teal-700 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow"
                >
                  <FileUp className="h-3.5 w-3.5" strokeWidth={2.25} />
                  TXT Yükle
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={handleTxtUpload}
                />
              </div>

              {/* Textarea */}
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ham transkripti buraya yapıştırın..."
                rows={20}
                className="mt-4 w-full resize-y rounded-2xl border border-teal-200/80 bg-white/90 px-4 py-3 text-sm font-medium leading-relaxed text-slate-700 placeholder-slate-400 shadow-sm transition focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />

              {/* Karakter sayacı */}
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className={`text-xs ${charCountColor(charLen)}`}>
                  {charLen.toLocaleString("tr-TR")} / {MAX_CHARS.toLocaleString("tr-TR")} karakter
                </span>
                {charLen > 0 && (
                  <button
                    type="button"
                    onClick={() => { setInputText(""); setResult(null); }}
                    className="text-xs font-bold text-slate-400 transition hover:text-slate-600"
                  >
                    Temizle
                  </button>
                )}
              </div>

              {/* Limit uyarısı */}
              {isOverLimit && (
                <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
                  Metin 40.000 karakter sınırını aşıyor ({(charLen - MAX_CHARS).toLocaleString("tr-TR")} karakter fazla). Lütfen kısaltın veya bölümlere ayırın.
                </p>
              )}

              {charLen > WARN_CHARS && !isOverLimit && (
                <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-700">
                  Uzun transkript — işlem birkaç dakika sürebilir. Sayfayı kapatmayın.
                </p>
              )}

              {/* İşlem butonu */}
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void handleSubmit()}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Temizleniyor...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" strokeWidth={2.25} />
                    Ders Notunu Temizle
                  </>
                )}
              </button>
            </div>

            {/* Bilgi kartı */}
            <div className="rounded-[24px] border border-teal-100 bg-white/80 px-6 py-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wider text-teal-600">Bu modül nedir?</p>
              <ul className="mt-3 space-y-2">
                {[
                  "Ham transkript temizlenir, ders notu formatına dönüştürülür",
                  "Eğitmenin bilgisine dokunulmaz — sadece gereksiz konuşmalar silinir",
                  "Human Design kanal ve kapı numaraları otomatik düzeltilir",
                  "Soru-cevap bölümleri korunur ve formatlanır",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs font-medium leading-relaxed text-slate-600">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" strokeWidth={2.5} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── Sağ: Sonuç ── */}
          <section className="flex flex-col">
            {result ? (
              <div className="flex flex-col rounded-[32px] border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/80 p-6 shadow-md">

                {/* Başlık */}
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow">
                    <Check className="h-5 w-5" strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">Temizlenmiş Ders Notu</p>
                    <p className="text-[11px] font-medium text-slate-500">
                      {result.length.toLocaleString("tr-TR")} karakter
                    </p>
                  </div>
                </div>

                {/* Sonuç metni */}
                <textarea
                  readOnly
                  value={result}
                  rows={20}
                  className="mt-4 w-full resize-y rounded-2xl border border-emerald-200/80 bg-white/90 px-4 py-3 text-sm font-medium leading-relaxed text-slate-700 shadow-sm focus:outline-none"
                />

                {/* Aksiyon butonları */}
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(result);
                      showToast({ title: "Kopyalandı", message: "Metin panoya kopyalandı.", type: "success" });
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white py-2.5 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />
                    Kopyala
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadTxt(result)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white py-2.5 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
                  >
                    <FileDown className="h-3.5 w-3.5" strokeWidth={2.25} />
                    TXT İndir
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleWordDownload()}
                    disabled={downloadingWord}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {downloadingWord ? (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <FileCheck className="h-3.5 w-3.5" strokeWidth={2.25} />
                    )}
                    Word İndir
                  </button>
                </div>
              </div>
            ) : (
              /* Boş durum */
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-[32px] border-2 border-dashed border-teal-200/70 bg-white/60 px-8 py-16 text-center lg:min-h-0">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-100 to-emerald-100 text-teal-400">
                  <ClipboardList className="h-8 w-8" strokeWidth={1.75} />
                </div>
                <p className="mt-5 text-base font-black text-slate-600">
                  {processing ? "İşleniyor..." : "Temizlenmiş not burada görünecek"}
                </p>
                <p className="mt-2 max-w-xs text-sm font-medium leading-relaxed text-slate-400">
                  {processing
                    ? "Yapay zekâ transkripti işliyor. Bu işlem birkaç dakika sürebilir."
                    : "Sol taraftaki alana transkripti yapıştırın ve «Ders Notunu Temizle» butonuna tıklayın."}
                </p>
                {processing && (
                  <Loader2 className="mt-6 h-8 w-8 animate-spin text-teal-500" />
                )}
              </div>
            )}
          </section>
        </div>

        {/* Bilgi şeridi */}
        <div className="mt-10 overflow-hidden rounded-[28px] border border-teal-900/20 bg-gradient-to-r from-teal-950 via-emerald-900 to-teal-950 shadow-lg">
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-3">
            {[
              { icon: "🎯", title: "Bilgi Korunur", desc: "Eğitmenin anlattıkları değiştirilmez, yalnızca gereksiz konuşmalar temizlenir." },
              { icon: "⚡", title: "Human Design Uyumlu", desc: "Kanal ve kapı numaraları, terimler otomatik olarak doğru yazılır." },
              { icon: "📄", title: "Word & TXT Çıktı", desc: "Temizlenmiş notu Word veya TXT formatında indirebilirsiniz." },
            ].map((item, i) => (
              <div key={item.title} className={`flex flex-col items-center gap-3 px-6 py-7 text-center ${i < 2 ? "sm:border-r sm:border-white/10" : ""}`}>
                <span className="text-3xl" aria-hidden>{item.icon}</span>
                <div>
                  <p className="text-sm font-black text-white">{item.title}</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-teal-200/80">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}
