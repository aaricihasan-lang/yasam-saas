"use client";

/**
 * Sol konu menüsü — mevcut Şifa "BÖLÜMLER" menüsünün görünümü korunur, ancak başlıklar
 * sabit değildir ve iç içe açılır/kapanır. Derin seviyelerde girinti sınırlanır
 * (ekran taşmaz); seviye numarası küçük rozetle gösterilir.
 */
import { memo } from "react";
import { blocksOf, childrenOf, nodeById } from "@/lib/sifa-rehberi-v2/tree";
import type { TopicNode, Workspace } from "@/lib/sifa-rehberi-v2/types";
import { templateEntry } from "@/lib/sifa-rehberi-v2/template";
import { isRelatedSection } from "@/lib/sifa-rehberi-v2/related";

const INDENT_PX = 14;
const MAX_VISUAL_INDENT = 6;

type Props = {
  ws: Workspace;
  /** Verilirse YALNIZ bu ana konu ve alt ağacı gösterilir (Konu Ayrıntısı). */
  rootId?: string;
  /** Basit Görünüm: seviye rozeti gizli. */
  simple?: boolean;
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
};

function Row({ ws, node, depth, selectedId, expanded, onToggle, onSelect, simple }: Props & { node: TopicNode; depth: number }) {
  const kids = childrenOf(ws, node.id);
  const isOpen = expanded.has(node.id);
  const active = node.id === selectedId;
  const blockCount = blocksOf(ws, node.id).length;
  const indent = Math.min(depth, MAX_VISUAL_INDENT) * INDENT_PX;
  return (
    <li role="treeitem" aria-expanded={kids.length ? isOpen : undefined} aria-selected={active} aria-level={depth + 1}>
      <div
        className={`group flex min-h-[44px] items-center gap-1 rounded-xl border pr-2 transition ${
          active
            ? "border-transparent bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 text-white shadow-[0_10px_26px_rgba(16,185,129,0.32)]"
            : "border-slate-100 bg-white text-slate-800 hover:border-emerald-200 hover:bg-emerald-50/50"
        }`}
        style={{ marginLeft: indent }}
      >
        {kids.length ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-label={isOpen ? `${node.title} başlığını kapat` : `${node.title} başlığını aç`}
            className={`flex h-[44px] w-8 shrink-0 items-center justify-center rounded-l-xl text-[11px] ${active ? "text-white/90" : "text-slate-400"}`}
            data-testid={`tree-toggle-${node.id}`}
          >
            <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
          </button>
        ) : (
          <span className="w-8 shrink-0 text-center text-[10px] text-slate-300" aria-hidden>
            •
          </span>
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className="flex min-h-[44px] min-w-0 flex-1 items-center self-stretch py-2 text-left text-[13px] font-bold leading-5"
          data-testid="tree-node"
          data-node-id={node.id}
        >
          {node.templateKey ? (
            <span className="mr-1.5 shrink-0" aria-hidden title="Hazır Şifa Rehberi başlığı">
              {templateEntry(node.templateKey)?.icon ?? (isRelatedSection(node) ? "🩺" : node.templateKey === "bolum:v1_eslesmeyen" ? "⚠️" : "📋")}
            </span>
          ) : null}
          {node.scope === "kurum" && !node.parentId ? (
            <span className="mr-1.5 shrink-0" aria-label="Kurum ortak kaydı" title="Kurum ortak kaydı (salt-okunur)">🏛</span>
          ) : null}
          <span className="line-clamp-2 break-words">{node.title}</span>
        </button>
        {depth >= MAX_VISUAL_INDENT && !simple ? (
          <span className={`shrink-0 rounded-full px-1.5 text-[10px] font-black ${active ? "bg-white/25" : "bg-slate-100 text-slate-500"}`} title="Seviye">
            S{depth + 1}
          </span>
        ) : null}
        {blockCount ? (
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black ${active ? "bg-white/25 text-white" : "bg-emerald-50 text-emerald-700"}`}
            title={`${blockCount} içerik kutusu`}
          >
            {blockCount}
          </span>
        ) : null}
      </div>
      {kids.length && isOpen ? (
        <ul role="group" className="mt-1 space-y-1">
          {kids.map((k) => (
            <Row key={k.id} ws={ws} node={k} depth={depth + 1} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} simple={simple} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export const TopicTree = memo(function TopicTree(props: Props) {
  const only = props.rootId ? nodeById(props.ws, props.rootId) : null;
  const roots = props.rootId ? (only ? [only] : []) : childrenOf(props.ws, null);
  if (!roots.length) {
    return <p className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-4 text-[13px] font-semibold text-slate-500">Henüz konu yok.</p>;
  }
  return (
    <ul role="tree" aria-label={only ? `${only.title} başlıkları` : "Konularım"} className="space-y-1" data-testid="topic-tree" data-root-id={only?.id}>
      {roots.map((n) => (
        <Row key={n.id} {...props} node={n} depth={0} />
      ))}
    </ul>
  );
});
