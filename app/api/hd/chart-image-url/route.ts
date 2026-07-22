import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { isOwnedChartImagePath } from "@/lib/human-design/api/chartImagePath";

export const runtime = "nodejs";

/**
 * GET /api/hd/chart-image-url?clientId=... — Human Design harita görseli için
 * kısa ömürlü signed URL üretir (HD-0 güvenlik).
 *
 * Kurallar:
 *   - İstemci storage path GÖNDERMEZ; yalnız clientId gönderir.
 *   - verifyUserRequest → oturum + token↔user binding.
 *   - tenantId YALNIZ guard'dan; danışan sahipliği tenant-scoped doğrulanır.
 *   - Path DB'den (chart_image_url) server-side okunur ve beklenen
 *     {tenantId}/{clientId}/ prefix'iyle yeniden doğrulanır (keyfi path imzalanmaz).
 *   - Yalnız bu path için signed URL üretilir; TTL = 3600 sn.
 *   - Path yoksa güvenli "görsel yok" sonucu döner.
 *   - Path, secret, service-role bilgisi yanıta/loga SIZMAZ; yanıt no-store.
 */

const BUCKET = "hd-chart-images";
const NO_STORE = { "Cache-Control": "no-store" } as const;
const SIGNED_TTL = 3600;

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const clientId = new URL(req.url).searchParams.get("clientId")?.trim() ?? "";
  if (!clientId) {
    return fail(400, "clientId gerekli.");
  }

  const { data: client, error: clientErr } = await guard.db
    .from("human_design_clients")
    .select("id, chart_image_url")
    .eq("id", clientId)
    .eq("tenant_id", guard.tenantId)
    .maybeSingle();

  if (clientErr) {
    console.error("[hd/chart-image-url] client lookup:", clientErr.message);
    return fail(500, "Danışan doğrulanamadı.");
  }
  if (!client) {
    return fail(403, "Danışan doğrulanamadı.");
  }

  const path =
    typeof client.chart_image_url === "string" ? client.chart_image_url.trim() : "";

  // Görsel yok → güvenli boş sonuç (hata değil).
  if (!path) {
    return NextResponse.json(
      { ok: true, signedUrl: null, hasImage: false },
      { status: 200, headers: NO_STORE },
    );
  }

  // Yalnız beklenen tenant/client path'i imzalanır.
  // (Legacy public URL veya beklenmeyen değer → imzalanmaz, güvenli "legacy" sonucu;
  //  istemci bunu "eski format, yeniden yükleyin" olarak gösterir, URL'yi YÜKLEMEZ.)
  if (!isOwnedChartImagePath(path, guard.tenantId, clientId)) {
    return NextResponse.json(
      { ok: true, signedUrl: null, hasImage: false, legacy: true },
      { status: 200, headers: NO_STORE },
    );
  }

  const { data: signed, error: signErr } = await guard.db.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL);

  if (signErr || !signed?.signedUrl) {
    console.error("[hd/chart-image-url] sign:", signErr?.message ?? "no url");
    return fail(500, "Görsel bağlantısı üretilemedi.");
  }

  return NextResponse.json(
    { ok: true, signedUrl: signed.signedUrl, hasImage: true },
    { status: 200, headers: NO_STORE },
  );
}
