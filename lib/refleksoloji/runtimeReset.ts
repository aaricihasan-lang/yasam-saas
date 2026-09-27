/**
 * Refleksoloji çalışma-zamanı sıfırlama (FA-04 / DL-008).
 *
 * Modül seviyesindeki durumlar (not/atlas senkron zamanlayıcıları, bekleyen PUT'lar,
 * sunucu sürüm belirteçleri, protokol önbelleği, senkron rozeti) çıkışta
 * sıfırlanmıyordu → aynı sekmede giriş yapan ikinci kullanıcı ilkinin durumunu
 * devralabiliyordu.
 *
 * Senkron modülleri kendi sıfırlayıcılarını buraya KAYDEDER (import döngüsü yok:
 * bu dosya yasamUser / notesSync / atlasSync import ETMEZ). `clearYasamUser`
 * çıkışta `handleReflexologyLogout` çağırır.
 */

import { clearProtocolCache } from "./protocolCache";
import { resetReflexologySyncStatus } from "./syncStatus";
import {
  browserStore,
  clearReflexMemoryFallback,
  clearScopedReflexCache,
  resolveReflexScope,
  type KeyValueStore,
  type ReflexUserLike,
} from "./scopedStorage";

const resetters = new Set<() => void>();

/** Senkron modülü modül-seviyesi durumunu sıfırlayan fonksiyonu kaydeder. */
export function registerReflexologyRuntimeReset(fn: () => void): void {
  resetters.add(fn);
}

/** Tüm refleksoloji modül durumlarını sıfırlar (zamanlayıcılar, bekleyenler, önbellek). */
export function resetReflexologyRuntime(): void {
  for (const fn of resetters) {
    try {
      fn();
    } catch {
      /* bir sıfırlayıcının hatası diğerlerini engellemesin */
    }
  }
  clearProtocolCache();
  resetReflexologySyncStatus();
  clearReflexMemoryFallback();
}

/**
 * Çıkış kancası: runtime sıfırla + çıkan kullanıcının v2 önbelleğini temizle.
 *   - Demo hesap → kapsam verisi koşulsuz temizlenir (oturumluk veri).
 *   - Gerçek uzman → YALNIZ bekleyen iş yoksa (outbox boş, kirli not/protokol yok,
 *     atlas sunucuyla aynı). Bekleyen iş varsa veri o kullanıcının kapsamında KALIR
 *     (başka kullanıcı göremez; aynı kullanıcı dönünce senkron sürer).
 * Eski (v1) anahtarlara ve karantinaya DOKUNMAZ.
 */
export function handleReflexologyLogout(
  user: ReflexUserLike,
  kv?: KeyValueStore | null,
): { cleared: boolean } {
  resetReflexologyRuntime();
  const scope = resolveReflexScope(user);
  if (!scope) return { cleared: false };
  const store = kv ?? browserStore();
  if (!store) return { cleared: false };
  const isDemo = !!user && (user as { is_demo_account?: unknown }).is_demo_account === true;
  return { cleared: clearScopedReflexCache(scope, store, { force: isDemo }).cleared };
}
