"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  FileText,
  Loader2,
  UploadCloud,
  Video,
} from "lucide-react";

const STEPS = [
  { icon: "🎬", label: "Video yüklenir" },
  { icon: "🎙️", label: "Ses metne çevrilir" },
  { icon: "🌐", label: "Türkçeye çevrilir" },
  { icon: "📄", label: "Word ve PDF oluşturulur" },
];

const PLACEHOLDER_JOBS = [
  { label: "Örnek kayıt 1", status: "completed", date: "—" },
  { label: "Örnek kayıt 2", status: "transcribing", date: "—" },
  { label: "Örnek kayıt 3", status: "failed", date: "—" },
];

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
  transcribing: "bg-violet-100 text-violet-800 ring-violet-200/80",
  translating: "bg-blue-100 text-blue-800 ring-blue-200/80",
  generating: "bg-amber-100 text-amber-800 ring-amber-200/80",
  uploaded: "bg-slate-100 text-slate-700 ring-slate-200/80",
  failed: "bg-rose-100 text-rose-800 ring-rose-200/80",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Tamamlandı",
  transcribing: "Metne çevriliyor…",
  translating: "Türkçeye çevriliyor…",
  generating: "Dosya oluşturuluyor…",
  uploaded: "Yüklendi",
  failed: "Başarısız",
};

export default function VideoCeviriPage() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      {/* arka plan ışıkları */}
      <div
        className="pointer-events-none absolute -left-32 top-0 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 top-[20%] h-72 w-72 rounded-full bg-cyan-300/18 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-[30%] h-64 w-64 rounded-full bg-fuchsia-300/15 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pt-7">

        {/* üst nav */}
        <nav className="mb-8 flex items-center gap-3" aria-label="Üst navigasyon">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-violet-200/80 bg-white/90 px-5 text-sm font-bold text-slate-700 shadow-sm no-underline transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            Ana Panele Dön
          </Link>
        </nav>

        {/* başlık */}
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

        {/* işlem adımları */}
        <section
          className="mb-10 overflow-hidden rounded-[28px] border border-indigo-900/20 bg-gradient-to-r from-indigo-950 via-violet-950 to-indigo-900 shadow-lg"
          aria-label="İşlem adımları"
        >
          <div className="grid grid-cols-2 gap-0 sm:grid-cols-4">
            {STEPS.map((step, i) => (
              <div
                key={step.label}
                className={`flex flex-col items-center gap-3 px-5 py-6 text-center ${
                  i < STEPS.length - 1
                    ? "sm:border-r sm:border-white/10"
                    : ""
                }`}
              >
                <span className="text-3xl" aria-hidden>
                  {step.icon}
                </span>
                <p className="text-sm font-bold leading-snug text-indigo-100/90">
                  <span className="mr-1.5 text-xs font-black text-white/50">
                    {i + 1}.
                  </span>
                  {step.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">

          {/* video yükleme alanı */}
          <section aria-labelledby="upload-heading">
            <div className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-md sm:p-8">
              <h2
                id="upload-heading"
                className="mb-5 flex items-center gap-2.5 text-xl font-black text-slate-900"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md">
                  <UploadCloud className="h-5 w-5" strokeWidth={2.25} />
                </span>
                Video Yükle
              </h2>

              {/* sürükle-bırak placeholder */}
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-violet-200/90 bg-gradient-to-br from-violet-50/80 to-indigo-50/60 px-6 py-10 text-center transition hover:border-violet-300">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 text-violet-600 shadow-sm">
                  <Video className="h-8 w-8" strokeWidth={1.75} />
                </div>
                <p className="text-base font-black text-slate-700">
                  Videoyu buraya sürükleyin
                </p>
                <p className="mt-1.5 text-sm font-medium text-slate-500">
                  veya dosya seçin
                </p>
                <p className="mt-4 text-xs font-semibold text-slate-400">
                  MP4, MOV, WEBM, MKV — maks. 200 MB
                </p>

                {/* disabled placeholder button */}
                <button
                  type="button"
                  disabled
                  className="mt-6 inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 px-6 text-sm font-bold text-white opacity-50 shadow-md"
                >
                  <UploadCloud className="h-4 w-4" strokeWidth={2.25} />
                  Dosya Seç
                </button>
              </div>

              {/* ayarlar placeholder */}
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Kaynak Dil
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-700">
                    Otomatik Algıla
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Çıktı Formatı
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-700">
                    Word + PDF
                  </p>
                </div>
              </div>

              {/* submit placeholder */}
              <button
                type="button"
                disabled
                className="mt-5 flex h-14 w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 text-base font-bold text-white opacity-40 shadow-xl"
              >
                <Loader2 className="h-5 w-5" strokeWidth={2.25} />
                İşlem Başlat
              </button>
            </div>
          </section>

          {/* sağ sütun */}
          <div className="flex flex-col gap-6">

            {/* bilgi kartı */}
            <div className="rounded-[28px] border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/80 p-6 shadow-md">
              <h3 className="mb-4 flex items-center gap-2.5 text-lg font-black text-slate-900">
                <span className="text-xl" aria-hidden>🔒</span>
                Gizlilik & Güvenlik
              </h3>
              <ul className="space-y-2.5 text-sm font-medium leading-relaxed text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600" aria-hidden>✓</span>
                  Yüklenen video işlem sonrası otomatik silinir
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600" aria-hidden>✓</span>
                  Metin ve çeviriler yalnızca size aittir
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600" aria-hidden>✓</span>
                  Yönetici içeriklerinize erişemez
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600" aria-hidden>✓</span>
                  Word ve PDF isteğe bağlı kaydedilebilir
                </li>
              </ul>
            </div>

            {/* format bilgi kartı */}
            <div className="rounded-[28px] border border-violet-200/70 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/80 p-6 shadow-md">
              <h3 className="mb-4 flex items-center gap-2.5 text-lg font-black text-slate-900">
                <FileText className="h-5 w-5 text-violet-600" strokeWidth={2.25} />
                Desteklenen Formatlar
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {["MP4", "MOV", "WEBM", "MKV", "AVI", "OGG"].map((fmt) => (
                  <div
                    key={fmt}
                    className="rounded-xl border border-violet-100 bg-white/80 px-3 py-2 text-center text-xs font-black text-violet-700"
                  >
                    {fmt}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs font-medium text-slate-500">
                Maksimum dosya boyutu: 200 MB
              </p>
            </div>
          </div>
        </div>

        {/* iş geçmişi */}
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

            {/* placeholder satırlar */}
            <div className="space-y-3">
              {PLACEHOLDER_JOBS.map((job, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100/90 bg-slate-50/70 px-5 py-4 opacity-40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-500">
                      <Video className="h-5 w-5" strokeWidth={1.75} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-700">
                        {job.label}
                      </p>
                      <p className="text-xs font-medium text-slate-400">
                        {job.date}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${
                      STATUS_STYLE[job.status] ?? STATUS_STYLE.uploaded
                    }`}
                  >
                    {STATUS_LABEL[job.status] ?? job.status}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-6 text-center text-sm font-medium text-slate-400">
              İşlem geçmişi buraya yüklenecek.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
