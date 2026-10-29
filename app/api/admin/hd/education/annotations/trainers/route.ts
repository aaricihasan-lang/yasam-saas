import type { NextRequest } from "next/server";
import { eduNotFound } from "@/lib/human-design/education/educationAccess";
import { requireTrainingAccessOwner } from "@/lib/human-design/education/educationTrainingAccess";
import { ownerTrainers } from "@/lib/human-design/education/annotations/annotationHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — YALNIZ owner: eğitmen başına eğitim yetkisi + kayıt sayıları (içerik YOK). Diğer herkese aynı 404. */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireTrainingAccessOwner(req);
  if (!gate.ok) return eduNotFound();
  return ownerTrainers({ db: gate.db, actorId: gate.ownerId });
}
