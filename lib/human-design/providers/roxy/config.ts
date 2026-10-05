// RoxyAPI Human Design sağlayıcısı — TEK YAPILANDIRMA NOKTASI (server-only değerler).
//
// Politika değerleri (nodeType, lang, timeout, limitler) YALNIZ burada tanımlanır; kodun
// başka yerine dağıtılmaz. API anahtarı ASLA burada/kaynak kodda tutulmaz:
// yalnız sunucu ortam değişkeni `ROXY_API_KEY` (NEXT_PUBLIC_ DEĞİL) okunur.

export const ROXY_PROVIDER_ID = "roxyapi" as const;

/** Resmi base URL (roxyapi.com dokümantasyonu). Test/staging için ROXY_API_BASE_URL ile ezilebilir. */
export const ROXY_DEFAULT_BASE_URL = "https://roxyapi.com/api/v2";

export const ROXY_BODYGRAPH_ENDPOINT = "/human-design/bodygraph";

/** Adaptör sözleşme sürümü — değişirse idempotency anahtarı da değişir (yeni hesap). */
export const ROXY_ADAPTER_VERSION = "roxy-bodygraph-1";

export type RoxyPolicy = {
  /** Ay düğümü: "true" (gerçek/oskülatör) — üretim başlangıç politikası. */
  nodeType: "true" | "mean";
  /** Sağlayıcı açıklama dili (yalnız ham provider metinleri etkilenir). */
  lang: string;
  /** Tek çağrı zaman aşımı (ms). */
  timeoutMs: number;
};

export const ROXY_POLICY: Readonly<RoxyPolicy> = Object.freeze({
  nodeType: "true",
  lang: "tr",
  timeoutMs: 15_000,
});

/** Ücretli çağrı koruması — merkezi, ayarlanabilir. Yalnız GERÇEK Roxy çağrıları sayılır. */
export const ROXY_RATE_LIMITS = Object.freeze({
  /** Uzman başına: saatte en fazla N yeni hesap. */
  perUser: { limit: 20, windowSeconds: 60 * 60 },
  /** Tenant başına: günde en fazla N yeni hesap. */
  perTenant: { limit: 100, windowSeconds: 24 * 60 * 60 },
  /** Aynı girdi için eşzamanlı çağrı kilidi (çift tık / retry / çoklu instance). */
  inFlight: { limit: 1, windowSeconds: 20 },
});

export type RoxyServerConfig = { apiKey: string; baseUrl: string };

/**
 * Sunucu yapılandırması. Anahtar yoksa null → özellik "yapılandırılmamış" (503) döner,
 * manuel HD akışı etkilenmez. Anahtar değeri hiçbir zaman loglanmaz/dönülmez.
 */
export function readRoxyServerConfig(env: NodeJS.ProcessEnv = process.env): RoxyServerConfig | null {
  const apiKey = (env.ROXY_API_KEY ?? "").trim();
  if (!apiKey) return null;
  const rawBase = (env.ROXY_API_BASE_URL ?? "").trim() || ROXY_DEFAULT_BASE_URL;
  let baseUrl: string;
  try {
    const u = new URL(rawBase);
    if (u.protocol !== "https:") return null; // anahtar düz HTTP'ye gönderilmez
    baseUrl = u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
  return { apiKey, baseUrl };
}
