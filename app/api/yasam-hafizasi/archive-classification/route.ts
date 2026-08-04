import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getTenantFlags } from "@/lib/yasam-hafizasi/flags";
import { parseArchiveClassification } from "@/lib/yasam-hafizasi/archive/archiveClassificationRequest";

export const runtime = "nodejs";

/**
 * POST /api/yasam-hafizasi/archive-classification — Kişisel Arşiv kayıt-bazlı sınıflandırma
 * (BF-14 Ertelenmiş Kaynaklar foundation). Yalnız yetkili uzman/admin explicit action.
 *
 * Güvenlik: tenant YALNIZ session'dan; archive_id ownership session tenant ile bağlanır (yazma
 * tenant-scoped). safe-non-pii → reason + reviewedContentHash ZORUNLU (stale guard). Varsayılan
 * ve tüm diğer sınıflar fail-closed (indexlenmez). Demo write engelli. Şema yoksa → not-active.
 * Mevcut kayıtlar OTOMATİK safe yapılmaz; hiçbir backfill yapılmaz.
 */

const UNAVAILABLE = new Set(["42P01", "42883", "PGRST205", "PGRST202"]);

function fail(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  const { db, tenantId, userId, is_demo_account, profile } = guard;

  if (!hasModulePermissionForProfile(profile, "yasam_hafizasi")) return fail("YH_MODULE_FORBIDDEN", 403);
  if (is_demo_account) return fail("YH_DEMO_READONLY", 403);

  const flags = await getTenantFlags(tenantId, db);
  if (!flags.yh_enabled) return fail("YH_NOT_ACTIVE", 403);

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("YH_ARC_INVALID_BODY", 400);
  }
  const parsed = parseArchiveClassification(rawBody);
  if (!parsed.ok) return fail(parsed.code, 400);
  const { archiveId, classification, reason, reviewedContentHash } = parsed.value;

  // Upsert (tenant_id, archive_id): sınıflandırma yalnız bu tenant scope'unda yazılır.
  const row = {
    tenant_id: tenantId,
    archive_id: archiveId,
    classification,
    reason: reason ?? null,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    reviewed_content_hash: reviewedContentHash ?? null,
    updated_at: new Date().toISOString(),
  };
  const res = await db
    .from("yh_archive_classifications")
    .upsert(row, { onConflict: "tenant_id,archive_id" })
    .select("id, classification")
    .maybeSingle();

  if (res.error || !res.data) {
    return fail(
      UNAVAILABLE.has(res.error?.code ?? "") ? "YH_ARC_NOT_ACTIVE" : "YH_ARC_WRITE_FAILED",
      UNAVAILABLE.has(res.error?.code ?? "") ? 409 : 500,
    );
  }

  return NextResponse.json({
    ok: true,
    archiveId,
    classification,
    indexEligible: classification === "safe-non-pii",
    note:
      classification === "safe-non-pii"
        ? "Kayıt güvenli olarak işaretlendi; içerik değişirse (hash uyuşmazlığı) yeniden inceleme gerekir."
        : "Kayıt indexlenmeyecek (fail-closed).",
  });
}
