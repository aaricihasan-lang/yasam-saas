import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { validateChakraBlockInput } from "@/lib/bioenergy/chakraBlockCrud";
import { isUuid } from "@/lib/biyoenerji/uuid";

export const runtime = "nodejs";

/**
 * /api/biyoenerji/chakra-blocks/[id] — tek GÖRÜNÜR block güncelle/sil (FAZ 2).
 *
 * Güvenlik:
 *   - requireModuleAccess("energy_body") (admin VEYA modüllü uzman; tenant sahipliği).
 *   - tenant_id SUNUCUDA; her sorgu .eq("tenant_id") ile scoped.
 *   - source-evidence KORUNUR: (block_type IS NULL OR block_type <> 'source-evidence') → kullanıcı
 *     provenance satırını düzenleyemez/silemez. Eşleşme yoksa 404 (sızıntı yok).
 *   - Demo: yazma yok. Gizli provenance/kaynak alanları validate ile reddedilir.
 *   - origin_type/provenance güncellemede DEĞİŞTİRİLMEZ (otomatik reclassify YOK).
 */

const SOURCE_EVIDENCE = "source-evidence";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const v = validateChakraBlockInput(body, "update");
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: v.status });
  if (Object.keys(v.fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  const { data, error } = await db
    .from("bioenergy_chakra_blocks")
    .update({ ...v.fields, updated_at: new Date().toISOString() }) // yalnız izinli visible alanlar (+updated_at); origin_/source_ alanlarına dokunulmaz
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .or(`block_type.is.null,block_type.neq.${SOURCE_EVIDENCE}`) // BIO-18: NULL tip (legacy) dahil; yalnız provenance satırı korunur
    .select("id");

  if (error) {
    console.error("[chakra-blocks/:id] update:", error.message);
    await trackUsage(guard, req, { module: "energy_body", action: "action_failed", failedAction: "record_updated", subEntity: "chakra_block", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Blok güncellenemedi." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya yetki yok." }, { status: 404 });
  }
  await trackUsage(guard, req, { module: "energy_body", action: "record_updated", subEntity: "chakra_block", resourceId: id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, error: "id gerekli." }, { status: 400 });
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("bioenergy_chakra_blocks")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .or(`block_type.is.null,block_type.neq.${SOURCE_EVIDENCE}`) // BIO-18: NULL tip (legacy) silinebilir; evidence silinemez
    .select("id");

  if (error) {
    console.error("[chakra-blocks/:id] delete:", error.message);
    await trackUsage(guard, req, { module: "energy_body", action: "action_failed", failedAction: "record_deleted", subEntity: "chakra_block", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Blok silinemedi." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya yetki yok." }, { status: 404 });
  }
  await trackUsage(guard, req, { module: "energy_body", action: "record_deleted", subEntity: "chakra_block", resourceId: id });
  return NextResponse.json({ ok: true });
}
