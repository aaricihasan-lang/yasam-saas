/**
 * Hukuki / güven sayfaları ortak sabitleri (P1-6 — nihai ürün metni).
 *
 * "Son güncelleme" tarihi TEK sabittir; metinlerde anlamlı bir değişiklik yapıldığında
 * yalnız buradan güncellenir. Saf modül (client + server).
 */

/** Hukuki metinlerin son güncelleme tarihi (ISO, yalnız tarih). */
export const LEGAL_LAST_UPDATED_ISO = "2026-10-01";

/** Görünen etiket — LEGAL_LAST_UPDATED_ISO ile aynı gün. */
export const LEGAL_LAST_UPDATED_LABEL = "Son güncelleme: 1 Ekim 2026";

export type LegalPageLink = { href: string; label: string };

/** Güven/hukuk sayfaları arası gezinme (sayfa altı bağlantıları). */
export const LEGAL_PAGES: ReadonlyArray<LegalPageLink> = [
  { href: "/gizlilik-politikasi", label: "Gizlilik Politikası" },
  { href: "/kullanim-sartlari", label: "Kullanım Şartları" },
  { href: "/kvkk-aydinlatma", label: "Danışan Aydınlatma Metni" },
  { href: "/veri-isleme-sozlesmesi", label: "Veri İşleme Sözleşmesi" },
  { href: "/alt-isleyiciler", label: "Alt İşleyiciler" },
];
