import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, POINT_TOPIC_WRITABLE } from "@/lib/cupping/fields";
import {
  assertOwnedRef,
  insertEntity,
  listEntity,
  parseJsonBody,
  pickWritable,
} from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/point-topics — konu ↔ nokta M:N ilişkisi.
 *
 * GET ?topicId= → o konuya ilişkili point_id'ler (imza özelliği: "konu → haritada göster"
 * için nokta çözümü). ?pointId= → o noktanın konuları. Filtre yoksa tüm ilişkiler.
 * POST: hem point_id hem topic_id AYNI tenant'a ait olmalı. Demo: yazma yok.
 *
 * NOT: Bu M:N ilişki "rahatsızlık → tedavi" anlamı taşımaz; kaynaklı geleneksel
 * kullanım/ilişki verisidir (relation_strength/source_note ile).
 */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const topicId = req.nextUrl.searchParams.get("topicId")?.trim();
  const pointId = req.nextUrl.searchParams.get("pointId")?.trim();
  const eqFilters: Record<string, string> = {};
  if (topicId) eqFilters.topic_id = topicId;
  if (pointId) eqFilters.point_id = pointId;

  const res = await listEntity(db, CUPPING_TABLES.pointTopics, tenantId, {
    orderBy: "created_at",
    ascending: true,
    eqFilters,
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, relations: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, relation: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const fields = pickWritable(parsed.data, POINT_TOPIC_WRITABLE);

  const [pointOwned, topicOwned] = await Promise.all([
    assertOwnedRef(db, CUPPING_TABLES.points, tenantId, fields.point_id),
    assertOwnedRef(db, CUPPING_TABLES.topics, tenantId, fields.topic_id),
  ]);
  if (!pointOwned || !topicOwned) {
    return NextResponse.json(
      { ok: false, error: "Nokta veya konu bu hesaba ait değil." },
      { status: 400 },
    );
  }

  const res = await insertEntity(db, CUPPING_TABLES.pointTopics, tenantId, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, relation: res.data });
}
