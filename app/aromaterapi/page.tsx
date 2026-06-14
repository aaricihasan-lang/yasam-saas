"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { supabase } from "@/lib/supabase";

type OilStats = {
  total: number;
  essential: number;
  carrier: number;
  other: number;
};

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)] text-slate-950";

const headerCard =
  "rounded-[28px] border border-amber-200/50 bg-white/80 p-5 shadow-[0_0_50px_rgba(245,158,11,0.12)] backdrop-blur-xl sm:p-6";

const statCard =
  "rounded-xl border border-amber-100/80 bg-white/90 px-4 py-3 text-center shadow-sm";

const menuCard =
  "group relative flex min-h-[200px] flex-col overflow-hidden rounded-[24px] border p-5 text-left shadow-sm backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/40 sm:min-h-[220px]";

const menuCardPrimary =
  "border-amber-300/55 bg-gradient-to-br from-amber-50 via-rose-50/80 to-orange-50/70 hover:border-amber-400/65";

const menuCardSecondary =
  "border-violet-300/55 bg-gradient-to-br from-violet-50 via-purple-50/80 to-fuchsia-50/70 hover:border-violet-400/65";

const menuCardDisabled =
  "border-slate-200/50 bg-gradient-to-br from-slate-50 via-slate-50/80 to-white/70 cursor-not-allowed opacity-70";

function AromaBadge({ label, tone }: { label: string; tone: "amber" | "violet" | "slate" }) {
  const cls =
    tone === "amber"
      ? "border-amber-200/80 text-amber-800"
      : tone === "violet"
        ? "border-violet-200/80 text-violet-800"
        : "border-slate-200/80 text-slate-600";
  return (
    <span
      className={`inline-flex rounded-full border bg-white/85 px-3 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] shadow-sm ${cls}`}
    >
      {label}
    </span>
  );
}

