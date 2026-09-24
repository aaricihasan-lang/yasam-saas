import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { CUPPING_TABLES } from "@/lib/cupping/fields";
import { cuppingError, getEntity, listEntity } from "@/lib/cupping/api";
import {
  buildProtocolWordBuffer,
  protocolWordFilename,
  WORD_CONTENT_TYPE,
  type ProtocolWordInput,
  type ProtocolWordSource,
} from "@/lib/cupping/protocolWord";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * K2 — /api/kupa/protocols/[id]/word-report — PROFESYONEL PROTOKOL WORD İNDİRME.
 *
 * AKTİF protokolün KAYDEDİLMİŞ verisinden gerçek .docx üretir (SADECE OKUMA; DB'ye YAZMAZ).
 *
 * GÜVENLİK (calendarWord route deseniyle aynı):
 *   - androidWordGuard → Android'de Word yok (mevcut ürün politikası; yeni karar YOK).
 *   - requireModuleAccess("cupping") → gate + tenant SERVER-derived.
 *   - Protokol + tüm ilişkileri YALNIZ guard.tenantId ile okunur (getEntity/listEntity .eq tenant_id) →
 *     başka tenant'ın protokolü indirilemez (getEntity 404 → IDOR engeli); cross-tenant sızıntı YOK.
 *   - client body/query'den tenant/user ALINMAZ (id path param; server her şeyi kendi doğrular).
 *   - Ham DB hatası sızmaz (cupping api sabit güvenli mesaj).
 */

const SEVERITY_LABEL: Record<string, string> = {
  info: "Bilgi",
  warning: "Uyarı",
  contraindication: "Kontrendikasyon",
};
const SOURCE_TYPE_LABEL: Record<string, string> = {
  historical_primary: "Tarihsel Birincil",
  historical_secondary: "Tarihsel İkincil",
  book_monograph: "Kitap / Monografi",
  academic_article: "Akademik Makale",
  systematic_review: "Sistematik Derleme",
  clinical_study: "Klinik Çalışma",
  official_guidance: "Resmî Rehber",
  expert_educational: "Uzman / Eğitim",
};

/** Junction satırlarını (sort_order sıralı) + master IN sorgusuyla birleştirip sıralı ad/notlar döndürür. */
async function joinMasters(
  db: SupabaseClient,
  tenantId: string,
  junctionTable: string,
  fkColumn: string,
  masterTable: string,
  masterCols: string,
  protocolId: string,
): Promise<{ rows: Record<string, unknown>[]; master: Map<string, Record<string, unknown>> } | null> {
  const rel = await listEntity(db, junctionTable, tenantId, {
    orderBy: "sort_order",
    ascending: true,
    eqFilters: { protocol_id: protocolId },
  });
  if (!rel.ok) return null;
  const ids = Array.from(
    new Set(rel.data.map((r) => String(r[fkColumn] ?? "")).filter(Boolean)),
  );
  const master = new Map<string, Record<string, unknown>>();
  if (ids.length > 0) {
    const { data, error } = await db
      .from(masterTable)
      .select(masterCols)
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error) return null;
    for (const m of (data ?? []) as unknown as Record<string, unknown>[]) {
      master.set(String(m.id), m);
    }
  }
  return { rows: rel.data, master };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Protokol id gerekli.");
  const { db, tenantId } = guard;

  // 1) Protokol — tenant-scoped (başka tenant → 404).
  const protoRes = await getEntity(db, CUPPING_TABLES.protocols, tenantId, id);
  if (!protoRes.ok) return protoRes.response;
  const protocol = protoRes.data as ProtocolWordInput["protocol"] & Record<string, unknown>;

  // 2) İlişkiler + master'lar (hepsi tenant-scoped; N+1 YOK → junction + tek IN).
  const [pj, tj, sj, srcj] = await Promise.all([
    joinMasters(db, tenantId, CUPPING_TABLES.protocolPoints, "point_id", CUPPING_TABLES.points, "id, name, anatomical_region", id),
    joinMasters(db, tenantId, CUPPING_TABLES.protocolTechniques, "technique_id", CUPPING_TABLES.techniques, "id, name", id),
    joinMasters(db, tenantId, CUPPING_TABLES.protocolSafety, "safety_id", CUPPING_TABLES.safety, "id, title, severity", id),
    joinMasters(db, tenantId, CUPPING_TABLES.protocolSources, "source_id", CUPPING_TABLES.sources, "id, source_name, source_type", id),
  ]);
  if (!pj || !tj || !sj || !srcj) return cuppingError(500, "Protokol verileri alınamadı. Lütfen tekrar deneyin.");

  // 3) Adımlar + Bilgiler (protocol-owned; join YOK).
  const stepsRes = await listEntity(db, CUPPING_TABLES.protocolSteps, tenantId, {
    orderBy: "sort_order",
    ascending: true,
    eqFilters: { protocol_id: id },
  });
  if (!stepsRes.ok) return stepsRes.response;
  const entriesRes = await listEntity(db, CUPPING_TABLES.protocolEntries, tenantId, {
    orderBy: "sort_order",
    ascending: true,
    eqFilters: { protocol_id: id },
  });
  if (!entriesRes.ok) return entriesRes.response;

  const points = pj.rows
    .map((r) => {
      const m = pj.master.get(String(r.point_id));
      if (!m) return null;
      return { name: String(m.name ?? ""), note: (r.protocol_note as string) ?? null, extra: (m.anatomical_region as string) ?? null };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const techniques = tj.rows
    .map((r) => {
      const m = tj.master.get(String(r.technique_id));
      if (!m) return null;
      return { name: String(m.name ?? ""), note: (r.protocol_note as string) ?? null, extra: null };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const safety = sj.rows
    .map((r) => {
      const m = sj.master.get(String(r.safety_id));
      if (!m) return null;
      const sev = SEVERITY_LABEL[String(m.severity ?? "")] ?? null;
      return { name: String(m.title ?? ""), note: (r.protocol_note as string) ?? null, extra: sev };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const sources: ProtocolWordSource[] = srcj.rows
    .map((r) => {
      const m = srcj.master.get(String(r.source_id));
      if (!m) return null;
      return {
        name: String(m.source_name ?? ""),
        type_label: SOURCE_TYPE_LABEL[String(m.source_type ?? "")] ?? null,
        locator: (r.locator as string) ?? null,
        note: (r.note as string) ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const steps = (stepsRes.data as Record<string, unknown>[]).map((s) => ({
    title: (s.title as string) ?? null,
    body: String(s.body ?? ""),
    stage_label: (s.stage_label as string) ?? null,
  }));
  const entries = (entriesRes.data as Record<string, unknown>[]).map((e) => ({
    title: (e.title as string) ?? null,
    content: String(e.content ?? ""),
    source_label: (e.source_label as string) ?? null,
    locator: (e.locator as string) ?? null,
  }));

  let buffer: Buffer;
  try {
    buffer = await buildProtocolWordBuffer({ protocol, points, techniques, steps, safety, entries, sources });
  } catch {
    return cuppingError(500, "Word raporu oluşturulamadı. Lütfen tekrar deneyin.");
  }

  const filename = protocolWordFilename(protocol);
  const asciiName = filename.replace(/[^\x20-\x7E]/g, "_");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": WORD_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
    },
  });
}
