"use client";

import { Fragment, type ReactNode } from "react";
import type { ChakraContentBlock } from "@/lib/bioenergy/chakraWorkspace";

/**
 * FAZ 3.3E — Görünür (uzman-facing) V4 block içeriği.
 * YALNIZ `editorial_explanation` gösterilir (profesyonel metin). Kaynak adı/
 * yazar/excerpt burada GÖSTERİLMEZ (onlar gizli source-evidence satırlarında
 * ve yalnız sayfa sonundaki Kaynakça'da). Hafif markdown: **kalın**, "- " madde,
 * "---" ayraç, satır sonları. Aşırı tasarım yok.
 */

/** **kalın** → <strong>. Kaynak metni değiştirilmez, yalnız gösterim. */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    out.push(<strong key={i++} className="font-semibold text-slate-800">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return out;
}

export default function ChakraV4Content({ block }: { block: ChakraContentBlock }) {
  const body = (block.editorial_explanation ?? "").trim();
  if (!body) return null;
  const lines = body.split(/\r?\n/);

  const nodes: ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;
  const flushBullets = () => {
    if (bullets.length === 0) return;
    nodes.push(
      <ul key={`ul-${key++}`} className="ml-1 flex list-none flex-col gap-1.5">
        {bullets.map((b, bi) => (
          <li key={bi} className="flex gap-2 text-[13.5px] leading-relaxed text-slate-700">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-violet-400" aria-hidden />
            <span className="min-w-0">{renderInline(b)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") { flushBullets(); continue; }
    if (line === "---" || line === "***") { flushBullets(); nodes.push(<hr key={`hr-${key++}`} className="my-1 border-slate-200/60" />); continue; }
    // Raw markdown başlığı (### …) düz metin olarak SIZMASIN → alt başlık olarak render.
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flushBullets();
      nodes.push(
        <p key={`h-${key++}`} className="mt-1 text-[13.5px] font-bold text-slate-800">
          {renderInline(heading[1] ?? "")}
        </p>,
      );
      continue;
    }
    if (line.startsWith("- ")) { bullets.push(line.slice(2).trim()); continue; }
    flushBullets();
    nodes.push(
      <p key={`p-${key++}`} className="max-w-3xl text-[13.5px] leading-relaxed text-slate-700">
        {renderInline(line)}
      </p>,
    );
  }
  flushBullets();

  // Block-type görsel aksanı (SUNUM-ONLY; metin/iddia gücü değişmez).
  const accent: Record<string, string> = {
    state: "border-l-2 border-emerald-200 pl-3",
    "variation-summary": "border-l-2 border-slate-200 pl-3",
    "claim-summary": "border-l-2 border-amber-200 pl-3",
    application: "border-l-2 border-violet-200 pl-3",
    "supporter-note": "border-l-2 border-cyan-200 pl-3",
  };
  const variant = accent[block.block_type ?? ""] ?? "";

  return (
    <div className={`flex flex-col gap-3 ${variant}`}>
      {block.block_title ? (
        <h3 className="text-[15px] font-black tracking-tight text-slate-900">{block.block_title}</h3>
      ) : null}
      {nodes}
    </div>
  );
}
