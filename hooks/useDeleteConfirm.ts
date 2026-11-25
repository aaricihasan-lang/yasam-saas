"use client";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useIsMobileOrPwa } from "@/hooks/useIsMobileOrPwa";
import { buildNameListLines, TR_MORE_RECORDS } from "@/lib/ui/deleteConfirmMessage";
import { requiresBulkDeleteGuard, runBulkDeleteConfirm } from "@/lib/ui/bulkDeleteGuard";
import { useBulkDeleteTexts } from "@/hooks/useBulkDeleteTexts";

// i18n-ignore: Türkçe kaynak yedeği (ekran metni common.deleteConfirm.irreversibleNotice; TR birebir)
export const IRREVERSIBLE_NOTICE = "Bu işlem geri alınamaz.";

/**
 * I18N-F1 — tekli silme onayının ekran metinleri. Varsayılan Türkçe metinler bugünküyle BİREBİR aynıdır;
 * hook ekran dilinin metinlerini katalogdan (common.deleteConfirm) verir.
 */
export type DeleteConfirmTexts = {
  irreversibleNotice: string;
  /** "Mesaj zaten geri alınamaz uyarısı içeriyor mu?" kontrolü — ekran dili + Türkçe (eski mesajlar). */
  irreversibleMarkers: readonly string[];
  moreRecords: (n: number) => string;
};

export const TR_DELETE_CONFIRM_TEXTS: DeleteConfirmTexts = {
  irreversibleNotice: IRREVERSIBLE_NOTICE,
  // i18n-ignore: eski Türkçe mesajlarda "uyarı zaten var mı" işareti (kontrol amaçlı; çevrilmez)
  irreversibleMarkers: ["geri alınamaz"],
  moreRecords: TR_MORE_RECORDS,
};

function containsMarker(message: string, marker: string): boolean {
  const words = marker.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return false;
  return new RegExp(words.join("\\s+"), "i").test(message);
}

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

/**
 * Mesaja ad listesini ve (gerekirse) geri alınamaz satırını ekler — saf, test edilebilir.
 * I18N-F1: "uyarı zaten var mı" kararı tek bir dile bağlı değildir; ekran dilinin işaretleri + Türkçe
 * işaret birlikte aranır (İngilizce mesaja Türkçe satır eklenmez, eski Türkçe mesajda tekrar oluşmaz).
 */
export function composeDeleteMessage(
  opts: Pick<DeleteConfirmOptions, "message" | "names" | "irreversible">,
  texts: DeleteConfirmTexts = TR_DELETE_CONFIRM_TEXTS,
): string {
  const parts: string[] = [opts.message.trim()];
  if (opts.names && opts.names.length > 0) {
    parts.push(buildNameListLines(opts.names, undefined, texts.moreRecords).join("\n"));
  }
  const irreversible = opts.irreversible ?? true;
  const markers = [...texts.irreversibleMarkers, ...TR_DELETE_CONFIRM_TEXTS.irreversibleMarkers];
  if (irreversible && !markers.some((m) => containsMarker(opts.message, m))) {
    parts.push(texts.irreversibleNotice);
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
  const t = useTranslations("common.deleteConfirm");
  const bulkTexts = useBulkDeleteTexts();

  // Ekran dili metinleri (Türkçe katalog değerleri bugünkü sabitlerle birebir aynıdır — tr-freeze + birim testi).
  const texts = useMemo(() => {
    const single: DeleteConfirmTexts = {
      irreversibleNotice: t("irreversibleNotice"),
      irreversibleMarkers: [t("irreversibleMarker")],
      moreRecords: (n) => t("moreRecords", { count: n }),
    };
    return { single, bulk: bulkTexts };
  }, [t, bulkTexts]);

  return async function deleteConfirm(opts: DeleteConfirmOptions): Promise<boolean> {
    const count = resolveDeleteCount(opts);
    if (requiresBulkDeleteGuard(count, opts.deleteAll)) {
      return runBulkDeleteConfirm(confirm, {
        count,
        deleteAll: opts.deleteAll,
        noun: opts.noun,
        irreversible: opts.irreversible,
        cancelText: opts.cancelText,
        texts: texts.bulk,
        detail: [
          opts.message.trim(),
          opts.names && opts.names.length > 0 ? buildNameListLines(opts.names, count, texts.single.moreRecords).join("\n") : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
    }

    // Adım 1: İlk onay
    const ok1 = await confirm({
      title: opts.title ?? t("title"),
      message: composeDeleteMessage(opts, texts.single),
      tone: "danger",
      confirmText: opts.confirmText ?? t("yes"),
      cancelText: opts.cancelText ?? t("cancel"),
      requireText: opts.requireText,
      requireTextLabel: opts.requireTextLabel,
    });
    if (!ok1) return false;

    // Adım 2: Yalnızca mobil/PWA'da ikinci onay (yazarak onay verilmişse gerek yok)
    if (isMobile && !opts.requireText) {
      const ok2 = await confirm({
        title: t("secondTitle"),
        message:
          opts.secondMessage ??
          (opts.irreversible === false ? t("secondMessage") : t("secondMessageIrreversible")),
        tone: "danger",
        confirmText: opts.secondConfirmText ?? (opts.irreversible === false ? t("secondConfirm") : t("secondConfirmIrreversible")),
        cancelText: opts.cancelText ?? t("cancel"),
      });
      if (!ok2) return false;
    }

    return true;
  };
}
