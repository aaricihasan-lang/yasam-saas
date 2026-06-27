/**
 * dogaltasInventoryApi.ts — dogaltas_inventory (Ürün-Stok) güvenli server API istemcisi.
 *
 * Tarayıcı artık supabase.from("dogaltas_inventory") ÇAĞIRMAZ; tüm liste/ekle/
 * güncelle/sil erişimi /api/dogaltas/inventory güvenli route'undan gider.
 * tenant_id sunucuda oturumdan belirlenir; istemciden gönderilmez.
 * Auth: dogaltasApi deseni — x-user-id + x-session-token.
 */
import { dogaltasApiGet, dogaltasApiSend } from "@/lib/dogaltas/dogaltasApi";

export type InventoryApiRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  adet: number;
  dizi_icerik: number;
  dizi_price: number;
  adet_price: number;
  dizi_price_usd: number;
  dizi_price_eur: number;
  photos: string[];
  usd_rate: number;
  eur_rate: number;
  total_cost_try: number;
  unit_cost_try: number;
};

/** GET /api/dogaltas/inventory — bu tenant'ın tüm stok kayıtları (id dahil). */
export async function fetchInventoryRows(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const r = await dogaltasApiGet<{ rows?: Record<string, unknown>[] }>(
    "/api/dogaltas/inventory",
  );
  if (!r.ok) return { rows: [], error: r.error ?? "Okuma hatası" };
  return { rows: r.data?.rows ?? [], error: null };
}

/** POST /api/dogaltas/inventory — yeni stok kaydı ekler; oluşturulan id döner. */
export async function createInventoryRow(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend<{ id?: string }>(
    "/api/dogaltas/inventory",
    "POST",
    payload,
  );
  return { ok: r.ok, id: r.data?.id, error: r.error, demo: r.demo };
}

/** PATCH /api/dogaltas/inventory — body.id ile mevcut kaydı günceller. */
export async function updateInventoryRow(
  id: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend("/api/dogaltas/inventory", "PATCH", {
    ...fields,
    id,
  });
  return { ok: r.ok, error: r.error, demo: r.demo };
}

/** DELETE /api/dogaltas/inventory?id=… — kaydı siler. */
export async function deleteInventoryRow(
  id: string,
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend(
    `/api/dogaltas/inventory?id=${encodeURIComponent(id)}`,
    "DELETE",
  );
  return { ok: r.ok, error: r.error, demo: r.demo };
}
