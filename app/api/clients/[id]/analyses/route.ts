import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * client_analyses güvenli API katmanı (Faz 1B).
 *
 * Amaç: client_analyses artık tarayıcıdan publishable key ile doğrudan
 *       okunmaz/yazılmaz/silinmez. Tüm erişim service_role'lü bu route üzerinden geçer.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA user kaydından alınır; client'tan gelen tenant_id'ye GÜVENİLMEZ.
 *   - client_id'nin bu tenant'a ait olduğu doğrulanır.
 *   - Tüm client_analyses sorguları tenant_id + client_id birlikte kullanır.
 *   - Demo hesap: Supabase'e yazma/silme yapılmaz (mevcut demo davranışı korunur).
 *
 * NOT: Görsel yükleme (image_url) ayrı upload-image route'unda kalır — bu route onu değiştirmez.
 */

type CreateBody = {
  analysis_type?: string | null;
  analysis_data?: unknown;
  note?: string | null;
};

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

// ─── GET /api/clients/[id]/analyses ─────────────────────────────────────────────
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
    .from("client_analyses")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    return serverErrorResponse({ route: "clients/[id]/analyses", action: "GET", tenantId, cause: error });
  }

  return NextResponse.json({ ok: true, analyses: data ?? [] });
}

// ─── POST /api/clients/[id]/analyses ────────────────────────────────────────────
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

  // Demo hesap: Supabase'e yazma yapılmaz.
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, id: null });
  }

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const { data, error } = await db
    .from("client_analyses")
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      analysis_type: body.analysis_type ?? null,
      analysis_data: body.analysis_data ?? null,
      note: body.note ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return serverErrorResponse({ route: "clients/[id]/analyses", action: "POST", tenantId, cause: error });
  }

  return NextResponse.json({ ok: true, id: (data as { id: string } | null)?.id ?? null });
}

// ─── DELETE /api/clients/[id]/analyses  (body: { analysisId }) ──────────────────
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

  // Demo hesap: Supabase'den silme yapılmaz.
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  let analysisId = "";
  try {
    const body = (await req.json()) as { analysisId?: unknown };
    analysisId = typeof body.analysisId === "string" ? body.analysisId.trim() : "";
  } catch {
    /* aşağıda boş kontrolü yakalar */
  }
  if (!analysisId) {
    return NextResponse.json({ ok: false, error: "analysisId gerekli." }, { status: 400 });
  }

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  const { error } = await db
    .from("client_analyses")
    .delete()
    .eq("id", analysisId)
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);

  if (error) {
    return serverErrorResponse({ route: "clients/[id]/analyses", action: "DELETE", tenantId, cause: error });
  }

  return NextResponse.json({ ok: true });
}
