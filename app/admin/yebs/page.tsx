"use client";

// ============================================================
// YEBS A8 — YEBS Ana Ekranı (Admin)
// Minimal + işlevsel. Sayımlar YALNIZ backend list count:exact'ten alınır
// (yeni summary endpoint YOK). Güvenilir üretilemeyen bölüm (cross-entity
// "son güncellenenler") sahte üretilmez → gösterilmez.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { YebsPageShell } from "./components/primitives";
import { traditionsApi, schoolsApi, conceptsApi, sourcesApi, claimsApi, relationsApi } from "./adminYebsApi";
import type { QueryParams } from "./adminYebsApi";
import type { ApiResult, ListEnvelope } from "@/lib/yebs/ui/types";

const ENTITY_CARDS = [
  { key: "traditions", label: "Gelenekler", href: "/admin/yebs/traditions", api: traditionsApi },
  { key: "schools", label: "Ekoller", href: "/admin/yebs/schools", api: schoolsApi },
  { key: "concepts", label: "Kavramlar", href: "/admin/yebs/concepts", api: conceptsApi },
  { key: "sources", label: "Kaynaklar", href: "/admin/yebs/sources", api: sourcesApi },
  { key: "claims", label: "İddialar", href: "/admin/yebs/claims", api: claimsApi },
  { key: "relations", label: "İlişkiler", href: "/admin/yebs/relations", api: relationsApi },
] as const;

async function countOf(
  api: { list: (p: QueryParams, s?: AbortSignal) => Promise<ApiResult<ListEnvelope<unknown>>> },
  extra: QueryParams, signal: AbortSignal,
): Promise<number | null> {
  const r = await api.list({ limit: 1, offset: 0, ...extra }, signal);
  return r.ok ? r.data.count : null;
}

export default function YebsHome() {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [queue, setQueue] = useState<{ label: string; value: number | null; href: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    // 6 entity toplam sayısı (paralel)
    const totals = await Promise.all(ENTITY_CARDS.map((c) => countOf(c.api, {}, signal)));
    if (signal.aborted) return;
    const map: Record<string, number | null> = {};
    ENTITY_CARDS.forEach((c, i) => { map[c.key] = totals[i]; });
    setCounts(map);

    // Kalite kuyruğu — yalnız status-filtreli güvenilir count'lar
    const [claimNeedsVer, relNeedsVer, claimApproved, relApproved] = await Promise.all([
      countOf(claimsApi, { status: "needs_verification" }, signal),
      countOf(relationsApi, { status: "needs_verification" }, signal),
      countOf(claimsApi, { status: "approved" }, signal),
      countOf(relationsApi, { status: "approved" }, signal),
    ]);
    if (signal.aborted) return;
    setQueue([
      { label: "Doğrulama bekleyen iddia", value: claimNeedsVer, href: "/admin/yebs/claims?status=needs_verification" },
      { label: "Doğrulama bekleyen ilişki", value: relNeedsVer, href: "/admin/yebs/relations?status=needs_verification" },
      { label: "Yayına hazır iddia (onaylı)", value: claimApproved, href: "/admin/yebs/claims?status=approved" },
      { label: "Yayına hazır ilişki (onaylı)", value: relApproved, href: "/admin/yebs/relations?status=approved" },
    ]);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const ac = new AbortController(); void load(ac.signal); return () => ac.abort(); }, [load]);

  const fmt = (v: number | null | undefined) => (loading ? "…" : v != null ? String(v) : "—");

  return (
    <YebsPageShell>
      <header className="mb-6 overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-r from-slate-900 via-violet-900 to-slate-800 px-6 py-6 text-white shadow-[0_16px_48px_rgba(88,28,135,0.18)]">
        <h1 className="text-2xl font-black tracking-tight">Yaşam Enerjisi Bilgi Sistemi</h1>
        <p className="mt-1 text-sm text-white/70">Merkezî referans içeriği — gelenek, ekol, kavram, kaynak, iddia ve ilişkilerin kalite ve yayın yönetimi.</p>
      </header>

      {/* Hızlı yeni kayıt */}
      <div className="mb-6 flex flex-wrap gap-2">
        {ENTITY_CARDS.map((c) => (
          <Link key={c.key} href={`${c.href}/new`} className="btn-soft inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" aria-hidden /> {c.label.replace(/ler$|lar$/, "")}
          </Link>
        ))}
      </div>

      {/* Entity sayıları */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {ENTITY_CARDS.map((c) => (
          <Link key={c.key} href={c.href} className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm transition hover:border-violet-300 hover:shadow-md">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{c.label}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{fmt(counts[c.key])}</p>
          </Link>
        ))}
      </div>

      {/* Kalite kuyruğu */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">Kalite kuyruğu</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {queue.map((q) => (
            <Link key={q.label} href={q.href} className="rounded-2xl border border-amber-200/60 bg-amber-50/50 px-4 py-3 transition hover:border-amber-300">
              <p className="text-xs font-medium text-amber-800">{q.label}</p>
              <p className="mt-1 text-xl font-black tabular-nums text-amber-900">{fmt(q.value)}</p>
            </Link>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Sayımlar yalnız mevcut liste sözleşmesinin kesin toplamlarından üretilir; tahmini/birleşik sıralama gösterilmez.
        </p>
      </section>
    </YebsPageShell>
  );
}
