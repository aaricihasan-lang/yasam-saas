import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getTenantFlags } from "@/lib/yasam-hafizasi/flags";
import { parseArchiveClassification } from "@/lib/yasam-hafizasi/archive/archiveClassificationRequest";
import { YH_INDEX_SOURCES } from "@/lib/yasam-hafizasi/indexer/sources";
import { runIndexUnit } from "@/lib/yasam-hafizasi/indexer/runIndexUnit";

export const runtime = "nodejs";

/**
 * POST /api/yasam-hafizasi/archive-classification — Kişisel Arşiv kayıt-bazlı sınıflandırma
 * (BF-11E ROW-GATED CONTROLLED). Yalnız yetkili uzman/admin explicit action.
 *
 * Güvenlik: tenant YALNIZ session'dan; archive_id ownership session tenant ile bağlanır (yazma
 * tenant-scoped). safe-non-pii → reason ZORUNLU; reviewed_content_hash CLIENT'tan ALINMAZ →
 * server, archive satırından buildIndexUnit().contentHash türetir (stale guard). pii/restricted/
 * unclassified → reviewed_content_hash NULL (indexlenmez, fail-closed). Demo write engelli. Şema
 * yoksa → not-active. Mevcut kayıtlar OTOMATİK safe yapılmaz; hiçbir backfill yapılmaz.
 */

const UNAVAILABLE = new Set(["42P01", "42883", "PGRST205", "PGRST202"]);

/** Kişisel Arşiv registry config'i (server-türetimli hash için canonical build surface). */
const ARCHIVE_SOURCE = YH_INDEX_SOURCES.find((s) => s.sourceKey === "kisisel_arsiv:archives")!;

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
  const { archiveId, classification, reason } = parsed.value;

  // BF-11E SERVER-TÜRETİMLİ HASH: safe-non-pii için reviewed_content_hash CLIENT'tan ALINMAZ.
  // Server, archive satırını tenant-scoped okur ve buildIndexUnit().contentHash türetir (index'lenen
  // canonical yüzey = title/note/category/tags). İçerik değişirse hash değişir → sonraki review şart.
  // pii/restricted/unclassified → hash NULL (indexlenmez). Cross-tenant imkânsız (.eq tenant_id).
  let reviewedContentHash: string | null = null;
  if (classification === "safe-non-pii") {
    const arc = await db
      .from("personal_archives")
      .select("*")
      .eq("id", archiveId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (arc.error) {
      return fail(UNAVAILABLE.has(arc.error.code ?? "") ? "YH_ARC_NOT_ACTIVE" : "YH_ARC_READ_FAILED", UNAVAILABLE.has(arc.error.code ?? "") ? 409 : 500);
    }
    if (!arc.data) return fail("YH_ARC_ARCHIVE_NOT_FOUND", 404);
    const built = runIndexUnit({ config: ARCHIVE_SOURCE, row: arc.data as Record<string, unknown> });
    if (built.status !== "unit") return fail("YH_ARC_NO_INDEXABLE_CONTENT", 422);
    reviewedContentHash = built.unit.contentHash;
  }

  // Upsert (tenant_id, archive_id): sınıflandırma yalnız bu tenant scope'unda yazılır.
  const row = {
    tenant_id: tenantId,
    archive_id: archiveId,
    classification,
    reason: reason ?? null,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    reviewed_content_hash: reviewedContentHash,
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
