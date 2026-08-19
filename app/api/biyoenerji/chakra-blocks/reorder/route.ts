import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { validateReorderInput } from "@/lib/bioenergy/chakraBlockCrud";

export const runtime = "nodejs";

/**
 * PATCH /api/biyoenerji/chakra-blocks/reorder — GÖRÜNÜR blokların sort_order'ını
 * toplu güncelle (FAZ 2). Body: { chakraId, items:[{id, sort_order}] }.
 *
 * Güvenlik:
 *   - requireModuleAccess("energy_body"); tenant_id SUNUCUDA.
 *   - chakra tenant'a ait mi (IDOR) — değilse 404.
 *   - Her güncelleme tenant + chakra + .neq(source-evidence) scoped → başka tenant /
 *     provenance satırı ASLA taşınmaz.
 *   - Demo: yazma yok.
 *   - Atomik değil (per-row update); kısmi başarı sayısı raporlanır (sahte-atomik iddia yok).
 */

const SOURCE_EVIDENCE = "source-evidence";

export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "energy_body");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, updated: 0 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const chakraId = typeof body["chakraId"] === "string" ? (body["chakraId"] as string).trim() : "";
  if (!chakraId) return NextResponse.json({ ok: false, error: "chakraId gerekli." }, { status: 400 });

  const v = validateReorderInput(body);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: v.status });

  // IDOR: chakra tenant'a ait mi?
  const owner = await db
    .from("bioenergy_chakras")
    .select("id")
    .eq("id", chakraId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (owner.error) {
    console.error("[chakra-blocks/reorder] ownership:", owner.error.message);
    return NextResponse.json({ ok: false, error: "İşlem başarısız." }, { status: 500 });
  }
  if (!owner.data) {
    return NextResponse.json({ ok: false, error: "Kayıt bu hesaba ait değil." }, { status: 404 });
  }

  let updated = 0;
  const failed: string[] = [];
  for (const it of v.items) {
    const { data, error } = await db
      .from("bioenergy_chakra_blocks")
      .update({ sort_order: it.sort_order })
      .eq("id", it.id)
      .eq("tenant_id", tenantId)
      .eq("chakra_id", chakraId)
      .neq("block_type", SOURCE_EVIDENCE)
      .select("id");
    if (error) {
      console.error("[chakra-blocks/reorder] update:", error.message);
      failed.push(it.id);
    } else if (!data || data.length === 0) {
      failed.push(it.id);
    } else {
      updated += 1;
    }
  }

  return NextResponse.json({ ok: failed.length === 0, updated, failed });
}
