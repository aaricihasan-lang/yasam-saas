"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type AtlasSaveToastProps = {
  visible: boolean;
  onDismiss: () => void;
};

const MESSAGE = "Atlas kaydedildi. Organ bölgeleri Kayıtlı Atlas'a aktarıldı.";

export function AtlasSaveToast({ visible, onDismiss }: AtlasSaveToastProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(onDismiss, 2500);
    return () => window.clearTimeout(timer);
  }, [visible, onDismiss]);

  if (!visible || !mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed left-1/2 top-4 z-[9999] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0"
      role="status"
      aria-live="polite"
    >
      <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center text-sm font-bold leading-snug text-emerald-700 shadow-lg">
        {MESSAGE}
      </p>
    </div>,
    document.body,
  );
}
