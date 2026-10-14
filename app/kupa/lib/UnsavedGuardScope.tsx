"use client";

import type { ReactNode } from "react";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";
import { ProtocolDirtyProvider, useAnyProtocolDirty, useConfirmLeave } from "../protokoller/hooks/protocolDirty";

/**
 * KUPA & HACAMAT — sayfa geneli kaydedilmemiş-değişiklik koruması KAPSAMI (FINAL-A1).
 *
 * Protokol belgesindeki desenin aynısı (ProtocolDirtyProvider + useReportDirty + tek
 * useUnsavedChangesGuard), protokol dışı sayfalar için: CrudManager (noktalar / güvenlik /
 * kaynaklar / bilgi kütüphanesi) ve teknik çalışma alanı. Kapsam içindeki her form kendi kirli
 * durumunu `useReportDirty(key, dirty)` ile bildirir; sayfada TEK koruma kurulur (çift onay YOK).
 * Uyarı yalnız gerçek değişiklik varken çıkar (link / geri / yenileme).
 */
export function KupaUnsavedGuardScope({ children }: { children: ReactNode }) {
  return (
    <ProtocolDirtyProvider>
      <GuardHost />
      {children}
    </ProtocolDirtyProvider>
  );
}

function GuardHost() {
  const anyDirty = useAnyProtocolDirty();
  const confirmLeave = useConfirmLeave();
  useUnsavedChangesGuard(anyDirty, confirmLeave);
  return null;
}
