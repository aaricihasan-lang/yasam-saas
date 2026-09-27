"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Public tanıtım/test hesabı — owner tarafından landing'de açıkça gösterilmesi istendi.
export const DEMO_ACCOUNT_EMAIL = "uzman@test.com";
export const DEMO_ACCOUNT_PASSWORD = "123456";

type CopyField = "email" | "password";

function CredentialRow({
  icon: Icon,
  label,
  value,
  copied,
  copyLabel,
  copiedLabel,
  onCopy,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  copied: boolean;
  copyLabel: string;
  copiedLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-violet-100 bg-gradient-to-r from-white to-violet-50/60 px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100/70 text-violet-600">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <p className="truncate font-mono text-[15px] font-bold tracking-tight text-slate-900 select-all sm:text-base">
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`${copied ? copiedLabel : copyLabel}: ${label}`}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1 ${
          copied
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
        }`}
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        <span className="hidden sm:inline">{copied ? copiedLabel : copyLabel}</span>
      </button>
    </div>
  );
}

export default function DemoAccessCard({ onTryDemo }: { onTryDemo: () => void }) {
  const t = useTranslations("home.demoAccess");
  const [copied, setCopied] = useState<CopyField | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const copy = async (field: CopyField, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Pano erişimi yoksa (izin/HTTP) sessizce geç — değer ekranda zaten seçilebilir.
      return;
    }
    setCopied(field);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(null), 1800);
  };

  return (
    <section
      aria-labelledby="demo-access-title"
      className="relative w-full rounded-[26px] bg-gradient-to-r from-indigo-500/60 via-violet-500/60 to-fuchsia-400/60 p-px shadow-[0_14px_40px_rgba(109,40,217,0.16)]"
    >
      <div className="relative overflow-hidden rounded-[25px] bg-white/[0.93] px-4 py-5 backdrop-blur-xl sm:px-6 sm:py-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-fuchsia-200/50 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-indigo-200/50 blur-3xl" aria-hidden />

        {/* DOM sırası = mobil sıra (rozet+başlık → giriş bilgileri+CTA → açıklama); md+ iki sütun */}
        <div className="relative grid gap-4 text-left md:grid-cols-2 md:gap-x-7 md:gap-y-0">
          <div className="min-w-0 md:col-start-1 md:row-start-1 md:self-end">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {t("badge")}
            </span>
            <h2
              id="demo-access-title"
              className="mt-2.5 text-xl font-black leading-snug tracking-tight text-slate-950 lg:text-[1.35rem]"
            >
              {t("title")}
            </h2>
          </div>

          <div className="min-w-0 space-y-2 md:col-start-2 md:row-span-2 md:row-start-1 md:self-center">
            <CredentialRow
              icon={Mail}
              label={t("emailLabel")}
              value={DEMO_ACCOUNT_EMAIL}
              copied={copied === "email"}
              copyLabel={t("copy")}
              copiedLabel={t("copied")}
              onCopy={() => copy("email", DEMO_ACCOUNT_EMAIL)}
            />
            <CredentialRow
              icon={KeyRound}
              label={t("passwordLabel")}
              value={DEMO_ACCOUNT_PASSWORD}
              copied={copied === "password"}
              copyLabel={t("copy")}
              copiedLabel={t("copied")}
              onCopy={() => copy("password", DEMO_ACCOUNT_PASSWORD)}
            />
            <button
              type="button"
              onClick={onTryDemo}
              className="!mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 px-6 text-sm font-bold text-white shadow-[0_6px_22px_rgba(109,40,217,0.34)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(109,40,217,0.44)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
            >
              {t("cta")}
              <span aria-hidden>→</span>
            </button>
          </div>

          <div className="min-w-0 md:col-start-1 md:row-start-2 md:self-start">
            <p className="text-sm leading-6 text-slate-600 md:mt-1.5">{t("description")}</p>
            <p className="mt-2 text-[11px] font-semibold text-slate-500">{t("note")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
