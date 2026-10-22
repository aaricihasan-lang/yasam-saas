/**
 * UTC ofset gösterimi — "UTC+03:00". ATL-P3-10 (2026-10-20): tarihsel yerel ortalama zaman (LMT) ofsetleri saniyelidir
 * (ör. Paris 1880 +00:09:21); saniye artık atılmaz → "UTC+00:09:21". Tam dakikalık ofsetlerde metin eskisiyle AYNI.
 * Yalnız gösterim: hesap saklı utcOffsetSeconds'u kullanır.
 */
export function formatUtcOffset(sec: number): string {
  const sign = sec >= 0 ? "+" : "−";
  const a = Math.abs(sec);
  const hm = `UTC${sign}${String(Math.floor(a / 3600)).padStart(2, "0")}:${String(Math.floor((a % 3600) / 60)).padStart(2, "0")}`;
  return a % 60 === 0 ? hm : `${hm}:${String(a % 60).padStart(2, "0")}`;
}
