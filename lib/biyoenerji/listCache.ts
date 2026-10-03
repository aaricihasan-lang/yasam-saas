/**
 * Biyoenerji liste sayfaları için oturum-içi (modül seviyesi) hafif cache.
 *
 * Amaç: Detaydan listeye geri dönüldüğünde önceki liste state'ini ANINDA
 * göstermek (stale-while-revalidate); arka planda taze veri çekilip güncellenir.
 *
 * Kapsam: yalnızca SPA gezinmesi boyunca yaşar (sayfa tam yeniden yüklenince
 * sıfırlanır). Veri yazılmaz, kalıcı değildir; salt hız amaçlıdır.
 */
import { readYasamUser } from "@/lib/auth/yasamUser";
import { registerLogoutCleanup } from "@/lib/auth/logoutCleanup";

export type BioListCacheEntry = {
  rows: unknown[];
  total: number;
  searchCount: number;
  lastCreatedAt: string | null;
  categories: string[] | null;
};

/**
 * BIO-02 — cache KULLANICI + TENANT kapsamlıdır. Her girdi sahibinin kimliğiyle
 * saklanır; okunurken o anki oturum sahibiyle eşleşmeyen girdi DÖNMEZ (aynı sekmede
 * çıkış → başka hesapla giriş senaryosunda önceki hesabın verisi hiçbir karede
 * görünmez). Ek olarak çıkışta tüm cache temizlenir (registerLogoutCleanup).
 */
type StoredEntry = BioListCacheEntry & { owner: string };
const store = new Map<string, StoredEntry>();

/**
 * A7 — oturum dönemi (epoch): her çıkışta artar. Çıkıştan ÖNCE başlamış bir isteğin
 * geç dönen yanıtı, bilet (ticket) dönemi eşleşmediği için hiçbir state/cache'e yazamaz.
 */
let authEpoch = 0;
export function getBioAuthEpoch(): number {
  return authEpoch;
}

/** İsteğin başladığı andaki sahip + dönem. Yazma anında yeniden doğrulanır. */
export type BioOwnerTicket = { owner: string | null; epoch: number };

export function currentBioOwnerTicket(): BioOwnerTicket {
  return { owner: currentOwner(), epoch: authEpoch };
}

export function isBioOwnerTicketCurrent(t: BioOwnerTicket): boolean {
  return t.owner !== null && t.owner === currentOwner() && t.epoch === authEpoch;
}

function currentOwner(): string | null {
  const u = readYasamUser();
  const id = String(u?.id ?? "").trim();
  const tenant = String(u?.tenant_id ?? "").trim();
  if (!id || !tenant) return null;
  return `${id}|${tenant}`;
}

/** Tüm Biyoenerji liste cache'ini temizler (çıkış / hesap değişimi) + dönemi ilerletir. */
export function clearBioListCache(): void {
  store.clear();
  authEpoch += 1;
}

registerLogoutCleanup(clearBioListCache);

/** Listeyi belirleyen parametrelerden kararlı cache anahtarı üretir. */
export function bioListKey(
  resource: string,
  p: { search?: string; category?: string; offset?: number; limit?: number } = {},
): string {
  return [
    resource,
    `s=${(p.search ?? "").trim().toLocaleLowerCase("tr-TR")}`,
    `c=${(p.category ?? "").trim()}`,
    `o=${p.offset ?? 0}`,
    `l=${p.limit ?? ""}`,
  ].join("|");
}

export function bioListGet(key: string): BioListCacheEntry | undefined {
  const owner = currentOwner();
  const hit = store.get(key);
  if (!hit || !owner || hit.owner !== owner) return undefined;
  return hit;
}

export function bioListSet(key: string, entry: BioListCacheEntry, ticket?: BioOwnerTicket): void {
  const owner = currentOwner();
  if (!owner) return; // oturumsuz cache yazılmaz
  // A7 — istek başka bir sahip/dönemde başladıysa (çıkış → başka hesapla giriş) YAZILMAZ.
  if (ticket && (ticket.owner !== owner || ticket.epoch !== authEpoch)) return;
  store.set(key, { ...entry, owner });
}

/**
 * Bir kaydı (id ile) daha önce yüklenmiş liste sayfalarından bulur.
 *
 * Amaç: Listeden detaya geçişte "Kayıt yükleniyor…" boş ekranını atlamak —
 * kayıt zaten listede taze çekilmişse detay ANINDA gösterilir; arka planda
 * tam kayıt yeniden çekilip güncellenir (stale-while-revalidate).
 *
 * Not: Anahtar `resource|...` biçiminde olduğundan yalnız ilgili kaynağın
 * girdileri taranır. Salt-okuma; veri yazılmaz.
 */
export function bioListFindRow(
  resource: string,
  id: string,
): Record<string, unknown> | undefined {
  const target = id.trim();
  if (!target) return undefined;
  const owner = currentOwner();
  if (!owner) return undefined;
  const prefix = `${resource}|`;
  for (const [key, entry] of store) {
    if (key !== resource && !key.startsWith(prefix)) continue;
    if (entry.owner !== owner) continue;
    for (const raw of entry.rows) {
      const row = raw as { id?: unknown };
      if (String(row?.id ?? "").trim() === target) {
        return raw as Record<string, unknown>;
      }
    }
  }
  return undefined;
}
