import { readRoxyServerConfig, type RoxyServerConfig } from "../providers/roxy/config";

/**
 * Demo hesabı — ücretli sağlayıcı (RoxyAPI) politikası (owner kararı 2026-11-01, D2).
 *
 * Herkese açık demo hesabında (users.is_demo_account=true) transit çözücüsü sağlayıcı yapılandırması ALMAZ (`null`).
 * Sonuç (resolveTransit.ts ile izlenmiş):
 *   • Önceden doğrulanıp önbelleğe yazılmış gezegen konumları (süreç L1, kalıcı L2 tablo, Next Data Cache) OKUNMAYA
 *     devam eder → görüntüleme sürer, ücretsiz.
 *   • Önbellekte yoksa ücretli çağrı, kilit ve kota HİÇ denenmez: ProviderUnavailable("not_configured") →
 *     yerel motor sonucu "unresolved" (belirsiz aktivasyonlar kesin gösterilmez). Hiçbir katmana yazılmaz.
 * Demo olmayan uzman ve admin için davranış DEĞİŞMEZ (yapılandırma aynen okunur).
 */
export function transitProviderConfigFor(
  isDemo: boolean | undefined,
  read: () => RoxyServerConfig | null = readRoxyServerConfig,
): RoxyServerConfig | null {
  return isDemo === true ? null : read();
}
