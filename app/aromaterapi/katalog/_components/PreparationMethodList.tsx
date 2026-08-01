"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MetaChip } from "@/app/aromaterapi/_components/read/ReadPrimitives";
import { fetchMethodSeriesList } from "@/lib/aromaterapi/methodData";
import { messageForCode } from "@/lib/aromaterapi/readClient";
import { METHOD_KIND_TR, METHOD_STATUS_TR, tr } from "@/lib/aromaterapi/readLabels";
import type { MethodSeriesListItem } from "@/lib/aromaterapi/readTypes";

/**
 * C3D-B2B — Preparat detayında üretim yöntemi serileri listesi (+ "Yeni Üretim Yöntemi").
 * B2A'nın placeholder'ının yerini alır. Salt-okunur; her seri kendi detay sayfasına bağlanır.
 */

function statusTone(status: string): "emerald" | "amber" | "slate" {
  if (status === "verified") return "emerald";
  if (status === "draft") return "amber";
  return "slate";
}

export function PreparationMethodList({
  preparationId,
  isDemo,
}: {
  preparationId: string;
  isDemo: boolean;
}) {
  // loading TÜRETİLİR (effect içinde senkron setState YOK → lint/cascading render yok).
  const [state, setState] = useState<{
    series: MethodSeriesListItem[] | null;
    errorCode: string | null;
    fetchedKey: string;
  }>({ series: null, errorCode: null, fetchedKey: "" });
  const loading = Boolean(preparationId) && state.fetchedKey !== preparationId;

  useEffect(() => {
    if (!preparationId) return;
    const controller = new AbortController();
    fetchMethodSeriesList(preparationId, controller.signal).then((r) => {
      if (controller.signal.aborted) return;
      if (r.ok && Array.isArray(r.data)) {
        setState({ series: r.data, errorCode: null, fetchedKey: preparationId });
      } else if (r.errorCode) {
        setState({ series: null, errorCode: r.errorCode, fetchedKey: preparationId });
      }
      // r.errorCode === null → abort; durumu değiştirme.
    });
    return () => controller.abort();
  }, [preparationId]);

  const { series, errorCode } = state;

  const newHref = `/aromaterapi/katalog/preparatlar/${preparationId}/yontemler/yeni`;

  if (loading) {
    return <p className="py-3 text-center text-[13px] font-semibold text-slate-400">Yöntemler yükleniyor…</p>;
  }
  if (errorCode) {
    return <p role="alert" className="py-3 text-center text-[13px] font-bold text-rose-600">{messageForCode(errorCode)}</p>;
  }

  return (
    <div className="space-y-3">
      {!isDemo ? (
        <div className="flex justify-end">
          <Link
            href={newHref}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 text-[13px] font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
          >
            <span aria-hidden>＋</span> Yeni Üretim Yöntemi
          </Link>
        </div>
      ) : null}

      {series && series.length > 0 ? (
        <ul className="space-y-2">
          {series.map((s) => (
            <li key={s.id}>
              <Link
                href={`/aromaterapi/katalog/preparatlar/${preparationId}/yontemler/${s.id}`}
                className="flex flex-col gap-2 rounded-xl border border-teal-100/70 bg-white/90 p-3.5 shadow-sm transition hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-black text-slate-800">
                    {tr.label(METHOD_KIND_TR, s.method_kind)}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <MetaChip tone={statusTone(s.latest_status)}>{tr.label(METHOD_STATUS_TR, s.latest_status)}</MetaChip>
                    <MetaChip tone="slate">{s.revision_count.toLocaleString("tr-TR")} revizyon</MetaChip>
                    {s.verified_revision !== null ? <MetaChip tone="emerald">Doğrulanmış: {s.verified_revision}. rev</MetaChip> : null}
                    {s.source_title ? <MetaChip tone="teal">{s.source_title}</MetaChip> : null}
                  </span>
                </span>
                <span aria-hidden className="hidden text-teal-400 sm:block">→</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3.5 text-[13px] font-medium leading-relaxed text-slate-500">
          Bu preparat için henüz üretim/elde ediliş yöntemi girilmemiş.
          {!isDemo ? " Yukarıdaki “Yeni Üretim Yöntemi” ile ekleyebilirsiniz." : ""}
        </p>
      )}
    </div>
  );
}
