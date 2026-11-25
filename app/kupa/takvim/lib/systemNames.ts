/**
 * Hacamat Takvimi — SİSTEMİN ÜRETTİĞİ varsayılan adlar (kayıt + gösterim kuralı). I18N-F1-R3 düzeltmesi.
 *
 * Owner kuralı: kullanıcının yazdığı ad AYNEN korunur; sistemin ürettiği ad dil değişiminde doğru gösterilir;
 * toplu yeniden adlandırma / migration YOK.
 *
 * - KAYIT: yeni planın varsayılan adı ve boş danışan bilgilendirmesinin varsayılan başlığı DB'ye HER ZAMAN
 *   Türkçe sabit yazılır (i18n öncesi davranışla birebir: `${year} Hacamat Takvimi`, "Danışan Bilgilendirmesi").
 *   Word çıktısı kayıtlı adı olduğu gibi basar (Türkçe kalır).
 * - GÖSTERİM: kayıtlı ad, sistemin Türkçe VEYA (gece f428429e4 sürümünün ekran dilinde kaydetmiş olabileceği)
 *   İngilizce varsayılan adıyla TAM eşleşiyorsa ekran dilinde üretilir; aksi hâlde kullanıcının adı aynen gösterilir.
 *
 * Saf modül (React/Next yok) → tsx testleriyle doğrudan sınanır.
 */

// i18n-ignore: DB'ye yazılan kanonik varsayılan ad kalıbı (i18n öncesi `${year} Hacamat Takvimi` ile birebir; Word çıktısına basılır)
const PLAN_NAME_TR_SUFFIX = " Hacamat Takvimi";
// Gece sürümünün (f428429e4) EN ekranda kaydetmiş olabileceği biçim — yalnız TANIMA için (asla yazılmaz).
const PLAN_NAME_LEGACY_EN_SUFFIX = " Hijama Calendar";
// i18n-ignore: DB'ye yazılan kanonik boş danışan bilgilendirmesi başlığı (i18n öncesi metinle birebir)
export const CLIENT_ADVICE_DEFAULT_TITLE_TR = "Danışan Bilgilendirmesi";
// Gece sürümünün EN ekranda kaydetmiş olabileceği başlık — yalnız TANIMA için (asla yazılmaz).
const CLIENT_ADVICE_LEGACY_EN_TITLE = "Client Information";

/** Yeni planın DB'ye yazılacak varsayılan adı (ekran dilinden BAĞIMSIZ, Türkçe). */
export function defaultPlanNameForSave(year: number): string {
  return `${String(year)}${PLAN_NAME_TR_SUFFIX}`;
}

/** Kayıtlı plan adı, o planın yılıyla kurulan sistem varsayılanı mı (TR veya eski EN; tam eşleşme)? */
export function isSystemPlanName(name: string | null | undefined, year: number): boolean {
  if (typeof name !== "string") return false;
  const y = String(year);
  return name === `${y}${PLAN_NAME_TR_SUFFIX}` || name === `${y}${PLAN_NAME_LEGACY_EN_SUFFIX}`;
}

/** Kayıtlı danışan bilgilendirmesi başlığı sistem varsayılanı mı (TR veya eski EN; tam eşleşme)? */
export function isSystemClientAdviceTitle(title: string | null | undefined): boolean {
  return title === CLIENT_ADVICE_DEFAULT_TITLE_TR || title === CLIENT_ADVICE_LEGACY_EN_TITLE;
}

/**
 * Gösterilecek plan adı. `localizedDefault(year)` ekran dilindeki varsayılan adı üretir
 * (cupping.calendar.ws.defaultPlanName). Sistem adı değilse kullanıcının adı AYNEN döner.
 *
 * I18N A8 — üç durumlu `name_is_default` (kolon migration TASLAĞINDA; uygulanana kadar alan hiç gelmez):
 *   true  → her zaman ekran dilinde üretilir (dil-bağımsız tanım: bayrak + year)
 *   false → AYNEN (kullanıcı adı; uzman tam "2027 Hacamat Takvimi" yazmış olsa bile desen uygulanmaz)
 *   null / alan yok → bugünkü desen kuralı AYNEN (eski kayıtlar; geriye dönük sınıflandırma YOK)
 */
export function displayPlanName(
  plan: { name: string; year: number; name_is_default?: boolean | null },
  localizedDefault: (year: string) => string,
): string {
  if (plan.name_is_default === true) return localizedDefault(String(plan.year));
  if (plan.name_is_default === false) return plan.name;
  return isSystemPlanName(plan.name, plan.year) ? localizedDefault(String(plan.year)) : plan.name;
}

/** Gösterilecek danışan bilgilendirmesi başlığı (sistem varsayılanıysa ekran dilinde; değilse aynen). */
export function displayClientAdviceTitle(title: string, localizedDefault: () => string): string {
  return isSystemClientAdviceTitle(title) ? localizedDefault() : title;
}
