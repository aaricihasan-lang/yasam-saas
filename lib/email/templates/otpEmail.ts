/**
 * GİRİŞ GÜVENLİĞİ F2-D — doğrulama kodu e-postası. Saf; IO yok.
 * Kimlik avına karşı: BAĞLANTI / buton YOK (kullanıcı kodu yalnız açık olan Yaşam Sistemi ekranına girer),
 * ek dosya yok, uzaktan görsel yok. Kod ve geçerlilik süresi açıkça yazılır; paylaşılmaması uyarılır.
 *
 * I18N-F1-R1: metinler messages/<dil>/auth.email.json'dan. `locale` verilmezse Türkçe → çıktı eski sabit
 * şablonla BAYT-BİREBİR aynı. Kod, süre ve ad DEĞİŞKENLERİ dilden bağımsızdır.
 */
import { DEFAULT_LOCALE, type ActiveLocale } from "@/lib/i18n/locales";
import { localeTranslator } from "@/lib/i18n/serverMessages";

export type OtpPurpose = "login" | "verify_email" | "owner_test" | "change_email" | "step_up";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type MarkupT = ((key: string, values?: Record<string, string>) => string) & {
  markup: (key: string, values: Record<string, string | ((chunks: string) => string)>) => string;
};
const strong = (chunks: string) => `<strong>${chunks}</strong>`;

export function renderOtpEmail(input: { purpose: OtpPurpose; code?: string; name?: string | null; minutes?: number; locale?: ActiveLocale }): { subject: string; text: string; html: string } {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const t = localeTranslator(locale, "auth.email") as unknown as MarkupT;
  const minutes = String(input.minutes ?? 3);
  const hello = input.name ? t("hello", { name: input.name }) : t("helloAnon");
  const brand = t("brand");
  if (input.purpose === "owner_test") {
    const subject = t("otp.ownerTestSubject");
    const text = `${hello}\n\n${t("otp.ownerTestText")}\n\n${brand}`;
    return { subject, text, html: wrap(`<p>${esc(hello)}</p><p>${t.markup("otp.ownerTestHtml", { strong })}</p>`, t, locale) };
  }
  const code = String(input.code ?? "");
  if (!/^[0-9]{6}$/.test(code)) throw new Error("otp şablonu: kod 6 hane olmalı"); // i18n-ignore: geliştirici hatası, kullanıcıya gösterilmez
  const action = input.purpose === "login" ? t("otp.actionLogin")
    : input.purpose === "change_email" ? t("otp.actionChangeEmail")
      : input.purpose === "step_up" ? t("otp.actionStepUp")
      : t("otp.actionVerifyEmail");
  const subject = t("otp.subject", { code });
  const text = [
    hello,
    "",
    t("otp.intro", { action }),
    "",
    `    ${code}`,
    "",
    t("otp.validityText", { minutes }),
    t("otp.noShareText"),
    t("otp.notYou"),
    "",
    brand,
  ].join("\n");
  const html = wrap(`
    <p style="margin:0 0 12px">${esc(hello)}</p>
    <p style="margin:0 0 16px">${esc(t("otp.intro", { action }))}</p>
    <p style="margin:0 0 16px;font-family:Consolas,'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#4c1d95">${esc(code)}</p>
    <p style="margin:0 0 8px">${t.markup("otp.validityHtml", { minutes, strong })}</p>
    <p style="margin:0 0 8px">${t.markup("otp.noShareHtml", { strong })}</p>
    <p style="margin:0;color:#64748b">${t("otp.notYou")}</p>`, t, locale);
  return { subject, text, html };
}

function wrap(inner: string, t: MarkupT, locale: ActiveLocale): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:15px;line-height:1.5">
<div style="max-width:520px;margin:0 auto;padding:24px 16px"><div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-weight:700;color:#4c1d95">${t("brand")}</p>${inner}
</div><p style="margin:12px 0 0;font-size:12px;color:#94a3b8">${t("footer")}</p></div></body></html>`;
}
