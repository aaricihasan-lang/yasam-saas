import type { NextRequest } from "next/server";
import { requirePrivateOwner } from "@/lib/human-design/education/private/privateAccess";
import { consentEvidence } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — izin kanıtı dosyası (SHA-256 DB'de doğrulanır; indirme; no-store). */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requirePrivateOwner(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  return consentEvidence(String(id ?? ""), gate.ctx);
}
