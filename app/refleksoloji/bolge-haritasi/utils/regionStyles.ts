/** Refleksoloji bölge çizim renkleri — tüm overlay'lerde sabit kırmızı */
export const REGION_FILL = "rgba(239, 68, 68, 0.22)";
export const REGION_STROKE = "rgb(220, 38, 38)";
export const REGION_STROKE_WIDTH = 2;
export const REGION_FREE_STROKE_WIDTH = 2.5;
export const REGION_SELECTED_SHADOW = "0 0 22px rgba(239, 68, 68, 0.75), 0 0 36px rgba(239, 68, 68, 0.35)";
export const DEFAULT_REGION_COLOR = REGION_FILL;

/**
 * W09: Bölge Haritası'nda BAŞARIYLA KAYDEDİLMİŞ bölge (atlas deposunda, kaydedilmemiş taslakta değil) yeşil.
 * Kaydedilmemiş çizim yukarıdaki kırmızı paletle gösterilir. Yalnız ekran rengi — kayıtlı veri (region.color) değişmez.
 */
export const REGION_SAVED_FILL = "rgba(34, 197, 94, 0.22)";
export const REGION_SAVED_STROKE = "rgb(22, 163, 74)";
export const REGION_SAVED_SHADOW = "0 0 22px rgba(34, 197, 94, 0.75), 0 0 36px rgba(34, 197, 94, 0.35)";
