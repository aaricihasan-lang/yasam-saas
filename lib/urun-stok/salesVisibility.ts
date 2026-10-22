/**
 * salesVisibility.ts — Satış Geçmişi: "Satışı İptal Et" ile "Listeden Sil" ayrımı (owner kararı 21.10.2026).
 *
 *   SATIŞI İPTAL ET  = mevcut atomik iptal RPC'si → stok iadesi (yalnız henüz iptal edilmemiş satışlar).
 *   LİSTEDEN SİL     = yalnız görünürlük (inventory_sales.hidden_at) → stok / durum / tutar DEĞİŞMEZ.
 *
 * Saf yardımcılar (istemci + sunucu) — test edilebilir; ağ/DB erişimi yok.
 */

/** Migration (hidden_at / hidden_by) henüz uygulanmamışsa PostgREST'in döndürdüğü hata mı? */
export function isMissingVisibilityColumn(err: unknown): boolean {
  const e = (err ?? {}) as { code?: string; message?: string };
  const code = String(e.code ?? "");
  const msg = String(e.message ?? "");
  return (code === "42703" || code === "PGRST204") && /hidden_(at|by)/.test(msg);
}

/** Satış Geçmişi satırının işlem için gereken asgari alanları. */
export type HistoryRecordLike = {
  name: string;
  timestamp: string;
  total_cost: number;
  sale_price: number;
  saleId?: string;
  status?: "completed" | "cancelled";
  hiddenAt?: string | null;
  /** Aynı satışta BU kategori dışındaki kalem sayısı (çok kategorili merkezî satış). */
  otherCategoryItems?: number;
};

export const isCancelled = (r: HistoryRecordLike) => r.status === "cancelled";
export const isHidden = (r: HistoryRecordLike) => Boolean(r.hiddenAt);

/**
 * Gerçek (net) finansal toplamlar: YALNIZ tamamlanmış satışlar; listeden silinmiş olsalar da
 * DAHİL (gizleme finansal anlamı değiştirmez); iptal edilenler HARİÇ.
 */
export function netSalesSummary(records: readonly HistoryRecordLike[]) {
  let netSale = 0;
  let netCost = 0;
  let completed = 0;
  let cancelled = 0;
  let hidden = 0;
  for (const r of records) {
    if (isHidden(r)) hidden += 1;
    if (isCancelled(r)) { cancelled += 1; continue; }
    completed += 1;
    netSale += r.sale_price || 0;
    netCost += r.total_cost || 0;
  }
  return { netSale, netCost, netProfit: netSale - netCost, completed, cancelled, hidden };
}

export type EligibilityPlan<T> = { eligible: T[]; ineligible: { rec: T; reason: string }[] };

/** İptal: yalnız henüz iptal edilmemiş satışlar. Demo'da (saleId yok) yerel kayıt uygundur. */
export function planCancel<T extends HistoryRecordLike>(selected: readonly T[], isDemo: boolean): EligibilityPlan<T> {
  const plan: EligibilityPlan<T> = { eligible: [], ineligible: [] };
  for (const r of selected) {
    if (isCancelled(r)) plan.ineligible.push({ rec: r, reason: "zaten iptal edilmiş" });
    else if (!isDemo && !r.saleId) plan.ineligible.push({ rec: r, reason: "satış kimliği yok" });
    else plan.eligible.push(r);
  }
  return plan;
}

/** Listeden sil: aktif veya iptal edilmiş, henüz listede olan satışlar. */
export function planHide<T extends HistoryRecordLike>(selected: readonly T[], isDemo: boolean): EligibilityPlan<T> {
  const plan: EligibilityPlan<T> = { eligible: [], ineligible: [] };
  for (const r of selected) {
    if (isHidden(r)) plan.ineligible.push({ rec: r, reason: "zaten listeden silinmiş" });
    else if (!isDemo && !r.saleId) plan.ineligible.push({ rec: r, reason: "satış kimliği yok" });
    else plan.eligible.push(r);
  }
  return plan;
}

/** Listeye geri al: yalnız listeden silinmiş satışlar. */
export function planUnhide<T extends HistoryRecordLike>(selected: readonly T[]): EligibilityPlan<T> {
  const plan: EligibilityPlan<T> = { eligible: [], ineligible: [] };
  for (const r of selected) {
    if (!isHidden(r) || !r.saleId) plan.ineligible.push({ rec: r, reason: "listede zaten görünüyor" });
    else plan.eligible.push(r);
  }
  return plan;
}

export const recordLabel = (r: HistoryRecordLike) => `${r.name || "Satış"} (${r.timestamp})`;

export const CANCEL_CONFIRM_MESSAGE =
  "Seçilen satışlar iptal edilecek. Stokta hâlâ bulunan ilgili ürünlerin satılan miktarları geri eklenecek. İşlemi onaylıyor musunuz?";
export const HIDE_CONFIRM_MESSAGE =
  "Seçilen satışlar görünür listeden kaldırılacak. Stok miktarları değişmeyecek ve satışlar iptal edilmeyecek. İşlemi onaylıyor musunuz?";
export const UNHIDE_CONFIRM_MESSAGE =
  "Seçilen satışlar yeniden görünür listeye alınacak. Stok miktarları ve satış durumu değişmeyecek. İşlemi onaylıyor musunuz?";

/** Onay penceresi için ek notlar (uygun olmayanlar + çok kategorili satış uyarısı). */
export function confirmNotes<T extends HistoryRecordLike>(plan: EligibilityPlan<T>): string {
  const notes: string[] = [];
  const multi = plan.eligible.filter((r) => (r.otherCategoryItems ?? 0) > 0).length;
  if (multi > 0) {
    notes.push(
      `Not: Seçilen satışlardan ${multi} tanesi başka kategorilerden ürün de içeriyor; işlem satışın TAMAMINA (tüm kategorilerdeki kalemlerine) uygulanır.`,
    );
  }
  if (plan.ineligible.length > 0) {
    notes.push(
      `İşleme alınmayacak ${plan.ineligible.length} kayıt: ` +
        plan.ineligible.slice(0, 5).map((x) => `${recordLabel(x.rec)} — ${x.reason}`).join("; ") +
        (plan.ineligible.length > 5 ? ` ve ${plan.ineligible.length - 5} kayıt daha` : "") + ".",
    );
  }
  return notes.join("\n\n");
}

/** Görünürlük işlemi sonucunun kullanıcı mesajı. */
export function describeVisibilityOutcome(
  action: "hide" | "unhide",
  r: { ok: boolean; changed?: number; unchanged?: number; notFound?: number; error?: string },
  skipped: number,
): string {
  if (!r.ok) return r.error || "İşlem tamamlanamadı.";
  const parts: string[] = [];
  const n = r.changed ?? 0;
  if (n > 0) {
    parts.push(action === "hide"
      ? `${n} satış görünür listeden kaldırıldı. Stok ve satış durumu değişmedi; finansal toplamlar korunur.`
      : `${n} satış yeniden listeye alındı. Stok ve satış durumu değişmedi.`);
  }
  const already = (r.unchanged ?? 0) + skipped;
  if (already > 0) parts.push(`${already} kayıt zaten bu durumdaydı; değişiklik yapılmadı.`);
  if ((r.notFound ?? 0) > 0) parts.push(`${r.notFound} satış bulunamadı.`);
  return parts.join(" ") || "Değişiklik yapılmadı.";
}
