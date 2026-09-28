import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeModule, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { isActiveTopicInTenant } from "@/lib/beslenme/topicGuard";
import { TOPIC_SOURCE_COLUMNS, isUuid, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { linkSourceWithOptionalCreate } from "@/lib/beslenme/sourceLink";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };
const CREATE_KEYS = ["source_id", "new_source", "locator", "note", "sort_order"] as const;

/**
 * POST /topics/[id]/sources — mevcut kaynağı ({ source_id }) VEYA yeni kaynağı ({ new_source })
 * rehbere bağla. Oluştur+bağla tek istekte; bağ başarısızsa yeni kaynak geri silinir (orphan yok).
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id: topicId } = await ctx.params;
  if (!isUuid(topicId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);
  // Rehber bu tenant'a ait + aktif olmalı (legacy pasif rehberin alt kayıtları API'den de değişmez).
  if (!(await isActiveTopicInTenant(db, tenantId, topicId))) return beslenmeJson({ ok: false, code: "TOPIC_NOT_FOUND" }, 404);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, CREATE_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  const r = await linkSourceWithOptionalCreate(
    db,
    tenantId,
    { table: "nutrition_topic_sources", parentColumn: "topic_id", parentId: topicId, columns: TOPIC_SOURCE_COLUMNS },
    body,
  );
  if (!r.ok) return beslenmeJson({ ok: false, code: r.code === "NOT_FOUND" ? "TOPIC_OR_SOURCE_NOT_FOUND" : r.code }, r.status);
  return NextResponse.json({ ok: true, link: r.link, source: r.source }, { status: 201 });
}
