import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { isClassicEnabled, isClassicProviderCallsEnabled } from "@/lib/numeroloji-klasik/flags";
import { classicJson, classicNotFound } from "@/lib/numeroloji-klasik/server/http";
import { readClassicProviderConfig } from "@/lib/numeroloji-klasik/server/providerClient";

export const runtime = "nodejs";

/**
 * GET /api/numeroloji-klasik/entitlements — ekranın neyi gösterebileceği (yalnız boolean'lar; sağlayıcı adı/anahtar YOK).
 * Bayrak kapalı → 404 (modül yok).
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const callsOn = isClassicProviderCallsEnabled() && readClassicProviderConfig() !== null;
  return classicJson(200, {
    ok: true,
    enabled: true,
    isDemo: guard.is_demo_account,
    canCompute: callsOn && !guard.is_demo_account,
    canWrite: !guard.is_demo_account,
    canLinkClients: !guard.is_demo_account && resolveModuleAccess(guard.profile?.role, guard.profile?.module_permissions, "clients"),
  });
}
