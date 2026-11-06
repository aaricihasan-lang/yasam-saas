/**
 * Klasik Numeroloji · Zorluklar — SUNUM yardımcıları (SAF; hesap / formül YOK).
 *
 * D3 (05.11.2026): Sağlayıcı 3. zorluğu "ana zorluk" olarak tüm yaşam için döndürür (startAge 0, endAge null);
 * 1., 2. ve 4. zorluklar yaş dönemlerine bağlıdır. Eski "şu an" seçimi listedeki İLK eşleşmeyi aldığı için
 * 2. dönemden sonra her yaşta 3. (ana) zorluğu seçiyor, 4. zorluk hiç "şu an" olamıyordu.
 * Bu modül yalnız gösterimi ayırır; sayılar ve yaş sınırları sağlayıcı yanıtından değiştirilmeden okunur.
 *
 * Ana zorluk kuralı Word raporuyla (report/docx.ts periodsTable) birebir aynıdır:
 *   position === 3 && endAge yok && startAge <= 0.
 * Bu işaret yoksa (beklenmeyen yanıt) liste olduğu gibi dönemsel kabul edilir — eski davranış.
 */

export type ChallengeLike = { position: number; number: number; startAge: number; endAge: number | null };

export function isMainChallenge(p: ChallengeLike | null | undefined): boolean {
  return !!p && p.position === 3 && (p.endAge === null || p.endAge === undefined) && typeof p.startAge === "number" && p.startAge <= 0;
}

/** Tüm yaşam boyunca geçerli ana (3.) zorluk; yoksa null. */
export function mainChallenge<T extends ChallengeLike>(list: readonly T[] | null | undefined): T | null {
  if (!Array.isArray(list)) return null;
  const mains = list.filter((p) => isMainChallenge(p));
  return mains.length === 1 ? mains[0] : null;
}

/** Yaş dönemlerine bağlı zorluklar (ana zorluk hariç), sağlayıcı sırası korunur. */
export function periodicChallenges<T extends ChallengeLike>(list: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(list)) return [];
  const main = mainChallenge(list);
  return list.filter((p) => p !== main);
}

/** Hedef yaşta etkin DÖNEMSEL zorluk (ana zorluk asla seçilmez); dönem boşluğunda null. */
export function currentPeriodicChallenge<T extends ChallengeLike>(list: readonly T[] | null | undefined, age: number | null): T | null {
  if (age === null || !Number.isFinite(age)) return null;
  return (
    periodicChallenges(list).find(
      (p) => typeof p.startAge === "number" && age >= p.startAge && (p.endAge === null || p.endAge === undefined || age <= p.endAge),
    ) ?? null
  );
}

/** Zaman çizelgesi / liste etiketi için yaş aralığı metni ("0–28", "47+", ana zorlukta "tüm yaşam"). */
export function challengeAgeLabel(p: ChallengeLike): string {
  if (isMainChallenge(p)) return "tüm yaşam";
  return `${p.startAge}${p.endAge === null || p.endAge === undefined ? "+" : `–${p.endAge}`}`;
}
