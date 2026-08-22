import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { pickProtocolContentFields } from "@/lib/refleksoloji/protocolDto";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/protocols — uzmanın refleksoloji protokolleri (C2-B3a).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA session/user kaydından alınır; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/insert tenant_id ile bağlanır (çapraz-tenant erişim engellenir).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *
 * Not: reflexology_protocols tenant-scoped (client_id yok). `id` ve `created_at`
 *      kayıt katmanında istemci tarafından üretilir; yalnızca `tenant_id` zorlanır.
 */

// ─── GET /api/refleksoloji/protocols ───────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;

  const { data, error } = await db
    .from("reflexology_protocols")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("title");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, protocols: data ?? [] });
}

// ─── POST /api/refleksoloji/protocols ──────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

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
  // tenant_id oturumdan; id/created_at DB default'undan; köken/provenance alanları
  // (origin_*, transferred_at) ve id/created_at/updated_at İSTEMCİDEN kabul EDİLMEZ.
  const fields = pickProtocolContentFields(body);
  const sourceUid =
    typeof body.source_uid === "string" && body.source_uid.trim()
      ? body.source_uid.trim()
      : null;

  // İdempotensi: (tenant_id, source_uid) zaten varsa yeni satır AÇMA — çift-tıklama
  // / retry duplicate protokol üretmesin. DB unique constraint YOK (mevcut 58 kayıt
  // conflict riskine karşı eklenmedi); bu ön-kontrol + UI pending guard birlikte korur.
  if (sourceUid) {
    const { data: existing, error: existErr } = await db
      .from("reflexology_protocols")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("source_uid", sourceUid)
      .maybeSingle();

    if (existErr) {
      return NextResponse.json({ ok: false, error: existErr.message }, { status: 500 });
    }
    if (existing) {
      // Aynı mantıksal protokol → mevcut satırı içerikle güncelle (idempotent), yeni açma.
      const { data: updated, error: updErr } = await db
        .from("reflexology_protocols")
        .update(fields)
        .eq("tenant_id", tenantId)
        .eq("source_uid", sourceUid)
        .select()
        .single();
      if (updErr) {
        return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, protocol: updated, deduped: true });
    }
  }

  const { data, error } = await db
    .from("reflexology_protocols")
    .insert({ ...fields, tenant_id: tenantId, ...(sourceUid ? { source_uid: sourceUid } : {}) })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, protocol: data });
}
