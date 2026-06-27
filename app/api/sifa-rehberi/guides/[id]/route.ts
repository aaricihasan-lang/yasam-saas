import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/sifa-rehberi/guides/[id] — tekil şifa rehberi kaydı (healing_guides).
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA session/user kaydından alınır; body/query'den GÜVENİLMEZ.
 *   - GET/PATCH/DELETE her zaman .eq("tenant_id", tenantId).eq("id", id) ile bağlanır.
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *
 * healing_guide_sections JOIN ile okunur (service_role'lü db).
 */

// healingGuideLiveData.ts ile aynı select (detay): legacy kolonlar + sections JOIN.
const GUIDE_DETAIL_SELECT = `
  id,
  tenant_id,
  name,
  category,
  symptoms,
  created_at,
  updated_at,
  related_stones,
  related_reflexology,
  images,
  general_summary,
  medical_causes,
  subconscious_causes,
  temperament_causes,
  other_causes,
  iridology_match,
  hand_analysis_match,
  cupping_leech,
  reflexology,
  diet_recommendations,
  herbal_methods,
  stone_recommendations,
  aromatherapy,
  meditation,
  breathwork,
  bioenergy,
  massage,
  daily_routine,
  sleep_routine,
  supportive_alternative_methods,
  islamic_recommendations,
  healing_guide_sections (
    id,
    guide_id,
    section_type,
    mode,
    title,
    note,
    source,
    images,
    created_at
  )
`;

const WRITABLE_GUIDE_KEYS = [
  "name",
  "category",
  "symptoms",
  "general_summary",
  "medical_causes",
  "subconscious_causes",
  "temperament_causes",
  "other_causes",
  "iridology_match",
  "hand_analysis_match",
  "cupping_leech",
  "reflexology",
  "diet_recommendations",
  "herbal_methods",
  "stone_recommendations",
  "aromatherapy",
  "meditation",
  "breathwork",
  "bioenergy",
  "massage",
  "daily_routine",
  "sleep_routine",
  "supportive_alternative_methods",
  "islamic_recommendations",
  "images",
  "related_stones",
  "related_reflexology",
] as const;

function pickWritableFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of WRITABLE_GUIDE_KEYS) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

type RouteCtx = { params: Promise<{ id: string }> };

// ─── GET /api/sifa-rehberi/guides/[id] ─────────────────────────────────────────
export async function GET(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;
  const { id } = await ctx.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Kayıt kimliği eksik." }, { status: 400 });
  }

  const { data, error } = await db
    .from("healing_guides")
    .select(GUIDE_DETAIL_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
  }

  return NextResponse.json({ ok: true, row: data });
}

// ─── PATCH /api/sifa-rehberi/guides/[id] ───────────────────────────────────────
export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  const { id } = await ctx.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Kayıt kimliği eksik." }, { status: 400 });
  }

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // name gönderildiyse boş olamaz.
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ ok: false, error: "Rahatsızlık adı zorunludur." }, { status: 400 });
    }
    body.name = name;
  }

  const fields = pickWritableFields(body);
  fields.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("healing_guides")
    .update(fields)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

// ─── DELETE /api/sifa-rehberi/guides/[id] ──────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  const { id } = await ctx.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Kayıt kimliği eksik." }, { status: 400 });
  }

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const { data, error } = await db
    .from("healing_guides")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
