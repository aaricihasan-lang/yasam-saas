"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  SOURCE_NAME_MAX,
  normalizeSourceName,
  sourceDisplayName,
  sourceNameKey,
  type StoneSourceView,
} from "@/lib/dogaltas/stoneSources";

/**
 * Doğaltaş taş detayı — BİLGİ KAYNAKLARI çubuğu (WT9; manuel test Madde 14).
 *
 * Taşın kaynaklarını listeler (her kaynak bir çip). İçerik artık kaynak SEKMESİYLE değişmez: her
 * bilgi bölümünde (Fiziksel Etkiler vb.) kaynakların metinleri kendi adlarının altında AYRI gösterilir
 * (bkz. SourceFieldEntries). Düzenleme modunda "Yeni Kaynak" (yalnız ad sorulur; alanlar sonra ilgili
 * bölümde o kaynağın satırından doldurulur), ad düzenleme ve silme. Ad önerileri YALNIZ uzmanın kendi
 * daha önce girdiği kaynaklardır (başka uzmanınki yok).
 */
export type StoneSourcesBarProps = {
  sources: readonly StoneSourceView[];
  editable: boolean;
  busy?: boolean;
  /** Aramada her kaynaktaki eşleşme sayısı (id → adet). */
  matchCounts?: Readonly<Record<string, number>>;
  /** Uzmanın kendi kaynak adı önerileri. */
  suggestions?: readonly string[];
  onAdd: (name: string) => Promise<string | null>;
  onRename: (id: string, name: string) => Promise<string | null>;
  onDelete: (id: string) => void;
};

type NameDialog = { mode: "add" } | { mode: "rename"; id: string; current: string };

