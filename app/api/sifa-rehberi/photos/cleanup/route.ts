import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  STONE_PHOTOS_BUCKET,
  isTenantOwnedHealingPath,
} from "@/lib/sifa-rehberi/stonePhotoStorage";

export const runtime = "nodejs";

/**
 * POST /api/sifa-rehberi/photos/cleanup — orphan objeyi güvenli temizler (P1 PHASE A).
 *
 * Kullanım: yeni-kayıt (create) akışında kullanıcı kaydetmeden görseli kaldırırsa, veya
 * signed upload + finalize başarılı olup metadata persist (save) başarısız olursa oluşan
 * orphan obje (staging VEYA guide-scoped) bu uçla temizlenir. Tarayıcı `.remove()` KULLANMAZ.
 *
 * GÜVENLİK (arbitrary client path delete DEĞİL):
 *   - requireModuleAccess("sifa_rehberi") + tenantId SUNUCUDAN.
 *   - path YALNIZ `healing-guides/{tenant}/` öneki altında olabilir (cross-tenant/traversal reddi).
 *   - SADECE ORPHAN: bu path'e referans veren bir healing_guides.images satırı (bu tenant'ta)
 *     VARSA silme YAPILMAZ (persist edilmiş gerçek veri korunur). Böylece bu uçla başka tenant
 *     objesi ya da kendi KAYITLI görseli silinemez — yalnız metadata'sız kendi orphan'ı.
 *   - service_role storage remove.
 *   - Demo hesap: DENY.
 *
 * İstek (JSON): { path: string }
 */

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

  // Yalnız bu tenant'ın öneki altındaki objeler temizlenebilir (cross-tenant/traversal reddi).
  if (!isTenantOwnedHealingPath(path, tenantId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz dosya yolu." }, { status: 400 });
  }

  // Yalnız ORPHAN: bu path'e referans veren bir kayıt (images JSONB) varsa DOKUNMA.
  const { data: refRows, error: refErr } = await db
    .from("healing_guides")
    .select("id")
    .eq("tenant_id", tenantId)
    .filter("images", "cs", JSON.stringify([{ file_path: path }]))
    .limit(1);
  if (refErr) {
    console.error("[sifa-rehberi/photos/cleanup] reference check", refErr);
    return NextResponse.json({ ok: false, error: "Doğrulanamadı." }, { status: 500 });
  }
  if (refRows && refRows.length > 0) {
    return NextResponse.json({ ok: false, error: "Görsel kayıtlı; temizlenemez." }, { status: 409 });
  }

  const { error: rmError } = await db.storage.from(STONE_PHOTOS_BUCKET).remove([path]);
  if (rmError) {
    console.error("[sifa-rehberi/photos/cleanup] storage remove", rmError);
    return NextResponse.json({ ok: false, error: "Temizlenemedi." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
