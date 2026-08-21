import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  CITATION_SPECS,
  CITATION_META_WRITABLE,
  CUPPING_TABLES,
  type CitationEntity,
} from "@/lib/cupping/fields";
import { isEvidenceClass } from "@/lib/cupping/vocab";
import {
  assertOwnedRef,
  deleteEntity,
  insertEntity,
  listEntity,
  parseJsonBody,
  pickWritable,
  updateEntity,
} from "@/lib/cupping/api";

/**
 * KUPA & HACAMAT — FAZ 1.5 tipli citation junction'ları için PAYLAŞILAN route fabrikası.
 *
 * 6 citation tablosu (point/topic/point-topic/technique/knowledge/safety) tek güvenlik +
 * doğrulama sözleşmesini paylaşır; her route dosyası yalnız entity anahtarını verir.
 *
 * Güvenlik (mevcut /api/kupa/* deseni):
 *   - requireModuleAccess(req, "cupping")
 *   - tenant_id server tarafından yazılır (body'den asla)
 *   - demo hesap → persist=0
 *   - ham DB hatası sızmaz (api helper sabit mesaj)
 *   - CREATE: hem source_id hem entity_id AYNI tenant'ta GERÇEK kayıt olmalı (assertOwnedRef);
 *     yalnız FK error'una güvenilmez → varlık doğrulaması server-side.
 *   - evidence_class kontrollü sözlükte olmalı (yoksa 400).
 */

const CITATION_POST_ERR = "Kaynak veya hedef kayıt bu hesaba ait değil.";
const EVIDENCE_ERR = "Geçersiz kanıt sınıfı (evidence_class).";

function evidenceOk(v: unknown): boolean {
  return v == null || v === "" || isEvidenceClass(v);
}

export function makeCitationCollection(entity: CitationEntity) {
  const spec = CITATION_SPECS[entity];
  // source_id + meta client'tan gelir; entity FK generic `entityId`'den map edilir
  // (client tek adaptör kullanır — kolon adını bilmek zorunda değil).
  const writable = ["source_id", ...CITATION_META_WRITABLE] as const;

  async function GET(req: NextRequest): Promise<Response> {
    const guard = await requireModuleAccess(req, "cupping");
    if (!guard.ok) return guard.response;
    const { db, tenantId } = guard;

    const entityId = req.nextUrl.searchParams.get("entityId")?.trim();
    const sourceId = req.nextUrl.searchParams.get("sourceId")?.trim();
    const eqFilters: Record<string, string> = {};
    if (entityId) eqFilters[spec.entityFk] = entityId;
    if (sourceId) eqFilters.source_id = sourceId;

    const res = await listEntity(db, spec.table, tenantId, {
      orderBy: "sort_order",
      ascending: true,
      eqFilters,
    });
    if (!res.ok) return res.response;
    return NextResponse.json({ ok: true, citations: res.data });
  }

  async function POST(req: NextRequest): Promise<Response> {
    const guard = await requireModuleAccess(req, "cupping");
    if (!guard.ok) return guard.response;
    const { db, tenantId, is_demo_account } = guard;
    if (is_demo_account) return NextResponse.json({ ok: true, demo: true, citation: null });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const fields = pickWritable(parsed.data, writable);
    // Generic `entityId` → bu tablonun gerçek FK kolonuna map edilir.
    const entityId = parsed.data.entityId ?? parsed.data[spec.entityFk];
    fields[spec.entityFk] = typeof entityId === "string" ? entityId : "";

    if (!evidenceOk(fields.evidence_class)) {
      return NextResponse.json({ ok: false, error: EVIDENCE_ERR }, { status: 400 });
    }

    // Varlık doğrulaması: hem kaynak hem hedef entity aynı tenant'ta GERÇEK olmalı
    // (yalnız FK error'una GÜVENİLMEZ; ham DB hatası da sızmaz).
    const [sourceOwned, entityOwned] = await Promise.all([
      assertOwnedRef(db, CUPPING_TABLES.sources, tenantId, fields.source_id),
      assertOwnedRef(db, spec.entityTable, tenantId, fields[spec.entityFk]),
    ]);
    if (!sourceOwned || !entityOwned) {
      return NextResponse.json({ ok: false, error: CITATION_POST_ERR }, { status: 400 });
    }

    const res = await insertEntity(db, spec.table, tenantId, fields);
    if (!res.ok) return res.response;
    return NextResponse.json({ ok: true, citation: res.data });
  }

  return { GET, POST };
}

export function makeCitationItem(entity: CitationEntity) {
  const spec = CITATION_SPECS[entity];
  // PATCH yalnız meta (FK'ler değişmez — yeni citation için sil+ekle).
  const metaWritable = CITATION_META_WRITABLE;

  async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const guard = await requireModuleAccess(req, "cupping");
    if (!guard.ok) return guard.response;
    const { id } = await params;
    if (!id) return NextResponse.json({ ok: false, error: "Citation id gerekli." }, { status: 400 });
    const { db, tenantId, is_demo_account } = guard;
    if (is_demo_account) return NextResponse.json({ ok: true, demo: true, citation: null });

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const fields = pickWritable(parsed.data, metaWritable);
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
    }
    if (!evidenceOk(fields.evidence_class)) {
      return NextResponse.json({ ok: false, error: EVIDENCE_ERR }, { status: 400 });
    }
    const res = await updateEntity(db, spec.table, tenantId, id, fields);
    if (!res.ok) return res.response;
    return NextResponse.json({ ok: true, citation: res.data });
  }

  async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const guard = await requireModuleAccess(req, "cupping");
    if (!guard.ok) return guard.response;
    const { id } = await params;
    if (!id) return NextResponse.json({ ok: false, error: "Citation id gerekli." }, { status: 400 });
    const { db, tenantId, is_demo_account } = guard;
    if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
    const res = await deleteEntity(db, spec.table, tenantId, id);
    if (!res.ok) return res.response;
    return NextResponse.json({ ok: true, deleted: res.data });
  }

  return { PATCH, DELETE };
}
