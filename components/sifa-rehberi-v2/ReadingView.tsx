"use client";

/**
 * 📖 Bütüncül Okuma — seçili ana konunun dolu başlıklarını ve içerik kutularını tek sayfada,
 * hiyerarşi ve kullanıcı sırasıyla gösterir. SALT-OKUNUR: editör yok, veri değiştiren düğme yok.
 * Başlığa dokunmak ilgili başlığı "Notlarım" sekmesinde açar (düzenleme orada yapılır).
 * Taslak (kaydedilmemiş değişiklikler dahil) okunur; okuma ekranı taslağa hiç yazmaz.
 */
import { memo, useEffect, useMemo, useState } from "react";
import { RichView } from "@/components/sifa-rehberi-v2/RichView";
import { CLASS_ICON, CLASS_STYLE } from "@/components/sifa-rehberi-v2/BlockCard";
import { sourceKindLabel } from "@/components/sifa-rehberi-v2/Dialogs";
import { btnPrimary } from "@/components/sifa-rehberi-v2/Modal";
import { buildReading, type ReadingSection } from "@/lib/sifa-rehberi-v2/reading";
import type { RelatedEntry } from "@/lib/sifa-rehberi-v2/related";
import { BLOCK_CLASSES, type Block, type Workspace } from "@/lib/sifa-rehberi-v2/types";

const anchorId = (nodeId: string) => `okuma-${nodeId}`;

