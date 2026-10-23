// Sade Sati dönem tarihleri — ekran + Word/PDF ORTAK metinleri ve biçimleyiciler (SAF; istemci de kullanır).

import { SIGN_LABELS } from "../labels/tr";
import type { SadeSatiCycle, SadeSatiPeriodPhase, SadeSatiPeriods, SadeSatiStatusAt } from "./periods";

export const SS_PHASE_SHORT: Record<SadeSatiPeriodPhase, string> = { rising: "Yükselen (12.)", peak: "Doruk (1.)", setting: "Batan (2.)" };
export const SS_RELATION_LABEL: Record<SadeSatiCycle["relation"], string> = { past: "Geçmiş dönem", active: "Etkin dönem", future: "Gelecek dönem" };

export const SS_PERIODS_METHOD_TEXT =
  "Dönem tarihleri (aday yöntem K1, kesintili): Satürn'ün sidereal (Lahiri) burç geçişlerinden hesaplanır. Satürn Janma Rashi'den 12., 1. ve 2. burçtayken ilgili evre sürer; retro hareketle bu burçların dışına geçici çıkış \"kesinti\" olarak, her yeniden giriş ayrı satır olarak gösterilir. Dönem zarfı ilk girişten son çıkışa kadardır. Karşılaştırma için K2a (evre o burca ilk girişte başlar) ve K2b (evre o burca son ileri, kalıcı girişte başlar) özetleri ayrıca verilir. 45° derece ekolü bu hesapta yoktur.";
/** v1 kayıtları (22.10 Draft) kendi kaynak metniyle açılır — eski kayıt sessizce yeni kaynağa dönüştürülmez. */
const SS_PERIODS_SOURCE_V1 =
  "Kaynak: sürümlü Satürn geçiş kataloğu (1900–2100; çevrimdışı Swiss Ephemeris hesabı, NASA/JPL Horizons ile bağımsız doğrulama). Geçiş anları dakika düzeyindedir; Satürn'ün duraklamaya yakın olduğu geçişlerde belirsizlik daha büyüktür (işaretli). Saatler UTC'dir; Türkiye saati tarihsel saat dilimi kurallarıyla verilir.";
const SS_PERIODS_SOURCE_V2 =
  "Kaynak: sürümlü Satürn geçiş kataloğu (1900–2100; NASA/JPL NAIF DE440 efemerisiyle çevrimdışı hesap, bağımsız efemerislerle çapraz doğrulama; Lahiri ayanamsa). Geçiş anları dakika düzeyindedir; Satürn'ün duraklamaya yakın olduğu geçişlerde belirsizlik daha büyüktür (işaretli). Lahiri ayanamsanın yazılımlar arasındaki farklı gerçekleştirimleri (presesyon modeli) bugüne yakın tarihlerde 1 dakikanın altında, “duraklamaya yakın” işaretli geçişlerde birkaç dakikaya kadar fark yaratabilir; günlük durum bundan etkilenmez. Saatler UTC'dir (gelecek tarihler öngörülen evrensel zamana göre); Türkiye saati tarihsel saat dilimi kurallarıyla (IANA Europe/Istanbul) verilir.";
export function ssPeriodsSourceText(p: Pick<SadeSatiPeriods, "catalog">): string {
  return p.catalog?.version === "1" ? SS_PERIODS_SOURCE_V1 : SS_PERIODS_SOURCE_V2;
}
export const SS_PERIODS_SCOPE_NOTE =
  "Günlük durum hesaplama servisinden, dönem tarihleri yerel katalogdan gelir; ikisi değerlendirme günü için karşılaştırılır, uyuşmazsa tarihler gösterilmez. Sade Sati geleneksel bir astrolojik zamanlama hesabıdır: tarihler olay, hastalık ya da kader öngörüsü değildir; yorum uzmanındır.";

const SIGN_TR = SIGN_LABELS as Record<string, string>;
export function ssStatusText(s: SadeSatiStatusAt): string {
  return s.state === "phase" && s.phase ? `Sade Sati etkin — ${SS_PHASE_SHORT[s.phase]} evre` : s.state === "interruption" ? "Sade Sati döneminde kesinti (Satürn geçici olarak dışarıda)" : "Sade Sati etkin değil";
}
/** "Janma Rashi Balık · Lahiri · değerlendirme 22.10.2026" + durum + sonraki geçiş — ekran ve Word/PDF ortak. */
export function ssSummaryLines(p: SadeSatiPeriods): string[] {
  const out = [`Janma Rashi (doğum Ay burcu): ${SIGN_TR[p.janmaRashi] ?? p.janmaRashi} · ayanamsa Lahiri · değerlendirme ${p.asOfUtc.slice(8, 10)}.${p.asOfUtc.slice(5, 7)}.${p.asOfUtc.slice(0, 4)}`];
  out.push(`Durum: ${ssStatusText(p.statusAtAsOf)}`);
  const n = p.nextTransition;
  if (n) {
    out.push(
      n.beyondCoverage
        ? "Bir sonraki geçiş: katalog kapsamı (2100 sonu) içinde yok — tarih verilmez."
        : `Bir sonraki geçiş: ${ssUtc(n.utc)} (${ssIstanbul(n.utc)}) — Satürn ${SIGN_TR[n.sign] ?? n.sign}${n.motion === "retrograde" ? " (geri hareket ℞)" : ""}; sonrası: ${ssStatusText(n.to)}${n.nearStation ? " · duraklamaya yakın" : ""}`,
    );
  }
  out.push(`Katalog: v${p.catalog.version} · kapsam ${p.catalog.coverageFromUtc.slice(0, 4)}–${p.catalog.coverageToUtc.slice(0, 4)} · SHA-256 ${p.catalog.sha256.slice(0, 12)}…`);
  return out;
}

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
  | { state: "blocked"; reason: "PROVIDER_MISMATCH" | "CATALOG_INTEGRITY" };

export const SADE_SATI_PERIODS_STATUS_TEXT: Record<string, string> = {
  D1_REQUIRED: "Dönem tarihleri için aynı ayanamsa ile kayıtlı Vedik D1 (Janma Rashi) gerekir; yeni istek yapılmadı.",
  AYANAMSA_UNSUPPORTED: "Dönem tarihleri yalnız Lahiri ayanamsa ile hesaplanır.",
  OUT_OF_COVERAGE: "Değerlendirme günü geçiş kataloğunun kapsamı (1900–2100) dışında; dönem tarihleri gösterilmez.",
  PROVIDER_MISMATCH: "Hesaplama servisinin günlük Sade Sati durumu ile dönem kataloğu bu gün için uyuşmadı; dönem tarihleri gösterilmez.",
  CATALOG_INTEGRITY: "Geçiş kataloğunun bütünlük denetimi (SHA-256) başarısız; dönem tarihleri gösterilmez.",
};

