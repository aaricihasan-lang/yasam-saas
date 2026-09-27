import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

// KAJ-P1-03: tenant-scoped update/delete. Her sorgu .eq("tenant_id", guard.tenantId) ile
// kelepçelenir → RLS'e EK savunma: başka tenant'ın kaydına PUT/DELETE 0 satır etkiler (404).
// service-role client guard.db üzerinden; tenant SESSION'dan türetilir, body'ye güvenilmez.

const CATEGORIES = ["before", "after", "general"] as const;
type Category = (typeof CATEGORIES)[number];
const MAX_RULE_TEXT = 2000;

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireModuleAccess(req, "cosmic_calendar");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account)
    return json({ ok: false, code: "DEMO_READONLY", error: "Demo hesap kural düzenleyemez." }, 403);
  const { db, tenantId } = guard;

  const { id } = await params;
  if (!id) return json({ ok: false, error: "Geçersiz istek." }, 400);

  let body: unknown;
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "Geçersiz istek." }, 400); }

  const b = (body ?? {}) as { rule_text?: unknown; category?: unknown; sort_order?: unknown };
  const patch: Record<string, unknown> = {};

  if (b.rule_text !== undefined) {
    if (typeof b.rule_text !== "string" || b.rule_text.trim() === "")
      return json({ ok: false, error: "rule_text boş olamaz." }, 400);
    const t = b.rule_text.trim();
    if (t.length > MAX_RULE_TEXT)
      return json({ ok: false, error: `Kural metni en fazla ${MAX_RULE_TEXT} karakter olabilir.` }, 400);
    patch.rule_text = t;
  }
  if (b.category !== undefined) {
    if (!isCategory(b.category))
      return json({ ok: false, error: "Geçersiz kategori." }, 400);
    patch.category = b.category;
  }
  if (b.sort_order !== undefined) {
    if (!Number.isInteger(b.sort_order))
      return json({ ok: false, error: "sort_order tam sayı olmalı." }, 400);
    patch.sort_order = b.sort_order;
  }

  if (Object.keys(patch).length === 0)
    return json({ ok: false, error: "Güncellenecek alan yok." }, 400);

  const { data, error } = await db
    .from("hacamat_rules")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)   // cross-tenant koruması (RLS'e ek)
    .select("id, category, rule_text, sort_order")
    .maybeSingle();

  if (error) return json({ ok: false, code: "UPDATE_FAILED", error: "Güncellenemedi." }, 500);
  if (!data) return json({ ok: false, code: "NOT_FOUND", error: "Kural bulunamadı." }, 404);
  return json({ ok: true, data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireModuleAccess(req, "cosmic_calendar");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account)
    return json({ ok: false, code: "DEMO_READONLY", error: "Demo hesap kural silemez." }, 403);
  const { db, tenantId } = guard;

  const { id } = await params;
  if (!id) return json({ ok: false, error: "Geçersiz istek." }, 400);

  const { data, error } = await db
    .from("hacamat_rules")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)   // cross-tenant koruması (RLS'e ek)
    .select("id")
    .maybeSingle();

  if (error) return json({ ok: false, code: "DELETE_FAILED", error: "Silinemedi." }, 500);
  if (!data) return json({ ok: false, code: "NOT_FOUND", error: "Kural bulunamadı." }, 404);
  return json({ ok: true });
}
