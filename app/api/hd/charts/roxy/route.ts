import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { computeRoxyChart } from "@/lib/human-design/api/roxyChartService";
import { readRoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import { callRoxyBodygraph } from "@/lib/human-design/providers/roxy/client";
import { guardReusedChartLocation } from "@/lib/human-design/location/reuseLocationGuard";

export const runtime = "nodejs";

/**
 * POST /api/hd/charts/roxy — RoxyAPI ile otomatik Human Design hesabı + kayıt.
 *
 * Güvenlik / sözleşme:
 *   - requireModuleAccess("human_design") → x-user-id + x-session-token binding; tenant SUNUCUDAN.
 *   - Gövde: { client_id, location_id } — doğum tarihi/saati danışan kaydından, tz/koordinat
 *     sunucudaki konum altyapısından çözülür (istemciye güvenilmez).
 *   - ROXY_API_KEY yalnız server env; yanıt/hata/log içinde ASLA yer almaz.
 *   - Aynı girdi → kayıtlı sonuç (Roxy çağrılmaz). Kayıtlı sonuç FARKLI bir doğum yeri adına ise
 *     (aynı hesap koordinatı) 409 — yanlış yer etiketli analiz açılmaz (reuseLocationGuard). Demo → 403. Rate limit + eşzamanlılık kilidi.
 *   - Görüntüleme bu uçtan YAPILMAZ: GET /api/hd/charts?id= kayıtlı sonucu okur (yeniden hesap yok).
 *   - Yanıt no-store; doğum verisi loglanmaz.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = await computeRoxyChart(
    { db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account },
    raw,
    {
      config: readRoxyServerConfig(),
      callRoxy: (config, body, opts) => callRoxyBodygraph(config, body, opts),
      rateLimit: (scope, value, limit, windowSeconds) =>
        hitDbRateLimit(guard.db, rateLimitBucket(scope, value), limit, windowSeconds),
      log: (msg, detail) => console.error(msg, detail ?? ""),
    },
  );

  if (result.body.ok && result.body.reused) {
    const g = await guardReusedChartLocation(guard.db, guard.tenantId, raw, result.body.id);
    if (!g.ok) return NextResponse.json(g.body, { status: g.status, headers: NO_STORE });
  }

  if (result.body.ok && !result.body.reused) {
    await trackUsage(guard, req, { module: "human_design", action: "analysis_run", subEntity: "chart", resourceId: result.body.id });
  } else if (!result.body.ok && result.status >= 500) {
    await trackUsage(guard, req, {
      module: "human_design",
      action: "action_failed",
      failedAction: "analysis_run",
      subEntity: "chart",
      errorClass: "server",
    });
  }

  const headers: Record<string, string> = { ...NO_STORE };
  if (!result.body.ok && result.body.retryAfterSec) headers["Retry-After"] = String(result.body.retryAfterSec);
  return NextResponse.json(result.body, { status: result.status, headers });
}

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { ok: false, code: "METHOD_NOT_ALLOWED", error: "Yalnız POST desteklenir." },
    { status: 405, headers: { ...NO_STORE, Allow: "POST" } },
  );
}
