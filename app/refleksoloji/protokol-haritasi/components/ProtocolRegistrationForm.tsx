"use client";

import { useEffect, useMemo, useState } from "react";
import { listOrganNamesFromAtlas, loadAtlas, loadOrganList } from "@/lib/atlasStorage";
import type { ProtocolFormDraft, SavedProtocol } from "../types";
import { getOrganColor } from "../types";

type ProtocolRegistrationFormProps = {
  draft: ProtocolFormDraft;
  editId: string | null;
  savedProtocols: SavedProtocol[];
  onDraftChange: (draft: ProtocolFormDraft) => void;
  onSave: () => void;
  onClear: () => void;
  onSelectSaved: (protocol: SavedProtocol) => void;
  saveMessage: string | null;
};

const inputClass =
  "w-full rounded-xl border border-violet-200/90 bg-white px-4 py-3 text-base font-medium text-slate-800 outline-none ring-violet-300/30 focus:border-violet-400 focus:ring-2";
const labelClass = "mb-2 block text-sm font-bold uppercase tracking-wide text-violet-900";

function normalizeKey(name: string): string {
  return name.trim().toLocaleLowerCase("tr");
}

export function ProtocolRegistrationForm({
  draft,
  editId,
  savedProtocols,
  onDraftChange,
  onSave,
  onClear,
  onSelectSaved,
  saveMessage,
}: ProtocolRegistrationFormProps) {
  const [organInput, setOrganInput] = useState("");
  const [organSuggestions, setOrganSuggestions] = useState<string[]>([]);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <h2 className="text-2xl font-bold text-violet-900">Protokol Kaydı</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Hedef, organlar ve uygulama notlarını girin
        </p>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
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
            rows={3}
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
              className="shrink-0 rounded-xl border border-violet-300/80 bg-violet-100 px-4 py-3 text-sm font-bold text-violet-950 hover:bg-violet-200/90"
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
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${color.chipClass}`}
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
          <label className={labelClass} htmlFor="protocol-notes">
            Uygulama Notları
          </label>
          <textarea
            id="protocol-notes"
            value={draft.notes}
            onChange={(e) => onDraftChange({ ...draft, notes: e.target.value })}
            rows={4}
            className={`${inputClass} resize-none`}
            placeholder="Seans süresi, basınç, sıklık vb."
          />
        </div>

        {saveMessage ? (
          <p className="rounded-xl border border-emerald-300/80 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
            {saveMessage}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            className="flex-1 rounded-xl border border-emerald-400/80 bg-emerald-500 px-4 py-3 text-base font-bold text-white shadow-md transition hover:bg-emerald-600"
          >
            {editId ? "Güncelle" : "Kaydet"}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-violet-200/90 bg-violet-50 px-4 py-3 text-base font-bold text-violet-900 hover:bg-violet-100/90"
          >
            Temizle
          </button>
        </div>

        {savedProtocols.length > 0 ? (
          <div className="mt-2 border-t border-violet-100/80 pt-4">
            <h3 className="text-base font-bold text-violet-900">Kayıtlı Protokoller</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {savedProtocols.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelectSaved(p)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                      editId === p.id
                        ? "border-violet-400 bg-violet-100 text-violet-950"
                        : "border-violet-100 bg-white/90 text-slate-800 hover:border-violet-200 hover:bg-violet-50/80"
                    }`}
                  >
                    {p.title}
                    <span className="mt-0.5 block text-sm font-medium text-slate-500">
                      {p.organs.length} organ
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
