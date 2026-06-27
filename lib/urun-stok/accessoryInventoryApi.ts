/**
 * accessoryInventoryApi.ts — accessory_inventory güvenli server API istemcisi.
 *
 * Tarayıcı supabase.from("accessory_inventory") ÇAĞIRMAZ; tüm liste/ekle/
 * güncelle/sil erişimi /api/urun-stok/aksesuar güvenli route'undan gider.
 * tenant_id sunucuda oturumdan belirlenir; istemciden gönderilmez.
 * Auth: dogaltasApi deseni — x-user-id + x-session-token.
 */
import { dogaltasApiGet, dogaltasApiSend } from "@/lib/dogaltas/dogaltasApi";

const ACCESSORY_PATH = "/api/urun-stok/aksesuar";

/** GET — bu tenant'ın tüm aksesuar stok kayıtları (id + client_id dahil). */
export async function fetchAccessoryInventoryRows(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const r = await dogaltasApiGet<{ rows?: Record<string, unknown>[] }>(ACCESSORY_PATH);
  if (!r.ok) return { rows: [], error: r.error ?? "Okuma hatası" };
  return { rows: r.data?.rows ?? [], error: null };
}

/** POST — yeni aksesuar stok kaydı ekler; oluşturulan id döner. */
export async function createAccessoryInventoryRow(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend<{ id?: string }>(ACCESSORY_PATH, "POST", payload);
  return { ok: r.ok, id: r.data?.id, error: r.error, demo: r.demo };
}

/** PATCH — body.id ile mevcut kaydı günceller. */
export async function updateAccessoryInventoryRow(
  id: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend(ACCESSORY_PATH, "PATCH", { ...fields, id });
  return { ok: r.ok, error: r.error, demo: r.demo };
}

/** DELETE ?id=… — kaydı siler. */
export async function deleteAccessoryInventoryRow(
  id: string,
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend(
    `${ACCESSORY_PATH}?id=${encodeURIComponent(id)}`,
    "DELETE",
  );
  return { ok: r.ok, error: r.error, demo: r.demo };
}
