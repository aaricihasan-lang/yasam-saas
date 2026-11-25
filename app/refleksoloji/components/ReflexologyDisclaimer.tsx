/**
 * REF-002 — Refleksoloji sağlık/uyumluluk bilgilendirmesi (satış öncesi kapı).
 *
 * Profesyonel, korkutmayan bir bilgi bandı. Kullanıcı akışını engellemez.
 * Hub, protokol detay ekranı ve (ayrı builder'da) Word raporunda kullanılır.
 */

import { useTranslations } from "next-intl";

export const REFLEXOLOGY_DISCLAIMER_TEXT =
  // i18n-ignore: Word raporu (ayrı builder) kaynak metni; ekran metni reflexology.common.disclaimer (TR birebir).
  "Refleksoloji uygulamaları tamamlayıcı niteliktedir. Bu modül tıbbi tanı veya tedavi amacı taşımaz ve hekim değerlendirmesinin yerine geçmez.";

export function ReflexologyDisclaimer({
  variant = "band",
  className = "",
}: {
  /** "band": ince bilgi bandı; "compact": tek satır dipnot. */
  variant?: "band" | "compact";
  className?: string;
}) {
  const tc = useTranslations("reflexology.common");
  if (variant === "compact") {
    return (
      <p
        className={`text-[11px] leading-snug text-slate-500 ${className}`}
        role="note"
      >
        {tc("disclaimer")}
      </p>
    );
  }

  return (
    <div
      role="note"
      className={`flex items-start gap-2 rounded-xl border border-violet-200/70 bg-violet-50/70 px-3 py-2 text-[12px] leading-snug text-violet-900/90 ${className}`}
    >
      <span aria-hidden className="mt-0.5 shrink-0 text-violet-500">
        ⓘ
      </span>
      <span>{tc("disclaimer")}</span>
    </div>
  );
}
