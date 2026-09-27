import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyNotesPatch,
  buildNotesFields,
  notesVersion,
  NOTES_CONFLICT_MESSAGE,
} from "@/lib/danisan/notesPatch";

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
 *
 * Veri bütünlüğü (DY-A):
 *   - PATCH yalnız gövdede BULUNAN alanları yazar (eski `?? null` ezmesi kaldırıldı).
 *   - `notlar` için base_version CAS: uyuşmazlık → 409 NOTES_CONFLICT (+ güncel satır).
 *     base_version göndermeyen eski istemci geçiş süresince CAS'sız kabul edilir.
 *   - GET/PATCH `notlar_version` (sha256(notlar ?? "")) döndürür.
 *   - (tenant_id, client_id) UNIQUE (migration 20270129000400); ekleme yarışı → 23505
 *     → mevcut satır üzerinden güncelleme (lib/danisan/notesPatch.applyNotesPatch).
 */

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
    return serverErrorResponse({ route: "clients/[id]/notes", action: "GET", tenantId, cause: error });
  }

  const row = (data ?? null) as { notlar?: string | null } | null;
  return NextResponse.json({
    ok: true,
    note: data ?? null,
    notlar_version: notesVersion(row?.notlar ?? null),
  });
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // Genel bilgi kaydı { saglik_notu, adres, oneriler } → notlar'a dokunmaz;
  // Notlar sekmesi { notlar, base_version } → diğer 3 alana dokunmaz.
  const built = buildNotesFields(body);
  if (!built.ok) {
    return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
  }

  // Karar sunucuda: client'tan id gelmez (cross-tenant overwrite engellenir).
  const result = await applyNotesPatch(db, tenantId, clientId, built.fields, built.baseVersion);

  if (result.kind === "error") {
    return serverErrorResponse({ route: "clients/[id]/notes", action: "PATCH", tenantId, cause: result.cause });
  }
  if (result.kind === "conflict") {
    // İstemci bu yanıttaki güncel satırla ekranını yeniler (ayrı GET gerekmez).
    return NextResponse.json(
      {
        ok: false,
        code: "NOTES_CONFLICT",
        error: NOTES_CONFLICT_MESSAGE,
        note: result.note,
        notlar_version: notesVersion(result.note?.notlar ?? null),
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    note: result.note,
    notlar_version: notesVersion(result.note?.notlar ?? null),
  });
}
