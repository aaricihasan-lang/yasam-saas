/**
 * Veri Aktarım Merkezi — hedef uzman listesi (SAF; client + test).
 *
 * Final-A1: liste önceden tek istekle `pageSize=50` çekiliyordu (sayfalama yok → 51. uzman sessizce
 * görünmüyordu) ve ad/e-posta araması yoktu. Artık sunucu tarafı `/api/admin/users` sözleşmesi
 * (q = ad + e-posta Türkçe katlamalı arama, page/pageSize, total) kullanılır; arayüz "Daha fazla
 * yükle" ile kalanları ister. Filtre (role=expert, active=active, members görünümü) DEĞİŞMEDİ.
 */

export type TransferExpertOption = {
  id: string;
  fullName: string;
  email: string;
  tenantId: string | null;
};

/** Sunucu izinli en büyük sayfa boyutu (lib/admin/memberListQuery MEMBER_PAGE_SIZES). */
export const TRANSFER_EXPERT_PAGE_SIZE = 50;

/** Liste isteği adresi. Sıra sunucuda (ad A→Z) → sayfalar arası tutarlı; boş arama yazılmaz. */
export function transferExpertListUrl(query: string, page: number): string {
  const p = new URLSearchParams({
    role: "expert",
    active: "active",
    sort: "name_asc",
    pageSize: String(TRANSFER_EXPERT_PAGE_SIZE),
    page: String(Math.max(1, Math.trunc(page) || 1)),
  });
  const q = query.trim();
  if (q) p.set("q", q);
  return `/api/admin/users?${p.toString()}`;
}

/** API satırları → seçenek. Yalnız role=expert; kimliksiz satır atılır. */
export function mapTransferExpertRows(rows: unknown): TransferExpertOption[] {
  if (!Array.isArray(rows)) return [];
  const out: TransferExpertOption[] = [];
  for (const row of rows) {
    const r = (row ?? {}) as Record<string, unknown>;
    if (r.role !== "expert") continue;
    const id = String(r.id ?? "").trim();
    if (!id) continue;
    const fullName = String(r.full_name ?? r.name ?? "").trim();
    const email = String(r.email ?? "").trim();
    out.push({
      id,
      fullName: fullName || email || "İsimsiz uzman",
      email,
      tenantId: r.tenant_id != null ? String(r.tenant_id).trim() || null : null,
    });
  }
  return out;
}

/** Sonraki sayfa eklenir; aynı id iki kez gösterilmez (sayfa sınırında kayma olursa). */
export function mergeTransferExpertPages(
  prev: readonly TransferExpertOption[],
  next: readonly TransferExpertOption[],
): TransferExpertOption[] {
  const seen = new Set(prev.map((e) => e.id));
  return [...prev, ...next.filter((e) => !seen.has(e.id) && seen.add(e.id))];
}

/** Sunucu toplamına göre kalan uzman sayısı (0 → "Daha fazla" yok). */
export function remainingTransferExperts(loaded: number, total: number): number {
  return Math.max(0, Math.trunc(total) - loaded);
}
