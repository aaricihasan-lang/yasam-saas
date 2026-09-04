"use client";
/**
 * Beslenme modülü — paylaşılan sunum atomları (buton, alan, durum bildirimleri,
 * boş/yükleniyor/hata gösterimleri, kartlar). Salt sunum; iş mantığı yok.
 * Aromaterapi/Doğaltaş premium tasarım dilini (yumuşak gölge, yuvarlak kart,
 * emerald aksan) yansıtır ama o modüllerden import ETMEZ (bağımsızlık).
 */
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { AlertTriangle, CheckCircle2, Inbox, Loader2 } from "lucide-react";

/* ── Butonlar ── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  icon?: ReactNode;
};

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-black transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60";

export function PrimaryButton({ loading, icon, children, className = "", disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`${BTN_BASE} bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm ring-1 ring-white/25 hover:brightness-105 ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function GhostButton({ loading, icon, children, className = "", disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`${BTN_BASE} border border-emerald-200 bg-white/90 text-emerald-800 shadow-sm hover:bg-emerald-50 ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function DangerButton({ loading, icon, children, className = "", disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`${BTN_BASE} border border-rose-200 bg-white/90 text-rose-700 shadow-sm hover:bg-rose-50 ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/* ── Form alanları ── */

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold text-slate-600">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] font-medium text-slate-400">{hint}</span> : null}
    </label>
  );
}

const CONTROL =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200/60";

export function TextInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} ${className}`} {...rest} />;
}

export function TextArea({ className = "", rows = 4, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={`${CONTROL} resize-y leading-relaxed ${className}`} {...rest} />;
}

export function SelectInput({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${CONTROL} appearance-none pr-8 ${className}`} {...rest}>
      {children}
    </select>
  );
}

/* ── Durum bildirimleri ── */

export function StatusMessage({
  type,
  children,
}: {
  type: "error" | "success" | "info";
  children: ReactNode;
}) {
  const map = {
    error: "bg-rose-50 text-rose-700 ring-rose-100",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    info: "bg-sky-50 text-sky-700 ring-sky-100",
  } as const;
  const Icon = type === "error" ? AlertTriangle : type === "success" ? CheckCircle2 : Inbox;
  return (
    <div
      className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-bold ring-1 ${map[type]}`}
      role={type === "error" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

export function InlineSpinner({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13px] font-bold text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-10 text-center">
      <div className="text-slate-300" aria-hidden>
        {icon ?? <Inbox className="h-8 w-8" />}
      </div>
      <p className="text-[14px] font-black text-slate-600">{title}</p>
      {description ? (
        <p className="max-w-sm text-[12px] font-medium leading-relaxed text-slate-400">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ── Kart ── */

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`rounded-2xl border border-emerald-100/70 bg-white/90 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.25)] ${className}`}
    >
      {children}
    </div>
  );
}

/* ── Duyarlı liste/detay yerleşimi ── *
 * Masaüstü: iki sütun. Mobil: tek sütun; detay açıkken liste gizlenir. */
export function MasterDetail({
  list,
  detail,
  detailOpen,
}: {
  list: ReactNode;
  detail: ReactNode;
  /** Mobilde bir detay seçili mi? (masaüstünde her ikisi de görünür) */
  detailOpen: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div
        className={`${detailOpen ? "hidden lg:flex" : "flex"} w-full flex-col lg:w-[360px] lg:shrink-0`}
      >
        {list}
      </div>
      <div
        className={`${detailOpen ? "flex" : "hidden lg:flex"} w-full min-w-0 flex-1 flex-col`}
      >
        {detail}
      </div>
    </div>
  );
}
