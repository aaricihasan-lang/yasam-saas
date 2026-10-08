// Sprint-4 Aşama-2 — human_design_reports güvenli kalıcılığı (server-only, service_role).
//
// Tüm işlemler:
//   • tenant_id + user_id YALNIZ guard'dan gelir (route katmanı verir); body'den GÜVENİLMEZ.
//   • client_id / chart_id için IDOR guard: ilgili kayıt aynı tenant'a ait olmalı.
//   • Tüm sorgu/insert/update/delete tenant-scoped.
// HD engine/compute/BodyGraph matematiğine + rapor içerik üretimine DOKUNMAZ — saf CRUD.

import type { SupabaseClient } from "@supabase/supabase-js";
import { hdSafeDbError } from "./safeError";
import { withTenant, tenantInsertPayload } from "./tenantScope";
import { HD_CONFLICT_CODE, HD_CONFLICT_MESSAGE } from "./optimistic";
import { isUniqueViolation } from "./deterministicId";
import { removeReportSnapshotImage } from "./hdStorage";
import type { HumanDesignReport, HumanDesignClient } from "@/lib/human-design/types";
import {
  HD_REPORT_SCHEMA_VERSION,
  HD_REPORT_VERSION,
} from "@/lib/human-design/reporting/reportSnapshot";
import {
  HD_REPORT_V2_VERSION,
  isAnyHdReportSnapshot,
  type AnyHdReportSnapshot,
} from "@/lib/human-design/reporting/reportSnapshotV2";

const TABLE = "human_design_reports";

export type ReportWithClient = HumanDesignReport & {
  client: Pick<HumanDesignClient, "id" | "name"> | null;
};

/**
 * Liste/detay PROJEKSİYONU: donmuş canonical snapshot ve canonical_provenance (canonical
 * anahtar + içerik) istemciye ASLA dönmez. Canonical metin uzmana yalnız DOCX indirme
 * (donmuş snapshot → Word) yoluyla ulaşır; JSON okuma yüzeyi yoktur.
 */
export const HD_REPORT_HIDDEN_COLUMNS = ["snapshot", "canonical_provenance"] as const;

export function stripReportSecrets<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of HD_REPORT_HIDDEN_COLUMNS) delete out[k];
  return out as T;
}

async function clientInTenant(db: SupabaseClient, clientId: string, tenantId: string): Promise<boolean> {
  const { data, error } = await withTenant(db.from("human_design_clients").select("id"), tenantId, "clientInTenant")
    .eq("id", clientId)
    .maybeSingle();
  return !error && !!data;
}

async function chartInTenant(db: SupabaseClient, chartId: string, tenantId: string): Promise<boolean> {
  const { data, error } = await withTenant(db.from("human_design_charts").select("id"), tenantId, "chartInTenant")
    .eq("id", chartId)
    .maybeSingle();
  return !error && !!data;
}

export async function listReportsWithClients(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ rows: ReportWithClient[]; error: string | null }> {
  const [repRes, cliRes] = await Promise.all([
    withTenant(db.from(TABLE).select("*"), tenantId, "listReportsWithClients.reports").order("created_at", { ascending: false }),
    withTenant(db.from("human_design_clients").select("id, name"), tenantId, "listReportsWithClients.clients"),
  ]);
  if (repRes.error) return { rows: [], error: hdSafeDbError("listReportsWithClients.reports", repRes.error) };
  if (cliRes.error) return { rows: [], error: hdSafeDbError("listReportsWithClients.clients", cliRes.error) };

  const map = new Map(
    (cliRes.data ?? []).map((c) => [(c as { id: string }).id, c as Pick<HumanDesignClient, "id" | "name">]),
  );
  const rows: ReportWithClient[] = (repRes.data ?? []).map((r) => {
    const report = stripReportSecrets(r as HumanDesignReport & Record<string, unknown>);
    return { ...report, client: report.client_id ? map.get(report.client_id) ?? null : null };
  });
  return { rows, error: null };
}

