"use client";

import type { ChakraContentBlock } from "@/lib/bioenergy/chakraWorkspace";

/**
 * FAZ 3.2C — rich içerik bloğu render iskeleti (foundation).
 *
 * Bilgi katmanlarını SEMANTİK olarak AYRI gösterir (kaynak ≠ çeviri ≠ açıklama
 * ≠ yorum ≠ uzman notu; karıştırılmaz). Yalnız gerçek (non-null/non-empty)
 * değerler render edilir — placeholder/uydurma YOK. Bu turda aşırı polish yok;
 * canlı UI'ya montaj FAZ 3.3/3.4'te yapılacak.
 */
export default function RichChakraBlock({ block }: { block: ChakraContentBlock }) {
  const citation = [block.source_author, block.source_title, block.source_ref]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
  const hasCitation = Boolean(citation || block.source_url || block.tradition_frame);

  return (
    <article className="flex flex-col gap-2">
      {block.block_title ? (
        <h4 className="text-[13px] font-black tracking-tight text-slate-900">{block.block_title}</h4>
      ) : null}

      {block.source_excerpt ? (
        <blockquote className="border-l-2 border-violet-200 pl-3 text-[13px] italic leading-relaxed text-slate-700">
          {block.source_excerpt}
        </blockquote>
      ) : null}

      {block.source_translation ? (
        <p className="text-[13px] leading-relaxed text-slate-700">
          <span className="font-semibold text-slate-500">Çeviri: </span>
          {block.source_translation}
        </p>
      ) : null}

      {block.editorial_explanation ? (
        <p className="text-[13px] leading-relaxed text-slate-700">{block.editorial_explanation}</p>
      ) : null}

      {block.editorial_interpretation ? (
        <p className="text-[13px] leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-500">Yorum: </span>
          {block.editorial_interpretation}
        </p>
      ) : null}

      {block.expert_note ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-600">
          <span className="font-semibold">Uzman notu: </span>
          {block.expert_note}
        </p>
      ) : null}

      {hasCitation ? (
        <p className="text-[11px] text-slate-400">
          {citation}
          {block.source_url ? " ↗" : ""}
          {block.tradition_frame ? ` · ${block.tradition_frame}` : ""}
        </p>
      ) : null}
    </article>
  );
}
