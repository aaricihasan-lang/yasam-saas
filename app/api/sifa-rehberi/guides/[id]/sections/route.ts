import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { validateSectionsBody } from "@/lib/sifa-rehberi/limits";
import { normalizeReplaceSections } from "@/lib/sifa-rehberi/sectionModel";

export const runtime = "nodejs";

/**
 * PUT /api/sifa-rehberi/guides/[id]/sections — kaydın section'larını topluca değiştirir.
 *
 * Section-native edit yolu (Faz 2): production-şekilli KARMAŞIK kayıtlar da (herbal,
 * hacamat_suluk, bilincalti, source'lu, görselli) doğrudan, KAYIPSIZ düzenlenir.
 * İçerik `healing_guide_sections`'ta durur; source_kind/expert_note/attention/sort_order dahil.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + binding.
 *   - Parent guide'ın tenant sahipliği ÖNCE app-layer'da doğrulanır (temiz 404) VE
 *     RPC içinde tekrar bağlanır (caller tenant'ına kör güven YOK) → IDOR yok.
 *   - Demo hesap: yazma yapılmaz.
 *
 * ATOMİK: replace tek DB transaction'ında (SECURITY DEFINER RPC) yapılır. Herhangi bir
 * hata → tamamı rollback. Yarım delete / yarım insert / duplicate residue YOK.
 */
type RouteCtx = { params: Promise<{ id: string }> };

type ReplaceResult = { deleted?: number; inserted?: number } | null;

export async function PUT(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  const { id } = await ctx.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Kayıt kimliği eksik." }, { status: 400 });
  }

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const sectionsError = validateSectionsBody(body.sections);
  if (sectionsError) {
    return NextResponse.json({ ok: false, error: sectionsError }, { status: 400 });
  }
  const incoming = body.sections as Record<string, unknown>[];

  // 1) Parent guide gerçekten bu tenant'a mı ait? (temiz 404 semantiği + IDOR)
  const { data: guideRow, error: guideErr } = await db
    .from("healing_guides")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (guideErr) {
    return NextResponse.json({ ok: false, error: guideErr.message }, { status: 500 });
  }
  if (!guideRow) {
    return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
  }

  // 2) ATOMİK replace — tek transaction (RPC). Tenant binding RPC içinde de doğrulanır.
  const payload = normalizeReplaceSections(incoming);
  const { data, error: rpcErr } = await db.rpc("replace_healing_guide_sections", {
    p_guide_id: id,
    p_tenant_id: tenantId,
    p_sections: payload,
  });

  if (rpcErr) {
    const msg = rpcErr.message || "Bölümler kaydedilemedi.";
    // RPC tenant binding hatası → 404 (cross-tenant sızıntısı yok).
    if (msg.includes("guide_not_found_for_tenant")) {
      return NextResponse.json({ ok: false, notFound: true }, { status: 404 });
    }
    const status = /invalid_section_type|sections_must_be_array|invalid_arguments/.test(msg)
      ? 400
      : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }

  const result = (data ?? null) as ReplaceResult;

  // guide updated_at tazele (liste sırası/gösterim için).
  await db
    .from("healing_guides")
    .update({ updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id);

  return NextResponse.json({
    ok: true,
    inserted: result?.inserted ?? payload.length,
    deleted: result?.deleted ?? 0,
  });
}
