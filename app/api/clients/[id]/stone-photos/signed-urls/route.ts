import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STONE_PHOTO_BUCKET,
  STONE_PHOTO_SIGNED_TTL_SECONDS,
  STONE_PHOTO_THUMB,
  isOwnedClientStonePhotoPath,
} from "@/lib/clients/stonePhotoStorage";

export const runtime = "nodejs";

/**
 * POST /api/clients/[id]/stone-photos/signed-urls — client-scoped SIGNED READ (DYA-07 PHASE B).
 *
 * Kalıcı public URL yerine kısa ömürlü signed URL üretir. ARBITRARY SIGNING ORACLE DEĞİL:
 * client KEYFİ path listesi vermez — yalnız path param'daki clientId geçerlidir; sunucu, o
 * danışanın AUTHORITATIVE `client_stone_photos` satırlarından (tenant + client scoped) file_path
 * setini çıkarır, tenant+client prefix guard'ından geçirir ve YALNIZ onları imzalar.
 *
 * GÜVENLİK:
 *   - requireModuleAccess("clients") + tenantId SUNUCUDAN.
 *   - client ownership (clientBelongsToTenant).
 *   - imzalanan path'ler DB metadata'sından + isOwnedClientStonePhotoPath doğrulamasından geçer.
 *   - short-lived TTL (3600 sn); signed URL DB'ye persist EDİLMEZ.
 *
 * PERF (B1): kart/thumbnail için ayrıca sunucu-taraflı yeniden boyutlandırılmış (transform)
 * kısa ömürlü signed URL üretilir → küçük kartlar 10 MB orijinali indirmez. Tam çözünürlük
 * (lightbox) `byId`; küçük kapak `thumbById`. İmzalanan path seti AYNIdır (aynı ownership
 * guard'ı); transform yalnız görüntü boyutunu küçültür, güvenlik/erişim değişmez.
 *
 * Yanıt: { ok: true, byId: { [photoId]: signedUrl }, thumbById: { [photoId]: thumbSignedUrl } }
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

  const { db, tenantId } = guard;

  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  const { data, error } = await db
    .from("client_stone_photos")
    .select("id, file_path")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);

  if (error) {
    return serverErrorResponse({ route: "clients/[id]/stone-photos/signed-urls", action: "POST", tenantId, cause: error });
  }

  // photoId ↔ owned file_path eşlemesi (yabancı/bozuk path elenir).
  const rows = (data ?? []) as Array<{ id: string; file_path: unknown }>;
  const pathByPhotoId = new Map<string, string>();
  const uniquePaths = new Set<string>();
  for (const r of rows) {
    if (isOwnedClientStonePhotoPath(r.file_path, tenantId, clientId)) {
      pathByPhotoId.set(r.id, r.file_path);
      uniquePaths.add(r.file_path);
    }
  }

  const byId: Record<string, string> = {};
  const thumbById: Record<string, string> = {};
  if (uniquePaths.size > 0) {
    const paths = [...uniquePaths];

    // Tam çözünürlük — batch (tek çağrı). createSignedUrls transform DESTEKLEMEZ.
    const { data: signed, error: signErr } = await db.storage
      .from(STONE_PHOTO_BUCKET)
      .createSignedUrls(paths, STONE_PHOTO_SIGNED_TTL_SECONDS);
    if (signErr) {
      return serverErrorResponse({ route: "clients/[id]/stone-photos/signed-urls", action: "sign", tenantId, cause: signErr });
    }
    const urlByPath: Record<string, string> = {};
    for (const entry of signed ?? []) {
      if (entry?.path && entry.signedUrl) urlByPath[entry.path] = entry.signedUrl;
    }

    // Kart/thumbnail — transform yalnız tekil createSignedUrl'de var → path başına, PARALEL.
    // Thumb imzalama hatası NON-FATAL: o path için thumb atlanır, client tam URL'e düşer.
    const thumbUrlByPath: Record<string, string> = {};
    const thumbResults = await Promise.all(
      paths.map(async (p) => {
        const { data: t, error: e } = await db.storage
          .from(STONE_PHOTO_BUCKET)
          .createSignedUrl(p, STONE_PHOTO_SIGNED_TTL_SECONDS, {
            transform: {
              width: STONE_PHOTO_THUMB.width,
              height: STONE_PHOTO_THUMB.height,
              resize: STONE_PHOTO_THUMB.resize,
              quality: STONE_PHOTO_THUMB.quality,
            },
          });
        return { path: p, url: e ? null : t?.signedUrl ?? null };
      }),
    );
    for (const r of thumbResults) {
      if (r.url) thumbUrlByPath[r.path] = r.url;
    }

    for (const [photoId, path] of pathByPhotoId) {
      if (urlByPath[path]) byId[photoId] = urlByPath[path];
      if (thumbUrlByPath[path]) thumbById[photoId] = thumbUrlByPath[path];
    }
  }

  return NextResponse.json({ ok: true, byId, thumbById });
}
