import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { parseRange } from "@/lib/admin/stats/statsRequest";
import type { StorageGrowthData, StorageGrowthPoint } from "@/lib/admin/stats/apiTypes";

export const runtime = "nodejs";

/**
 * GET /api/admin/expert-stats/storage-growth?from=<iso>&to=<iso>
 *
 * FAZ 2 — SİSTEM geneli günlük depolama geçmişi. `expert_storage_growth(p_from,p_to)` RPC'si
 * expert_storage_daily'den gün-bazlı toplar. Tarih aralığı KATI (geçersiz/ters → 400).
 * Snapshot tablosu boşsa satır DÖNMEZ → measurementStarted=false + dürüst boş durum.
 * Sahte geçmiş nokta ÜRETİLMEZ. comparable = ≥2 gerçek nokta (UI yalnız o zaman çizgi çizer).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const parsed = parseRange(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  // Growth günlük snapshot_date (date) bazlıdır → ISO'dan tarih kısmını al.
  const fromDate = parsed.range.from ? parsed.range.from.slice(0, 10) : null;
  const toDate = parsed.range.to ? parsed.range.to.slice(0, 10) : null;

  const { data, error } = await db.rpc("expert_storage_growth", { p_from: fromDate, p_to: toDate });
  if (error) {
    return NextResponse.json({ ok: false, error: "Depolama geçmişi okunamadı." }, { status: 500 });
  }
  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  const points: StorageGrowthPoint[] = rows.map((r) => ({
    snapshotDate: String(r.snapshot_date).slice(0, 10),
    tenantCount: Number(r.tenant_count ?? 0),
    objectCount: Number(r.object_count ?? 0),
    totalBytes: Number(r.total_bytes ?? 0),
    partialCount: Number(r.partial_count ?? 0),
  }));

  const payload: { ok: true; contractVersion: 1; data: StorageGrowthData } = {
    ok: true,
    contractVersion: 1,
    data: {
      points,
      measurementStarted: points.length > 0,
      comparable: points.length >= 2,
      range: { from: fromDate, to: toDate },
      note:
        points.length === 0
          ? "Günlük depolama ölçümü henüz başlamadı (snapshot verisi yok). Geçmiş büyüme uydurulmaz."
          : points.length === 1
            ? "Tek ölçüm noktası — artış/azalış yorumu için en az iki karşılaştırılabilir gün gerekir."
            : "Sistem geneli günlük depolama. partialCount>0 olan günler kısmi ölçümdür.",
    },
  };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