export async function getReportById(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ row: ReportWithClient | null; error: string | null }> {
  const { data, error } = await withTenant(db.from(TABLE).select("*"), tenantId, "getReportById")
    .eq("id", id)
    .maybeSingle();
  if (error) return { row: null, error: hdSafeDbError("getReportById", error) };
  if (!data) return { row: null, error: "Rapor bulunamadı." };

  const report = stripReportSecrets(data as HumanDesignReport & Record<string, unknown>);
  if (!report.client_id) return { row: { ...report, client: null }, error: null };

  const { data: cli } = await withTenant(db.from("human_design_clients").select("id, name"), tenantId, "getReportById.client")
    .eq("id", report.client_id)
    .maybeSingle();
  return {
    row: { ...report, client: (cli as Pick<HumanDesignClient, "id" | "name"> | null) ?? null },
    error: null,
  };
}

export async function saveReport(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  input: Record<string, unknown>,
): Promise<{ id: string | null; error: string | null }> {
  const clientId = String(input.clientId ?? "").trim();
  if (!clientId) return { id: null, error: "client_id gerekli." };
  if (!(await clientInTenant(db, clientId, tenantId))) {
    return { id: null, error: "Danışan bu hesaba ait değil." };
  }
  const chartId = input.chartId ? String(input.chartId) : null;
  if (chartId && !(await chartInTenant(db, chartId, tenantId))) {
    return { id: null, error: "Harita bu hesaba ait değil." };
  }

  const { data, error } = await db
    .from(TABLE)
    .insert(tenantInsertPayload(tenantId, {
      user_id: userId,
      client_id: clientId,
      chart_id: chartId,
      title: String(input.title ?? ""),
      selected_codes: Array.isArray(input.selectedCodes) ? input.selectedCodes : [],
      generated_content: String(input.generatedContent ?? ""),
      edited_content: String(input.editedContent ?? ""),
      updated_at: new Date().toISOString(),
    }))
    .select("id")
    .single();
  if (error || !data) return { id: null, error: error ? hdSafeDbError("saveReport", error) : "Kayıt oluşturulamadı." };
  return { id: (data as { id: string }).id, error: null };
}

export async function getClientReportCount(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await withTenant(db.from(TABLE).select("id", { count: "exact", head: true }), tenantId, "getClientReportCount")
    .eq("client_id", clientId);
  return { count: count ?? 0, error: error ? hdSafeDbError("getClientReportCount", error) : null };
}

