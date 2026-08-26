"use client";

import Link from "next/link";
import { kupaCard } from "@/app/kupa/components/KupaShell";
import type { CuppingProtocol } from "@/app/kupa/lib/api";

/**
 * Protokol liste kartı. Nested-interactive'den kaçınmak için kart bir <div>; başlık
 * bir <Link> (detaya gider), aksiyonlar ayrı <button>/<Link> satırında. "N bölge"
 * sayacı YOK (N+1 önlemi — useProtocolList notu).
 */
export function ProtocolListCard({ protocol, onDelete }: { protocol: CuppingProtocol; onDelete: (p: CuppingProtocol) => void }) {
  const href = `/kupa/protokoller/${protocol.id}`;
  return (
    <div className={`${kupaCard} flex flex-col`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={href} className="min-w-0 no-underline">
          <h3 className="truncate text-base font-black tracking-tight text-slate-800 transition hover:text-amber-700">{protocol.title}</h3>
        </Link>
        {protocol.is_active === false ? (
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Pasif</span>
        ) : null}
      </div>
      {protocol.category ? (
        <span className="mt-1 inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          {protocol.category}
        </span>
      ) : null}
      {protocol.summary ? (
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-slate-600">{protocol.summary}</p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <span className="text-[11px] text-slate-400">
          {protocol.updated_at ? `Güncellendi: ${new Date(protocol.updated_at).toLocaleDateString("tr-TR")}` : ""}
        </span>
        <div className="flex items-center gap-3">
          <Link href={href} className="text-xs font-bold text-amber-700 no-underline hover:underline">
            Aç →
          </Link>
          <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => onDelete(protocol)}>
            Sil
          </button>
        </div>
      </div>
    </div>
  );
}
