/**
 * HTTPONLY WEB SESSION (H1–H4) — MERKEZİ OTURUM TAŞIMA ÇÖZÜCÜSÜ (yalnız server).
 *
 * Token'ın NEREDEN geldiğini soyutlar; YETKİ mantığı DEĞİŞMEZ (session→user bağı, x-user-id /
 * x-admin-id binding, tenant, modül, aktiflik/onay, admin rolü, süre ve revoke guard'larda ve
 * touch_active_session RPC'sinde aynen kalır).
 *
 * KURALLAR (deterministik):
 *   off (varsayılan)  : YALNIZ `x-session-token`. Cookie TAMAMEN yok sayılır. Bugünkü davranış birebir
 *                       (tek doğrulama çağrısı, aynı token).
 *   Android isteği    : her modda off ile aynı (cookie yok sayılır).
 *   canary / shadow   : header BİRİNCİL ve ZORUNLU (cookie tek başına auth DEĞİL). Cookie varsa ve
 *                       header'dan farklıysa İKİSİ de doğrulanır:
 *                         · header geçersiz            → geçersiz (bugünkü gibi 401)
 *                         · cookie BAŞKA kullanıcı      → CONFLICT (401, fail-closed)
 *                         · cookie geçersiz / aynı kullanıcının başka oturumu → header ile devam + telemetri
 *   primary           : cookie BİRİNCİL, header geri dönüş (yalnız cookie YOKSA).
 *                         · ikisi eşit                  → tek doğrulama (header JS kanıtı → CSRF gerekmez)
 *                         · yalnız cookie               → CSRF kontrolü (durum değiştiren metotta) + doğrulama
 *                         · ikisi farklı                → İKİSİ de geçerli VE aynı kullanıcı olmalı; aksi halde
 *                                                         başka kullanıcı → CONFLICT, biri geçersiz → geçersiz.
 *                                                         (Revoke edilmiş bir credential diğeriyle BYPASS EDİLEMEZ.)
 *
 * Ek RPC yalnız iki FARKLI credential geldiğinde (uyuşmazlık) yapılır.
 * Token/cookie değerleri ASLA loglanmaz; telemetri yalnız olay türü + mod içerir.
 */
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveSessionUserId } from "@/lib/auth/sessionSecurity";
import {
  getSessionCookieConfig,
  isAndroidAppRequest,
  readWebSessionCookie,
  type SessionCookieConfig,
  type SessionCookieMode,
} from "@/lib/auth/sessionCookie";
import { checkCookieAuthCsrf } from "@/lib/security/csrf";

export type SessionCredentialSource = "header" | "cookie";

export type SessionCredentialPick =
  | { kind: "none" }
  | { kind: "csrf_denied" }
  | {
      kind: "credential";
      mode: SessionCookieMode;
      token: string;
      source: SessionCredentialSource;
      /** Doğrulanması gereken İKİNCİ (farklı) credential — yalnız uyuşmazlıkta. */
      secondary: string | null;
    };

export type SessionTransportEnv = Record<string, string | undefined>;

/** İstekten kullanılacak credential'ı seçer (DB YOK; saf + deterministik). */
export function pickSessionCredential(
  req: NextRequest,
  cfg: SessionCookieConfig = getSessionCookieConfig(),
  env: SessionTransportEnv = process.env,
): SessionCredentialPick {
  const header = req.headers.get("x-session-token")?.trim() ?? "";
  const headerOnly = (): SessionCredentialPick =>
    header ? { kind: "credential", mode: cfg.mode, token: header, source: "header", secondary: null } : { kind: "none" };

  if (cfg.mode === "off" || isAndroidAppRequest(req.headers)) return headerOnly();

  const cookie = readWebSessionCookie(req);

  if (cfg.mode === "canary" || cfg.mode === "shadow") {
    if (!header) return { kind: "none" };
    return {
      kind: "credential",
      mode: cfg.mode,
      token: header,
      source: "header",
      secondary: cookie && cookie !== header ? cookie : null,
    };
  }

  // primary
  if (!cookie) return headerOnly();
  if (header === cookie) return headerOnly();
  if (header) {
    return { kind: "credential", mode: cfg.mode, token: cookie, source: "cookie", secondary: header };
  }
  // Yalnız cookie → gerçek cookie-auth: CSRF katmanı.
  if (!checkCookieAuthCsrf(req.method, req.headers, env).ok) {
    logSessionTransportEvent("csrf_denied", cfg.mode);
    return { kind: "csrf_denied" };
  }
  return { kind: "credential", mode: cfg.mode, token: cookie, source: "cookie", secondary: null };
}

