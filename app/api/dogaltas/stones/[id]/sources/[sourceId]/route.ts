import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/dogaltas/validation";
import { normalizeTaxonomyValues } from "@/lib/dogaltas/stoneTaxonomy";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { PRIMARY_SOURCE_ID, sourceNameKey, validateSourcePayload } from "@/lib/dogaltas/stoneSources";
import {
  isDuplicateSourceError,
  isSourcesSchemaMissing,
  loadStoneSources,
  STONE_SOURCES_SELECT,
} from "@/lib/dogaltas/stoneSourcesServer";

export const runtime = "nodejs";

/**
 * /api/dogaltas/stones/[id]/sources/[sourceId] — tek kaynak düzenle / sil (WT9).
 *   sourceId = "primary" → taşın birincil kaynağı (stones satırı: içerik + primary_source_name).
 *   sourceId = uuid      → ek kaynak (stone_sources).
 * Tenant: tüm yazmalar `.eq("tenant_id", tenantId)` → başka uzmanın kaynağı id ile bile değişmez.
 *
 * SİLME:
 *   - Ek kaynak → yalnız o kaynak silinir (taş + diğer kaynaklar korunur).
 *   - Birincil kaynak → ek kaynak varsa ilki ATOMİK olarak birincil olur (dogaltas_stone_source_promote);
 *     taşın TEK kaynağı ise silme REDDEDİLİR (409) — kaynak silmek taşı/içeriği sessizce boşaltmaz;
 *     taşı tamamen kaldırmak için taş silme (3 aşamalı onay) kullanılır.
 */

const DUP_MSG = "Bu kaynak adı bu taşta zaten var.";
const UNAVAILABLE = { ok: false, code: "sources_unavailable", error: "Çoklu kaynak özelliği henüz etkin değil." };

