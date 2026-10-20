import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { quotaCheck } from "@/lib/security/testQuotaExemption";
import { readRoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import { callRoxyVariables } from "@/lib/human-design/variables/roxyVariablesClient";
import { computeChartVariables } from "@/lib/human-design/variables/variablesService";

export const runtime = "nodejs";

/**
 * POST /api/hd/charts/variables — { chart_id } → kayıtlı bireysel analizin Dört Ok / PHS (Roxy Variables) ileri katmanı.
 *
 * Sıra: oturum (401) → human_design modülü (403) → hd_system_reading alt-yetkisi (403; admin geçer) → demo değil (403)
 *       → tenant-scoped kayıt (başka tenant = 404) → doğum anı doğrulaması → önbellek / kilit / ortak kota → Roxy
 *       → sözleşme + bağımsız yerel çapraz denetim (fail-closed).
 *   • Doğum verisi istemciden ALINMAZ. Roxy'ye yalnız kayıtlı doğum anı alanları gider. Anahtar yalnız sunucuda.
 *   • Yalnız açık kullanıcı eylemiyle çağrılır (harita açılışında otomatik çağrı YOK). Hiçbir kayıt değişmez. no-store.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (!hasModulePermissionForProfile(guard.profile, "hd_system_reading")) {
    return NextResponse.json({ ok: false, code: "VARIABLES_DENIED", error: "Dört Ok ve PHS analizi bu hesap için açık değil." }, { status: 403, headers: NO_STORE });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
  }
  const r = await computeChartVariables(
    { db: guard.db, tenantId: guard.tenantId, userId: guard.userId, isDemo: guard.is_demo_account },
    raw,
    {
      config: readRoxyServerConfig(),
      callVariables: (c, body, opts) => callRoxyVariables(c, body, opts),
      // Hacim kotaları geçici test muafiyetine (lib/security/testQuotaExemption) tabidir; kilit kapsamı muafiyet listesinde yoktur.
      rateLimit: (scope, value, limit, windowSeconds) =>
        quotaCheck(scope, guard.userId, () => hitDbRateLimit(guard.db, rateLimitBucket(scope, value), limit, windowSeconds), { isDemo: guard.is_demo_account, tenantId: guard.tenantId }),
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
