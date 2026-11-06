/**
 * KİŞİSEL DİJİTAL OFİS (P4) — görünüm modları (Otomatik / Gündüz / Gece / Odak).
 *
 * Görünüm modu tasarımdan BAĞIMSIZ bir sunum tercihidir (UiPrefs.viewMode); kişisel tasarımı değiştirmez, yalnız
 * uzman ana sayfasının kök öğesine (data-pw-mode) uygulanır. Genel `color-scheme`, :root, html, body DEĞİŞTİRİLMEZ.
 * "Otomatik" cihazın açık / koyu tercihine (prefers-color-scheme) uyar.
 * Okuma modu Owner kararıyla kaldırıldı (KDO-06, 2026-11-02): eski kayıtta "reading" varsa Otomatik uygulanır.
 */
import type { SelectableViewMode, ViewMode } from "./catalog";

export type EffectiveViewMode = "day" | "night" | "focus";

export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

/** Kaldırılmış / bilinmeyen mod → "auto" (eski "reading" kaydı güvenle Otomatik'e döner; diğer tercihler korunur). */
export function normalizeViewMode(mode: ViewMode | string | null | undefined): SelectableViewMode {
  return mode === "day" || mode === "night" || mode === "focus" ? mode : "auto";
}

/** Saf: seçilen mod + cihaz koyu tercihi → uygulanan mod. */
export function resolveViewMode(mode: ViewMode | string | null | undefined, prefersDark: boolean): EffectiveViewMode {
  const m = normalizeViewMode(mode);
  if (m !== "auto") return m;
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
