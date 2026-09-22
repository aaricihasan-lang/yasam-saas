import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { makeMetric, type MetricValue } from "@/lib/admin/stats/contract";
import type { StorageOverviewData, StorageBucketBreakdown } from "@/lib/admin/stats/apiTypes";

export const runtime = "nodejs";

type StorageRow = {
  tenant_id: string | null;
  bucket: string;
  object_count: number;
  total_bytes: number;
  missing_size_count: number;
};

/**
 * GET /api/admin/expert-stats/storage-overview
 *
 * FAZ 2 — SİSTEM geneli fiziksel depolama özeti. Mevcut `expert_storage_usage()` RPC'sinin
 * (allowlist bucket'lar, tenant path atfı) güvenli TOPLULAŞTIRMASI — yeni migration YOK.
 * Bir fiziksel obje BİR KEZ sayılır (RPC satırları tenant×bucket; obje çift-saymaz).
 * tenant_id NULL satırlar = atfedilemeyen (bir uzmana YÜKLENMEZ). Allowlist dışı bucket'lar
 * RPC'de zaten HARİÇ → "sistemin eksiksiz depolaması" iddiası edilmez (coverageNote).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;
  const measuredAt = new Date().toISOString();

  const { data, error } = await db.rpc("expert_storage_usage");
  if (error) {
    return NextResponse.json({ ok: false, error: "Depolama özeti okunamadı." }, { status: 500 });
  }
  const rows = (Array.isArray(data) ? data : []) as unknown as StorageRow[];

  let attrObj = 0, attrBytes = 0, unattrObj = 0, unattrBytes = 0, missing = 0;
  const byBucket: StorageBucketBreakdown = {};
  const tenants = new Set<string>();

  for (const r of rows) {
    const oc = Number(r.object_count ?? 0);
    const tb = Number(r.total_bytes ?? 0);
    const ms = Number(r.missing_size_count ?? 0);
    missing += ms;
    const b = (byBucket[r.bucket] ??= { objectCount: 0, totalBytes: 0, missingSizeCount: 0 });
    b.objectCount += oc; b.totalBytes += tb; b.missingSizeCount += ms;
    if (r.tenant_id == null) {
      unattrObj += oc; unattrBytes += tb;
    } else {
      attrObj += oc; attrBytes += tb; tenants.add(r.tenant_id);
    }
  }
  const partial = missing > 0;
  const m = (v: number, unit: "object" | "byte" | "count"): MetricValue<number> =>
    makeMetric(v, "system", partial && unit === "byte" ? "approximate" : "measured", unit, { measuredAt });

  const payload: { ok: true; contractVersion: 1; data: StorageOverviewData } = {
    ok: true,
    contractVersion: 1,
    data: {
      attributedObjectCount: m(attrObj, "object"),
      attributedBytes: m(attrBytes, "byte"),
      unattributedObjectCount: makeMetric(unattrObj, "system", "measured", "object", {
        measuredAt,
        note: "sahibi (tenant) belirlenemeyen obje — bir uzmana YÜKLENMEZ",
      }),
      unattributedBytes: makeMetric(unattrBytes, "system", "measured", "byte", { measuredAt }),
      missingSizeCount: makeMetric(missing, "system", "measured", "object", {
        measuredAt,
        note: "boyut metadata'sı eksik obje (byte toplamına dahil değil → approximate)",
      }),
      tenantCount: makeMetric(tenants.size, "system", "measured", "count", {
        measuredAt,
        note: "depolamada objesi olan (atfedilebilen) çalışma alanı sayısı",
      }),
      byBucket,
      coverageNote:
        "Kapsam = allowlist bucket'lar (stone-photos, hd-chart-images, client-analysis-images, " +
        "video-temp, video-ceviri-output, belge-ceviri, personal-archive). Allowlist dışı objeler " +
        "kapsanmaz; bu değer sistemin EKSİKSİZ depolaması iddiası DEĞİLDİR.",
    },
  };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
