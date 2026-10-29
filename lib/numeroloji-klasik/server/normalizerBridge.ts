/**
 * Klasik Numeroloji — normalize/doğrulama katmanına İNCE köprü (YALNIZ SUNUCU).
 *
 * `lib/numeroloji-klasik/normalize/index.ts` ayrı bir çalışma kolunda yazılır; sözleşme:
 *   normalizeEndpointResponse(id, raw) → { ok: true; data } | { ok: false; reason }
 *   verifyWithOracle(id, input, normalized) → unknown (bağımsız Pisagor/Kalde hesabıyla karşılaştırma)
 * Servis bu fonksiyonları `deps` üzerinden alır → testler sahte normalizer enjekte eder.
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { normalizeEndpointResponse, verifyWithOracle } from "../normalize";
import type { NormalizeFn, VerifyFn } from "./types";

assertServerOnly("lib/numeroloji-klasik/server/normalizerBridge");

export const defaultNormalize: NormalizeFn = (id, raw) => normalizeEndpointResponse(id, raw);
export const defaultVerify: VerifyFn = (id, input, normalized) => verifyWithOracle(id, input, normalized);
