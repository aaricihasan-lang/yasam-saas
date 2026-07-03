import { supabase } from "@/lib/supabase";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import type { HumanDesignChart, HumanDesignClient } from "@/lib/human-design/types";

export type HdChartWithClient = HumanDesignChart & {
  client: Pick<HumanDesignClient, "id" | "name" | "birth_date" | "birth_time" | "birth_place" | "external_chart_url"> | null;
};

export async function listChartsWithClients(): Promise<{
  rows: HdChartWithClient[];
  error: string | null;
}> {
  const tenantId = await getSyncedTenantId();
  if (!tenantId) return { rows: [], error: "Aktif kullanıcı tenant_id bulunamadı." };

  const [chartsRes, clientsRes] = await Promise.all([
    supabase
      .from("human_design_charts")
      .select("*")
      .eq("tenant_id", tenantId)
      // FAZ 9D — yalnız manuel/legacy kayıtlar; hesaplanmış (source='computed')
      // satırlar bu manuel listede GÖSTERİLMEZ (ayrı "Hesaplanmış" tab'ında listelenir).
      .or("source.is.null,source.eq.manual")
      .order("created_at", { ascending: false }),
    supabase
      .from("human_design_clients")
      .select("id, name, birth_date, birth_time, birth_place, external_chart_url")
      .eq("tenant_id", tenantId),
  ]);

  if (chartsRes.error) return { rows: [], error: chartsRes.error.message };
  if (clientsRes.error) return { rows: [], error: clientsRes.error.message };

  const clientMap = new Map(
    (clientsRes.data ?? []).map((c) => [c.id as string, c as Pick<HumanDesignClient, "id" | "name" | "birth_date" | "birth_time" | "birth_place" | "external_chart_url">]),
  );

  const rows: HdChartWithClient[] = (chartsRes.data ?? []).map((chart) => ({
    ...(chart as HumanDesignChart),
    client: chart.client_id ? (clientMap.get(chart.client_id as string) ?? null) : null,
  }));

  return { rows, error: null };
}

export async function deleteHdChart(id: string): Promise<{ error: string | null }> {
  const tenantId = await getSyncedTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı tenant_id bulunamadı." };

  const { error } = await supabase
    .from("human_design_charts")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}
