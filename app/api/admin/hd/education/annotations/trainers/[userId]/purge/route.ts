import type { NextRequest } from "next/server";
import { eduNotFound } from "@/lib/human-design/education/educationAccess";
import { requireTrainingAccessOwner } from "@/lib/human-design/education/educationTrainingAccess";
import { ownerPurge, ownerPurgePreview } from "@/lib/human-design/education/annotations/annotationHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ userId: string }> };

/**
 * FAZ 9 · EĞİTİM VERİLERİNİ KALICI SİL (yetki kapatmaktan AYRI owner işlemi). YALNIZ owner; yalnız eğitim yetkisi KAPALIYKEN.
 * GET  → önizleme (silinecek katman + özel kayıt sayısı; korunacak izin / denetim sayısı; onay ifadesi)
 * POST { expectedLayers, expectedItems, phrase } → sayılar birebir + "N KAYDI SİL". Süreye bağlı otomatik çağrı YOKTUR.
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireTrainingAccessOwner(req);
  if (!gate.ok) return eduNotFound();
  const { userId } = await context.params;
  return ownerPurgePreview({ db: gate.db, actorId: gate.ownerId }, String(userId ?? ""));
}

export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requireTrainingAccessOwner(req);
  if (!gate.ok) return eduNotFound();
  const { userId } = await context.params;
  return ownerPurge(req, { db: gate.db, actorId: gate.ownerId }, String(userId ?? ""));
}
