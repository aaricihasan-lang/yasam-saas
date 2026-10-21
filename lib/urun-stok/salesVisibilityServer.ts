/**
 * salesVisibilityServer.ts — "Listeden Sil" / "Listeye geri al" sunucu çekirdeği (yalnız sunucu).
 *
 *  - YALNIZ inventory_sales.hidden_at / hidden_by değişir. inventory_sale_cancel_atomic ÇAĞRILMAZ;
 *    stok, satış durumu (status), tutarlar ve inventory_sale_items DEĞİŞMEZ. Kayıt silinmez.
 *  - Satış bir bütündür (tek sale_id) — çok kategorili satışta kalem bazında kısmi işlem yok.
 *  - Her sorgu tenant filtreli; başka tenant'ın kimliği "bulunamadı" sayılır.
 *  - Koşullu UPDATE (hide: hidden_at IS NULL; unhide: IS NOT NULL) → tekrar / eşzamanlı istek zararsız,
 *    ilk gizleme anı korunur.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingVisibilityColumn } from "@/lib/urun-stok/salesVisibility";

export type VisibilityAction = "hide" | "unhide";
export type VisibilityResult =
  | { ok: true; requested: number; changed: number; unchanged: number; notFound: number }
  | { ok: false; unavailable: boolean; error: unknown };

export async function applySalesVisibility(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  ids: readonly string[],
  action: VisibilityAction,
): Promise<VisibilityResult> {
  const { data: found, error: readErr } = await db
    .from("inventory_sales").select("id, hidden_at")
    .eq("tenant_id", tenantId).in("id", [...ids]);
  if (readErr) return { ok: false, unavailable: isMissingVisibilityColumn(readErr), error: readErr };

  const rows = (found ?? []) as unknown as Array<{ id: string; hidden_at: string | null }>;
  const foundIds = new Set(rows.map((r) => r.id));
  const notFound = ids.filter((id) => !foundIds.has(id)).length;
  const targets = rows
    .filter((r) => (action === "hide" ? r.hidden_at === null : r.hidden_at !== null))
    .map((r) => r.id);

  let changed = 0;
  if (targets.length > 0) {
    let uq = db.from("inventory_sales")
      .update(action === "hide"
        ? { hidden_at: new Date().toISOString(), hidden_by: userId }
        : { hidden_at: null, hidden_by: null })
      .eq("tenant_id", tenantId).in("id", targets);
    uq = action === "hide" ? uq.is("hidden_at", null) : uq.not("hidden_at", "is", null);
    const { data: upd, error: updErr } = await uq.select("id");
    if (updErr) return { ok: false, unavailable: isMissingVisibilityColumn(updErr), error: updErr };
    changed = (upd ?? []).length;
  }
  return { ok: true, requested: ids.length, changed, unchanged: rows.length - changed, notFound };
}
