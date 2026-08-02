import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * client_homeworks güvenli API katmanı (Faz 1C).
 *
 * Amaç: client_homeworks artık tarayıcıdan publishable key ile doğrudan
 *       okunmaz/yazılmaz/güncellenmez/silinmez. Erişim service_role'lü bu route üzerinden.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA user kaydından alınır; client'tan gelen tenant_id'ye GÜVENİLMEZ.
 *   - client_id'nin bu tenant'a ait olduğu doğrulanır.
 *   - Tüm client_homeworks sorguları tenant_id + client_id birlikte kullanır.
 *   - Demo hesap: Supabase'e yazma/güncelleme/silme yapılmaz.
 */

// Yalnızca bu alanlar yazılabilir/güncellenebilir (whitelist).
const ALLOWED_FIELDS = [
  "title",
  "homework_type",
  "description",
  "start_date",
  "end_date",
  "status",
  "expert_note",
  "client_feedback",
  "alert_dismissed_at",
] as const;

function pickAllowed(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input) return out;
  for (const key of ALLOWED_FIELDS) {
    if (key in input) out[key] = input[key];
  }
  return out;
}

async function clientBelongsToTenant(
  db: SupabaseClient,
  clientId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

// ─── GET — liste ────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId } = guard;

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  const { data, error } = await db
    .from("client_homeworks")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .order("end_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, homeworks: data ?? [] });
}

// ─── POST — oluştur ──────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, id: null });
  }

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const { data, error } = await db
    .from("client_homeworks")
    .insert({ tenant_id: tenantId, client_id: clientId, ...pickAllowed(body) })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: (data as { id: string } | null)?.id ?? null });
}

// ─── PATCH — güncelle (tam form / status / alert_dismissed_at) ────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  let body: { homeworkId?: unknown; patch?: Record<string, unknown> };
  try {
    body = (await req.json()) as { homeworkId?: unknown; patch?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const homeworkId = typeof body.homeworkId === "string" ? body.homeworkId.trim() : "";
  if (!homeworkId) {
    return NextResponse.json({ ok: false, error: "homeworkId gerekli." }, { status: 400 });
  }

  const patch = pickAllowed(body.patch);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  const { error } = await db
    .from("client_homeworks")
    .update(patch)
    .eq("id", homeworkId)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ─── DELETE — sil (body: { homeworkId }) ──────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  let homeworkId = "";
  try {
    const body = (await req.json()) as { homeworkId?: unknown };
    homeworkId = typeof body.homeworkId === "string" ? body.homeworkId.trim() : "";
  } catch {
    /* aşağıda boş kontrolü yakalar */
  }
  if (!homeworkId) {
    return NextResponse.json({ ok: false, error: "homeworkId gerekli." }, { status: 400 });
  }

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  const { error } = await db
    .from("client_homeworks")
    .delete()
    .eq("id", homeworkId)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
