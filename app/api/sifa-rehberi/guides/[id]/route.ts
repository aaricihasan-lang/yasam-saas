import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { validateGuideBody } from "@/lib/sifa-rehberi/limits";
import { isSifaUuid } from "@/lib/sifa-rehberi/ids";
import { serverErrorResponse } from "@/lib/sifa-rehberi/publicApiError";
import {
  nextVersionStamp,
  parseExpectedUpdatedAt,
  SIFA_STALE_MESSAGE,
} from "@/lib/sifa-rehberi/guideVersion";
import { trackUsage } from "@/lib/usage/trackUsage";

export const runtime = "nodejs";

/**
 * /api/sifa-rehberi/guides/[id] — tekil şifa rehberi kaydı (healing_guides).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA session/user kaydından alınır; body/query'den GÜVENİLMEZ.
 *   - GET/PATCH/DELETE her zaman .eq("tenant_id", tenantId).eq("id", id) ile bağlanır.
 *   - PATCH iyimser kilitlidir (SIFA-1): expected_updated_at zorunlu; bayat sürüm → 409 stale.
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
    source_kind,
    expert_note,
    attention,
    sort_order,
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
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;
  const { id } = await ctx.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Kayıt kimliği eksik." }, { status: 400 });
  }

  // Biçim guard'ı: geçersiz (non-UUID) id doğrudan `uuid` kolonuna gidip Postgres 22P02 →
  // sanitize 500 üretiyordu. İstemci-kaynaklı bu durum "kayıt yok" ile aynıdır → temiz 404.
  if (!isSifaUuid(id)) {
    return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
  }

  const { data, error } = await db
    .from("healing_guides")
    .select(GUIDE_DETAIL_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return serverErrorResponse({ route: "sifa/guides/[id]", action: "GET", tenantId, cause: error });
  }

  if (!data) {
    return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
  }

  return NextResponse.json({ ok: true, row: data });
}

// ─── PATCH /api/sifa-rehberi/guides/[id] ───────────────────────────────────────
export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  const { id } = await ctx.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Kayıt kimliği eksik." }, { status: 400 });
  }

  // Biçim guard'ı: geçersiz (non-UUID) id doğrudan `uuid` kolonuna gidip Postgres 22P02 →
  // sanitize 500 üretiyordu. İstemci-kaynaklı bu durum "kayıt yok" ile aynıdır → temiz 404.
  if (!isSifaUuid(id)) {
    return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
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

  // Girdi sertleştirme: alan uzunluk/şekil sınırları.
  const bodyError = validateGuideBody(body);
  if (bodyError) {
    return NextResponse.json({ ok: false, error: bodyError }, { status: 400 });
  }

  // SIFA-1 iyimser kilit — expected_updated_at HER PATCH'te ZORUNLU (içerik VE yalnız-görsel
  // gövdeler dahil). Karar: yalnız-görsel PATCH de bayat sekmeden gelirse daha yeni `images`
  // listesini ezebilir (başka sekmede eklenen görsel metadata'dan düşer → orphan obje); bu
  // yüzden muafiyet YOK. Tüm istemci çağıranlar (Kaydet + görsel ekle/sil persist) belirteci
  // yollar. Eksik → 400 SIFA_MISSING_VERSION; biçimsiz → 400 SIFA_INVALID_VERSION (sorgudan ÖNCE).
  // null yalnız updated_at'i NULL olan legacy kayıt içindir (.is(null) ile eşlenir).
  const version = parseExpectedUpdatedAt(body);
  if (!version.ok) {
    return NextResponse.json(
      { ok: false, code: version.code, error: version.error },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const expectedUpdatedAt = version.value;

  const fields = pickWritableFields(body);
  fields.updated_at = nextVersionStamp(expectedUpdatedAt);

  // Atomik koşullu güncelleme (tek cümle CAS): yalnız beklenen sürüm güncellenir.
  // SELECT-then-UPDATE'e zayıflatılMAZ.
  const base = db
    .from("healing_guides")
    .update(fields)
    .eq("tenant_id", tenantId)
    .eq("id", id);
  const { data, error } = await (expectedUpdatedAt === null
    ? base.is("updated_at", null)
    : base.eq("updated_at", expectedUpdatedAt)
  ).select("id,updated_at");

  if (error) {
    await trackUsage(guard, req, { module: "sifa_rehberi", action: "action_failed", failedAction: "record_updated", subEntity: "guide", errorClass: "server" });
    return serverErrorResponse({ route: "sifa/guides/[id]", action: "PATCH", tenantId, cause: error });
  }

  if (!data || data.length === 0) {
    // Satır güncellenmedi: kayıt (bu tenant'ta) varsa sürüm çakışması (409), yoksa 404.
    const { data: existing, error: existErr } = await db
      .from("healing_guides")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    if (existErr) {
      return serverErrorResponse({ route: "sifa/guides/[id]", action: "PATCH.staleCheck", tenantId, cause: existErr });
    }
    if (existing) {
      await trackUsage(guard, req, { module: "sifa_rehberi", action: "action_failed", failedAction: "record_updated", subEntity: "guide", errorClass: "conflict" });
      return NextResponse.json(
        { ok: false, stale: true, code: "SIFA_STALE_GUIDE", error: SIFA_STALE_MESSAGE },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
  }

  const row = data[0] as { id: string; updated_at: string | null };
  await trackUsage(guard, req, { module: "sifa_rehberi", action: "record_updated", subEntity: "guide", resourceId: id });
  // Yeni sürüm istemciye döner → aynı sekmenin sonraki yazımı (PUT sections / görsel) kendi
  // kendisiyle çakışmaz.
  return NextResponse.json({ ok: true, updated_at: row.updated_at ?? null });
}

// ─── DELETE /api/sifa-rehberi/guides/[id] ──────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  const { id } = await ctx.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Kayıt kimliği eksik." }, { status: 400 });
  }

  // Biçim guard'ı: geçersiz (non-UUID) id doğrudan `uuid` kolonuna gidip Postgres 22P02 →
  // sanitize 500 üretiyordu. İstemci-kaynaklı bu durum "kayıt yok" ile aynıdır → temiz 404.
  if (!isSifaUuid(id)) {
    return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
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
    await trackUsage(guard, req, { module: "sifa_rehberi", action: "action_failed", failedAction: "record_deleted", subEntity: "guide", errorClass: "server" });
    return serverErrorResponse({ route: "sifa/guides/[id]", action: "DELETE", tenantId, cause: error });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
  }

  await trackUsage(guard, req, { module: "sifa_rehberi", action: "record_deleted", subEntity: "guide", resourceId: id });
  return NextResponse.json({ ok: true });
}
