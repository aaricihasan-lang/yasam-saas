import type { NextRequest } from "next/server";
import { privNotFound, requirePrivateTrainer } from "@/lib/human-design/education/private/privateAccess";
import { clearLayer, getLayer, saveLayer, type AnnActorCtx } from "@/lib/human-design/education/annotations/annotationHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Eğitmenin özel eğitim arşivi kaydı üzerindeki KENDİ çizim katmanı (FAZ 8). Kapı: özel arşiv eğitmeni (TEK yetki +
 * arşiv anahtarı). DB RPC'si kaydın bu eğitmene ait ve ŞU AN erişilebilir (izin geçerli, kaynak değişmemiş) olduğunu
 * her çağrıda doğrular → izin geri çekilince katman da kapanır. Owner bu yüzü kullanmaz (yönetim: admin uçları).
 */
async function gate(req: NextRequest): Promise<{ ok: true; ctx: AnnActorCtx } | { ok: false; response: Response }> {
  const g = await requirePrivateTrainer(req);
  if (!g.ok) return { ok: false, response: g.response };
  if (g.ctx.kind !== "trainer") return { ok: false, response: privNotFound() };
  return { ok: true, ctx: { db: g.ctx.db, actorId: g.ctx.actorId } };
}

export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const g = await gate(req);
  if (!g.ok) return g.response;
  const { id } = await context.params;
  return getLayer(g.ctx, "private", String(id ?? ""));
}

export async function PUT(req: NextRequest, context: RouteContext): Promise<Response> {
  const g = await gate(req);
  if (!g.ok) return g.response;
  const { id } = await context.params;
  return saveLayer(req, g.ctx, "private", String(id ?? ""));
}

export async function DELETE(req: NextRequest, context: RouteContext): Promise<Response> {
  const g = await gate(req);
  if (!g.ok) return g.response;
  const { id } = await context.params;
  return clearLayer(req, g.ctx, "private", String(id ?? ""));
}
