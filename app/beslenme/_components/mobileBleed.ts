/**
 * Beslenme — telefon (< 640 px) TAM GENİŞLİK sözleşmesi (owner kararı 22.10.2026).
 *
 * BeslenmeShell telefonda dış yatay padding UYGULAMAZ (0 px). Bu yüzden:
 *  - Ana (dış) kartlar `BES_CARD_BLEED` alır → ekranın sağ/sol kenarına dayanır; köşe yuvarlaması ve
 *    yan çerçeve telefonda kalkar (üst/alt çizgi + gölge + iç padding korunur). sm+ DEĞİŞMEZ.
 *  - Kart DIŞI satırlar (durum çipleri, görünüm sekmeleri, düğme satırları, mesajlar) `BES_GUTTER`
 *    alır → metin/düğmeler ekran kenarına yapışmaz. sm+ DEĞİŞMEZ.
 * Tailwind sınıfları burada DÜZ metin olarak durur (kaynak taraması bulur).
 */
export const BES_CARD_BLEED = "max-sm:rounded-none max-sm:border-x-0";
export const BES_GUTTER = "max-sm:px-4";
/** Satır içi (inline-flex) öğe için yalnız soldan kenar boşluğu (genişliği değişmez). */
export const BES_GUTTER_INLINE = "max-sm:ml-4";
