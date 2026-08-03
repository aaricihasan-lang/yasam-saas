"use client";

// ============================================================
// YEBS A8 — Ortak lifecycle / reason modalı
// - eligibilityRequired ise aksiyon ÖNCESİ taze eligibility çağrılır
// - blocker/warning gösterilir; zorunlu reason (≤2000)
// - submit backend'e gider; WRITE response otoritedir → hata sözlükle gösterilir
// - request_id/operation_id istemciden GÖNDERİLMEZ (client bu alanları hiç taşımaz)
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { LifecycleAction } from "@/lib/yebs/ui/lifecycleMap";
import type { ApiResult } from "@/lib/yebs/ui/types";
import type { Eligibility } from "../adminYebsApi";
import { statusMeta } from "@/lib/yebs/ui/statusDictionary";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";
import { EligibilityPanel } from "./EligibilityPanel";

export function LifecycleModal({
  action, recordLabel, currentStatus, fetchEligibility, submit, onClose, onDone,
}: {
  action: LifecycleAction;
  recordLabel: string;
  currentStatus: string;
  fetchEligibility: (target: string) => Promise<Eligibility | null>;
  submit: (reason: string) => Promise<ApiResult<unknown>>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [eligLoading, setEligLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const loadEligibility = useCallback(async () => {
    if (!action.eligibilityRequired) return;
    setEligLoading(true);
    const e = await fetchEligibility(action.target);
    setEligibility(e);
    setEligLoading(false);
  }, [action.eligibilityRequired, action.target, fetchEligibility]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadEligibility(); }, [loadEligibility]);

  useEffect(() => { textRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !submitting) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  const blocked = action.eligibilityRequired && eligibility != null && !eligibility.allowed;
  const canSubmit = reason.trim().length > 0 && !submitting && !blocked;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMsg(null);
    const r = await submit(reason.trim());
    setSubmitting(false);
    if (r.ok) { onDone(); onClose(); return; }
    // WRITE otoritedir: quality/stale hatasını sözlükle göster + eligibility'yi tazele
    setErrorMsg(codeMeta(r.code).message);
    void loadEligibility();
  }

  const from = statusMeta(currentStatus).label;
  const to = statusMeta(action.target).label;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog" aria-modal="true" aria-label={action.confirmTitle}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="w-full max-w-lg rounded-t-2xl border border-white/70 bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900">{action.confirmTitle}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{recordLabel}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Kapat"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X className="h-4 w-4" /></button>
        </div>

        <p className="mb-3 text-sm text-slate-700">
          Durum: <span className="font-semibold">{from}</span> → <span className="font-semibold">{to}</span>
          {action.destructive && <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">Geri alınabilir işlem</span>}
        </p>

        {action.eligibilityRequired && (
          <div className="mb-3"><EligibilityPanel eligibility={eligibility} loading={eligLoading} onRefresh={loadEligibility} /></div>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-700">Gerekçe <span className="text-rose-500">*</span></span>
          <textarea ref={textRef} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3}
            placeholder="İşlem gerekçesi (zorunlu)…"
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          <span className="mt-0.5 block text-right text-[11px] text-slate-400">{reason.length}/2000</span>
        </label>

        {errorMsg && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{errorMsg}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="btn-soft px-4">Vazgeç</button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}
            className={`${action.destructive ? "btn-danger" : "btn-success"} inline-flex items-center gap-1.5 px-4`}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {action.label}
          </button>
        </div>
      </div>
    </div>
  );
}
