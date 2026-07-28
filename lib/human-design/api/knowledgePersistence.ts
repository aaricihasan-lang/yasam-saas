// Sprint-4 Aşama-1 — human_design_knowledge_records güvenli kalıcılığı (server-only, service_role).
//
// Tüm işlemler:
//   • tenant_id + user_id YALNIZ guard'dan gelir (route katmanı verir); body'den GÜVENİLMEZ.
//   • Yazma alanları allow-list ile süzülür (tenant_id/user_id/id/zaman override edilemez).
//   • Tüm sorgu/insert/update/delete tenant-scoped.
// HD engine/compute/BodyGraph matematiğine DOKUNMAZ — yalnız knowledge_records CRUD.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HumanDesignKnowledgeRecord,
  HumanDesignKnowledgeRecordInsert,
} from "@/lib/human-design/types";

const TABLE = "human_design_knowledge_records";

export type HdKnowledgeEditable = Partial<
  Omit<HumanDesignKnowledgeRecordInsert, "tenant_id" | "user_id">
>;

// client'tan kabul edilen alanlar (tenant_id/user_id/id/created_at yok sayılır).
const EDITABLE_KEYS: (keyof HumanDesignKnowledgeRecord)[] = [
  "category",
  "title",
  "code",
  "content",
  "keywords",
  "related_gates",
  "related_channels",
  "related_centers",
  "tags",
  "sort_order",
  "is_active",
  "expert_notes",
];

function pick(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE_KEYS) if (k in input) out[k] = input[k];
  return out;
}

export async function listKnowledge(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ rows: HumanDesignKnowledgeRecord[]; error: string | null }> {
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as HumanDesignKnowledgeRecord[], error: null };
}

export async function listKnowledgeByCodes(
  db: SupabaseClient,
  tenantId: string,
  codes: string[],
): Promise<{ rows: HumanDesignKnowledgeRecord[]; error: string | null }> {
  if (codes.length === 0) return { rows: [], error: null };
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("code", codes)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as HumanDesignKnowledgeRecord[], error: null };
}

export async function insertKnowledge(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  input: Record<string, unknown>,
): Promise<{ id: string | null; error: string | null }> {
  const payload = {
    ...pick(input),
    tenant_id: tenantId,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from(TABLE).insert(payload).select("id").single();
  if (error || !data) return { id: null, error: error?.message ?? "Kayıt oluşturulamadı." };
  return { id: (data as { id: string }).id, error: null };
}

export async function updateKnowledge(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  const fields = { ...pick(input), updated_at: new Date().toISOString() };
  const { data, error } = await db
    .from(TABLE)
    .update(fields)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil." };
  }
  return { ok: true, error: null };
}

export async function deleteKnowledge(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await db
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  return { ok: !error, error: error?.message ?? null };
}

export async function deleteKnowledgeBulk(
  db: SupabaseClient,
  tenantId: string,
  ids: string[],
): Promise<{ ok: boolean; error: string | null }> {
  if (ids.length === 0) return { ok: true, error: null };
  const { error } = await db
    .from(TABLE)
    .delete()
    .in("id", ids)
    .eq("tenant_id", tenantId);
  return { ok: !error, error: error?.message ?? null };
}
