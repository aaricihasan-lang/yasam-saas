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
 * Doğaltaş taş detayı — BİLGİ KAYNAĞI seçici (WT9).
 *
 * Her kaynak bir sekme: hangi metnin hangi kaynağa ait olduğu açıkça görünür. Düzenleme modunda
 * "Yeni Kaynak" (yalnız ad sorulur; alanlar sonra mevcut editörlerle doldurulur), ad düzenleme ve
 * silme. Ad önerileri YALNIZ uzmanın kendi daha önce girdiği kaynaklardır (başka uzmanınki yok).
 */
export type StoneSourcesBarProps = {
  sources: readonly StoneSourceView[];
  activeId: string;
  onSelect: (id: string) => void;
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
  activeId,
  onSelect,
  editable,
  busy = false,
  matchCounts = {},
  suggestions = [],
  onAdd,
  onRename,
  onDelete,
}: StoneSourcesBarProps) {
  const [dialog, setDialog] = useState<NameDialog | null>(null);
  const active = sources.find((s) => s.id === activeId) ?? sources[0];
  const multi = sources.length > 1;

  return (
    <section
      data-testid="stone-sources-bar"
      aria-label="Bilgi kaynakları"
      className="rounded-xl border border-cyan-200 bg-white/90 px-3 py-2.5 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">Bilgi Kaynağı</span>
        <div role="tablist" aria-label="Bilgi kaynakları" className="flex min-w-0 flex-wrap gap-1.5">
          {sources.map((s) => {
            const selected = s.id === active?.id;
            const hits = matchCounts[s.id] ?? 0;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid="stone-source-tab"
                data-source-id={s.id}
                onClick={() => onSelect(s.id)}
                className={`inline-flex min-h-[36px] max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-left text-[12px] font-black transition ${
                  selected
                    ? "border-cyan-500 bg-cyan-600 text-white shadow-sm"
                    : "border-cyan-200 bg-white text-cyan-900 hover:bg-cyan-50"
                }`}
              >
                <span className={`break-words ${s.name ? "" : "italic"}`}>{sourceDisplayName(s.name)}</span>
                {hits > 0 ? (
                  <span
                    data-testid="stone-source-hits"
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${selected ? "bg-yellow-200 text-slate-900" : "bg-yellow-100 text-yellow-900"}`}
                    title={`${hits} eşleşme`}
                  >
                    🔍 {hits}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
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

      {active ? (
        <p data-testid="stone-source-hint" className="mt-1.5 text-[11.5px] font-medium leading-snug text-slate-600">
          Aşağıdaki metinler <b className="font-black text-slate-900">{sourceDisplayName(active.name)}</b> kaynağına aittir.
          {multi ? " Kaynaklar arasında geçmek için yukarıdaki sekmeleri kullanın." : ""} Görseller, mineral/burç/organ atamaları ve uyarı etiketleri tüm kaynaklarda ortaktır.
        </p>
      ) : null}

      {editable && active ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="stone-source-rename"
            disabled={busy}
            onClick={() => setDialog({ mode: "rename", id: active.id, current: active.name ?? "" })}
            className="inline-flex min-h-[34px] items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {active.name ? "Kaynak adını düzenle" : "Kaynak adı ver"}
          </button>
          <button
            type="button"
            data-testid="stone-source-delete"
            disabled={busy || !multi}
            title={multi ? undefined : "Taşın tek kaynağı silinemez."}
            onClick={() => onDelete(active.id)}
            className="inline-flex min-h-[34px] items-center rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11.5px] font-black text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Bu kaynağı sil
          </button>
          {!multi ? (
            <span className="self-center text-[11px] font-semibold text-slate-500">Taşın tek kaynağı silinemez.</span>
          ) : null}
        </div>
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
      setError("Bu kaynak adı bu taşta zaten var. Mevcut kaynağı seçip düzenleyin.");
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
            ? "Kaynağın adını yazın (ör. kitap, eğitim notu). Ekledikten sonra bu kaynağa ait alanları doldurabilirsiniz; diğer kaynakların içeriği değişmez."
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
