"use client";

import type { ReactNode } from "react";

/**
 * "empty"    → gerçekten hiç kayıt yok (ilk kayıt CTA'sı uygun olur).
 * "filtered" → veri var ama arama/filtre sonucu boş (temizle CTA'sı uygun olur).
 * "pending"  → bölümün canlı bağlantısı henüz etkinleşmedi (C3B iskele durumu).
 */
export type AromaterapiEmptyVariant = "empty" | "filtered" | "pending";

export type AromaterapiEmptyStateProps = {
  variant?: AromaterapiEmptyVariant;
  icon?: ReactNode;
  title: string;
  message: string;
  /** Ana eylem (ör. yeni kayıt / aramayı temizle). Sonraki fazlara açık. */
  action?: ReactNode;
  className?: string;
};

const ICON_BY_VARIANT: Record<AromaterapiEmptyVariant, string> = {
  empty: "🌿",
  filtered: "🔍",
  pending: "⏳",
};

/**
 * Aromaterapi ortak boş-durum bileşeni. Gerçek boş durum ile filtre-sonucu-boş
 * durumu ayırt edilebilecek sözleşmeye sahiptir (C3C'de filtre mantığı bu API'ye
 * bağlanır). Salt sunum.
 */
export function AromaterapiEmptyState({
  variant = "empty",
  icon,
  title,
  message,
  action,
  className = "",
}: AromaterapiEmptyStateProps) {
  return (
    <div
      className={`flex min-h-[300px] flex-col items-center justify-center rounded-[20px] border border-amber-100/70 bg-white/85 px-6 py-10 text-center shadow-sm ${className}`}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-emerald-50/70 text-4xl shadow-sm ring-1 ring-amber-100/70">
        {icon ?? ICON_BY_VARIANT[variant]}
      </div>
      <h3 className="mt-4 text-lg font-black text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-500">
        {message}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
