import { supabase } from "@/lib/supabase";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import type {
  HumanDesignKnowledgeRecord,
  HumanDesignKnowledgeRecordInsert,
} from "@/lib/human-design/types";

const TABLE = "human_design_knowledge_records";

export type HdKnowledgeRow = HumanDesignKnowledgeRecord;

async function resolveTenantId(): Promise<string | null> {
  return getSyncedTenantId();
}

export async function listHdKnowledgeRecords(): Promise<{
  rows: HdKnowledgeRow[];
  error: string | null;
}> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return { rows: [], error: "Aktif kullanıcı tenant_id bulunamadı." };

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as HdKnowledgeRow[], error: null };
}

export async function insertHdKnowledgeRecord(
  input: Omit<HumanDesignKnowledgeRecordInsert, "tenant_id" | "user_id">,
): Promise<{ id: string | null; error: string | null }> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return { id: null, error: "Aktif kullanıcı tenant_id bulunamadı." };

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      ...input,
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };
  return { id: (data as { id: string }).id, error: null };
}

export async function updateHdKnowledgeRecord(
  id: string,
  input: Partial<Omit<HumanDesignKnowledgeRecordInsert, "tenant_id" | "user_id">>,
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

export async function deleteHdKnowledgeRecord(
  id: string,
): Promise<{ error: string | null }> {
  const tenantId = await resolveTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı tenant_id bulunamadı." };

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}

export async function deleteHdKnowledgeRecords(
  ids: string[],
): Promise<{ error: string | null }> {
  if (ids.length === 0) return { error: null };
  const tenantId = await resolveTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı tenant_id bulunamadı." };

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .in("id", ids)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}
