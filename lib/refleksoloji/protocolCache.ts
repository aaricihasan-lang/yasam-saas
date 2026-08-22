/**
 * Refleksoloji protokol listesi için oturum-içi (modül seviyesi) hafif cache.
 *
 * Amaç: Kayıtlı Protokoller listesinden detaya geçildiğinde, kayıt zaten listede
 * tam olarak çekilmişse ("/api/refleksoloji/protocols" → select("*")) detay
 * sayfasını ANINDA seed'lemek; tam kayıt arka planda tazelenir
 * (stale-while-revalidate). Tam ekran "Yükleniyor…" beklemesi atlanır.
 *
 * Kapsam: yalnızca SPA gezinmesi boyunca yaşar (sayfa tam yeniden yüklenince
 * sıfırlanır). Veri kalıcı değildir; salt hız amaçlıdır. Kaynak-of-truth hâlâ
 * sunucudur — seed yalnız ilk boyayı hızlandırır.
 */
import type { ReflexologyProtocolRecord } from "@/app/refleksoloji/kayitli-protokoller/types";

let cachedProtocols: ReflexologyProtocolRecord[] = [];

/** Liste yüklendiğinde çağrılır — sonraki detay geçişlerini seed'lemek için. */
export function setProtocolCache(rows: ReflexologyProtocolRecord[]): void {
  cachedProtocols = Array.isArray(rows) ? rows : [];
}

/**
 * id ile daha önce yüklenmiş liste kayıtlarından protokolü bulur (salt-okuma).
 * Bulunamazsa undefined → detay normal spinner ile yüklenir.
 */
export function findProtocolInCache(id: string): ReflexologyProtocolRecord | undefined {
  const target = id.trim();
  if (!target) return undefined;
  return cachedProtocols.find((p) => String(p?.id ?? "").trim() === target);
}
