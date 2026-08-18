"use client";

import { BookOpen } from "lucide-react";
import type { ChakraBibliographyEntry } from "@/lib/bioenergy/chakraWorkspace";

/**
 * FAZ 3.3E — Sayfa sonundaki TEK Kaynakça.
 * `deriveChakraBibliography` (yalnız source-evidence satırlarından distinct eser)
 * çıktısını gösterir. Ana içerikte kaynak adı YOKtur; bibliyografya yalnız burada.
 * Yalnız bibliyografik liste (eser + yazar) — exact source_excerpt gösterilmez.
 */
export default function ChakraBibliography({
  entries,
}: {
  entries: ChakraBibliographyEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <section className="mt-10 border-t border-slate-200/70 pt-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-slate-500">
        <BookOpen className="h-4 w-4 shrink-0 text-violet-500" strokeWidth={2} aria-hidden />
        Kaynakça
      </h2>
      <ol className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-slate-600">
        {entries.map((e, i) => (
          <li key={`${e.title}-${i}`} className="flex gap-2">
            <span className="shrink-0 tabular-nums text-slate-400">{i + 1}.</span>
            <span className="min-w-0">
              {e.author ? <span className="font-semibold text-slate-700">{e.author}</span> : null}
              {e.author ? " — " : null}
              <span className="italic">{e.title}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
