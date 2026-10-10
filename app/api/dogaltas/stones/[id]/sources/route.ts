import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/dogaltas/validation";
import { normalizeTaxonomyValues } from "@/lib/dogaltas/stoneTaxonomy";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { MAX_EXTRA_SOURCES, sourceNameKey, validateSourcePayload } from "@/lib/dogaltas/stoneSources";
import {
  isDuplicateSourceError,
  isSourcesSchemaMissing,
  loadStoneSources,
  STONE_SOURCES_SELECT,
} from "@/lib/dogaltas/stoneSourcesServer";

export const runtime = "nodejs";

/**
 * /api/dogaltas/stones/[id]/sources — taşın bilgi kaynakları (WT9).
 *   GET  → [birincil (stones satırı), ...ek kaynaklar] — yalnız KENDİ tenant'ının taşı.
 *   POST → yeni ek kaynak { source_name, ...alanlar } — başka kaynakların içeriği DEĞİŞMEZ.
 * Aynı taşta aynı kaynak adı (Türkçe büyük/küçük harf + boşluk normalize) iki kez olamaz (DB UNIQUE +
 * birincil adla çakışma tetikleyicisi; burada da önceden kontrol → net 409).
 */

const DUP_MSG = "Bu kaynak adı bu taşta zaten var. Mevcut kaynağı seçip düzenleyin.";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });

  const loaded = await loadStoneSources(db, tenantId, id);
  if (!loaded.ok) {
    if (loaded.status === 404) return NextResponse.json({ ok: false, error: "Taş bulunamadı." }, { status: 404 });
    return serverErrorResponse({ route: "dogaltas/stones/[id]/sources", action: "GET", tenantId, cause: loaded.error });
  }
  return NextResponse.json({ ok: true, sources: loaded.sources, schemaMissing: loaded.schemaMissing });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const v = validateSourcePayload(body, { requireName: true });
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });

  const loaded = await loadStoneSources(db, tenantId, id);
  if (!loaded.ok) {
    if (loaded.status === 404) return NextResponse.json({ ok: false, error: "Taş bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
    return serverErrorResponse({ route: "dogaltas/stones/[id]/sources", action: "POST", tenantId, cause: loaded.error });
  }
  if (loaded.schemaMissing) {
    return NextResponse.json({ ok: false, code: "sources_unavailable", error: "Çoklu kaynak özelliği henüz etkin değil." }, { status: 503 });
  }
  const key = sourceNameKey(v.name);
  if (loaded.sources.some((s) => s.name && sourceNameKey(s.name) === key)) {
    return NextResponse.json({ ok: false, code: "duplicate_source", error: DUP_MSG }, { status: 409 });
  }
  const extras = loaded.sources.filter((s) => !s.isPrimary);
  if (extras.length >= MAX_EXTRA_SOURCES) {
    return NextResponse.json({ ok: false, error: `Bir taşta en fazla ${MAX_EXTRA_SOURCES + 1} kaynak olabilir.` }, { status: 400 });
  }

  const values = { ...v.values };
  if (Array.isArray(values.chakras)) values.chakras = normalizeTaxonomyValues("chakra", values.chakras as string[]);
  const insert = {
    ...values,
    tenant_id: tenantId,
    stone_id: id,
    source_name: v.name,
    sort_order: extras.reduce((m, s) => Math.max(m, s.sortOrder), 0) + 1,
  };
  const { data, error } = await db.from("stone_sources").insert(insert).select(STONE_SOURCES_SELECT).single();
  if (error) {
    if (isDuplicateSourceError(error)) return NextResponse.json({ ok: false, code: "duplicate_source", error: DUP_MSG }, { status: 409 });
    if (isSourcesSchemaMissing(error)) return NextResponse.json({ ok: false, code: "sources_unavailable", error: "Çoklu kaynak özelliği henüz etkin değil." }, { status: 503 });
    return serverErrorResponse({ route: "dogaltas/stones/[id]/sources", action: "POST", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_created", subEntity: "stone" } });
  }
  await trackUsage(guard, req, { module: "stones", action: "record_created", subEntity: "stone", resourceId: id });
  return NextResponse.json({ ok: true, source: data }, { status: 201 });
}
