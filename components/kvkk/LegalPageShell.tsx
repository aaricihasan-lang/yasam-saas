import Link from "next/link";
import type { ReactNode } from "react";
import {
  LEGAL_LAST_UPDATED_ISO,
  LEGAL_LAST_UPDATED_LABEL,
  LEGAL_PAGES,
} from "@/lib/legal/legalMeta";

/**
 * Hukuki / güven sayfaları ortak kabuğu (Server Component).
 * "Son güncelleme" tarihi (lib/legal/legalMeta.ts) + sayfalar arası gezinme.
 * `w-full min-w-0`: dar ekranlarda (390px) tablo/uzun kelime taşmasını engeller.
 */
export default function LegalPageShell({
  title,
  currentHref,
  intro,
  children,
}: {
  title: string;
  currentHref: string;
  /** Başlığın altında gösterilen kısa açıklama (isteğe bağlı). */
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 no-underline hover:text-violet-900"
      >
        ← Ana Sayfa
      </Link>

      <h1 className="mt-4 break-words text-3xl font-black text-slate-950">{title}</h1>
      <p className="mt-3 text-sm text-slate-500">
        <time dateTime={LEGAL_LAST_UPDATED_ISO}>{LEGAL_LAST_UPDATED_LABEL}</time>
      </p>
      {intro ? <div className="mt-4 text-base leading-7 text-slate-700">{intro}</div> : null}

      <div className="prose prose-slate mt-8 max-w-none break-words text-sm leading-7">{children}</div>

      <nav
        className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-6"
        aria-label="Hukuki sayfalar"
      >
        {LEGAL_PAGES.map((p) =>
          p.href === currentHref ? (
            <span key={p.href} className="text-xs font-bold text-slate-700" aria-current="page">
              {p.label}
            </span>
          ) : (
            <Link
              key={p.href}
              href={p.href}
              className="text-xs font-semibold text-slate-500 no-underline hover:text-slate-700"
            >
              {p.label}
            </Link>
          ),
        )}
        <Link href="/iletisim" className="text-xs font-semibold text-slate-500 no-underline hover:text-slate-700">
          İletişim
        </Link>
      </nav>
    </main>
  );
}

/** Bölüm başlığı (mevcut sayfalarla aynı görünüm). */
export function LegalH2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-8 scroll-mt-24 text-lg font-black text-slate-900">
      {children}
    </h2>
  );
}