type Ctx = { params: Promise<{ id: string; sourceId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id, sourceId } = await params;
  const isPrimary = sourceId === PRIMARY_SOURCE_ID;
  if (!isUuid(id) || (!isPrimary && !isUuid(sourceId))) {
    return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });
  }
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const v = validateSourcePayload(body, { requireName: false });
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const values: Record<string, unknown> = { ...v.values };
  if (Array.isArray(values.chakras)) values.chakras = normalizeTaxonomyValues("chakra", values.chakras as string[]);
  if (Object.keys(values).length === 0 && v.name === undefined) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  // Ad değişiyorsa aynı taşta başka kaynakla çakışma kontrolü (DB de reddeder; burada net mesaj).
  if (v.name !== undefined) {
    const loaded = await loadStoneSources(db, tenantId, id);
    if (!loaded.ok) {
      if (loaded.status === 404) return NextResponse.json({ ok: false, error: "Taş bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
      return serverErrorResponse({ route: "dogaltas/stones/[id]/sources/[sourceId]", action: "PATCH", tenantId, cause: loaded.error });
    }
    if (loaded.schemaMissing) return NextResponse.json(UNAVAILABLE, { status: 503 });
    const key = sourceNameKey(v.name);
    if (loaded.sources.some((s) => s.id !== sourceId && s.name && sourceNameKey(s.name) === key)) {
      return NextResponse.json({ ok: false, code: "duplicate_source", error: DUP_MSG }, { status: 409 });
    }
  }

  if (isPrimary) {
    const fields: Record<string, unknown> = { ...values, updated_at: new Date().toISOString() };
    if (v.name !== undefined) fields.primary_source_name = v.name;
    const expected = typeof body.expectedUpdatedAt === "string" && body.expectedUpdatedAt.trim() ? body.expectedUpdatedAt.trim() : null;
    let q = db.from("stones").update(fields).eq("id", id).eq("tenant_id", tenantId);
    if (expected) q = q.eq("updated_at", expected);
    const { data, error } = await q.select("*");
    if (error) {
      if (isDuplicateSourceError(error)) return NextResponse.json({ ok: false, code: "duplicate_source", error: DUP_MSG }, { status: 409 });
      if (isSourcesSchemaMissing(error)) return NextResponse.json(UNAVAILABLE, { status: 503 });
      return serverErrorResponse({ route: "dogaltas/stones/[id]/sources/[sourceId]", action: "PATCH:primary", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_updated", subEntity: "stone" } });
    }
    if (!data || data.length === 0) {
      if (expected) {
        return NextResponse.json({ ok: false, code: "conflict", error: "Bu kayıt başka bir oturumda güncellendi. Son verileri yenileyip değişikliklerinizi kontrol edin." }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: "Taş bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
    }
    await trackUsage(guard, req, { module: "stones", action: "record_updated", subEntity: "stone", resourceId: id });
    return NextResponse.json({ ok: true, row: data[0] });
  }

  const fields: Record<string, unknown> = { ...values };
  if (v.name !== undefined) fields.source_name = v.name;
  const { data, error } = await db
    .from("stone_sources").update(fields)
    .eq("id", sourceId).eq("stone_id", id).eq("tenant_id", tenantId)
    .select(STONE_SOURCES_SELECT);
  if (error) {
    if (isDuplicateSourceError(error)) return NextResponse.json({ ok: false, code: "duplicate_source", error: DUP_MSG }, { status: 409 });
    if (isSourcesSchemaMissing(error)) return NextResponse.json(UNAVAILABLE, { status: 503 });
    return serverErrorResponse({ route: "dogaltas/stones/[id]/sources/[sourceId]", action: "PATCH", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_updated", subEntity: "stone" } });
  }
  if (!data || data.length === 0) return NextResponse.json({ ok: false, error: "Kaynak bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  await trackUsage(guard, req, { module: "stones", action: "record_updated", subEntity: "stone", resourceId: id });
  return NextResponse.json({ ok: true, source: data[0] });
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id, sourceId } = await params;
  const isPrimary = sourceId === PRIMARY_SOURCE_ID;
  if (!isUuid(id) || (!isPrimary && !isUuid(sourceId))) {
    return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });
  }
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const loaded = await loadStoneSources(db, tenantId, id);
  if (!loaded.ok) {
    if (loaded.status === 404) return NextResponse.json({ ok: false, error: "Taş bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
    return serverErrorResponse({ route: "dogaltas/stones/[id]/sources/[sourceId]", action: "DELETE", tenantId, cause: loaded.error });
  }
  const extras = loaded.sources.filter((s) => !s.isPrimary);

  if (isPrimary) {
    if (extras.length === 0) {
      return NextResponse.json({
        ok: false,
        code: "last_source",
        error: "Taşın tek kaynağı silinemez. Taşı tamamen kaldırmak için taşı silin; içeriği değiştirmek için kaynağı düzenleyin.",
      }, { status: 409 });
    }
    const next = extras[0]!;
    const { data, error } = await db.rpc("dogaltas_stone_source_promote", { p_tenant_id: tenantId, p_stone_id: id, p_source_id: next.id });
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      return serverErrorResponse({ route: "dogaltas/stones/[id]/sources/[sourceId]", action: "DELETE:primary", tenantId, cause: error ?? res?.error ?? "promote_failed", usage: { guard, req, module: "stones", failedAction: "record_deleted", subEntity: "stone" } });
    }
    await trackUsage(guard, req, { module: "stones", action: "record_deleted", subEntity: "stone", resourceId: id });
    return NextResponse.json({ ok: true, promoted: next.id, primarySourceName: next.name });
  }

  if (!extras.some((s) => s.id === sourceId)) {
    return NextResponse.json({ ok: false, error: "Kaynak bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  const { data, error } = await db
    .from("stone_sources").delete()
    .eq("id", sourceId).eq("stone_id", id).eq("tenant_id", tenantId)
    .select("id");
  if (error) return serverErrorResponse({ route: "dogaltas/stones/[id]/sources/[sourceId]", action: "DELETE", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_deleted", subEntity: "stone" } });
  if (!data || data.length === 0) return NextResponse.json({ ok: false, error: "Kaynak bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  await trackUsage(guard, req, { module: "stones", action: "record_deleted", subEntity: "stone", resourceId: id });
  return NextResponse.json({ ok: true, id: sourceId });
}
