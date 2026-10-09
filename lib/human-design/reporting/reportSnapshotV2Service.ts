/**
 * HD AŞAMA 4B — Profesyonel Word v2 · SNAPSHOT OLUŞTURMA SERVİSİ (server-only)
 * ==========================================================================
 *
 * Orkestrasyon: tenant-güvenli harita okuma → merkezi kod normalizasyonu (hdAppCodes) →
 * uzmanın KENDİ Bilgi Bankası eşleşmeleri (tenant-scoped, Bilgi Bankası paneliyle aynı kodlar)
 * → (yalnız yetki + seçim varsa) kayıtlı provider_raw'dan whitelist Sistem Yorumu → DONMUŞ
 * v2 snapshot. Auth/HTTP YOK; yetki kararı route'tan `systemReadingPermitted` ile gelir.
 *
 * RoxyAPI ÇAĞRILMAZ (yalnız kayıtlı computed_result / provider_raw okunur). MUTATION YOK.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getChartForReportV2 } from "@/lib/human-design/api/chartPersistence";
import { listKnowledgeForReport } from "@/lib/human-design/api/knowledgePersistence";
import { buildExpertKnowledgeCodes, toAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import { extractSystemReading, type SystemReadingDto } from "@/lib/human-design/providers/roxy/systemReading";
import { ROXY_PROVIDER_ID } from "@/lib/human-design/providers/roxy/config";
import { countUniqueChartGates, HD_REPORT_MAX_UNIQUE_GATES } from "./reportSnapshotService";
import {
  buildReportSnapshotV2,
  type HdCommentarySelection,
  type HdReportSnapshotV2,
} from "./reportSnapshotV2";

export const HD_SYSTEM_READING_UNAVAILABLE_MESSAGE =
  "Bu haritada kayıtlı Sistem Yorumu verisi bulunmuyor. Raporu yalnız Uzman Bilgilerim ile oluşturabilirsiniz.";

export type CreateSnapshotV2Options = {
  requested: HdCommentarySelection;
  /** SUNUCUDA doğrulanmış yetki (human_design + hd_system_reading). İstemci seçimi yetki DEĞİL. */
  systemReadingPermitted: boolean;
};

export type CreateSnapshotV2Result =
  | {
      ok: true;
      snapshot: HdReportSnapshotV2;
      clientId: string | null;
      clientName: string;
      /** Danışan profiline yüklenmiş harita görseli (fallback; route sahipliği doğrular). */
      uploadedImagePath: string | null;
      /** Roxy ile hesaplanmış kayıt mı (BodyGraph render beklenir). */
      isRoxy: boolean;
    }
  | { ok: false; status: number; code: string; error: string };

export async function createReportSnapshotV2FromChart(
  db: SupabaseClient,
  tenantId: string,
  chartId: string,
  opts: CreateSnapshotV2Options,
): Promise<CreateSnapshotV2Result> {
  const wantsSystem = opts.requested === "system" || opts.requested === "both";
  const wantsExpert = opts.requested === "expert" || opts.requested === "both";
  const systemAllowed = opts.systemReadingPermitted && wantsSystem;
  // Bilgi Bankası açıklamaları YALNIZ uzman açıkça seçtiyse (yetkiden bağımsız; varsayılan KAPALI).
  const expertIncluded = wantsExpert;

  // provider_raw yalnız yetki + seçim varsa okunur.
  const { row: chart, error: chartErr } = await getChartForReportV2(db, tenantId, chartId, { withProviderRaw: systemAllowed });
  if (chartErr) return { ok: false, status: 500, code: "CHART_READ_FAILED", error: "Harita okunamadı." };
  if (!chart) return { ok: false, status: 404, code: "CHART_NOT_FOUND", error: "Harita bulunamadı." };

  if (countUniqueChartGates(chart.gates, chart.channels) > HD_REPORT_MAX_UNIQUE_GATES) {
    return {
      ok: false,
      status: 422,
      code: "CHART_TOO_MANY_GATES",
      error: `Bu haritada olağan dışı sayıda kapı işaretli (en fazla ${HD_REPORT_MAX_UNIQUE_GATES} benzersiz kapı olabilir). Lütfen harita değerlerini kontrol edin.`,
    };
  }

  const source: "manual" | "computed" = chart.source === "computed" ? "computed" : "manual";
  const isRoxy = source === "computed" && chart.provider === ROXY_PROVIDER_ID;

  let systemReading: SystemReadingDto | null = null;
  if (systemAllowed && isRoxy && chart.provider_raw != null) {
    systemReading = extractSystemReading(chart.provider_raw);
  }
  // Yalnız Sistem Yorumu istendi ama haritada veri yok → boş rapor yerine anlaşılır red.
  if (systemAllowed && opts.requested === "system" && !systemReading) {
    return { ok: false, status: 422, code: "SYSTEM_READING_UNAVAILABLE", error: HD_SYSTEM_READING_UNAVAILABLE_MESSAGE };
  }

  const codes = toAppChartCodes(chart);
  let expertRecords: Awaited<ReturnType<typeof listKnowledgeForReport>>["rows"] = [];
  if (expertIncluded) {
    // Özel Çalışma Notları (expert_notes) bu sorguda OKUNMAZ (yalnız rapora uygun kolonlar).
    const kb = await listKnowledgeForReport(db, tenantId, buildExpertKnowledgeCodes(codes));
    if (kb.error) return { ok: false, status: 500, code: "KNOWLEDGE_READ_FAILED", error: "Bilgi Bankası okunamadı." };
    expertRecords = kb.rows;
  }

  const clientName = (chart.client?.name || chart.client_name || "Danışan").trim();
  // Hesaplanmış haritada doğum verisi = hesabın GİRDİSİ (BodyGraph ile tutarlı); manuel haritada
  // v1 davranışı korunur (danışan kaydı önce).
  const pick = <T,>(chartVal: T | null | undefined, clientVal: T | null | undefined): T | null =>
    (source === "computed" ? chartVal ?? clientVal : clientVal ?? chartVal) ?? null;
  const snapshot = buildReportSnapshotV2({
    generatedAt: new Date().toISOString(),
    chartId: chart.id,
    source,
    provider: chart.provider,
    client: {
      name: clientName,
      birthDate: pick(chart.birth_date, chart.client?.birth_date),
      birthTime: pick(chart.birth_time, chart.client?.birth_time),
      birthPlace: pick(chart.birth_place, chart.client?.birth_place),
      timezone: chart.timezone ?? null,
    },
    codes,
    computed: source === "computed" ? chart.computed_result : null,
    requested: opts.requested,
    systemReadingPermitted: opts.systemReadingPermitted,
    systemReading,
    expertRecords,
    // Görsel kararı route'ta (PNG doğrulama / yüklenen görsel kopyası) verilir.
    bodygraph: { status: "missing" },
    chartImage: null,
  });

  return {
    ok: true,
    snapshot,
    clientId: chart.client_id,
    clientName,
    uploadedImagePath: chart.client?.chart_image_url ?? null,
    isRoxy,
  };
}