export type SessionUserResolution =
  | { status: "ok"; userId: string; token: string; source: SessionCredentialSource }
  | { status: "invalid" }
  | { status: "conflict" };

export type SessionValidator = (db: SupabaseClient, token: string) => Promise<string | null>;

/**
 * Seçilen credential'ı doğrular. off modda / tek credential'da çağrı BİREBİR bugünkü gibidir:
 * `getActiveSessionUserId(db, token)` tek kez.
 */
export async function resolveSessionUserId(
  db: SupabaseClient,
  pick: Extract<SessionCredentialPick, { kind: "credential" }>,
  validate: SessionValidator = getActiveSessionUserId,
): Promise<SessionUserResolution> {
  if (!pick.secondary) {
    const userId = await validate(db, pick.token);
    return userId ? { status: "ok", userId, token: pick.token, source: pick.source } : { status: "invalid" };
  }

  const [primaryUser, secondaryUser] = await Promise.all([
    validate(db, pick.token),
    validate(db, pick.secondary),
  ]);

  if (primaryUser && secondaryUser && primaryUser !== secondaryUser) {
    logSessionTransportEvent("identity_conflict", pick.mode);
    return { status: "conflict" };
  }

  if (pick.mode === "primary") {
    if (!primaryUser || !secondaryUser) {
      logSessionTransportEvent("primary_credential_invalid", pick.mode);
      return { status: "invalid" };
    }
    logSessionTransportEvent("same_user_other_session", pick.mode);
    return { status: "ok", userId: primaryUser, token: pick.token, source: pick.source };
  }

  // canary / shadow: header (pick.token) birincil.
  if (!primaryUser) return { status: "invalid" };
  logSessionTransportEvent(secondaryUser ? "same_user_other_session" : "cookie_invalid", pick.mode);
  return { status: "ok", userId: primaryUser, token: pick.token, source: pick.source };
}

/**
 * Guard'lar için tek adım: seç + doğrula. Dönüş guard'ın mevcut yanıt eşlemesine uygundur.
 *   none → 401 (oturum doğrulaması gerekli) · csrf_denied → 403 · invalid → 401 · conflict → 401
 */
export type RequestSessionResult =
  | SessionUserResolution
  | { status: "none" }
  | { status: "csrf_denied" };

export async function resolveRequestSession(
  db: SupabaseClient,
  req: NextRequest,
  validate?: SessionValidator,
): Promise<RequestSessionResult> {
  const pick = pickSessionCredential(req);
  if (pick.kind === "none") return { status: "none" };
  if (pick.kind === "csrf_denied") return { status: "csrf_denied" };
  return resolveSessionUserId(db, pick, validate);
}

export type SessionTransportEventKind =
  | "identity_conflict"
  | "primary_credential_invalid"
  | "same_user_other_session"
  | "cookie_invalid"
  | "csrf_denied";

/** Güvenlik telemetrisi: YALNIZ olay türü + mod. Token, cookie, kullanıcı id, IP YOK. */
export function logSessionTransportEvent(kind: SessionTransportEventKind, mode: SessionCookieMode): void {
  try {
    console.warn(JSON.stringify({ evt: "session_transport", kind, mode }));
  } catch {
    /* telemetri asla akışı bozmaz */
  }
}
