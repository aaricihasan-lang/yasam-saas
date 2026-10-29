import type { NextRequest } from "next/server";
import { eduNotFound } from "@/lib/human-design/education/educationAccess";
import { requireTrainingAccessOwner } from "@/lib/human-design/education/educationTrainingAccess";
import { ownerList } from "@/lib/human-design/education/annotations/annotationHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?kind=central|private&ref=<uuid> — YALNIZ platform owner: eğitmen çizim katmanlarının listesi (içerik YOK).
 * Diğer herkese (normal admin dahil) aynı 404. DB RPC'si owner'ı yeniden doğrular.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireTrainingAccessOwner(req);
  if (!gate.ok) return eduNotFound();
  return ownerList(req, { db: gate.db, actorId: gate.ownerId });
}
