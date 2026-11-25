"use client";

import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useReflexologySyncStatus } from "@/app/refleksoloji/components/SyncStatusBadge";
import { useSyncStatusText } from "@/app/refleksoloji/hooks/useSyncStatusText";

type AtlasSaveToastProps = {
  visible: boolean;
  onDismiss: () => void;
  /** Kayıt anındaki senkron durum sırası — yalnız bundan SONRAKİ sonuç gösterilir. */
  sinceSeq: number;
  /** Demo: sunucu senkronu yok → yalnız cihaz mesajı. */
  localOnly?: boolean;
};

type Phase = "pending" | "synced" | "failed" | "conflict";

/**
 * RF-03 (UI doğruluğu): "kaydedildi" mesajı YALNIZ yerel yazımı değil, gerçek sunucu
 * sonucunu yansıtır. Kayıt anında "bu cihaza kaydedildi — gönderiliyor"; senkron sonucu
 * gelince "kaydedildi ve eşitlendi" veya "gönderilemedi" olur.
 */
export function AtlasSaveToast({ visible, onDismiss, sinceSeq, localOnly = false }: AtlasSaveToastProps) {
  const t = useTranslations("reflexology.zoneMap.saveToast");
  const [mounted, setMounted] = useState(false);
  const status = useReflexologySyncStatus();
  const statusText = useSyncStatusText();

  useEffect(() => {
    setMounted(true);
  }, []);

  const fresh = status.seq > sinceSeq;
  let phase: Phase = "pending";
  if (localOnly) phase = "synced";
  else if (fresh && status.state === "synced") phase = "synced";
  else if (fresh && (status.state === "error" || status.state === "offline")) phase = "failed";
  else if (fresh && status.state === "conflict") phase = "conflict";

  useEffect(() => {
    if (!visible) return;
    const ms = phase === "synced" ? 2500 : phase === "pending" ? 25000 : 7000;
    const timer = window.setTimeout(onDismiss, ms);
    return () => window.clearTimeout(timer);
  }, [visible, onDismiss, phase]);

  if (!visible || !mounted) return null;

  const text = localOnly
    ? t("localOnly")
    : phase === "synced"
      ? t("synced")
      : phase === "failed"
        ? t("failed")
        : phase === "conflict"
          ? statusText(status)
          : t("pending");
  const tone =
    phase === "synced"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : phase === "pending"
        ? "border-violet-200 bg-violet-50 text-violet-800"
        : "border-amber-300 bg-amber-50 text-amber-900";

  return createPortal(
    <div
      className="pointer-events-none fixed left-1/2 top-4 z-[9999] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0"
      role="status"
      aria-live="polite"
    >
      <p className={`rounded-2xl border px-5 py-4 text-center text-sm font-bold leading-snug shadow-lg ${tone}`}>
        {text}
      </p>
    </div>,
    document.body,
  );
}
