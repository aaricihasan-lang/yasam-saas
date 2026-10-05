"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { useIsAndroid } from "@/hooks/useIsAndroid";

export type HdHubModule = {
  title: string;
  desc: string;
  href: string;
  icon: string;
  badge: string;
  accent: string;
  cardBorder: string;
  cardBg: string;
  badgeCls: string;
  /** true → yalnız admin'e gösterilir (route/API KORUNUR; uzman hub'da görmez). */
  adminOnly?: boolean;
  /** P2-3: Android'de (Word indirilemez) gösterilecek açıklama; yoksa `desc`. */
  androidDesc?: string;
};

/**
 * HD hub kartları + ana CTA (client). Eski "Rapor Oluştur" hattı uzmandan GİZLENİR
 * (route ve API yerinde durur); uzmanın ana yolu Kayıtlı Haritalar → Profesyonel Word.
 * SSR/ilk render'da adminOnly kartlar gizli başlar (uzmana kısa süreli görünme olmaz).
 */
export function HdHubModules({ modules }: { modules: readonly HdHubModule[] }) {
  const [isAdmin, setIsAdmin] = useState(false);
  // P2-3: Android'de Word (.docx) üretilemez/indirilemez → Word vaadi metin olarak da
  // gösterilmez. Masaüstü metinleri `.no-android` ile SSR'da gizlenir (flash yok); Android
  // metni hydration sonrası görünür.
  const isAndroid = useIsAndroid();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAdmin(isAdminUser(readYasamUser()));
  }, []);

  const visible = modules.filter((m) => !m.adminOnly || isAdmin);

  return (
    <>
      {/* Ana CTA — profesyonel Word raporu kayıtlı harita üzerinden üretilir. */}
      <Link
        href="/human-design/kayitli-haritalar"
        className="group mb-4 flex flex-col gap-2 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-teal-50/80 to-white px-5 py-4 no-underline shadow-sm ring-1 ring-emerald-100/70 transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900">
            <span className="no-android">Kayıtlı Haritalar → Profesyonel Word</span>
            {isAndroid && "Kayıtlı Haritalar"}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">
            <span className="no-android">Bir haritayı açın ve “Profesyonel Word Raporu” ile danışanınıza hazır raporu oluşturun.</span>
            {isAndroid && "Kayıtlı haritaları açın ve rapor özetlerini görüntüleyin. Profesyonel Word raporu bilgisayardan oluşturulur."}
          </p>
        </div>
        <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-xs font-black uppercase tracking-wide text-white shadow-sm transition group-hover:brightness-105">
          Haritalara Git →
        </span>
      </Link>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((mod) => (
          <Link key={`${mod.href}:${mod.title}`} href={mod.href} className="group block no-underline">
            <div
              className={`flex h-full flex-col rounded-2xl border bg-gradient-to-br p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${mod.cardBorder} ${mod.cardBg}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xl text-white shadow-sm transition-transform duration-200 group-hover:scale-105 ${mod.accent}`}
                >
                  {mod.icon}
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${mod.badgeCls}`}>
                  {mod.badge}
                </span>
              </div>

              <h2 className="mt-3.5 text-base font-black text-slate-900">{mod.title}</h2>
              <p className="mt-1 flex-1 text-xs leading-5 text-slate-600">
                {mod.androidDesc ? (
                  <>
                    <span className="no-android">{mod.desc}</span>
                    {isAndroid && mod.androidDesc}
                  </>
                ) : (
                  mod.desc
                )}
              </p>

              <div className="mt-4 flex items-center justify-end">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-sm transition-transform duration-200 group-hover:scale-110 ${mod.accent}`}
                  aria-hidden
                >
                  →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
