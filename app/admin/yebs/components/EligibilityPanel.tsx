"use client";

// ============================================================
// YEBS A8 — Eligibility / blocker paneli
// "Neden işlem yapılamıyor?" — blocker_codes Türkçe sözlükle listelenir.
// warnings bugün her zaman boş; UI yine de destekler.
// ============================================================

import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import type { Eligibility } from "../adminYebsApi";
import { codeMeta } from "@/lib/yebs/ui/errorMessages";

export function EligibilityPanel({
  eligibility, loading, onRefresh,
}: {
  eligibility: Eligibility | null;
  loading: boolean;
  onRefresh?: () => void;
}) {
  if (!eligibility && !loading) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-500">Yayın/kalite durumu</span>
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={loading}
            className="inline-flex items-center gap-1 text-[11px] text-violet-600 hover:underline disabled:opacity-40">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden /> Yenile
          </button>
        )}
      </div>

      {loading && !eligibility ? (
        <p className="text-xs text-slate-400">Kontrol ediliyor…</p>
      ) : eligibility ? (
        eligibility.allowed ? (
          <p className="flex items-center gap-1.5 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            <span className="font-semibold">İşlem yapılabilir.</span>
          </p>
        ) : (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-amber-800">
              <CircleAlert className="h-4 w-4" aria-hidden /> Neden işlem yapılamıyor?
            </p>
            <ul className="space-y-1.5">
              {eligibility.blocker_codes.map((code) => {
                const m = codeMeta(code);
                return (
                  <li key={code} className="rounded-lg bg-amber-50/70 px-2.5 py-1.5">
                    <p className="text-[13px] font-medium text-amber-900">{m.message}</p>
                    {m.suggestedAction && <p className="text-[11px] text-amber-700">{m.suggestedAction}</p>}
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">{code}</p>
                  </li>
                );
              })}
              {eligibility.warnings.map((w) => (
                <li key={w} className="rounded-lg bg-sky-50/70 px-2.5 py-1.5 text-[12px] text-sky-800">{w}</li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
