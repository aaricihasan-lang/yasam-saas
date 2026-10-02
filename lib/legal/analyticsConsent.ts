/**
 * Google Analytics onay (consent) kaydı — SAF modül (P1-6 §3.4).
 *
 * KURAL:
 *   - GA, ziyaretçi açıkça "Kabul et" demeden (karar === "granted") HİÇ yüklenmez.
 *   - Karar, tarayıcının yerel depolamasında zorunlu bir tercih kaydı olarak tutulur:
 *     yalnız karar + ISO tarih. Kişisel veri, kimlik, IP veya cihaz bilgisi YOK.
 *   - Okuma/yazma hataları (gizli sekme, engellenmiş depolama) sessizce "karar yok"
 *     olarak ele alınır; uygulama akışı bozulmaz.
 *   - Reddet / geri çekme → `ga-disable-<ID>` + `_ga`, `_ga_*` çerezleri silinir.
 *     Zorunlu çerezlere (yönetici oturumu, dil tercihi) dokunulmaz.
 *
 * DOM'a doğrudan bağımlı değildir: depolama/çerez erişimi parametre olarak verilebilir
 * (harness ile test edilir). Tarayıcıda varsayılan olarak window.localStorage /
 * document.cookie kullanılır.
 */

export const CONSENT_STORAGE_KEY = "yasam_analytics_consent_v1";

/** Çerez tercihleri penceresini yeniden açmak için yayınlanan pencere olayı. */
export const CONSENT_OPEN_EVENT = "yasam:analytics-consent-open";

/** Karar değiştiğinde (kabul/ret/sıfırlama) yayınlanan pencere olayı. */
export const CONSENT_CHANGE_EVENT = "yasam:analytics-consent-change";

export type AnalyticsConsentDecision = "granted" | "denied";

export type AnalyticsConsentRecord = {
  decision: AnalyticsConsentDecision;
  /** Kararın verildiği an (ISO 8601). */
  decidedAt: string;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function isDecision(v: unknown): v is AnalyticsConsentDecision {
  return v === "granted" || v === "denied";
}

/** Ham depolama değerini çözer; geçersiz/bozuk değer → null (karar yok). */
export function parseConsentRecord(raw: string | null | undefined): AnalyticsConsentRecord | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const p = parsed as Record<string, unknown>;
    if (!isDecision(p.decision)) return null;
    const decidedAt = typeof p.decidedAt === "string" && !Number.isNaN(Date.parse(p.decidedAt)) ? p.decidedAt : null;
    if (!decidedAt) return null;
    return { decision: p.decision, decidedAt };
  } catch {
    return null;
  }
}

/** Kaydedilen değer: yalnız karar + ISO tarih (başka alan yazılmaz). */
export function serializeConsentRecord(decision: AnalyticsConsentDecision, now: Date = new Date()): string {
  return JSON.stringify({ decision, decidedAt: now.toISOString() });
}

export function readAnalyticsConsent(storage: StorageLike | null = defaultStorage()): AnalyticsConsentRecord | null {
  if (!storage) return null;
  try {
    return parseConsentRecord(storage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Kararı yazar. Başarılıysa true; depolama yoksa/engelliyse false (karar yalnız bu sayfa için geçerli kalır). */
export function writeAnalyticsConsent(
  decision: AnalyticsConsentDecision,
  storage: StorageLike | null = defaultStorage(),
  now: Date = new Date(),
): boolean {
  if (!isDecision(decision) || !storage) return false;
  try {
    storage.setItem(CONSENT_STORAGE_KEY, serializeConsentRecord(decision, now));
    return true;
  } catch {
    return false;
  }
}

/** Kaydı siler (tercihler penceresi yeniden açıldığında). */
export function clearAnalyticsConsent(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    /* depolama erişilemezse yok sayılır */
  }
}

/** GA yüklenebilir mi? YALNIZ açık "granted" kararı. */
export function isAnalyticsConsentGranted(record: AnalyticsConsentRecord | null | undefined): boolean {
  return record?.decision === "granted";
}

/** Analitik çerez adı mı? (`_ga` veya `_ga_<...>`; zorunlu çerezler ASLA eşleşmez) */
export function isAnalyticsCookieName(name: string): boolean {
  const n = name.trim();
  return n === "_ga" || /^_ga_[A-Za-z0-9]+$/.test(n);
}

/** `document.cookie` dizesinden silinecek analitik çerez adlarını çıkarır. */
export function analyticsCookieNames(cookieHeader: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(cookieHeader ?? "").split(";")) {
    const name = part.split("=")[0]?.trim() ?? "";
    if (name && isAnalyticsCookieName(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * Bir analitik çerezini silmek için yazılacak `document.cookie` atamaları.
 * GA çerezleri üst alan adına (`.yasamsistemi.com`) ya da yalnız host'a yazılabildiğinden
 * hem host-only hem alan adı varyantları üretilir (path=/).
 */
export function cookieDeletionAssignments(name: string, hostname: string | null | undefined): string[] {
  if (!isAnalyticsCookieName(name)) return [];
  const expire = "expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=/";
  const out = [`${name}=; ${expire}`];
  const host = String(hostname ?? "").trim().toLowerCase();
  const domains = new Set<string>();
  if (host && host !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    domains.add(host);
    domains.add(`.${host}`);
    const parts = host.split(".");
    if (parts.length > 2) domains.add(`.${parts.slice(-2).join(".")}`);
  }
  if (host === "yasamsistemi.com" || host.endsWith(".yasamsistemi.com")) domains.add(".yasamsistemi.com");
  for (const d of domains) out.push(`${name}=; ${expire}; domain=${d}`);
  return out;
}
