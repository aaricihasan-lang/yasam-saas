import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { pickProtocolContentFields } from "@/lib/refleksoloji/protocolDto";
import { jsonServerError } from "@/lib/refleksoloji/apiError";
import { decideProtocolCas, protocolRowVersion } from "@/lib/refleksoloji/protocolSyncCore";

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
 *
 * FA-42 (eşzamanlılık): PUT gövdesi `expected_updated_at` (istemcinin bildiği
 *   `raw_json.updatedAt`) taşırsa sunucudaki sürümle eşleşmesi gerekir; aksi halde
 *   409 PROTOCOL_STALE (başka cihazdaki düzenleme körlemesine ezilmez). Tabloda
 *   updated_at kolonu olmadığından belirteç raw_json.updatedAt'tir (migration yok).
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
  const expected =
    typeof body.expected_updated_at === "string" && body.expected_updated_at.length > 0
      ? body.expected_updated_at
      : null;

  // FA-42: iyimser eşzamanlılık — mevcut satırın sürüm belirteci.
  let currentVersion: string | null = null;
  if (expected) {
    const { data: curRows, error: curErr } = await db
      .from("reflexology_protocols")
      .select("id, raw_json")
      .eq("tenant_id", tenantId)
      .eq("source_uid", uid)
      .limit(2);
    if (curErr) {
      return jsonServerError("protocols.by-uid.PUT.read", curErr);
    }
    const cur = (curRows ?? [])[0] as { id: string; raw_json: unknown } | undefined;
    if (cur) {
      currentVersion = protocolRowVersion(cur.raw_json);
      const decision = decideProtocolCas(expected, currentVersion);
      if (!decision.ok) {
        return NextResponse.json(
          {
            ok: false,
            conflict: true,
            code: decision.code,
            error: "Protokol başka bir cihazda değiştirilmiş. Güncel hâlini yükleyip tekrar deneyin.",
          },
          { status: 409 },
        );
      }
    }
  }

  // Güncelle (tenant + source_uid [+ sürüm belirteci] eşleşen satır).
  let updQuery = db
    .from("reflexology_protocols")
    .update(fields)
    .eq("tenant_id", tenantId)
    .eq("source_uid", uid);
  if (expected && currentVersion) {
    // Okuma→yazma yarışını da kapat: belirteç hâlâ aynıysa yaz.
    updQuery = updQuery.eq("raw_json->>updatedAt", currentVersion);
  }
  const { data: updated, error: updErr } = await updQuery.select();

  if (updErr) {
    return jsonServerError("protocols.by-uid.PUT.update", updErr);
  }
  if (expected && currentVersion && (!updated || updated.length === 0)) {
    return NextResponse.json(
      {
        ok: false,
        conflict: true,
        code: "PROTOCOL_STALE",
        error: "Protokol başka bir cihazda değiştirilmiş. Güncel hâlini yükleyip tekrar deneyin.",
      },
      { status: 409 },
    );
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
      return jsonServerError("protocols.by-uid.PUT.insert", insErr);
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
    return jsonServerError("protocols.by-uid.DELETE", error);
  }

  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
