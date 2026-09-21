import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STONE_PHOTO_BUCKET,
  STONE_PHOTO_SIGNED_TTL_SECONDS,
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
 * Yanıt: { ok: true, byId: { [photoId]: signedUrl } }
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
  if (uniquePaths.size > 0) {
    const { data: signed, error: signErr } = await db.storage
      .from(STONE_PHOTO_BUCKET)
      .createSignedUrls([...uniquePaths], STONE_PHOTO_SIGNED_TTL_SECONDS);
    if (signErr) {
      return serverErrorResponse({ route: "clients/[id]/stone-photos/signed-urls", action: "sign", tenantId, cause: signErr });
    }
    const urlByPath: Record<string, string> = {};
    for (const entry of signed ?? []) {
      if (entry?.path && entry.signedUrl) urlByPath[entry.path] = entry.signedUrl;
    }
    for (const [photoId, path] of pathByPhotoId) {
      if (urlByPath[path]) byId[photoId] = urlByPath[path];
    }
  }

  return NextResponse.json({ ok: true, byId });
}
