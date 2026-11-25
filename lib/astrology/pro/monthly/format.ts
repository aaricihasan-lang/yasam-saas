// Gökyüzü Atlası — AYLIK EFEMERİS: gösterim biçimleri (SAF; ekran, Word ve PDF AYNI fonksiyonu kullanır → değerler birebir aynı).
//
// Kural: saklanan değer sağlayıcının boylamıdır (4 ondalık). Yalnız GÖSTERİM biçimlenir: burç = ⌊boylam / 30⌋ (sağlayıcının burç alanıyla
// izdüşümde birebir denetlenir), derece ve dakika AŞAĞI yuvarlanır (kesilir) — böylece gösterilen burç/derece hiçbir zaman gezegenin
// henüz ulaşmadığı değeri göstermez (29°59,9′ → "29°59′", sonraki burç DEĞİL). Kesme 4 ondalıklık tam sayı ızgarasında yapılır
// (kayan nokta hatası yok). Semboller ve adlar BİRLİKTE kullanılır (sembol kelimenin yerini almaz).
//
// I18N-F1-R5 (ATLAS-E): her fonksiyon isteğe bağlı son parametre `L: MonthlyText` alır (text.ts); verilmezse kaynak dil (tr) — Türkçe çıktı
// çeviri öncesiyle bayt-bayt aynıdır. Adlar ortak terim kataloğundan gelir (terms.zodiac / terms.body / terms.graha / terms.grahaNodeFull);
// Vedik ad tablosunun ikinci kopyası (QA-ATL-P2-4) kaldırıldı. Sayısal değerler (derece, dakika, boylam, tarih bileşenleri) dilden
// bağımsızdır; yalnız ondalık ayırıcı ve tarih ayırıcı dile göre seçilir.

import { BODY_GLYPHS, SIGN_GLYPHS } from "@/lib/astrology/labels/tr";
import type { SignId } from "@/lib/astrology/model/western";
import { deltaTPositionArcsec, deltaTUncertaintySec } from "../ephemeris/accuracy";
import { bodyVerification, CHIRON_VERIFIED_YEARS } from "./contract";
import { checkReasonText, SOURCE_TEXT, type MonthlyText } from "./text";
import type { MonthlyBody, MonthlyEphemeris, MonthlyKind, MonthlyPosition } from "./types";

const SIGN_IDS: readonly SignId[] = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
/** Semboller metin sunum seçicisiyle (U+FE0E) döner → tarayıcı emoji kutusu çizmez. Word/PDF işleyicisi (symbolFonts.fontRuns) seçiciyi
 *  zaten atar; karşılaştırmalar için `stripVs`. */
export const stripVs = (s: string) => s.replace(/[︎️]/g, "");

/** Ay adları (1–12) seçili dilde. */
export const monthNames = (L: MonthlyText = SOURCE_TEXT): string[] => Array.from({ length: 12 }, (_, i) => L.t(`months.m${i + 1}`));
/** Ondalık ayırıcı (tr ",", en "."): yalnız gösterim. */
export const decimalText = (x: number | string, L: MonthlyText = SOURCE_TEXT) => String(x).replace(".", L.t("num.decimal"));

export function bodyGlyph(kind: MonthlyKind, b: MonthlyBody): string {
  if (kind === "vedic") return b === "rahu" ? BODY_GLYPHS.north_node : b === "ketu" ? BODY_GLYPHS.south_node : BODY_GLYPHS[b as keyof typeof BODY_GLYPHS];
  return BODY_GLYPHS[b as keyof typeof BODY_GLYPHS];
}
/** Tam ad (açıklama, rapor lejantı). Vedik: terms.graha (Rahu/Ketu: terms.grahaNodeFull — "Rahu (Kuzey Ay Düğümü)"); Batı: terms.body. */
export function bodyName(kind: MonthlyKind, b: MonthlyBody, L: MonthlyText = SOURCE_TEXT): string {
  if (kind === "vedic") return b === "rahu" || b === "ketu" ? L.term(`grahaNodeFull.${b}`) : L.term(`graha.${b}`);
  return L.term(`body.${b}`);
}
/** Kısa sütun başlığı: sembol + kısa ad (Vedik: gezegenin kısa adı / Rahu, Ketu; Batı: düğümler ve Lilith kısaltılır). */
export function bodyHeader(kind: MonthlyKind, b: MonthlyBody, L: MonthlyText = SOURCE_TEXT): string {
  const name =
    kind === "vedic"
      ? b === "rahu" || b === "ketu"
        ? L.term(`graha.${b}`)
        : L.term(`body.${b}`)
      : b === "north_node" || b === "south_node" || b === "lilith"
        ? L.t(`short.${b}`)
        : L.term(`body.${b}`);
  return `${bodyGlyph(kind, b)} ${name}`;
}

