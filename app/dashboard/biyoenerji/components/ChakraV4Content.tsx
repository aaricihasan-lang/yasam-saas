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
      <p key={`p-${key++}`} className="max-w-4xl text-[13.5px] leading-relaxed text-slate-700">
        {renderInline(line)}
      </p>,
    );
  }
  flushBullets();

  // Hafif profesyonel bilgi bloğu paneli (SUNUM-ONLY; metin/iddia gücü değişmez).
  // overview en sade; diğer tipler ince sol-aksan + hafif tint. Aşırı-tasarım YOK.
  const PANEL: Record<string, string> = {
    overview: "border-slate-200/60 bg-white/45",
    state: "border-slate-200/60 border-l-[3px] border-l-emerald-300 bg-emerald-50/30",
    "variation-summary": "border-slate-200/60 border-l-[3px] border-l-slate-300 bg-slate-50/50",
    "claim-summary": "border-slate-200/60 border-l-[3px] border-l-amber-300 bg-amber-50/30",
    application: "border-slate-200/60 border-l-[3px] border-l-violet-300 bg-violet-50/30",
    "supporter-note": "border-slate-200/60 border-l-[3px] border-l-cyan-300 bg-cyan-50/30",
  };
  const panel = PANEL[block.block_type ?? ""] ?? PANEL.overview;

  return (
    <div className={`flex flex-col gap-2.5 rounded-xl border p-4 ${panel}`}>
      {block.block_title ? (
        <h3 className="text-[14.5px] font-black tracking-tight text-slate-900">{block.block_title}</h3>
      ) : null}
      {nodes}
    </div>
  );
}
