"use client";

// ============================================================
// YEBS A8 — Kavram (concept) liste ekranı (API-A2R)
// Kavram satırının AD kolonu YOKTUR → birincil etiket olarak slug gösterilir
// + CONCEPT_TYPE_LABEL[concept_type]. Arama (q) etiket-duyarlıdır: backend q'yu
// hem insan-adı hem slug üzerinde arar. Filtreler URL ile senkronludur.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { YebsPageShell, SelectInput, StatusBadge, LoadingBlock } from "@/app/admin/yebs/components/primitives";
import { useYebsList, ListLayout } from "@/app/admin/yebs/components/list";
import { TraditionPicker, SchoolPicker } from "@/app/admin/yebs/components/pickers";
import { conceptsApi } from "@/app/admin/yebs/adminYebsApi";
import type { ConceptRow } from "@/lib/yebs/ui/types";
import { CANONICAL_STATUSES, CONCEPT_TYPES } from "@/lib/yebs/ui/types";
import { statusMeta, CONCEPT_TYPE_LABEL } from "@/lib/yebs/ui/statusDictionary";

const fmt = (s: string) => new Date(s).toLocaleString("tr-TR");

export default function ConceptsListPage() {
  return (
    <Suspense fallback={<YebsPageShell><LoadingBlock /></YebsPageShell>}>
      <ConceptsListInner />
    </Suspense>
  );
}

function ConceptsListInner() {
  const router = useRouter();
  const sp = useSearchParams();

  // İlk değerler URL'den (yalnız mount'ta okunur)
  const [qInput, setQInput] = useState(() => sp.get("q") ?? "");
  const [q, setQ] = useState(() => sp.get("q") ?? "");
  const [status, setStatus] = useState(() => sp.get("status") ?? "");
  const [conceptType, setConceptType] = useState(() => sp.get("concept_type") ?? "");
  const [traditionId, setTraditionId] = useState<string | null>(() => sp.get("tradition_id"));
  const [traditionLabel, setTraditionLabel] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(() => sp.get("school_id"));
  const [schoolLabel, setSchoolLabel] = useState<string | null>(null);
  const [scope, setScope] = useState(() => sp.get("scope") === "tradition");

  // q debounce (250ms)
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 250);
    return () => clearTimeout(t);
  }, [qInput]);

  // scope=tradition ile school_id çakışır → scope açıkken ekol seçimi temizlenir
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (scope && schoolId) { setSchoolId(null); setSchoolLabel(null); }
  }, [scope, schoolId]);

  // URL senkronu (commit edilmiş filtreler)
  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (conceptType) p.set("concept_type", conceptType);
    if (traditionId) p.set("tradition_id", traditionId);
    if (schoolId && !scope) p.set("school_id", schoolId);
    if (scope) p.set("scope", "tradition");
    const qsStr = p.toString();
    router.replace(qsStr ? `?${qsStr}` : "/admin/yebs/concepts", { scroll: false });
  }, [q, status, conceptType, traditionId, schoolId, scope, router]);

  const resetKey = useMemo(
    () => JSON.stringify({ q, status, conceptType, traditionId, schoolId: scope ? null : schoolId, scope }),
    [q, status, conceptType, traditionId, schoolId, scope],
  );

  const fetcher = useCallback(
    (offset: number, limit: number, signal: AbortSignal) =>
      conceptsApi.list(
        {
          q: q || undefined,
          status: status || undefined,
          concept_type: conceptType || undefined,
          tradition_id: traditionId || undefined,
          school_id: scope ? undefined : schoolId || undefined,
          scope: scope ? "tradition" : undefined,
          limit,
          offset,
        },
        signal,
      ),
    [q, status, conceptType, traditionId, schoolId, scope],
  );

  const state = useYebsList<ConceptRow>(fetcher, resetKey);

  const toolbar = (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-xs font-bold text-slate-700">Ara</span>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3">
            <Search className="h-4 w-4 text-slate-400" aria-hidden />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Ad veya kısa ad (slug) ile ara…"
              className="h-10 w-full bg-transparent text-sm outline-none"
              aria-label="Kavram ara"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-700">Durum</span>
          <SelectInput value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Durum filtresi">
            <option value="">Tümü</option>
            {CANONICAL_STATUSES.map((s) => (
              <option key={s} value={s}>{statusMeta(s).label}</option>
            ))}
          </SelectInput>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-700">Kavram türü</span>
          <SelectInput value={conceptType} onChange={(e) => setConceptType(e.target.value)} aria-label="Kavram türü filtresi">
            <option value="">Tümü</option>
            {CONCEPT_TYPES.map((t) => (
              <option key={t} value={t}>{CONCEPT_TYPE_LABEL[t] ?? t}</option>
            ))}
          </SelectInput>
        </label>

        <TraditionPicker
          value={traditionId}
          valueLabel={traditionLabel}
          onPick={(id, d) => {
            setTraditionId(id);
            setTraditionLabel(d);
            // Gelenek değişince eski ekol seçimi geçersiz olabilir → temizle
            setSchoolId(null);
            setSchoolLabel(null);
          }}
        />

        <div className={scope ? "pointer-events-none opacity-50" : ""}>
          <SchoolPicker
            traditionId={traditionId ?? undefined}
            value={scope ? null : schoolId}
            valueLabel={schoolLabel}
            onPick={(id, d) => { setSchoolId(id); setSchoolLabel(d); }}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={scope}
            onChange={(e) => setScope(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Yalnız gelenek düzeyi (ekole bağlı olmayan kavramlar)
        </label>
      </div>
    </div>
  );

  return (
    <YebsPageShell>
      <ListLayout<ConceptRow>
        title="Kavramlar"
        subtitle="Merkezî referans kavramları — gelenek/ekol altındaki enerji merkezleri, kanallar, teknikler ve ilkeler."
        newHref="/admin/yebs/concepts/new"
        toolbar={toolbar}
        state={state}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/yebs/concepts/${r.id}`}
        columns={[
          { key: "slug", header: "Kısa ad (slug)", cell: (r) => r.slug },
          { key: "type", header: "Tür", cell: (r) => CONCEPT_TYPE_LABEL[r.concept_type] ?? r.concept_type },
          { key: "status", header: "Durum", cell: (r) => <StatusBadge status={r.status} /> },
          { key: "updated", header: "Güncellenme", cell: (r) => <span className="text-xs text-slate-500">{fmt(r.updated_at)}</span>, className: "whitespace-nowrap" },
        ]}
        renderCard={(r) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">{r.slug}</span>
              <StatusBadge status={r.status} />
            </div>
            <span className="text-xs text-slate-500">{CONCEPT_TYPE_LABEL[r.concept_type] ?? r.concept_type}</span>
            <span className="text-[11px] text-slate-400">{fmt(r.updated_at)}</span>
          </div>
        )}
      />
    </YebsPageShell>
  );
}
