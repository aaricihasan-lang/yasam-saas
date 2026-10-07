// Astroloji modülü — TEK YAPILANDIRMA NOKTASI (SAF; env yalnız parametre olarak okunur).
//
// SATIŞ SONRASI / OWNER-ONLY PİLOT (Aşama 1):
//   • Kill switch: `ASTROLOGY_MODULE_ENABLED` YALNIZ tam "true" ise modül vardır. Eksik/boş/"1"/
//     "TRUE" → modül YOKTUR: sayfa notFound(), API 404, admin menüsünde bağlantı yok. Production'da
//     bu env tanımlı değildir → kod prod'a çıksa bile modül herkes için (owner dahil) yoktur.
//   • NEXT_PUBLIC_ DEĞİLDİR → istemci paketine girmez.
//   • Roxy anahtarı: Human Design ile aynı sunucu env'i (`ROXY_API_KEY`). Ayrı anahtar kararı
//     Aşama 1 kapsamı dışında (owner kararı). Anahtar değeri hiçbir zaman loglanmaz/dönülmez.

export function isAstrologyModuleEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ASTROLOGY_MODULE_ENABLED === "true";
}

/** Sağlayıcı kimliği (veri modelinde `provider` kolonu). Gelecekte: "yasam_engine" vb. */
export const ROXY_PROVIDER = "roxy" as const;

/** Resmi base URL (OpenAPI v2.0.0, 2026-10-07 doğrulandı). */
export const ROXY_DEFAULT_BASE_URL = "https://roxyapi.com/api/v2";
/** Sağlayıcı API sürümü — önbellek anahtarının parçası (değişirse yeni hesap). */
export const ROXY_API_VERSION = "v2@2.0.0";

/** Sağlayıcı yanıt dili. Yorum katmanı Türkçe gelir; teknik katman dilden bağımsızdır. */
export const ASTRO_PROVIDER_LANG = "tr" as const;

export const ASTRO_ROXY_TIMEOUT_MS = 20_000;

/** Ücretli çağrı koruması (astroloji kendi kovaları — Human Design kotasıyla karışmaz). */
export const ASTRO_RATE_LIMITS = Object.freeze({
  /** Owner/uzman başına saatte en fazla N yeni sağlayıcı çağrısı. */
  perUser: { limit: 60, windowSeconds: 60 * 60 },
  /** Tenant başına günde en fazla N yeni sağlayıcı çağrısı. */
  perTenant: { limit: 300, windowSeconds: 24 * 60 * 60 },
  /** Aynı normalize girdi için eşzamanlı çağrı kilidi (çift tık / yeniden deneme / çoklu instance). */
  inFlight: { limit: 1, windowSeconds: 25 },
});

/** Bir çalıştırmada (tek istek) en fazla kaç hesap birimi planlanabilir. */
export const ASTRO_MAX_SELECTIONS_PER_RUN = 20;

/**
 * Bu eşiğin ÜSTÜNDE yeni sağlayıcı isteği gerektiren çalıştırmalar açık onay ister
 * (`confirmNewRequests` = planlanan sayı). Aşama 1'de tek teknik olduğundan pratikte tetiklenmez;
 * çoklu seçim altyapısının parçasıdır.
 */
export const ASTRO_CONFIRM_THRESHOLD = 10;

export type RoxyServerConfig = { apiKey: string; baseUrl: string };

/**
 * Sunucu Roxy yapılandırması. Anahtar yoksa null → 503 "yapılandırılmamış" (kayıtlı sonuçlar
 * yine okunabilir). https dışı base URL reddedilir (anahtar düz HTTP'ye gönderilmez).
 */
export function readAstroRoxyConfig(env: NodeJS.ProcessEnv = process.env): RoxyServerConfig | null {
  const apiKey = (env.ROXY_API_KEY ?? "").trim();
  if (!apiKey) return null;
  const rawBase = (env.ROXY_API_BASE_URL ?? "").trim() || ROXY_DEFAULT_BASE_URL;
  try {
    const u = new URL(rawBase);
    if (u.protocol !== "https:") return null;
    return { apiKey, baseUrl: u.toString().replace(/\/+$/, "") };
  } catch {
    return null;
  }
}
