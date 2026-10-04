import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { isUuid } from "@/lib/admin/memberRequestValidation";
import { mapPricingPhaseRow, validatePricingPhaseDraft, type PricingPhase } from "@/lib/admin/memberPricing";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

/** RPC hata kodu → HTTP + güvenli mesaj (ham DB mesajı istemciye DÖNMEZ). */
function rpcFailure(error: unknown, fallback: string) {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "UY004") return bad("Bu tarih aralığı uzmanın başka bir fiyat dönemiyle çakışıyor.", 409);
  if (code === "UY001") return bad("Fiyat dönemi bu arada başka bir işlemle değişmiş. Sayfayı yenileyip tekrar deneyin.", 409);
  if (code === "UY002") return bad("Fiyat dönemi yalnız uzman hesaplarında tutulur.", 409);
  if (code === "UY003") return bad("Geçersiz fiyat dönemi veya kayıt bulunamadı.", 400);
  return bad(fallback, 500);
}

function parseExpected(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 64 || !Number.isFinite(Date.parse(raw))) return undefined;
  return raw;
}

async function listPhases(db: SupabaseClient, userId: string): Promise<PricingPhase[] | null> {
  const { data, error } = await db.rpc("admin_pricing_phase_list", { p_user_id: userId });
  if (error) return null;
  return (Array.isArray(data) ? data : []).map(mapPricingPhaseRow).filter((p): p is PricingPhase => p !== null);
}

/**
 * /api/admin/users/[id]/pricing-phases — TİCARİ 360 fiyat dönemleri (admin kaydı; ödeme gateway DEĞİL).
 *
 *   GET    → dönem listesi (başlangıca göre)
 *   POST   { draft }                          → yeni dönem
 *   PATCH  { phaseId, expectedUpdatedAt, draft } → güncelle (bayat ekran → 409)
 *   DELETE { phaseId, expectedUpdatedAt }       → sil
 *
 * Güvenlik: verifyAdminRequest (aktif admin + token bağlama) → service_role → SECURITY DEFINER RPC.
 * Tablo anon/authenticated/service_role'e DOĞRUDAN kapalıdır. Yalnız UZMAN hedefi (aksi 409).
 * Çakışan aralık DB'de kilit altında reddedilir (UY004 → 409). Yazım + audit AYNI transaction'da;
 * audit'e tutar/etiket/not DEĞERİ yazılmaz (yalnız işlem türü + alan adları).
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");
  const phases = await listPhases(guard.db, id);
  if (phases === null) return bad("Fiyat dönemleri okunamadı.", 500);
  return NextResponse.json({ ok: true, phases }, { headers: NO_STORE });
}

async function save(req: NextRequest, ctx: RouteContext, mode: "create" | "update"): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db, adminId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");

  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const body = parsed.value;
  const allowed = mode === "create" ? new Set(["draft"]) : new Set(["draft", "phaseId", "expectedUpdatedAt"]);
  for (const k of Object.keys(body)) if (!allowed.has(k)) return bad("Beklenmeyen alan.");

  let phaseId: string | null = null;
  let expected: string | null = null;
  if (mode === "update") {
    if (!isUuid(body.phaseId)) return bad("Geçersiz fiyat dönemi ID.");
    phaseId = body.phaseId;
    const e = parseExpected(body.expectedUpdatedAt);
    if (e === undefined) return bad("Geçersiz sürüm bilgisi.");
    expected = e;
  }
  const v = validatePricingPhaseDraft(body.draft);
  if (!v.ok) return bad(v.error);

  const { data, error } = await db.rpc("admin_pricing_phase_save", {
    p_actor_admin_id: adminId,
    p_user_id: id,
    p_phase_id: phaseId,
    p_starts_on: v.value.startsOn,
    p_ends_on: v.value.endsOn,
    p_amount: v.value.amount,
    p_billing_period: v.value.billingPeriod,
    p_label: v.value.label,
    p_terms_note: v.value.termsNote,
    p_expected_updated_at: expected,
  });
  if (error) return rpcFailure(error, "Fiyat dönemi kaydedilemedi.");
  const res = (data ?? {}) as { changed?: unknown; phase?: unknown };
  const phases = await listPhases(db, id);
  return NextResponse.json(
    { ok: true, changed: res.changed !== false, phase: mapPricingPhaseRow(res.phase), phases: phases ?? [] },
    { status: mode === "create" ? 201 : 200, headers: NO_STORE },
  );
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  return save(req, ctx, "create");
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  return save(req, ctx, "update");
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db, adminId } = guard;
  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");

  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const body = parsed.value;
  for (const k of Object.keys(body)) if (k !== "phaseId" && k !== "expectedUpdatedAt") return bad("Beklenmeyen alan.");
  if (!isUuid(body.phaseId)) return bad("Geçersiz fiyat dönemi ID.");
  const expected = parseExpected(body.expectedUpdatedAt);
  if (expected === undefined) return bad("Geçersiz sürüm bilgisi.");

  const { error } = await db.rpc("admin_pricing_phase_delete", {
    p_actor_admin_id: adminId,
    p_user_id: id,
    p_phase_id: body.phaseId,
    p_expected_updated_at: expected,
  });
  if (error) return rpcFailure(error, "Fiyat dönemi silinemedi.");
  const phases = await listPhases(db, id);
  return NextResponse.json({ ok: true, deleted: true, phases: phases ?? [] }, { headers: NO_STORE });
}
