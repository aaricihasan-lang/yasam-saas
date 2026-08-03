"use client";

// ============================================================
// YEBS A8 — Seçiciler: generic EntityPicker + tipli sarmalayıcılar
// Server-side debounced arama; yalnız seçilen ID gönderilir.
// Concept araması label-aware q kullanır (additive backend read).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Search, X } from "lucide-react";
import { traditionsApi, schoolsApi, conceptsApi, sourcesApi } from "../adminYebsApi";
import { SOURCE_TYPE_LABEL, CONCEPT_TYPE_LABEL, statusMeta } from "@/lib/yebs/ui/statusDictionary";

export type PickerOption = { id: string; primary: string; secondary?: string; meta?: string };

function EntityPicker({
  label, value, valueLabel, onPick, search, createHref, placeholder = "Ara…",
}: {
  label: string;
  value: string | null;
  valueLabel: string | null;
  onPick: (id: string | null, display: string | null) => void;
  search: (q: string, signal: AbortSignal) => Promise<PickerOption[]>;
  createHref?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback((term: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    search(term, ac.signal)
      .then((r) => { if (!ac.signal.aborted) setOpts(r); })
      .catch(() => { /* abort/err yut */ })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => run(q), 250);
    return () => clearTimeout(t);
  }, [q, open, run]);

  return (
    <div>
      <span className="mb-1 block text-xs font-bold text-slate-700">{label}</span>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2 text-sm">
          <span className="font-semibold text-slate-800">{valueLabel ?? value}</span>
          <button type="button" onClick={() => onPick(null, null)} aria-label="Seçimi kaldır"
            className="rounded p-0.5 text-slate-400 hover:bg-white"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => { setOpen(true); run(""); }}
          className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-left text-sm text-slate-500 hover:border-violet-300">
          Seç…
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog" aria-modal="true" aria-label={`${label} seç`}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-2xl border border-white/70 bg-white p-4 shadow-2xl sm:rounded-2xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-900">{label} seç</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Kapat" className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 px-3">
              <Search className="h-4 w-4 text-slate-400" aria-hidden />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
                className="h-10 w-full bg-transparent text-sm outline-none" />
            </div>
            <div className="min-h-[120px] flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Aranıyor…</div>
              ) : opts.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Sonuç yok.</p>
              ) : (
                <ul className="space-y-1">
                  {opts.map((o) => (
                    <li key={o.id}>
                      <button type="button" onClick={() => { onPick(o.id, o.primary); setOpen(false); }}
                        className="w-full rounded-lg border border-slate-100 px-3 py-2 text-left hover:border-violet-300 hover:bg-violet-50/40">
                        <span className="block text-sm font-semibold text-slate-800">{o.primary}</span>
                        <span className="block text-[11px] text-slate-400">{o.secondary}{o.meta ? ` · ${o.meta}` : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {createHref && (
              <Link href={createHref} target="_blank" rel="noopener"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Yeni oluştur (yeni sekme)
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TraditionPicker(p: { value: string | null; valueLabel: string | null; onPick: (id: string | null, d: string | null) => void }) {
  return <EntityPicker label="Gelenek" value={p.value} valueLabel={p.valueLabel} onPick={p.onPick} createHref="/admin/yebs/traditions/new"
    search={async (q, s) => {
      const r = await traditionsApi.list({ q: q || undefined, limit: 20 }, s);
      return r.ok ? r.data.rows.map((row) => ({ id: row.id, primary: row.name_tr, secondary: row.slug, meta: statusMeta(row.status).label })) : [];
    }} />;
}

export function SchoolPicker(p: { traditionId?: string; value: string | null; valueLabel: string | null; onPick: (id: string | null, d: string | null) => void }) {
  return <EntityPicker label="Ekol" value={p.value} valueLabel={p.valueLabel} onPick={p.onPick} createHref="/admin/yebs/schools/new"
    search={async (q, s) => {
      const r = await schoolsApi.list({ q: q || undefined, tradition_id: p.traditionId, limit: 20 }, s);
      return r.ok ? r.data.rows.map((row) => ({ id: row.id, primary: row.name_tr, secondary: row.slug, meta: statusMeta(row.status).label })) : [];
    }} />;
}

export function ConceptPicker(p: { label?: string; value: string | null; valueLabel: string | null; onPick: (id: string | null, d: string | null) => void }) {
  return <EntityPicker label={p.label ?? "Kavram"} value={p.value} valueLabel={p.valueLabel} onPick={p.onPick} createHref="/admin/yebs/concepts/new"
    placeholder="Ad veya kısa ad ile ara…"
    search={async (q, s) => {
      const r = await conceptsApi.list({ q: q || undefined, limit: 20 }, s);
      return r.ok ? r.data.rows.map((row) => ({ id: row.id, primary: row.slug, secondary: CONCEPT_TYPE_LABEL[row.concept_type] ?? row.concept_type, meta: statusMeta(row.status).label })) : [];
    }} />;
}

export function SourcePicker(p: { value: string | null; valueLabel: string | null; onPick: (id: string | null, d: string | null) => void }) {
  return <EntityPicker label="Kaynak" value={p.value} valueLabel={p.valueLabel} onPick={p.onPick} createHref="/admin/yebs/sources/new"
    placeholder="Başlık/yazar ile ara…"
    search={async (q, s) => {
      const r = await sourcesApi.list({ q: q || undefined, limit: 20 }, s);
      return r.ok ? r.data.rows.map((row) => ({ id: row.id, primary: row.title, secondary: SOURCE_TYPE_LABEL[row.source_type] ?? row.source_type, meta: [row.authors ?? row.organization, row.publication_year, statusMeta(row.status).label].filter(Boolean).join(" · ") })) : [];
    }} />;
}
