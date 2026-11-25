"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { KupaShell, kupaBtnGhost, kupaBtnPrimary } from "./components/KupaShell";

/**
 * KUPA & HACAMAT — segment hata sınırı. Beklenmeyen bir istemci hatasında beyaz
 * "client-side exception" ekranı yerine modül içinde kalan, anlaşılır bir kurtarma ekranı.
 * Kayıtlı veriye dokunmaz; yalnız ekranı yeniden dener veya modül girişine döner.
 */
export default function KupaError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("cupping.error");
  useEffect(() => {
    console.error("[kupa] beklenmeyen hata", error);
  }, [error]);

  return (
    <KupaShell title={t("title")} breadcrumb={[{ label: t("crumb") }]}>
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        <p className="font-semibold">{t("heading")}</p>
        <p className="mt-1 text-rose-700">{t("body")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={`${kupaBtnPrimary} min-h-[44px]`} onClick={() => unstable_retry()}>
            {t("retry")}
          </button>
          <Link href="/kupa" className={`${kupaBtnGhost} min-h-[44px] no-underline`}>
            {t("home")}
          </Link>
        </div>
      </div>
    </KupaShell>
  );
}
