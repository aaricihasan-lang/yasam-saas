import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { logServerError, serverErrorResponse } from "@/lib/http/apiError";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * Danışan silme — ATOMİK DB cascade + sonrası storage temizliği (FAZ 2 F5).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA user kaydından alınır; client'tan gelen tenant_id'ye GÜVENİLMEZ.
 *   - client_id'nin bu tenant'a ait olduğu doğrulanır.
 *   - Demo hesap: hiçbir DB DELETE yapılmaz.
 *
 * ATOMİKLİK (F5):
 *   Tüm alt tablolar clients'a `ON DELETE CASCADE` FK ile bağlıdır — client_homeworks
 *   ve client_analyses dahil (migration 20261219000000). Bu nedenle TEK
 *   `DELETE FROM clients WHERE id=? AND tenant_id=?` ifadesi, tüm child satırlarını
 *   AYNI DB transaction'ında (Postgres FK cascade) atomik siler. Manuel child DELETE
 *   YOK → ara-adım yarım kalması/yetim satır yok.
 *
 *   ⚠️ DEPLOY SIRASI: Bu route FK cascade'e dayanır. Migration 20261219000000
 *   (client_homeworks + client_analyses FK) PRODUCTION'a UYGULANDIKTAN SONRA
 *   deploy edilmelidir; aksi halde FK'siz bu iki tablo cascade edilmez. Migration
 *   additive'dir ve eski route ile de uyumludur → önce migration, sonra kod.
 *
 * STORAGE (DB dışı, transaction'a giremez):
 *   Storage bir DB transaction içine alınamaz. Bu yüzden DB-FIRST çalışılır:
 *     1) silmeden ÖNCE silinecek storage object path'leri toplanır,
 *     2) atomik DB delete COMMIT olur,
 *     3) COMMIT sonrası storage objeleri (best-effort, idempotent) silinir.
 *   Sıra DB-first'tür çünkü storage önce silinip DB delete fail ederse YAŞAYAN
 *   danışanın dosyası kaybolurdu. DB-first'te en kötü ihtimal yalnız yetim blob'tur
 *   (tekrar temizlenebilir; kullanıcı veri kaybı değildir).
 *   İki bucket: taş fotoğrafları + analiz görselleri.
 */

const STONE_PHOTO_BUCKET = "stone-photos";
const ANALYSIS_IMAGE_BUCKET = "client-analysis-images";

/** Taş fotoğrafı storage path'leri (silmeden ÖNCE toplanır; DB cascade storage'a dokunmaz). */
async function collectStonePhotoPaths(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("client_stone_photos")
    .select("file_path")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  if (error) {
    logServerError({ route: "clients/[id]/cascade-delete", action: "collectStonePhotoPaths", tenantId, cause: error });
    return [];
  }
  return (data ?? [])
    .map((r) => (r as { file_path?: unknown }).file_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
}

/**
 * Analiz görseli storage path'leri. Görsel deterministik path'te tutulur:
 * `{tenant}/{client}/{analysisId}.png` (upload-image route ile aynı; eski absolute-URL
 * satırları da aynı objeye işaret eder). image_url dolu her analiz için path üretilir.
 */
async function collectAnalysisImagePaths(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("client_analyses")
    .select("id,image_url")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .not("image_url", "is", null);
  if (error) {
    logServerError({ route: "clients/[id]/cascade-delete", action: "collectAnalysisImagePaths", tenantId, cause: error });
    return [];
  }
  return (data ?? [])
    .filter((r) => {
      const u = (r as { image_url?: unknown }).image_url;
      return typeof u === "string" && u.trim().length > 0;
    })
    .map((r) => `${tenantId}/${clientId}/${(r as { id: string }).id}.png`);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  // Demo hesap: hiçbir DB DELETE yapılmaz.
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  // client_id gerçekten bu tenant'a mı ait? (IDOR + ownership)
  const { data: cli, error: cliErr } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (cliErr) {
    return serverErrorResponse({ route: "clients/[id]/cascade-delete", action: "ownership", tenantId, cause: cliErr });
  }
  if (!cli) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  // 1) Silmeden ÖNCE storage object path'lerini topla (DB satırları cascade ile gidecek).
  const [stonePhotoPaths, analysisImagePaths] = await Promise.all([
    collectStonePhotoPaths(db, tenantId, clientId),
    collectAnalysisImagePaths(db, tenantId, clientId),
  ]);

  // 2) Ana danışan kaydını sil — TEK ifade; tüm child'lar DB içinde ATOMİK cascade edilir.
  const { error: clientDelErr } = await db
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("tenant_id", tenantId);

  // DB delete başarısızsa ASLA ok:true dönme (storage'a da dokunulmadı).
  if (clientDelErr) {
    return serverErrorResponse({ route: "clients/[id]/cascade-delete", action: "DELETE", tenantId, cause: clientDelErr });
  }

  // 3) DB COMMIT sonrası storage temizliği (best-effort, idempotent). Hata → sunucu
  //    logu + GÜVENLİ (ham mesaj içermeyen) uyarı; danışan zaten silinmiştir.
  const warnings: string[] = [];
  const removals: Array<{ bucket: string; paths: string[] }> = [
    { bucket: STONE_PHOTO_BUCKET, paths: stonePhotoPaths },
    { bucket: ANALYSIS_IMAGE_BUCKET, paths: analysisImagePaths },
  ];
  for (const { bucket, paths } of removals) {
    if (paths.length === 0) continue;
    const { error } = await db.storage.from(bucket).remove(paths);
    if (error) {
      logServerError({ route: "clients/[id]/cascade-delete", action: `storage-remove:${bucket}`, tenantId, cause: error });
      warnings.push("Danışan silindi ancak bazı ek dosyaların temizliği tamamlanamadı.");
    }
  }

  return NextResponse.json({ ok: true, warnings });
}
