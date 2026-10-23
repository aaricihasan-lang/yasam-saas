import type { NextRequest } from "next/server";
import { requirePrivateTrainer } from "@/lib/human-design/education/private/privateAccess";
import { chartStatus } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — "Eğitim Arşivime Ekle" akışı: KENDİ kayıtlı haritasının uygunluğu (mükerrer / hesaplanmamış / danışansız) + o danışanın izinleri. */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const gate = await requirePrivateTrainer(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  return chartStatus(String(id ?? ""), gate.ctx);
}
