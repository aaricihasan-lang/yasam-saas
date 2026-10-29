import type { NextRequest } from "next/server";
import { requirePrivateOwner } from "@/lib/human-design/education/private/privateAccess";
import { withdrawConsent } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST — izni geri çeker (geri alınamaz); bağlı eğitim kayıtları ANINDA erişime kapanır. Gövde: { channel, confirm: true }. */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requirePrivateOwner(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  return withdrawConsent(req, String(id ?? ""), gate.ctx);
}
