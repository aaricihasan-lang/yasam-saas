import type { NextRequest } from "next/server";
import { requirePrivateOwner } from "@/lib/human-design/education/private/privateAccess";
import { deleteItems } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — özel eğitim kayıtlarını siler (yalnız eğitim kaydı; danışanın asıl haritası / Danışan Yolculuğu / analizler / merkezî katalog ETKİLENMEZ). Gövde: { ids, confirmCount, confirmPhrase? } — 3+ kayıtta "<N> KAYDI SİL". */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateOwner(req);
  if (!gate.ok) return gate.response;
  return deleteItems(req, gate.ctx);
}
