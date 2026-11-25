// Gökyüzü Atlası — AYLIK EFEMERİS: gösterim biçimleri (SAF; ekran, Word ve PDF AYNI fonksiyonu kullanır → değerler birebir aynı).
//
// Kural: saklanan değer sağlayıcının boylamıdır (4 ondalık). Yalnız GÖSTERİM biçimlenir: burç = ⌊boylam / 30⌋ (sağlayıcının burç alanıyla
// izdüşümde birebir denetlenir), derece ve dakika AŞAĞI yuvarlanır (kesilir) — böylece gösterilen burç/derece hiçbir zaman gezegenin
// henüz ulaşmadığı değeri göstermez (29°59,9′ → "29°59′", sonraki burç DEĞİL). Kesme 4 ondalıklık tam sayı ızgarasında yapılır
// (kayan nokta hatası yok). Semboller ve Türkçe adlar BİRLİKTE kullanılır (sembol kelimenin yerini almaz).

import { BODY_GLYPHS, BODY_LABELS, SIGN_GLYPHS, SIGN_LABELS } from "@/lib/astrology/labels/tr";
import type { SignId } from "@/lib/astrology/model/western";
import { deltaTPositionArcsec, deltaTUncertaintySec } from "../ephemeris/accuracy";
import { bodyVerification, CHIRON_VERIFIED_YEARS } from "./contract";
import type { MonthlyBody, MonthlyEphemeris, MonthlyKind, MonthlyPosition } from "./types";

const SIGN_IDS: readonly SignId[] = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
/** Semboller metin sunum seçicisiyle (U+FE0E) döner → tarayıcı emoji kutusu çizmez. Word/PDF işleyicisi (symbolFonts.fontRuns) seçiciyi
 *  zaten atar; karşılaştırmalar için `stripVs`. */
export const stripVs = (s: string) => s.replace(/[\uFE0E\uFE0F]/g, "");

export const MONTH_NAMES_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"] as const;

const VEDIC_NAME: Readonly<Record<string, string>> = {
  sun: "Güneş (Surya)", moon: "Ay (Chandra)", mars: "Mars (Mangala)", mercury: "Merkür (Budha)", jupiter: "Jüpiter (Guru)", venus: "Venüs (Shukra)",
  saturn: "Satürn (Shani)", rahu: "Rahu (Kuzey Ay Düğümü)", ketu: "Ketu (Güney Ay Düğümü)",
};
const VEDIC_SHORT: Readonly<Record<string, string>> = { sun: "Güneş", moon: "Ay", mars: "Mars", mercury: "Merkür", jupiter: "Jüpiter", venus: "Venüs", saturn: "Satürn", rahu: "Rahu", ketu: "Ketu" };
const WESTERN_SHORT: Readonly<Record<string, string>> = { north_node: "K. Düğüm", south_node: "G. Düğüm", lilith: "Lilith" };

export function bodyGlyph(kind: MonthlyKind, b: MonthlyBody): string {
  if (kind === "vedic") return b === "rahu" ? BODY_GLYPHS.north_node : b === "ketu" ? BODY_GLYPHS.south_node : BODY_GLYPHS[b as keyof typeof BODY_GLYPHS];
  return BODY_GLYPHS[b as keyof typeof BODY_GLYPHS];
}
/** Tam Türkçe ad (açıklama, rapor lejantı). */
export function bodyName(kind: MonthlyKind, b: MonthlyBody): string {
  if (kind === "vedic") return VEDIC_NAME[b] ?? b;
  return BODY_LABELS[b as keyof typeof BODY_LABELS] ?? b;
}
/** Kısa sütun başlığı: sembol + kısa Türkçe ad. */
export function bodyHeader(kind: MonthlyKind, b: MonthlyBody): string {
  const name = kind === "vedic" ? VEDIC_SHORT[b] : WESTERN_SHORT[b] ?? BODY_LABELS[b as keyof typeof BODY_LABELS];
  return `${bodyGlyph(kind, b)} ${name ?? b}`;
}

export type CellParts = { signIndex: number; signGlyph: string; signName: string; degree: number; minute: number; degMin: string; retro: boolean; lonText: string };

