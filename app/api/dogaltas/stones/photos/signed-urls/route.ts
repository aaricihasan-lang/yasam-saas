import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { STONE_PHOTO_BUCKET, isOwnedStonePhotoPath } from "@/lib/dogaltas/stonePhoto";

export const runtime = "nodejs";

/**
 * POST /api/dogaltas/stones/photos/signed-urls — TOPLU kısa-ömürlü signed URL üretimi.
 *
 * F-016 private-read tasarımı (FAZ 2 hazır): liste 291–400 taşta her thumbnail için AYRI
 * kontrolsüz API çağrısı (N+1) YASAK. Bu route TEK çağrıda `createSignedUrls` batch API ile
 * en fazla MAX_PATHS yolu çözer. Her path tenant-öneki ile doğrulanır → başka tenant'ın
 * objesine signed URL VERİLMEZ. Signed URL DB'ye KALICI yazılmaz (kısa ömürlü).
 *
 * NOT: bucket bu turda hâlâ public; render halen kalıcı url ile çalışır (gerileme yok).
 * Bu route, private-bucket geçişinde (FAZ 2) render'ın kullanacağı yetkili okuma yoludur.
 */

const MAX_PATHS = 100;
const SIGNED_TTL_SECONDS = 3600;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const rawPaths = body.paths;
  if (!Array.isArray(rawPaths)) {
    return NextResponse.json({ ok: false, error: "paths dizisi gerekli." }, { status: 400 });
  }

  // Yalnız kendi tenant önekine ait, benzersiz path'ler; bounded (N+1 önlemi).
  const paths = Array.from(
    new Set(rawPaths.filter((p): p is string => isOwnedStonePhotoPath(p, tenantId))),
  ).slice(0, MAX_PATHS);

  const urls: Record<string, string> = {};
  if (paths.length === 0) {
    return NextResponse.json({ ok: true, urls });
  }

  const { data, error } = await db.storage
    .from(STONE_PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_TTL_SECONDS);
  if (error) {
    return NextResponse.json({ ok: false, error: "İmzalı bağlantı üretilemedi." }, { status: 500 });
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
  }

  return NextResponse.json(
    { ok: true, urls },
    { headers: { "Cache-Control": "no-store" } },
  );
}
