import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeModule, denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { FOOD_SOURCE_COLUMNS, isUuid, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { resolveFoodForWrite } from "@/lib/beslenme/foodEngine";
import { linkSourceWithOptionalCreate } from "@/lib/beslenme/sourceLink";

export const runtime = "nodejs";
type RouteCtx = { params: Promise<{ id: string }> };
const CREATE_KEYS = ["source_id", "new_source", "locator", "note", "sort_order"] as const;

/**
 * POST /foods/[id]/sources — mevcut kaynağı ({ source_id }) VEYA yeni kaynağı ({ new_source })
 * besine bağla. Sistem besininde uzmanın kişisel kopyası kullanılır (global satır değişmez).
 * Oluştur+bağla tek istekte; bağ başarısızsa yeni kaynak geri silinir (orphan yok).
 */
export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
  if (!guard.ok) return guard.response;
  const demo = denyDemoMutation(guard);
  if (demo) return demo;
  const { db, tenantId } = guard;
  const { id: foodId } = await ctx.params;
  if (!isUuid(foodId)) return beslenmeJson({ ok: false, code: "BAD_ID" }, 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400);
  }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, CREATE_KEYS)) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  if (body.source_id == null && body.new_source == null) return beslenmeJson({ ok: false, code: "BAD_SOURCE" }, 400);
  if (body.source_id != null && !isUuid(body.source_id)) return beslenmeJson({ ok: false, code: "BAD_SOURCE" }, 400);

  const write = await resolveFoodForWrite(db, tenantId, foodId);
  if (!write.ok) return beslenmeJson({ ok: false, code: write.code }, write.status);

  const r = await linkSourceWithOptionalCreate(
    db,
    tenantId,
    { table: "nutrition_food_sources", parentColumn: "food_id", parentId: write.food.id, columns: FOOD_SOURCE_COLUMNS },
    body,
  );
  if (!r.ok) return beslenmeJson({ ok: false, code: r.code === "NOT_FOUND" ? "FOOD_OR_SOURCE_NOT_FOUND" : r.code }, r.status);
  return NextResponse.json(
    { ok: true, link: r.link, source: r.source, food_id: write.food.id, personalized: write.forked },
    { status: 201 },
  );
}
