/**
 * Çakra detayındaki Doğaltaş eşleşmeleri için oturum-içi taş cache'i.
 *
 * Amaç: /api/dogaltas/stones?mode=extended çağrısını her çakra detay açılışında
 * tekrar etmemek. Kök → Boğaz → Kalp → Tepe gezerken tek fetch yeter.
 *
 * Güvenlik: cache TENANT bazlıdır; farklı tenant'a ait giriş yapılırsa anahtar
 * değişir ve eski veri DÖNMEZ (cross-tenant sızıntı yok). Fetch zaten sunucuda
 * auth + tenant binding ile korunur; bu cache yalnız hız amaçlıdır, veri yazmaz.
 *
 * Tazelik: kısa TTL (5 dk). Doğaltaş'a yeni taş eklenirse sayfa yenilenince
 * (modül cache'i sıfırlanır) veya TTL dolunca güncellenir.
 */
import type { ChakraMatchStone } from "@/lib/bioenergy/chakraStoneMatch";

const TTL_MS = 5 * 60 * 1000; // 5 dakika

let entry: { tenantId: string; stones: ChakraMatchStone[]; ts: number } | null = null;

/** Geçerli (aynı tenant, TTL içinde) cache varsa taşları döner; yoksa null. */
export function getCachedDogaltasStones(tenantId: string | null | undefined): ChakraMatchStone[] | null {
  if (!tenantId || !entry || entry.tenantId !== tenantId) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    entry = null;
    return null;
  }
  return entry.stones;
}

export function setCachedDogaltasStones(
  tenantId: string | null | undefined,
  stones: ChakraMatchStone[],
): void {
  if (!tenantId) return;
  entry = { tenantId, stones, ts: Date.now() };
}

/** Güvenlik için elle temizleme (ör. logout). */
export function clearDogaltasStoneCache(): void {
  entry = null;
}
