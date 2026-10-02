import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { STONE_PHOTO_BUCKET, collectStonePhotoPaths } from "@/lib/dogaltas/stonePhoto";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { fetchAllRowsByIds } from "@/lib/dogaltas/fetchAllRows";
import { filterUnreferencedStonePhotoPaths } from "@/lib/dogaltas/stonePhotoRefs";

export const runtime = "nodejs";

/**
 * POST /api/dogaltas/stones/bulk-delete — Doğaltaş Listesi toplu silme (UAT #1).
 * Body: { ids: string[] }. Tek istekte siler → sıralı tekil DELETE yerine batch.
 * Silme yalnız .in("id", ids).eq("tenant_id", tenantId) →
 * yalnız kendi tenant kayıtları silinir; başka tenant / kütüphane id'leri yok sayılır
 * (kütüphane taşları client tarafında exclusion ile ayrı ele alınır).
 * Tek atomik istek olduğu için "sayfadan çıkınca kısmi silme" riski ortadan kalkar.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: { ids?: unknown };
  try { body = (await req.json()) as { ids?: unknown }; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const ids = Array.isArray(body.ids)
    ? body.ids.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "Silinecek kayıt seçilmedi." }, { status: 400 });
  }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deletedIds: [] });

  // F-016 (§8D): silmeden ÖNCE görsel file_path'lerini oku (orphan temizliği için).
  // P2-07: id listesi parçalı + sayfalı okunur (1000+ seçimde görsel yolu kaçmaz).
  const preRes = await fetchAllRowsByIds<{ images?: unknown }>(ids, (chunk, from, to) =>
    db.from("stones").select("id, images").in("id", chunk).eq("tenant_id", tenantId)
      .order("id", { ascending: true }).range(from, to));
  const preRows = preRes.rows;

  const { data, error } = await db
    .from("stones").delete()
    .in("id", ids).eq("tenant_id", tenantId) // tenant guard — cross-tenant delete engellenir
    .select("id");

  if (error) return serverErrorResponse({ route: "dogaltas/stones/bulk-delete", action: "POST", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_deleted", subEntity: "stone" } });
  const deletedIds = (data ?? []).map((r: { id: string }) => r.id);

  // Orphan storage temizliği (best-effort; başarısızlık DB delete'i geri almaz, dürüst raporlanır).
  let storageCleaned = true;
  const collected = collectStonePhotoPaths(preRows.map((r) => r.images), tenantId);
  // P2-05: silinmeyen (başka) bir taşın hâlâ referans ettiği dosya silinmez.
  const { removable: paths } = collected.length > 0
    ? await filterUnreferencedStonePhotoPaths(db, tenantId, collected)
    : { removable: [] as string[] };
  if (paths.length > 0) {
    const { error: rmErr } = await db.storage.from(STONE_PHOTO_BUCKET).remove(paths);
    if (rmErr) { storageCleaned = false; console.error("[stones/bulk-delete] orphan temizliği hatası:", rmErr.message); }
  }
  if (deletedIds.length > 0) {
    // Usage360: toplu silme → TEK olay + itemCount (hiçbiri silinmediyse olay yok).
    await trackUsage(guard, req, { module: "stones", action: "record_deleted", subEntity: "stone", resourceId: [...deletedIds].sort().join(","), itemCount: deletedIds.length });
  }
  return NextResponse.json({ ok: true, deletedIds, deleted: deletedIds.length, storageCleaned });
}
