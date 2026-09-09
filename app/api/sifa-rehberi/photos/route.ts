import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  STONE_PHOTOS_BUCKET,
  isGuideOwnedHealingPath,
  resolveHealingImagePath,
  storageHostFromEnv,
} from "@/lib/sifa-rehberi/stonePhotoStorage";

export const runtime = "nodejs";

/**
 * DELETE /api/sifa-rehberi/photos — SUNUCU-YETKİLİ görsel silme (P1 PHASE A).
 *
 * Tarayıcı `.remove()` TAMAMEN kaldırıldı. Silme yalnız bu uçtan geçer.
 *
 * GÜVENLİK (arbitrary client path delete DEĞİL):
 *   - requireModuleAccess("sifa_rehberi") + tenantId SUNUCUDAN.
 *   - guide ownership (healing_guides.id = guideId AND tenant_id = guard.tenantId).
 *   - file_path YALNIZ `healing-guides/{tenant}/{guideId}/` öneki altında olabilir.
 *   - RESOURCE MEMBERSHIP: file_path bu guide'ın DB image metadata'sında GERÇEKTEN var olmalı
 *     — path'i bilmek/tenant öneki YETMEZ. (file_path authorization proof DEĞİL.)
 *   - service_role storage remove; metadata JSONB güncellemesi mevcut ürün akışında
 *     (updateHealingGuide → module-authed guide route) yapılır.
 *   - Demo hesap: DENY.
 *
 * İstek (JSON): { guideId: string, file_path: string }
 */

type GuideImageRow = { file_path?: unknown; url?: unknown };

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: false, error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const guideId = String(body.guideId ?? "").trim();
  const filePath = String(body.file_path ?? "").trim();
  if (!guideId || !filePath) {
    return NextResponse.json({ ok: false, error: "guideId ve file_path gerekli." }, { status: 400 });
  }

  // Prefix savunması — path yalnız bu tenant+guide öneki altında.
  if (!isGuideOwnedHealingPath(filePath, tenantId, guideId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz dosya yolu." }, { status: 400 });
  }

  // Guide ownership + membership: file_path bu guide'ın image metadata'sında olmalı.
  const { data: guide, error: guideErr } = await db
    .from("healing_guides")
    .select("id, images")
    .eq("id", guideId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (guideErr) {
    console.error("[sifa-rehberi/photos DELETE] guide lookup", guideErr);
    return NextResponse.json({ ok: false, error: "Kayıt doğrulanamadı." }, { status: 500 });
  }
  if (!guide) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }

  const allowedHost = storageHostFromEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const images = Array.isArray(guide.images) ? (guide.images as GuideImageRow[]) : [];
  const isMember = images.some(
    (img) =>
      (typeof img.file_path === "string" && img.file_path === filePath) ||
      resolveHealingImagePath(img, tenantId, allowedHost) === filePath,
  );
  if (!isMember) {
    return NextResponse.json({ ok: false, error: "Görsel bu kayda ait değil." }, { status: 403 });
  }

  const { error: rmError } = await db.storage.from(STONE_PHOTOS_BUCKET).remove([filePath]);
  if (rmError) {
    console.error("[sifa-rehberi/photos DELETE] storage remove", rmError);
    return NextResponse.json({ ok: false, error: "Görsel silinemedi." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
