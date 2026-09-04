/**
 * lib/store/whatsapp.ts — Doğal Pazar WhatsApp click-to-chat yardımcıları.
 *
 * Business API/bot YOK. Standart güvenli wa.me click-to-chat. Numara store_settings'ten
 * gelir (hard-code YOK). Ürün bazlı, doğru URL-encode'lu, Türkçe karakter güvenli mesaj.
 *
 * Client-safe saf yardımcılar.
 */

import { STORE_BRAND_NAME, formatStorePrice } from "@/lib/store/types";

/**
 * Serbest telefon girdisini yalnız-rakam E.164 gövdesine indirger.
 * `+90 555 123 45 67` / `0 555 …` gibi girişleri temizler; baştaki 00 → çıkarılır,
 * tek baştaki 0 (yerel önek) düşürülür. Sonuç 8..15 hane değilse null.
 * NOT: Ülke kodu kullanıcı sorumluluğundadır; bu yalnız biçim normalize eder.
 */
export function normalizeWhatsappNumber(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let digits = input.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length > 1 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[0-9]{8,15}$/.test(digits)) return null;
  return digits;
}

export type WhatsappProductContext = {
  name: string;
  sku: string | null;
  price: number;
  currency: string;
};

/**
 * Ürün için önceden doldurulmuş WhatsApp mesajı. Kullanıcı göndermeden önce
 * WhatsApp arayüzünde değiştirebilir. SKU yoksa "Ürün Kodu" satırı gösterilmez.
 * Sistem-üretilen metin hiçbir sağlık iddiası içermez (yalnız kimlik/fiyat/bilgi talebi).
 */
export function buildWhatsappProductMessage(p: WhatsappProductContext): string {
  const lines = [
    `Merhaba, ${STORE_BRAND_NAME}'daki "${p.name}" ürünü hakkında bilgi almak istiyorum.`,
    "",
    `Ürün: ${p.name}`,
  ];
  if (p.sku && p.sku.trim()) lines.push(`Ürün Kodu: ${p.sku.trim()}`);
  lines.push(`Fiyat: ${formatStorePrice(p.price, p.currency)}`);
  return lines.join("\n");
}

/**
 * wa.me linki üretir. Numara yalnız-rakam olmalı (store_settings sözleşmesi).
 * Geçersiz/eksik numara → null (broken CTA üretilmez). Metin encodeURIComponent ile
 * kodlanır (Türkçe/özel karakter güvenli).
 */
export function buildWhatsappLink(numberDigits: string | null, message: string): string | null {
  const normalized = normalizeWhatsappNumber(numberDigits);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
