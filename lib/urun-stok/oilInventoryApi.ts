/**
 * oilInventoryApi.ts — oil_inventory (Yağ ürün/stok) güvenli server API istemcisi.
 *
 * Tarayıcı supabase.from("oil_inventory") ÇAĞIRMAZ; tüm liste/ekle/güncelle/sil
 * erişimi /api/urun-stok/yag güvenli route'undan gider. tenant_id sunucuda
 * oturumdan belirlenir; istemciden gönderilmez.
 * Auth: dogaltasApi deseni — x-user-id + x-session-token.
 */
import { dogaltasApiGet, dogaltasApiSend } from "@/lib/dogaltas/dogaltasApi";

const OIL_INVENTORY_PATH = "/api/urun-stok/yag";

/** GET — bu tenant'ın tüm yağ stok kayıtları (id + client_id dahil). */
export async function fetchOilInventoryRows(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const r = await dogaltasApiGet<{ rows?: Record<string, unknown>[] }>(OIL_INVENTORY_PATH);
  if (!r.ok) return { rows: [], error: r.error ?? "Okuma hatası" };
  return { rows: r.data?.rows ?? [], error: null };
}

/** POST — yeni yağ stok kaydı ekler; oluşturulan id döner. */
export async function createOilInventoryRow(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend<{ id?: string }>(OIL_INVENTORY_PATH, "POST", payload);
  return { ok: r.ok, id: r.data?.id, error: r.error, demo: r.demo };
}

/** PATCH — body.id ile mevcut kaydı günceller. */
export async function updateOilInventoryRow(
  id: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend(OIL_INVENTORY_PATH, "PATCH", { ...fields, id });
  return { ok: r.ok, error: r.error, demo: r.demo };
}

/** DELETE ?id=… — kaydı siler. */
export async function deleteOilInventoryRow(
  id: string,
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend(
    `${OIL_INVENTORY_PATH}?id=${encodeURIComponent(id)}`,
    "DELETE",
  );
  return { ok: r.ok, error: r.error, demo: r.demo };
}
