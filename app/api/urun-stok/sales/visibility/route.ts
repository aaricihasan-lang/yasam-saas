import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { applySalesVisibility } from "@/lib/urun-stok/salesVisibilityServer";

export const runtime = "nodejs";

/**
 * /api/urun-stok/sales/visibility — Satış Geçmişi "Listeden Sil" / "Listeye geri al".
 *
 * Owner kararı (21.10.2026): satış İPTALİ ile listeden kaldırma AYRI işlemlerdir.
 * Bu uç YALNIZ görünürlüğü değiştirir (lib/urun-stok/salesVisibilityServer.ts):
 * iptal RPC'si çağrılmaz; stok, satış durumu, tutarlar ve satır snapshot'ları değişmez.
 * tenant_id DAİMA oturumdan. Migration (hidden_at/hidden_by) yoksa 503 + açık mesaj.
 *
 * Gövde: { sale_ids: uuid[] (1..200), action: "hide" | "unhide" }
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 200;
const UNAVAILABLE_MSG =
  "Listeden silme özelliği veritabanı güncellemesinden sonra etkinleşecek. Satış ve stok değiştirilmedi.";

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stok");
  if (!guard.ok) return guard.response;
  const { db, tenantId, userId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const action = body.action;
  if (action !== "hide" && action !== "unhide") {
    return NextResponse.json({ ok: false, error: "Geçersiz işlem." }, { status: 400 });
  }
  if (!Array.isArray(body.sale_ids) || body.sale_ids.length < 1 || body.sale_ids.length > MAX_IDS) {
    return NextResponse.json({ ok: false, error: `1–${MAX_IDS} satış seçilmelidir.` }, { status: 400 });
  }
  const ids = [...new Set(body.sale_ids.map((x) => String(x ?? "").trim()))];
  if (ids.some((id) => !UUID_RE.test(id))) {
    return NextResponse.json({ ok: false, error: "Geçersiz satış kimliği." }, { status: 400 });
  }

  // Demo hesap: kalıcı yazma yok (mevcut demo sözleşmesi; istemci yalnız yerel önizleme yapar).
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const r = await applySalesVisibility(db, tenantId, userId, ids, action);
  if (!r.ok) {
    if (r.unavailable) {
      return NextResponse.json({ ok: false, code: "visibility_unavailable", error: UNAVAILABLE_MSG }, { status: 503 });
    }
    console.error("[urun-stok/sales/visibility] hata", { code: (r.error as { code?: string })?.code });
    return NextResponse.json({ ok: false, error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." }, { status: 500 });
  }
  if (r.changed > 0) {
    await trackUsage(guard, req, { module: "stok", action: "record_updated", subEntity: "sale", itemCount: r.changed });
  }
  return NextResponse.json({
    ok: true,
    action,
    requested: r.requested,
    changed: r.changed,
    unchanged: r.unchanged,
    not_found: r.notFound,
  });
}
