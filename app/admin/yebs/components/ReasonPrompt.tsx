"use client";

// ============================================================
// YEBS A8 — Genel gerekçe (reason) modalı
// PATCH/DELETE/verify gibi reason-zorunlu mutasyonlar için ortak.
// (Lifecycle transition'lar için LifecycleModal kullanılır.)
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { ApiResult } from "@/lib/yebs/ui/types";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";

export function ReasonPrompt({
  title, recordLabel, submitLabel, destructive, requireReason = true, submit, onClose, onDone, children,
}: {
  title: string;
  recordLabel?: string;
  submitLabel: string;
  destructive?: boolean;
  requireReason?: boolean;
  submit: (reason: string) => Promise<ApiResult<unknown>>;
  onClose: () => void;
  onDone: () => void;
  children?: React.ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);


  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const canSubmit = (!requireReason || reason.trim().length > 0) && !busy;

  async function handle() {
    if (!canSubmit) return;
    setBusy(true); setErr(null);
    const r = await submit(reason.trim());
    setBusy(false);
    if (r.ok) { onDone(); onClose(); return; }
    setErr(codeMeta(r.code).message);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog" aria-modal="true" aria-label={title}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="w-full max-w-lg rounded-t-2xl border border-white/70 bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900">{title}</h2>
            {recordLabel && <p className="mt-0.5 text-xs text-slate-500">{recordLabel}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Kapat" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X className="h-4 w-4" /></button>
        </div>

        {children && <div className="mb-3">{children}</div>}

        {requireReason && (
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-700">Gerekçe <span className="text-rose-500">*</span></span>
            <textarea ref={ref} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3}
              placeholder="İşlem gerekçesi (zorunlu)…"
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
            <span className="mt-0.5 block text-right text-[11px] text-slate-400">{reason.length}/2000</span>
          </label>
        )}

        {err && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{err}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-soft px-4">Vazgeç</button>
          <button type="button" onClick={handle} disabled={!canSubmit}
            className={`${destructive ? "btn-danger" : "btn-success"} inline-flex items-center gap-1.5 px-4`}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
