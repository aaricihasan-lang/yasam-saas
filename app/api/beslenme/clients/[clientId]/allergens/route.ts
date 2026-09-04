import { NextRequest, NextResponse } from "next/server";
import { denyDemoMutation, beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireBeslenmeClient } from "@/lib/beslenme/clientRouteGuard";
import { cleanStr, hasOnlyKeys } from "@/lib/beslenme/contracts";
import { isUuid } from "@/lib/beslenme/planContracts";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ clientId: string }> };
const MAX_ALLERGENS = 30;

/**
 * Danışan BEYAN edilen alerjenler. Class A vocab REUSE. ADVISORY: food↔allergen
 * mapping olmadığı için otomatik plan uyarısı/güvenlik iddiası YOK.
 */
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { clientId } = await ctx.params;
  const g = await requireBeslenmeClient(req, clientId);
  if (!g.ok) return g.response;

  const { data, error } = await g.guard.db
    .from("nutrition_client_allergens")
    .select("id, allergen_id, note, created_at, nutrition_allergens(code, name_tr, name_en, is_major)")
    .eq("tenant_id", g.guard.tenantId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) return beslenmeJson({ ok: false, code: "ALLERGEN_READ_FAILED" }, 500);
  return NextResponse.json({ ok: true, allergens: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

/** PUT: tam-set replacement. Payload { allergens: [{ allergen_id, note? }] }. */
export async function PUT(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { clientId } = await ctx.params;
  const g = await requireBeslenmeClient(req, clientId);
  if (!g.ok) return g.response;
  const demo = denyDemoMutation(g.guard);
  if (demo) return demo;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return beslenmeJson({ ok: false, code: "BAD_JSON" }, 400); }
  if (!body || typeof body !== "object" || !hasOnlyKeys(body, ["allergens"])) {
    return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
  }
  const items = Array.isArray(body.allergens) ? body.allergens : null;
  if (!items) return beslenmeJson({ ok: false, code: "BAD_ALLERGENS" }, 400);
  if (items.length > MAX_ALLERGENS) return beslenmeJson({ ok: false, code: "TOO_MANY" }, 400);

  const parsed: Array<{ allergen_id: string; note: string | null }> = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!it || typeof it !== "object") return beslenmeJson({ ok: false, code: "BAD_ALLERGEN_ITEM" }, 400);
    const rec = it as Record<string, unknown>;
    if (!hasOnlyKeys(rec, ["allergen_id", "note"])) return beslenmeJson({ ok: false, code: "UNKNOWN_FIELD" }, 400);
    const id = String(rec.allergen_id ?? "");
    if (!isUuid(id)) return beslenmeJson({ ok: false, code: "BAD_ALLERGEN_ID" }, 400);
    if (seen.has(id)) continue;
    seen.add(id);
    parsed.push({ allergen_id: id, note: cleanStr(rec.note, 500) });
  }

  // vocab doğrula: tüm id'ler nutrition_allergens'ta olmalı.
  if (parsed.length > 0) {
    const ids = parsed.map((p) => p.allergen_id);
    const { data: vocab, error: vErr } = await g.guard.db
      .from("nutrition_allergens").select("id").in("id", ids);
    if (vErr) return beslenmeJson({ ok: false, code: "VOCAB_READ_FAILED" }, 500);
    if ((vocab?.length ?? 0) !== ids.length) return beslenmeJson({ ok: false, code: "UNKNOWN_ALLERGEN" }, 400);
  }

  // tam-set replacement (advisory veri; küçük set).
  const del = await g.guard.db.from("nutrition_client_allergens")
    .delete().eq("tenant_id", g.guard.tenantId).eq("client_id", clientId);
  if (del.error) return beslenmeJson({ ok: false, code: "ALLERGEN_CLEAR_FAILED" }, 500);

  if (parsed.length > 0) {
    const rows = parsed.map((p) => ({ tenant_id: g.guard.tenantId, client_id: clientId, allergen_id: p.allergen_id, note: p.note }));
    const ins = await g.guard.db.from("nutrition_client_allergens").insert(rows);
    if (ins.error) return beslenmeJson({ ok: false, code: "ALLERGEN_SAVE_FAILED" }, 500);
  }
  return NextResponse.json({ ok: true, count: parsed.length });
}
