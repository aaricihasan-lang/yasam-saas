import type { NextRequest } from "next/server";
import { requirePrivateTrainer } from "@/lib/human-design/education/private/privateAccess";
import { listConsents, recordConsent } from "@/lib/human-design/education/private/privateHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?hdClientId= — KENDİ danışanının izin kayıtları (kanıt baytı dönmez). */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateTrainer(req);
  if (!gate.ok) return gate.response;
  return listConsents(req, gate.ctx);
}

/** POST — danışan izni + kanıt dosyası (PDF/PNG/JPEG ≤2 MB, base64). Danışan aktörün KENDİ tenant'ında olmalı. */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requirePrivateTrainer(req);
  if (!gate.ok) return gate.response;
  return recordConsent(req, gate.ctx);
}
