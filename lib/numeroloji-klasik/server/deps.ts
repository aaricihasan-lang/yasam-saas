/**
 * Klasik Numeroloji — route'lar için GERÇEK bağımlılık kablolaması (YALNIZ SUNUCU).
 * Testler bu dosyayı kullanmaz; servisi sahte bağımlılıklarla çağırır (ücretli çağrı YOK).
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { isClassicProviderCallsEnabled } from "../flags";
import { readCacheTtlDays, resolveCacheKeying } from "./cache";
import { defaultNormalize, defaultVerify } from "./normalizerBridge";
import { callClassicEndpoint, readClassicProviderConfig } from "./providerClient";
import { readQuotaFloor, readQuotaHeaderGap, sharedProviderQuotaState } from "./quota";
import type { ClassicServiceDeps } from "./service";

assertServerOnly("lib/numeroloji-klasik/server/deps");

let cacheDisabledLogged = false;

export function buildClassicServiceDeps(db: SupabaseClient, env: Record<string, string | undefined> = process.env): ClassicServiceDeps {
  const keying = resolveCacheKeying(env);
  if (!keying.enabled && !cacheDisabledLogged) {
    cacheDisabledLogged = true;
    console.error("[numeroloji-klasik] önbellek KAPALI: NUMEROLOGY_CLASSIC_CACHE_SECRET ve SUPABASE_SERVICE_ROLE_KEY yok (docs/numeroloji-klasik/SAKLAMA.md)");
  }
  return {
    providerCallsEnabled: isClassicProviderCallsEnabled(env),
    config: readClassicProviderConfig(env),
    callProvider: (config, id, payload, opts) => callClassicEndpoint(config, id, payload, opts),
    normalize: defaultNormalize,
    verify: defaultVerify,
    rateLimit: (scope, value, limit, windowSeconds) => hitDbRateLimit(db, rateLimitBucket(scope, value), limit, windowSeconds),
    quotaState: sharedProviderQuotaState,
    quotaFloor: readQuotaFloor(env),
    quotaHeaderGap: readQuotaHeaderGap(env),
    cacheSecret: keying.secret,
    cacheDisabled: !keying.enabled,
    cacheTtlDays: readCacheTtlDays(env),
    log: (msg, detail) => console.error(msg, detail ?? ""),
  };
}
