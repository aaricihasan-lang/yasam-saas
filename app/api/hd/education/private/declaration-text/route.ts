import type { NextRequest } from "next/server";
import { requirePrivateTrainer } from "@/lib/human-design/education/private/privateAccess";
import { declarationText } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — FAZ 14: gerçek danışan için eğitmen beyanı metni (hukuk + owner onaylı güncel sürüm). Onaylı metin yoksa 409. */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateTrainer(req);
  if (!gate.ok) return gate.response;
  return declarationText(gate.ctx);
}
