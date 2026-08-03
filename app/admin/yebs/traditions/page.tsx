"use client";

// ============================================================
// YEBS A8 — Gelenek (tradition) liste sayfası
// URL-senkron arama (q) + durum (status) filtresi; server offset pagination.
// Arama Türkçe-güvenli GÖSTERİLİR; q backend'e ham gönderilir (backend arındırır).
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { traditionsApi } from "@/app/admin/yebs/adminYebsApi";
import type { TraditionRow } from "@/lib/yebs/ui/types";
import { CANONICAL_STATUSES } from "@/lib/yebs/ui/types";
import { statusMeta } from "@/lib/yebs/ui/statusDictionary";
import { useYebsList, ListLayout } from "@/app/admin/yebs/components/list";
import { YebsPageShell, StatusBadge, TextInput, SelectInput, LoadingBlock } from "@/app/admin/yebs/components/primitives";

const COLL = "traditions";

function TraditionsList() {
  const router = useRouter();
  const sp = useSearchParams();
  const urlQ = sp.get("q") ?? "";
  const urlStatus = sp.get("status") ?? "";

  // Arama kutusu yerel state (debounce ile URL'e yazılır)
  const [search, setSearch] = useState(urlQ);
  const committed = useRef(urlQ);

  // Dış (geri/ileri) URL değişimini kutuya yansıt

  useEffect(() => {
    if (urlQ !== committed.current) {
      setSearch(urlQ);
      committed.current = urlQ;
    }
  }, [urlQ]);

  const pushParams = useCallback(
    (next: { q?: string; status?: string }) => {
      const params = new URLSearchParams(sp.toString());
      if ("q" in next) {
        if (next.q && next.q.trim()) params.set("q", next.q);
        else params.delete("q");
      }
      if ("status" in next) {
        if (next.status) params.set("status", next.status);
        else params.delete("status");
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?");
    },
    [router, sp],
  );

  // 250ms debounce: yerel arama → URL
  useEffect(() => {
    const t = setTimeout(() => {
      if (search === urlQ) return;
      committed.current = search;
      pushParams({ q: search });
    }, 250);
    return () => clearTimeout(t);
  }, [search, urlQ, pushParams]);

  const fetcher = useCallback(
    (offset: number, limit: number, signal: AbortSignal) =>
      traditionsApi.list({ q: urlQ || undefined, status: urlStatus || undefined, limit, offset }, signal),
    [urlQ, urlStatus],
  );

  const state = useYebsList<TraditionRow>(fetcher, `${urlQ}|${urlStatus}`);

  const hasFilters = urlQ !== "" || urlStatus !== "";

  const columns = useMemo(
    () => [
      { key: "name_tr", header: "Ad", cell: (r: TraditionRow) => r.name_tr },
      { key: "slug", header: "Kısa ad", cell: (r: TraditionRow) => <span className="font-mono text-[12px] text-slate-500">{r.slug}</span> },
      { key: "tradition_type", header: "Tür", cell: (r: TraditionRow) => <span className="text-slate-600">{r.tradition_type}</span> },
      { key: "status", header: "Durum", cell: (r: TraditionRow) => <StatusBadge status={r.status} /> },
      {
        key: "updated_at",
        header: "Güncellendi",
        cell: (r: TraditionRow) => <span className="text-slate-500">{new Date(r.updated_at).toLocaleDateString("tr-TR")}</span>,
      },
    ],
    [],
  );

  const toolbar = (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
      <TextInput
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Ad veya kısa ad ile ara…"
        aria-label="Gelenek ara"
      />
      <SelectInput
        value={urlStatus}
        onChange={(e) => pushParams({ status: e.target.value })}
        aria-label="Duruma göre filtrele"
      >
        <option value="">Tüm durumlar</option>
        {CANONICAL_STATUSES.map((s) => (
          <option key={s} value={s}>{statusMeta(s).label}</option>
        ))}
      </SelectInput>
      <button
        type="button"
        onClick={() => { setSearch(""); committed.current = ""; router.replace("?"); }}
        disabled={!hasFilters}
        className="btn-soft h-10 px-4 text-sm disabled:opacity-40"
      >
        Filtreleri temizle
      </button>
    </div>
  );

  return (
    <ListLayout<TraditionRow>
      title="Gelenekler"
      subtitle="Merkezî YEBS gelenek (tradition) referans kayıtları."
      newHref={`/admin/yebs/${COLL}/new`}
      toolbar={toolbar}
      state={state}
      columns={columns}
      rowKey={(r) => r.id}
      rowHref={(r) => `/admin/yebs/${COLL}/${r.id}`}
      renderCard={(r) => (
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-slate-800">{r.name_tr}</span>
            <StatusBadge status={r.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-slate-500">
            <span className="font-mono">{r.slug}</span>
            <span aria-hidden>·</span>
            <span>{r.tradition_type}</span>
            <span aria-hidden>·</span>
            <span>{new Date(r.updated_at).toLocaleDateString("tr-TR")}</span>
          </div>
        </div>
      )}
    />
  );
}

export default function TraditionsPage() {
  return (
    <YebsPageShell>
      <Suspense fallback={<LoadingBlock />}>
        <TraditionsList />
      </Suspense>
    </YebsPageShell>
  );
}
