import { supabase } from "@/lib/supabase";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import type {
  HumanDesignClient,
  HumanDesignClientInsert,
} from "@/lib/human-design/types";

const TABLE = "human_design_clients";

export type HdClientRow = HumanDesignClient;

async function resolveTenantId(): Promise<string | null> {
  return getSyncedTenantId();
}

export async function listHdClients(): Promise<{
  rows: HdClientRow[];
  error: string | null;
}> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return { rows: [], error: "Aktif kullanıcı tenant_id bulunamadı." };

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as HdClientRow[], error: null };
}

export async function insertHdClient(
  input: Omit<HumanDesignClientInsert, "tenant_id" | "user_id">,
): Promise<{ id: string | null; error: string | null }> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return { id: null, error: "Aktif kullanıcı tenant_id bulunamadı." };

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...input, tenant_id: tenantId, updated_at: new Date().toISOString() })
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };
  return { id: (data as { id: string }).id, error: null };
}

export async function updateHdClient(
  id: string,
  input: Partial<Omit<HumanDesignClientInsert, "tenant_id" | "user_id">>,
): Promise<{ error: string | null }> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı tenant_id bulunamadı." };

  const { error } = await supabase
    .from(TABLE)
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}

export async function getHdClient(
  id: string,
): Promise<{ row: HdClientRow | null; error: string | null }> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return { row: null, error: "Aktif kullanıcı tenant_id bulunamadı." };

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (error) return { row: null, error: error.message };
  return { row: data as HdClientRow, error: null };
}

export async function deleteHdClient(
  id: string,
): Promise<{ error: string | null }> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı tenant_id bulunamadı." };

  // 1. Bağlı raporları sil
  const { error: reportsErr } = await supabase
    .from("human_design_reports")
    .delete()
    .eq("client_id", id)
    .eq("tenant_id", tenantId);
  if (reportsErr) return { error: `Raporlar silinemedi: ${reportsErr.message}` };

  // 2. Bağlı haritayı sil
  const { error: chartsErr } = await supabase
    .from("human_design_charts")
    .delete()
    .eq("client_id", id)
    .eq("tenant_id", tenantId);
  if (chartsErr) return { error: `Harita silinemedi: ${chartsErr.message}` };

  // 3. Danışanı sil
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}
