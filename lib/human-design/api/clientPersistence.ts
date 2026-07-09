// Sprint-3 — human_design_clients güvenli kalıcılığı (server-only, service_role).
//
// Tüm işlemler:
//   • tenant_id + user_id YALNIZ guard'dan gelir (route katmanı verir); body'den GÜVENİLMEZ.
//   • Yazma alanları allow-list ile süzülür (tenant_id/user_id/id/zaman override edilemez).
//   • DELETE tenant-scoped cascade: önce raporlar, sonra haritalar, sonra danışan.
// HD engine/compute/BodyGraph matematiğine DOKUNMAZ — yalnız human_design_clients CRUD.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HumanDesignClient,
  HumanDesignClientInsert,
} from "@/lib/human-design/types";

const TABLE = "human_design_clients";

// Client'tan kabul edilecek alanlar (geri kalan her şey — tenant_id/user_id/id/created_at — yok sayılır).
export type HdClientEditable = Partial<Omit<HumanDesignClientInsert, "tenant_id" | "user_id">>;

const EDITABLE_KEYS: (keyof HumanDesignClient)[] = [
  "name",
  "birth_date",
  "birth_time",
  "birth_place",
  "chart_image_url",
  "external_chart_url",
  "notes",
];

function pick(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE_KEYS) if (k in input) out[k] = input[k];
  return out;
}

export async function listHdClients(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ rows: HumanDesignClient[]; error: string | null }> {
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as HumanDesignClient[], error: null };
}

export async function getHdClient(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ row: HumanDesignClient | null; error: string | null }> {
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: (data as HumanDesignClient | null) ?? null, error: null };
}

export async function insertHdClient(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  input: Record<string, unknown>,
): Promise<{ id: string | null; error: string | null }> {
  const name = String(input.name ?? "").trim();
  if (!name) return { id: null, error: "İsim alanı zorunludur." };

  const payload = {
    ...pick(input),
    name,
    tenant_id: tenantId,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from(TABLE).insert(payload).select("id").single();
  if (error || !data) {
    return { id: null, error: error?.message ?? "Kayıt oluşturulamadı." };
  }
  return { id: (data as { id: string }).id, error: null };
}

export async function updateHdClient(
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

export async function deleteHdClient(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  // false-success koruması + tenant-scoped cascade (mevcut hdClients davranışıyla birebir).
  // 1) Bağlı raporlar
  const { error: repErr } = await db
    .from("human_design_reports")
    .delete()
    .eq("client_id", id)
    .eq("tenant_id", tenantId);
  if (repErr) return { ok: false, error: `Raporlar silinemedi: ${repErr.message}` };

  // 2) Bağlı haritalar
  const { error: chErr } = await db
    .from("human_design_charts")
    .delete()
    .eq("client_id", id)
    .eq("tenant_id", tenantId);
  if (chErr) return { ok: false, error: `Harita silinemedi: ${chErr.message}` };

  // 3) Danışanın kendisi
  const { data, error } = await db
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Danışan bulunamadı veya bu tenant'a ait değil." };
  }
  return { ok: true, error: null };
}
