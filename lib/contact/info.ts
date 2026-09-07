/**
 * Merkezî Yaşam Sistemi kurumsal iletişim bilgileri (telefon + e-posta).
 *
 * Bu değerler HİÇBİR component içinde ikinci kez hard-code EDİLMEZ; müşteri
 * hizmetleri numarası ve kurumsal e-posta her yerde bu tek kaynaktan gelir.
 * Kişisel GSM numarası burada YOKTUR ve hiçbir yerde kullanılmaz.
 *
 * WhatsApp yapılandırması ayrı tutulur (bkz. `lib/contact/whatsapp.ts`);
 * müşteri hizmetleri hattı şu an WhatsApp Business numarasıyla aynı olsa da
 * ikisi anlamsal olarak bağımsızdır ve ayrı yönetilir.
 */

/** Kullanıcıya gösterilen okunur müşteri hizmetleri numarası. */
export const CUSTOMER_SERVICE_DISPLAY = "0850 307 20 93";

/** `tel:` deep-link için canonical (ülke kodlu, +'lı) biçim. */
export const CUSTOMER_SERVICE_TEL = "+908503072093";

/** Kurumsal iletişim e-posta adresi. */
export const CONTACT_EMAIL = "yasamsistemi@gmail.com";

/** `tel:` href üretir (canonical numara; boşluk yok, kırık link üretmez). */
export function buildTelHref(): string {
  return `tel:${CUSTOMER_SERVICE_TEL}`;
}

/** `mailto:` href üretir. */
export function buildMailtoHref(): string {
  return `mailto:${CONTACT_EMAIL}`;
}
