import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { readRoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import { callRoxyConnection, callRoxyPenta } from "@/lib/human-design/providers/roxy/relationClient";
import { createRelationAnalysis, listRelationAnalyses } from "@/lib/human-design/relations/relationService";

export const runtime = "nodejs";

/**
 * İlişki ve Grup Analizleri (Human Design · Connection 2 kişi / Penta 3–5 kişi).
 *
 *   GET  /api/hd/relations[?client_id=] — kayıtlı analiz listesi (salt-okuma; Roxy çağrısı YOK).
 *   POST /api/hd/relations — { participants: [{ client_id, chart_id }], relation_type? }
 *        Kişi sayısı uç noktayı belirler. Doğum verisi istemciden ALINMAZ (kayıtlı, doğrulanmış
 *        BodyGraph analizinden). Kayıtlı sonuç → Roxy çağrılmaz; eşzamanlılık kilidi + ortak kota.
 *   requireModuleAccess("human_design"); tenant YALNIZ guard'dan. Anahtar yalnız sunucuda. no-store.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const clientId = new URL(req.url).searchParams.get("client_id");
  const r = await listRelationAnalyses(
    { db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account },
    { clientId: clientId || null },
  );
  if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: r.error }, { status: r.status, headers: NO_STORE });
  return NextResponse.json({ ok: true, rows: r.rows }, { status: 200, headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
  }
  const result = await createRelationAnalysis(
    { db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account },
    raw,
    {
      config: readRoxyServerConfig(),
      callConnection: (config, body, opts) => callRoxyConnection(config, body, opts),
      callPenta: (config, body, opts) => callRoxyPenta(config, body, opts),
      rateLimit: (scope, value, limit, windowSeconds) => hitDbRateLimit(guard.db, rateLimitBucket(scope, value), limit, windowSeconds),
      log: (msg, detail) => console.error(msg, detail ?? ""),
    },
  );
  if (result.body.ok && !result.body.reused) {
    await trackUsage(guard, req, { module: "human_design", action: "analysis_run", subEntity: "chart", resourceId: result.body.id });
  } else if (!result.body.ok && result.status >= 500) {
    await trackUsage(guard, req, { module: "human_design", action: "action_failed", failedAction: "analysis_run", subEntity: "chart", errorClass: "server" });
  }
  const headers: Record<string, string> = { ...NO_STORE };
  if (!result.body.ok && result.body.retryAfterSec) headers["Retry-After"] = String(result.body.retryAfterSec);
  return NextResponse.json(result.body, { status: result.status, headers });
}
