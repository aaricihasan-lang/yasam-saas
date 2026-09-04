import { CHAKRA_LETTER_MAP, parseBirthDate, reduce1To9, reduceToDigit, sumDigits, turkishUpper } from "../ortak";
import { hesaplaPinKodu } from "../pinKodu";
import { countElementsWithNeutral } from "../elementler";
import type { SynergyStep } from "./types";

// ─── Yeniden kullanılabilir bireysel primitive'ler ───────────────────────────

/** Yaşam Kodu: doğum tarihindeki tüm rakamların tek haneye indirgenmişi (1–9). */
export function calcLifeCodeDigit(birthDate: string): number | null {
  const parts = parseBirthDate(birthDate);
  if (!parts) return null;
  const total = sumDigits(parts.day) + sumDigits(parts.month) + sumDigits(parts.year);
  return reduce1To9(total);
}

/** Doğum Günü sayısı: yalnız günün tek haneye indirgenmişi (1–9). */
export function calcBirthdayDigit(birthDate: string): number | null {
  const parts = parseBirthDate(birthDate);
  if (!parts) return null;
  return reduce1To9(sumDigits(parts.day));
}

/**
 * Doğum tarihindeki BÜTÜN rakamların HAM toplamı (sadeleştirme YOK).
 * Eş Uyumu türetmesinde kullanılır. Örn: 29/03/1986 → 2+9+0+3+1+9+8+6 = 38.
 */
export function rawBirthDigitSum(birthDate: string): number | null {
  const parts = parseBirthDate(birthDate);
  if (!parts) return null;
  return sumDigits(parts.day) + sumDigits(parts.month) + sumDigits(parts.year);
}

/**
 * Edinim Sayısı: (doğum günü + doğum ayı) → tek hane (1–9).
 * İleride bireysel analizde de kullanılmak üzere yeniden kullanılabilir primitive.
 */
export function calcAcquisition(birthDate: string): number | null {
  const parts = parseBirthDate(birthDate);
  if (!parts) return null;
  return reduce1To9(sumDigits(parts.day) + sumDigits(parts.month));
}

/**
 * İsim Sayısı (tek hane): isim+soyisim harflerinin CHAKRA_LETTER_MAP toplamı → 1–9.
 *
 * KAYNAK DOĞRULANDI (kitap 2. seviye(3).pdf — "İsim sayısı, isminizin içindeki
 * harflerin sayısal olarak toplamından bulunan..." + "Ortak Rakam" yöntemi):
 *   İsim+soyisim harflerinin rakamsal karşılıkları toplanır, tek haneye indirilir.
 *   Kaynak örnekleri: SEMA (1+5+4+1=11→2), DURMAZ (4+3+9+4+1+8=29→11→2),
 *   SEMA ÇAYLAR = 2, ELİF YILMAZ = 1. İki kişinin tek-hane değeri toplanıp yine
 *   tek haneye indirilince ORTAK RAKAM bulunur (örn. 2+1=3).
 * Bu, İfade Sayısı primitive'i ile AYNI harf tablosunu kullanır ama kaynak "isim
 * sayısı" tanımı gereği özel sayı korumaz; tam sadeleştirme (1–9) uygulanır.
 */
export function calcNameNumberSingle(firstName: string, lastName: string): number | null {
  const full = `${firstName || ""} ${lastName || ""}`;
  let total = 0;
  let any = false;
  for (const ch of Array.from(turkishUpper(full))) {
    const val = CHAKRA_LETTER_MAP[ch];
    if (val) {
      total += val;
      any = true;
    }
  }
  if (!any) return null;
  return reduce1To9(total);
}

// ─── Sinerji PIN ─────────────────────────────────────────────────────────────

export function pin8From(birthDate: string): number[] | null {
  const parts = parseBirthDate(birthDate);
  if (!parts) return null;
  const b = hesaplaPinKodu(birthDate);
  return [b.k1, b.k2, b.k3, b.k4, b.k5, b.k6, b.k7, b.k8];
}

/** İki PIN ilk-8 hanesinin aynı pozisyonda toplanıp sadeleştirilmesi. */
export function calcSynergyPin(a: number[], b: number[]): { pin: number[]; steps: SynergyStep[] } {
  const steps: SynergyStep[] = [];
  const pin: number[] = [];
  for (let i = 0; i < 8; i++) {
    const sum = (a[i] ?? 0) + (b[i] ?? 0);
    const result = reduceToDigit(sum);
    pin.push(result);
    steps.push({ index: i + 1, a: a[i] ?? 0, b: b[i] ?? 0, sum, result });
  }
  return { pin, steps };
}

/** 9. hane / "Neden Bir Aradayız": Σ(sinerji ilk 8) → tek hane. */
export function calcWhyTogether(synergy8: number[]): { sum: number; digit: number } {
  const sum = synergy8.slice(0, 8).reduce((acc, d) => acc + d, 0);
  return { sum, digit: reduceToDigit(sum) };
}

// ─── Element & İşleme Tipi (Baskın/Edilgen) ──────────────────────────────────

const BASKIN_DIGITS = new Set([1, 3, 6, 8]);
const EDILGEN_DIGITS = new Set([2, 4, 5, 7]);

/** İşleme tipi — Baskın {1,3,6,8}, Edilgen {2,4,5,7}, her 9 → +0.5/+0.5. UYUM PUANI DEĞİL. */
export function calcDominance(digits: number[]): { baskin: number; edilgen: number } {
  let baskin = 0;
  let edilgen = 0;
  for (const d of digits) {
    if (BASKIN_DIGITS.has(d)) baskin += 1;
    else if (EDILGEN_DIGITS.has(d)) edilgen += 1;
    else if (d === 9) {
      baskin += 0.5;
      edilgen += 0.5;
    }
  }
  return { baskin, edilgen };
}

/** Kaynak miktar sınıfı: 1=eksik, 2=yeterli, 3=dengeli; diğerleri null (uydurma yok). */
export function elementLevel(count: number): string | null {
  if (count === 1) return "eksik";
  if (count === 2) return "yeterli";
  if (count === 3) return "dengeli";
  return null;
}

export type ElementCountsFull = ReturnType<typeof countElementsWithNeutral>;

/** Sinerji 8 haneden element dağılımı (Nötr dahil, tie korunur). */
export function calcSynergyElements(synergy8: number[]): ElementCountsFull {
  return countElementsWithNeutral(synergy8.slice(0, 8));
}

/** Eşitlikte SIRALAMA YAPMADAN en yüksek sayıya sahip TÜM elementleri döndürür. */
export function highlightedElements(counts: ElementCountsFull): string[] {
  const entries = Object.entries(counts) as [string, number][];
  const max = Math.max(...entries.map(([, c]) => c));
  if (max <= 0) return [];
  return entries.filter(([, c]) => c === max).map(([name]) => name);
}
