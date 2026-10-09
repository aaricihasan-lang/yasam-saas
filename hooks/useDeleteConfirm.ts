"use client";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useIsMobileOrPwa } from "@/hooks/useIsMobileOrPwa";
import { buildNameListLines } from "@/lib/ui/deleteConfirmMessage";
import { requiresBulkDeleteGuard, runBulkDeleteConfirm } from "@/lib/ui/bulkDeleteGuard";

export const IRREVERSIBLE_NOTICE = "Bu işlem geri alınamaz.";

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
  /**
   * Silinecek kayıtların adları. Verilirse mesajın altına ilk 10 ad + "ve N kayıt daha"
   * olarak eklenir (toplu silmede gizli seçimi görünür kılmak için).
   */
  names?: readonly string[];
  /**
   * Geri alınamaz işlem mi? (varsayılan true). true iken masaüstünde de
   * "Bu işlem geri alınamaz." satırı eklenir. Gizleme/arşivleme/soft-delete gibi
   * geri alınabilir işlemler false geçmelidir.
   */
  irreversible?: boolean;
  /** Kritik silmelerde yazarak onay (ör. danışan adı). */
  requireText?: string;
  requireTextLabel?: string;
  /**
   * Silinecek kayıt sayısı. Verilmezse names.length kullanılır. 3 ve üzeri (veya deleteAll)
   * → sistem geneli 3 AŞAMALI toplu silme akışı (lib/ui/bulkDeleteGuard) zorunlu olur.
   */
  count?: number;
  /** "Tümünü Sil" — sayıdan bağımsız 3 aşamalı akış. */
  deleteAll?: boolean;
  /** 3 aşamalı akışta kayıt türü adı ("danışan", "taş"…; varsayılan "kayıt"). */
  noun?: string;
};

/** Onaylanacak kayıt sayısı: açık count > names.length > 1 (tekli silme). */
export function resolveDeleteCount(opts: Pick<DeleteConfirmOptions, "count" | "names">): number {
  if (typeof opts.count === "number" && Number.isFinite(opts.count)) return opts.count;
  if (opts.names && opts.names.length > 0) return opts.names.length;
  return 1;
}

/** Mesaja ad listesini ve (gerekirse) geri alınamaz satırını ekler — saf, test edilebilir. */
export function composeDeleteMessage(opts: Pick<DeleteConfirmOptions, "message" | "names" | "irreversible">): string {
  const parts: string[] = [opts.message.trim()];
  if (opts.names && opts.names.length > 0) {
    parts.push(buildNameListLines(opts.names).join("\n"));
  }
  const irreversible = opts.irreversible ?? true;
  if (irreversible && !/geri\s+alınamaz/i.test(opts.message)) {
    parts.push(IRREVERSIBLE_NOTICE);
  }
  return parts.join("\n\n");
}

/**
 * Tüm silme işlemleri için ortak onay hook'u.
 *
 * - Masaüstü: tek adım onay; geri alınamaz işlemlerde uyarı satırı da gösterilir
 * - Mobil/PWA: iki adım onay — yanlışlıkla silme koruması
 * - requireText: kritik silmelerde yazarak onay (tek adımda; mobilde ikinci adım yine sorulur)
 * - 3+ kayıt veya deleteAll: masaüstü/mobil fark etmeksizin 3 AYRI aşama (uyarı → ifade yazma →
 *   son onay). Bu durumda requireText (ör. "SİL") ikinci aşamadaki sayılı ifadeye dönüşür.
 */
export function useDeleteConfirm() {
  const { confirm } = useConfirm();
  const isMobile = useIsMobileOrPwa();

  return async function deleteConfirm(opts: DeleteConfirmOptions): Promise<boolean> {
    const count = resolveDeleteCount(opts);
    if (requiresBulkDeleteGuard(count, opts.deleteAll)) {
      return runBulkDeleteConfirm(confirm, {
        count,
        deleteAll: opts.deleteAll,
        noun: opts.noun,
        irreversible: opts.irreversible,
        cancelText: opts.cancelText,
        detail: [
          opts.message.trim(),
          opts.names && opts.names.length > 0 ? buildNameListLines(opts.names, count).join("\n") : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
    }

    // Adım 1: İlk onay
    const ok1 = await confirm({
      title: opts.title ?? "Silmek istediğinizden emin misiniz?",
      message: composeDeleteMessage(opts),
      tone: "danger",
      confirmText: opts.confirmText ?? "Evet",
      cancelText: opts.cancelText ?? "Vazgeç",
      requireText: opts.requireText,
      requireTextLabel: opts.requireTextLabel,
    });
    if (!ok1) return false;

    // Adım 2: Yalnızca mobil/PWA'da ikinci onay (yazarak onay verilmişse gerek yok)
    if (isMobile && !opts.requireText) {
      const ok2 = await confirm({
        title: "Son onay",
        message:
          opts.secondMessage ??
          (opts.irreversible === false
            ? "İşlemi onaylıyor musunuz?"
            : "Bu işlem kalıcıdır. Yanlışlıkla silmediğinizden emin olun."),
        tone: "danger",
        confirmText: opts.secondConfirmText ?? (opts.irreversible === false ? "Onayla" : "Kalıcı Olarak Sil"),
        cancelText: opts.cancelText ?? "Vazgeç",
      });
      if (!ok2) return false;
    }

    return true;
  };
}
