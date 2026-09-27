/**
 * Hukuki metin ortak sabitleri (FAZ1 FINAL HARDENING — INFRA).
 *
 * TÜM hukuki/güven metinleri TASLAKTIR: yayın öncesi bir hukukçu tarafından
 * incelenmeli. Sayfalar ve onam bileşeni bu işareti görünür biçimde gösterir.
 * Saf modül (client + server).
 */

export const LEGAL_DRAFT_MARK = "TASLAK — hukuki inceleme gerekir";

export const LEGAL_DRAFT_NOTICE =
  "Bu metin bir taslaktır; yayın öncesinde hukuki inceleme gerekir. Bağlayıcı hukuki görüş yerine geçmez.";

/** Taslak metinlerin son düzenlenme etiketi (görünen). */
export const LEGAL_DRAFT_UPDATED_LABEL = "Taslak sürüm: Eylül 2026";

export type LegalPageLink = { href: string; label: string };

/** Güven/hukuk sayfaları arası gezinme (sayfa altı bağlantıları). */
export const LEGAL_PAGES: ReadonlyArray<LegalPageLink> = [
  { href: "/gizlilik-politikasi", label: "Gizlilik Politikası" },
  { href: "/kullanim-sartlari", label: "Kullanım Şartları" },
  { href: "/kvkk-aydinlatma", label: "KVKK Aydınlatma Şablonu" },
  { href: "/veri-isleme-sozlesmesi", label: "Veri İşleme Sözleşmesi" },
  { href: "/alt-isleyiciler", label: "Alt İşleyiciler" },
];
