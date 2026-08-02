import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  validateRecordSourceInput,
  isUuid,
  safeDbError,
} from "@/app/numeroloji/bilgi-bankasi/helpers/sourcesValidation";

export const runtime = "nodejs";

/**
 * /api/numeroloji/record-sources — numerology_record_sources güvenli sunucu kapısı (NKB-V2-C).
 *
 * Bilgi kaydı (numerology_knowledge_records) <-> kaynak (numerology_sources) M:N bağı.
 *
 * Güvenlik:
 *   - requireModuleAccess → tenant_id SUNUCUDA session'dan; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/yazma .eq("tenant_id", tenantId) ile bağlı.
 *   - DB kompozit FK'lerine EK olarak uygulama katmanında sahiplik doğrulanır:
 *       hem hedef bilgi kaydı hem kaynak, İSTEĞİ YAPAN tenant'a ait olmalı → aksi halde 404
 *       (veri varlığını sızdırmayan güvenli hata).
 *   - section_key yalnız ana-kulvar/yan-kulvar bilgi kaydında ve 4 Kulvar anahtarından biri olabilir.
 *   - Demo hesap: yazma yapılmaz. Hata cevaplarında iç DB ayrıntısı sızmaz.
 *
 * GET ?knowledge_record_id= | ?source_id=   → { ok, rows }
 * POST { knowledge_record_id, source_id, ... } → { ok, id }   (duplicate → 409)
 * PATCH { id, ...meta }                        → { ok, id }
 * DELETE { id } | { ids: [] }                  → { ok, deleted }
 */

const TABLE = "numerology_record_sources";
const KNOWLEDGE_TABLE = "numerology_knowledge_records";
const SOURCE_TABLE = "numerology_sources";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Bilgi kaydı bu tenant'a ait mi? Ait ise analysis_type döner; değilse null. */
async function ownedKnowledgeAnalysisType(
  db: SupabaseClient,
  tenantId: string,
  recordId: string,
): Promise<string | null> {
  const { data } = await db
    .from(KNOWLEDGE_TABLE)
    .select("analysis_type")
    .eq("id", recordId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data ? String((data as { analysis_type: string }).analysis_type) : null;
}

async function sourceOwned(
  db: SupabaseClient,
  tenantId: string,
  sourceId: string,
): Promise<boolean> {
  const { data } = await db
    .from(SOURCE_TABLE)
    .select("id")
    .eq("id", sourceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const url = new URL(req.url);
  const knowledgeRecordId = str(url.searchParams.get("knowledge_record_id"));
  const sourceId = str(url.searchParams.get("source_id"));

  let query = db.from(TABLE).select("*").eq("tenant_id", tenantId);
  if (knowledgeRecordId) {
    if (!isUuid(knowledgeRecordId)) return NextResponse.json({ ok: false, error: "Geçersiz knowledge_record_id." }, { status: 400 });
    query = query.eq("knowledge_record_id", knowledgeRecordId);
  }
  if (sourceId) {
    if (!isUuid(sourceId)) return NextResponse.json({ ok: false, error: "Geçersiz source_id." }, { status: 400 });
    query = query.eq("source_id", sourceId);
  }

  const { data, error } = await query.order("display_order", { ascending: true });
  if (error) {
    const e = safeDbError(error);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  // Sahiplik ön-kontrolü için önce kimlikleri güvenle çöz.
  if (!isUuid(body.knowledge_record_id)) {
    return NextResponse.json({ ok: false, error: "knowledge_record_id geçerli bir UUID olmalı." }, { status: 400 });
  }
  if (!isUuid(body.source_id)) {
    return NextResponse.json({ ok: false, error: "source_id geçerli bir UUID olmalı." }, { status: 400 });
  }
  const knowledgeRecordId = str(body.knowledge_record_id);
  const sourceId = str(body.source_id);

  // Uygulama katmanı sahiplik: her ikisi de bu tenant'a ait olmalı (yoksa 404, sızdırma yok).
  const recordAnalysisType = await ownedKnowledgeAnalysisType(db, tenantId, knowledgeRecordId);
  if (recordAnalysisType === null) {
    return NextResponse.json({ ok: false, error: "Bilgi kaydı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  if (!(await sourceOwned(db, tenantId, sourceId))) {
    return NextResponse.json({ ok: false, error: "Kaynak bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }

  // Tam doğrulama (section_key kuralı hedef kaydın türüne göre).
  const parsed = validateRecordSourceInput(body, { partial: false, recordAnalysisType });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const payload = {
    ...parsed.value,
    tenant_id: tenantId,
    knowledge_record_id: knowledgeRecordId,
    source_id: sourceId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from(TABLE).insert(payload).select("id").single();
  if (error) {
    // Duplicate bağ (unique) → 409; diğerleri güvenli map.
    const e = safeDbError(error);
    const message = e.status === 409 ? "Bu kaynak bu kayda (aynı bölüm) zaten bağlı." : e.message;
    return NextResponse.json({ ok: false, error: message }, { status: e.status });
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const id = str(body.id);
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  // Bağlantı bu tenant'a ait mi? (ve section_key doğrulaması için kaydın türü lazım)
  const { data: link, error: linkErr } = await db
    .from(TABLE)
    .select("id, knowledge_record_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (linkErr) {
    const e = safeDbError(linkErr);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  if (!link) {
    return NextResponse.json({ ok: false, error: "Bağlantı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }

  let recordAnalysisType: string | null = null;
  if (body.section_key !== undefined && body.section_key !== null) {
    recordAnalysisType = await ownedKnowledgeAnalysisType(
      db,
      tenantId,
      String((link as { knowledge_record_id: string }).knowledge_record_id),
    );
  }

  const { id: _omit, ...rest } = body;
  void _omit;
  const parsed = validateRecordSourceInput(rest, { partial: true, recordAnalysisType });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const update = { ...parsed.value, updated_at: new Date().toISOString() };

  const { data, error } = await db
    .from(TABLE)
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    const e = safeDbError(error);
    const message = e.status === 409 ? "Bu kaynak bu kayda (aynı bölüm) zaten bağlı." : e.message;
    return NextResponse.json({ ok: false, error: message }, { status: e.status });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Bağlantı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: { id?: unknown; ids?: unknown } = {};
  try { body = (await req.json()) as { id?: unknown; ids?: unknown }; } catch { /* boş gövde olabilir */ }
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 1000)
    : str(body.id) ? [str(body.id)] : [];
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "id veya ids gerekli." }, { status: 400 });

  const { data, error } = await db
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .select("id");
  if (error) {
    const e = safeDbError(error);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
