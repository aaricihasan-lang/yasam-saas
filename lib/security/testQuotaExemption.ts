/**
 * Geçici TEST KOTASI MUAFİYETİ (2026-10-19, owner kesin talimatı — satış öncesi yoğun test penceresi).
 *
 * Ne yapar: yalnız aşağıdaki LİSTELİ işlem HACMİ kotalarında, yalnız sunucuda oturumu doğrulanmış ve env ile açıkça listelenmiş
 * test/owner kullanıcı kimlikleri için, yalnız sunucu saatine göre açık bir zaman penceresinde (≤ 8 saat) o kota kontrolünü
 * TAMAMEN ATLAR (sayaç çağrılmaz). Yapay büyük sınır / çarpan YOKTUR. Diğer tüm isteklerde mevcut kontrol BİREBİR çalışır.
 *
 * Ne YAPMAZ (bilinçli): eşzamanlı aynı-girdi kilitlerine (`*-inflight`), auth / kayıt / parola / destek / oturum / CSP güvenlik
 * sınırlarına, kalıcı kayıt tavanlarına (DB tetikleyicileri), RLS'e / tenant filtresine, demo salt-okunur politikasına,
 * sağlayıcının kendi 429 / kredi yanıtlarına DOKUNMAZ.
 *
 * Etkinleştirme (yalnız sunucu env; istemciden gelen bayrak / rol / user id / header ASLA yetki sayılmaz):
 *   TEST_QUOTA_EXEMPT_USER_IDS = "<uuid>,<uuid>"                  (en çok 10 UUID; doğrulanmış oturumun user id'si ile eşleşir)
 *   TEST_QUOTA_EXEMPT_WINDOW   = "<ISO başlangıç>/<ISO bitiş>"   (bitiş − başlangıç ≤ 8 saat; aksi hâlde muafiyet KAPALI)
 * Pencere bitince (sunucu saati) muafiyet kendiliğinden kapanır; env silinmese bile normal kotalar geçerlidir.
 * Env tanımsız / hatalı → tüm sınırlar BİREBİR eskisi gibi (davranış değişmez).
 */

export const TEST_QUOTA_MAX_WINDOW_MS = 8 * 60 * 60 * 1000;
export const TEST_QUOTA_MAX_USERS = 10;

/** Atlanabilen kotalar — hepsi kullanıcı / tenant İŞLEM HACMİ sınırı. Kilitler ve güvenlik sınırları bu listede YOKTUR. */
export const TEST_QUOTA_SCOPES = Object.freeze([
  "astro-roxy-user",
  "astro-roxy-tenant",
  "astro-write",
  "astro-analysis-day",
  "hd-roxy-user",
  "hd-roxy-tenant",
  "hd-compute-user",
  "hd-chart-save-user",
] as const);
export type TestQuotaScope = (typeof TEST_QUOTA_SCOPES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TestQuotaState = { active: false; reason: string } | { active: true; userIds: ReadonlySet<string>; startsAt: number; endsAt: number };

/** Saf: env + an → durum. Hatalı her yapılandırma KAPALI döner (fail-closed). */
export function readTestQuotaExemption(env: Record<string, string | undefined> = process.env, now: number = Date.now()): TestQuotaState {
  const rawIds = (env.TEST_QUOTA_EXEMPT_USER_IDS ?? "").trim();
  const rawWindow = (env.TEST_QUOTA_EXEMPT_WINDOW ?? "").trim();
  if (!rawIds || !rawWindow) return { active: false, reason: "not-configured" };
  const ids = rawIds.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (ids.length === 0 || ids.length > TEST_QUOTA_MAX_USERS || !ids.every((id) => UUID_RE.test(id))) return { active: false, reason: "invalid-user-ids" };
  const parts = rawWindow.split("/");
  if (parts.length !== 2) return { active: false, reason: "invalid-window" };
  const startsAt = Date.parse(parts[0]);
  const endsAt = Date.parse(parts[1]);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return { active: false, reason: "invalid-window" };
  if (endsAt - startsAt > TEST_QUOTA_MAX_WINDOW_MS) return { active: false, reason: "window-too-long" };
  if (now < startsAt) return { active: false, reason: "not-started" };
  if (now >= endsAt) return { active: false, reason: "expired" };
  return { active: true, userIds: new Set(ids), startsAt, endsAt };
}

/**
 * Bu istekte `scope` hacim kotası ATLANSIN mı? `userId` YALNIZ sunucuda doğrulanmış oturumdan gelmelidir (guard / EngineCtx).
 * Demo hesap asla muaf değildir. Listede olmayan kapsam (kilit / güvenlik) asla atlanmaz.
 */
export function isTestQuotaExempt(
  scope: string,
  userId: string | null | undefined,
  opts: { isDemo?: boolean } = {},
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now(),
): boolean {
  if (!userId || opts.isDemo || !(TEST_QUOTA_SCOPES as readonly string[]).includes(scope)) return false;
  const s = readTestQuotaExemption(env, now);
  if (!s.active || !s.userIds.has(userId.toLowerCase())) return false;
  // PII'siz iz: kullanıcı kimliği / tenant / istek içeriği YAZILMAZ — yalnız kapsam ve pencere sonu.
  console.info("[test-quota] bypass", { scope, windowEndsAt: new Date(s.endsAt).toISOString() });
  return true;
}

/** Atlanan kontrolün sonucu (sayaç çağrılmadı). */
export const TEST_QUOTA_BYPASSED = Object.freeze({ allowed: true as const, retryAfterSec: 0 });

/**
 * Hacim kotası kontrolünü muafiyetle sarar: muafsa `check` HİÇ ÇAĞRILMAZ (sayaç artmaz, sınır yok);
 * değilse mevcut kontrol aynen çalışır ve sonucu döner.
 */
export async function quotaCheck<T extends { allowed: boolean; retryAfterSec: number }>(
  scope: string,
  userId: string | null | undefined,
  check: () => Promise<T>,
  opts: { isDemo?: boolean } = {},
): Promise<T | typeof TEST_QUOTA_BYPASSED> {
  return isTestQuotaExempt(scope, userId, opts) ? TEST_QUOTA_BYPASSED : check();
}
