"use client";

import { useId, type FormEvent, type ReactNode } from "react";
import {
  AROMATERAPI_REASON_MAX_LEN,
  type AromaterapiFormMode,
} from "@/lib/aromaterapi/writeTypes";

/**
 * Aromaterapi V2 — C3D reusable yazma formu ve güvenlik UI temeli.
 *
 * SALT SUNUM: gerçek create/edit route veya mutation/fetch YOKTUR (C3D-A temel fazı).
 * İleriki entity form'ları bu kabuğu tüketir. C3B/C3C tasarım diliyle uyumlu; erişilebilir
 * (label↔input, focus-visible, 44px), 320/390 mobil, dirty-state, reason, demo read-only,
 * optimistic conflict ve hata özeti sözleşmelerini taşır.
 */

export type AromaterapiFormShellProps = {
  mode: AromaterapiFormMode;
  title: ReactNode;
  description?: ReactNode;
  /** Alan içeriği (parent kompoze eder). */
  children: ReactNode;
  /** Reason alanı (edit'te zorunlu). Genellikle <AromaterapiReasonField/>. */
  reason?: ReactNode;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  submitting?: boolean;
  /** Demo hesap: tüm alanlar mutation yapamaz; kaydet gizlenir/pasifleşir. */
  isDemo?: boolean;
  /** Kaydedilmemiş değişiklik var mı? (dirty guard ile birlikte kullanılır.) */
  dirty?: boolean;
  /** Optimistic concurrency çakışması (başkası güncelledi). */
  conflict?: boolean;
  /** Genel hata mesajı (stabil koddan çevrilmiş kullanıcı metni). */
  errorMessage?: string | null;
  submitLabel?: string;
  /**
   * Kontrollü full-width düzen (C3D-B2B). Varsayılan false → rahat okunur tek-kolon
   * genişlik (max-w-3xl). true → masaüstünde daha geniş (max-w-5xl), form bölümleri
   * 2-kolonlu ızgaralar kurabilsin diye. Mobilde her iki değerde tek kolon.
   */
  wide?: boolean;
};

export function AromaterapiFormShell({
  mode,
  title,
  description,
  children,
  reason,
  onSubmit,
  onCancel,
  submitting = false,
  isDemo = false,
  dirty = false,
  conflict = false,
  errorMessage,
  submitLabel,
  wide = false,
}: AromaterapiFormShellProps) {
  const errId = useId();
  const defaultLabel = mode === "create" ? "Kaydet" : "Değişiklikleri kaydet";

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-describedby={errorMessage ? errId : undefined}
      className={`mx-auto w-full space-y-4 ${wide ? "max-w-5xl" : "max-w-3xl"}`}
    >
      <header className="min-w-0">
        <h2 className="text-lg font-black tracking-tight text-slate-900">{title}</h2>
        {description ? (
          <p className="mt-1 text-[13px] font-medium leading-relaxed text-slate-500">{description}</p>
        ) : null}
      </header>

      {isDemo ? (
        <AromaterapiMutationNotice tone="info">
          Demo hesabında kayıt oluşturma ve düzenleme yapılamaz; alanları
          inceleyebilirsiniz.
        </AromaterapiMutationNotice>
      ) : null}

      {conflict ? (
        <AromaterapiMutationNotice tone="warning">
          Bu kayıt siz düzenlerken başkası tarafından güncellendi. Değişikliklerinizi
          kaybetmemek için yeniden yükleyip tekrar deneyin.
        </AromaterapiMutationNotice>
      ) : null}

      {errorMessage ? (
        <div
          id={errId}
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-[13px] font-bold text-rose-700"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="space-y-4">{children}</div>

      {reason ? <div className="space-y-1">{reason}</div> : null}

      <AromaterapiFormActions
        mode={mode}
        onCancel={onCancel}
        submitting={submitting}
        isDemo={isDemo}
        dirty={dirty}
        submitLabel={submitLabel ?? defaultLabel}
      />
    </form>
  );
}

// ---------------- Bölüm ----------------

export function AromaterapiFormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-[20px] border border-amber-100/70 bg-white/85 p-4 shadow-sm sm:p-5">
      <legend className="px-1 text-[13px] font-black tracking-tight text-slate-800">{title}</legend>
      {hint ? <p className="mb-2 mt-0.5 px-1 text-[12px] font-medium text-slate-500">{hint}</p> : null}
      <div className="space-y-3">{children}</div>
    </fieldset>
  );
}

// ---------------- Aksiyonlar ----------------

export function AromaterapiFormActions({
  mode,
  onCancel,
  submitting,
  isDemo,
  dirty,
  submitLabel,
}: {
  mode: AromaterapiFormMode;
  onCancel?: () => void;
  submitting?: boolean;
  isDemo?: boolean;
  dirty?: boolean;
  submitLabel: string;
}) {
  const disabled = Boolean(isDemo) || Boolean(submitting) || (mode === "edit" && dirty === false);
  return (
    <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/60"
        >
          Vazgeç
        </button>
      ) : null}
      {isDemo ? null : (
        <button
          type="submit"
          disabled={disabled}
          className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-[13px] font-black text-white shadow-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 ${
            disabled
              ? "cursor-not-allowed bg-emerald-300"
              : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-105"
          }`}
        >
          {submitting ? "Kaydediliyor…" : submitLabel}
        </button>
      )}
    </div>
  );
}

// ---------------- Alan hatası ----------------

export function AromaterapiFieldError({ message, id }: { message?: string | null; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[12px] font-bold text-rose-600">
      {message}
    </p>
  );
}

// ---------------- Bildirim ----------------

export function AromaterapiMutationNotice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "success";
  children: ReactNode;
}) {
  const toneCls: Record<string, string> = {
    info: "border-sky-200 bg-sky-50/70 text-sky-800",
    warning: "border-amber-200 bg-amber-50/70 text-amber-800",
    success: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
  };
  return (
    <div className={`rounded-xl border px-4 py-2.5 text-[13px] font-bold ${toneCls[tone]}`}>
      {children}
    </div>
  );
}

// ---------------- Reason alanı ----------------

/**
 * Değişiklik gerekçesi. create modunda opsiyonel, edit/delete modunda zorunlu
 * (Karar 10). Salt sunum; doğrulama ve gönderim ileriki writer'larda.
 */
export function AromaterapiReasonField({
  value,
  onChange,
  required,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  required: boolean;
  error?: string | null;
}) {
  const id = useId();
  const errId = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-black uppercase tracking-wide text-slate-500">
        Gerekçe {required ? <span className="text-rose-500">*</span> : <span className="text-slate-400">(opsiyonel)</span>}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        maxLength={AROMATERAPI_REASON_MAX_LEN}
        rows={2}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errId : undefined}
        placeholder={required ? "Bu değişikliğin nedenini kısaca yazın…" : "İsteğe bağlı not…"}
        className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[14px] font-medium text-slate-800 shadow-sm outline-none transition focus-visible:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-300/50"
      />
      <AromaterapiFieldError message={error} id={errId} />
    </div>
  );
}