/** Boylam → burç + derece + dakika (aşağı yuvarlama, 4 ondalık tam sayı ızgarası). */
export function cellParts(p: Pick<MonthlyPosition, "lon" | "retro">): CellParts {
  const units = Math.round(p.lon * 10_000) % 3_600_000; // 0,0001° birim
  const signIndex = Math.floor(units / 300_000);
  const inSign = units - signIndex * 300_000; // 0 … 299 999
  const degree = Math.floor(inSign / 10_000);
  const minute = Math.floor(((inSign - degree * 10_000) * 6) / 1_000); // (birim × 60 / 10 000), tam sayı bölmesi
  const id = SIGN_IDS[signIndex];
  return {
    signIndex,
    signGlyph: SIGN_GLYPHS[id],
    signName: SIGN_LABELS[id],
    degree,
    minute,
    degMin: `${String(degree).padStart(2, "0")}°${String(minute).padStart(2, "0")}′`,
    retro: p.retro,
    lonText: `${(units / 10_000).toFixed(4).replace(".", ",")}°`,
  };
}

/** Tek satırlık hücre metni (rapor ve erişilebilirlik): "♈ Koç 23°24′ ℞". */
export function cellText(p: Pick<MonthlyPosition, "lon" | "retro">): string {
  const c = cellParts(p);
  return `${c.signGlyph} ${c.signName} ${c.degMin}${c.retro ? " ℞" : ""}`;
}

export const kindLabel = (k: MonthlyKind) => (k === "western" ? "Batı (Tropikal)" : "Vedik (Sideral)");
export const periodLabel = (year: number, month: number) => `${MONTH_NAMES_TR[month - 1]} ${year}`;
/** "01.11.2026" */
export const dateTr = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const WEEKDAY_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;
/** Gün sütunu: "01 Pzt" (haftanın günü UTC takvim gününe göre; satır anı 12:00 UTC aynı takvim günüdür). */
export const dayLabel = (iso: string) => `${iso.slice(8, 10)} ${WEEKDAY_TR[new Date(`${iso}T12:00:00Z`).getUTCDay()]}`;

/** Yöntem ve kaynak açıklaması (ekran altı + rapor; tek metin kaynağı). Sağlayıcı adı kullanıcıya GÖSTERİLMEZ. */
/** Türkiye 2016-09-07'den beri sürekli UTC+3'tür; öncesinde kış/yaz saati vardı → "15.00 TSİ" notu yalnız 2016-10 ve sonrası aylar için. */
export const trLocalNote = (year: number, month: number) => (year > 2016 || (year === 2016 && month >= 10) ? " (Türkiye saatiyle 15.00)" : "");

