import type { NextRequest } from "next/server";
import { requirePrivateOwner } from "@/lib/human-design/education/private/privateAccess";
import { listItems } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?trainer= — OWNER: tüm eğitmenlerin özel eğitim kayıtları (isteğe bağlı eğitmen filtresi) + izin durumu. */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateOwner(req);
  if (!gate.ok) return gate.response;
  return listItems(req, gate.ctx);
}
