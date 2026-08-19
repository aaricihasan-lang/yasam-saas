import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { validateChakraBlockInput } from "@/lib/bioenergy/chakraBlockCrud";

export const runtime = "nodejs";

/**
 * /api/biyoenerji/chakra-blocks/[id] — tek GÖRÜNÜR block güncelle/sil (FAZ 2).
 *
 * Güvenlik:
 *   - requireModuleAccess("energy_body") (admin VEYA modüllü uzman; tenant sahipliği).
 *   - tenant_id SUNUCUDA; her sorgu .eq("tenant_id") ile scoped.
 *   - source-evidence KORUNUR: .neq("block_type","source-evidence") → kullanıcı
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
    .update(v.fields) // yalnız izinli visible alanlar; origin_/source_ alanlarına dokunulmaz
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .neq("block_type", SOURCE_EVIDENCE) // provenance satırı düzenlenemez
    .select("id");

  if (error) {
    console.error("[chakra-blocks/:id] update:", error.message);
    return NextResponse.json({ ok: false, error: "Blok güncellenemedi." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya yetki yok." }, { status: 404 });
  }
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
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("bioenergy_chakra_blocks")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .neq("block_type", SOURCE_EVIDENCE) // kullanıcı evidence silemez
    .select("id");

  if (error) {
    console.error("[chakra-blocks/:id] delete:", error.message);
    return NextResponse.json({ ok: false, error: "Blok silinemedi." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya yetki yok." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
