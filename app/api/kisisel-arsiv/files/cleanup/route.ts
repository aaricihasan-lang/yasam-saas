import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnedPersonalArchivePath } from "@/lib/kisisel-arsiv/storagePath";

import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { archiveServerErrorResponse, logArchiveServerError } from "@/lib/kisisel-arsiv/archiveError";
import { claimPersonalArchiveUpload, disposeClaimedPersonalArchivePaths } from "@/lib/kisisel-arsiv/uploadPolicy";
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
const ROUTE = "kisisel-arsiv/files/cleanup";

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

  if (is_demo_account) return demoReadOnlyResponse();

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
    return archiveServerErrorResponse(ROUTE, "POST:select", tenantId, rowError);
  }
  if (existingRow) {
    // Finalize edilmiş gerçek veri → cleanup ile silinmez.
    return NextResponse.json({ ok: false, error: "Dosya kayıtlı; temizlenemez." }, { status: 409 });
  }

  // DIJ-03: nesneye YALNIZ yolun canlı yükleme rezervasyonu ATOMİK sahiplenilirse dokunulur. Sahiplenilemezse
  // (eşzamanlı finalize aldı / kaydetti ya da süre doldu) hiçbir şey yapılmaz → kayıtlı dosya silinemez/ezilemez.
  // Sahiplenilen yol artık kaydedilemez; elden çıkarma güvence rezervasyonu (belirteç ömrü) ya da 0 B yer tutucu kullanır.
  const claim = await claimPersonalArchiveUpload(db, tenantId, path);
  if (claim === null) {
    const ref = logArchiveServerError(ROUTE, "POST:claim", tenantId, "rezervasyon sahiplenilemedi (DB)");
    return NextResponse.json({ ok: false, error: "Temizlenemedi. Lütfen yeniden deneyin.", ref }, { status: 500 });
  }
  if (claim === false) {
    return NextResponse.json({ ok: false, error: "Temizlenecek bekleyen yükleme yok (tamamlanmış ya da süresi dolmuş)." }, { status: 409 });
  }
  if (!(await disposeClaimedPersonalArchivePaths(db, tenantId, [path]))) {
    const ref = logArchiveServerError(ROUTE, "POST:discard", tenantId, "belirteç-güvenli temizlik yapılamadı");
    return NextResponse.json({ ok: false, error: "Temizlenemedi. Lütfen yeniden deneyin.", ref }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
