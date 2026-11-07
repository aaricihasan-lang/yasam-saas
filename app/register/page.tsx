"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import PasswordInput from "@/components/ui/PasswordInput";
import { passwordPolicyError, REGISTER_HONEYPOT_FIELD, REGISTER_TURNSTILE_FIELD } from "@/lib/auth/registerValidation";
import TurnstileWidget, { type TurnstileHandle } from "@/components/trial/TurnstileWidget";
import { useSignupConfig } from "@/components/trial/useSignupConfig";

const inputClass =
  "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold [@media(min-width:768px)_and_(min-height:741px)_and_(max-height:820px)]:h-11 [@media(min-width:768px)_and_(max-height:740px)]:h-11 text-slate-700 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100";

/** API error `code` → i18n toast alt-anahtarı (bkz. app/api/register/route.ts). */
const ERROR_CODE_KEY: Record<string, string> = {
  missing_fields: "allFields",
  config: "config",
  hash: "hash",
  already_exists: "alreadyExists",
  idempotency: "idempotency",
  failed: "generic",
  invalid_name: "invalidName",
  invalid_email: "invalidEmail",
  weak_password: "weakPassword",
  rate_limited: "rateLimited",
  invalid_request: "generic",
  captcha_failed: "captchaFailed",
  captcha_unavailable: "captchaFailed",
};

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const t = useTranslations("home.register");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  // MEM-012 honeypot: insanlara görünmez; botlar doldurursa sunucu kayıt oluşturmaz.
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  // TRIAL7: otomatik 7 günlük deneme açıkken Cloudflare Turnstile zorunlu (sunucu Siteverify doğrular).
  const signup = useSignupConfig();
  const selfTrial = signup?.selfTrial === true && !!signup.turnstileSiteKey;
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<TurnstileHandle | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    const pass = password.trim();
    const passRepeat = passwordRepeat.trim();

    if (!name || !mail || !pass) {
      showToast({
        title: t("toast.errorTitle"),
        message: t("toast.allFields"),
        type: "error",
      });
      return;
    }

    if (passwordPolicyError(pass, mail)) {
      showToast({
        title: t("toast.errorTitle"),
        message: t("toast.weakPassword"),
        type: "error",
      });
      return;
    }

    if (pass !== passRepeat) {
      showToast({
        title: t("toast.errorTitle"),
        message: t("toast.passwordMismatch"),
        type: "error",
      });
      return;
    }

    if (selfTrial && !captchaToken) {
      showToast({ title: t("toast.errorTitle"), message: t("toast.captchaRequired"), type: "error" });
      return;
    }

    setSaving(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: name,
        email: mail,
        password: pass,
        [REGISTER_HONEYPOT_FIELD]: website,
        ...(selfTrial && captchaToken ? { [REGISTER_TURNSTILE_FIELD]: captchaToken } : {}),
      }),
    }).catch(() => null);

    if (!res) {
      showToast({ title: t("toast.errorTitle"), message: t("toast.generic"), type: "error" });
      setSaving(false);
      return;
    }
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string; mode?: string };
    // Turnstile belirteci tek kullanımlıktır → her denemeden sonra yenilenir.
    if (selfTrial) captchaRef.current?.reset();

    if (!res.ok || !json.ok) {
      // API artık kararlı bir `code` döndürür → locale'e göre i18n mesaj. Bilinmeyen
      // kod / eski yanıt için ham `error`'a, o da yoksa generic'e düşülür.
      const codeKey = json.code ? ERROR_CODE_KEY[json.code] : undefined;
      const message = codeKey ? t(`toast.${codeKey}`) : json.error ?? t("toast.generic");
      showToast({
        title: t("toast.errorTitle"),
        message,
        type: "error",
      });
      setSaving(false);
      return;
    }

    showToast({
      title: t("toast.successTitle"),
      message: json.mode === "trial" ? t("toast.successInstant") : t("toast.success"),
      type: "success",
    });

    setSaving(false);
    router.push("/?login=1");
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_46%,#fdf2f8_100%)] text-slate-950">
      <div className="pointer-events-none absolute left-[-130px] top-[-150px] h-[330px] w-[330px] rounded-full bg-violet-200/38 blur-3xl" />
      <div className="pointer-events-none absolute right-[-110px] top-[70px] h-[360px] w-[360px] rounded-full bg-cyan-200/36 blur-3xl" />

      <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-5 py-8 md:px-8 md:py-6 [@media(min-width:768px)_and_(min-height:741px)_and_(max-height:820px)]:py-3 [@media(min-width:768px)_and_(max-height:740px)]:py-1.5">
        <div className="w-full max-w-[560px] md:max-w-[580px]">
        <div className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white/92 p-7 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-blur-2xl md:px-9 md:py-7 [@media(min-width:768px)_and_(min-height:741px)_and_(max-height:820px)]:py-5 [@media(min-width:768px)_and_(max-height:740px)]:py-3">
          <div className="pointer-events-none absolute right-[-70px] top-[-80px] h-[180px] w-[180px] rounded-full bg-violet-200/70 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-80px] left-[-80px] h-[180px] w-[180px] rounded-full bg-cyan-200/50 blur-3xl" />

          <div className="relative z-10">
            <div className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
              {t("badge")}
            </div>
            <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950 md:text-[2rem] [@media(min-width:768px)_and_(max-height:740px)]:mt-2">{t("title")}</h1>
            <p className="mt-1.5 text-base leading-6 text-slate-600">
              {selfTrial ? t("subtitleInstant") : t("subtitle")}
            </p>
            <p className="mt-3 flex items-start gap-2 rounded-2xl border border-violet-200/70 bg-gradient-to-r from-violet-50 to-fuchsia-50/70 px-3.5 py-2 text-sm font-semibold leading-snug text-violet-800 md:text-[13px]">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {selfTrial ? t("trialNoteInstant") : t("trialNote")}
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-3.5 md:space-y-3 [@media(min-width:768px)_and_(min-height:741px)_and_(max-height:820px)]:space-y-2.5 [@media(min-width:768px)_and_(max-height:740px)]:mt-4 [@media(min-width:768px)_and_(max-height:740px)]:space-y-2">
              <div>
                <label className="mb-1.5 block text-[15px] font-semibold text-slate-700">
                  {t("fullNameLabel")}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t("fullNamePlaceholder")}
                  className={inputClass}
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[15px] font-semibold text-slate-700">
                  {t("emailLabel")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("emailPlaceholder")}
                  className={inputClass}
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="register-password" className="mb-1.5 block text-[15px] font-semibold text-slate-700">
                  {t("passwordLabel")}
                </label>
                <PasswordInput
                  id="register-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                  autoComplete="new-password"
                  aria-describedby="register-password-hint"
                />
                <p id="register-password-hint" className="mt-1 text-xs font-medium text-slate-600">
                  {t("passwordHint")}
                </p>
              </div>

              <div>
                <label htmlFor="register-password-repeat" className="mb-1.5 block text-[15px] font-semibold text-slate-700">
                  {t("passwordRepeatLabel")}
                </label>
                <PasswordInput
                  id="register-password-repeat"
                  value={passwordRepeat}
                  onChange={(e) => setPasswordRepeat(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                  autoComplete="new-password"
                />
              </div>

              {/* Honeypot — ekran okuyucu ve klavye için gizli; görünür DEĞİL. */}
              <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
                <label>
                  Web sitesi
                  <input
                    type="text"
                    name={REGISTER_HONEYPOT_FIELD}
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>

              {selfTrial && signup?.turnstileSiteKey ? (
                <TurnstileWidget ref={captchaRef} siteKey={signup.turnstileSiteKey} onToken={setCaptchaToken} />
              ) : null}

              <button
                type="submit"
                disabled={saving || (selfTrial && !captchaToken)}
                className="!mt-4 [@media(min-width:768px)_and_(min-height:741px)_and_(max-height:820px)]:!mt-3 [@media(min-width:768px)_and_(max-height:740px)]:!mt-3 flex h-12 w-full [@media(min-width:768px)_and_(min-height:741px)_and_(max-height:820px)]:h-11 [@media(min-width:768px)_and_(max-height:740px)]:h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-4 text-base font-bold text-white shadow-xl shadow-violet-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {t("submitting")}
                  </span>
                ) : (
                  t("submit")
                )}
              </button>
            </form>

            <p className="relative z-10 mt-4 text-center text-sm font-semibold text-slate-600 [@media(min-width:768px)_and_(min-height:741px)_and_(max-height:820px)]:mt-3 [@media(min-width:768px)_and_(max-height:740px)]:mt-2">
              {t("haveAccount")}{" "}
              <Link
                href="/?login=1"
                className="font-black text-violet-700 no-underline hover:text-violet-900"
              >
                {t("signIn")}
              </Link>
            </p>
            {/* Kayıt sırasında aydınlatma: hukuki metinlere bağlantı (kabul iddiası değil, bilgilendirme). */}
            <p className="relative z-10 mt-2 text-center text-xs leading-snug text-slate-500 md:text-[11px] [@media(min-width:768px)_and_(min-height:741px)_and_(max-height:820px)]:mt-1 [@media(min-width:768px)_and_(max-height:740px)]:mt-1">
              {t.rich("legalNotice", {
                privacy: (chunks) => (
                  <Link href="/gizlilik-politikasi" className="font-semibold text-violet-700 underline">
                    {chunks}
                  </Link>
                ),
                terms: (chunks) => (
                  <Link href="/kullanim-sartlari#ucretsiz-deneme" className="font-semibold text-violet-700 underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
        </div>
        </div>
      </div>
    </main>
  );
}
