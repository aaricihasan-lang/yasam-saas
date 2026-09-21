import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STONE_PHOTO_BUCKET,
  STONE_PHOTO_MAX_BYTES,
  extForMime,
  buildStonePhotoPath,
} from "@/lib/clients/stonePhotoStorage";

export const runtime = "nodejs";

/**
 * POST /api/clients/[id]/stone-photos/prepare — SUNUCU-YETKİLİ SIGNED UPLOAD HAZIRLIĞI
 * (DYA-07 PHASE B). Şifa Rehberi PHASE A ile aynı desen.
 *
 * NEDEN SIGNED UPLOAD (byte-proxy DEĞİL): 10 MB görsel byte'ını Vercel Function gövdesinden
 * geçirmek istenmez. Sunucu yalnız kısa ömürlü, tek-kullanımlık signed upload capability üretir;
 * gerçek byte'lar tarayıcıdan doğrudan signed URL'e gider (anon ALL policy'ye BAĞLI DEĞİL).
 *
 * GÜVENLİK:
 *   - requireModuleAccess(req,"clients") → x-user-id + x-session-token binding + modül izni.
 *   - tenantId SUNUCUDAN (guard.tenantId); client body/query/path'inden ALINMAZ.
 *   - client ownership (clientBelongsToTenant) + stone ownership (stone ∈ client+tenant) → IDOR engeli.
 *   - obje yolu SUNUCUDA üretilir (uuid + trusted-MIME uzantı) → client path/uzantı/dosya-adı seçemez.
 *   - MIME allow-list (png/jpeg/webp/gif) + 10 MB tavan (client-declared soft guard).
 *   - createSignedUploadUrl service_role (guard.db) + { upsert:false } → var olanı ezemez.
 *   - Demo hesap: storage mutation DENY (fail-safe no-op).
 *
 * İstek (JSON, DOSYA BYTES YOK): { stoneId: string, mimeType: string, size?: number }
 * Yanıt: { ok: true, path, token }
 * Ardından tarayıcı: supabase.storage.from(BUCKET).uploadToSignedUrl(path, token, file)
 */

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

async function stoneBelongsToClient(
  db: SupabaseClient,
  stoneId: string,
  clientId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("client_stones")
    .select("id")
    .eq("id", stoneId)
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

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

  // Demo hesap: storage mutation yapılmaz — fail-safe no-op.
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const stoneId = typeof body.stoneId === "string" ? body.stoneId.trim() : "";
  if (!stoneId) {
    return NextResponse.json({ ok: false, error: "stoneId gerekli." }, { status: 400 });
  }

  // MIME allow-list → güvenilir uzantı. Client dosya adına/uzantısına GÜVENİLMEZ.
  const ext = extForMime(body.mimeType);
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "Desteklenmeyen görsel türü. (png, jpeg, webp, gif)" },
      { status: 400 },
    );
  }

  // Boyut: 10 MB tavanı (client-declared soft guard; gerçek byte'lar signed URL ile gider).
  const size = body.size != null ? Number(body.size) : null;
  if (size != null && Number.isFinite(size) && size > STONE_PHOTO_MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Görsel boyutu 10 MB sınırını aşıyor." },
      { status: 413 },
    );
  }

  // Ownership zinciri: client → tenant, sonra stone → client + tenant.
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }
  if (!(await stoneBelongsToClient(db, stoneId, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Taş kaydı bu danışana ait değil." }, { status: 403 });
  }

  // Obje yolu SUNUCUDA üretilir (mevcut format korunur): {tenant}/{client}/{stone}/{uuid}.{ext}
  const path = buildStonePhotoPath(tenantId, clientId, stoneId, crypto.randomUUID(), ext);

  const { data: signed, error: signError } = await db.storage
    .from(STONE_PHOTO_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (signError || !signed?.token) {
    console.error("[clients/stone-photos/prepare] createSignedUploadUrl", signError?.message);
    return NextResponse.json({ ok: false, error: "Yükleme hazırlanamadı." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path: signed.path, token: signed.token });
}
