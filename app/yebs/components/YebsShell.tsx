"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { usePreview } from "./preview";

const NAV: { label: string; href: string }[] = [
  { label: "Ana Ekran", href: "/yebs" },
  { label: "Gelenekler", href: "/yebs/traditions" },
  { label: "Kavramlar", href: "/yebs/concepts" },
  { label: "Kaynaklar", href: "/yebs/sources" },
  { label: "Kaynaklı Bilgiler", href: "/yebs/claims" },
  { label: "İlişkiler", href: "/yebs/relations" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/yebs") return pathname === "/yebs";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * YEBS uzman vitrini kabuğu: admin-only client kapısı (defense-in-depth),
 * başlık, navigasyon ve Önizleme Modu toggle'ı. Gerçek güvenlik server-side
 * verifyAdminRequest'tir; bu kapı yalnız non-admin'e nötr ret ekranı gösterir.
 */
export default function YebsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/yebs";
  const router = useRouter();
  const { preview, withPreview } = usePreview();
  const [gate, setGate] = useState<"checking" | "admin" | "denied">("checking");

  useEffect(() => {
    // Client-only localStorage senkronizasyonu (SSR flicker/hydration için
    // 'checking' → mount sonrası kesinleşir); ModuleRouteGuard ile aynı desen.
    const user = readYasamUser();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGate(user && isAdminUser(user) ? "admin" : "denied");
  }, []);

  function togglePreview(): void {
    const target = preview ? pathname : `${pathname}?preview=1`;
    router.push(target);
  }

  if (gate === "checking") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Yükleniyor…</div>
    );
  }

  if (gate === "denied") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl" aria-hidden>🔒</div>
        <h1 className="mt-4 text-xl font-black text-slate-800">Bu alan yalnız yöneticiye açıktır</h1>
        <p className="mt-2 text-sm text-slate-500">
          Yaşam Enerjisi Bilgi Sistemi uzman vitrini şu an yalnızca yönetici hesabıyla görüntülenebilir.
        </p>
        <Link href="/" className="mt-6 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white no-underline hover:bg-emerald-700">
          Ana ekrana dön
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      {/* Başlık */}
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl" aria-hidden>🌿</span>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Yaşam Enerjisi Bilgi Sistemi</h1>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">YEBS</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Gelenekler, kavramlar, kaynaklar ve profesyonel bilgi ağı
        </p>
      </header>

      {/* Navigasyon — mobilde yatay scroll */}
      <nav className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={withPreview(item.href)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold no-underline transition-colors ${
                  active
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Önizleme toggle + banner */}
      <div className="mb-5">
        <button
          type="button"
          onClick={togglePreview}
          className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
            preview
              ? "bg-amber-500 text-white hover:bg-amber-600"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
          aria-pressed={preview}
        >
          <span aria-hidden>{preview ? "👁️" : "👁️‍🗨️"}</span>
          {preview ? "Önizleme Modu açık" : "Önizleme Modu"}
        </button>
        {preview ? (
          <div className="mt-2 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            Önizleme Modu — Yayınlanmamış YEBS kayıtları yalnız yönetici önizlemesi için gösteriliyor.
          </div>
        ) : null}
      </div>

      {children}
    </div>
  );
}
