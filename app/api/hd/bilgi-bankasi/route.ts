import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isHdEntityKind } from "@/lib/human-design/admin/centralContentValidation";
import {
  getPublishedEntityDetail,
  listPublishedGroup,
} from "@/lib/human-design/knowledge/canonicalReadService";

export const runtime = "nodejs";

/**
 * /api/hd/bilgi-bankasi — NORMAL UZMAN salt-okuma canonical Bilgi Bankası.
 *
 * Güvenlik / sözleşme:
 *   - requireModuleAccess(req, "human_design") → x-user-id + x-session-token binding
 *     + kişiye özel modül izni. (human_design şu an "yakında": yalnız admin geçer →
 *     fail-closed; modül uzmanlara açıldığında otomatik çalışır.)
 *   - service_role YALNIZ server'da (guard.db). Tarayıcıya asla sızmaz.
 *   - Yanıt no-store.
 *   - YALNIZ GET. POST/PUT/PATCH/DELETE YOK (mutation yok) → uzman merkezî
 *     canonical veriyi değiştiremez. Yazma yalnız /api/admin/hd/* (verifyAdminRequest).
 *   - Yalnız YAYINLANMIŞ içerik; taslak sızmaz. Tam metin hak sözleşmesine göre
 *     (expert_delivery) filtrelenir. Legacy human_design_knowledge_* tablolarına
 *     dokunmaz; canonical veriyi legacy'ye kopyalamaz.
 *
 * GET ?resource=groups&kind=tip|otorite|kapi|kanal → yayınlanmış kimlik listesi
 * GET ?resource=entity&key=<canonical_key>         → hak-filtreli detay
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const resource = url.searchParams.get("resource")?.trim() ?? "groups";

  if (resource === "groups") {
    const kindRaw = url.searchParams.get("kind")?.trim() ?? "";
    if (!isHdEntityKind(kindRaw)) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz veya eksik kind (tip|otorite|kapi|kanal)." },
        { status: 400, headers: NO_STORE },
      );
    }
    const r = await listPublishedGroup(guard.db, kindRaw);
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error.message }, { status: 500, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, kind: kindRaw, items: r.data }, { status: 200, headers: NO_STORE });
  }

  if (resource === "entity") {
    const key = url.searchParams.get("key")?.trim() ?? "";
    if (!key) {
      return NextResponse.json({ ok: false, error: "key (canonical_key) gerekli." }, { status: 400, headers: NO_STORE });
    }
    const r = await getPublishedEntityDetail(guard.db, key);
    if (!r.ok) {
      const status = r.error.code === "not_found" ? 404 : 500;
      return NextResponse.json({ ok: false, error: r.error.message }, { status, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, ...r.data }, { status: 200, headers: NO_STORE });
  }

  return NextResponse.json(
    { ok: false, error: "Bilinmeyen resource (groups|entity)." },
    { status: 400, headers: NO_STORE },
  );
}
