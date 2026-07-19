"use client";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useIsMobileOrPwa } from "@/hooks/useIsMobileOrPwa";

export type DeleteConfirmOptions = {
  /** İlk dialog başlığı */
  title?: string;
  /** İlk dialog mesajı */
  message: string;
  /** Mobilde gösterilen ikinci dialog mesajı */
  secondMessage?: string;
  /** İlk onay onay-butonu metni (varsayılan "Evet") — "kaldırma" gibi silme-dışı işlemler için */
  confirmText?: string;
  /** Her iki onayda iptal-butonu metni (varsayılan "Vazgeç") */
  cancelText?: string;
  /** Mobil/PWA ikinci onay onay-butonu metni (varsayılan "Kalıcı Olarak Sil") */
  secondConfirmText?: string;
};

/**
 * Tüm silme işlemleri için ortak onay hook'u.
 *
 * - Masaüstü: tek adım onay (mevcut davranış korunur)
 * - Mobil/PWA: iki adım onay — yanlışlıkla silme koruması
 */
export function useDeleteConfirm() {
  const { confirm } = useConfirm();
  const isMobile = useIsMobileOrPwa();

  return async function deleteConfirm(opts: DeleteConfirmOptions): Promise<boolean> {
    // Adım 1: İlk onay
    const ok1 = await confirm({
      title: opts.title ?? "Silmek istediğinizden emin misiniz?",
      message: opts.message,
      tone: "danger",
      confirmText: opts.confirmText ?? "Evet",
      cancelText: opts.cancelText ?? "Vazgeç",
    });
    if (!ok1) return false;

    // Adım 2: Yalnızca mobil/PWA'da ikinci onay
    if (isMobile) {
      const ok2 = await confirm({
        title: "Son onay",
        message:
          opts.secondMessage ??
          "Bu işlem kalıcıdır. Yanlışlıkla silmediğinizden emin olun.",
        tone: "danger",
        confirmText: opts.secondConfirmText ?? "Kalıcı Olarak Sil",
        cancelText: opts.cancelText ?? "Vazgeç",
      });
      if (!ok2) return false;
    }

    return true;
  };
}
