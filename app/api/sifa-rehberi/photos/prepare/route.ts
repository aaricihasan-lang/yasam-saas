import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STONE_PHOTOS_BUCKET,
  MAX_UPLOAD_BYTES,
  extForMime,
  sanitizeGuideSection,
  buildGuidePhotoPath,
  buildStagingPhotoPath,
} from "@/lib/sifa-rehberi/stonePhotoStorage";

export const runtime = "nodejs";

/**
 * POST /api/sifa-rehberi/photos/prepare — SUNUCU-YETKİLİ SIGNED UPLOAD HAZIRLIĞI (P1 PHASE A).
 *
 * NEDEN SIGNED UPLOAD (byte-proxy DEĞİL):
 *   10 MB görsel byte'ını Vercel Function gövdesinden geçirmek istenmez (platform body
 *   limiti). Sunucu yalnız kısa ömürlü, tek-kullanımlık signed upload capability üretir.
 *
 * GÜVENLİK:
 *   - requireModuleAccess("sifa_rehberi") → x-user-id + x-session-token binding + modül izni.
 *   - tenantId SUNUCUDAN (guard.tenantId); client body/query/path'inden ALINMAZ.
 *   - guideId verilirse guide bu tenant'a AİT mi doğrulanır (IDOR engeli).
 *   - obje yolu SUNUCUDA üretilir (uuid + trusted-MIME uzantı) → client path/uzantı seçemez.
 *   - MIME allowlist (png/jpeg/webp/gif) + 10 MB tavan (boyut client-declared soft guard;
 *     gerçek byte'lar signed URL ile gider).
 *   - createSignedUploadUrl service_role (guard.db) + { upsert:false } → var olanı ezemez.
 *   - Demo hesap: storage mutation DENY (fail-safe no-op).
 *
 * İstek (JSON, DOSYA BYTES YOK):
 *   { guideId?: string, section?: string, mimeType: string, size?: number, fileName?: string }
 *   - guideId varsa → guide-scoped path (edit/detay akışı).
 *   - guideId yoksa → staging path (yeni kayıt/create akışı; guide henüz yok).
 * Yanıt: { ok: true, path, token }
 * Ardından tarayıcı: supabase.storage.from(STONE_PHOTOS_BUCKET).uploadToSignedUrl(path, token, file)
 */

async function guideInTenant(
  db: SupabaseClient,
  guideId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("healing_guides")
    .select("id")
    .eq("id", guideId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  // Demo hesap: yazma yapılmaz — fail-safe no-op (storage mutation'a düşmez).
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // MIME allowlist → güvenilir uzantı. Client dosya adına/uzantısına GÜVENİLMEZ.
  const ext = extForMime(body.mimeType);
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "Desteklenmeyen görsel türü. (png, jpeg, webp, gif)" },
      { status: 400 },
    );
  }

  // Boyut: 10 MB tavanı (client-declared soft guard).
  const size = body.size != null ? Number(body.size) : null;
  if (size != null && Number.isFinite(size) && size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Görsel boyutu 10 MB sınırını aşıyor." },
      { status: 413 },
    );
  }

  const uuid = crypto.randomUUID();
  let path: string;

  const rawGuideId = typeof body.guideId === "string" ? body.guideId.trim() : "";
  if (rawGuideId) {
    // Edit/detay akışı — guide bu tenant'a ait olmalı (IDOR).
    if (!(await guideInTenant(db, rawGuideId, tenantId))) {
      return NextResponse.json({ ok: false, error: "Kayıt bu hesaba ait değil." }, { status: 403 });
    }
    const section = sanitizeGuideSection(body.section);
    if (!section) {
      return NextResponse.json({ ok: false, error: "Geçersiz bölüm." }, { status: 400 });
    }
    path = buildGuidePhotoPath(tenantId, rawGuideId, section, uuid, ext);
  } else {
    // Create akışı — guide henüz yok → tenant-scoped staging path (SUNUCU üretir).
    path = buildStagingPhotoPath(tenantId, uuid, ext);
  }

  const { data: signed, error: signError } = await db.storage
    .from(STONE_PHOTOS_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (signError || !signed?.token) {
    console.error("[sifa-rehberi/photos/prepare] createSignedUploadUrl", signError);
    return NextResponse.json({ ok: false, error: "Yükleme hazırlanamadı." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, path: signed.path, token: signed.token });
}
