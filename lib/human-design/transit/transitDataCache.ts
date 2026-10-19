// Human Design transit — KALICI PAYLAŞILAN ÖNBELLEK (Next.js Data Cache, unstable_cache; Cache Components kapalı projede
// desteklenen API). Yeni tablo / migration YOK. Vercel'de sunucu örnekleri ve yeniden başlatmalar arasında paylaşılır.
//
// YALNIZ kişisel olmayan, değişmeyen veri için: tek UTC anının gezegen boylamları (tenant'tan bağımsız). Kişisel transit
// sonuçları buraya YAZILMAZ. fn hata fırlatırsa unstable_cache saklamaz (başarısız yanıt önbelleğe girmez).
// Next çalışma ortamı dışında (tsx testleri) Data Cache yoktur → fn doğrudan çalışır.

import { unstable_cache } from "next/cache";

/** Gök konumu değişmez; süre yalnız sağlayıcı/adaptör değişikliğinde eski kayıtların dönmesini sınırlar (anahtar sürüm içerir). */
export const TRANSIT_DATA_CACHE_SECONDS = 30 * 24 * 60 * 60;

class InnerFailure extends Error {
  constructor(public readonly inner: unknown) {
    super("inner");
  }
}

export async function transitDataCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const wrapped = async () => {
    try {
      return await fn();
    } catch (e) {
      throw new InnerFailure(e);
    }
  };
  try {
    return await unstable_cache(wrapped, ["hd-transit-planets", key], { revalidate: TRANSIT_DATA_CACHE_SECONDS, tags: ["hd-transit-planets"] })();
  } catch (e) {
    if (e instanceof InnerFailure) throw e.inner; // sağlayıcı hatası: önbelleğe yazılmadı, aynen ilet
    // Data Cache kullanılamıyor (Next dışı ortam / incrementalCache yok) → önbelleksiz doğrudan çalış (çift çağrı yok: fn çalışmadı)
    return fn();
  }
}
