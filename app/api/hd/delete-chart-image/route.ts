import { NextRequest, NextResponse } from "next/server";
import { reportReferencedImagePaths } from "@/lib/human-design/api/hdStorage";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { isOwnedChartImagePath } from "@/lib/human-design/api/chartImagePath";

export const runtime = "nodejs";

/**
 * POST /api/hd/delete-chart-image — Human Design harita görseli silme (HD-0 güvenlik).
 *
 * Güvenlik modeli:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user binding.
 *   - tenantId YALNIZ guard'dan; istekten GÜVENİLMEZ.
 *   - İstemciden KEYFİ storage path KABUL EDİLMEZ; path DB'den server-side okunur.
 *   - Danışan sahipliği tenant-scoped doğrulanır; başka tenant'ın path'i silinemez.
 *   - Yalnız görsel dosyası + chart_image_url alanı temizlenir; danışan/rapor SİLİNMEZ.
 *   - Dosya yoksa idempotent/güvenli davranış.
 *   - Ham Supabase/PostgreSQL hata metni kullanıcıya SIZDIRILMAZ; yanıt no-store.
 */

const BUCKET = "hd-chart-images";
const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return fail(403, "Demo hesabında bu işlem kullanılamaz.");
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Geçerli JSON gövdesi gerekli.");
  }
  const clientId =
    raw && typeof raw === "object"
      ? String((raw as Record<string, unknown>).clientId ?? "").trim()
      : "";
  if (!clientId) {
    return fail(400, "clientId gerekli.");
  }

  // Danışan sahipliği + mevcut path server-side okunur (istemciden path alınmaz).
  const { data: client, error: clientErr } = await guard.db
    .from("human_design_clients")
    .select("id, chart_image_url")
    .eq("id", clientId)
    .eq("tenant_id", guard.tenantId)
    .maybeSingle();

  if (clientErr) {
    console.error("[hd/delete-chart-image] client lookup:", clientErr.message);
    await trackUsage(guard, req, { module: "human_design", action: "action_failed", failedAction: "record_deleted", subEntity: "image", errorClass: "server" });
    return fail(500, "Danışan doğrulanamadı.");
  }
  if (!client) {
    return fail(403, "Danışan doğrulanamadı.");
  }

  const currentPath =
    typeof client.chart_image_url === "string" ? client.chart_image_url.trim() : "";

  // DB alanını null yap (görsel yoksa da idempotent — güvenli).
  const { error: updateError } = await guard.db
    .from("human_design_clients")
    .update({ chart_image_url: null, updated_at: new Date().toISOString() })
    .eq("id", clientId)
    .eq("tenant_id", guard.tenantId);

  if (updateError) {
    console.error("[hd/delete-chart-image] db update:", updateError.message);
    await trackUsage(guard, req, { module: "human_design", action: "action_failed", failedAction: "record_deleted", subEntity: "image", errorClass: "server" });
    return fail(500, "Görsel kaydı temizlenemedi.");
  }

  // Yalnız bu tenant/client'a ait geçerli path silinir (legacy public URL/boş/başka
  // tenant path'i → atlanır). DB alanı yukarıda zaten temizlendi.
  // P2-1: eski bir profesyonel rapor snapshot'ı bu nesneyi hâlâ kullanıyorsa nesne korunur.
  if (isOwnedChartImagePath(currentPath, guard.tenantId, clientId)) {
    const refs = await reportReferencedImagePaths(guard.db, guard.tenantId, currentPath);
    if (refs.error) {
      console.error("[hd/delete-chart-image] rapor referansı okunamadı; dosya korunuyor:", refs.error);
    } else if (!refs.paths.has(currentPath)) {
      const { error: removeErr } = await guard.db.storage.from(BUCKET).remove([currentPath]);
      if (removeErr) {
        // Dosya temizliği best-effort; başarısızlık yapılandırılmış olarak loglanır.
        console.error("[hd-storage-cleanup-failed] delete-chart-image:", removeErr.message);
      }
    }
  }

  // USAGE360: yalnız gerçekten bir görsel kaydı vardıysa (boş alanı temizleme = no-op → olay yok).
  // resourceId = path'in son segmentindeki sunucu üretimli nesne kimliği (yalnız HMAC; path saklanmaz).
  if (currentPath) {
    // Legacy public URL (sahip-path değil) → danışan tabanlı anahtar (URL segmenti kullanılmaz).
    const objectId = isOwnedChartImagePath(currentPath, guard.tenantId, clientId)
      ? (currentPath.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "") || `client:${clientId}`
      : `client:${clientId}`;
    await trackUsage(guard, req, { module: "human_design", action: "record_deleted", subEntity: "image", resourceId: objectId });
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
}
