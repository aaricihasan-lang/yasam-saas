/**
 * GİRİŞ GÜVENLİĞİ F2-E — güvenlik bildirimi e-postaları. Saf; IO yok.
 * I18N-F1-R1: metinler messages/<dil>/auth.email.json (notice.*). `locale` verilmezse Türkçe → çıktı eski
 * sabit şablonla BAYT-BİREBİR aynı.
 * İçerikte KOD, bağlantı, buton, ek dosya veya uzaktan görsel YOK (kimlik avı yüzeyi yok; kurtarma
 * kodları e-postayla ASLA gönderilmez). Yalnız ne olduğu ve "siz değilseniz ne yapmalı" bilgisi.
 */
import { DEFAULT_LOCALE, type ActiveLocale } from "@/lib/i18n/locales";
import { localeTranslator } from "@/lib/i18n/serverMessages";

export type SecurityNoticeKind =
  | "recovery_login"
  | "owner_offline_login"
  | "recovery_codes_generated"
  | "email_changed_old"
  | "email_changed_new"
  | "recovery_case_opened"
  | "recovery_case_executed";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderSecurityNotice(kind: SecurityNoticeKind, name?: string | null, locale: ActiveLocale = DEFAULT_LOCALE): { subject: string; text: string; html: string } {
  const t = localeTranslator(locale, "auth.email") as ((key: string, values?: Record<string, string>) => string) & { raw: (key: string) => unknown };
  const lines = (t.raw(`notice.${kind}.lines`) as string[]).map(String);
  const subject = t(`notice.${kind}.subject`);
  const hello = name ? t("hello", { name }) : t("helloAnon");
  const text = [hello, "", ...lines, "", t("brand")].join("\n");
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:15px;line-height:1.5">
<div style="max-width:520px;margin:0 auto;padding:24px 16px"><div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-weight:700;color:#4c1d95">${t("notice.header")}</p>
<p style="margin:0 0 12px">${esc(hello)}</p>
${lines.map((l) => `<p style="margin:0 0 10px">${esc(l)}</p>`).join("\n")}
</div><p style="margin:12px 0 0;font-size:12px;color:#94a3b8">${t("footer")}</p></div></body></html>`;
  return { subject, text, html };
}
