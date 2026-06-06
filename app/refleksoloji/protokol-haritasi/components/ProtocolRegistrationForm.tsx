"use client";

import { useEffect, useMemo, useState } from "react";
import { listOrganNamesFromAtlas, loadAtlas, loadOrganList } from "@/lib/atlasStorage";
import type { ProtocolFormDraft } from "../types";
import { getOrganColor } from "../types";
import { ProtocolNotesModal } from "./ProtocolNotesModal";

type ProtocolRegistrationFormProps = {
  draft: ProtocolFormDraft;
  onDraftChange: (draft: ProtocolFormDraft) => void;
  onSave: () => void;
  onClear: () => void;
  validationMessage: string | null;
};

const inputClass =
  "w-full rounded-xl border border-violet-200/90 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 outline-none ring-violet-300/30 focus:border-violet-400 focus:ring-2";
const labelClass = "mb-1 block text-[10px] font-bold uppercase tracking-wide text-violet-900";

function normalizeKey(name: string): string {
  return name.trim().toLocaleLowerCase("tr");
}

export function ProtocolRegistrationForm({
  draft,
  onDraftChange,
  onSave,
  onClear,
  validationMessage,
}: ProtocolRegistrationFormProps) {
  const [organInput, setOrganInput] = useState("");
  const [organSuggestions, setOrganSuggestions] = useState<string[]>([]);
  const [notesModalOpen, setNotesModalOpen] = useState(false);

  useEffect(() => {
    const atlas = loadAtlas();
    const fromAtlas = listOrganNamesFromAtlas(atlas);
    const fromList = loadOrganList();
    const merged = [...new Set([...fromAtlas, ...fromList])].sort((a, b) => a.localeCompare(b, "tr"));
    setOrganSuggestions(merged);
  }, []);

  const datalistId = useMemo(() => "protocol-organ-suggestions", []);

  const addOrgan = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    const exists = draft.organs.some((o) => normalizeKey(o) === normalizeKey(name));
    if (exists) return;
    onDraftChange({ ...draft, organs: [...draft.organs, name] });
    setOrganInput("");
  };

  const removeOrgan = (name: string) => {
    onDraftChange({ ...draft, organs: draft.organs.filter((o) => o !== name) });
  };

  const openNotesModal = () => setNotesModalOpen(true);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <h2 className="text-sm font-bold text-violet-900">Protokol Kaydı</h2>
        <p className="mt-0.5 text-xs font-medium text-slate-500">
          Hedef, organlar ve uygulama notlarını girin
        </p>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <div>
          <label className={labelClass} htmlFor="protocol-title">
            Hedef / Sorun Adı
          </label>
          <input
            id="protocol-title"
            value={draft.title}
            onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
            className={inputClass}
            placeholder="Örn. Sindirim Problemi"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="protocol-description">
            Kısa Açıklama
          </label>
          <textarea
            id="protocol-description"
            value={draft.description}
            onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
            rows={2}
            className={`${inputClass} resize-none`}
            placeholder="Protokolün amacı ve kapsamı"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="protocol-organ-input">
            Organ Ekle
          </label>
          <div className="flex gap-2">
            <input
              id="protocol-organ-input"
              list={datalistId}
              value={organInput}
              onChange={(e) => setOrganInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOrgan(organInput);
                }
              }}
              className={inputClass}
              placeholder="Organ adı yazın veya seçin"
            />
            <button
              type="button"
              onClick={() => addOrgan(organInput)}
              className="shrink-0 rounded-xl border border-violet-300/80 bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-950 hover:bg-violet-200/90"
            >
              Ekle
            </button>
          </div>
          <datalist id={datalistId}>
            {organSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        {draft.organs.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {draft.organs.map((name, index) => {
              const color = getOrganColor(index);
              return (
                <li key={name}>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-bold ${color.chipClass}`}
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => removeOrgan(name)}
                      className="rounded-md px-1.5 text-sm leading-none opacity-70 hover:opacity-100"
                      aria-label={`${name} kaldır`}
                    >
                      ×
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm font-medium text-slate-500">Henüz organ eklenmedi.</p>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className={labelClass} htmlFor="protocol-notes">
              Uygulama Notları
            </label>
            <button
              type="button"
              onClick={openNotesModal}
              className="text-sm font-bold text-violet-700 underline-offset-2 hover:underline"
            >
              Genişlet
            </button>
          </div>
          <textarea
            id="protocol-notes"
            value={draft.notes}
            onChange={(e) => onDraftChange({ ...draft, notes: e.target.value })}
            onFocus={openNotesModal}
            onClick={openNotesModal}
            rows={3}
            className={`${inputClass} cursor-text resize-none`}
            placeholder="Tıklayarak geniş not alanını açın…"
          />
        </div>

        {validationMessage ? (
          <p className="rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">
            {validationMessage}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            className="flex-1 rounded-xl border border-emerald-400/80 bg-emerald-500 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600"
          >
            Kaydet
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-violet-200/90 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-900 hover:bg-violet-100/90"
          >
            Temizle
          </button>
        </div>
      </div>

      <ProtocolNotesModal
        open={notesModalOpen}
        value={draft.notes}
        onClose={() => setNotesModalOpen(false)}
        onSave={(notes) => onDraftChange({ ...draft, notes })}
      />
    </div>
  );
}
