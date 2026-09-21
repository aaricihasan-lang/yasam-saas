// Türkiye (Europe/Istanbul) TAKVİM YILI — merkezî, saf ve ENJEKTE EDİLEBİLİR kaynak.
//
// Owner kararı: kronolojik numeroloji sonuçları içinde bulunduğumuz takvim yılından
// ileriye uzanmaz ve bu sınır HER YIL kendiliğinden güncellenir. Yıl NUMARASI hiçbir
// yere hardcode EDİLMEZ; çalışma anında güvenilir yerel tarihten belirlenir.
//
// Europe/Istanbul 2016'dan beri kalıcı olarak UTC+3'tür (yaz saati / DST YOKTUR). Bu
// nedenle sabit +3 saat ofseti deterministiktir, Intl bağımlılığı gerektirmez ve sahte
// saat (enjekte edilen Date) ile test edilebilir. Bu katman ENGINE DEĞİLDİR (kronolojik
// SUNUM sınırı içindir); ancak new Date() yalnız varsayılandır ve her zaman enjekte edilebilir.

export const ISTANBUL_UTC_OFFSET_MINUTES = 180;
const OFFSET_MS = ISTANBUL_UTC_OFFSET_MINUTES * 60_000;

/** Verilen anın (UTC epoch) Europe/Istanbul duvar-saatine göre takvim yılı. */
export function istanbulYearAt(instant: Date): number {
  return new Date(instant.getTime() + OFFSET_MS).getUTCFullYear();
}

/**
 * Şu anki — veya test için enjekte edilen an için — Türkiye takvim yılı.
 * Modül seviyesinde ÖNBELLEKLENMEZ: her çağrıda taze hesaplanır (yıl geçişinde takılı kalmaz).
 */
export function currentIstanbulYear(now: Date = new Date()): number {
  return istanbulYearAt(now);
}

/**
 * Verilen andan bir SONRAKİ Türkiye yıl sınırına (1 Ocak 00:00 Europe/Istanbul) kadar
 * milisaniye. Açık kalan bir sekmede yıl değişimini zamanlamak için kullanılır.
 *
 * Istanbul duvar-saati "1 Ocak (yıl+1) 00:00", gerçek UTC anında offset kadar erken olur;
 * bu yüzden Date.UTC(...) sonucundan ofset düşülür.
 */
export function msUntilNextIstanbulYear(instant: Date): number {
  const now = instant.getTime();
  const istYear = istanbulYearAt(instant);
  const nextBoundaryUtc = Date.UTC(istYear + 1, 0, 1, 0, 0, 0, 0) - OFFSET_MS;
  return nextBoundaryUtc - now;
}
