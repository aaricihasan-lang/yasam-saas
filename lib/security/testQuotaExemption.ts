/**
 * Geçici TEST KOTASI MUAFİYETİ (2026-10-19, owner talimatı — satış öncesi yoğun test penceresi).
 *
 * Ne yapar: yalnız aşağıdaki LİSTELİ uygulama kotalarında, yalnız sunucuda oturumu doğrulanmış ve env ile açıkça listelenmiş
 * test/owner kullanıcı kimlikleri için, yalnız sunucu saatine göre açık bir zaman penceresinde, sınırı SABİT bir çarpanla
 * YÜKSELTİR (sınırsız DEĞİL — sağlayıcı kredisi ve DB yine korunur).
 *
 * Ne YAPMAZ (bilinçli): eşzamanlı aynı-girdi kilitlerine (`*-inflight`), auth/kayıt/parola/destek/CSP sınırlarına, kayıt
 * sayısı tavanlarına, RLS'e, demo salt-okunur politikasına, sağlayıcının kendi 429/kota yanıtlarına DOKUNMAZ.
 *
 * Etkinleştirme (yalnız sunucu env; istemciden gelen rol / user id / header ASLA yetki sayılmaz):
 *   TEST_QUOTA_EXEMPT_USER_IDS = "<uuid>,<uuid>"        (en çok 10 UUID; doğrulanmış oturumun user id'si ile eşleşir)
 *   TEST_QUOTA_EXEMPT_WINDOW   = "<ISO başlangıç>/<ISO bitiş>"  (bitiş − başlangıç ≤ 8 saat; aksi hâlde muafiyet KAPALI)
 * Pencere bitince (sunucu saati) muafiyet kendiliğinden kapanır; env silinmese bile normal kotalar geçerlidir.
 * Env tanımsız / hatalı → tüm sınırlar BİREBİR eskisi gibi (davranış değişmez).
 */

export const TEST_QUOTA_MAX_WINDOW_MS = 8 * 60 * 60 * 1000;
export const TEST_QUOTA_MULTIPLIER = 10;
export const TEST_QUOTA_MAX_USERS = 10;

/** Yükseltilebilen kotalar (hepsi kullanıcı/tenant hacim sınırı). Kilitler ve güvenlik sınırları bu listede YOKTUR. */
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
 * Bir kota kontrolünde kullanılacak sınır. `userId` YALNIZ sunucuda doğrulanmış oturumdan gelmelidir (guard / EngineCtx).
 * Muafiyet yoksa `baseLimit` aynen döner.
 */
export function testQuotaLimit(scope: TestQuotaScope, userId: string | null | undefined, baseLimit: number, env: Record<string, string | undefined> = process.env, now: number = Date.now()): number {
  if (!userId || !(TEST_QUOTA_SCOPES as readonly string[]).includes(scope)) return baseLimit;
  const s = readTestQuotaExemption(env, now);
  if (!s.active || !s.userIds.has(userId.toLowerCase())) return baseLimit;
  const elevated = baseLimit * TEST_QUOTA_MULTIPLIER;
  // PII'siz iz: kullanıcı kimliği / tenant / istek içeriği YAZILMAZ — yalnız kapsam ve pencere sonu.
  console.info("[test-quota] elevated", { scope, baseLimit, elevated, windowEndsAt: new Date(s.endsAt).toISOString() });
  return elevated;
}