export function methodLines(e: Pick<MonthlyEphemeris, "kind" | "year" | "month" | "ayanamsa" | "nodeMethod" | "missingBodies" | "crossCheck">): string[] {
  const lines = [
    `Günlük konumlar: 12.00 UTC${trLocalNote(e.year, e.month)}. Satırlar o anın örneğidir; burç değiştirme ya da retro başlama/bitme anının kesin saatini GÖSTERMEZ — art arda iki günde farklı burç görülmesi geçişin o iki an arasında olduğunu söyler, saatini değil.`,
    e.kind === "western"
      ? "Zodyak: tropikal (gerçek ekinoks ve ekliptik, görünür geosantrik konum). Kuzey ve Güney Ay Düğümü: gerçek (oskülasyon) düğüm; Güney düğüm Kuzey düğümün tam karşısıdır."
      : "Zodyak: sideral (Nirayana), Lahiri ayanamsası — bu tablonun TEK ayanamsasıdır; başka ayanamsa seçeneği yoktur. Rahu: ortalama Ay düğümü (tarih ekinoksuna göre); Ketu Rahu'nun tam karşısıdır.",
    "Retro (℞): hesaplama altyapısının o güne ait gerçek retro bilgisidir; iki günün konumu karşılaştırılarak türetilmez.",
    "Derece ve dakika aşağı yuvarlanır (kesilir); saklanan değer 0,0001° hassasiyetindeki tam ekliptik boylamdır.",
  ];
  if (e.kind === "western") {
    const chiron = bodyVerification("western", "chiron", e.year);
    if (!e.missingBodies.includes("chiron")) lines.push(
      chiron.verified
        ? `Kiron: çalışma anında bağımsız kontrol edilmez; ${CHIRON_VERIFIED_YEARS[0]}–${CHIRON_VERIFIED_YEARS[1]} arasındaki örnek aylarda NASA/JPL Horizons verisiyle bağımsız olarak doğrulandı (en büyük fark 0,22″).`
        : `Kiron (⚠ doğrulanmamış): ${chiron.note}`,
    );
    lines.push(`Kara Ay Lilith (⚠ doğrulanmamış): ortalama Ay apojesi. ${bodyVerification("western", "lilith", e.year).note} Varsayılan görünümde ve raporda yer almaz; ham değer kayıtta saklıdır.`);
  }
  const dt = deltaTNote(e.year, e.month, e.kind);
  if (dt) lines.push(dt);
  if (e.missingBodies.length) lines.push(`${e.missingBodies.map((b) => bodyName(e.kind, b)).join(", ")}: hesaplama altyapısı bu ay için konum vermedi; tabloda gösterilmez.`);
  const cc = e.crossCheck;
  if (cc.status === "pass") {
    lines.push(
      `Bağımsız kontrol: ${cc.compared} değer, Yaşam Sistemi yerel NASA/JPL DE440 hesabıyla aynı anda karşılaştırıldı; en büyük fark ${String(cc.maxAbsArcsec).replace(".", ",")}″ (tolerans içinde), retro uyuşmazlığı ${cc.retroMismatches}.` +
        (cc.uncheckedBodies.length ? ` Kontrol dışı (yerel bağımsız motoru olmayan): ${cc.uncheckedBodies.map((b) => bodyName(e.kind, b)).join(", ")}.` : ""),
    );
  } else if (cc.status === "unavailable") lines.push(`Bağımsız kontrol bu tablo için yapılamadı${cc.reason ? `: ${cc.reason}` : "."}`);
  return lines;
}

/**
 * ΔT açıklaması (2026-11-25 gece denetimi): 1955 öncesi ve 2027 ortası sonrası Dünya'nın dönüş farkı (ΔT) ölçülmüş değil tahmindir.
 * 12.00 UTC anının gök konumu bu belirsizlik kadar kayabilir; en hızlı cisim Ay'dır. Ay'daki olası kayma ≥ 30″ (dakika gösterimini
 * etkileyebilecek düzey) ise kullanıcıya AÇIKÇA söylenir — tablo değerleri değişmez; yalnız yanıltıcı kesinlik izlenimi önlenir.
 */
export function deltaTNote(year: number, month: number, kind: MonthlyKind = "vedic"): string | null {
  const sigma = deltaTUncertaintySec(Date.UTC(year, month - 1, 15, 12));
  const moon = deltaTPositionArcsec("moon", "lon", sigma);
  if (moon < 30) return null;
  const fmt = (arcsec: number) => (arcsec >= 60 ? `±${Math.round(arcsec / 60)}′` : `±${Math.round(arcsec)}″`);
  const others = (["sun", "mercury", "venus", "mars"] as const)
    .map((b) => ({ b, v: deltaTPositionArcsec(b, "lon", sigma) }))
    .filter((x) => x.v >= 30)
    .map((x) => `${BODY_LABELS[x.b]} ${fmt(x.v)}`);
  // Batı: gerçek (oskülasyon) düğüm hızlı salınır → ΔT'den etkilenir; Vedik ortalama düğüm etkilenmez.
  const node = kind === "western" ? deltaTPositionArcsec("true_node", "lon", sigma) : 0;
  if (node >= 30) others.push(`Ay düğümü ${fmt(node)}`);
  const secs = sigma >= 120 ? `yaklaşık ±${Math.round(sigma / 60)} dakika` : `yaklaşık ±${Math.round(sigma)} saniye`;
  return `Zaman belirsizliği (ΔT): bu dönem için Dünya'nın dönüş farkı ölçülmüş değil, tahmindir (${secs}). Bu nedenle en çok şu kadar konum belirsizliği olabilir: Ay ${fmt(moon)}${others.length ? `, ${others.join(", ")}` : ""}; dış gezegenler pratikte etkilenmez. Tablo değerleri hesaplama altyapısının modeline göredir.`;
}
