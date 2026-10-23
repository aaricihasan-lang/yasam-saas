import type { NextRequest } from "next/server";
import { requirePrivateOwner } from "@/lib/human-design/education/private/privateAccess";
import { ownerAction, ownerOverview } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — OWNER genel bakış: arşiv anahtarı, izin metni sürümleri, etkin yetkiler, eğitmen bazında kayıt sayıları. */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateOwner(req);
  if (!gate.ok) return gate.response;
  return ownerOverview(gate.ctx);
}

/** POST — OWNER işlemleri: { action: "open" | "close" | "grant" | "revoke" | "approveText", ... }. */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateOwner(req);
  if (!gate.ok) return gate.response;
  return ownerAction(req, gate.ctx);
}
