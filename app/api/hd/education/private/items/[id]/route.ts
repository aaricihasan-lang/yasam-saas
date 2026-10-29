import type { NextRequest } from "next/server";
import { requirePrivateTrainer } from "@/lib/human-design/education/private/privateAccess";
import { getItem, patchItem } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — ayrıntı. Erişim durumu (izin / kanıt / kaynak harita) HER okumada DB'de doğrulanır. */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requirePrivateTrainer(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  return getItem(String(id ?? ""), gate.ctx);
}

/** PATCH — yalnız eğitim alanları (başlık, takma ad, gösterim, kategori, açıklama, notlar). Doğum / hesap verisi DEĞİŞTİRİLEMEZ. */
export async function PATCH(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requirePrivateTrainer(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  return patchItem(req, String(id ?? ""), gate.ctx);
}
