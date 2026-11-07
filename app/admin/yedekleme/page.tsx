"use client";

import Link from "next/link";
import { CloudUpload, Info, Settings } from "lucide-react";
import {
  AccessDeniedScreen,
  LoadingScreen,
  useSistemSagligiAdminGate,
} from "@/app/admin/sistem-sagligi/detail-shared";

/**
 * Yedekleme Merkezi — salt-okunur bilgilendirme ekranı.
 *
 * Uygulama içinde doğrulanabilir bir yedek kaydı (tarih / başarı / boyut) kaynağı YOKTUR;
 * bu yüzden ekran yedek tarihi, durum veya boyut ÜRETMEZ ve yedek alma/geri yükleme
 * eylemi sunmaz. Mevcut gerçek yedekleme altyapısı (uzmanın Ayarlar ekranındaki Sistem
 * Yedeği / Geri Yükleme) değişmeden yalnız tanıtılır.
 */
const facts = [
  {
    title: "Uzman yedeği",
    desc: "Her uzman kendi çalışma alanının yedeğini Ayarlar → Sistem Yedeği sekmesinden indirir.",
  },
  {
    title: "Geri yükleme",
    desc: "Geri yükleme yalnız uzmanın kendi hesabında, Ayarlar → Geri Yükleme sekmesinden yapılır.",
  },
  {
    title: "Yönetici ekranı",
    desc: "Bu ekran yedek almaz ve geri yükleme başlatmaz; kayıtlara dokunmaz.",
  },
] as const;

export default function YedeklemePage() {
  const { checked, allowed } = useSistemSagligiAdminGate();

  if (!checked) return <LoadingScreen />;
  if (!allowed) return <AccessDeniedScreen />;

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <header className="relative mb-6 overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-r from-slate-900 via-sky-900 to-cyan-800 px-6 py-6 text-white shadow-[0_16px_48px_rgba(88,28,135,0.18)] sm:px-8 sm:py-7">
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-lg ring-1 ring-white/25">
              <CloudUpload className="h-6 w-6 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-sky-200/90">Admin · Modül</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Yedekleme Merkezi</h1>
              <p className="mt-1 text-sm font-medium text-white/70">Veri yedekleme ve geri yükleme işlemleri</p>
            </div>
          </div>
        </header>

        <section
          data-admin-info="yedekleme"
          className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-md sm:p-8"
        >
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">Yedek kayıtları bu ekrana bağlı değil</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Uygulama içinde doğrulanabilir bir yedek kaydı kaynağı bulunmadığı için son yedek tarihi,
                başarı durumu veya dosya boyutu burada gösterilmez.
              </p>
            </div>
          </div>
        </section>

        <section aria-label="Mevcut yedekleme düzeni" className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          {facts.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50/95 via-white to-cyan-50/90 p-5 shadow-md"
            >
              <h3 className="text-base font-bold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.desc}</p>
            </article>
          ))}
        </section>

        <div className="mt-6">
          <Link
            href="/settings"
            className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-sky-200 bg-white px-5 text-sm font-bold text-sky-900 no-underline shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <Settings className="h-4 w-4" aria-hidden />
            Ayarlar ekranını aç
          </Link>
        </div>
      </div>
    </main>
  );
}
