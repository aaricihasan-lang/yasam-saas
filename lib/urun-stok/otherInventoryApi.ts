/**
 * otherInventoryApi.ts — other_inventory (Diğer Ürünler) güvenli server API istemcisi.
 *
 * Tarayıcı supabase.from("other_inventory") ÇAĞIRMAZ; tüm liste/ekle/güncelle/
 * sil erişimi /api/urun-stok/diger güvenli route'undan gider. tenant_id sunucuda
 * oturumdan belirlenir; istemciden gönderilmez.
 * Auth: dogaltasApi deseni — x-user-id + x-session-token.
 */
import { dogaltasApiGet, dogaltasApiSend } from "@/lib/dogaltas/dogaltasApi";

const OTHER_PATH = "/api/urun-stok/diger";

/** GET — bu tenant'ın tüm "diğer ürün" stok kayıtları (id + client_id dahil). */
export async function fetchOtherInventoryRows(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const r = await dogaltasApiGet<{ rows?: Record<string, unknown>[] }>(OTHER_PATH);
  if (!r.ok) return { rows: [], error: r.error ?? "Okuma hatası" };
  return { rows: r.data?.rows ?? [], error: null };
}

/** POST — yeni "diğer ürün" stok kaydı ekler; oluşturulan id döner. */
export async function createOtherInventoryRow(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend<{ id?: string }>(OTHER_PATH, "POST", payload);
  return { ok: r.ok, id: r.data?.id, error: r.error, demo: r.demo };
}

/** PATCH — body.id ile mevcut kaydı günceller. */
export async function updateOtherInventoryRow(
  id: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend(OTHER_PATH, "PATCH", { ...fields, id });
  return { ok: r.ok, error: r.error, demo: r.demo };
}

/** DELETE ?id=… — kaydı siler. */
export async function deleteOtherInventoryRow(
  id: string,
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend(
    `${OTHER_PATH}?id=${encodeURIComponent(id)}`,
    "DELETE",
  );
  return { ok: r.ok, error: r.error, demo: r.demo };
}
