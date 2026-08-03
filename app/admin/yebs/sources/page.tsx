"use client";

// ============================================================
// YEBS A8 — Kaynak (source) liste ekranı (API-A3R)
// Filtreler: q (başlık/yazar), source_type, status — URL ile senkronlu.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { YebsPageShell, SelectInput, StatusBadge, LoadingBlock } from "@/app/admin/yebs/components/primitives";
import { useYebsList, ListLayout } from "@/app/admin/yebs/components/list";
import { sourcesApi } from "@/app/admin/yebs/adminYebsApi";
import type { SourceRow } from "@/lib/yebs/ui/types";
import { SOURCE_STATUSES, SOURCE_TYPES } from "@/lib/yebs/ui/types";
import { statusMeta, SOURCE_TYPE_LABEL } from "@/lib/yebs/ui/statusDictionary";

const fmt = (s: string) => new Date(s).toLocaleString("tr-TR");

export default function SourcesListPage() {
  return (
    <Suspense fallback={<YebsPageShell><LoadingBlock /></YebsPageShell>}>
      <SourcesListInner />
    </Suspense>
  );
}

function SourcesListInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [qInput, setQInput] = useState(() => sp.get("q") ?? "");
  const [q, setQ] = useState(() => sp.get("q") ?? "");
  const [sourceType, setSourceType] = useState(() => sp.get("source_type") ?? "");
  const [status, setStatus] = useState(() => sp.get("status") ?? "");

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 250);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sourceType) p.set("source_type", sourceType);
    if (status) p.set("status", status);
    const qsStr = p.toString();
    router.replace(qsStr ? `?${qsStr}` : "/admin/yebs/sources", { scroll: false });
  }, [q, sourceType, status, router]);

  const resetKey = useMemo(() => JSON.stringify({ q, sourceType, status }), [q, sourceType, status]);

  const fetcher = useCallback(
    (offset: number, limit: number, signal: AbortSignal) =>
      sourcesApi.list(
        { q: q || undefined, source_type: sourceType || undefined, status: status || undefined, limit, offset },
        signal,
      ),
    [q, sourceType, status],
  );

  const state = useYebsList<SourceRow>(fetcher, resetKey);

  const toolbar = (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="block sm:col-span-2 lg:col-span-1">
        <span className="mb-1 block text-xs font-bold text-slate-700">Ara</span>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3">
          <Search className="h-4 w-4 text-slate-400" aria-hidden />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Başlık veya yazar ile ara…"
            className="h-10 w-full bg-transparent text-sm outline-none"
            aria-label="Kaynak ara"
          />
        </div>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-700">Kaynak türü</span>
        <SelectInput value={sourceType} onChange={(e) => setSourceType(e.target.value)} aria-label="Kaynak türü filtresi">
          <option value="">Tümü</option>
          {SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>{SOURCE_TYPE_LABEL[t] ?? t}</option>
          ))}
        </SelectInput>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-700">Durum</span>
        <SelectInput value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum filtresi">
          <option value="">Tümü</option>
          {SOURCE_STATUSES.map((s) => (
            <option key={s} value={s}>{statusMeta(s).label}</option>
          ))}
        </SelectInput>
      </label>
    </div>
  );

  return (
    <YebsPageShell>
      <ListLayout<SourceRow>
        title="Kaynaklar"
        subtitle="Merkezî künye kayıtları — kitap, makale, klasik metin, mevzuat, standart ve diğer kaynak türleri."
        newHref="/admin/yebs/sources/new"
        toolbar={toolbar}
        state={state}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/yebs/sources/${r.id}`}
        columns={[
          { key: "title", header: "Başlık", cell: (r) => r.title },
          { key: "type", header: "Tür", cell: (r) => SOURCE_TYPE_LABEL[r.source_type] ?? r.source_type },
          { key: "meta", header: "Künye", cell: (r) => <span className="text-xs text-slate-500">{[r.authors ?? r.organization, r.publication_year].filter(Boolean).join(" · ") || "—"}</span> },
          { key: "status", header: "Durum", cell: (r) => <StatusBadge status={r.status} /> },
          { key: "updated", header: "Güncellenme", cell: (r) => <span className="text-xs text-slate-500">{fmt(r.updated_at)}</span>, className: "whitespace-nowrap" },
        ]}
        renderCard={(r) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">{r.title}</span>
              <StatusBadge status={r.status} />
            </div>
            <span className="text-xs text-slate-500">{SOURCE_TYPE_LABEL[r.source_type] ?? r.source_type}</span>
            <span className="text-[11px] text-slate-400">{[r.authors ?? r.organization, r.publication_year].filter(Boolean).join(" · ")}</span>
            <span className="text-[11px] text-slate-400">{fmt(r.updated_at)}</span>
          </div>
        )}
      />
    </YebsPageShell>
  );
}
