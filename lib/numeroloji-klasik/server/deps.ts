/**
 * Klasik Numeroloji — route'lar için GERÇEK bağımlılık kablolaması (YALNIZ SUNUCU).
 * Testler bu dosyayı kullanmaz; servisi sahte bağımlılıklarla çağırır (ücretli çağrı YOK).
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { isClassicProviderCallsEnabled } from "../flags";
import { readCacheSecret } from "./cache";
import { defaultNormalize, defaultVerify } from "./normalizerBridge";
import { callClassicEndpoint, readClassicProviderConfig } from "./providerClient";
import { readQuotaFloor, sharedProviderQuotaState } from "./quota";
import type { ClassicServiceDeps } from "./service";

assertServerOnly("lib/numeroloji-klasik/server/deps");

export function buildClassicServiceDeps(db: SupabaseClient, env: Record<string, string | undefined> = process.env): ClassicServiceDeps {
  return {
    providerCallsEnabled: isClassicProviderCallsEnabled(env),
    config: readClassicProviderConfig(env),
    callProvider: (config, id, payload, opts) => callClassicEndpoint(config, id, payload, opts),
    normalize: defaultNormalize,
    verify: defaultVerify,
    rateLimit: (scope, value, limit, windowSeconds) => hitDbRateLimit(db, rateLimitBucket(scope, value), limit, windowSeconds),
    quotaState: sharedProviderQuotaState,
    quotaFloor: readQuotaFloor(env),
    cacheSecret: readCacheSecret(env),
    log: (msg, detail) => console.error(msg, detail ?? ""),
  };
}
