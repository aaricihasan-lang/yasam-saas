/**
 * USAGE360 — MERKEZÎ ÖZELLİK BAYRAĞI.
 *
 * `USAGE360_ENABLED` yalnız tam olarak "true" iken yeni kullanım telemetrisi (ziyaret, ping,
 * modül açılışı, Usage360 olay satırları, günlük rollup) yazılır. Env yoksa / başka değerse
 * KAPALI: UsageTracker hiç ağ isteği atmaz, beacon 204 no-op döner, sunucu trackUsage
 * yalnız AŞAMA 1 öncesi davranışı (4 eski olay) korur.
 *
 * NEDEN varsayılan kapalı: canlı veri toplama gizlilik politikası güncellenmeden
 * başlamamalı (owner kararı). Auth/oturum/güvenlik sistemi bayraktan ETKİLENMEZ.
 * NEXT_PUBLIC değildir: istemciye yalnız root layout'un sunucuda okuduğu boolean geçer.
 */
export const USAGE360_ENABLE_FLAG = "USAGE360_ENABLED";

export function isUsage360Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[USAGE360_ENABLE_FLAG] === "true";
}