export default function AromaTerapiHubPage() {
  const [stats, setStats] = useState<OilStats>({ total: 0, essential: 0, carrier: 0, other: 0 });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const loadStats = () => {
    runInEffect(() => {
      void (async () => {
        setLoading(true);
        setErrorMsg("");
        const tenantId = await getSyncedTenantId();
        if (!tenantId) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("aromatherapy_oils")
          .select("oil_type")
          .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
          .eq("is_active", true);

        setLoading(false);

        if (error) {
          setErrorMsg("İstatistikler yüklenemedi.");
          return;
        }

        if (data) {
          const total = data.length;
          const essential = data.filter((r) => r.oil_type === "essential").length;
          const carrier = data.filter((r) => r.oil_type === "carrier").length;
          const other = total - essential - carrier;
          setStats({ total, essential, carrier, other });
        }
      })();
    });
  };

  useEffect(() => { loadStats(); }, []); // sadece mount'ta yükle

  useBfcacheRefresh();

  return (
    <main className={pageBg}>
      {/* Arka plan dekorasyon */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-[420px] w-[420px] rounded-full bg-amber-200/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-40 h-[320px] w-[320px] rounded-full bg-violet-200/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[280px] w-[280px] -translate-x-1/2 rounded-full bg-rose-200/15 blur-[100px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 xl:px-10">
        {/* Header */}
        <header className={headerCard}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50/90 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-amber-800 shadow-sm">
                <span>✦</span>
                <span>Aromaterapi</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Aromaterapi Merkezi
              </h1>
              <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-slate-600">
                Uçucu yağlar, sabit yağlar ve hidrosol kütüphanesi. Terapötik özellikler, kullanım
                yöntemleri ve enerji bağlantıları ile profesyonel bir referans sistemi.
              </p>
            </div>

            {/* İstatistikler */}
            <div className="grid grid-cols-4 gap-2 sm:gap-3 lg:w-auto lg:shrink-0">
              <div className={statCard}>
                <div className="text-xl font-black text-slate-950 sm:text-2xl">
                  {loading ? "—" : stats.total}
                </div>
                <div className="mt-0.5 text-[10px] font-bold text-slate-500">Toplam</div>
              </div>
              <div className={statCard}>
                <div className="text-xl font-black text-amber-700 sm:text-2xl">
                  {loading ? "—" : stats.essential}
                </div>
                <div className="mt-0.5 text-[10px] font-bold text-slate-500">Uçucu</div>
              </div>
              <div className={statCard}>
                <div className="text-xl font-black text-emerald-700 sm:text-2xl">
                  {loading ? "—" : stats.carrier}
                </div>
                <div className="mt-0.5 text-[10px] font-bold text-slate-500">Sabit</div>
              </div>
              <div className={statCard}>
                <div className="text-xl font-black text-violet-700 sm:text-2xl">
                  {loading ? "—" : stats.other}
                </div>
                <div className="mt-0.5 text-[10px] font-bold text-slate-500">Diğer</div>
              </div>
            </div>
          </div>
        </header>

        {errorMsg ? (
          <div className="rounded-2xl bg-rose-50 px-4 py-2.5 text-[13px] font-bold text-rose-700 ring-1 ring-rose-100">
            {errorMsg}
          </div>
        ) : null}

        {/* Modül Kartları */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

          {/* Yağlar Kütüphanesi */}
          <Link href="/aromaterapi/yaglar?view=list" className={`${menuCard} ${menuCardPrimary}`}>
            <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-amber-300/20 blur-2xl transition group-hover:bg-amber-300/30" />

            <div className="relative flex h-full flex-col justify-between">
              <div className="shrink-0">
                <AromaBadge label="Kütüphane" tone="amber" />
              </div>

              <div className="flex flex-1 flex-col items-center justify-center px-2 py-4 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200/80 bg-white/80 text-3xl shadow-sm ring-1 ring-white/90">
                  🫧
                </div>
                <h2 className="text-lg font-black leading-tight tracking-tight text-slate-950">
                  Yağlar Kütüphanesi
                </h2>
                <p className="mt-1.5 text-xs font-medium leading-snug text-slate-600">
                  Uçucu yağ, sabit yağ, hidrosol ve reçine kayıtlarını arayın, inceleyin, düzenleyin.
                </p>
              </div>

              <div className="shrink-0 space-y-2">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="rounded-full bg-amber-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-sm">
                    {loading ? "…" : `${stats.total} yağ`}
                  </span>
                  <span className="rounded-full border border-amber-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-amber-800">
                    Arama & Filtre
                  </span>
                </div>
                <span className="block w-full rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-2 text-center text-[13px] font-black text-white shadow-md ring-1 ring-amber-400/40 transition group-hover:brightness-105">
                  Listeyi Aç →
                </span>
              </div>
            </div>
          </Link>

          {/* Yeni Yağ Ekle */}
          <Link href="/aromaterapi/yaglar?view=new" className={`${menuCard} ${menuCardSecondary}`}>
            <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-violet-300/20 blur-2xl transition group-hover:bg-violet-300/30" />

            <div className="relative flex h-full flex-col justify-between">
              <div className="shrink-0">
                <AromaBadge label="Manuel Kayıt" tone="violet" />
              </div>

              <div className="flex flex-1 flex-col items-center justify-center px-2 py-4 text-center">
                <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-200/80 bg-white/80 text-3xl shadow-sm ring-1 ring-white/90">
                  🌸
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-black text-white shadow-md ring-2 ring-white">
                    +
                  </span>
                </div>
                <h2 className="text-lg font-black leading-tight tracking-tight text-slate-950">
                  Yeni Yağ Ekle
                </h2>
                <p className="mt-1.5 text-xs font-medium leading-snug text-slate-600">
                  Bölümlü form ile kimlik, bileşenler, faydalar ve enerji bilgilerini kayıt altına alın.
                </p>
              </div>

              <div className="shrink-0 space-y-2">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-sm">
                    8 bölüm
                  </span>
                  <span className="rounded-full border border-violet-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-violet-800">
                    Tüm yağ tipleri
                  </span>
                </div>
                <span className="block w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 py-2 text-center text-[13px] font-black text-white shadow-md ring-1 ring-violet-400/40 transition group-hover:brightness-105">
                  Yeni Kayıt Oluştur
                </span>
              </div>
            </div>
          </Link>

          {/* Karışım Oluşturucu — Yakında */}
          <div className={`${menuCard} ${menuCardDisabled} sm:col-span-2 lg:col-span-1`}>
            <div className="relative flex h-full flex-col justify-between">
              <div className="shrink-0">
                <AromaBadge label="Yakında" tone="slate" />
              </div>

              <div className="flex flex-1 flex-col items-center justify-center px-2 py-4 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 text-3xl shadow-sm ring-1 ring-white/90">
                  ⚗️
                </div>
                <h2 className="text-lg font-black leading-tight tracking-tight text-slate-700">
                  Karışım Oluşturucu
                </h2>
                <p className="mt-1.5 text-xs font-medium leading-snug text-slate-500">
                  Yağları birleştirin, karışım reçeteleri oluşturun ve danışan protokollerine ekleyin.
                </p>
              </div>

              <div className="shrink-0 space-y-2">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="rounded-full border border-slate-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-slate-600">
                    Karışım reçetesi
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-slate-600">
                    Danışan entegrasyonu
                  </span>
                </div>
                <span className="block w-full rounded-xl bg-slate-200 py-2 text-center text-[13px] font-black text-slate-500 shadow-sm">
                  Yakında Geliyor
                </span>
              </div>
            </div>
          </div>

        </section>

        {/* Alt bilgi */}
        <footer className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-100/60 bg-white/60 px-4 py-3 backdrop-blur-sm">
          <span className="text-lg">🌿</span>
          <p className="text-xs font-medium text-slate-500">
            Aromaterapi modülü — Uçucu yağ, sabit yağ, hidrosol, reçine ve ekstrakt kütüphanesi. Karışım oluşturucu ve danışan entegrasyonu yakında.
          </p>
        </footer>
      </div>
    </main>
  );
}
