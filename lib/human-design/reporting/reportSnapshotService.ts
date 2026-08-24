/**
 * HD FAZ 2 — Profesyonel Word/DOCX · SNAPSHOT OLUŞTURMA SERVİSİ (server-only)
 * ==========================================================================
 *
 * Orkestrasyon: tenant-güvenli chart+danışan okuma → FAZ 1 deterministik yapı →
 * YAYINLANMIŞ canonical içerik+provenance BATCH okuma (N+1 yok) → DONMUŞ snapshot
 * (fail-loud). Auth/HTTP YOK (route katmanı guard'ı sağlar); yalnız db + tenantId alır.
 *
 * MUTATION YOK — yalnız okur ve snapshot üretir. Persistence AYRI (reportPersistence).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getChartWithClientForReport } from "@/lib/human-design/api/chartPersistence";
import { getPublishedRecordsByKeys } from "@/lib/human-design/knowledge/canonicalReadService";
import { buildPersonalKnowledgeStructure } from "@/lib/human-design/knowledge/personalKnowledge";
import {
  buildReportSnapshot,
  ReportSnapshotError,
  type HdReportSnapshot,
} from "./reportSnapshot";

export type CreateSnapshotResult =
  | {
      ok: true;
      snapshot: HdReportSnapshot;
      clientId: string | null;
      clientName: string;
      /** Danışan owned BodyGraph storage path'i (varsa; route doğrular+getirir). */
      chartImagePath: string | null;
    }
  | { ok: false; status: number; code: string; error: string };

/**
 * chart_id → DONMUŞ HdReportSnapshot. tenantId guard'dan gelir (IDOR-safe). Chart yok/
 * başka tenant → 404 (ayırt etme). Beklenen published canonical eksikse → 422 fail-loud
 * (canonical metin UYDURULMAZ). Görsel snapshot'a metadata olarak yazılır; embed route'ta.
 */
export async function createReportSnapshotFromChart(
  db: SupabaseClient,
  tenantId: string,
  chartId: string,
): Promise<CreateSnapshotResult> {
  const { row: chart, error: chartErr } = await getChartWithClientForReport(db, tenantId, chartId);
  if (chartErr) return { ok: false, status: 500, code: "CHART_READ_FAILED", error: "Harita okunamadı." };
  if (!chart) return { ok: false, status: 404, code: "CHART_NOT_FOUND", error: "Harita bulunamadı." };

  // FAZ 1 deterministik yapı (SAF; DB yok).
  const structure = buildPersonalKnowledgeStructure({
    type_code: chart.type_code,
    authority_code: chart.authority_code,
    gates: chart.gates ?? [],
    channels: chart.channels ?? [],
  });

  // Batched published canonical içerik + provenance (tek sorgu).
  const recRes = await getPublishedRecordsByKeys(db, structure.allKeys);
  if (!recRes.ok) return { ok: false, status: 500, code: "CANONICAL_READ_FAILED", error: "Canonical içerik okunamadı." };

  const clientName = (chart.client?.name || chart.client_name || "Danışan").trim();
  const now = new Date().toISOString();
  const source: "manual" | "computed" = chart.source === "computed" ? "computed" : "manual";

  // Owned BodyGraph görsel path'i (route doğrular: isOwnedChartImagePath + storage download).
  const chartImagePath = chart.client?.chart_image_url ?? null;

  let snapshot: HdReportSnapshot;
  try {
    snapshot = buildReportSnapshot({
      generatedAt: now,
      readAt: now,
      client: {
        name: clientName,
        birthDate: chart.client?.birth_date ?? chart.birth_date ?? null,
        birthTime: chart.client?.birth_time ?? chart.birth_time ?? null,
        birthPlace: chart.client?.birth_place ?? chart.birth_place ?? null,
      },
      chart: { chartId: chart.id, source },
      structure,
      recordByKey: recRes.data,
      // Görsel bilgisi create anında path olarak saklanır; embed edilip edilmediği
      // (includedAtGeneration) indirme anında belirlenir → burada false başlar.
      chartImage: chartImagePath ? { storagePath: chartImagePath, includedAtGeneration: false } : null,
    });
  } catch (e) {
    if (e instanceof ReportSnapshotError && e.code === "missing_canonical") {
      return { ok: false, status: 422, code: "CANONICAL_MISSING", error: e.detail };
    }
    return { ok: false, status: 500, code: "SNAPSHOT_BUILD_FAILED", error: "Rapor snapshot'ı oluşturulamadı." };
  }

  return { ok: true, snapshot, clientId: chart.client_id, clientName, chartImagePath };
}
