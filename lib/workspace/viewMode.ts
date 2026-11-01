/**
 * KİŞİSEL DİJİTAL OFİS (P4) — görünüm modları (Otomatik / Gündüz / Gece / Okuma / Odak).
 *
 * Görünüm modu tasarımdan BAĞIMSIZ bir sunum tercihidir (UiPrefs.viewMode); kişisel tasarımı değiştirmez, yalnız
 * uzman ana sayfasının kök öğesine (data-pw-mode) uygulanır. Genel `color-scheme`, :root, html, body DEĞİŞTİRİLMEZ.
 * "Otomatik" cihazın açık / koyu tercihine (prefers-color-scheme) uyar.
 */
import type { ViewMode } from "./catalog";
import type { ReadingPrefs } from "./schema";

export type EffectiveViewMode = "day" | "night" | "reading" | "focus";

export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

/** Saf: seçilen mod + cihaz koyu tercihi → uygulanan mod. */
export function resolveViewMode(mode: ViewMode | null | undefined, prefersDark: boolean): EffectiveViewMode {
  if (mode === "day" || mode === "night" || mode === "reading" || mode === "focus") return mode;
  return prefersDark ? "night" : "day";
}

/** Tarayıcıda cihaz koyu tercihi (SSR / matchMedia yok → false). */
export function readPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(PREFERS_DARK_QUERY).matches;
}

/** useSyncExternalStore için abonelik (tercih değişince yeniden çizim). */
export function subscribePrefersDark(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(PREFERS_DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Okuma tercihleri → kök öğeye konacak CSS özel değişkenleri (değerler şemada sınırlandırılmıştır). */
export function readingVars(r: ReadingPrefs): Record<string, string> {
  const scale = Number.isFinite(r.scale) ? Math.min(1.5, Math.max(1, r.scale)) : 1.15;
  const lh = Number.isFinite(r.lineHeight) ? Math.min(2.1, Math.max(1.4, r.lineHeight)) : 1.7;
  const w = r.width === 58 || r.width === 68 || r.width === 80 ? r.width : 68;
  return { "--pw-rd-scale": String(scale), "--pw-rd-lh": String(lh), "--pw-rd-w": `${w}ch` };
}
