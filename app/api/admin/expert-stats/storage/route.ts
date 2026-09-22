import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { isUuid, resolveTargetExpert } from "@/lib/admin/stats/statsRequest";
import { makeMetric, type MetricValue, type StatsEnvelope } from "@/lib/admin/stats/contract";
import { LEGACY_TENANT_ID } from "@/lib/admin/stats/moduleUsageRegistry";

export const runtime = "nodejs";

type StorageRow = {
  tenant_id: string | null;
  bucket: string;
  object_count: number;
  total_bytes: number;
  missing_size_count: number;
};

/**
 * GET /api/admin/expert-stats/storage?userId=<uuid>
 *
 * FAZ 1 / İP-4 — ÇALIŞMA ALANI (scope=workspace) fiziksel depolama. Kaynak:
 * expert_storage_usage() RPC (storage.objects metadata; DOSYA İÇERİĞİ OKUNMAZ; DB'de
 * toplulaştırılır). Bir fiziksel obje BİR KEZ sayılır (birden çok kayıt referanslasa da).
 *   - objectCount / totalBytes : tenant'a atfedilen fiziksel obje/byte — measured
 *   - byBucket                 : bucket kırılımı
 *   - missingSizeCount>0       : boyutu bilinmeyen obje → status "approximate" (kesin toplam değil)
 *   - unattributed*            : sahibi belirlenemeyen obje/byte (scope=system) — tahminen uzmana yüklenmez
 *   - isLegacyTenant           : legacy (pre-multitenant) çalışma alanı işareti
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  if (!isUuid(userId)) {
    return NextResponse.json({ ok: false, error: "Geçerli userId gerekli." }, { status: 400 });
  }
  const target = await resolveTargetExpert(db, userId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı." }, { status: 404 });
  }
  const measuredAt = new Date().toISOString();

  const { data, error } = await db.rpc("expert_storage_usage");
  if (error) {
    return NextResponse.json({ ok: false, error: "Depolama ölçümü okunamadı." }, { status: 500 });
  }
  const rows = (Array.isArray(data) ? data : []) as unknown as StorageRow[];

  let objectCount = 0;
  let totalBytes = 0;
  let missingSize = 0;
  const byBucket: Record<string, { objectCount: number; totalBytes: number; missingSizeCount: number }> = {};
  let unattributedObjects = 0;
  let unattributedBytes = 0;

  for (const r of rows) {
    const oc = Number(r.object_count ?? 0);
    const tb = Number(r.total_bytes ?? 0);
    const ms = Number(r.missing_size_count ?? 0);
    if (r.tenant_id === target.tenantId) {
      objectCount += oc;
      totalBytes += tb;
      missingSize += ms;
      const b = (byBucket[r.bucket] ??= { objectCount: 0, totalBytes: 0, missingSizeCount: 0 });
      b.objectCount += oc;
      b.totalBytes += tb;
      b.missingSizeCount += ms;
    } else if (r.tenant_id == null) {
      unattributedObjects += oc;
      unattributedBytes += tb;
    }
  }

  const partial = missingSize > 0;
  const bytesStatus = partial ? "approximate" : "measured";
  const bytesNote = partial
    ? "boyutu bilinmeyen obje var → toplam byte eksik ölçüm (kesin toplam değil)"
    : "storage.objects metadata->>'size' toplamı";

  const payload: StatsEnvelope<{
    userId: string;
    tenantId: string;
    isDemo: boolean;
    isLegacyTenant: boolean;
    objectCount: MetricValue<number>;
    totalBytes: MetricValue<number>;
    missingSizeCount: MetricValue<number>;
    byBucket: Record<string, { objectCount: number; totalBytes: number; missingSizeCount: number }>;
    unattributedObjectCount: MetricValue<number>;
    unattributedBytes: MetricValue<number>;
  }> = {
    ok: true,
    contractVersion: 1,
    data: {
      userId,
      tenantId: target.tenantId,
      isDemo: target.isDemo,
      isLegacyTenant: target.tenantId === LEGACY_TENANT_ID,
      objectCount: makeMetric(objectCount, "workspace", "measured", "object", {
        measuredAt,
        note: "atfedilen fiziksel obje (her obje bir kez)",
      }),
      totalBytes: makeMetric(totalBytes, "workspace", bytesStatus, "byte", { measuredAt, note: bytesNote }),
      missingSizeCount: makeMetric(missingSize, "workspace", "measured", "object", {
        measuredAt,
        note: "boyut metadata'sı eksik obje sayısı",
      }),
      byBucket,
      unattributedObjectCount: makeMetric(unattributedObjects, "system", "measured", "object", {
        measuredAt,
        note: "sahibi (tenant) belirlenemeyen obje — tahminen uzmana YÜKLENMEZ",
      }),
      unattributedBytes: makeMetric(unattributedBytes, "system", "measured", "byte", {
        measuredAt,
        note: "atfedilemeyen byte (scope=system)",
      }),
    },
  };

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
