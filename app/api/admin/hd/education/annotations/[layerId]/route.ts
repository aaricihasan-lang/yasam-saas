import type { NextRequest } from "next/server";
import { eduNotFound } from "@/lib/human-design/education/educationAccess";
import { requireTrainingAccessOwner } from "@/lib/human-design/education/educationTrainingAccess";
import { ownerDelete, ownerGet } from "@/lib/human-design/education/annotations/annotationHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ layerId: string }> };

/** GET — owner katman incelemesi (denetime "owner_viewed" yazılır). Normal admin / eğitmen → 404. */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireTrainingAccessOwner(req);
  if (!gate.ok) return eduNotFound();
  const { layerId } = await context.params;
  return ownerGet({ db: gate.db, actorId: gate.ownerId }, String(layerId ?? ""));
}

/** DELETE { confirm: true } — owner katmanı kaldırır (yalnız eğitim çizimi; harita / danışan / merkezî kayıt ETKİLENMEZ). */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireTrainingAccessOwner(req);
  if (!gate.ok) return eduNotFound();
  const { layerId } = await context.params;
  return ownerDelete(req, { db: gate.db, actorId: gate.ownerId }, String(layerId ?? ""));
}
