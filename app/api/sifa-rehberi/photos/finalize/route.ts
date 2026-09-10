import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STONE_PHOTOS_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  sanitizeGuideSection,
  isGuideOwnedHealingPath,
  isStagingHealingPath,
} from "@/lib/sifa-rehberi/stonePhotoStorage";

export const runtime = "nodejs";

/**
 * POST /api/sifa-rehberi/photos/finalize — signed upload SONRASI güçlü bağlama (P1 PHASE A).
 *
 * Tarayıcı signed URL ile objeyi yükledikten sonra bu uç, objenin gerçekten yüklendiğini
 * SUNUCUDA doğrular ve normalize edilmiş görsel metadata'sını + kısa ömürlü PREVIEW signed
 * URL döner. Metadata (guide.images JSONB) yazımı mevcut ürün akışında (updateHealingGuide /
 * createHealingGuide → module-authed guide route) yapılır — burada YALNIZ doğrulama.
 *
 * GÜVENLİK:
 *   - requireModuleAccess + tenantId SUNUCUDAN.
 *   - guideId verilirse guide ownership + path YALNIZ `healing-guides/{tenant}/{guideId}/`
 *     öneki altında (cross-tenant/cross-guide path enjeksiyonu engeli).
 *   - guideId yoksa (create/staging) path YALNIZ `healing-guides/{tenant}/staging/` altında.
 *   - GÜÇLÜ BAĞLAMA: obje gerçekten storage'da VAR MI (exists) → uydurma path finalize edilmez.
 *   - PREVIEW signed URL kısa ömürlüdür ve YALNIZ UI state içindir; DB'ye persist EDİLMEZ.
 *
 * İstek (JSON): { guideId?: string, path: string, section?: string, name?: string }
 * Yanıt: { ok: true, image: { id, name, file_path, section }, previewUrl }
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

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const path = String(body.path ?? "").trim();
  if (!path) {
    return NextResponse.json({ ok: false, error: "path gerekli." }, { status: 400 });
  }

  const rawGuideId = typeof body.guideId === "string" ? body.guideId.trim() : "";
  let section: string | null = null;

  if (rawGuideId) {
    if (!(await guideInTenant(db, rawGuideId, tenantId))) {
      return NextResponse.json({ ok: false, error: "Kayıt bu hesaba ait değil." }, { status: 403 });
    }
    section = sanitizeGuideSection(body.section);
    if (!section) {
      return NextResponse.json({ ok: false, error: "Geçersiz bölüm." }, { status: 400 });
    }
    // Path yalnız `healing-guides/{tenant}/{guideId}/` öneki altında olabilir.
    if (!isGuideOwnedHealingPath(path, tenantId, rawGuideId)) {
      return NextResponse.json({ ok: false, error: "Geçersiz dosya yolu." }, { status: 400 });
    }
  } else {
    // Create/staging: path yalnız bu tenant'ın staging öneki altında olabilir.
    if (!isStagingHealingPath(path, tenantId)) {
      return NextResponse.json({ ok: false, error: "Geçersiz dosya yolu." }, { status: 400 });
    }
  }

  // Güçlü bağlama: obje gerçekten yüklenmiş olmalı — yoksa metadata üretme.
  const { data: objectExists, error: existsError } = await db.storage
    .from(STONE_PHOTOS_BUCKET)
    .exists(path);
  if (existsError) {
    console.error("[sifa-rehberi/photos/finalize] exists check", existsError);
    return NextResponse.json({ ok: false, error: "Dosya doğrulanamadı." }, { status: 500 });
  }
  if (!objectExists) {
    return NextResponse.json({ ok: false, error: "Yüklenen dosya bulunamadı." }, { status: 409 });
  }

  // Kısa ömürlü PREVIEW signed URL (yalnız UI state; DB'ye persist EDİLMEZ).
  const { data: signed, error: signErr } = await db.storage
    .from(STONE_PHOTOS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    console.error("[sifa-rehberi/photos/finalize] createSignedUrl", signErr);
    return NextResponse.json({ ok: false, error: "Önizleme üretilemedi." }, { status: 500 });
  }

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "gorsel";

  return NextResponse.json({
    ok: true,
    image: {
      id: crypto.randomUUID(),
      name,
      file_path: path,
      ...(section ? { section } : {}),
    },
    previewUrl: signed.signedUrl,
  });
}
