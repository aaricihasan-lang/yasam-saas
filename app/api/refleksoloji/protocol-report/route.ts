import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { ReportChild } from "@/lib/docx/reportHelpers";
import { readSnapshotsForDelivery } from "@/lib/yasam-hafizasi/client/snapshotStore";
import { buildSnapshotSection } from "@/lib/yasam-hafizasi/client/snapshotReport";
import { parseOrganList } from "@/lib/refleksoloji/organs";
import { resolveProtocolAtlas } from "@/lib/refleksoloji/atlasRegionsCore";
import type { AtlasDocument } from "@/lib/atlasStorage";
import {
  buildSingleReport,
  buildBulkReport,
  reflexologyHeaders,
  reflexologyFooters,
  type ReflexologyProtocolInput,
} from "@/lib/refleksoloji/reflexologyWord";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ExportMode = "all" | "selected" | "single";

type ProtocolRow = {
  id: string;
  tenant_id: string;
  source_uid: string | null;
  title: string | null;
  target_problem: string | null; // "Kısa Açıklama"
  organs: string | null; // pipe/virgül: "Karaciğer | Böbrek"
  application_notes: string | null; // "Uygulama Notları"
  raw_json: Record<string, unknown> | null;
  created_at: string;
};

function formatDateTR(d: string): string {
  try {
    return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return d;
  }
}

function slugify(t: string): string {
  return t
    .toLowerCase()
    .replace(/ı/g, "i").replace(/İ/g, "i").replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u").replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o").replace(/ç/g, "c").replace(/Ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const EMPTY_ATLAS: AtlasDocument = { _meta: { version: "1", updated_at: "1970-01-01T00:00:00.000Z" } };

export async function POST(request: NextRequest): Promise<Response> {
  // GÜVENLİK: kimlik yalnız sunucu tarafında (requireModuleAccess). Body'deki
  // tenantId/userId GÜVEN KAYNAĞI DEĞİLDİR.
  const guard = await requireModuleAccess(request, "reflexology");
  if (!guard.ok) return guard.response;
  const { tenantId } = guard;

  if (guard.is_demo_account)
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const { exportMode = "all", protocolIds, protocolId, clientId, selectionGroupId } = body as {
    exportMode?: ExportMode;
    protocolIds?: string[];
    protocolId?: string;
    clientId?: string;
    selectionGroupId?: string;
  };

  if (exportMode === "single" && !protocolId)
    return Response.json({ ok: false, error: "Tek protokol için protocolId zorunludur." }, { status: 400 });

  if (exportMode === "selected" && (!Array.isArray(protocolIds) || protocolIds.length === 0))
    return Response.json({ ok: false, error: "Seçili export için en az bir protocolId gerekli." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  let query = db.from("reflexology_protocols").select("*").eq("tenant_id", tenantId);
  if (exportMode === "single" && protocolId) {
    query = query.eq("id", protocolId);
  } else if (exportMode === "selected" && Array.isArray(protocolIds) && protocolIds.length > 0) {
    query = query.in("id", protocolIds);
  }

  const { data, error } = await query.order("title");
  if (error)
    return Response.json({ ok: false, error: `Protokoller okunamadı: ${error.message}` }, { status: 500 });

  const protocols = (data || []) as ProtocolRow[];
  if (!protocols.length)
    return Response.json({ ok: false, error: "Bu seçim için protokol bulunamadı." }, { status: 404 });

  // Tenant atlas belgesi (READ-ONLY; mutate YOK). Yoksa boş belge → harita üretilmez.
  const { data: atlasRow, error: atlasErr } = await db
    .from("reflexology_atlas")
    .select("document")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (atlasErr)
    return Response.json({ ok: false, error: `Atlas okunamadı: ${atlasErr.message}` }, { status: 500 });
  const atlasDoc = ((atlasRow?.document as AtlasDocument | null) ?? EMPTY_ATLAS);

  const dateSlug = new Date().toISOString().slice(0, 10);
  const isSingle = protocols.length === 1;

  const toInput = (proto: ProtocolRow, index: number): ReflexologyProtocolInput => {
    const organs = parseOrganList(proto.organs);
    return {
      index,
      title: proto.title?.trim() || "Başlıksız Protokol",
      description: proto.target_problem,
      notes: proto.application_notes,
      organs,
      createdAt: proto.created_at,
      resolved: resolveProtocolAtlas(atlasDoc, organs),
    };
  };

  let children: ReportChild[];
  if (isSingle) {
    const input = toInput(protocols[0]!, 0);
    children = await buildSingleReport(input, formatDateTR(protocols[0]!.created_at));

    // ── Yaşam Hafızası Seçimleri (BF-14 P2; danışana özel teslim eki, OPSİYONEL) ──
    // Yalnız exportMode === "single" + doğrulanmış client + selection group.
    // Protokol/atlas ana kaydı MUTATE EDİLMEZ; snapshot yalnız teslim katmanı.
    if (
      exportMode === "single" &&
      typeof protocolId === "string" && UUID_RE.test(protocolId) &&
      typeof clientId === "string" && UUID_RE.test(clientId) &&
      typeof selectionGroupId === "string" && UUID_RE.test(selectionGroupId)
    ) {
      const { data: cliRow } = await db
        .from("clients").select("id").eq("id", clientId).eq("tenant_id", tenantId).maybeSingle();
      if (!cliRow) {
        return Response.json({ ok: false, error: "Danışan bulunamadı veya erişim yok." }, { status: 403 });
      }
      try {
        const snaps = await readSnapshotsForDelivery(db, {
          tenantId, clientId, targetKind: "protocol", targetRef: protocolId, selectionGroup: selectionGroupId,
        });
        if (snaps.length > 0) children.push(...buildSnapshotSection(snaps));
      } catch {
        /* regresyon güvenli: teslim seçimi eklenemezse mevcut protokol raporu korunur */
      }
    }
  } else {
    const inputs = protocols.map(toInput);
    const scopeLabel = exportMode === "selected" ? "Seçili Protokoller" : "Tüm Protokoller";
    const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
    children = await buildBulkReport(inputs, today, scopeLabel);
  }

  const doc = new Document({
    sections: [{
      properties: {
        titlePage: true,
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
        },
      },
      headers: reflexologyHeaders(),
      footers: reflexologyFooters(),
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug = isSingle
    ? slugify(protocols[0]!.title || "protokol")
    : exportMode === "selected" ? "secili" : "tumu";
  const filename = `refleksoloji-protokol-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
