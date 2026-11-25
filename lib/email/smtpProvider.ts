/**
 * GİRİŞ GÜVENLİĞİ F2-M — SMTP sağlayıcısı (Turhost kurumsal posta; yalnız server-side).
 *
 * İstemci: nodemailer (bakımı süren SMTP istemcisi; protokol burada YAZILMAZ). İleti gövdesi Gmail sağlayıcısıyla AYNI
 * MIME oluşturucudan gelir (başlık enjeksiyonu koruması ortak).
 *
 * Yapılandırma (yalnız ortam değişkenleri; Vercel'de "Sensitive"):
 *   EMAIL_PROVIDER=smtp · SMTP_HOST (ör. srvm06.trwww.com) · SMTP_PORT = 465 (doğrudan TLS) | 587 (ZORUNLU STARTTLS)
 *   SMTP_USER · SMTP_PASSWORD · SMTP_SENDER (= SMTP_USER; başka adres adına gönderim YOK) · SMTP_SENDER_NAME (isteğe bağlı)
 * Eksik / geçersiz değerde sağlayıcı YOK (null) → e-posta yöntemi sunulmaz, MFA atlanmaz (fail-closed);
 * neden yalnız KOD olarak smtpConfigIssue() ile okunur (değer asla).
 *
 * Güvenlik:
 *   - TLS her zaman: 465'te bağlantı baştan şifreli; 587'de STARTTLS yoksa / başarısızsa kimlik bilgisi GÖNDERİLMEDEN
 *     işlem durur (düz metne düşüş YOK). En az TLS 1.2. Sertifika doğrulaması kapatılamaz (env yolu YOK;
 *     NODE_TLS_REJECT_UNAUTHORIZED=0 da etkisizdir — seçenek açıkça true verilir). Ad doğrulaması SMTP_HOST'a göredir.
 *   - Zaman aşımı: DNS / bağlantı / karşılama 10 sn, soket 15 sn, toplam 25 sn (sunucusuz işlev asılı kalmaz).
 *   - Otomatik tekrar YOK: kopma / zaman aşımı iletinin teslim edilmiş olabileceği anlamına gelir (kopya kod + kota).
 *     Kullanıcı bekleme süresinden sonra "yeniden gönder" ile ister (Gmail sağlayıcısındaki F2-K L5 kuralıyla aynı).
 *   - Her gönderim kendi bağlantısını açar ve kapatır (havuz yok: bayat oturum / paylaşılan durum yok).
 *   - Günlük / hata ayıklama kaydı kapalı; dönen hata yalnız kısa KOD (sunucu yanıtı, adres, parola DÖNMEZ).
 */
import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { buildMimeMessage, isSafeEmailAddress } from "@/lib/email/mime";
import type { EmailErrorCode, EmailMessage, EmailProvider, EmailSendResult } from "@/lib/email/provider";
import type { SmtpGate } from "@/lib/email/smtpQuota";

type Env = Record<string, string | undefined>;

export const SMTP_ALLOWED_PORTS = [465, 587] as const;
const DNS_TIMEOUT_MS = 10_000;
const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 15_000;
const TOTAL_TIMEOUT_MS = 25_000;

/** Yalnız TESTLER içindir (sahte sunucu): gerçek yapılandırma bu yoldan DEĞİŞTİRİLEMEZ (env'den gelmez). */
export type SmtpTestHooks = {
  /** TCP bağlantı hedefi (TLS ad doğrulaması yine SMTP_HOST'a göre yapılır). */
  connect?: { host: string; port: number };
  /** Sahte sunucunun test CA'sı (sistem kök sertifikaları yerine). */
  ca?: string | Buffer | Array<string | Buffer>;
  timeoutsMs?: Partial<{ dns: number; connection: number; greeting: number; socket: number; total: number }>;
};

export type SmtpConfigIssue =
  | "smtp_host_missing"
  | "smtp_host_invalid"
  | "smtp_port_invalid"
  | "smtp_user_missing"
  | "smtp_password_missing"
  | "smtp_sender_invalid"
  | "smtp_sender_mismatch";

type SmtpConfig = { host: string; port: 465 | 587; user: string; password: string; sender: string; fromName: string };

