import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { readRoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import { callRoxyTransit } from "@/lib/human-design/providers/roxy/transitClient";
import { computePersonalTransit } from "@/lib/human-design/transit/personalTransitService";

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
  const r = await computePersonalTransit(
    { db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account },
    raw,
    {
      config: readRoxyServerConfig(),
      callTransit: (config, body, opts) => callRoxyTransit(config, body, opts),
      rateLimit: (scope, value, limit, windowSeconds) => hitDbRateLimit(guard.db, rateLimitBucket(scope, value), limit, windowSeconds),
      log: (msg, detail) => console.error(msg, detail ?? ""),
    },
  );
  const headers: Record<string, string> = { ...NO_STORE };
  if (!r.body.ok && r.body.retryAfterSec) headers["Retry-After"] = String(r.body.retryAfterSec);
  return NextResponse.json(r.body, { status: r.status, headers });
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Yalnız POST desteklenir." }, { status: 405, headers: { ...NO_STORE, Allow: "POST" } });
}
