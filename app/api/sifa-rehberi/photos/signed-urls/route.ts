import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  STONE_PHOTOS_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  resolveHealingImagePath,
  storageHostFromEnv,
} from "@/lib/sifa-rehberi/stonePhotoStorage";

export const runtime = "nodejs";

/**
 * POST /api/sifa-rehberi/photos/signed-urls — guide-scoped SIGNED READ (P1 PHASE A).
 *
 * Kalıcı public URL yerine kısa ömürlü signed URL üretir. ARBITRARY SIGNING ORACLE DEĞİL:
 * client KEYFİ path listesi vermez — yalnız `guideId` verir; sunucu, o guide'ın DB image
 * metadata'sından AUTHORITATIVE file_path setini çıkarır ve YALNIZ onları imzalar.
 *
 * GÜVENLİK:
 *   - requireModuleAccess("sifa_rehberi") + tenantId SUNUCUDAN.
 *   - guide ownership (healing_guides.id = guideId AND tenant_id = guard.tenantId).
 *   - imzalanan path'ler DB metadata'sından + tenant-owned doğrulamasından geçer (resolve).
 *   - short-lived TTL (3600 sn).
 *
 * İstek (JSON): { guideId: string }
 * Yanıt: { ok: true, byId: { [imageId]: signedUrl }, urls: { [file_path]: signedUrl } }
 */

type GuideImageRow = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  file_path?: unknown;
  section?: unknown;
};

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

  // Guide ownership — imzalanacak path'ler YALNIZ bu tenant'ın bu guide'ından türetilir.
  const { data: guide, error: guideErr } = await db
    .from("healing_guides")
    .select("id, images")
    .eq("id", guideId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (guideErr) {
    console.error("[sifa-rehberi/photos/signed-urls] guide lookup", guideErr);
    return NextResponse.json({ ok: false, error: "Kayıt doğrulanamadı." }, { status: 500 });
  }
  if (!guide) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }

  const allowedHost = storageHostFromEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const images = Array.isArray(guide.images) ? (guide.images as GuideImageRow[]) : [];

  // AUTHORITATIVE path seti (DB metadata + tenant-owned doğrulaması). imageId → path.
  const pathByImageId = new Map<string, string>();
  const paths = new Set<string>();
  for (const img of images) {
    const path = resolveHealingImagePath(img, tenantId, allowedHost);
    if (!path) continue;
    paths.add(path);
    if (typeof img.id === "string" && img.id) pathByImageId.set(img.id, path);
  }

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
