import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { STONE_PHOTOS_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/sifa-rehberi/stonePhotoStorage";
import { loadGuideImageMembership } from "@/lib/sifa-rehberi/guideImageMembership";

export const runtime = "nodejs";

/**
 * POST /api/sifa-rehberi/photos/signed-urls — guide-scoped SIGNED READ (P1 PHASE A).
 *
 * Kalıcı public URL yerine kısa ömürlü signed URL üretir. ARBITRARY SIGNING ORACLE DEĞİL:
 * client KEYFİ path listesi vermez — yalnız `guideId` verir; sunucu, o guide'ın AUTHORITATIVE
 * DB image metadata'sından (top-level `healing_guides.images` + section
 * `healing_guide_sections.images` BİRLEŞİK) file_path setini çıkarır ve YALNIZ onları imzalar.
 *
 * GÜVENLİK:
 *   - requireModuleAccess("sifa_rehberi") + tenantId SUNUCUDAN.
 *   - guide ownership (healing_guides.id = guideId AND tenant_id = guard.tenantId).
 *   - imzalanan path'ler DB metadata'sından + tenant-owned doğrulamasından geçer (resolve).
 *     DB-member tenant staging path'ler de (create-flow'da persist edilen) imzalanabilir;
 *     ARBITRARY staging / cross-guide path İMZALANMAZ (membership zorunlu).
 *   - short-lived TTL (3600 sn).
 *
 * İstek (JSON): { guideId: string }
 * Yanıt: { ok: true, byId: { [imageId]: signedUrl }, urls: { [file_path]: signedUrl } }
 */

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const guideId = String(body.guideId ?? "").trim();
  if (!guideId) {
    return NextResponse.json({ ok: false, error: "guideId gerekli." }, { status: 400 });
  }

  // AUTHORITATIVE membership: guide ownership + top-level + section görsel birleşik set.
  // İmzalanacak path'ler YALNIZ bu tenant'ın bu guide'ının DB metadata'sından türetilir.
  const result = await loadGuideImageMembership(db, tenantId, guideId);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
    }
    console.error("[sifa-rehberi/photos/signed-urls] membership load failed");
    return NextResponse.json({ ok: false, error: "Kayıt doğrulanamadı." }, { status: 500 });
  }

  const { paths, pathByImageId } = result.membership;

  const byId: Record<string, string> = {};
  const urls: Record<string, string> = {};

  if (paths.size > 0) {
    const { data: signed, error: signErr } = await db.storage
      .from(STONE_PHOTOS_BUCKET)
      .createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS);
    if (signErr) {
      console.error("[sifa-rehberi/photos/signed-urls] createSignedUrls", signErr);
      return NextResponse.json({ ok: false, error: "URL üretilemedi." }, { status: 500 });
    }
    for (const entry of signed ?? []) {
      if (entry?.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
    }
    for (const [imageId, path] of pathByImageId) {
      if (urls[path]) byId[imageId] = urls[path];
    }
  }

  return NextResponse.json({ ok: true, byId, urls });
}
