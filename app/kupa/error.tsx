"use client";

import Link from "next/link";
import { useEffect } from "react";
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
  useEffect(() => {
    console.error("[kupa] beklenmeyen hata", error);
  }, [error]);

  return (
    <KupaShell title="Bir sorun oluştu" breadcrumb={[{ label: "Hata" }]}>
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        <p className="font-semibold">Bu ekran beklenmedik bir hata nedeniyle gösterilemedi.</p>
        <p className="mt-1 text-rose-700">
          Kayıtlı verileriniz etkilenmedi. Ekranı yeniden deneyebilir veya Kupa &amp; Hacamat girişine dönebilirsiniz.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={`${kupaBtnPrimary} min-h-[44px]`} onClick={() => unstable_retry()}>
            Tekrar dene
          </button>
          <Link href="/kupa" className={`${kupaBtnGhost} min-h-[44px] no-underline`}>
            Kupa &amp; Hacamat girişi
          </Link>
        </div>
      </div>
    </KupaShell>
  );
}
