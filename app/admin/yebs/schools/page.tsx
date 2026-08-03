"use client";

// ============================================================
// YEBS A8 — Ekol (school) liste sayfası
// URL-senkron arama (q) + durum (status) + opsiyonel tradition_id filtresi.
// Arama Türkçe-güvenli GÖSTERİLİR; q backend'e ham gönderilir (backend arındırır).
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { schoolsApi } from "@/app/admin/yebs/adminYebsApi";
import type { SchoolRow } from "@/lib/yebs/ui/types";
import { CANONICAL_STATUSES } from "@/lib/yebs/ui/types";
import { statusMeta } from "@/lib/yebs/ui/statusDictionary";
import { useYebsList, ListLayout } from "@/app/admin/yebs/components/list";
import { YebsPageShell, StatusBadge, TextInput, SelectInput, LoadingBlock } from "@/app/admin/yebs/components/primitives";

const COLL = "schools";

function SchoolsList() {
  const router = useRouter();
  const sp = useSearchParams();
  const urlQ = sp.get("q") ?? "";
  const urlStatus = sp.get("status") ?? "";
  const urlTraditionId = sp.get("tradition_id") ?? "";

  const [search, setSearch] = useState(urlQ);
  const committed = useRef(urlQ);


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
      schoolsApi.list(
        { q: urlQ || undefined, status: urlStatus || undefined, tradition_id: urlTraditionId || undefined, limit, offset },
        signal,
      ),
    [urlQ, urlStatus, urlTraditionId],
  );

  const state = useYebsList<SchoolRow>(fetcher, `${urlQ}|${urlStatus}|${urlTraditionId}`);

  const hasFilters = urlQ !== "" || urlStatus !== "" || urlTraditionId !== "";

  const columns = useMemo(
    () => [
      { key: "name_tr", header: "Ad", cell: (r: SchoolRow) => r.name_tr },
      { key: "slug", header: "Kısa ad", cell: (r: SchoolRow) => <span className="font-mono text-[12px] text-slate-500">{r.slug}</span> },
      { key: "tradition_id", header: "Gelenek", cell: (r: SchoolRow) => <span className="font-mono text-[11px] text-slate-400">{r.tradition_id.slice(0, 8)}…</span> },
      { key: "status", header: "Durum", cell: (r: SchoolRow) => <StatusBadge status={r.status} /> },
      {
        key: "updated_at",
        header: "Güncellendi",
        cell: (r: SchoolRow) => <span className="text-slate-500">{new Date(r.updated_at).toLocaleDateString("tr-TR")}</span>,
      },
    ],
    [],
  );

  const toolbar = (
    <div className="space-y-2">
      {urlTraditionId && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-800">
          <span>Belirli bir geleneğe göre filtrelendi:</span>
          <Link href={`/admin/yebs/traditions/${urlTraditionId}`} className="font-mono font-semibold hover:underline">{urlTraditionId.slice(0, 8)}…</Link>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <TextInput
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad veya kısa ad ile ara…"
          aria-label="Ekol ara"
        />
        <SelectInput value={urlStatus} onChange={(e) => pushParams({ status: e.target.value })} aria-label="Duruma göre filtrele">
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
    </div>
  );

  return (
    <ListLayout<SchoolRow>
      title="Ekoller"
      subtitle="Merkezî YEBS ekol (school) referans kayıtları."
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
            <span>{new Date(r.updated_at).toLocaleDateString("tr-TR")}</span>
          </div>
        </div>
      )}
    />
  );
}

export default function SchoolsPage() {
  return (
    <YebsPageShell>
      <Suspense fallback={<LoadingBlock />}>
        <SchoolsList />
      </Suspense>
    </YebsPageShell>
  );
}
