/**
 * KM-3 — anonim ziyaretçi kimliği ve paket belirteci (YALNIZ SUNUCU).
 *
 *   IP        : Vercel başlıkları öncelikli (extractClientIp). DB'ye yalnız günlük dönen HMAC özeti gider (subject.ts).
 *   Tarayıcı  : HttpOnly + Secure + SameSite=Lax rastgele kimlik çerezi (km_z, 30 gün). İçerik kişisel veri değildir; yalnız
 *               kötüye kullanımı önlemek için günlük HMAC özeti olarak sayılır. İstemci sayacına GÜVENİLMEZ.
 *   Belirteç  : Kozmik Takvim paket oturumu (rezervasyon kimliği + bitiş) — HMAC imzalı, 2 saat; kullanım sunucuda
 *               belirteç başına hız sınırıyla sayılır.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { extractClientIp } from "@/lib/auth/sessionSecurity";
import { subjectSecret } from "../subject";

assertServerOnly("lib/campaign/visitor/identity");

export const VISITOR_COOKIE = "km_z";
export const VISITOR_COOKIE_MAX_AGE = 30 * 24 * 3600;
const COOKIE_RE = /^[A-Za-z0-9_-]{22,64}$/;

export function visitorIp(headers: Headers): string {
  return extractClientIp(headers);
}

export function readVisitorCookie(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  return COOKIE_RE.test(v) ? v : null;
}
export const newVisitorId = () => randomBytes(18).toString("base64url");

export function visitorCookieHeader(id: string, secure = true): string {
  return `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=${VISITOR_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export const PACKAGE_TOKEN_TTL_MS = 2 * 3600_000;
const TOKEN_RE = /^kp1\.([0-9a-f-]{36})\.(\d{10,14})\.([A-Za-z0-9_-]{43})$/;

function tokenSig(secret: string, reservationId: string, exp: number): string {
  return createHmac("sha256", secret).update(`km3|paket|${reservationId}|${exp}`).digest("base64url");
}

export function issuePackageToken(reservationId: string, now: Date, env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = subjectSecret(env);
  if (!secret) return null;
  const exp = now.getTime() + PACKAGE_TOKEN_TTL_MS;
  return `kp1.${reservationId}.${exp}.${tokenSig(secret, reservationId, exp)}`;
}

export function verifyPackageToken(token: unknown, now: Date, env: NodeJS.ProcessEnv = process.env): { reservationId: string } | null {
  if (typeof token !== "string") return null;
  const m = TOKEN_RE.exec(token);
  const secret = subjectSecret(env);
  if (!m || !secret) return null;
  const exp = Number(m[2]);
  if (!Number.isSafeInteger(exp) || exp <= now.getTime() || exp > now.getTime() + PACKAGE_TOKEN_TTL_MS + 60_000) return null;
  const a = Buffer.from(m[3]);
  const b = Buffer.from(tokenSig(secret, m[1], exp));
  return a.length === b.length && timingSafeEqual(a, b) ? { reservationId: m[1] } : null;
}
