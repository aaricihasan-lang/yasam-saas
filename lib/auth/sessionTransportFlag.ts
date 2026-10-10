/**
 * HTTPONLY H6a — WEB OTURUM TAŞIMA BAYRAĞI (saf; sunucu + istemci).
 *
 * Kök layout her istekte `<html data-session-transport="cookie|header">` basar (SSR). İstemci bu
 * işarete göre web isteklerinde `x-session-token` başlığını gönderip göndermeyeceğine karar verir:
 *   - "cookie": web yalnız HttpOnly cookie ile kimliklenir (başlık YOK). localStorage token SİLİNMEZ
 *               (H6a boyunca rollback emniyeti).
 *   - "header": H5 davranışı (token varsa başlık gönderilir).
 * Sunucu "cookie" yalnız SESSION_COOKIE_MODE=primary iken ve kill-switch kapalıyken üretir; Android
 * isteğine her zaman "header" verilir (istemcide de ayrıca Android dalı vardır).
 *
 * KILL-SWITCH: SESSION_COOKIE_WEB_HEADER=on (+ redeploy) → tüm web "header" yoluna döner; mod primary
 * kalabilir. Token localStorage'da durduğu için eski header yolu hemen çalışır.
 */
export const SESSION_TRANSPORT_HTML_ATTR = "data-session-transport";

export type WebSessionTransport = "cookie" | "header";

export function parseWebSessionTransport(value: string | null | undefined): WebSessionTransport {
  return value === "cookie" ? "cookie" : "header";
}
