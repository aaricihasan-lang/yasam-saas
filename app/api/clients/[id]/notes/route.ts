import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * client_notes güvenli API katmanı (Faz 1A).
 *
 * Amaç: client_notes artık tarayıcıdan publishable key ile doğrudan
 *       okunmaz/yazılmaz. Tüm erişim service_role'lü bu route üzerinden geçer.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA user kaydından alınır; client'tan gelen tenant_id'ye GÜVENİLMEZ.
 *   - client_id'nin bu tenant'a ait olduğu doğrulanır.
 *   - Tüm client_notes sorguları tenant_id + client_id birlikte kullanır.
 *   - Demo hesap: Supabase'e yazma yapılmaz (mevcut demo davranışı korunur).
 */

type NotesBody = {
  saglik_notu?: string | null;
  adres?: string | null;
  oneriler?: string | null;
  notlar?: string | null;
};

/** client_id gerçekten guard'dan gelen tenant'a mı ait? */
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

// ─── GET /api/clients/[id]/notes ───────────────────────────────────────────────
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
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 403 },
    );
  }

  const { data, error } = await db
    .from("client_notes")
    .select("*")
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, note: data ?? null });
}

// ─── PATCH /api/clients/[id]/notes ──────────────────────────────────────────────
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

  // Demo hesap: hiçbir koşulda Supabase'e yazma yapılmaz.
  // (Demo akışı zaten /demo rotasında localStorage fixture kullanır; bu savunma derinliği içindir.)
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, note: null });
  }

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 403 },
    );
  }

  let body: NotesBody;
  try {
    body = (await req.json()) as NotesBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // Yazılacak alanlar. notlar yalnızca istekte VARSA güncellenir
  // (genel bilgi kaydı notlar'ı korur, not sekmesi günceller — mevcut davranış).
  const fields: Record<string, string | null> = {
    saglik_notu: body.saglik_notu ?? null,
    adres: body.adres ?? null,
    oneriler: body.oneriler ?? null,
  };
  if (body.notlar !== undefined) {
    fields.notlar = body.notlar ?? null;
  }

  // Bu danışan için mevcut not var mı? (tenant + client) → varsa güncelle, yoksa ekle.
  // client'tan id gelmez; karar sunucuda verilir (cross-tenant overwrite engellenir).
  const { data: existing } = await db
    .from("client_notes")
    .select("id")
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const result = existing?.id
    ? await db
        .from("client_notes")
        .update(fields)
        .eq("id", existing.id)
        .eq("tenant_id", tenantId)
        .eq("client_id", clientId)
        .select()
        .single()
    : await db
        .from("client_notes")
        .insert({ tenant_id: tenantId, client_id: clientId, ...fields })
        .select()
        .single();

  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, note: result.data });
}
