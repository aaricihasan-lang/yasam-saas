import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { pickProtocolContentFields } from "@/lib/refleksoloji/protocolDto";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/protocols/by-uid/[uid] — protokolü istemci `source_uid`'i
 * üzerinden güncelle/sil (P1-2 — Protokol Haritası düzenleme/silme senkronu).
 *
 * BAĞLAM:
 *   Protokol Haritası kayıtları localStorage'da istemci-üretimli `id` ile tutulur;
 *   sunucudaki satır ise ayrı bir uuid `id` + `source_uid = <local id>` taşır.
 *   Kayıtlı Protokoller server `id`'siyle çalışır; Protokol Haritası ise yalnız
 *   local id'yi (= source_uid) bilir. Bu route düzenleme/silmeyi source_uid ile
 *   eşleştirir → iki depo (localStorage ↔ server) sapması kapanır (zombie protokol).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token binding.
 *   - tenant_id SUNUCUDA session'dan; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgular tenant_id + source_uid ile bağlanır (IDOR engellenir).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 */

// ─── PUT /api/refleksoloji/protocols/by-uid/[uid] — güncelle (yoksa oluştur) ────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { uid } = await params;
  if (!uid) {
    return NextResponse.json({ ok: false, error: "source_uid gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, protocol: null });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // Mass-assignment koruması: yalnız kullanıcı-düzenlenebilir içerik alanları.
  // tenant_id + source_uid oturumdan/param'dan; id/created_at/updated_at ve köken
  // (origin_*) alanları İSTEMCİDEN kabul EDİLMEZ.
  const fields = pickProtocolContentFields(body);

  // Önce güncelle (tenant + source_uid eşleşen satır).
  const { data: updated, error: updErr } = await db
    .from("reflexology_protocols")
    .update(fields)
    .eq("tenant_id", tenantId)
    .eq("source_uid", uid)
    .select();

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  // Hiç satır güncellenmediyse (bu cihazda oluşturulmuş ama server'a hiç gitmemiş
  // eski kayıt) → tenant altına ekle. Böylece düzenleme de veri kaybetmez.
  if (!updated || updated.length === 0) {
    const { data: inserted, error: insErr } = await db
      .from("reflexology_protocols")
      .insert({ ...fields, tenant_id: tenantId, source_uid: uid })
      .select()
      .single();

    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, protocol: inserted, created: true });
  }

  return NextResponse.json({ ok: true, protocol: updated[0], updated: updated.length });
}

// ─── DELETE /api/refleksoloji/protocols/by-uid/[uid] ───────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { uid } = await params;
  if (!uid) {
    return NextResponse.json({ ok: false, error: "source_uid gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  }

  const { data, error } = await db
    .from("reflexology_protocols")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("source_uid", uid)
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