/** Ana makine adı (IP / "localhost" / şema / port / boşluk kabul edilmez — TLS ad doğrulaması için gerçek ad gerekir). */
const HOSTNAME_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function readConfig(env: Env): { ok: true; config: SmtpConfig } | { ok: false; issue: SmtpConfigIssue } {
  const host = String(env.SMTP_HOST ?? "").trim();
  const portRaw = String(env.SMTP_PORT ?? "").trim();
  const user = String(env.SMTP_USER ?? "").trim();
  const password = String(env.SMTP_PASSWORD ?? "");
  const sender = String(env.SMTP_SENDER ?? "").trim();
  const fromName = String(env.SMTP_SENDER_NAME ?? "Yaşam Sistemi").trim() || "Yaşam Sistemi";
  if (!host) return { ok: false, issue: "smtp_host_missing" };
  if (!HOSTNAME_RE.test(host)) return { ok: false, issue: "smtp_host_invalid" };
  const port = Number(portRaw);
  if (!/^[0-9]+$/.test(portRaw) || !(SMTP_ALLOWED_PORTS as readonly number[]).includes(port)) return { ok: false, issue: "smtp_port_invalid" };
  if (!user) return { ok: false, issue: "smtp_user_missing" };
  if (!password) return { ok: false, issue: "smtp_password_missing" };
  if (!isSafeEmailAddress(sender)) return { ok: false, issue: "smtp_sender_invalid" };
  // Turhost oturumu bir posta kutusudur: gönderen = giriş yapılan kutu (SPF/DKIM hizası; başka ad adına gönderim yok).
  if (sender.toLowerCase() !== user.toLowerCase()) return { ok: false, issue: "smtp_sender_mismatch" };
  return { ok: true, config: { host, port: port as 465 | 587, user, password, sender, fromName } };
}

/** Yapılandırma sorunu (yalnız KOD; değer DÖNMEZ). EMAIL_PROVIDER=smtp değilse null. */
export function smtpConfigIssue(env: Env = process.env): SmtpConfigIssue | null {
  if (String(env.EMAIL_PROVIDER ?? "").trim().toLowerCase() !== "smtp") return null;
  const r = readConfig(env);
  return r.ok ? null : r.issue;
}

const TLS_ERROR_CODES = /^(?:ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|HOSTNAME_MISMATCH|ERR_OSSL_)/;
const QUOTA_TEXT = /quota|rate.?limit|too many|exceed|max(?:imum)?\s+(?:e-?mails|messages|recipients)|sending limit|limit (?:reached|exceeded)|try again later.*limit/i;

type Classified = { code: EmailErrorCode; retryable: boolean };

/**
 * nodemailer hatasını kısa koda çevirir. Hiçbir sunucu metni / adres dışarı taşınmaz (yalnız sınıflandırmada okunur).
 *   smtp_auth_failed  kimlik reddedildi (535/534/530/EAUTH) → Owner'a bildirilir; tekrar anlamsız
 *   smtp_tls_error    sertifika / ad / STARTTLS sorunu → Owner'a bildirilir; kimlik bilgisi gönderilmemiştir
 *   quota             sağlayıcı sınırı (saatlik / günlük) → Owner'a bildirilir
 *   rejected          kalıcı ret (5xx: alıcı / ileti)
 *   provider_down     geçici ret (4xx)
 *   network           bağlantı / zaman aşımı / kopma (teslim belirsiz olabilir; otomatik tekrar YOK)
 */
export function classifySmtpError(err: unknown): Classified {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown; response?: unknown; command?: unknown; cause?: unknown; reason?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const rc = typeof e.responseCode === "number" ? e.responseCode : 0;
  const response = typeof e.response === "string" ? e.response : "";
  const command = typeof e.command === "string" ? e.command.toUpperCase() : "";
  // nodemailer soket hatasını ESOCKET olarak sarar; asıl Node/OpenSSL kodu `originalCode` (veya `cause`) alanındadır.
  const causes: string[] = [];
  for (let c: unknown = err, i = 0; c && i < 4; c = (c as { cause?: unknown }).cause, i++) {
    for (const k of ["code", "originalCode"] as const) {
      const cc = (c as Record<string, unknown>)[k];
      if (typeof cc === "string") causes.push(cc);
    }
  }
  if (code === "EAUTH" || code === "ENOAUTH" || rc === 535 || rc === 534 || (rc === 530 && !/STARTTLS|TLS/i.test(response)) || (rc === 454 && command.startsWith("AUTH"))) {
    return { code: "smtp_auth_failed", retryable: false };
  }
  if (code === "ETLS" || code === "EREQUIRETLS" || causes.some((c) => TLS_ERROR_CODES.test(c)) || (rc === 530 && /STARTTLS|TLS/i.test(response))) {
    return { code: "smtp_tls_error", retryable: false };
  }
  // SMTP yanıt kodu varsa sınıf ondan gelir (RCPT reddi EENVELOPE olarak sarılsa da 4xx geçici, 5xx kalıcıdır).
  if (rc >= 400 && QUOTA_TEXT.test(response)) return { code: "quota", retryable: false };
  if (rc >= 500) return { code: "rejected", retryable: false };
  if (rc >= 400) return { code: "provider_down", retryable: true };
  if (code === "EENVELOPE" || code === "EMESSAGE" || code === "ECONFIG") return { code: "rejected", retryable: false };
  return { code: "network", retryable: true };
}

