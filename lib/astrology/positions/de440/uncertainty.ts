// Gökyüzü Atlası — DE440 konum kaynağı: ΔT (TT − UT) belirsizliği ve olay anı sayısal çözünürlüğü (SAF; Efemeris, Derece Geçişleri
// ve Transit Taraması ORTAK kullanır). Konum hatasından AYRI terimdir: UT/UTC ile verilen olay anına eklenir.

// Satır ve olay anları UTC/UT ile verilir; konum TT'de hesaplanır. 1961-01-01 – 2027-06-28: TT, UTC'den KESİN (artık saniye tablosu)
// → 0 s. Öncesi ve sonrası ΔT modelden (lib/astrology/time/deltaT.ts) gelir; belirsizlik bilinçli olarak GENİŞ tutulmuş bir üst sınırdır:
//   • 1955–1961: 1 s (ΔT gözlemsel; sivil saat = UT kabulü).
//   • 1955 öncesi: 1 + 1,6·((1955 − yıl)/100)² s — Morrison & Stephenson (2004, JHA 35:327) uzun dönem biçimi (0,8·t² s) iki katına
//     çıkarılmış ve 1955'ten başlatılmış: ΔT tablosu ↔ Swiss Ephemeris ΔT farkı (1600: 18,8 s) kapsansın (1600 ≈ 21 s, 1800 ≈ 4,8 s).
//   • 2027-06-28 sonrası (öngörü): 1 + 0,5·Δy + 0,01·Δy² s, Δy = 2027-06-28'den yıl (2055 ≈ 22 s, 2100 ≈ 90 s, 2150 ≈ 213 s,
//     2600 ≈ 1 sa). Gerekçe: Yer dönüş hızındaki on yıllık dalgalanma ΔT eğiminde ±0,5 s/yıl mertebesinde belirsizlik bırakır; geçmiş
//     uzun dönem öngörüleri 25 yılda 5–45 s saptı.
const MS_1955 = Date.UTC(1955, 0, 1);
const MS_1961 = Date.UTC(1961, 0, 1);
const MS_2027_06_28 = Date.UTC(2027, 5, 28);
const YEAR_MS = 365.25 * 86_400_000;
export function deltaTUncertaintySec(ms: number): number {
  if (ms >= MS_1961 && ms < MS_2027_06_28) return 0;
  if (ms >= MS_1955 && ms < MS_1961) return 1;
  if (ms < MS_1955) {
    const c = (MS_1955 - ms) / YEAR_MS / 100;
    return 1 + 1.6 * c * c;
  }
  const dy = (ms - MS_2027_06_28) / YEAR_MS;
  return 1 + 0.5 * dy + 0.01 * dy * dy;
}


/** Olay anı belirsizliğine eklenen sayısal çözünürlük (ikiye bölme ≤1 s + saniyeye yuvarlama). */
export const EVENT_RESOLUTION_SEC = 1;
