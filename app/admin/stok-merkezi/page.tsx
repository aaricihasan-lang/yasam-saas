"use client";

import Link from "next/link";
import { Boxes, History, Info, Package, Tags } from "lucide-react";
import {
  AccessDeniedScreen,
  LoadingScreen,
  useSistemSagligiAdminGate,
} from "@/app/admin/sistem-sagligi/detail-shared";

/**
 * Ürün & Stok Sistem Araçları — gerçek stok modülüne yönlendirme ekranı.
 *
 * Stok kayıtları çalışma alanı (tenant) bazlıdır ve /urun-stok modülünde, kendi modül
 * yetkisiyle (requireModuleAccess "stok") yönetilir. Platform geneli bir "merkezi stok"
 * sayısı kaynağı olmadığından bu ekran sayı göstermez; yalnız mevcut ekranlara bağlantı verir.
 */
const links = [
  {
    title: "Ürün & Stok Merkezi",
    desc: "Tüm ürün kategorileri ve stok bölümleri.",
    href: "/urun-stok",
    Icon: Package,
  },
  {
    title: "Canlı Stok Merkezi",
    desc: "Tüm ürünlerin güncel stok durumu ve kritik stok uyarıları.",
    href: "/urun-stok/canli-stok",
    Icon: Boxes,
  },
  {
    title: "Satış & Fiyatlandırma",
    desc: "Satış kaydı ve ürün fiyatlandırma.",
    href: "/urun-stok/satis-fiyatlandirma",
    Icon: Tags,
  },
  {
    title: "Satış Geçmişi",
    desc: "Geçmiş satış hareketleri ve özetleri.",
    href: "/urun-stok/satis-gecmisi",
    Icon: History,
  },
] as const;

export default function StokMerkeziPage() {
  const { checked, allowed } = useSistemSagligiAdminGate();

  if (!checked) return <LoadingScreen />;
  if (!allowed) return <AccessDeniedScreen />;

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <header className="relative mb-6 overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-r from-slate-900 via-amber-900 to-orange-800 px-6 py-6 text-white shadow-[0_16px_48px_rgba(88,28,135,0.18)] sm:px-8 sm:py-7">
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg ring-1 ring-white/25">
              <Package className="h-6 w-6 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-200/90">Admin · Modül</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Ürün &amp; Stok Sistem Araçları</h1>
              <p className="mt-1 text-sm font-medium text-white/70">Merkezi stok, satış ve envanter yönetim araçları</p>
            </div>
          </div>
        </header>

        <section
          data-admin-info="stok-merkezi"
          className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-md sm:p-8"
        >
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">Stok yönetimi Ürün &amp; Stok modülünde</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Stok, satış ve fiyat kayıtları her çalışma alanı için ayrı tutulur ve Ürün &amp; Stok
                modülünde, modül yetkisiyle yönetilir. Aşağıdaki bağlantılar oturumdaki hesabın kendi
                stok ekranlarını açar.
              </p>
            </div>
          </div>
        </section>

        <section aria-label="Stok ekranları" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {links.map(({ title, desc, href, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-[110px] items-start gap-3 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/90 p-5 no-underline shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
              <span className="min-w-0">
                <span className="block text-base font-bold text-slate-900">{title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-600">{desc}</span>
                <span className="mt-2 block text-xs font-semibold text-slate-500">Aç →</span>
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
