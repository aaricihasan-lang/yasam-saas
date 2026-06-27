/**
 * soapCreamInventoryApi.ts — soap_cream_inventory güvenli server API istemcisi.
 *
 * Tarayıcı supabase.from("soap_cream_inventory") ÇAĞIRMAZ; tüm liste/ekle/
 * güncelle/sil erişimi /api/urun-stok/sabun-krem güvenli route'undan gider.
 * tenant_id sunucuda oturumdan belirlenir; istemciden gönderilmez.
 * Auth: dogaltasApi deseni — x-user-id + x-session-token.
 */
import { dogaltasApiGet, dogaltasApiSend } from "@/lib/dogaltas/dogaltasApi";

const SOAP_CREAM_PATH = "/api/urun-stok/sabun-krem";

/** GET — bu tenant'ın tüm sabun/krem stok kayıtları (id + client_id dahil). */
export async function fetchSoapCreamInventoryRows(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const r = await dogaltasApiGet<{ rows?: Record<string, unknown>[] }>(SOAP_CREAM_PATH);
  if (!r.ok) return { rows: [], error: r.error ?? "Okuma hatası" };
  return { rows: r.data?.rows ?? [], error: null };
}

/** POST — yeni sabun/krem stok kaydı ekler; oluşturulan id döner. */
export async function createSoapCreamInventoryRow(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend<{ id?: string }>(SOAP_CREAM_PATH, "POST", payload);
  return { ok: r.ok, id: r.data?.id, error: r.error, demo: r.demo };
}

/** PATCH — body.id ile mevcut kaydı günceller. */
export async function updateSoapCreamInventoryRow(
  id: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend(SOAP_CREAM_PATH, "PATCH", { ...fields, id });
  return { ok: r.ok, error: r.error, demo: r.demo };
}

/** DELETE ?id=… — kaydı siler. */
export async function deleteSoapCreamInventoryRow(
  id: string,
): Promise<{ ok: boolean; error?: string; demo?: boolean }> {
  const r = await dogaltasApiSend(
    `${SOAP_CREAM_PATH}?id=${encodeURIComponent(id)}`,
    "DELETE",
  );
  return { ok: r.ok, error: r.error, demo: r.demo };
}
