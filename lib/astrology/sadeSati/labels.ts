// Sade Sati dönem tarihleri — ekran + Word/PDF ORTAK metinleri ve biçimleyiciler (SAF; istemci de kullanır).

import type { SadeSatiCycle, SadeSatiPeriodPhase, SadeSatiPeriods } from "./periods";

export const SS_PHASE_SHORT: Record<SadeSatiPeriodPhase, string> = { rising: "Yükselen (12.)", peak: "Doruk (1.)", setting: "Batan (2.)" };
export const SS_RELATION_LABEL: Record<SadeSatiCycle["relation"], string> = { past: "Geçmiş dönem", active: "Etkin dönem", future: "Gelecek dönem" };

export const SS_PERIODS_METHOD_TEXT =
  "Dönem tarihleri (aday yöntem K1, kesintili): Satürn'ün sidereal (Lahiri) burç geçişlerinden hesaplanır. Satürn Janma Rashi'den 12., 1. ve 2. burçtayken ilgili evre sürer; retro hareketle bu burçların dışına geçici çıkış \"kesinti\" olarak, her yeniden giriş ayrı satır olarak gösterilir. Dönem zarfı ilk girişten son çıkışa kadardır. Karşılaştırma için K2a (evre o burca ilk girişte başlar) ve K2b (evre o burca son ileri, kalıcı girişte başlar) özetleri ayrıca verilir. 45° derece ekolü bu hesapta yoktur.";
export const SS_PERIODS_SOURCE_TEXT =
  "Kaynak: sürümlü Satürn geçiş kataloğu (1900–2100; çevrimdışı Swiss Ephemeris hesabı, NASA/JPL Horizons ile bağımsız doğrulama). Geçiş anları dakika düzeyindedir; Satürn'ün duraklamaya yakın olduğu geçişlerde belirsizlik daha büyüktür (işaretli). Saatler UTC'dir; Türkiye saati tarihsel saat dilimi kurallarıyla verilir.";
export const SS_PERIODS_SCOPE_NOTE =
  "Günlük durum hesaplama servisinden, dönem tarihleri yerel katalogdan gelir; ikisi değerlendirme günü için karşılaştırılır, uyuşmazsa tarihler gösterilmez.";

export function ssUtc(iso: string | null | undefined): string {
  return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)} UTC` : "kapsam dışı";
}
export function ssIstanbul(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "shortOffset" }).format(new Date(iso));
  } catch {
    return "—";
  }
}
export function ssMoonBoundaryText(p: SadeSatiPeriods): string | null {
  const b = p.moonBoundary;
  if (!b || !b.warn) return null;
  return `Janma Rashi uyarısı: natal Ay burç sınırına ${b.degreesToBoundary.toFixed(2).replace(".", ",")}° uzaklıkta (ortalama Ay hızıyla yaklaşık ${b.approxMinutes} dakika). Doğum saati bu kadar hatalıysa Ay burcu ve bütün dönem tarihleri değişir; doğum saatinin kaynağını kontrol edin.`;
}

export type SadeSatiPeriodsStatus =
  | { state: "ok" }
  | { state: "unavailable"; reason: "D1_REQUIRED" | "AYANAMSA_UNSUPPORTED" | "OUT_OF_COVERAGE" }
  | { state: "blocked"; reason: "PROVIDER_MISMATCH" };

export const SADE_SATI_PERIODS_STATUS_TEXT: Record<string, string> = {
  D1_REQUIRED: "Dönem tarihleri için aynı ayanamsa ile kayıtlı Vedik D1 (Janma Rashi) gerekir; yeni istek yapılmadı.",
  AYANAMSA_UNSUPPORTED: "Dönem tarihleri yalnız Lahiri ayanamsa ile hesaplanır.",
  OUT_OF_COVERAGE: "Değerlendirme günü geçiş kataloğunun kapsamı (1900–2100) dışında; dönem tarihleri gösterilmez.",
  PROVIDER_MISMATCH: "Hesaplama servisinin günlük Sade Sati durumu ile dönem kataloğu bu gün için uyuşmadı; dönem tarihleri gösterilmez.",
};

