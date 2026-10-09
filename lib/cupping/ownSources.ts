/**
 * Kupa protokol "Kaynak" alanı — YALNIZ uzmanın KENDİ yazdığı kaynak adları (WT6). SAF.
 *
 * Kurallar:
 *   - Hazır katalog / "önerilen kaynaklar" YOK: kaynak serbest yazılır; öneri yalnız kolaylıktır.
 *   - Öneri kaynağı: uzmanın kendi tenant'ındaki `cupping_sources` (sunucu zaten tenant'a bağlar;
 *     başka uzmanın kaynağı ASLA gelmez) — ve bunların içinden yalnız uzmanın KENDİ oluşturdukları:
 *     sistem sahibinden aktarılmış (admin transfer: origin_source_id / transferred_at dolu,
 *     origin_type='admin_transfer') kayıtlar öneride GÖSTERİLMEZ.
 *   - Aynı ad (Türkçe katlamalı) bir kez önerilir; yazılan metinle eşleşenler, başta eşleşenler önce.
 */

export type SourceLike = {
  id: string;
  source_name: string;
  origin_type?: string | null;
  origin_source_id?: string | null;
  transferred_at?: string | null;
};

export function normalizeSourceName(v: string): string {
  return v.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
}

/** Uzmanın KENDİ yazdığı kaynak mı? (aktarılmış / sistem kaynağı değil) */
export function isOwnSource(s: SourceLike): boolean {
  if (s.origin_source_id) return false;
  if (s.transferred_at) return false;
  if (s.origin_type === "admin_transfer") return false;
  return true;
}

/** Yazılan metne göre öneriler (en fazla `limit`). Boş sorgu → kendi kaynaklarının tamamı (alfabetik). */
export function ownSourceSuggestions(sources: readonly SourceLike[], query: string, limit = 8): string[] {
  const q = normalizeSourceName(query);
  const seen = new Set<string>();
  const starts: string[] = [];
  const contains: string[] = [];
  // Aynı ad (katlamalı) birden çok kayıtta varsa liste sırasındaki İLK yazım kullanılır; sonra alfabetik.
  const firstByKey = new Map<string, SourceLike>();
  for (const s of sources) {
    if (!isOwnSource(s)) continue;
    const k = normalizeSourceName(s.source_name);
    if (k && !firstByKey.has(k)) firstByKey.set(k, s);
  }
  const sorted = [...firstByKey.values()].sort((a, b) => a.source_name.localeCompare(b.source_name, "tr"));
  for (const s of sorted) {
    const name = s.source_name.trim();
    const key = normalizeSourceName(name);
    if (!key || seen.has(key)) continue;
    if (q && key === q) { seen.add(key); continue; } // tam yazılmış ad öneri olarak tekrar gösterilmez
    if (!q || key.startsWith(q)) { starts.push(name); seen.add(key); }
    else if (key.includes(q)) { contains.push(name); seen.add(key); }
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Yazılan ad, uzmanın KENDİ mevcut kaynağıyla aynı mı? (aynı master yeniden kullanılır, yeni oluşturulmaz) */
export function findOwnSourceByName<T extends SourceLike>(sources: readonly T[], name: string): T | null {
  const key = normalizeSourceName(name);
  if (!key) return null;
  return sources.find((s) => isOwnSource(s) && normalizeSourceName(s.source_name) === key) ?? null;
}
