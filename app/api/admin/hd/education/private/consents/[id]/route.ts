import type { NextRequest } from "next/server";
import { requirePrivateOwner } from "@/lib/human-design/education/private/privateAccess";
import { deleteConsent } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** DELETE — izni + kanıtını + bu izne bağlı eğitim kayıtlarını siler. Danışan / harita / analiz SİLİNMEZ. Gövde: { confirm: true }. */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requirePrivateOwner(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  return deleteConsent(req, String(id ?? ""), gate.ctx);
}
