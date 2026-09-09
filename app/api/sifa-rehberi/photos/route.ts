import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  STONE_PHOTOS_BUCKET,
  isGuideOwnedHealingPath,
  isStagingHealingPath,
} from "@/lib/sifa-rehberi/stonePhotoStorage";
import { loadGuideImageMembership } from "@/lib/sifa-rehberi/guideImageMembership";

export const runtime = "nodejs";

/**
 * DELETE /api/sifa-rehberi/photos — SUNUCU-YETKİLİ görsel silme (P1 PHASE A).
 *
 * Tarayıcı `.remove()` TAMAMEN kaldırıldı. Silme yalnız bu uçtan geçer.
 *
 * GÜVENLİK (arbitrary client path delete DEĞİL):
 *   - requireModuleAccess("sifa_rehberi") + tenantId SUNUCUDAN.
 *   - guide ownership (healing_guides.id = guideId AND tenant_id = guard.tenantId).
 *   - file_path YALNIZ `healing-guides/{tenant}/{guideId}/` (guide-owned) VEYA
 *     `healing-guides/{tenant}/staging/` (create-flow'da persist edilen) öneki altında olabilir.
 *   - RESOURCE MEMBERSHIP: file_path bu guide'ın AUTHORITATIVE DB image metadata'sında
 *     (top-level `healing_guides.images` + section `healing_guide_sections.images` BİRLEŞİK)
 *     GERÇEKTEN var olmalı — path'i bilmek / tenant|staging önekini bilmek YETMEZ.
 *     (file_path authorization proof DEĞİL.) → arbitrary staging + cross-guide delete engellenir.
 *   - service_role storage remove; metadata JSONB güncellemesi mevcut ürün akışında
 *     (updateHealingGuide / replace_healing_guide_sections → module-authed route) yapılır.
 *   - Demo hesap: DENY.
 *
 * İstek (JSON): { guideId: string, file_path: string }
 */

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

  // Prefix savunması — path yalnız bu tenant+guide öneki VEYA tenant staging öneki altında.
  // (Nihai yetki AŞAĞIDAKİ DB membership'tir; bu yalnız erken/ucuz reddir.)
  const isGuideOwned = isGuideOwnedHealingPath(filePath, tenantId, guideId);
  const isStaging = isStagingHealingPath(filePath, tenantId);
  if (!isGuideOwned && !isStaging) {
    return NextResponse.json({ ok: false, error: "Geçersiz dosya yolu." }, { status: 400 });
  }

  // AUTHORITATIVE membership: guide ownership + top-level + section görsel birleşik set.
  const result = await loadGuideImageMembership(db, tenantId, guideId);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
    }
    console.error("[sifa-rehberi/photos DELETE] membership load failed");
    return NextResponse.json({ ok: false, error: "Kayıt doğrulanamadı." }, { status: 500 });
  }

  // file_path bu guide'ın AUTHORITATIVE image set'inde GERÇEKTEN olmalı (staging dahil).
  if (!result.membership.paths.has(filePath)) {
    return NextResponse.json({ ok: false, error: "Görsel bu kayda ait değil." }, { status: 403 });
  }

  const { error: rmError } = await db.storage.from(STONE_PHOTOS_BUCKET).remove([filePath]);
  if (rmError) {
    console.error("[sifa-rehberi/photos DELETE] storage remove", rmError);
    return NextResponse.json({ ok: false, error: "Görsel silinemedi." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
