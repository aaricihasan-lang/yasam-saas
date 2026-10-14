/**
 * KUPA & HACAMAT — kaydedilmemiş değişiklik ("kirli") tespiti için SAF yardımcılar (birim testli).
 *
 * Kural: uyarı YALNIZ gerçek bir değişiklik varsa çıkar. Yazıp geri silmek / yalnız baş-son boşluk
 * eklemek değişiklik SAYILMAZ (kayıtta zaten kırpılır). Boolean alanlar birebir karşılaştırılır.
 */

type FormValue = string | boolean | null | undefined;

function normValue(v: FormValue): string | boolean {
  if (typeof v === "boolean") return v;
  return (v ?? "").trim();
}

/** İki form anlık görüntüsü (alan → değer) farklı mı? Anahtar birleşimi karşılaştırılır. */
export function formValuesDiffer(
  current: Readonly<Record<string, FormValue>>,
  baseline: Readonly<Record<string, FormValue>>,
): boolean {
  const keys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  for (const k of keys) {
    if (normValue(current[k]) !== normValue(baseline[k])) return true;
  }
  return false;
}

/** Açık bir form (null = kapalı) başlangıç durumundan farklı mı? Kapalı form ASLA kirli değildir. */
export function openFormDirty(
  current: Readonly<Record<string, FormValue>> | null,
  baseline: Readonly<Record<string, FormValue>> | null,
): boolean {
  if (!current) return false;
  return formValuesDiffer(current, baseline ?? {});
}

/**
 * Takvime bağlı bilgilendirme şablonu TASLAĞI kayıtlıdan farklı mı?
 * (boş seçim "" ve null eşdeğer = "şablon yok").
 */
export function templateSelectionDirty(draftId: string | null | undefined, savedId: string | null | undefined): boolean {
  return (draftId || null) !== (savedId || null);
}

/** Herhangi bir kaynak kirliyse sayfa geneli kirli (takvim: günler + şablon + açık formlar). */
export function anyDirty(...flags: readonly boolean[]): boolean {
  return flags.some(Boolean);
}
