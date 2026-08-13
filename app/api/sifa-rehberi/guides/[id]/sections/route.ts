import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { validateSectionsBody } from "@/lib/sifa-rehberi/limits";

export const runtime = "nodejs";

/**
 * PUT /api/sifa-rehberi/guides/[id]/sections — kaydın section'larını topluca değiştirir.
 *
 * Canonical edit yolu (Faz 1): form-şekilli kayıtların 7 sekmeli formdan kayıpsız
 * düzenlenmesi. İçerik `healing_guide_sections`'ta durur.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + binding.
 *   - Parent guide'ın tenant sahipliği DOĞRULANIR (.eq tenant_id .eq id) → IDOR yok.
 *   - Demo hesap: yazma yapılmaz.
 *
 * Kayıp-güvenli sıra: ÖNCE yeni section'lar eklenir, SONRA eski id'ler silinir.
 * Kısmi hata en kötü ihtimalle geçici duplicate bırakır (kurtarılabilir), veri KAYBI değil.
 */
type RouteCtx = { params: Promise<{ id: string }> };

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

  // 1) Parent guide gerçekten bu tenant'a mı ait? (IDOR koruması)
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

  // 2) Mevcut section id'lerini topla (silme için).
  const { data: existing, error: existErr } = await db
    .from("healing_guide_sections")
    .select("id")
    .eq("guide_id", id);

  if (existErr) {
    return NextResponse.json({ ok: false, error: existErr.message }, { status: 500 });
  }
  const oldIds = (existing ?? []).map((r) => (r as { id: string }).id);

  // 3) ÖNCE yeni section'ları ekle (kayıp-güvenli sıra).
  const newRows = incoming.map((s) => ({
    guide_id: id,
    section_type: String(s.section_type),
    mode: s.mode == null ? null : String(s.mode),
    title: s.title == null ? null : String(s.title),
    note: s.note == null ? null : String(s.note),
    source: s.source == null ? null : String(s.source),
    images: Array.isArray(s.images) ? s.images : [],
  }));

  if (newRows.length > 0) {
    const { error: insErr } = await db.from("healing_guide_sections").insert(newRows);
    if (insErr) {
      // Hiçbir şey silinmedi; eski içerik yerinde → kayıp yok.
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
  }

  // 4) SONRA eski section'ları sil.
  if (oldIds.length > 0) {
    const { error: delErr } = await db
      .from("healing_guide_sections")
      .delete()
      .eq("guide_id", id)
      .in("id", oldIds);
    if (delErr) {
      // Yeni eklendi ama eski silinemedi → geçici duplicate (kurtarılabilir), kayıp değil.
      return NextResponse.json(
        { ok: false, error: `Eski bölümler temizlenemedi: ${delErr.message}` },
        { status: 500 },
      );
    }
  }

  // guide updated_at tazele (liste sırası/gösterim için).
  await db
    .from("healing_guides")
    .update({ updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id);

  return NextResponse.json({ ok: true, inserted: newRows.length, deleted: oldIds.length });
}
