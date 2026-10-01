/**
 * GA onay kararının tarayıcı tarafı yan etkileri (P1-6 §3.4).
 *
 * Saf kurallar lib/legal/analyticsConsent.ts'dedir; bu dosya yalnız bunları
 * window/document üzerinde uygular:
 *   - kararı yazar/siler ve CONSENT_CHANGE_EVENT yayınlar,
 *   - karar "granted" değilse `ga-disable-<ID>` bayrağını açar ve `_ga` / `_ga_*`
 *     çerezlerini (path=/; host ve alan adı varyantları) siler.
 * Zorunlu çerezlere (yönetici oturumu, NEXT_LOCALE) ve yerel depolamadaki oturum
 * anahtarlarına DOKUNULMAZ.
 */
import { GA_MEASUREMENT_ID } from "@/lib/legal/analyticsPolicy";
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_OPEN_EVENT,
  analyticsCookieNames,
  clearAnalyticsConsent,
  cookieDeletionAssignments,
  isAnalyticsConsentGranted,
  readAnalyticsConsent,
  writeAnalyticsConsent,
  type AnalyticsConsentDecision,
} from "@/lib/legal/analyticsConsent";

export const GA_DISABLE_KEY = `ga-disable-${GA_MEASUREMENT_ID}` as const;

/** Bu sayfa yüklemesi boyunca geçerli karar (depolama engelliyse yedek). */
let memoryDecision: AnalyticsConsentDecision | null = null;

/** Güncel karar "granted" mı? (depolama → bellek yedeği) */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  const stored = readAnalyticsConsent();
  if (stored) return isAnalyticsConsentGranted(stored);
  return memoryDecision === "granted";
}

/** Ziyaretçi bir karar vermiş mi? */
export function hasAnalyticsDecision(): boolean {
  if (typeof window === "undefined") return false;
  return readAnalyticsConsent() !== null || memoryDecision !== null;
}

/** GA'yı susturur ve analitik çerezlerini siler (zorunlu çerezler korunur). */
export function disableAnalyticsAndPurgeCookies(): void {
  if (typeof window === "undefined") return;
  try {
    window[GA_DISABLE_KEY] = true;
  } catch {
    /* yok sayılır */
  }
  try {
    const host = window.location.hostname;
    for (const name of analyticsCookieNames(document.cookie)) {
      for (const assignment of cookieDeletionAssignments(name, host)) document.cookie = assignment;
    }
  } catch {
    /* çerez erişimi engelliyse yok sayılır */
  }
}

function emitChange(): void {
  try {
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
  } catch {
    /* yok sayılır */
  }
}

/** Ziyaretçi kararını kaydeder. "denied" → GA susturulur + çerezler silinir. */
export function setAnalyticsConsent(decision: AnalyticsConsentDecision): void {
  if (typeof window === "undefined") return;
  memoryDecision = decision;
  writeAnalyticsConsent(decision);
  if (decision !== "granted") disableAnalyticsAndPurgeCookies();
  emitChange();
}

/**
 * Tercihi sıfırlar (geri çekme) ve tercih penceresini yeniden açar. Yeni karar
 * verilene kadar GA susturulur ve analitik çerezleri silinir.
 */
export function reopenAnalyticsConsent(): void {
  if (typeof window === "undefined") return;
  memoryDecision = null;
  clearAnalyticsConsent();
  disableAnalyticsAndPurgeCookies();
  emitChange();
  try {
    window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
  } catch {
    /* yok sayılır */
  }
}
