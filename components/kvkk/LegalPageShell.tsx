import Link from "next/link";
import type { ReactNode } from "react";
import {
  LEGAL_DRAFT_MARK,
  LEGAL_DRAFT_NOTICE,
  LEGAL_DRAFT_UPDATED_LABEL,
  LEGAL_PAGES,
} from "@/lib/legal/legalDraft";

/**
 * Hukuki / güven sayfaları ortak kabuğu (Server Component).
 * Her sayfada görünür "TASLAK — hukuki inceleme gerekir" işareti + sayfalar arası gezinme.
 */
export default function LegalPageShell({
  title,
  currentHref,
  children,
}: {
  title: string;
  currentHref: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 no-underline hover:text-violet-900"
      >
        ← Ana Sayfa
      </Link>

      <div
        className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        role="note"
      >
        <p className="font-black uppercase tracking-wide">{LEGAL_DRAFT_MARK}</p>
        <p className="mt-1 text-xs leading-5">{LEGAL_DRAFT_NOTICE}</p>
      </div>

      <h1 className="mt-6 text-3xl font-black text-slate-950">{title}</h1>
      <p className="mt-3 text-sm text-slate-500">{LEGAL_DRAFT_UPDATED_LABEL}</p>

      <div className="prose prose-slate mt-8 max-w-none text-sm leading-7">{children}</div>

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
export function LegalH2({ children }: { children: ReactNode }) {
  return <h2 className="mt-8 text-lg font-black text-slate-900">{children}</h2>;
}
