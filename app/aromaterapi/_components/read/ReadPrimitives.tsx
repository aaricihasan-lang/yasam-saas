"use client";

import { useId, type ReactNode } from "react";
import { AromaterapiListSkeleton } from "@/app/aromaterapi/_components/AromaterapiSkeleton";

/**
 * Aromaterapi V2 — C3C okuma ekranı sunum primitifleri.
 *
 * Salt sunum: veri/iş mantığı YOK. Erişilebilir (label↔input, aria-current,
 * focus-visible, min 44px dokunma hedefi), responsive ve Türkçe. Tüm liste/detay
 * ekranları bu primitifleri paylaşır → görsel sözleşme drift etmez.
 */

// ---------------- Arama ----------------

export function ReadSearchBar({
  value,
  onChange,
  placeholder = "Ara…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="relative w-full">
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        🔍
      </span>
      <input
        id={id}
        type="search"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/90 pl-9 pr-3 text-[14px] font-medium text-slate-800 shadow-sm outline-none transition focus-visible:border-amber-300 focus-visible:ring-2 focus-visible:ring-amber-300/50"
      />
    </div>
  );
}

// ---------------- Filtre seçici ----------------

export type FilterOption = { value: string; label: string };

export function ReadFilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel = "Tümü",
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
  allLabel?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-[140px] flex-col gap-1">
      <label htmlFor={id} className="text-[12px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] rounded-xl border border-slate-200 bg-white/90 px-3 text-[13px] font-bold text-slate-700 shadow-sm outline-none transition focus-visible:border-amber-300 focus-visible:ring-2 focus-visible:ring-amber-300/50"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------- Araç çubuğu kabuğu + sonuç sayısı ----------------

export function ReadToolbar({
  search,
  filters,
  count,
  action,
}: {
  search: ReactNode;
  filters?: ReactNode;
  count?: ReactNode;
  /** Bu listenin birincil eylemi (ör. "Yeni Bitki"). Kontrol çubuğunun sağ ucuna oturur. */
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white/60 p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:gap-4">
        <div className="w-full min-w-0 lg:flex-1 lg:min-w-[240px]">{search}</div>
        {filters ? <div className="flex flex-wrap items-end gap-3">{filters}</div> : null}
        {count || action ? (
          <div className="flex items-center justify-between gap-3 lg:ml-auto">
            {count ? <div className="shrink-0">{count}</div> : null}
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ReadResultCount({ total, loading }: { total: number; loading: boolean }) {
  return (
    <span
      aria-live="polite"
      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-black text-slate-500"
    >
      {loading ? "Yükleniyor…" : `${total.toLocaleString("tr-TR")} sonuç`}
    </span>
  );
}

// ---------------- Durumlar ----------------

export function ReadLoading({ cards = 6 }: { cards?: number }) {
  return <AromaterapiListSkeleton cards={cards} />;
}

export function ReadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-[240px] flex-col items-center justify-center rounded-[20px] border border-rose-100 bg-rose-50/70 px-6 py-10 text-center"
    >
      <div className="text-3xl" aria-hidden>
        ⚠️
      </div>
      <p className="mt-3 max-w-md text-sm font-bold text-rose-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-[44px] items-center rounded-xl border border-rose-200 bg-white px-4 text-[13px] font-black text-rose-700 shadow-sm transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
      >
        Yeniden dene
      </button>
    </div>
  );
}

// ---------------- Sayfalama ----------------

export function ReadPagination({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  // Tek sayfa veya boş sonuçta sayfalayıcı gizlenir (sonuç sayısı zaten araç çubuğunda).
  if (total === 0 || totalPages <= 1) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  const btn =
    "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border px-4 text-[13px] font-black shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60";

  return (
    <nav
      aria-label="Sayfalama"
      className="mt-4 flex flex-col items-center justify-between gap-3 rounded-[20px] border border-amber-100/70 bg-white/70 px-4 py-3 sm:flex-row"
    >
      <span className="text-[12px] font-bold text-slate-500">
        {from.toLocaleString("tr-TR")}–{to.toLocaleString("tr-TR")} / {total.toLocaleString("tr-TR")}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className={`${btn} ${
            page <= 1
              ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
              : "border-slate-200 bg-white text-slate-700 hover:border-amber-200 hover:text-amber-800"
          }`}
        >
          ← Önceki
        </button>
        <span className="px-1 text-[12px] font-black text-slate-500">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className={`${btn} ${
            page >= totalPages
              ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
              : "border-slate-200 bg-white text-slate-700 hover:border-amber-200 hover:text-amber-800"
          }`}
        >
          Sonraki →
        </button>
      </div>
    </nav>
  );
}

// ---------------- Rozet / etiket ----------------

export function MetaChip({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "amber" | "emerald" | "violet" | "rose" | "sky" | "teal";
}) {
  const toneCls: Record<string, string> = {
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    violet: "border-violet-200 bg-violet-50 text-violet-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    teal: "border-teal-200 bg-teal-50 text-teal-800",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-black ${toneCls[tone]}`}
    >
      {children}
    </span>
  );
}

// ---------------- Detay bölüm kabuğu ----------------

export function DetailSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-amber-100/70 bg-white/85 p-4 shadow-sm sm:p-5">
      <div className="mb-3 border-b border-amber-100/60 pb-2">
        <h2 className="text-[15px] font-black tracking-tight text-slate-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-[12px] font-medium text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Etiket–değer satırı (detay künyeleri). */
export function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <dt className="text-[12px] font-black uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="break-words text-[15px] font-semibold text-slate-800">{value ?? "—"}</dd>
    </div>
  );
}

// ---------------- Pasaj katman kartı ----------------

export function LayerCard({
  index,
  title,
  tone,
  meta,
  children,
}: {
  index?: number;
  title: string;
  tone: "amber" | "emerald" | "violet" | "sky" | "rose";
  meta?: ReactNode;
  children: ReactNode;
}) {
  const toneCls: Record<string, { ring: string; head: string; dot: string }> = {
    amber: { ring: "border-amber-200/70", head: "text-amber-900", dot: "bg-amber-400" },
    emerald: { ring: "border-emerald-200/70", head: "text-emerald-900", dot: "bg-emerald-400" },
    violet: { ring: "border-violet-200/70", head: "text-violet-900", dot: "bg-violet-400" },
    sky: { ring: "border-sky-200/70", head: "text-sky-900", dot: "bg-sky-400" },
    rose: { ring: "border-rose-200/70", head: "text-rose-900", dot: "bg-rose-400" },
  };
  const t = toneCls[tone];
  return (
    <article className={`rounded-2xl border bg-white/90 p-4 shadow-sm ${t.ring}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
        <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden />
        <h3 className={`text-[13px] font-black ${t.head}`}>
          {typeof index === "number" ? `${index}. ` : ""}
          {title}
        </h3>
        {meta ? <div className="ml-auto flex flex-wrap items-center gap-1.5">{meta}</div> : null}
      </div>
      <div className="whitespace-pre-wrap break-words text-[14px] font-medium leading-relaxed text-slate-800">
        {children}
      </div>
    </article>
  );
}
