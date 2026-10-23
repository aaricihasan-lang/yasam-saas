import type { NextRequest } from "next/server";
import { requirePrivateTrainer } from "@/lib/human-design/education/private/privateAccess";
import { rebindItem } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST — kaynak harita değiştiyse kaydın SAHİBİ güncel hesabı bilinçli olarak yeniden bağlar (izin hâlâ geçerli olmalı). */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requirePrivateTrainer(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  return rebindItem(String(id ?? ""), gate.ctx);
}
