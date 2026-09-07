/**
 * Merkezî Yaşam Sistemi WhatsApp iletişim yapılandırması.
 *
 * Numara HİÇBİR component içinde hard-code EDİLMEZ; her yer bu helper'ı kullanır.
 * Kişisel GSM numarası burada YOKTUR ve hiçbir yerde kullanılmaz.
 *
 * WhatsApp Business numara doğrulaması henüz tamamlanmadığı için gate
 * varsayılan olarak KAPALIDIR (default-deny). Doğrulama tamamlandığında
 * yalnızca bu gate açılarak (NEXT_PUBLIC_WHATSAPP_CONTACT_ENABLED="true")
 * WhatsApp aksiyonu canlıya alınabilir — başka kod değişikliği gerekmez.
 */

/** Kullanıcıya gösterilen okunur biçim. */
export const WHATSAPP_DISPLAY_NUMBER = "0850 307 20 93";

/** wa.me link formatı için uluslararası/canonical biçim (ülke kodu + numara, +/boşluk yok). */
export const WHATSAPP_CANONICAL_NUMBER = "908503072093";

/** Üyelik & fiyat bilgisi için hazır mesaj. */
export const WHATSAPP_MEMBERSHIP_MESSAGE =
  "Merhaba, Yaşam Sistemi üyeliği ve fiyatlandırması hakkında bilgi almak istiyorum.";

/**
 * WhatsApp iletişim gate'i.
 *
 * Default-deny: yalnızca ortam değişkeni açıkça "true" ise etkinleşir.
 * Numara doğrulaması PASS olmadan production'da true YAPILMAZ.
 */
export const WHATSAPP_CONTACT_ENABLED =
  process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_ENABLED === "true";

/**
 * wa.me deep-link üretir. Mesaj URL-encode edilir.
 * Kırık/yarım link üretmemek için numara her zaman canonical biçimdedir.
 */
export function buildWhatsAppUrl(
  message: string = WHATSAPP_MEMBERSHIP_MESSAGE,
): string {
  const text = encodeURIComponent(message);
  return `https://wa.me/${WHATSAPP_CANONICAL_NUMBER}?text=${text}`;
}
