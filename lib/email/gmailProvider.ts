/**
 * GİRİŞ GÜVENLİĞİ F2-D — Google Workspace / Gmail API sağlayıcısı (yalnız server-side).
 *
 * Yetki: YALNIZ `https://www.googleapis.com/auth/gmail.send` (okuma/silme/ayar YOK). Gönderen: Workspace'te
 * bu iş için ayrılmış tek posta kutusu (GMAIL_SENDER). Kimlik: OAuth 2.0 yenileme token'ı
 * (GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET / GMAIL_OAUTH_REFRESH_TOKEN — Vercel şifreli env;
 * kurulum: docs/giris-guvenligi/f2d-google-workspace-kurulum.md). Alan geneli yetkilendirme (domain-wide
 * delegation) KULLANILMAZ.
 * Erişim token'ı yalnız bellekte (≤ süresi − 60 sn). Zaman aşımı 10 sn; 5xx/ağ → 1 tekrar; 401 → token
 * yenileyip 1 tekrar; 429/kota → tekrar YOK (kod 'quota'). Gizli değer / ileti içeriği loglanmaz.
 */
import { buildMimeMessage, isSafeEmailAddress } from "@/lib/email/mime";
import type { EmailMessage, EmailProvider, EmailSendResult } from "@/lib/email/provider";

type Env = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const TIMEOUT_MS = 10_000;

async function withTimeout(f: FetchLike, url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await f(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export function createGmailProvider(env: Env = process.env, fetchImpl: FetchLike = fetch): EmailProvider | null {
  const clientId = String(env.GMAIL_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.GMAIL_OAUTH_CLIENT_SECRET ?? "").trim();
  const refreshToken = String(env.GMAIL_OAUTH_REFRESH_TOKEN ?? "").trim();
  const sender = String(env.GMAIL_SENDER ?? "").trim();
  const fromName = String(env.GMAIL_SENDER_NAME ?? "Yaşam Sistemi").trim() || "Yaşam Sistemi";
  if (!clientId || !clientSecret || !refreshToken || !isSafeEmailAddress(sender)) return null;

  let access: { token: string; until: number } | null = null;

  async function getAccessToken(force = false): Promise<{ ok: true; token: string } | { ok: false; code: "oauth_invalid_grant" | "oauth_error" | "network" }> {
    if (!force && access && access.until > Date.now()) return { ok: true, token: access.token };
    let res: Response;
    try {
      res = await withTimeout(fetchImpl, TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
      });
    } catch {
      return { ok: false, code: "network" };
    }
    const j = (await res.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; error?: unknown; scope?: unknown };
    if (!res.ok || typeof j.access_token !== "string") {
      // invalid_grant: yenileme token'ı iptal/süresi dolmuş → Owner yeniden yetkilendirmeli (zil bildirimi).
      return { ok: false, code: j.error === "invalid_grant" ? "oauth_invalid_grant" : "oauth_error" };
    }
    // F2-I: verilen yetki kapsamı YALNIZ gmail.send olmalı (daha geniş kapsamlı token kullanılmaz; kurulum hatası).
    if (typeof j.scope === "string" && j.scope.split(/\s+/).filter(Boolean).some((s) => s !== GMAIL_SEND_SCOPE)) {
      return { ok: false, code: "oauth_error" };
    }
    const ttl = Number(j.expires_in);
    access = { token: j.access_token, until: Date.now() + Math.max(60, (Number.isFinite(ttl) ? ttl : 3600) - 60) * 1000 };
    return { ok: true, token: j.access_token };
  }

  async function sendOnce(raw: string, token: string): Promise<Response> {
    return withTimeout(fetchImpl, SEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
  }

  return {
    name: "gmail",
    async send(msg: EmailMessage): Promise<EmailSendResult> {
      if (!isSafeEmailAddress(msg.to)) return { ok: false, code: "rejected", retryable: false };
      let raw: string;
      try {
        raw = Buffer.from(buildMimeMessage({ fromName, fromAddress: sender, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }), "utf8").toString("base64url");
      } catch {
        return { ok: false, code: "rejected", retryable: false };
      }
      let tok = await getAccessToken();
      if (!tok.ok) return { ok: false, code: tok.code, retryable: tok.code === "network" };
      for (let attempt = 0; attempt < 2; attempt++) {
        let res: Response;
        try {
          res = await sendOnce(raw, tok.token);
        } catch {
          // F2-K (L5): zaman aşımı / bağlantı kopması → ileti Gmail'e ULAŞMIŞ olabilir; otomatik ikinci gönderim YOK
          // (kopya e-posta + kota). Kullanıcı bekleme süresinden sonra "yeniden gönder" ile ister.
          return { ok: false, code: "network", retryable: true };
        }
        if (res.ok) {
          const j = (await res.json().catch(() => ({}))) as { id?: unknown };
          return { ok: true, providerMessageId: typeof j.id === "string" ? j.id : null };
        }
        if (res.status === 401 && attempt === 0) {
          tok = await getAccessToken(true);
          if (!tok.ok) return { ok: false, code: tok.code, retryable: false };
          continue;
        }
        const body = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[]; status?: string } };
        const reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? "";
        if (res.status === 429 || /rateLimit|quota|dailyLimit|RESOURCE_EXHAUSTED/i.test(reason)) {
          return { ok: false, code: "quota", retryable: false };
        }
        if (res.status >= 500 && attempt === 0) continue;
        if (res.status >= 500) return { ok: false, code: "provider_down", retryable: true };
        return { ok: false, code: res.status === 401 || res.status === 403 ? "oauth_error" : "rejected", retryable: false };
      }
      return { ok: false, code: "provider_down", retryable: true };
    },
  };
}
