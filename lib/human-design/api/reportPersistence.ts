// Sprint-4 Aşama-2 — human_design_reports güvenli kalıcılığı (server-only, service_role).
//
// Tüm işlemler:
//   • tenant_id + user_id YALNIZ guard'dan gelir (route katmanı verir); body'den GÜVENİLMEZ.
//   • client_id / chart_id için IDOR guard: ilgili kayıt aynı tenant'a ait olmalı.
//   • Tüm sorgu/insert/update/delete tenant-scoped.
// HD engine/compute/BodyGraph matematiğine + rapor içerik üretimine DOKUNMAZ — saf CRUD.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HumanDesignReport, HumanDesignClient } from "@/lib/human-design/types";
import {
  HD_REPORT_SCHEMA_VERSION,
  HD_REPORT_VERSION,
  isHdReportSnapshot,
  type HdReportSnapshot,
} from "@/lib/human-design/reporting/reportSnapshot";

const TABLE = "human_design_reports";

export type ReportWithClient = HumanDesignReport & {
  client: Pick<HumanDesignClient, "id" | "name"> | null;
};

async function clientInTenant(db: SupabaseClient, clientId: string, tenantId: string): Promise<boolean> {
  const { data, error } = await db
    .from("human_design_clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

async function chartInTenant(db: SupabaseClient, chartId: string, tenantId: string): Promise<boolean> {
  const { data, error } = await db
    .from("human_design_charts")
    .select("id")
    .eq("id", chartId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

export async function listReportsWithClients(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ rows: ReportWithClient[]; error: string | null }> {
  const [repRes, cliRes] = await Promise.all([
    db.from(TABLE).select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    db.from("human_design_clients").select("id, name").eq("tenant_id", tenantId),
  ]);
  if (repRes.error) return { rows: [], error: repRes.error.message };
  if (cliRes.error) return { rows: [], error: cliRes.error.message };

  const map = new Map(
    (cliRes.data ?? []).map((c) => [(c as { id: string }).id, c as Pick<HumanDesignClient, "id" | "name">]),
  );
  const rows: ReportWithClient[] = (repRes.data ?? []).map((r) => {
    const report = r as HumanDesignReport;
    return { ...report, client: report.client_id ? map.get(report.client_id) ?? null : null };
  });
  return { rows, error: null };
}

export async function getReportById(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ row: ReportWithClient | null; error: string | null }> {
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  if (!data) return { row: null, error: "Rapor bulunamadı." };

  const report = data as HumanDesignReport;
  if (!report.client_id) return { row: { ...report, client: null }, error: null };

  const { data: cli } = await db
    .from("human_design_clients")
    .select("id, name")
    .eq("id", report.client_id)
    .eq("tenant_id", tenantId)
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
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      client_id: clientId,
      chart_id: chartId,
      title: String(input.title ?? ""),
      selected_codes: Array.isArray(input.selectedCodes) ? input.selectedCodes : [],
      generated_content: String(input.generatedContent ?? ""),
      edited_content: String(input.editedContent ?? ""),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { id: null, error: error?.message ?? "Kayıt oluşturulamadı." };
  return { id: (data as { id: string }).id, error: null };
}

export async function getClientReportCount(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await db
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  return { count: count ?? 0, error: error?.message ?? null };
}

export async function updateReport(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  // IMMUTABILITY (FAZ 2): canonical (profesyonel) rapor snapshot'ı DEĞİŞMEZ.
  // Legacy PATCH davranışı korunur; canonical satır güncellemesi AÇIKÇA reddedilir
  // (snapshot/canonical_provenance/generated içerik PATCH ile değiştirilemez).
  const { data: kindRow, error: kindErr } = await db
    .from(TABLE)
    .select("report_kind")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (kindErr) return { ok: false, error: kindErr.message };
  if (!kindRow) return { ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil." };
  if ((kindRow as { report_kind?: string }).report_kind === "canonical") {
    return { ok: false, error: "Profesyonel (canonical) rapor değiştirilemez; içeriği sabittir." };
  }

  const { data, error } = await db
    .from(TABLE)
    .update({
      title: String(input.title ?? ""),
      edited_content: String(input.editedContent ?? ""),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil." };
  }
  return { ok: true, error: null };
}

export async function deleteReport(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await db.from(TABLE).delete().eq("id", id).eq("tenant_id", tenantId);
  return { ok: !error, error: error?.message ?? null };
}

// =============================================================================
// FAZ 2 — Profesyonel (canonical) rapor kalıcılığı (DONMUŞ snapshot; immutable).
// tenant_id + user_id YALNIZ guard'dan. chart/client IDOR guard tenant-scoped.
// =============================================================================

export type SaveCanonicalReportInput = {
  chartId: string;
  clientId: string | null;
  title: string;
  snapshot: HdReportSnapshot;
  provenance: Record<string, unknown>;
};

export async function saveCanonicalReport(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  input: SaveCanonicalReportInput,
): Promise<{ id: string | null; error: string | null }> {
  // IDOR: chart bu tenant'a ait olmalı; client_id verildiyse o da tenant'a ait olmalı.
  if (!(await chartInTenant(db, input.chartId, tenantId))) {
    return { id: null, error: "Harita bu hesaba ait değil." };
  }
  if (input.clientId && !(await clientInTenant(db, input.clientId, tenantId))) {
    return { id: null, error: "Danışan bu hesaba ait değil." };
  }
  if (!isHdReportSnapshot(input.snapshot)) {
    return { id: null, error: "Geçersiz rapor snapshot'ı." };
  }

  const { data, error } = await db
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
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
      report_version: HD_REPORT_VERSION,
      schema_version: HD_REPORT_SCHEMA_VERSION,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { id: null, error: error?.message ?? "Rapor kaydedilemedi." };
  return { id: (data as { id: string }).id, error: null };
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
  data: { snapshot: HdReportSnapshot; title: string; clientId: string | null } | null;
  status: number;
  error: string | null;
}> {
  const { data, error } = await db
    .from(TABLE)
    .select("title, client_id, report_kind, snapshot")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return { data: null, status: 500, error: error.message };
  if (!data) return { data: null, status: 404, error: "Rapor bulunamadı." };

  const row = data as { title: string; client_id: string | null; report_kind: string; snapshot: unknown };
  if (row.report_kind !== "canonical") {
    return { data: null, status: 400, error: "Bu rapor profesyonel (canonical) rapor değil." };
  }
  if (!isHdReportSnapshot(row.snapshot)) {
    return { data: null, status: 422, error: "Rapor snapshot'ı geçersiz veya eksik." };
  }
  return {
    data: { snapshot: row.snapshot, title: row.title, clientId: row.client_id },
    status: 200,
    error: null,
  };
}
