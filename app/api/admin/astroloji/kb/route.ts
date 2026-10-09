import { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { readJsonBody, serviceJson } from "@/lib/astrology/http";
import { createKb, listKb } from "@/lib/astrology/kb/service";

export const runtime = "nodejs";

/** GET — uzmanın KENDİ Bilgi Bankası (?q= arama, ?kind= konu türü, ?tag=, ?topicKey=). */
export async function GET(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  return serviceJson(await listKb(gate.ctx, { search: sp.get("q"), kind: sp.get("kind"), tag: sp.get("tag"), topicKey: sp.get("topicKey") }));
}

/** POST — yeni kayıt. Gövde: { tradition, topicKey, title, body, sourceNote?, tags? } */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  return serviceJson(await createKb(gate.ctx, b.body));
}
