"use client";

import type { ReactNode } from "react";
import { kupaEdgeCard } from "@/app/kupa/components/KupaShell";

/**
 * Protokol dosyası BÖLÜM kabuğu (Kupa-local). Her bölüm kendi read + section-level
 * aksiyonuna sahiptir — tüm sayfa TEK edit-mode'a GEÇMEZ (V1 "Gelişmiş Düzenleme"
 * panel-takası tekrarlanmaz). <1024px edge-to-edge (fullBleedBelowLg shell ile).
 */
export function ProtocolSectionShell({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`${kupaEdgeCard} mb-3`} aria-label={title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight text-slate-800">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Profesyonel boş-durum (teknik DB jargonu YOK). */
export function ProtocolEmpty({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
      {message}
    </p>
  );
}
