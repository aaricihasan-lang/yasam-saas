"use client";

/**
 * DuplicateWarningModal — modül-bazlı çift kayıt uyarısı (DT-P1-1).
 * Hata DEĞİL uyarıdır → amber ton (kırmızı kullanılmaz). Mobil uyumlu.
 * Butonlar: Mevcut Kaydı Aç (opsiyonel) · Yine de Oluştur · Vazgeç.
 */
export function DuplicateWarningModal({
  open,
  label,
  busy = false,
  onOpenExisting,
  onCreateAnyway,
  onCancel,
}: {
  open: boolean;
  label: string;
  busy?: boolean;
  onOpenExisting?: () => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-[440px] overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[24px]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dup-warning-title"
      >
        <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50/70 px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl ring-1 ring-amber-200">
            ⚠️
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="dup-warning-title" className="text-base font-black text-slate-950">
              Bu isimde bir kayıt zaten var
            </h2>
            <p className="mt-0.5 text-xs font-medium leading-snug text-slate-500">
              Mevcut kaydı kontrol etmek ister misiniz?
            </p>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-3.5 py-2.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-700">Mevcut kayıt</span>
            <p className="mt-0.5 break-words text-sm font-bold text-slate-800">{label}</p>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {onOpenExisting ? (
              <button
                type="button"
                onClick={onOpenExisting}
                disabled={busy}
                className="w-full rounded-2xl border-2 border-amber-300 bg-amber-100/70 px-4 py-2.5 text-sm font-black text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
              >
                Mevcut Kaydı Aç
              </button>
            ) : null}
            <button
              type="button"
              onClick={onCreateAnyway}
              disabled={busy}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              {busy ? "Oluşturuluyor..." : "Yine de Oluştur"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="w-full rounded-2xl px-4 py-2 text-sm font-bold text-slate-500 transition hover:text-slate-700 disabled:opacity-60"
            >
              Vazgeç
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
