import type { NextRequest } from "next/server";
import { requirePrivateTrainer } from "@/lib/human-design/education/private/privateAccess";
import { consentText } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — owner'ın kullanıma onayladığı GÜNCEL izin metni (sürüm + SHA-256). Onaylı metin yoksa 409. */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateTrainer(req);
  if (!gate.ok) return gate.response;
  return consentText(gate.ctx);
}
