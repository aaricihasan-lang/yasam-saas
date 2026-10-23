import type { NextRequest } from "next/server";
import { requirePrivateOwner } from "@/lib/human-design/education/private/privateAccess";
import { ownerJournal } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — OWNER iptal günlüğü (yalnız kimlik + zaman; SHA-256). Felaket kurtarma için DB dışına düzenli aktarılır. */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateOwner(req);
  if (!gate.ok) return gate.response;
  return ownerJournal(req, gate.ctx);
}

/** POST — geri yükleme SONRASI günlüğü uygular: { journal, confirm: true }. Arşiv açıkken reddedilir (409). */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateOwner(req);
  if (!gate.ok) return gate.response;
  return ownerJournal(req, gate.ctx);
}
