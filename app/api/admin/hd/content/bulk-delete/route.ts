import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { deleteContentsByEntityIds } from "@/lib/human-design/admin/centralContentPersistence";
import { isUuid } from "@/lib/human-design/admin/centralContentValidation";
import { HdContentAuditError } from "@/lib/human-design/admin/centralContentAudit";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_BATCH = 112; // toplam canonical kimlik sayısı üst sınırı

/**
 * POST /api/admin/hd/content/bulk-delete — seçili canonical KİMLİKLERİN İÇERİĞİNİ toplu siler.
 *
 * Gövde: { entity_ids: string[] }  (liste satırları entity'dir; içerik entity başına tektir)
 *
 * Semantik: yalnız hd_canonical_content + FK CASCADE evidence silinir. Canonical kimlik,
 * passage ve source DOKUNULMAZ. Tek atomic DB statement (.in) → kısmi başarı yok (fail-closed).
 * verifyAdminRequest → service_role (server-only). Client checkbox yetkilendirme DEĞİLDİR.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Geçerli JSON gerekli." }, { status: 400, headers: NO_STORE }); }
  const arr = (raw as { entity_ids?: unknown } | null)?.entity_ids;
  if (!Array.isArray(arr) || arr.length === 0) {
    return NextResponse.json({ ok: false, error: "entity_ids boş olmayan dizi olmalı." }, { status: 400, headers: NO_STORE });
  }
  if (arr.length > MAX_BATCH) {
    return NextResponse.json({ ok: false, error: `En fazla ${MAX_BATCH} kayıt.` }, { status: 400, headers: NO_STORE });
  }
  if (!arr.every((x) => isUuid(x))) {
    return NextResponse.json({ ok: false, error: "Tüm entity_ids geçerli UUID olmalı." }, { status: 400, headers: NO_STORE });
  }
  const ids = Array.from(new Set(arr as string[])); // duplicate normalize

  try {
    const r = await deleteContentsByEntityIds(guard.db, guard.adminId, ids);
    if (!r.ok) {
      const status = r.error.code === "dependency_conflict" ? 409 : 500;
      return NextResponse.json({ ok: false, error: r.error.message }, { status, headers: NO_STORE });
    }
    const deletedIds = r.data.deleted.map((d) => d.id);
    return NextResponse.json(
      {
        ok: true,
        requested_count: ids.length,
        deleted_count: deletedIds.length,
        deleted_content_ids: deletedIds,
        entities_without_content: ids.length - r.data.deleted.length,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    if (e instanceof HdContentAuditError) return NextResponse.json({ ok: false, error: `audit: ${e.message}` }, { status: 500, headers: NO_STORE });
    throw e;
  }
}
