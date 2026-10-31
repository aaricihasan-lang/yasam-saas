"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  SEARCH_MATCH_BADGE_COMPACT_CLASS,
  renderHighlightedText,
  textMatchesQuery,
} from "@/lib/dogaltas/searchHighlight";
import { SOURCE_NAME_MAX, normalizeSourceName, sourceDisplayName } from "@/lib/dogaltas/stoneSources";
import type { StoneEntryView } from "@/lib/dogaltas/stoneEntries";

/**
 * Doğaltaş — BİLGİ KAYDI listesi ve düzenleyicisi.
 * Her bilgi kaydı ayrı satırdır ve KENDİ kaynağını taşır ("bunu kim söyledi?" her kayıtta görünür).
 */

function SourceLine({ name }: { name: string | null }) {
  return (
    <p data-testid="stone-entry-source" data-no-search-highlight className="mt-1 flex min-w-0 items-center gap-1 text-[11px] font-bold text-cyan-800">
      <span aria-hidden>📖</span>
      <span className="font-black">Kaynak:</span>
      <span className={`min-w-0 break-words ${name ? "" : "italic text-slate-500"}`}>{sourceDisplayName(name)}</span>
    </p>
  );
}

/** Salt-okunur kayıt listesi. `onOpen` verilirse her kayıt tıklanabilir (okuyucu). */
export function StoneEntryList({
  entries,
  highlightQuery = "",
  clamp = true,
  emptyText,
  onOpen,
  textClassName = "text-sm leading-6 text-slate-700",
  prefix,
}: {
  entries: readonly StoneEntryView[];
  highlightQuery?: string;
  clamp?: boolean;
  emptyText?: string;
  onOpen?: (entry: StoneEntryView) => void;
  textClassName?: string;
  prefix?: ReactNode;
}) {
  const q = highlightQuery.trim();
  if (entries.length === 0) {
    return emptyText ? <p className="mt-2 text-sm italic text-slate-400">{emptyText}</p> : null;
  }
  return (
    <ol data-testid="stone-entry-list" className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
      {entries.map((e) => {
        const hit = Boolean(q) && textMatchesQuery(e.content, q);
        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className={`min-w-0 flex-1 whitespace-pre-wrap ${clamp && !hit ? "line-clamp-4" : ""} ${textClassName}`}>
                {prefix}
                {q ? renderHighlightedText(e.content.trim(), q) : e.content.trim()}
              </p>
              {hit ? <span className={SEARCH_MATCH_BADGE_COMPACT_CLASS}>🔍</span> : null}
            </div>
            <SourceLine name={e.sourceName} />
          </>
        );
        return (
          <li key={e.id} data-testid="stone-entry" data-entry-id={e.id}>
            {onOpen ? (
              <button type="button" onClick={() => onOpen(e)} className="block w-full px-3 py-2.5 text-left transition hover:bg-white">
                {body}
              </button>
            ) : (
              <div className="px-3 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

type EditorProps = {
  title: string;
  badge: string;
  entries: readonly StoneEntryView[];
  suggestions: readonly string[];
  busy: boolean;
  error: string;
  onAdd: (content: string, sourceName: string) => Promise<boolean>;
  onUpdate: (entry: StoneEntryView, content: string, sourceName: string) => Promise<boolean>;
  onDelete: (entry: StoneEntryView) => Promise<void>;
  onClose: () => void;
};

const inputCls =
  "w-full rounded-xl border border-cyan-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

/**
 * Bir bilgi alanının kayıt düzenleyicisi (modal): Mevcut Kayıtlar (her biri Düzenle / Sil) + Yeni Bilgi.
 * Düzenle YALNIZ o kaydı değiştirir; Sil yalnız o kaydı siler (onaylı). Kaynak serbest yazılır; uzmanın
 * kendi daha önce kullandığı kaynaklar öneri olarak gelir.
 */
export function StoneEntriesEditor({ title, badge, entries, suggestions, busy, error, onAdd, onUpdate, onDelete, onClose }: EditorProps) {
  const listId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editSource, setEditSource] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newSource, setNewSource] = useState(() => entries.at(-1)?.sourceName ?? "");
  // G1-01: Kaynak önceki kayıttan hazır gelir. Kullanıcı yazmadan önce alana dokununca bu taşınan
  // değerin TAMAMI seçilir → yazılan yeni kaynak onun yerine geçer (mobilde imleç dokunulan yere
  // düşüp yeni metin eskisinin içine karışıyordu: "Kristal Şifa KitabıAhmet Hoca"). İkinci dokunuş
  // normal imleç koyar; hazır değer olduğu gibi bırakılırsa aynen kaydedilir.
  const [sourceCarried, setSourceCarried] = useState(() => Boolean(entries.at(-1)?.sourceName));
  const carriedTapsRef = useRef(0);
  const [localError, setLocalError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const newRef = useRef<HTMLTextAreaElement | null>(null);

  const editing = entries.find((e) => e.id === editingId) ?? null;
  const dirty = Boolean(newContent.trim()) || (editing !== null && (editContent !== editing.content || normalizeSourceName(editSource) !== (editing.sourceName ?? "")));

  function requestClose() {
    if (busy) return;
    if (dirty) { setConfirmClose(true); return; }
    onClose();
  }

  useEffect(() => {
    // Silme onayı (alertdialog) açıkken Esc onu kapatır; düzenleyici kapanmaz.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="alertdialog"]')) return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  });

  function check(content: string, source: string): string | null {
    if (!content.trim()) return "Bilgi metni boş olamaz.";
    const s = normalizeSourceName(source);
    if (!s) return "Kaynak zorunludur. Bu bilgiyi kimden/nereden aldığınızı yazın.";
    if (s.length > SOURCE_NAME_MAX) return `Kaynak en fazla ${SOURCE_NAME_MAX} karakter olabilir.`;
    return null;
  }

  async function submitNew() {
    const err = check(newContent, newSource);
    if (err) { setLocalError(err); return; }
    setLocalError("");
    if (await onAdd(newContent, normalizeSourceName(newSource))) {
      setNewContent("");
      setSourceCarried(true);
      newRef.current?.focus();
    }
  }

  async function submitEdit() {
    if (!editing) return;
    const err = check(editContent, editSource);
    if (err) { setLocalError(err); return; }
    setLocalError("");
    if (await onUpdate(editing, editContent, normalizeSourceName(editSource))) setEditingId(null);
  }

  function startEdit(e: StoneEntryView) {
    setLocalError("");
    setEditingId(e.id);
    setEditContent(e.content);
    setEditSource(e.sourceName ?? "");
  }

  const shownError = localError || error;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/45 backdrop-blur-sm sm:items-center sm:px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — bilgi kayıtları`}
        data-testid="stone-entries-editor"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl ring-1 ring-slate-200 sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-black tracking-wide text-cyan-700">{badge}</span>
            <h2 className="mt-1 text-[16px] font-black text-slate-950">{title}</h2>
            <p className="text-[11.5px] font-medium text-slate-500">Her bilgi ayrı kayıttır ve kendi kaynağını taşır. Bir kaydı değiştirmek diğerlerini etkilemez.</p>
          </div>
          <button type="button" onClick={requestClose} aria-label="Kapat" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-600 hover:bg-slate-200">×</button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
          <section>
            <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Mevcut Kayıtlar ({entries.length})</h3>
            {entries.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-slate-200 px-3 py-3 text-sm italic text-slate-400">Bu alanda henüz bilgi kaydı yok.</p>
            ) : (
              <ol data-testid="stone-entries-editor-list" className="mt-2 space-y-2">
                {entries.map((e, i) => (
                  <li key={e.id} data-testid="stone-entry-row" data-entry-id={e.id} className="rounded-xl border border-slate-200 border-l-4 border-l-cyan-400 bg-white px-3 py-2.5 shadow-sm">
                    {editingId === e.id ? (
                      <div className="space-y-2">
                        <label className="block text-[11px] font-black text-slate-600">
                          Bilgi
                          <textarea
                            data-testid="stone-entry-edit-content"
                            value={editContent}
                            onChange={(ev) => setEditContent(ev.target.value)}
                            rows={4}
                            className={`${inputCls} mt-1 py-2 leading-6`}
                          />
                        </label>
                        <label className="block text-[11px] font-black text-slate-600">
                          Kaynak
                          <input
                            data-testid="stone-entry-edit-source"
                            value={editSource}
                            list={listId}
                            maxLength={SOURCE_NAME_MAX + 20}
                            onChange={(ev) => setEditSource(ev.target.value)}
                            className={`${inputCls} mt-1 h-11`}
                          />
                        </label>
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" className="btn-soft" disabled={busy} onClick={() => { setEditingId(null); setLocalError(""); }}>Vazgeç</button>
                          <button type="button" data-testid="stone-entry-edit-save" className="btn-primary" disabled={busy} onClick={() => void submitEdit()}>
                            {busy ? "Kaydediliyor…" : "Kaydet"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black text-slate-400">{i + 1}.</p>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{e.content.trim()}</p>
                          <SourceLine name={e.sourceName} />
                        </div>
                        <div className="flex shrink-0 gap-1.5 self-end sm:self-start">
                          <button type="button" data-testid="stone-entry-edit" disabled={busy || editingId !== null} onClick={() => startEdit(e)}
                            className="inline-flex min-h-[36px] items-center rounded-lg border border-emerald-200 bg-white px-3 text-[12px] font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                            Düzenle
                          </button>
                          <button type="button" data-testid="stone-entry-delete" disabled={busy || editingId !== null} onClick={() => void onDelete(e)}
                            className="inline-flex min-h-[36px] items-center rounded-lg border border-red-200 bg-white px-3 text-[12px] font-black text-red-700 hover:bg-red-50 disabled:opacity-50">
                            Sil
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section data-testid="stone-entry-new" className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-3">
            <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-cyan-800">Yeni Bilgi</h3>
            <label className="mt-2 block text-[11px] font-black text-slate-600">
              Bilgi
              <textarea
                ref={newRef}
                data-testid="stone-entry-new-content"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={3}
                placeholder="Ör. Akciğerlere giden kan akışını iyileştirir."
                className={`${inputCls} mt-1 py-2 leading-6`}
              />
            </label>
            <label className="mt-2 block text-[11px] font-black text-slate-600">
              Kaynak
              <input
                data-testid="stone-entry-new-source"
                value={newSource}
                list={listId}
                maxLength={SOURCE_NAME_MAX + 20}
                onChange={(e) => { setNewSource(e.target.value); setSourceCarried(false); }}
                onFocus={(e) => { if (!sourceCarried) return; carriedTapsRef.current = 0; e.currentTarget.select(); }}
                onClick={(e) => {
                  if (!sourceCarried) return;
                  if (carriedTapsRef.current++ === 0) e.currentTarget.select();
                  else setSourceCarried(false);
                }}
                placeholder="Ör. Ahmet Hoca, Kristal Şifa Kitabı"
                className={`${inputCls} mt-1 h-11`}
              />
            </label>
            <datalist id={listId} data-testid="stone-entry-source-suggestions">
              {suggestions.map((n) => <option key={n} value={n} />)}
            </datalist>
            <div className="mt-3 flex justify-end">
              <button type="button" data-testid="stone-entry-add" className="btn-primary w-full sm:w-auto" disabled={busy || editingId !== null} onClick={() => void submitNew()}>
                {busy ? "Kaydediliyor…" : "+ Bilgiyi Ekle"}
              </button>
            </div>
          </section>

          {shownError ? <p role="alert" data-testid="stone-entry-error" className="rounded-xl bg-red-50 px-3 py-2 text-[12.5px] font-bold text-red-700">{shownError}</p> : null}
          {confirmClose ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-bold text-amber-800">
              <span>Kaydedilmemiş bilgi var. Kapatırsanız kaybolur.</span>
              <span className="flex gap-2">
                <button type="button" className="btn-soft" onClick={() => setConfirmClose(false)}>Düzenlemeye dön</button>
                <button type="button" className="btn-danger" onClick={onClose}>Kaydetmeden kapat</button>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Taşta kullanılan kaynakların salt-okunur özeti (kaynak taşın değil, KAYITLARIN özelliğidir). */
export function StoneEntrySourcesSummary({
  sources,
  matchCounts,
}: {
  sources: readonly { name: string | null; count: number; hits?: number }[];
  matchCounts?: boolean;
}) {
  if (sources.length === 0) return null;
  return (
    <section data-testid="stone-sources-bar" aria-label="Bu taşta kullanılan kaynaklar" className="rounded-xl border border-cyan-200 bg-white/90 px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">Kullanılan Kaynaklar ({sources.length})</span>
        <ul className="flex min-w-0 flex-wrap gap-1.5">
          {sources.map((s, i) => (
            <li key={`${s.name ?? ""}-${i}`} data-testid="stone-source-chip"
              className="inline-flex min-h-[32px] max-w-full items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50/70 px-3 py-1 text-[12px] font-black text-cyan-900">
              <span aria-hidden>📖</span>
              <span className={`break-words ${s.name ? "" : "italic"}`}>{sourceDisplayName(s.name)}</span>
              <span className="rounded-full bg-white px-1.5 text-[10px] font-black text-slate-500 ring-1 ring-slate-200" title={`${s.count} bilgi kaydı`}>{s.count}</span>
              {matchCounts && (s.hits ?? 0) > 0 ? (
                <span data-testid="stone-source-hits" className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-black text-yellow-900">🔍 {s.hits}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <p data-testid="stone-source-hint" className="mt-1.5 text-[11.5px] font-medium leading-snug text-slate-600">
        Kaynak her <b className="font-black text-slate-900">bilgi kaydının</b> altında ayrı yazılır. Görseller, mineral/burç/organ atamaları ve uyarı etiketleri taşa aittir.
      </p>
    </section>
  );
}
