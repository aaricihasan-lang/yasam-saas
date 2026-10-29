import type { NextRequest } from "next/server";
import { requirePrivateTrainer } from "@/lib/human-design/education/private/privateAccess";
import { createItem, listItems } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — eğitmenin YALNIZ kendi özel eğitim kayıtları (notlar / harita verisi listede yok). */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateTrainer(req);
  if (!gate.ok) return gate.response;
  return listItems(req, gate.ctx, { selfOnly: true });
}

/** POST — KENDİ danışanının kayıtlı hesaplanmış haritasını izinle ekler. Yeni hesap / sağlayıcı çağrısı YOK (yalnız bağlantı). */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateTrainer(req);
  if (!gate.ok) return gate.response;
  return createItem(req, gate.ctx);
}
