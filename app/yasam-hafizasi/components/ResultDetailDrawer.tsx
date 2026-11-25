"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useYhModuleLabel } from "./useYhLabels";
import type { YhSearchResult } from "@/lib/yasam-hafizasi/ui/searchResult";

/**
 * BF-13 — sonuç detay paneli. Masaüstünde sağ drawer, mobilde tam-ekran sheet.
 * "Kaynağa git" YALNIZ allowlist route (result.sourceLink) varsa gösterilir.
 */
export function ResultDetailDrawer({
  result,
  onClose,
}: {
  result: YhSearchResult | null;
  onClose: () => void;
}) {
  const t = useTranslations("memory.workspace.detail");
  const label = useYhModuleLabel();
  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, onClose]);

  if (!result) return null;
  const moduleLabel = label.professional(result.module, result.moduleLabel);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t("recordAria")}>
      <button
        type="button"
        aria-label={t("close")}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
      />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl sm:rounded-l-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
          <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-violet-700">
            {moduleLabel}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div>
            {result.isShared ? (
              <span className="mb-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                {t("sharedLibrary")}
              </span>
            ) : null}
            <h2 className="text-xl font-black text-slate-900">{result.title ?? t("untitled")}</h2>
          </div>

          {result.snippet ? <p className="text-sm leading-relaxed text-slate-700">{result.snippet}</p> : null}

          {result.evidence.length > 0 ? (
            <section>
              <h3 className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-500">{t("matched")}</h3>
              <ul className="space-y-1.5">
                {result.evidence.slice(0, 8).map((e, i) => (
                  <li key={`${e.kind}-${i}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {e.text}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {result.topicTags.length > 0 ? (
            <section>
              <h3 className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-500">{t("topics")}</h3>
              <div className="flex flex-wrap gap-1.5">
                {result.topicTags.map((t) => (
                  <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    #{t}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {result.relations.length > 0 ? (
            <section>
              <h3 className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-500">{t("relations")}</h3>
              <ul className="space-y-1 text-sm text-slate-700">
                {result.relations.map((r, i) => (
                  <li key={`${r.kind}-${i}`}>
                    <span className="text-slate-500">{r.kind}:</span> {r.targetLabel}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {result.sourceLink ? (
            <Link
              href={result.sourceLink}
              className="btn-primary inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm"
            >
              {t("goToModule", { module: moduleLabel })}
            </Link>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
