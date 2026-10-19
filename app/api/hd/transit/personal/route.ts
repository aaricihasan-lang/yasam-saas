import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { readRoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import { callRoxyTransit } from "@/lib/human-design/transit/roxyTransitClient";
import { computePersonalTransit } from "@/lib/human-design/transit/personalTransitService";
import { resolveGeneralTransit } from "@/lib/human-design/transit/resolveTransit";
import { callRoxyPlanets } from "@/lib/human-design/transit/roxyPlanetsClient";
import { transitDataCache } from "@/lib/human-design/transit/transitDataCache";

export const runtime = "nodejs";

/**
 * POST /api/hd/transit/personal — { client_id, chart_id, date: YYYY-MM-DD, time: HH:MM } (Türkiye saati)
 *   Kayıtlı, doğrulanmış bireysel BodyGraph analizi üzerine seçilen anın transiti. Doğum verisi istemciden ALINMAZ.
 *   Aynı analiz + aynı dakika → önbellek (ücretli çağrı yok); eşzamanlılık kilidi + BodyGraph ile ortak kota.
 *   requireModuleAccess("human_design"); tenant YALNIZ guard'dan. Anahtar yalnız sunucuda. Hiçbir kayıt değişmez. no-store.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
  }
  const config = readRoxyServerConfig();
  const rateLimit = (scope: string, value: string, limit: number, windowSeconds: number) => hitDbRateLimit(guard.db, rateLimitBucket(scope, value), limit, windowSeconds);
  const log = (msg: string, detail?: unknown) => console.error(msg, detail ?? "");
  const r = await computePersonalTransit(
    { db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account },
    raw,
    {
      config,
      callTransit: (c, body, opts) => callRoxyTransit(c, body, opts),
      rateLimit,
      log,
      // Doğrulanmış referans: yerel motor + gerektiğinde bağımsız denetimli Roxy gezegen konumları (genel transitle AYNI çözücü)
      resolveTransit: (utc) =>
        resolveGeneralTransit(utc, { config, callPlanets: (c, body) => callRoxyPlanets(c, body), rateLimit, userId: guard.userId, tenantId: guard.tenantId, sharedCache: transitDataCache, log }),
    },
  );
  const headers: Record<string, string> = { ...NO_STORE };
  if (!r.body.ok && r.body.retryAfterSec) headers["Retry-After"] = String(r.body.retryAfterSec);
  return NextResponse.json(r.body, { status: r.status, headers });
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Yalnız POST desteklenir." }, { status: 405, headers: { ...NO_STORE, Allow: "POST" } });
}
