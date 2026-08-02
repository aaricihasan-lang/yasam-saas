import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  validateSourceEntryInput,
  isUuid,
  safeDbError,
} from "@/app/numeroloji/bilgi-bankasi/helpers/sourcesValidation";

export const runtime = "nodejs";

/**
 * /api/numeroloji/source-entries — numerology_knowledge_source_entries güvenli sunucu kapısı.
 *
 * Kanonik bilgi kaydına (numerology_knowledge_records) bağlı, kaynak başına ayrı UZMAN NOTLARI.
 *   - source_id NULL = "Uzmanın Kendi Notu".
 *   - Aynı knowledge_record + source için birden fazla not serbesttir (yasak unique yok).
 *   - Kanonik description ile karıştırılmaz; bu tablo yalnız uzman notu tutar.
 *
 * Güvenlik:
 *   - requireModuleAccess → tenant_id SUNUCUDA session'dan; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/yazma .eq("tenant_id", tenantId) ile bağlı.
 *   - Uygulama katmanı sahiplik: knowledge_record_id ve (verilmişse) source_id İSTEĞİ YAPAN
 *     tenant'a ait olmalı → aksi halde 404 (varlık sızdırmayan güvenli hata).
 *   - Demo hesap: yazma yapılmaz. Hata cevaplarında iç DB ayrıntısı sızmaz.
 *
 * GET  ?knowledge_record_id= [&include_in_analysis=true]   → { ok, rows }
 *      (knowledge_record_id yoksa: tenant'ın tüm notları — analiz için tek bounded sorgu, N+1 yok)
 * POST { knowledge_record_id, source_id?, body, ... }       → { ok, id }
 * PATCH { id, body?, source_id?, ... }                      → { ok, id }
 * DELETE { id } | { ids: [] }                               → { ok, deleted }
 */

const TABLE = "numerology_knowledge_source_entries";
const KNOWLEDGE_TABLE = "numerology_knowledge_records";
const SOURCE_TABLE = "numerology_sources";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function knowledgeOwned(db: SupabaseClient, tenantId: string, recordId: string): Promise<boolean> {
  const { data } = await db
    .from(KNOWLEDGE_TABLE)
    .select("id")
    .eq("id", recordId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return Boolean(data);
}

async function sourceOwned(db: SupabaseClient, tenantId: string, sourceId: string): Promise<boolean> {
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
  const includeOnly = url.searchParams.get("include_in_analysis") === "true";

  let query = db.from(TABLE).select("*").eq("tenant_id", tenantId);
  if (knowledgeRecordId) {
    if (!isUuid(knowledgeRecordId)) {
      return NextResponse.json({ ok: false, error: "Geçersiz knowledge_record_id." }, { status: 400 });
    }
    query = query.eq("knowledge_record_id", knowledgeRecordId);
  }
  if (includeOnly) query = query.eq("include_in_analysis", true);

  // Deterministik sıralama: display_order, created_at, id.
  const { data, error } = await query
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
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

  const parsed = validateSourceEntryInput(body, { partial: false });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });

  const knowledgeRecordId = parsed.value.knowledge_record_id as string;
  const sourceId = parsed.value.source_id; // null | string | undefined

  // Uygulama katmanı sahiplik: kanonik kayıt bu tenant'a ait olmalı (yoksa 404).
  if (!(await knowledgeOwned(db, tenantId, knowledgeRecordId))) {
    return NextResponse.json({ ok: false, error: "Bilgi kaydı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  // source_id verilmiş ve non-null ise o kaynak da bu tenant'a ait olmalı.
  if (typeof sourceId === "string" && !(await sourceOwned(db, tenantId, sourceId))) {
    return NextResponse.json({ ok: false, error: "Kaynak bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const payload = {
    tenant_id: tenantId,
    knowledge_record_id: knowledgeRecordId,
    source_id: typeof sourceId === "string" ? sourceId : null,
    body: parsed.value.body,
    ...(parsed.value.display_order !== undefined ? { display_order: parsed.value.display_order } : {}),
    ...(parsed.value.include_in_analysis !== undefined ? { include_in_analysis: parsed.value.include_in_analysis } : {}),
  };

  const { data, error } = await db.from(TABLE).insert(payload).select("id").single();
  if (error) {
    const e = safeDbError(error);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
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

  // Satır bu tenant'a ait mi?
  const { data: row, error: rowErr } = await db
    .from(TABLE)
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (rowErr) {
    const e = safeDbError(rowErr);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "Not bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }

  const { id: _omit, ...rest } = body;
  void _omit;
  const parsed = validateSourceEntryInput(rest, { partial: true });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });

  // source_id değişiyorsa (non-null) yeni kaynağı tekrar tenant açısından doğrula.
  if (typeof parsed.value.source_id === "string" && !(await sourceOwned(db, tenantId, parsed.value.source_id))) {
    return NextResponse.json({ ok: false, error: "Kaynak bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  // Yalnız verilen alanlar güncellenir (undefined alanlar bozulmaz).
  const update: Record<string, unknown> = {};
  if (parsed.value.body !== undefined) update.body = parsed.value.body;
  if (parsed.value.source_id !== undefined) update.source_id = parsed.value.source_id;
  if (parsed.value.display_order !== undefined) update.display_order = parsed.value.display_order;
  if (parsed.value.include_in_analysis !== undefined) update.include_in_analysis = parsed.value.include_in_analysis;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  const { data, error } = await db
    .from(TABLE)
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    const e = safeDbError(error);
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Not bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
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