export function StoneSourcesBar({
  sources,
  editable,
  busy = false,
  matchCounts = {},
  suggestions = [],
  onAdd,
  onRename,
  onDelete,
}: StoneSourcesBarProps) {
  const [dialog, setDialog] = useState<NameDialog | null>(null);
  const multi = sources.length > 1;
  const only = sources[0];

  return (
    <section
      data-testid="stone-sources-bar"
      aria-label="Bilgi kaynakları"
      className="rounded-xl border border-cyan-200 bg-white/90 px-3 py-2.5 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">
          {multi ? `Bilgi Kaynakları (${sources.length})` : "Bilgi Kaynağı"}
        </span>
        <ul aria-label="Bilgi kaynakları" className="flex min-w-0 flex-wrap gap-1.5">
          {sources.map((s) => {
            const hits = matchCounts[s.id] ?? 0;
            return (
              <li
                key={s.id}
                data-testid="stone-source-chip"
                data-source-id={s.id}
                className="inline-flex min-h-[36px] max-w-full items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50/70 py-1 pl-3 pr-1.5 text-[12px] font-black text-cyan-900"
              >
                <span aria-hidden>📖</span>
                <span className={`break-words ${s.name ? "" : "italic"}`}>{sourceDisplayName(s.name)}</span>
                {hits > 0 ? (
                  <span
                    data-testid="stone-source-hits"
                    className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-black text-yellow-900"
                    title={`${hits} eşleşme`}
                  >
                    🔍 {hits}
                  </span>
                ) : null}
                {editable ? (
                  <>
                    <button
                      type="button"
                      data-testid="stone-source-rename"
                      data-source-id={s.id}
                      disabled={busy}
                      aria-label={`${sourceDisplayName(s.name)} kaynak adını düzenle`}
                      title={s.name ? "Kaynak adını düzenle" : "Kaynak adı ver"}
                      onClick={() => setDialog({ mode: "rename", id: s.id, current: s.name ?? "" })}
                      className="ml-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-1.5 text-[11px] text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      data-testid="stone-source-delete"
                      data-source-id={s.id}
                      disabled={busy || !multi}
                      aria-label={`${sourceDisplayName(s.name)} kaynağını sil`}
                      title={multi ? "Bu kaynağı sil" : "Taşın tek kaynağı silinemez."}
                      onClick={() => onDelete(s.id)}
                      className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-1.5 text-[11px] text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
        {editable ? (
          <button
            type="button"
            data-testid="stone-source-add"
            disabled={busy}
            onClick={() => setDialog({ mode: "add" })}
            className="inline-flex min-h-[36px] items-center rounded-full border border-dashed border-cyan-400 bg-cyan-50 px-3 py-1 text-[12px] font-black text-cyan-800 transition hover:bg-cyan-100 disabled:opacity-60"
          >
            + Yeni Kaynak
          </button>
        ) : null}
      </div>

      {only ? (
        <p data-testid="stone-source-hint" className="mt-1.5 text-[11.5px] font-medium leading-snug text-slate-600">
          {multi ? (
            <>Her bölümde metinler <b className="font-black text-slate-900">kaynak adıyla ayrı ayrı</b> gösterilir; bir kaynağın metni diğerini değiştirmez.</>
          ) : (
            <>Bu taşın metinleri <b className="font-black text-slate-900">{sourceDisplayName(only.name)}</b> kaynağına aittir.</>
          )}{" "}
          Görseller, mineral/burç/organ atamaları ve uyarı etiketleri tüm kaynaklarda ortaktır.
          {editable && !multi ? " Taşın tek kaynağı silinemez." : ""}
        </p>
      ) : null}

      {dialog ? (
        <SourceNameDialog
          dialog={dialog}
          existing={sources}
          suggestions={suggestions}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const err = dialog.mode === "add" ? await onAdd(name) : await onRename(dialog.id, name);
            if (!err) setDialog(null);
            return err;
          }}
        />
      ) : null}
    </section>
  );
}

function SourceNameDialog({
  dialog,
  existing,
  suggestions,
  onClose,
  onSubmit,
}: {
  dialog: NameDialog;
  existing: readonly StoneSourceView[];
  suggestions: readonly string[];
  onClose: () => void;
  onSubmit: (name: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState(dialog.mode === "rename" ? dialog.current : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Bu taşta zaten olan adlar öneride gösterilmez (aynı kaynak iki kez eklenemez).
  const taken = useMemo(() => new Set(existing.filter((s) => s.name).map((s) => sourceNameKey(s.name))), [existing]);
  const options = useMemo(() => suggestions.filter((n) => !taken.has(sourceNameKey(n))), [suggestions, taken]);

  async function submit() {
    const name = normalizeSourceName(value);
    if (!name) { setError("Kaynak adı zorunludur."); return; }
    if (name.length > SOURCE_NAME_MAX) { setError(`Kaynak adı en fazla ${SOURCE_NAME_MAX} karakter olabilir.`); return; }
    const key = sourceNameKey(name);
    const selfId = dialog.mode === "rename" ? dialog.id : null;
    if (existing.some((s) => s.id !== selfId && s.name && sourceNameKey(s.name) === key)) {
      setError("Bu kaynak adı bu taşta zaten var. Mevcut kaynağın satırından düzenleyin.");
      return;
    }
    setSaving(true);
    setError("");
    const err = await onSubmit(name);
    setSaving(false);
    if (err) setError(err);
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dialog.mode === "add" ? "Yeni kaynak ekle" : "Kaynak adını düzenle"}
        data-testid="stone-source-dialog"
        className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-200"
      >
        <h2 className="text-[15px] font-black text-slate-950">{dialog.mode === "add" ? "Yeni Kaynak Ekle" : "Kaynak Adı"}</h2>
        <p className="mt-1 text-[12px] font-medium text-slate-500">
          {dialog.mode === "add"
            ? "Kaynağın adını yazın (ör. kitap, eğitim notu). Ekledikten sonra her bölümde bu kaynağın satırından içeriğini girebilirsiniz; diğer kaynakların içeriği değişmez."
            : "Kaynak adını düzenleyin. İçerik değişmez."}
        </p>
        <input
          ref={inputRef}
          data-testid="stone-source-name-input"
          value={value}
          list={listId}
          maxLength={SOURCE_NAME_MAX + 20}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
          placeholder="Ör. Kristal Şifa Kitabı"
          className="mt-3 h-11 w-full rounded-xl border border-cyan-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
        />
        <datalist id={listId} data-testid="stone-source-suggestions">
          {options.map((n) => <option key={n} value={n} />)}
        </datalist>
        {error ? <p role="alert" className="mt-2 text-[12px] font-bold text-red-700">{error}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-soft w-full">Vazgeç</button>
          <button type="button" data-testid="stone-source-save" onClick={() => void submit()} disabled={saving} className="btn-primary w-full">
            {saving ? "Kaydediliyor…" : dialog.mode === "add" ? "Kaynağı Ekle" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
