/**
 * Ürün & Stok "Kaydet" denemesi — SAF (pure) karar yardımcıları.
 *
 * Sorun: kayıt önce cihaza (localStorage) yazılır, sonra buluta (Supabase upsert,
 * UNIQUE(tenant_id, client_id)). Bulut yazımı başarısız olunca form temizlenmez ve
 * kullanıcı "tekrar dener". Eski davranışta her tık yeni bir yerel id üretiyor ve
 * "ekle" (delta) modunda miktarı İKİNCİ kez ekliyordu → çift kayıt / şişmiş stok.
 *
 * Kural:
 *  - Aynı form (aynı imza) tekrar gönderilirse yerel birleştirme TEKRARLANMAZ; aynı
 *    yerel kayıt (aynı id = aynı client_id) yalnız buluta yeniden yazılır.
 *  - Form değişmiş ama önceki deneme YENİ bir kayıttı → aynı kayıt (aynı id) mutlak
 *    değerlerle güncellenir (yeni id üretilmez, miktar iki kez eklenmez).
 *  - Aksi halde normal birleştirme (düzenleme id'si veya yeni kayıt).
 */

export type StockRetryState = {
  /** Başarısız denemedeki form imzası. */
  signature: string;
  /** Yerelde yazılmış hedef kaydın kimliği (id ya da doğaltaşta ad|tür anahtarı). */
  targetId: string;
  /** Deneme yeni kayıt mıydı? */
  isNew: boolean;
};

export type StockSavePlan =
  /** Yerel birleştirme yapma; aynı hedefi yalnız buluta yeniden yaz. */
  | { kind: "retry-cloud"; targetId: string }
  /** Yerel birleştirme yap. `id` verilirse o kayıt güncellenir; `forceAbsolute` → delta modu kapalı. */
  | { kind: "merge"; id: string | undefined; forceAbsolute: boolean };

/** Form alanlarından kararlı imza (sıra önemli; değerler JSON ile kodlanır). */
export function stockFormSignature(values: readonly unknown[]): string {
  return JSON.stringify(values);
}

export function planStockSave(
  pending: StockRetryState | null,
  signature: string,
  editingId: string | null,
  existingIds: ReadonlySet<string>,
): StockSavePlan {
  const pendingAlive = pending !== null && existingIds.has(pending.targetId);
  if (pendingAlive && pending!.signature === signature) {
    return { kind: "retry-cloud", targetId: pending!.targetId };
  }
  if (editingId) return { kind: "merge", id: editingId, forceAbsolute: false };
  if (pendingAlive && pending!.isNew) {
    return { kind: "merge", id: pending!.targetId, forceAbsolute: true };
  }
  return { kind: "merge", id: undefined, forceAbsolute: false };
}

/** Birleştirme sonrası hedef kaydı bulur: güncellenen id ya da yeni eklenen (önceden olmayan) kayıt. */
export function findSaveTarget<T extends { id: string }>(
  items: readonly T[],
  beforeIds: ReadonlySet<string>,
  mergedId: string | undefined,
): T | undefined {
  if (mergedId) return items.find((it) => it.id === mergedId);
  return items.find((it) => !beforeIds.has(it.id));
}

/** Aynı kayda yeniden yazarken zaten ekli fotoğrafları tekrar ekleme. */
export function newPhotosOnly(photos: readonly string[], existing: readonly string[] | undefined): string[] {
  if (!existing || existing.length === 0) return [...photos];
  const have = new Set(existing);
  return photos.filter((p) => !have.has(p));
}
