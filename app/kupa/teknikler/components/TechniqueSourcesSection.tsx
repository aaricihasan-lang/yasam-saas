"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { kupaBtnGhost } from "../../components/KupaShell";
import { CuppingCitationManager } from "../../components/CitationManager";

/**
 * "Kaynaklar" — formal citation katmanı (cupping_technique_sources). Reader-first:
 * varsayılan kapalı; "Kaynakları Yönet" ile mevcut CuppingCitationManager açılır.
 * source_note (legacy serbest not) BURADA formal kaynak gibi GÖSTERİLMEZ.
 */
export function TechniqueSourcesSection({ techniqueId }: { techniqueId: string }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("cupping.techniques.sources");
  const tc = useTranslations("cupping.common");
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">{t("title")}</h3>
        <button type="button" className={kupaBtnGhost} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? tc("close") : t("manage")}
        </button>
      </div>
      {open ? (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
          <CuppingCitationManager entity="technique" entityId={techniqueId} />
        </div>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
          {t("hint")}
        </p>
      )}
    </section>
  );
}