function scrollToSection(nodeId: string) {
  const el = typeof document !== "undefined" ? document.getElementById(anchorId(nodeId)) : null;
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

type Props = {
  ws: Workspace;
  rootId: string;
  /** Ağaçtan bir alt başlık seçildiyse okuma o bölüme kaydırılır. */
  focusId?: string | null;
  dirty: boolean;
  /** Başlığı "Notlarım" sekmesinde açar. */
  onOpenNode: (nodeId: string) => void;
  onBackToNotes: () => void;
  /** Verilirse "Word olarak indir" görünür (yalnız kalıcı kayıtta; KAYDEDİLMİŞ veriden üretilir). */
  onWord?: (rootId: string) => void;
};

export const ReadingView = memo(function ReadingView({ ws, rootId, focusId, dirty, onOpenNode, onBackToNotes, onWord }: Props) {
  const [showEmpty, setShowEmpty] = useState(false);
  const reading = useMemo(() => buildReading(ws, rootId, { includeEmpty: showEmpty }), [ws, rootId, showEmpty]);
  useEffect(() => {
    if (!focusId) return;
    // Seçimdeki "sayfa başına kaydır" bittikten sonra bölüme in.
    const t = window.setTimeout(() => scrollToSection(focusId), 350);
    return () => window.clearTimeout(t);
  }, [focusId]);
  if (!reading) return null;
  const { root, rootBlocks, sections, rootLinks, stats } = reading;
  const isEmpty = !sections.length && !rootBlocks.length && !rootLinks.length;

  return (
    <div data-testid="reading-view" data-root-id={root.id}>
      <header className="rounded-[22px] border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/50 to-cyan-50/40 p-4 sm:p-6">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">📖 Bütüncül Okuma · salt-okunur</p>
        <h2 className="mt-1 break-words text-[26px] font-black leading-tight tracking-tight text-slate-950 sm:text-[34px]" data-testid="reading-title">
          <span className="uppercase">{root.title}</span>
          <span className="text-slate-400"> — </span>
          <span className="text-emerald-800">Bütüncül Okuma</span>
        </h2>
        <p className="mt-2 text-[13px] font-semibold text-slate-600" data-testid="reading-stats">
          {stats.sections} bölüm · {stats.blocks} içerik kutusu
          {!showEmpty && stats.hiddenEmpty ? ` · ${stats.hiddenEmpty} boş başlık gizlendi` : ""}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12.5px] font-bold text-slate-700 shadow-sm">
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} className="h-4 w-4 accent-emerald-600" data-testid="reading-show-empty" />
            Boş başlıkları da göster
          </label>
          {onWord ? (
            <button
              type="button"
              onClick={() => onWord(root.id)}
              disabled={dirty}
              title={dirty ? "Word, son KAYDEDİLMİŞ hâlden üretilir; önce Kaydet'e basın." : undefined}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 text-[12.5px] font-black text-emerald-800 shadow-sm hover:bg-emerald-50 disabled:opacity-40"
              data-testid="reading-word"
            >
              📄 Word olarak indir
            </button>
          ) : null}
          <span className="text-[12px] font-medium text-slate-500">Başlığa dokunarak o bölümü düzenleme ekranında açabilirsiniz.</span>
        </div>
        {dirty ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-bold text-amber-900 ring-1 ring-amber-200" role="status" data-testid="reading-dirty-note">
            Kaydedilmemiş değişiklikleriniz bu okumada görünüyor. Kalıcı olmaları için Kaydet&apos;e basın.
          </p>
        ) : null}
      </header>

      {isEmpty ? (
        <div className="mt-5 rounded-[22px] border border-dashed border-emerald-200 bg-white/70 p-6 text-center" data-testid="reading-empty">
          <p className="text-[32px]" aria-hidden>📖</p>
          <p className="mt-1 text-[16px] font-black text-slate-800">Bu konuda henüz okunacak not yok.</p>
          <p className="mx-auto mt-1 max-w-[460px] text-[13.5px] font-medium text-slate-500">
            Notlarım sekmesinde bu konuya veya alt başlıklarına not yazdığınızda hepsi burada sırasıyla tek sayfada görünür.
          </p>
          <button type="button" className={`${btnPrimary} mt-4 min-h-[44px] px-5`} onClick={onBackToNotes} data-testid="reading-empty-back">
            📝 Notlarıma dön
          </button>
        </div>
      ) : (
        <div className="mt-5">
          {/* Owner kararı (5. aşama): İçindekiler paneli yok; okuma alanın tam genişliğini kullanır. */}
          <div className="min-w-0" data-testid="reading-body">
            {rootBlocks.length ? (
              <section className="mb-6" aria-label="Konu notları" data-testid="reading-root-notes">
                <h3 className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Konu notları</h3>
                <div className="space-y-3">
                  {rootBlocks.map((b) => (
                    <ReadingBlock key={b.id} block={b} />
                  ))}
                </div>
              </section>
            ) : null}
            <div className="space-y-8">
              {sections.map((s) => (
                <Section key={s.node.id} s={s} onOpenNode={onOpenNode} />
              ))}
            </div>
            {rootLinks.length ? (
              <section className="mt-8 rounded-[22px] border border-slate-100 bg-white/80 p-4" aria-label="Bağlantılı konular" data-testid="reading-root-links">
                <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">🔗 Bağlantılı konular</h3>
                <p className="mt-1 text-[12px] font-medium text-slate-500">Bu kayıtların içeriği kendi konusunda durur; burada kopyalanmaz.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {rootLinks.map(({ node, originPath }) => (
                    <button key={node.id} type="button" onClick={() => onOpenNode(node.id)} className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-left text-[12.5px] font-bold text-teal-900 hover:bg-teal-100" data-testid="reading-root-link" data-node-id={node.id}>
                      → {node.title}
                      {originPath.length > 1 ? <span className="ml-1 font-semibold text-teal-700/80">· aslı: {originPath.slice(0, -1).join(" › ")}</span> : null}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
});

const HEADING_SIZE = ["", "text-[21px] sm:text-[24px] uppercase tracking-tight", "text-[18px] sm:text-[19px]", "text-[16px]"];

function Section({ s, onOpenNode }: { s: ReadingSection; onOpenNode: (id: string) => void }) {
  const size = HEADING_SIZE[Math.min(s.depth, 3)];
  const nested = s.depth >= 2 && s.depth <= 5;
  const empty = !s.blocks.length && !s.children.length && !s.related?.length && !s.links.length;
  return (
    <section
      id={anchorId(s.node.id)}
      className={`scroll-mt-28 ${nested ? "border-l-2 border-emerald-100 pl-3 sm:pl-5" : ""}`}
      aria-label={`${s.number} ${s.node.title}`}
      data-testid="reading-section"
      data-node-id={s.node.id}
      data-number={s.number}
      data-depth={s.depth}
    >
      <button
        type="button"
        onClick={() => onOpenNode(s.node.id)}
        className="group flex w-full items-baseline gap-2.5 rounded-xl py-1 text-left"
        title="Bu bölümü düzenleme ekranında aç"
        data-testid="reading-heading"
        data-node-id={s.node.id}
      >
        <span
          className={`shrink-0 rounded-lg px-2 py-0.5 text-[12.5px] font-black tabular-nums ${
            s.depth === 1 ? "bg-gradient-to-r from-emerald-600 to-teal-500 text-white [forced-color-adjust:none]" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {s.number}
        </span>
        <span className={`min-w-0 break-words font-black leading-tight text-slate-950 group-hover:text-emerald-800 ${size}`} data-testid="reading-heading-text">
          {s.node.title}
        </span>
        <span className="ml-auto shrink-0 text-[11.5px] font-bold text-emerald-700 opacity-60 group-hover:opacity-100">✎ Düzenle</span>
      </button>
      {s.depth === 1 ? <span className="mt-1 block h-[3px] w-20 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" aria-hidden /> : null}

      {s.related?.length ? <RelatedList entries={s.related} onOpenNode={onOpenNode} /> : null}
      {s.blocks.length ? (
        <div className="mt-3 space-y-3">
          {s.blocks.map((b) => (
            <ReadingBlock key={b.id} block={b} />
          ))}
        </div>
      ) : null}
      {s.links.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="reading-section-links">
          <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">🔗 Bağlantılı</span>
          {s.links.map(({ node, originPath }) => (
            <button key={node.id} type="button" onClick={() => onOpenNode(node.id)} className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-left text-[12px] font-bold text-teal-900 hover:bg-teal-100" data-testid="reading-section-link" data-node-id={node.id}>
              → {node.title}
              {originPath.length > 1 ? <span className="ml-1 font-semibold opacity-75">· aslı: {originPath.slice(0, -1).join(" › ")}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {empty ? <p className="mt-2 text-[13px] font-semibold italic text-slate-400" data-testid="reading-empty-heading">Henüz not yok.</p> : null}
      {s.children.length ? (
        <div className="mt-5 space-y-6">
          {s.children.map((c) => (
            <Section key={c.node.id} s={c} onOpenNode={onOpenNode} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** İlişkili Rahatsızlıklar: aslı bu konuda olanlar + başka konudan bağlananlar (içerik kopyalanmaz). */
function RelatedList({ entries, onOpenNode }: { entries: RelatedEntry[]; onOpenNode: (id: string) => void }) {
  return (
    <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50/40 p-3" data-testid="reading-related">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-rose-800/80">Bu konuyla ilişkili rahatsızlıklar ({entries.length})</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {entries.map((e) => (
          <li key={e.kind === "bagli" ? e.link.id : e.node.id}>
            <button
              type="button"
              onClick={() => (e.kind === "asil" && scrollToSection(e.node.id) ? undefined : onOpenNode(e.node.id))}
              className={`rounded-full border px-3 py-1.5 text-left text-[12.5px] font-bold ${
                e.kind === "asil" ? "border-rose-200 bg-white text-rose-900 hover:bg-rose-50" : "border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100"
              }`}
              data-testid="reading-related-item"
              data-kind={e.kind}
              data-node-id={e.node.id}
            >
              {e.kind === "asil" ? "🩺 " : "🔗 "}
              {e.node.title}
              {e.kind === "bagli" && e.originPath.length > 1 ? <span className="ml-1 font-semibold opacity-75">· aslı: {e.originPath.slice(0, -1).join(" › ")}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadingBlock({ block }: { block: Block }) {
  const cls = block.classification;
  return (
    <article
      className="rounded-[20px] border border-emerald-100/80 bg-white/95 p-4 shadow-sm sm:p-5 max-md:rounded-2xl max-md:p-3.5"
      data-testid="reading-block"
      data-block-id={block.id}
    >
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-base shadow-sm ring-1 ring-white/70" aria-hidden>
          {CLASS_ICON[cls ?? "none"]}
        </span>
        <div className="min-w-0 flex-1">
          {cls ? (
            <span className={`mb-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${CLASS_STYLE[cls]}`} data-testid="reading-block-class">
              {BLOCK_CLASSES.find((c) => c.id === cls)?.label}
            </span>
          ) : null}
          <h4 className="break-words text-[16.5px] font-black leading-6 text-slate-950" data-testid="reading-block-title">
            {block.title}
          </h4>
        </div>
      </header>
      <div className="mt-3">
        <RichView content={block.contentJson} testId="reading-block-view" full />
      </div>
      {block.sources.length ? (
        <section className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3" aria-label="Kaynaklar">
          <h5 className="mb-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Kaynaklar ({block.sources.length})</h5>
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-5 text-slate-700">
            {block.sources.map((s) => (
              <li key={s.id} data-testid="reading-source">
                <span className="mr-1 rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">{sourceKindLabel(s.kind)}</span>
                {s.authors ? `${s.authors} ` : ""}
                {s.year ? `(${s.year}). ` : ""}
                <span className="font-semibold">{s.title}</span>
                {s.doi ? (
                  <>
                    {" · "}
                    <a className="font-bold text-teal-700 underline" href={`https://doi.org/${s.doi}`} target="_blank" rel="noopener noreferrer nofollow" data-testid="reading-doi">
                      DOI: {s.doi}
                    </a>
                  </>
                ) : null}
                {s.url ? (
                  <>
                    {" · "}
                    <a className="break-all font-bold text-teal-700 underline" href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                      Bağlantı
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
