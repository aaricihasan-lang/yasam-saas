/**
 * Numeroloji analiz silme onay diyaloğu içeriği.
 *
 * AMAÇ (satış-öncesi UX sertleştirmesi): Silme onayında yalnız ADET değil,
 * silinecek kaydın/kayıtların ADI da gösterilir → yanlışlıkla silme riski azalır.
 *
 * Bu dosya SAF (pure) ve motor/veri ile ilgisizdir; yalnız kullanıcıya gösterilen
 * onay metnini üretir. Numeroloji hesap motoru (lib/numeroloji/**) DEĞİŞMEZ.
 */

/** Onay diyaloğunda en fazla kaç kayıt adı listelenir (kalanlar "+N kayıt daha"). */
export const MAX_DELETE_CONFIRM_NAMES = 10;

export type DeleteConfirmContent = {
  title: string;
  /** İlk (masaüstü + mobil 1. adım) onay mesajı. Çoklu seçimde satır-satır liste. */
  message: string;
  /** Mobil/PWA ikinci onay mesajı. */
  secondMessage: string;
};

/** Ad-soyad'ı görünüm için normalize eder (fazla boşlukları teke indirir, trimler). */
function normalizeDisplayName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * Silme onay içeriğini üretir.
 *
 * @param totalCount Silinecek toplam kayıt sayısı (ids.length). Gösterilen isim
 *   sayısından fazla olabilir (bazı isimler çözülemezse) → "+N kayıt daha" doğru kalır.
 * @param names Görünüm için çözülebilen ad-soyad listesi (totalCount'tan az olabilir).
 */
export function buildNumerolojiDeleteConfirm(
  totalCount: number,
  names: string[],
): DeleteConfirmContent {
  const clean = names.map(normalizeDisplayName).filter((n) => n.length > 0);

  // Tek kayıt (veya güvenli alt sınır): mümkünse adı tırnak içinde göster.
  if (totalCount <= 1) {
    const label = clean[0];
    return {
      title: "Analizi sil",
      message: label
        ? `"${label}" adlı numeroloji analizini kalıcı olarak silmek istiyor musunuz?`
        : "Bu numeroloji analizini kalıcı olarak silmek istiyor musunuz?",
      secondMessage: "Bu işlem geri alınamaz. Kayıt kalıcı olarak silinecek.",
    };
  }

  // Çoklu seçim: sayı + ilk MAX kadar isim (satır-satır) + kalan için "+N kayıt daha".
  const shown = clean.slice(0, MAX_DELETE_CONFIRM_NAMES);
  const remaining = totalCount - shown.length;
  const bullets = shown.map((n) => `• ${n}`).join("\n");
  const more = remaining > 0 ? `\n• +${remaining} kayıt daha` : "";

  return {
    title: "Seçili analizleri sil",
    message: `${totalCount} numeroloji analizini kalıcı olarak silmek üzeresiniz:\n${bullets}${more}`,
    secondMessage: "Bu işlem geri alınamaz. Seçili kayıtlar kalıcı olarak silinecek.",
  };
}
