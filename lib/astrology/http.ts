// Astroloji — route yardımcıları (YALNIZ SUNUCU): JSON gövde okuma, no-store yanıt, motor
// bağımlılıkları (gerçek Roxy istemcisi + DB rate limit + PII'siz log).

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { readAstroRoxyConfig } from "./config";
import { callRoxy } from "./providers/roxy/client";
import { ASTRO_NO_STORE } from "./access/ownerGate";
import type { EngineDeps, ServiceResponse } from "./engine/service";

assertServerOnly("lib/astrology/http");

export async function readJsonBody(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: ASTRO_NO_STORE }),
    };
  }
}

export function serviceJson(r: ServiceResponse): NextResponse {
  const headers: Record<string, string> = { ...ASTRO_NO_STORE };
  const retry = (r.body as { retryAfterSec?: unknown }).retryAfterSec;
  if (typeof retry === "number" && retry > 0) headers["Retry-After"] = String(retry);
  return NextResponse.json(r.body, { status: r.status, headers });
}

/** PII'siz sunucu logu: yalnız önceden süzülmüş ayrıntı nesnesi (tür/durum/hash öneki). */
export function astroLog(msg: string, detail?: Record<string, unknown>): void {
  console.error(msg, detail ?? {});
}

export function realEngineDeps(db: SupabaseClient): EngineDeps {
  return {
    config: readAstroRoxyConfig(),
    callProvider: (config, endpoint, body, opts) => callRoxy(config, endpoint, body, { lang: opts.lang }),
    rateLimit: async (scope, value, limit, windowSeconds) => {
      const r = await hitDbRateLimit(db, rateLimitBucket(scope, value), limit, windowSeconds);
      return { allowed: r.allowed, retryAfterSec: r.retryAfterSec };
    },
    log: astroLog,
  };
}