function messageId(sender: string): string {
  const domain = sender.slice(sender.lastIndexOf("@") + 1);
  return `<ys.${Date.now().toString(36)}.${randomBytes(9).toString("hex")}@${domain}>`;
}

/**
 * gate: saatlik kota kapısı (lib/email/smtpQuota). Production yolu (getEmailProvider) HER ZAMAN verir; kapı izin vermezse
 * bağlantı AÇILMADAN "quota" döner (Owner'a mevcut bildirim akışıyla iletilir). Yalnız birim testleri kapısız oluşturur.
 */
export function createSmtpProvider(env: Env = process.env, hooks: SmtpTestHooks = {}, gate?: SmtpGate): EmailProvider | null {
  const cfg = readConfig(env);
  if (!cfg.ok) return null;
  const { host, port, user, sender, fromName } = cfg.config;
  // Parola yalnız bu kapanışta; sağlayıcı nesnesinde / dönüşte / günlükte yer almaz.
  const password = cfg.config.password;
  const t = { dns: DNS_TIMEOUT_MS, connection: CONNECTION_TIMEOUT_MS, greeting: GREETING_TIMEOUT_MS, socket: SOCKET_TIMEOUT_MS, total: TOTAL_TIMEOUT_MS, ...hooks.timeoutsMs };

  return {
    name: "smtp",
    async send(msg: EmailMessage): Promise<EmailSendResult> {
      if (!isSafeEmailAddress(msg.to)) return { ok: false, code: "rejected", retryable: false };
      if (gate) {
        const g = await gate().catch(() => ({ allowed: false, retryAfterSec: 60 }));
        if (!g.allowed) return { ok: false, code: "quota", retryable: true };
      }
      const mid = messageId(sender);
      let raw: string;
      try {
        raw = buildMimeMessage({ fromName, fromAddress: sender, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, messageId: mid });
      } catch {
        return { ok: false, code: "rejected", retryable: false };
      }
      const transport = nodemailer.createTransport({
        host: hooks.connect?.host ?? host,
        port: hooks.connect?.port ?? port,
        secure: port === 465,
        requireTLS: port === 587,
        ignoreTLS: false,
        opportunisticTLS: false,
        auth: { user, pass: password },
        tls: {
          servername: host,
          rejectUnauthorized: true,
          minVersion: "TLSv1.2",
          ...(hooks.ca ? { ca: hooks.ca } : {}),
        },
        name: sender.slice(sender.lastIndexOf("@") + 1),
        dnsTimeout: t.dns,
        connectionTimeout: t.connection,
        greetingTimeout: t.greeting,
        socketTimeout: t.socket,
        logger: false,
        debug: false,
        transactionLog: false,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error("smtp toplam zaman aşımı"), { code: "ETIMEDOUT" })), t.total); // i18n-ignore: teknik iç hata (sağlayıcı/günlük); kullanıcıya gösterilmez
        });
        await Promise.race([transport.sendMail({ envelope: { from: sender, to: [msg.to] }, raw }), deadline]);
        return { ok: true, providerMessageId: mid };
      } catch (err) {
        const c = classifySmtpError(err);
        return { ok: false, code: c.code, retryable: c.retryable };
      } finally {
        if (timer) clearTimeout(timer);
        try { transport.close(); } catch { /* kapanış hatası sonuç değildir */ }
      }
    },
  };
}
