"use client";

import { useState } from "react";
import { kupaBtnGhost } from "../../components/KupaShell";
import { CuppingCitationManager } from "../../components/CitationManager";

/**
 * "Kaynaklar" — formal citation katmanı (cupping_technique_sources). Reader-first:
 * varsayılan kapalı; "Kaynakları Yönet" ile mevcut CuppingCitationManager açılır.
 * source_note (legacy serbest not) BURADA formal kaynak gibi GÖSTERİLMEZ.
 */
export function TechniqueSourcesSection({ techniqueId }: { techniqueId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Kaynaklar</h3>
        <button type="button" className={kupaBtnGhost} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Kapat" : "Kaynakları Yönet"}
        </button>
      </div>
      {open ? (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
          <CuppingCitationManager entity="technique" entityId={techniqueId} />
        </div>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
          Bu tekniğe ilişkin kaynak künyelerini eklemek/görüntülemek için “Kaynakları Yönet”.
        </p>
      )}
    </section>
  );
}
