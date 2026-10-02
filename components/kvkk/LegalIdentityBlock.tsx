import { buildMailtoHref, buildTelHref } from "@/lib/contact/info";
import { LEGAL_IDENTITY, legalIdentityLines } from "@/lib/legal/legalIdentity";

/**
 * Yaşam Sistemi kimlik + iletişim bloğu (Server Component).
 * Yalnız dolu alanlar gösterilir (lib/legal/legalIdentity.ts); boş resmî kimlik alanları
 * için yer tutucu üretilmez.
 */
export default function LegalIdentityBlock() {
  const lines = legalIdentityLines(LEGAL_IDENTITY);
  return (
    <dl className="not-prose mt-4 grid grid-cols-1 gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 text-sm sm:grid-cols-[max-content_1fr]">
      {lines.map((line) => (
        <div key={line.label} className="contents">
          <dt className="font-bold text-slate-500">{line.label}</dt>
          <dd className="min-w-0 break-words text-slate-900">
            {line.label === "E-posta" ? (
              <a href={buildMailtoHref()} className="font-semibold text-violet-700 underline">
                {line.value}
              </a>
            ) : line.label === "Telefon" ? (
              <a href={buildTelHref()} className="font-semibold text-violet-700 underline">
                {line.value}
              </a>
            ) : (
              line.value
            )}
          </dd>
        </div>
      ))}
      <div className="contents">
        <dt className="font-bold text-slate-500">Uygulama içi</dt>
        <dd className="min-w-0 text-slate-900">Ayarlar → Admin ile İrtibat</dd>
      </div>
    </dl>
  );
}
