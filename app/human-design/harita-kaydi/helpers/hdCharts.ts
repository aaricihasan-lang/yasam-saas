import { supabase } from "@/lib/supabase";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import type { HumanDesignChart } from "@/lib/human-design/types";

const TABLE = "human_design_charts";

export type HdChartRow = HumanDesignChart;

export async function loadClientChart(clientId: string): Promise<{
  row: HdChartRow | null;
  error: string | null;
}> {
  const tenantId = await getSyncedTenantId();
  if (!tenantId) return { row: null, error: "Aktif kullanıcı bulunamadı." };

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  return { row: data as HdChartRow | null, error: null };
}

type ChartPayload = {
  type_code: string | null;
  authority_code: string | null;
  profile_code: string | null;
  definition_code: string | null;
  active_centers: string[];
  open_centers: string[];
  gates: number[];
  channels: string[];
  notes: string | null;
};

export async function saveClientChart(
  clientId: string,
  values: ChartPayload,
): Promise<{ error: string | null }> {
  const tenantId = await getSyncedTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı bulunamadı." };

  const { data: existing } = await supabase
    .from(TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .maybeSingle();

  const payload = {
    tenant_id: tenantId,
    client_id: clientId,
    ...values,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq("id", (existing as { id: string }).id)
      .eq("tenant_id", tenantId);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from(TABLE).insert(payload);
  return { error: error?.message ?? null };
}
