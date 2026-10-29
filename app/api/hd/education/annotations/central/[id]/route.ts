import type { NextRequest } from "next/server";
import { requireEducationViewer } from "@/lib/human-design/education/educationAccess";
import { getPublishedDetail } from "@/lib/human-design/education/educationStore";
import { annMiss, clearLayer, getLayer, saveLayer, type AnnActorCtx } from "@/lib/human-design/education/annotations/annotationHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Merkezî Hazır Eğitim Haritası üzerindeki eğitmenin KENDİ çizim katmanı (FAZ 8).
 * Kapı: TEK eğitim yetkisi (requireEducationViewer) + kayıt ŞU AN yayımlı ve geçerli (getPublishedDetail; katalogla aynı
 * karar). DB RPC'si aktörü, yetkiyi ve yayın durumunu ayrıca yeniden doğrular. Kayıt verisi bu uçtan DÖNMEZ.
 */
async function gate(req: NextRequest, context: RouteContext): Promise<{ ok: true; ctx: AnnActorCtx; id: string } | { ok: false; response: Response }> {
  const g = await requireEducationViewer(req);
  if (!g.ok) return { ok: false, response: g.response };
  const ctx: AnnActorCtx = { db: g.ctx.db, actorId: g.ctx.userId };
  const { id } = await context.params;
  const ref = String(id ?? "");
  try {
    if (!(await getPublishedDetail(g.ctx.db, ref))) return { ok: false, response: await annMiss(ctx) };
  } catch {
    return { ok: false, response: await annMiss(ctx) };
  }
  return { ok: true, ctx, id: ref };
}

export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const g = await gate(req, context);
  return g.ok ? getLayer(g.ctx, "central", g.id) : g.response;
}

/** PUT { doc, expectedRevision } — CAS kaydı (0 = yeni katman). */
export async function PUT(req: NextRequest, context: RouteContext): Promise<Response> {
  const g = await gate(req, context);
  return g.ok ? saveLayer(req, g.ctx, "central", g.id) : g.response;
}

/** DELETE { confirm: true, expectedRevision } — tüm katmanı temizle. Harita / merkezî kayıt ETKİLENMEZ. */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<Response> {
  const g = await gate(req, context);
  return g.ok ? clearLayer(req, g.ctx, "central", g.id) : g.response;
}
