import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PERSONAL_ARCHIVE_BUCKET,
  isOwnedPersonalArchivePath,
} from "@/lib/kisisel-arsiv/storagePath";

export const runtime = "nodejs";

/**
 * POST /api/kisisel-arsiv/files/cleanup — signed upload sonrası finalize BAŞARISIZ olursa
 * orphan objeyi güvenli temizler (P1-3).
 *
 * GÜVENLİK (arbitrary client path delete DEĞİL):
 *   - requireModuleAccess + tenantId SUNUCUDAN.
 *   - archive ownership doğrulanır.
 *   - path yalnız `${guard.tenantId}/${archiveId}/` öneki altında olabilir.
 *   - SADECE ORPHAN silinir: bu path için personal_archive_files satırı VARSA silme YAPILMAZ
 *     (finalize edilmiş gerçek veri korunur). Böylece bu uç ile başka tenant objesi ya da
 *     kendi finalize edilmiş dosyası silinemez — yalnız metadata'sız kendi orphan'ı.
 *
 * İstek (JSON): { archiveId, path }
 */

const FILES_TABLE = "personal_archive_files";

async function archiveInTenant(
  db: SupabaseClient,
  archiveId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("personal_archives")
    .select("id")
    .eq("id", archiveId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "personal_archive");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const archiveId = String(body.archiveId ?? "").trim();
  const path = String(body.path ?? "").trim();
  if (!archiveId || !path) {
    return NextResponse.json({ ok: false, error: "archiveId ve path gerekli." }, { status: 400 });
  }

  if (!(await archiveInTenant(db, archiveId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Arşiv bu hesaba ait değil." }, { status: 403 });
  }

  // Path yalnız bu tenant + archive öneki altında olabilir.
  if (!isOwnedPersonalArchivePath(path, tenantId, archiveId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz dosya yolu." }, { status: 400 });
  }

  // Yalnız ORPHAN temizlenir: bu path için metadata satırı varsa (finalize edilmiş) dokunma.
  const { data: existingRow, error: rowError } = await db
    .from(FILES_TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("archive_id", archiveId)
    .eq("file_path", path)
    .maybeSingle();

  if (rowError) {
    return NextResponse.json({ ok: false, error: rowError.message }, { status: 500 });
  }
  if (existingRow) {
    // Finalize edilmiş gerçek veri → cleanup ile silinmez.
    return NextResponse.json({ ok: false, error: "Dosya kayıtlı; temizlenemez." }, { status: 409 });
  }

  const { error: rmError } = await db.storage.from(PERSONAL_ARCHIVE_BUCKET).remove([path]);
  if (rmError) {
    console.error("[kisisel-arsiv/files/cleanup] storage remove", rmError);
    return NextResponse.json({ ok: false, error: "Temizlenemedi." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