export async function updateReport(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  input: Record<string, unknown>,
  opts: { expectedUpdatedAt?: string } = {},
): Promise<{ ok: boolean; error: string | null; status?: number; code?: string; updatedAt?: string | null }> {
  // IMMUTABILITY (FAZ 2): canonical (profesyonel) rapor snapshot'ı DEĞİŞMEZ.
  // Legacy PATCH davranışı korunur; canonical satır güncellemesi AÇIKÇA reddedilir
  // (snapshot/canonical_provenance/generated içerik PATCH ile değiştirilemez).
  const { data: kindRow, error: kindErr } = await withTenant(db.from(TABLE).select("report_kind"), tenantId, "updateReport.kind")
    .eq("id", id)
    .maybeSingle();
  if (kindErr) return { ok: false, error: hdSafeDbError("updateReport.kind", kindErr) };
  if (!kindRow) return { ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil.", status: 404 };
  if ((kindRow as { report_kind?: string }).report_kind === "canonical") {
    return { ok: false, error: "Profesyonel (canonical) rapor değiştirilemez; içeriği sabittir." };
  }

  // P2-9: beklenen sürüm verildiyse UPDATE koşullu (atomik) — başka oturumun kaydı ezilmez.
  let q = withTenant(db.from(TABLE).update({
      title: String(input.title ?? ""),
      edited_content: String(input.editedContent ?? ""),
      updated_at: new Date().toISOString(),
    }), tenantId, "updateReport")
    .eq("id", id);
  if (opts.expectedUpdatedAt) q = q.eq("updated_at", opts.expectedUpdatedAt);
  const { data, error } = await q.select("id, updated_at");
  if (error) return { ok: false, error: hdSafeDbError("updateReport", error) };
  if (!data || data.length === 0) {
    return opts.expectedUpdatedAt
      ? { ok: false, error: HD_CONFLICT_MESSAGE, status: 409, code: HD_CONFLICT_CODE }
      : { ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil.", status: 404 };
  }
  return { ok: true, error: null, updatedAt: (data[0] as { updated_at?: string | null }).updated_at ?? null };
}

export async function deleteReport(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  // P2-1: raporun DONMUŞ görsel kopyası (varsa) rapor silinince temizlenir. Yol silmeden
  // ÖNCE okunur; yalnız bu tenant'ın report-snapshots klasöründeki yol silinir (danışanın
  // canlı görseli asla bu yoldan silinmez).
  const { data: imgRow } = await withTenant(
    db.from(TABLE).select("snapshot->chartImage->>storagePath"), tenantId, "deleteReport.image",
  ).eq("id", id).maybeSingle();
  const { error } = await withTenant(db.from(TABLE).delete(), tenantId, "deleteReport").eq("id", id);
  if (error) return { ok: false, error: hdSafeDbError("deleteReport", error) };
  const imgPath = (imgRow as { storagePath?: string | null } | null)?.storagePath ?? null;
  await removeReportSnapshotImage(db, tenantId, imgPath);
  return { ok: true, error: null };
}

/**
 * P1-3: Danışan silinirken raporları KORUMAK için client bağını kopar (client_id = NULL).
 * Donmuş profesyonel rapor danışan adını snapshot'ta taşır; legacy rapor metni zaten kendi
 * içindedir. Döner: koparılan rapor id'leri (hata durumunda geri bağlamak için).
 */
export async function detachReportsFromClient(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await withTenant(db.from(TABLE).update({ client_id: null }), tenantId, "detachReportsFromClient")
    .eq("client_id", clientId)
    .select("id");
  if (error) return { ids: [], error: hdSafeDbError("detachReportsFromClient", error) };
  return { ids: ((data ?? []) as { id: string }[]).map((r) => r.id), error: null };
}

/** detachReportsFromClient telafisi: koparılan raporları danışana geri bağla. */
export async function reattachReportsToClient(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  reportIds: string[],
): Promise<{ ok: boolean }> {
  if (reportIds.length === 0) return { ok: true };
  const { error } = await withTenant(db.from(TABLE).update({ client_id: clientId }), tenantId, "reattachReportsToClient")
    .in("id", reportIds);
  if (error) console.error("[hd] rapor geri bağlanamadı:", hdSafeDbError("reattachReportsToClient", error));
  return { ok: !error };
}

// =============================================================================
// FAZ 2 — Profesyonel (canonical) rapor kalıcılığı (DONMUŞ snapshot; immutable).
// tenant_id + user_id YALNIZ guard'dan. chart/client IDOR guard tenant-scoped.
// =============================================================================

export type SaveCanonicalReportInput = {
  /** P2-2: deterministik rapor id'si (istek kimliğinden türetilir) → tekrar = aynı satır. */
  id?: string;
  chartId: string;
  clientId: string | null;
  title: string;
  /** hd-report-1 (eski) ya da hd-report-2 (AŞAMA 4B). Şema sürümü snapshot'tan okunur. */
  snapshot: AnyHdReportSnapshot;
  provenance: Record<string, unknown>;
};

export async function saveCanonicalReport(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  input: SaveCanonicalReportInput,
): Promise<{ id: string | null; error: string | null; duplicate?: boolean }> {
  // IDOR: chart bu tenant'a ait olmalı; client_id verildiyse o da tenant'a ait olmalı.
  if (!(await chartInTenant(db, input.chartId, tenantId))) {
    return { id: null, error: "Harita bu hesaba ait değil." };
  }
  if (input.clientId && !(await clientInTenant(db, input.clientId, tenantId))) {
    return { id: null, error: "Danışan bu hesaba ait değil." };
  }
  if (!isAnyHdReportSnapshot(input.snapshot)) {
    return { id: null, error: "Geçersiz rapor snapshot'ı." };
  }
  const isV2 = input.snapshot.schemaVersion !== HD_REPORT_SCHEMA_VERSION;

  const { data, error } = await db
    .from(TABLE)
    .insert(tenantInsertPayload(tenantId, {
      ...(input.id ? { id: input.id } : {}),
      user_id: userId,
      client_id: input.clientId,
      chart_id: input.chartId,
      title: input.title,
      selected_codes: [],
      generated_content: "",
      edited_content: "",
      report_kind: "canonical",
      snapshot: input.snapshot,
      canonical_provenance: input.provenance,
      report_version: isV2 ? HD_REPORT_V2_VERSION : HD_REPORT_VERSION,
      schema_version: input.snapshot.schemaVersion,
      updated_at: new Date().toISOString(),
    }))
    .select("id")
    .single();
  if (error && input.id && isUniqueViolation(error)) {
    // Aynı istek kimliğiyle eşzamanlı/tekrar istek: satır zaten var → yeni satır YOK.
    return { id: input.id, error: null, duplicate: true };
  }
  if (error || !data) return { id: null, error: error ? hdSafeDbError("saveCanonicalReport", error) : "Rapor kaydedilemedi." };
  return { id: (data as { id: string }).id, error: null };
}

/** P2-2: idempotency ön kontrolü — bu tenant'ta bu id'li rapor var mı (hangi haritaya ait)? */
export async function findReportBrief(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ row: { id: string; chart_id: string | null; report_kind: string } | null; error: string | null }> {
  const { data, error } = await withTenant(db.from(TABLE).select("id, chart_id, report_kind"), tenantId, "findReportBrief")
    .eq("id", id)
    .maybeSingle();
  if (error) return { row: null, error: hdSafeDbError("findReportBrief", error) };
  return { row: (data as { id: string; chart_id: string | null; report_kind: string } | null) ?? null, error: null };
}

export type ReportBrief = {
  id: string;
  chart_id: string | null;
  client_id: string | null;
  report_kind: string | null;
  schema_version: string | null;
  created_at: string;
};

/**
 * Hafif rapor listesi (snapshot/içerik YOK) — tenant-scoped; `chartId` verilirse yalnız o analizin
 * raporları. Analiz ekranındaki "Word İndir" mevcut donmuş raporu bulmak için kullanır (yeni kopya
 * oluşturmamak için). Yeni sıralı (en yeni önce).
 */
export async function listReportBriefs(
  db: SupabaseClient,
  tenantId: string,
  opts: { chartId?: string } = {},
): Promise<{ rows: ReportBrief[]; error: string | null }> {
  let q = withTenant(db.from(TABLE).select("id, chart_id, client_id, report_kind, schema_version, created_at"), tenantId, "listReportBriefs");
  if (opts.chartId) q = q.eq("chart_id", opts.chartId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) return { rows: [], error: hdSafeDbError("listReportBriefs", error) };
  return { rows: (data ?? []) as ReportBrief[], error: null };
}

/**
 * İndirme için canonical rapor okuma — tenant-scoped, YALNIZ report_kind='canonical'.
 * DOCX bu DONMUŞ snapshot'tan üretilir (LIVE canonical lookup YOK). Başka tenant/legacy/
 * eksik snapshot → hata (fail-safe). client_id de döner (owned görsel doğrulaması için).
 */
export async function getCanonicalReportForDownload(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{
  data: { snapshot: AnyHdReportSnapshot; title: string; clientId: string | null } | null;
  status: number;
  error: string | null;
}> {
  const { data, error } = await withTenant(db.from(TABLE).select("title, client_id, report_kind, snapshot"), tenantId, "getCanonicalReportForDownload")
    .eq("id", id)
    .maybeSingle();
  if (error) return { data: null, status: 500, error: hdSafeDbError("getCanonicalReportForDownload", error) };
  if (!data) return { data: null, status: 404, error: "Rapor bulunamadı." };

  const row = data as { title: string; client_id: string | null; report_kind: string; snapshot: unknown };
  if (row.report_kind !== "canonical") {
    return { data: null, status: 400, error: "Bu rapor profesyonel (canonical) rapor değil." };
  }
  if (!isAnyHdReportSnapshot(row.snapshot)) {
    return { data: null, status: 422, error: "Rapor snapshot'ı geçersiz veya eksik." };
  }
  return {
    data: { snapshot: row.snapshot, title: row.title, clientId: row.client_id },
    status: 200,
    error: null,
  };
}
