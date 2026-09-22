import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { parseRange } from "@/lib/admin/stats/statsRequest";
import { trCalendarDate } from "@/lib/admin/stats/uiFormat";
import type { StorageGrowthData, StorageGrowthPoint } from "@/lib/admin/stats/apiTypes";

export const runtime = "nodejs";

/**
 * GET /api/admin/expert-stats/storage-growth?from=<iso>&to=<iso>
 *
 * FAZ 2 — SİSTEM geneli günlük depolama geçmişi. Tarih aralığı KATI (geçersiz/ters → 400).
 * TARİH SEMANTİĞİ: günlük snapshot TAM TAKVİM GÜNÜdür; sınırlar TÜRKİYE takvim gününe göre
 * INCLUSIVE `[fromDate, toDate]` çevrilir (parseRange'in yarı-açık UTC ISO'sunun ham dilimi +03
 * offset nedeniyle günü kaydırırdı — düzeltildi). `to` yarı-açık üst sınırın 1ms öncesinin TR günü
 * = dahil edilecek SON gün.
 *
 * comparable = ≥2 nokta VE tüm noktalar aynı tenant KÜMESİNE (tenant_sig) sahip VE hiçbiri kısmi
 * değil → yalnız o zaman çizgi çizilir (aynı SAYIDA fakat farklı tenant "comparable" DEĞİLDİR).
 * measurementStarted = seçilen aralıkta ≥1 gün. everMeasured = sistemde HİÇ günlük ölçüm var mı
 * (aralık-dışı) → "aralıkta yok" ile "hiç başlamadı" ayrımı. Yazıcı snapshot RPC ÇAĞRILMAZ.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const parsed = parseRange(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  // TR takvim günü sınırları (inclusive). from: instant'ın TR günü. to: yarı-açık üst sınırın
  // 1ms öncesinin TR günü = dahil edilecek son gün (özel aralıkta bitiş gününü kaydırmaz).
  const fromDate = trCalendarDate(parsed.range.from);
  const toDate = parsed.range.to ? trCalendarDate(new Date(Date.parse(parsed.range.to) - 1).toISOString()) : null;

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
  const sigs = rows.map((r) => String(r.tenant_sig ?? ""));

  // everMeasured: aralıktan bağımsız — sistemde hiç günlük ölçüm satırı var mı?
  const { count: everCount } = await db
    .from("expert_storage_daily")
    .select("*", { count: "exact", head: true });
  const everMeasured = (everCount ?? 0) > 0;

  // comparable: ≥2 nokta, hepsi aynı tenant kümesi (sig) ve hiçbiri kısmi değil.
  const comparable =
    points.length >= 2 &&
    sigs.every((s) => s === sigs[0] && s !== "") &&
    points.every((p) => p.partialCount === 0);

  const note = (() => {
    if (points.length === 0) {
      return everMeasured
        ? "Seçilen aralıkta ölçüm noktası yok (sistemde günlük ölçüm mevcut, bu aralıkta değil)."
        : "Sistemde günlük depolama ölçümü henüz hiç başlamadı. Geçmiş büyüme uydurulmaz.";
    }
    if (points.length === 1) return "Tek ölçüm noktası — artış/azalış yorumu için en az iki karşılaştırılabilir gün gerekir.";
    if (!comparable) return "Noktalar farklı tenant kapsamı veya kısmi ölçüm içeriyor → karşılaştırılabilir değil; kesin büyüme yorumu yapılmaz.";
    return "Sistem geneli günlük depolama (aynı tenant kümesi, tam ölçüm) — karşılaştırılabilir.";
  })();

  const payload: { ok: true; contractVersion: 1; data: StorageGrowthData } = {
    ok: true,
    contractVersion: 1,
    data: {
      points,
      measurementStarted: points.length > 0,
      everMeasured,
      comparable,
      range: { from: fromDate, to: toDate },
      note,
    },
  };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
