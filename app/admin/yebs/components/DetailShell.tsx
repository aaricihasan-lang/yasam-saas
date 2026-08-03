"use client";

// ============================================================
// YEBS A8 — Ortak detay kabuğu: sekmeler + sticky alt action bar + lifecycle bar
// Sekmeler: Genel / Bağlantılar / (Labels|Evidence) / Yaşam Döngüsü / Kayıt Bilgisi
// Görünmeyen sekme içeriği lazy: yalnız aktif sekme render edilir.
// ============================================================

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import type { LifecycleAction } from "@/lib/yebs/ui/lifecycleMap";
import { StatusBadge } from "./primitives";

export type TabDef = { key: string; label: string; content: ReactNode };

export function DetailShell({
  backHref, title, status, tabs, saving, dirty, onSave, saveLabel = "Kaydet", lifecycleBar, headerExtra,
}: {
  backHref: string;
  title: string;
  status?: string;
  tabs: TabDef[];
  saving?: boolean;
  dirty?: boolean;
  onSave?: () => void;
  saveLabel?: string;
  lifecycleBar?: ReactNode;
  headerExtra?: ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  return (
    <div className="pb-24">
      <div className="mb-3">
        <Link href={backHref} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-violet-700">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Listeye dön
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-black text-slate-900">{title}</h1>
        {status && <StatusBadge status={status} />}
        {headerExtra}
      </div>

      {/* Sekme çubuğu — mobilde yatay kaydırılır */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white/70 p-1" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold transition ${
              active === t.key ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div>{tabs.find((t) => t.key === active)?.content}</div>

      {/* Sticky alt action bar */}
      {(onSave || lifecycleBar) && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/60 bg-white/85 px-4 py-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">{lifecycleBar}</div>
            {onSave && (
              <button type="button" onClick={onSave} disabled={saving || !dirty}
                className="btn-success inline-flex items-center gap-1.5 px-5 disabled:opacity-40">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                {saveLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Lifecycle aksiyon butonları — mevcut duruma göre. */
export function LifecycleBar({
  actions, onPick, disabled,
}: {
  actions: LifecycleAction[]; onPick: (a: LifecycleAction) => void; disabled?: boolean;
}) {
  if (actions.length === 0) return <span className="text-xs text-slate-400">Bu durumda işlem yok.</span>;
  return (
    <>
      {actions.map((a) => (
        <button key={a.key} type="button" disabled={disabled} onClick={() => onPick(a)}
          className={`${a.destructive ? "btn-outline-danger" : a.direction === "forward" ? "btn-secondary" : "btn-soft"} px-3 py-1.5 text-sm disabled:opacity-40`}>
          {a.label}
        </button>
      ))}
    </>
  );
}

/** "Kayıt Bilgisi" sekmesi için ortak meta gösterimi. */
export function RecordInfo({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-2 rounded-2xl border border-slate-200 bg-white/70 p-4 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{r.label}</dt>
          <dd className="text-sm text-slate-800">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
