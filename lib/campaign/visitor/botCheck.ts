/**
 * Gece operasyonu — kampanya bot doğrulaması (Cloudflare Turnstile; YALNIZ SUNUCU).
 *
 * Kural: ücretli (sağlayıcı kredili) teknik, sunucu tarafında doğrulanmış TEK KULLANIMLIK bot belirteci olmadan
 * rezervasyona bile gidemez. Yapılandırma yoksa ücretli teknikler KAPALI (fail-closed); yerel (0 kredi) teknikler
 * hız sınırıyla çalışmaya devam eder.
 *
 *   Ortam: TURNSTILE_SECRET_KEY (sunucu) + NEXT_PUBLIC_TURNSTILE_SITE_KEY (tarayıcı). İsteğe bağlı CAMPAIGN_BOT_HOSTNAMES
 *          (virgülle; doluysa siteverify "hostname" bu listede olmalı). CAMPAIGN_BOT_VERIFY_URL yalnız yerel test içindir ve
 *          YALNIZ 127.0.0.1 / localhost adresinde kabul edilir (başka her değer yok sayılır → gerçek Cloudflare ucu).
 *   Denetim: belirteç biçimi → DB'de tek kullanım kovası (aynı belirteç ikinci kez → red; DB sayacı yoksa fail-closed) →
 *            siteverify (secret, response, remoteip, idempotency_key; 5 sn zaman aşımı) → success + action "kampanya" +
 *            hostname (liste varsa) + challenge_ts en çok 5 dakika önce.
 *   Gizlilik: belirteç ve IP loglanmaz; DB'ye yalnız belirteç özetinin HMAC kovası gider.
 */
import { createHash, randomUUID } from "node:crypto";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { rateLimitBucket } from "@/lib/security/dbRateLimit";

assertServerOnly("lib/campaign/visitor/botCheck");

export const BOT_ACTION = "kampanya";
export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const BOT_TOKEN_MAX_AGE_MS = 5 * 60_000;
export const BOT_TOKEN_REUSE_WINDOW_S = 600;
const TOKEN_RE = /^[\x21-\x7e]{20,2048}$/;
const SITE_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

export type BotConfig = { secret: string; siteKey: string; verifyUrl: string; hostnames: string[] };
export type BotDenyReason = "bot_dogrulama_yok" | "bot_dogrulama_basarisiz" | "bot_altyapi";
export type BotRateLimit = (bucket: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number; mode?: "db" | "memory" }>;
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function localVerifyUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if ((u.protocol === "http:" || u.protocol === "https:") && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return u.href;
  } catch {
    /* yok say */
  }
  return null;
}

export function botConfig(env: Record<string, string | undefined>): BotConfig | null {
  const secret = (env.TURNSTILE_SECRET_KEY ?? "").trim();
  const siteKey = (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();
  if (secret.length < 16 || !SITE_KEY_RE.test(siteKey)) return null;
  const hostnames = (env.CAMPAIGN_BOT_HOSTNAMES ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return { secret, siteKey, verifyUrl: localVerifyUrl(env.CAMPAIGN_BOT_VERIFY_URL) ?? TURNSTILE_VERIFY_URL, hostnames };
}

/** Ziyaretçi sayfası için herkese açık kısım (sır YOK). */
export function publicBotInfo(env: Record<string, string | undefined>): { siteKey: string; action: string } | null {
  const c = botConfig(env);
  return c ? { siteKey: c.siteKey, action: BOT_ACTION } : null;
}

export const botTokenBucket = (token: string) => rateLimitBucket("km-bot-belirtec", createHash("sha256").update(token).digest("hex"));

export async function verifyBotToken(
  token: unknown,
  ip: string | null,
  env: Record<string, string | undefined>,
  deps: { rateLimit: BotRateLimit; fetchImpl?: FetchLike; now?: Date },
): Promise<{ ok: true } | { ok: false; reason: BotDenyReason }> {
  const cfg = botConfig(env);
  if (!cfg) return { ok: false, reason: "bot_dogrulama_yok" };
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { ok: false, reason: "bot_dogrulama_basarisiz" };
  // Tek kullanım: aynı belirteç penceresinde ikinci kez → red. Sayaç DB'de değilse (bellek yedeği) güvenilmez → fail-closed.
  let once: Awaited<ReturnType<BotRateLimit>>;
  try {
    once = await deps.rateLimit(botTokenBucket(token), 1, BOT_TOKEN_REUSE_WINDOW_S);
  } catch {
    return { ok: false, reason: "bot_altyapi" };
  }
  if (once.mode === "memory") return { ok: false, reason: "bot_altyapi" };
  if (!once.allowed) return { ok: false, reason: "bot_dogrulama_basarisiz" };
  const form = new URLSearchParams({ secret: cfg.secret, response: token, idempotency_key: randomUUID() });
  if (ip) form.set("remoteip", ip);
  const doFetch: FetchLike = deps.fetchImpl ?? ((u, i) => fetch(u, i));
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  let body: Record<string, unknown>;
  try {
    const res = await doFetch(cfg.verifyUrl, { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ac.signal, cache: "no-store" });
    if (!res.ok) return { ok: false, reason: "bot_altyapi" };
    const j = (await res.json()) as unknown;
    if (!j || typeof j !== "object" || Array.isArray(j)) return { ok: false, reason: "bot_altyapi" };
    body = j as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "bot_altyapi" };
  } finally {
    clearTimeout(timer);
  }
  if (body.success !== true) return { ok: false, reason: "bot_dogrulama_basarisiz" };
  if (body.action !== BOT_ACTION) return { ok: false, reason: "bot_dogrulama_basarisiz" };
  if (cfg.hostnames.length && !cfg.hostnames.includes(String(body.hostname ?? "").toLowerCase())) return { ok: false, reason: "bot_dogrulama_basarisiz" };
  const ts = Date.parse(String(body.challenge_ts ?? ""));
  const now = (deps.now ?? new Date()).getTime();
  if (!Number.isFinite(ts) || now - ts > BOT_TOKEN_MAX_AGE_MS || ts - now > 60_000) return { ok: false, reason: "bot_dogrulama_basarisiz" };
  return { ok: true };
}
