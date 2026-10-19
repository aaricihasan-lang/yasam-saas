// Human Design transit — KALICI PAYLAŞILAN ÖNBELLEK (Next.js Data Cache, unstable_cache; Cache Components kapalı projede
// desteklenen API). Yeni tablo / migration YOK. Vercel'de sunucu örnekleri ve yeniden başlatmalar arasında paylaşılır.
//
// YALNIZ kişisel olmayan, değişmeyen veri için: tek UTC anının gezegen boylamları (tenant'tan bağımsız). Kişisel transit
// sonuçları buraya YAZILMAZ. fn hata fırlatırsa unstable_cache saklamaz (başarısız yanıt önbelleğe girmez).
// Next çalışma ortamı dışında (tsx testleri) Data Cache yoktur → fn doğrudan çalışır.
//
// ÜCRETLİ ÇAĞRI KORUMASI: fn (sağlayıcı çağrısı) bir kez BAŞLADIYSA önbellek altyapısı hatası yüzünden ASLA yeniden
// çalıştırılmaz. fn tamamlandıysa kendi (doğrulanmış) sonucu döner; başladı ama sonucu bilinmiyorsa altyapı hatası iletilir
// (sonuç başarılı sayılmaz). Yalnız fn HİÇ başlamadıysa (Data Cache yok / okuma hatası) önbelleksiz tek çağrı yapılır.

import { unstable_cache } from "next/cache";

/** Gök konumu değişmez; süre yalnız sağlayıcı/adaptör değişikliğinde eski kayıtların dönmesini sınırlar (anahtar sürüm içerir). */
export const TRANSIT_DATA_CACHE_SECONDS = 30 * 24 * 60 * 60;

class InnerFailure extends Error {
  constructor(public readonly inner: unknown) {
    super("inner");
  }
}

type CacheImpl = typeof unstable_cache;

/** `cacheImpl` yalnız testler içindir (önbellek altyapısı hata enjeksiyonu); üretimde Next `unstable_cache`. */
export async function transitDataCache<T>(key: string, fn: () => Promise<T>, cacheImpl: CacheImpl = unstable_cache): Promise<T> {
  let started = false;
  let done: { value: T } | null = null;
  const wrapped = async () => {
    started = true;
    try {
      const value = await fn();
      done = { value };
      return value;
    } catch (e) {
      throw new InnerFailure(e);
    }
  };
  try {
    return await cacheImpl(wrapped, ["hd-transit-planets", key], { revalidate: TRANSIT_DATA_CACHE_SECONDS, tags: ["hd-transit-planets"] })();
  } catch (e) {
    if (e instanceof InnerFailure) throw e.inner; // sağlayıcı hatası: önbelleğe yazılmadı, aynen ilet
    const finished = done as { value: T } | null;
    if (finished) return finished.value; // fn tamamlandı, yalnız önbelleğe yazma başarısız → aynı sonuç, İKİNCİ ÇAĞRI YOK
    if (started) throw e; // fn başladı, sonucu bilinmiyor → tekrar çağırma (ücretli çift çağrı riski), başarı sayma
    // Data Cache kullanılamıyor (Next dışı ortam / incrementalCache yok / okuma hatası) ve fn hiç çalışmadı → önbelleksiz tek çağrı
    return fn();
  }
}
