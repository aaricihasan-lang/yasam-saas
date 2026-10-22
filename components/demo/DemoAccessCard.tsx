"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import lp from "@/app/_premium/landing/landing.module.css";

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
    <div className={lp.credRow}>
      <span className={lp.credIcon}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <div className={lp.credText}>
        <p className={lp.credLabel}>{label}</p>
        <p className={lp.credValue}>{value}</p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`${copied ? copiedLabel : copyLabel}: ${label}`}
        className={`${lp.copyBtn} ${copied ? lp.copyBtnDone : ""}`}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        <span className={lp.copyLabel}>{copied ? copiedLabel : copyLabel}</span>
      </button>
    </div>
  );
}

function useCopyFeedback() {
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

  return { copied, copy };
}

/** Landing test hesabı kartı (hero sağ sütunu; dar ekranda hero metninin altında). Giriş otomatik değildir: CTA mevcut giriş modalını ön-dolu açar. */
export default function DemoAccessCard({ onTryDemo }: { onTryDemo: () => void }) {
  const t = useTranslations("home.demoAccess");
  const { copied, copy } = useCopyFeedback();

  return (
    <section aria-labelledby="demo-access-title" className={lp.demoCard}>
      <span className={lp.demoBadge}>
        <span className={lp.demoPing} aria-hidden />
        {t("badge")}
      </span>
      <h2 id="demo-access-title" className={lp.demoTitle}>
        {t("title")}
      </h2>
      <p className={lp.demoDesc}>{t("description")}</p>

      <div className={lp.credList}>
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
      </div>

      <button type="button" onClick={onTryDemo} className={lp.demoCta}>
        {t("cta")}
        <span aria-hidden>→</span>
      </button>
      <p className={lp.demoNote}>{t("note")}</p>
    </section>
  );
}
