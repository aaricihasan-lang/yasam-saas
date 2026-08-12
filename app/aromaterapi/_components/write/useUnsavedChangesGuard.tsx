"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useAromaterapiDirtyGuard } from "@/app/aromaterapi/_components/write/useAromaterapiDirtyGuard";
import { AromaterapiConfirmDialog } from "@/app/aromaterapi/_components/write/AromaterapiConfirmDialog";

/**
 * Aromaterapi V2 — kaydedilmemiş değişiklik (dirty) navigasyon koruması.
 *
 * İki katman:
 *   1) Sekme kapatma / yenileme → mevcut `useAromaterapiDirtyGuard` (native
 *      `beforeunload`).
 *   2) UYGULAMA İÇİ navigasyon (Vazgeç / form-içi geri bağlantısı) → `guard(proceed)`
 *      ile yakalanır: dirty ise `AromaterapiConfirmDialog` açılır, kullanıcı
 *      "Sayfada kal" veya "Kaydetmeden ayrıl" seçer. dirty değilse anında ilerler.
 *
 * KAPSAM SINIRI (Faz 1): Tarayıcı/Android donanım BACK ve modül-DIŞI global sidebar
 * Link'leri bu hook'la GARANTİ EDİLMEZ (kırılgan history interception'dan kaçınıldı).
 * Kullanım: form Cancel/geri aksiyonlarını `guard(() => router.back())` ile sarın ve
 * dönen `guardDialog`'u render edin. Save başarılı olunca `dirty=false` → guard pasif.
 */
export function useUnsavedChangesGuard(
  dirty: boolean,
  opts?: { beforeUnload?: boolean },
): {
  guard: (proceed: () => void) => void;
  guardDialog: ReactNode;
} {
  // beforeUnload varsayılan açık (bağımsız kullanım). AromaterapiFormShell false
  // geçer çünkü formlar zaten kendi `useAromaterapiDirtyGuard`'ını çağırır →
  // çift listener önlenir.
  useAromaterapiDirtyGuard(dirty && opts?.beforeUnload !== false);
  const [pending, setPending] = useState<(() => void) | null>(null);

  const guard = useCallback(
    (proceed: () => void) => {
      if (dirty) setPending(() => proceed);
      else proceed();
    },
    [dirty],
  );

  const confirmLeave = useCallback(() => {
    const proceed = pending;
    setPending(null); // önce kapat → çift-navigasyon koruması
    proceed?.();
  }, [pending]);

  const cancelLeave = useCallback(() => setPending(null), []);

  const guardDialog = (
    <AromaterapiConfirmDialog
      open={pending !== null}
      tone="danger"
      title="Kaydedilmemiş değişiklikler"
      description="Bu formda kaydedilmemiş değişiklikler var. Ayrılırsanız değişiklikleriniz kaybolur."
      confirmLabel="Kaydetmeden ayrıl"
      cancelLabel="Sayfada kal"
      onConfirm={confirmLeave}
      onCancel={cancelLeave}
    />
  );

  return { guard, guardDialog };
}