export type CellParts = { signIndex: number; signGlyph: string; signName: string; degree: number; minute: number; degMin: string; retro: boolean; lonText: string };

/** Boylam → burç + derece + dakika (aşağı yuvarlama, 4 ondalık tam sayı ızgarası). */
export function cellParts(p: Pick<MonthlyPosition, "lon" | "retro">, L: MonthlyText = SOURCE_TEXT): CellParts {
  const units = Math.round(p.lon * 10_000) % 3_600_000; // 0,0001° birim
  const signIndex = Math.floor(units / 300_000);
  const inSign = units - signIndex * 300_000; // 0 … 299 999
  const degree = Math.floor(inSign / 10_000);
  const minute = Math.floor(((inSign - degree * 10_000) * 6) / 1_000); // (birim × 60 / 10 000), tam sayı bölmesi
  const id = SIGN_IDS[signIndex];
  return {
    signIndex,
    signGlyph: SIGN_GLYPHS[id],
    signName: L.term(`zodiac.${id}`),
    degree,
    minute,
    degMin: `${String(degree).padStart(2, "0")}°${String(minute).padStart(2, "0")}′`,
    retro: p.retro,
    lonText: `${decimalText((units / 10_000).toFixed(4), L)}°`,
  };
}

/** Tek satırlık hücre metni (rapor ve erişilebilirlik): "♈ Koç 23°24′ ℞". */
export function cellText(p: Pick<MonthlyPosition, "lon" | "retro">, L: MonthlyText = SOURCE_TEXT): string {
  const c = cellParts(p, L);
  return `${c.signGlyph} ${c.signName} ${c.degMin}${c.retro ? " ℞" : ""}`;
}

export const kindLabel = (k: MonthlyKind, L: MonthlyText = SOURCE_TEXT) => L.t(k === "western" ? "kind.western" : "kind.vedic");
export const periodLabel = (year: number, month: number, L: MonthlyText = SOURCE_TEXT) => L.t("num.period", { month: L.t(`months.m${month}`), year: String(year) });
/** tr "01.11.2026" · en "01/11/2026" (gün/ay/yıl; Owner kararı A8 en-GB sırası). */
export const dateTr = (iso: string, L: MonthlyText = SOURCE_TEXT) => L.t("num.date", { d: iso.slice(8, 10), m: iso.slice(5, 7), y: iso.slice(0, 4) });
/** Gün sütunu: tr "01 Pzt" · en "01 Mon" (haftanın günü UTC takvim gününe göre; satır anı 12:00 UTC aynı takvim günüdür). */
export const dayLabel = (iso: string, L: MonthlyText = SOURCE_TEXT) => `${iso.slice(8, 10)} ${L.t(`weekdays.d${new Date(`${iso}T12:00:00Z`).getUTCDay()}`)}`;

/** Yöntem ve kaynak açıklaması (ekran altı + rapor; tek metin kaynağı). Sağlayıcı adı kullanıcıya GÖSTERİLMEZ. */
/**
 * Türkiye 2016-09-07'den beri sürekli UTC+3'tür (IANA Europe/Istanbul; tzdb kısaltması "+03"); öncesinde kış/yaz saati vardı → 12.00 UTC'nin
 * yerel karşılığı notu yalnız 2016-10 ve sonrası aylar için. Dönüş: önünde boşlukla " (…)" ya da boş metin.
 */
export const trLocalNote = (year: number, month: number, L: MonthlyText = SOURCE_TEXT) => (year > 2016 || (year === 2016 && month >= 10) ? ` ${L.t("method.localNote")}` : "");

