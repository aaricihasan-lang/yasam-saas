// Sprint-4 Aşama-2 — human_design_reports güvenli kalıcılığı (server-only, service_role).
//
// Tüm işlemler:
//   • tenant_id + user_id YALNIZ guard'dan gelir (route katmanı verir); body'den GÜVENİLMEZ.
//   • client_id / chart_id için IDOR guard: ilgili kayıt aynı tenant'a ait olmalı.
//   • Tüm sorgu/insert/update/delete tenant-scoped.
// HD engine/compute/BodyGraph matematiğine + rapor içerik üretimine DOKUNMAZ — saf CRUD.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HumanDesignReport, HumanDesignClient } from "@/lib/human-design/types";

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
