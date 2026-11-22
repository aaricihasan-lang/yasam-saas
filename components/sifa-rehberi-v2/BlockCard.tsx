"use client";

/**
 * İçerik kutusu kartı — mevcut Şifa not kartının görünümü (ikon karesi + rozet + başlık + alt çizgi)
 * korunur. Kutu adı serbesttir; sınıf etiketi isteğe bağlıdır.
 */
import { memo, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { RichEditor } from "@/components/sifa-rehberi-v2/RichEditor";
import { RichView } from "@/components/sifa-rehberi-v2/RichView";
import { PromptDialog } from "@/components/sifa-rehberi-v2/Modal";
import { SourceDialog, sourceKindLabel } from "@/components/sifa-rehberi-v2/Dialogs";
import type { BlockPatch } from "@/lib/sifa-rehberi-v2/tree";
import { BLOCK_CLASSES, type Block, type BlockClass, type SourceRef } from "@/lib/sifa-rehberi-v2/types";

export const CLASS_STYLE: Record<BlockClass, string> = {
  bilimsel: "bg-sky-50 text-sky-800 ring-sky-200",
  geleneksel: "bg-amber-50 text-amber-800 ring-amber-200",
  dini: "bg-violet-50 text-violet-800 ring-violet-200",
  uzman_notu: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  diger: "bg-slate-50 text-slate-700 ring-slate-200",
};
export const CLASS_ICON: Record<BlockClass | "none", string> = {
  bilimsel: "🔬",
  geleneksel: "🌿",
  dini: "📖",
  uzman_notu: "✍️",
  diger: "🗂",
  none: "🗒",
};

const iconBtn =
  "inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 text-[13px] font-bold text-slate-700 shadow-sm transition hover:bg-emerald-50 disabled:opacity-35";

type Props = {
  /** Basit Görünüm: yalnız Düzenle/Bitti; sıralama, ad, sınıf, silme ve kaynak ekleme gizli. */
  simple: boolean;
  block: Block;
  index: number;
  count: number;
  editing: boolean;
  onToggleEdit: (id: string) => void;
  onPatch: (id: string, patch: BlockPatch) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onDelete: (id: string) => void;
  newId: () => string;
  /** Kurum ortak kaydı: SALT-OKUNUR — düzenleme/sıralama/silme araçları hiç gösterilmez. */
  readOnly?: boolean;
};

export const BlockCard = memo(function BlockCard({ simple, block, index, count, editing: editingProp, onToggleEdit, onPatch, onMove, onDelete, newId, readOnly = false }: Props) {
  const editing = editingProp && !readOnly;
  const [dialog, setDialog] = useState<null | "rename" | "source">(null);
  const cls = block.classification;
  const isEmpty = !block.contentText.trim() && !JSON.stringify(block.contentJson ?? {}).includes('"figure"');
  const onEditorChange = (json: JSONContent, text: string) => onPatch(block.id, { contentJson: json, contentText: text });

  return (
    <article
      className="rounded-[22px] border border-emerald-100/80 bg-gradient-to-br from-white via-emerald-50/30 to-cyan-50/20 p-4 shadow-sm ring-1 ring-white/90 sm:p-5 max-md:rounded-2xl max-md:bg-none max-md:bg-white"
      data-testid="block-card"
      data-block-id={block.id}
    >
      <header className="flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-lg shadow-sm ring-1 ring-white/70" aria-hidden>
          {CLASS_ICON[cls ?? "none"]}
        </span>
        <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-3.25rem)]">
          {editing && !simple ? (
            <select
              aria-label="İçerik sınıfı (isteğe bağlı)"
              value={cls ?? ""}
              onChange={(e) => onPatch(block.id, { classification: (e.target.value || null) as BlockClass | null })}
              className="mb-1 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800"
              data-testid="block-class"
            >
              <option value="">Sınıf seçilmedi (isteğe bağlı)</option>
              {BLOCK_CLASSES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          ) : cls ? (
            <span className={`mb-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${CLASS_STYLE[cls]}`}>
              {BLOCK_CLASSES.find((c) => c.id === cls)?.label}
            </span>
          ) : null}
          <h4 className="break-words text-[17px] font-black leading-6 text-slate-950" data-testid="block-title">
            {block.title}
          </h4>
          <span className="mt-1.5 block h-[3px] w-16 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" aria-hidden />
        </div>
        {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-1.5 max-sm:w-full max-sm:justify-end">
          {simple ? null : (
            <>
              <button type="button" className={iconBtn} onClick={() => onMove(block.id, "up")} disabled={index === 0} aria-label="Kutuyu yukarı taşı" title="Yukarı">
                ↑
              </button>
              <button type="button" className={iconBtn} onClick={() => onMove(block.id, "down")} disabled={index === count - 1} aria-label="Kutuyu aşağı taşı" title="Aşağı">
                ↓
              </button>
            </>
          )}
          {editing && !simple ? (
            <button type="button" className={iconBtn} onClick={() => setDialog("rename")} data-testid="block-rename">
              Adı
            </button>
          ) : null}
          <button
            type="button"
            className={
              editing
                ? "inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-emerald-600 bg-emerald-600 px-3 text-[13px] font-black text-white shadow-sm transition hover:bg-emerald-700 [forced-color-adjust:none]"
                : iconBtn
            }
            onClick={() => onToggleEdit(block.id)}
            data-testid="block-edit"
          >
            {editing ? (simple ? "✓ Bitti" : "Bitti") : simple ? "✎ Düzenle" : "Düzenle"}
          </button>
          {simple ? null : (
            <button
              type="button"
              className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-rose-200 bg-white px-2.5 text-[13px] font-bold text-rose-600 shadow-sm transition hover:bg-rose-50"
              onClick={() => onDelete(block.id)}
              aria-label="Kutuyu sil"
              title="Sil (Çöp Kutusu'ndan geri alınabilir)"
              data-testid="block-delete"
            >
              🗑
            </button>
          )}
        </div>
        )}
      </header>

      <div className="mt-4">
        {editing ? (
          <RichEditor initial={block.contentJson} onChange={onEditorChange} simple={simple} />
        ) : isEmpty && !readOnly ? (
          <button
            type="button"
            onClick={() => onToggleEdit(block.id)}
            className="w-full rounded-2xl border border-dashed border-emerald-200 bg-white/70 p-4 text-left text-[14px] font-semibold text-slate-500 hover:bg-emerald-50/50"
          >
            Bu kutu boş. Yazmaya başlamak için dokunun.
          </button>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 max-md:border-0 max-md:p-0">
            <RichView content={block.contentJson} testId="block-view" />
          </div>
        )}
      </div>

      {block.sources.length || (editing && !simple) ? (
        <section className="mt-4 rounded-2xl border border-slate-100 bg-white/80 p-3" aria-label="Kaynaklar">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h5 className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Kaynaklar ({block.sources.length})</h5>
            {editing && !simple ? (
              <button type="button" className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[12px] font-bold text-emerald-800 hover:bg-emerald-50" onClick={() => setDialog("source")} data-testid="source-add">
                + Kaynak / DOI
              </button>
            ) : null}
          </div>
          {block.sources.length ? (
            <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-5 text-slate-700">
              {block.sources.map((s: SourceRef) => (
                <li key={s.id} data-testid="source-item">
                  <span className="mr-1 rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">{sourceKindLabel(s.kind)}</span>
                  {s.authors ? `${s.authors} ` : ""}
                  {s.year ? `(${s.year}). ` : ""}
                  <span className="font-semibold">{s.title}</span>
                  {s.doi ? (
                    <>
                      {" · "}
                      <a className="font-bold text-teal-700 underline" href={`https://doi.org/${s.doi}`} target="_blank" rel="noopener noreferrer nofollow">
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
                  {editing && !simple ? (
                    <button
                      type="button"
                      className="ml-2 text-[12px] font-bold text-rose-600"
                      aria-label="Kaynağı kaldır"
                      onClick={() => onPatch(block.id, { sources: block.sources.filter((x) => x.id !== s.id) })}
                    >
                      ✕
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12px] font-semibold text-slate-400">Henüz kaynak eklenmedi.</p>
          )}
        </section>
      ) : null}

      {dialog === "rename" ? (
        <PromptDialog
          title="Kutu adını değiştir"
          label="Kutu adı"
          initial={block.title}
          confirmText="Uygula"
          onCancel={() => setDialog(null)}
          onSubmit={(v) => {
            onPatch(block.id, { title: v });
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "source" ? (
        <SourceDialog
          newId={newId}
          onCancel={() => setDialog(null)}
          onAdd={(s) => {
            onPatch(block.id, { sources: [...block.sources, s] });
            setDialog(null);
          }}
        />
      ) : null}
    </article>
  );
});
