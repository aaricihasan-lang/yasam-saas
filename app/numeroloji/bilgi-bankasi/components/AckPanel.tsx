"use client";

/**
 * NKB-V2 — Kalıcı başarı/hata bildirim paneli. Toast'tan farkı: KENDİLİĞİNDEN KAYBOLMAZ;
 * kullanıcı "Tamam" düğmesine basana kadar ekranda kalır. Başarı ve hata varyantı vardır.
 */

export type AckState = { type: "success" | "error"; message: string } | null;

export function AckPanel({ panel, onClose }: { panel: AckState; onClose: () => void }) {
  if (!panel) return null;
  const isSuccess = panel.type === "success";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-3 flex flex-col gap-2 rounded-2xl border p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between ${
        isSuccess
          ? "border-emerald-300/80 bg-emerald-50/90 ring-1 ring-emerald-200/60"
          : "border-rose-300/80 bg-rose-50/90 ring-1 ring-rose-200/60"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span aria-hidden className={`mt-0.5 text-base ${isSuccess ? "text-emerald-600" : "text-rose-600"}`}>
          {isSuccess ? "✓" : "⚠"}
        </span>
        <p className={`min-w-0 break-words text-sm font-semibold leading-relaxed ${isSuccess ? "text-emerald-900" : "text-rose-900"}`}>
          {panel.message}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className={`h-9 shrink-0 self-end rounded-xl px-5 text-sm font-black uppercase tracking-wide text-white shadow-sm transition hover:brightness-105 sm:self-auto ${
          isSuccess ? "bg-emerald-600" : "bg-rose-600"
        }`}
      >
        Tamam
      </button>
    </div>
  );
}
