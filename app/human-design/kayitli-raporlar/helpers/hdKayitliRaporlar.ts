import { supabase } from "@/lib/supabase";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import type { HumanDesignReport, HumanDesignClient } from "@/lib/human-design/types";

export type HdReportWithClient = HumanDesignReport & {
  client: Pick<HumanDesignClient, "id" | "name"> | null;
};

export async function listReportsWithClients(): Promise<{
  rows: HdReportWithClient[];
  error: string | null;
}> {
  const tenantId = await getSyncedTenantId();
  if (!tenantId) return { rows: [], error: "Aktif kullanıcı bulunamadı." };

  const [reportsRes, clientsRes] = await Promise.all([
    supabase
      .from("human_design_reports")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("human_design_clients")
      .select("id, name")
      .eq("tenant_id", tenantId),
  ]);

  if (reportsRes.error) return { rows: [], error: reportsRes.error.message };
  if (clientsRes.error) return { rows: [], error: clientsRes.error.message };

  const clientMap = new Map(
    (clientsRes.data ?? []).map((c) => [c.id as string, c as Pick<HumanDesignClient, "id" | "name">]),
  );

  const rows: HdReportWithClient[] = (reportsRes.data ?? []).map((r) => ({
    ...(r as HumanDesignReport),
    client: r.client_id ? (clientMap.get(r.client_id as string) ?? null) : null,
  }));

  return { rows, error: null };
}

export async function deleteReport(id: string): Promise<{ error: string | null }> {
  const tenantId = await getSyncedTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı bulunamadı." };

  const { error } = await supabase
    .from("human_design_reports")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}
