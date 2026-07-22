import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { isOwnedChartImagePath } from "@/lib/human-design/api/chartImagePath";

export const runtime = "nodejs";

/**
 * POST /api/hd/delete-chart-image — Human Design harita görseli silme (HD-0 güvenlik).
 *
 * Güvenlik modeli:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user binding.
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
  const guard = await verifyUserRequest(req);
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
    return fail(500, "Görsel kaydı temizlenemedi.");
  }

  // Yalnız bu tenant/client'a ait geçerli path silinir (legacy public URL/boş/başka
  // tenant path'i → atlanır). DB alanı yukarıda zaten temizlendi.
  if (isOwnedChartImagePath(currentPath, guard.tenantId, clientId)) {
    const { error: removeErr } = await guard.db.storage.from(BUCKET).remove([currentPath]);
    if (removeErr) {
      // Dosya temizliği best-effort; başarısızlık yalnız maskeli loglanır.
      console.error("[hd/delete-chart-image] dosya silinemedi:", removeErr.message);
    }
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
}
