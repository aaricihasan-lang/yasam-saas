import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * /api/clients/[id]/charges — bir danışanın ücret kayıtları (client_charges).
 *
 * Merkezi Ücretlendirme: ücret artık seansa gömülü değil; danışana ait bütün ücret
 * kayıtlarının TEK KAYNAĞI bu tablodur. Uzman istediği kadar bağımsız kayıt ekler.
 *
 * Güvenlik (client_sessions route ile birebir aynı model):
 *   - requireModuleAccess(req, "clients") → x-user-id + x-session-token binding.
 *     tenant_id SUNUCUDA (users kaydından); body/query'den ASLA.
 *   - Önce client_id'nin bu tenant'a ait olduğu doğrulanır (IDOR).
 *   - Tüm sorgu/insert/update/delete tenant_id + client_id ile bağlanır.
 *   - Body'deki tenant_id/id/client_id/created_at/updated_at/source_session_id yok sayılır.
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *
 * Doğrulama (server-side):
 *   - category ∈ {session, homework, analysis, other} (zorunlu).
 *   - amount: sonlu sayı ve > 0 (negatif/NaN/boş reddedilir).
 *   - category === "other" → detail (serbest metin) ZORUNLU.
 */

const CATEGORIES = new Set(["session", "homework", "analysis", "other"]);

// source_session_id de korunur: backfill'e ait iç alan, kullanıcı set edemez.
const PROTECTED_KEYS = new Set([
  "tenant_id", "id", "created_at", "updated_at", "client_id", "source_session_id",
]);

function sanitizePayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!PROTECTED_KEYS.has(k)) out[k] = v;
  }
  return out;
}

/** Tutar doğrulaması — sonlu ve > 0 olmalı. Geçersizse null döner. */
function normalizeAmount(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function nonEmpty(raw: unknown): boolean {
  return typeof raw === "string" && raw.trim().length > 0;
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

// ─── GET ────────────────────────────────────────────────────────────────────────
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
    .from("client_charges")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, charges: data ?? [] });
}

// ─── POST ───────────────────────────────────────────────────────────────────────
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
    return NextResponse.json({ ok: true, demo: true, charge: null });
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

  const fields = sanitizePayload(body);

  // ── Doğrulama ──
  const category = typeof fields.category === "string" ? fields.category.trim() : "";
  if (!CATEGORIES.has(category)) {
    return NextResponse.json({ ok: false, error: "Geçerli bir ana tür seçiniz." }, { status: 400 });
  }
  const amount = normalizeAmount(fields.amount);
  if (amount === null) {
    return NextResponse.json({ ok: false, error: "Tutar 0'dan büyük geçerli bir sayı olmalıdır." }, { status: 400 });
  }
  if (category === "other" && !nonEmpty(fields.detail)) {
    return NextResponse.json({ ok: false, error: "\"Diğer\" için ürün / hizmet / işlem açıklaması zorunludur." }, { status: 400 });
  }

  const insertRow = {
    tenant_id: tenantId,
    client_id: clientId,
    category,
    amount,
    detail: nonEmpty(fields.detail) ? String(fields.detail).trim() : null,
    note: nonEmpty(fields.note) ? String(fields.note).trim() : null,
    ...(nonEmpty(fields.charge_date) ? { charge_date: String(fields.charge_date).trim() } : {}),
  };

  const { data, error } = await db
    .from("client_charges")
    .insert(insertRow)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, charge: data });
}

// ─── PATCH ──────────────────────────────────────────────────────────────────────
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
    return NextResponse.json({ ok: true, demo: true, charge: null });
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

  const rowId = body.id != null ? String(body.id) : "";
  if (!rowId) {
    return NextResponse.json({ ok: false, error: "Kayıt id gerekli." }, { status: 400 });
  }

  const fields = sanitizePayload(body);
  const update: Record<string, unknown> = {};

  if ("category" in fields) {
    const category = typeof fields.category === "string" ? fields.category.trim() : "";
    if (!CATEGORIES.has(category)) {
      return NextResponse.json({ ok: false, error: "Geçerli bir ana tür seçiniz." }, { status: 400 });
    }
    // "Diğer"e geçiliyorsa detail zorunlu (body'de gelmeli).
    if (category === "other" && !nonEmpty(fields.detail)) {
      return NextResponse.json({ ok: false, error: "\"Diğer\" için ürün / hizmet / işlem açıklaması zorunludur." }, { status: 400 });
    }
    update.category = category;
  }

  if ("amount" in fields) {
    const amount = normalizeAmount(fields.amount);
    if (amount === null) {
      return NextResponse.json({ ok: false, error: "Tutar 0'dan büyük geçerli bir sayı olmalıdır." }, { status: 400 });
    }
    update.amount = amount;
  }

  if ("detail" in fields) {
    update.detail = nonEmpty(fields.detail) ? String(fields.detail).trim() : null;
  }
  if ("note" in fields) {
    update.note = nonEmpty(fields.note) ? String(fields.note).trim() : null;
  }
  if ("charge_date" in fields && nonEmpty(fields.charge_date)) {
    update.charge_date = String(fields.charge_date).trim();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  const { data, error } = await db
    .from("client_charges")
    .update(update)
    .eq("id", rowId)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, charge: data });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────────
// Query/body'de id ZORUNLU — yalnız o ücret kaydı silinir (toplu silme yok).
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
    return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  }
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  let rowId = new URL(req.url).searchParams.get("id")?.trim() || "";
  if (!rowId) {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      if (body?.id != null) rowId = String(body.id);
    } catch {
      /* gövde yoksa aşağıda 400 */
    }
  }
  if (!rowId) {
    return NextResponse.json({ ok: false, error: "Silinecek kayıt id gerekli." }, { status: 400 });
  }

  const { data, error } = await db
    .from("client_charges")
    .delete()
    .eq("id", rowId)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
