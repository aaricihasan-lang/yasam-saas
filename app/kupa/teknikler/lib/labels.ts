/**
 * KUPA TEKNİKLERİ — kullanıcı-facing etiketler (FAZ 4 / 2B).
 *
 * Normal UI ASLA ham enum kodu (dry/wet/stationary/gliding/unspecified) göstermez;
 * yalnız buradaki TR etiketler. movement_style opsiyonel/ikincildir (canonical
 * geleneksel sınıflandırma DEĞİL). kind burada YOKTUR (legacy; yeni UI kullanmaz).
 */

export const TECHNIQUE_TYPE_LABEL: Record<string, string> = {
  dry: "Kuru Kupa",
  wet: "Yaş Kupa / Hacamat",
  unspecified: "Belirtilmemiş",
};

export const MOVEMENT_STYLE_LABEL: Record<string, string> = {
  stationary: "Sabit",
  gliding: "Kaydırmalı",
  flash: "Flaş",
  unspecified: "Belirtilmemiş",
};

/** Boş/null → "Belirtilmemiş". */
export function techniqueTypeLabel(v: string | null | undefined): string {
  return TECHNIQUE_TYPE_LABEL[v ?? ""] ?? TECHNIQUE_TYPE_LABEL.unspecified;
}
export function movementStyleLabel(v: string | null | undefined): string {
  return MOVEMENT_STYLE_LABEL[v ?? ""] ?? MOVEMENT_STYLE_LABEL.unspecified;
}

/** movement_style yalnızca gerçek bir değer taşıyorsa gösterilir (ikincil chip). */
export function hasMovement(v: string | null | undefined): boolean {
  return !!v && v !== "unspecified";
}

/** Edit/create select seçenekleri ("" = Belirtilmemiş, payload'da null'a çevrilir). */
export const TYPE_OPTIONS = [
  { value: "", label: "Belirtilmemiş" },
  { value: "dry", label: "Kuru Kupa" },
  { value: "wet", label: "Yaş Kupa / Hacamat" },
] as const;

export const MOVEMENT_OPTIONS = [
  { value: "", label: "Belirtilmemiş" },
  { value: "stationary", label: "Sabit" },
  { value: "gliding", label: "Kaydırmalı" },
  { value: "flash", label: "Flaş" },
] as const;

/** Liste filtreleri için "Tümü" + tip seçenekleri (unspecified dahil). */
export const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "Tümü" },
  { value: "dry", label: "Kuru Kupa" },
  { value: "wet", label: "Yaş Kupa / Hacamat" },
  { value: "unspecified", label: "Belirtilmemiş" },
] as const;

export const MOVEMENT_FILTER_OPTIONS = [
  { value: "all", label: "Tümü" },
  { value: "stationary", label: "Sabit" },
  { value: "gliding", label: "Kaydırmalı" },
  { value: "flash", label: "Flaş" },
  { value: "unspecified", label: "Belirtilmemiş" },
] as const;

/** Güvenlik severity → sakin kullanıcı etiketi (ham kod gösterilmez). */
export const SAFETY_SEVERITY_LABEL: Record<string, string> = {
  info: "Bilgi",
  warning: "Uyarı",
  contraindication: "Kontrendikasyon",
};
export const CONTRA_CLASS_LABEL: Record<string, string> = {
  absolute: "Mutlak",
  relative: "Göreceli",
  none: "Yok",
};
