"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { supabase } from "@/lib/supabase";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { getDemoOilStats } from "@/lib/demo/demoAromaterapi";

type OilStats = {
  total: number;
  essential: number;
  carrier: number;
  maceration: number;
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

const menuCardAmber =
  "border-amber-300/55 bg-gradient-to-br from-amber-50 via-rose-50/80 to-orange-50/70 hover:border-amber-400/65";

const menuCardEmerald =
  "border-emerald-300/55 bg-gradient-to-br from-emerald-50 via-teal-50/80 to-cyan-50/70 hover:border-emerald-400/65";

const menuCardRose =
  "border-rose-300/55 bg-gradient-to-br from-rose-50 via-pink-50/80 to-fuchsia-50/70 hover:border-rose-400/65";

const menuCardViolet =
  "border-violet-300/55 bg-gradient-to-br from-violet-50 via-purple-50/80 to-fuchsia-50/70 hover:border-violet-400/65";

function AromaBadge({
  label,
  tone,
}: {
  label: string;
  tone: "amber" | "emerald" | "rose" | "violet" | "sky" | "slate";
}) {
  const cls =
    tone === "amber"   ? "border-amber-200/80 text-amber-800"
    : tone === "emerald" ? "border-emerald-200/80 text-emerald-800"
    : tone === "rose"    ? "border-rose-200/80 text-rose-800"
    : tone === "violet"  ? "border-violet-200/80 text-violet-800"
    : tone === "sky"     ? "border-sky-200/80 text-sky-800"
    :                      "border-slate-200/80 text-slate-600";
  return (
    <span className={`inline-flex rounded-full border bg-white/85 px-3 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] shadow-sm ${cls}`}>
      {label}
    </span>
  );
}

export default function AromaTerapiHubPage() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [stats, setStats] = useState<OilStats>(() =>
    isDemo ? getDemoOilStats() : { total: 0, essential: 0, carrier: 0, maceration: 0, other: 0 },
  );
  const [loading, setLoading] = useState(!isDemo);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isDemo) return;
    runInEffect(() => {
      void (async () => {
        setLoading(true);
        setErrorMsg("");
        const tenantId = await getSyncedTenantId();
        if (!tenantId) { setLoading(false); setErrorMsg("Oturum açmanız gerekiyor. Lütfen sayfayı yenileyin."); return; }

        // Satırları çekip uzunluk saymak yerine `count` sorgusu kullanılır:
        // PostgREST 1000 satır tavanından bağımsız olarak GERÇEK toplamı verir.
        const countOils = async (oilType?: string) => {
          let q = supabase
            .from("aromatherapy_oils")
            .select("id", { count: "exact", head: true })
            .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
            .eq("is_active", true);
          if (oilType) q = q.eq("oil_type", oilType);
          return q;
        };

        const [totalRes, essRes, carRes, macRes] = await Promise.all([
          countOils(),
          countOils("essential"),
          countOils("carrier"),
          countOils("maceration"),
        ]);

        setLoading(false);

        if (totalRes.error || essRes.error || carRes.error || macRes.error) {
          setErrorMsg("İstatistikler yüklenemedi.");
          return;
        }

        const total      = totalRes.count ?? 0;
        const essential  = essRes.count ?? 0;
        const carrier    = carRes.count ?? 0;
        const maceration = macRes.count ?? 0;
        const other      = Math.max(0, total - essential - carrier - maceration);
        setStats({ total, essential, carrier, maceration, other });
      })();
    });
  }, [isDemo]);

  useBfcacheRefresh();

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute -left-20 -top-20 h-[420px] w-[420px] rounded-full bg-amber-200/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-40 h-[320px] w-[320px] rounded-full bg-violet-200/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[280px] w-[280px] -translate-x-1/2 rounded-full bg-rose-200/15 blur-[100px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 xl:px-10">

        {isDemo && (
          <DemoModuleBanner message="Yağ kütüphanesi demo hesabı için temsili verilerle gösterilmektedir. İçerikler görüntülenebilir; düzenleme ve yeni kayıt işlemleri demo hesabında çalışmaz." />
        )}

        {/* Header */}
        <header className={headerCard}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50/90 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-amber-800 shadow-sm">
                <span>✦</span>
                <span>Terapötik Yağ Kütüphanesi</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Aromaterapi Merkezi
              </h1>
              <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-slate-600">
                Uçucu yağ, maserasyon yağı, sabit yağ kütüphaneleri ve terapötik bilgi bankası. Profesyonel referans ve protokol sistemi.
              </p>
            </div>

            {/* İstatistikler */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3 lg:w-auto lg:shrink-0">
              {[
                { label: "Toplam",   value: stats.total,      cls: "text-slate-950",   span: true },
                { label: "Uçucu",    value: stats.essential,  cls: "text-amber-700",   span: false },
                { label: "Sabit",    value: stats.carrier,    cls: "text-emerald-700", span: false },
                { label: "Maserasyon", value: stats.maceration, cls: "text-rose-700",  span: false },
                { label: "Diğer",    value: stats.other,      cls: "text-violet-700",  span: false },
              ].map((s) => (
                <div key={s.label} className={`${statCard} ${s.span ? "col-span-2 sm:col-span-1" : ""}`}>
                  <div className={`text-xl font-black sm:text-2xl ${s.cls}`}>
                    {loading ? "—" : s.value}
                  </div>
                  <div className="mt-0.5 text-[10px] font-bold text-slate-500">{s.label}</div>
                </div>
              ))}
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

          {/* Uçucu Yağlar */}
          <Link href="/aromaterapi/ucucu-yaglar?view=list" className={`${menuCard} ${menuCardAmber}`}>
            <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-amber-300/20 blur-2xl transition group-hover:bg-amber-300/30" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="shrink-0"><AromaBadge label="Uçucu Yağlar" tone="amber" /></div>
              <div className="flex flex-1 flex-col items-center justify-center px-2 py-4 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200/80 bg-white/80 text-3xl shadow-sm ring-1 ring-white/90">🌸</div>
                <h2 className="text-lg font-black leading-tight tracking-tight text-slate-950">Uçucu Yağlar</h2>
                <p className="mt-1.5 text-xs font-medium leading-snug text-slate-600">
                  Aromatik ve terapötik özelliklere sahip distile yağlar — kütüphane, arama ve kayıt.
                </p>
              </div>
              <div className="shrink-0 space-y-2">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="rounded-full bg-amber-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-sm">
                    {loading ? "…" : `${stats.essential} yağ`}
                  </span>
                  <span className="rounded-full border border-amber-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-amber-800">Kütüphane</span>
                </div>
                <span className="block w-full rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-2 text-center text-[13px] font-black text-white shadow-md transition group-hover:brightness-105">
                  Uçucu Yağları Aç →
                </span>
              </div>
            </div>
          </Link>

          {/* Sabit Yağlar */}
          <Link href="/aromaterapi/sabit-yaglar?view=list" className={`${menuCard} ${menuCardEmerald}`}>
            <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-emerald-300/20 blur-2xl transition group-hover:bg-emerald-300/30" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="shrink-0"><AromaBadge label="Sabit Yağlar" tone="emerald" /></div>
              <div className="flex flex-1 flex-col items-center justify-center px-2 py-4 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200/80 bg-white/80 text-3xl shadow-sm ring-1 ring-white/90">🫒</div>
                <h2 className="text-lg font-black leading-tight tracking-tight text-slate-950">Sabit Yağlar</h2>
                <p className="mt-1.5 text-xs font-medium leading-snug text-slate-600">
                  Taşıyıcı ve sabit bitkisel yağlar — masaj, seyreltme ve cilt bakımı.
                </p>
              </div>
              <div className="shrink-0 space-y-2">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-sm">
                    {loading ? "…" : `${stats.carrier} yağ`}
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-emerald-800">Taşıyıcı</span>
                </div>
                <span className="block w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2 text-center text-[13px] font-black text-white shadow-md transition group-hover:brightness-105">
                  Sabit Yağları Aç →
                </span>
              </div>
            </div>
          </Link>

          {/* Maserasyon Yağları */}
          <Link href="/aromaterapi/maserasyon-yaglari?view=list" className={`${menuCard} ${menuCardRose}`}>
            <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-rose-300/20 blur-2xl transition group-hover:bg-rose-300/30" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="shrink-0"><AromaBadge label="Maserasyon Yağları" tone="rose" /></div>
              <div className="flex flex-1 flex-col items-center justify-center px-2 py-4 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-200/80 bg-white/80 text-3xl shadow-sm ring-1 ring-white/90">🌺</div>
                <h2 className="text-lg font-black leading-tight tracking-tight text-slate-950">Maserasyon Yağları</h2>
                <p className="mt-1.5 text-xs font-medium leading-snug text-slate-600">
                  Bitkisel maserasyon ve infüzyon yağları — bitkilerin sabit yağa demlenmesiyle elde edilir.
                </p>
              </div>
              <div className="shrink-0 space-y-2">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-sm">
                    {loading ? "…" : `${stats.maceration} yağ`}
                  </span>
                  <span className="rounded-full border border-rose-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-rose-800">İnfüzyon</span>
                </div>
                <span className="block w-full rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 py-2 text-center text-[13px] font-black text-white shadow-md transition group-hover:brightness-105">
                  Maserasyon Yağlarını Aç →
                </span>
              </div>
            </div>
          </Link>

          {/* Bilgi Bankası */}
          <Link href="/aromaterapi/bilgi-bankasi" className={`${menuCard} ${menuCardViolet} sm:col-span-2 lg:col-span-1`}>
            <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-violet-300/20 blur-2xl transition group-hover:bg-violet-300/30" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="shrink-0"><AromaBadge label="Bilgi Bankası" tone="violet" /></div>
              <div className="flex flex-1 flex-col items-center justify-center px-2 py-4 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-200/80 bg-white/80 text-3xl shadow-sm ring-1 ring-white/90">📚</div>
                <h2 className="text-lg font-black leading-tight tracking-tight text-slate-950">Bilgi Bankası</h2>
                <p className="mt-1.5 text-xs font-medium leading-snug text-slate-600">
                  Uzman referans içerikleri ve notları — hazırlandıkça burada görünür.
                </p>
              </div>
              <div className="shrink-0 space-y-2">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="rounded-full border border-violet-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-violet-800">Uzman notları</span>
                  <span className="rounded-full border border-violet-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-violet-800">Referans</span>
                </div>
                <span className="block w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 py-2 text-center text-[13px] font-black text-white shadow-md transition group-hover:brightness-105">
                  Bilgi Bankasını Aç →
                </span>
              </div>
            </div>
          </Link>

          {/* Karışım Oluşturucu */}
          <Link href="/aromaterapi/karisim-olusturucu" className={`${menuCard} border-sky-300/55 bg-gradient-to-br from-sky-50 via-cyan-50/80 to-blue-50/70 hover:border-sky-400/65 sm:col-span-2 lg:col-span-1`}>
            <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-sky-300/20 blur-2xl transition group-hover:bg-sky-300/30" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="shrink-0"><AromaBadge label="Karışım Oluşturucu" tone="sky" /></div>
              <div className="flex flex-1 flex-col items-center justify-center px-2 py-4 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-200/80 bg-white/80 text-3xl shadow-sm ring-1 ring-white/90">⚗️</div>
                <h2 className="text-lg font-black leading-tight tracking-tight text-slate-950">Karışım Oluşturucu</h2>
                <p className="mt-1.5 text-xs font-medium leading-snug text-slate-600">
                  Uçucu + sabit yağ kombinasyonlarını siz seçin; sistem damla hesabını yapar ve bilinen uyarıları gösterir.
                </p>
              </div>
              <div className="shrink-0 space-y-2">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="rounded-full border border-sky-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-sky-800">Damla hesabı</span>
                  <span className="rounded-full border border-sky-200 bg-white/90 px-2.5 py-0.5 text-[10px] font-black text-sky-800">Güvenlik uyarısı</span>
                </div>
                <span className="block w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 py-2 text-center text-[13px] font-black text-white shadow-md transition group-hover:brightness-105">
                  Karışım Oluşturucuyu Aç →
                </span>
              </div>
            </div>
          </Link>

        </section>

        {/* Alt bilgi */}
        <footer className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-100/60 bg-white/60 px-4 py-3 backdrop-blur-sm">
          <span className="text-lg">🌿</span>
          <p className="text-xs font-medium text-slate-500">
            Aromaterapi Merkezi — Uçucu yağ, sabit yağ ve maserasyon yağı kütüphanesi. Bilgi bankasını kendi notlarınızla doldurabilirsiniz; karışım oluşturucu yakında.
          </p>
        </footer>
      </div>
    </main>
  );
}
