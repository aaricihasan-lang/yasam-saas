"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useOverlay } from "@/lib/dogaltas/useOverlay";

/**
 * HD için yeniden kullanılabilir PREMIUM onay/yıkıcı-işlem modalı.
 *
 * Seviyeler:
 *  - LEVEL 1 (info/unlink)  : kaynak/kanıt bağı kaldırma (hafif)
 *  - LEVEL 2 (danger)       : içerik silme
 *  - (Bulk)                 : sayı-farkındalıklı içerik silme
 * İptal varsayılan/odaklı aksiyondur. Onay `requireText` verilirse ancak kullanıcı
 * doğrulama metnini (ör. canonical_key) birebir yazınca etkinleşir (en güçlü koruma).
 *
 * Erişilebilirlik: role=dialog, aria-modal, ESC, focus-trap, focus-restore, scroll-lock
 * (useOverlay). HTML çalıştırılmaz.
 */
export type HdConfirmSeverity = "info" | "danger";

export type HdConfirmModalProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  severity?: HdConfirmSeverity;
  /** Verilirse: onay ancak kullanıcı bu metni birebir yazınca etkinleşir. */
  requireText?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function HdConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "İptal",
  severity = "danger",
  requireText,
  loading = false,
  onConfirm,
  onCancel,
}: HdConfirmModalProps) {
  const { containerRef } = useOverlay<HTMLDivElement>({ open, onClose: onCancel });
  const [typed, setTyped] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!open) setTyped("");
  }, [open]);

  if (!open) return null;

  const danger = severity === "danger";
  const confirmDisabled = loading || (requireText !== undefined && typed.trim() !== requireText);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hd-confirm-title"
        tabIndex={-1}
        className="w-full max-w-md overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-700"}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id="hd-confirm-title" className="text-base font-black text-slate-900">{title}</h2>
            <div className="mt-1 text-sm leading-relaxed text-slate-600">{description}</div>
          </div>
        </div>

        {requireText !== undefined && (
          <div className="px-5 pt-3">
            <label className="mb-1 block text-[11px] font-bold text-slate-500">
              Onaylamak için <span className="font-mono text-slate-700">{requireText}</span> yazın
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-rose-400"
              placeholder={requireText}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            autoFocus
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"}`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