export function methodLines(e: Pick<MonthlyEphemeris, "kind" | "year" | "month" | "ayanamsa" | "nodeMethod" | "missingBodies" | "crossCheck">, L: MonthlyText = SOURCE_TEXT): string[] {
  const lines = [
    L.t("method.time", { local: trLocalNote(e.year, e.month, L) }),
    L.t(e.kind === "western" ? "method.zodiacWestern" : "method.zodiacVedic"),
    L.t("method.retro"),
    L.t("method.rounding"),
  ];
  if (e.kind === "western") {
    const chiron = bodyVerification("western", "chiron", e.year, L);
    if (!e.missingBodies.includes("chiron")) lines.push(
      chiron.verified
        ? L.t("method.chironVerified", { from: String(CHIRON_VERIFIED_YEARS[0]), to: String(CHIRON_VERIFIED_YEARS[1]) })
        : L.t("method.chironUnverified", { note: chiron.note }),
    );
    lines.push(L.t("method.lilith", { note: bodyVerification("western", "lilith", e.year, L).note }));
  }
  const dt = deltaTNote(e.year, e.month, e.kind, L);
  if (dt) lines.push(dt);
  if (e.missingBodies.length) lines.push(L.t("method.missing", { bodies: e.missingBodies.map((b) => bodyName(e.kind, b, L)).join(", ") }));
  const cc = e.crossCheck;
  if (cc.status === "pass") {
    lines.push(
      L.t("method.checkPass", { compared: String(cc.compared), max: decimalText(cc.maxAbsArcsec, L), retro: String(cc.retroMismatches) }) +
        (cc.uncheckedBodies.length ? ` ${L.t("method.checkUnchecked", { bodies: cc.uncheckedBodies.map((b) => bodyName(e.kind, b, L)).join(", ") })}` : ""),
    );
  } else if (cc.status === "unavailable") lines.push(cc.reason ? L.t("method.checkUnavailableReason", { reason: checkReasonText(cc.reason, L) }) : L.t("method.checkUnavailable"));
  return lines;
}

/**
 * ΔT açıklaması (2026-11-25 gece denetimi): 1955 öncesi ve 2027 ortası sonrası Dünya'nın dönüş farkı (ΔT) ölçülmüş değil tahmindir.
 * 12.00 UTC anının gök konumu bu belirsizlik kadar kayabilir; en hızlı cisim Ay'dır. Ay'daki olası kayma ≥ 30″ (dakika gösterimini
 * etkileyebilecek düzey) ise kullanıcıya AÇIKÇA söylenir — tablo değerleri değişmez; yalnız yanıltıcı kesinlik izlenimi önlenir.
 */
export function deltaTNote(year: number, month: number, kind: MonthlyKind = "vedic", L: MonthlyText = SOURCE_TEXT): string | null {
  const sigma = deltaTUncertaintySec(Date.UTC(year, month - 1, 15, 12));
  const moon = deltaTPositionArcsec("moon", "lon", sigma);
  if (moon < 30) return null;
  const fmt = (arcsec: number) => (arcsec >= 60 ? `±${Math.round(arcsec / 60)}′` : `±${Math.round(arcsec)}″`);
  const others = (["sun", "mercury", "venus", "mars"] as const)
    .map((b) => ({ b, v: deltaTPositionArcsec(b, "lon", sigma) }))
    .filter((x) => x.v >= 30)
    .map((x) => `${L.term(`body.${x.b}`)} ${fmt(x.v)}`);
  // Batı: gerçek (oskülasyon) düğüm hızlı salınır → ΔT'den etkilenir; Vedik ortalama düğüm etkilenmez.
  const node = kind === "western" ? deltaTPositionArcsec("true_node", "lon", sigma) : 0;
  if (node >= 30) others.push(`${L.t("method.deltaTNode")} ${fmt(node)}`);
  const secs = sigma >= 120 ? L.t("method.deltaTMinutes", { n: String(Math.round(sigma / 60)) }) : L.t("method.deltaTSeconds", { n: String(Math.round(sigma)) });
  return L.t("method.deltaT", { secs, list: [`${L.term("body.moon")} ${fmt(moon)}`, ...others].join(", ") });
}
