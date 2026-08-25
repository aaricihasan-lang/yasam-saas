import { NextRequest, NextResponse } from "next/server";
import { requireAdminUserRequest } from "@/lib/auth/userGuard";
import { isHdEntityKind } from "@/lib/human-design/admin/centralContentValidation";
import {
  getPublishedContentByKeys,
  getPublishedEntityDetail,
  listPublishedGroup,
} from "@/lib/human-design/knowledge/canonicalReadService";
import { getChartKnowledgeSource } from "@/lib/human-design/api/chartPersistence";
import {
  assemblePersonalKnowledge,
  buildPersonalKnowledgeStructure,
} from "@/lib/human-design/knowledge/personalKnowledge";

export const runtime = "nodejs";

/**
 * /api/hd/bilgi-bankasi — ADMIN/OWNER'a ÖZEL merkezî canonical Bilgi Bankası.
 *
 * Güvenlik / sözleşme (admin knowledge isolation):
 *   - requireAdminUserRequest(req) → x-user-id + x-session-token binding + role==='admin'.
 *     Human Design modülü uzmanlara AÇIK olsa da (module_permissions.human_design=true),
 *     merkezî canonical corpus (112/112 + kaynaklar + evidence + Reader prose) yalnız
 *     ADMIN/OWNER'a servis edilir. Non-admin → 403 (fail-closed); UI empty-state gösterir.
 *   - service_role YALNIZ server'da (guard.db) ve YALNIZ admin kontrolünden SONRA →
 *     non-admin için canonical bypass olmaz. Tarayıcıya asla sızmaz.
 *   - Yanıt no-store.
 *   - YALNIZ GET. POST/PUT/PATCH/DELETE YOK (mutation yok). Yazma yalnız
 *     /api/admin/hd/* (verifyAdminRequest).
 *   - Yalnız YAYINLANMIŞ içerik; taslak sızmaz. Legacy human_design_knowledge_*
 *     tablolarına dokunmaz; canonical veriyi legacy'ye kopyalamaz.
 *
 * GET ?resource=groups&kind=tip|otorite|kapi|kanal → yayınlanmış kimlik listesi
 * GET ?resource=entity&key=<canonical_key>         → hak-filtreli detay
 * GET ?resource=chart-knowledge&chart_id=<uuid>    → chart bazlı canonical paket
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireAdminUserRequest(req);
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

  if (resource === "chart-knowledge") {
    // Danışan chart'ından deterministik "Kişinin Human Design Bilgileri" paketi.
    // Tenant-güvenli chart okuma (IDOR yok) → SAF assembler → batched published read.
    // PUBLISH/DB-WRITE YOK; canonical prose published-only; taslak sızmaz.
    const chartId = url.searchParams.get("chart_id")?.trim() ?? "";
    if (!chartId) {
      return NextResponse.json({ ok: false, error: "chart_id gerekli." }, { status: 400, headers: NO_STORE });
    }
    const chartRes = await getChartKnowledgeSource(guard.db, guard.tenantId, chartId);
    if (chartRes.error) {
      return NextResponse.json({ ok: false, error: chartRes.error }, { status: 500, headers: NO_STORE });
    }
    if (!chartRes.row) {
      // Yok veya başka tenant → ayırt etme (fail-safe 404).
      return NextResponse.json({ ok: false, error: "Harita bulunamadı." }, { status: 404, headers: NO_STORE });
    }
    const chart = chartRes.row;
    const structure = buildPersonalKnowledgeStructure({
      type_code: chart.type_code,
      authority_code: chart.authority_code,
      gates: chart.gates ?? [],
      channels: chart.channels ?? [],
    });
    const contentRes = await getPublishedContentByKeys(guard.db, structure.allKeys);
    if (!contentRes.ok) {
      return NextResponse.json({ ok: false, error: contentRes.error.message }, { status: 500, headers: NO_STORE });
    }
    const source = chart.source === "computed" ? "computed" : "manual";
    const dto = assemblePersonalKnowledge(
      { chartId: chart.id, source },
      structure,
      contentRes.data,
      new Date().toISOString(),
    );
    return NextResponse.json({ ok: true, knowledge: dto }, { status: 200, headers: NO_STORE });
  }

  return NextResponse.json(
    { ok: false, error: "Bilinmeyen resource (groups|entity|chart-knowledge)." },
    { status: 400, headers: NO_STORE },
  );
}
