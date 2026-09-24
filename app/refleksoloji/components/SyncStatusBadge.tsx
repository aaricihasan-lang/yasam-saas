"use client";

import { useSyncExternalStore } from "react";
import {
  getReflexologySyncStatus,
  subscribeReflexologySyncStatus,
  type ReflexologySyncState,
} from "@/lib/refleksoloji/syncStatus";

/**
 * REF-007: sunucu senkron durumunu gösteren küçük rozet. "Kaydedildi" mesajı artık
 * yalnız YERELİ değil, GERÇEK sunucu sonucunu yansıtır; hata/çevrimdışı/conflict
 * görünür ve "yeniden dene" sunulur. SSR güvenli (idle → render yok).
 */
export function useReflexologySyncStatus() {
  return useSyncExternalStore(
    subscribeReflexologySyncStatus,
    getReflexologySyncStatus,
    getReflexologySyncStatus,
  );
}

const STYLE: Record<ReflexologySyncState, string> = {
  idle: "",
  syncing: "border-violet-200 bg-violet-50 text-violet-800",
  synced: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-300 bg-rose-50 text-rose-800",
  offline: "border-amber-300 bg-amber-50 text-amber-900",
  conflict: "border-amber-300 bg-amber-50 text-amber-900",
};

const DOT: Record<ReflexologySyncState, string> = {
  idle: "",
  syncing: "bg-violet-500 animate-pulse",
  synced: "bg-emerald-500",
  error: "bg-rose-500",
  offline: "bg-amber-500",
  conflict: "bg-amber-500",
};

export function SyncStatusBadge({ className = "" }: { className?: string }) {
  const status = useReflexologySyncStatus();
  if (status.state === "idle") return null;

  const showRetry =
    typeof status.retry === "function" &&
    (status.state === "error" || status.state === "offline" || status.state === "conflict");

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STYLE[status.state]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status.state]}`} aria-hidden />
      {status.message}
      {showRetry ? (
        <button
          type="button"
          onClick={() => status.retry?.()}
          className="ml-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold underline underline-offset-2 hover:opacity-80"
        >
          Yeniden dene
        </button>
      ) : null}
    </span>
  );
}
