"use client";

import { useEffect, useMemo, useState } from "react";
import { loadOrganList } from "@/lib/atlasStorage";
import { createOrganId } from "../lib/protocolStorage";
import type { ProtocolFootSide, ProtocolFootView, ProtocolOrganDraft, ProtocolProblemDraft } from "../types";

const emptyOrgan = (): ProtocolOrganDraft => ({
  id: createOrganId(),
  name: "",
  protocolSummary: "",
  applicationNotes: "",
  footView: "taban",
  footSide: "left",
});

type ProtocolFormModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initial: ProtocolProblemDraft | null;
  onClose: () => void;
  onSave: (draft: ProtocolProblemDraft) => void;
};

const inputClass =
  "w-full rounded-lg border border-violet-200/80 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-violet-300/30 focus:border-violet-300 focus:ring-2";
const labelClass = "mb-1 block text-xs font-bold uppercase tracking-wide text-violet-800";

export function ProtocolFormModal({ open, mode, initial, onClose, onSave }: ProtocolFormModalProps) {
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [organs, setOrgans] = useState<ProtocolOrganDraft[]>([emptyOrgan()]);
  const [error, setError] = useState<string | null>(null);
  const [organSuggestions, setOrganSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setOrganSuggestions(loadOrganList());
    if (initial) {
      setTitle(initial.title);
      setShortDescription(initial.shortDescription);
      setOrgans(
        initial.organs.length > 0
          ? initial.organs.map((o) => ({ ...o }))
          : [emptyOrgan()],
      );
    } else {
      setTitle("");
      setShortDescription("");
      setOrgans([emptyOrgan()]);
    }
    setError(null);
  }, [open, initial]);

  const datalistId = useMemo(() => `organ-suggestions-${mode}`, [mode]);

  if (!open) return null;

  const updateOrgan = (index: number, patch: Partial<ProtocolOrganDraft>) => {
    setOrgans((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Hedef / sorun adı zorunludur.");
      return;
    }
    const validOrgans = organs.filter((o) => o.name.trim());
    if (validOrgans.length === 0) {
      setError("En az bir organ ekleyin.");
      return;
    }
    onSave({
      title: title.trim(),
      shortDescription: shortDescription.trim(),
      organs: validOrgans.map((o) => ({
        ...o,
        name: o.name.trim(),
        protocolSummary: o.protocolSummary.trim(),
        applicationNotes: o.applicationNotes.trim(),
      })),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="protocol-form-title"
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/90 bg-white shadow-[0_24px_60px_-20px_rgba(91,33,182,0.35)] ring-1 ring-violet-100/80"
      >
        <div className="shrink-0 border-b border-violet-100/80 px-4 py-3">
          <h2 id="protocol-form-title" className="text-lg font-black text-violet-950">
            {mode === "create" ? "Yeni Protokol" : "Protokolü Düzenle"}
          </h2>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          <div>
            <label className={labelClass}>Hedef / Sorun adı</label>
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn. Sindirim"
              required
            />
          </div>
          <div>
            <label className={labelClass}>Kısa açıklama</label>
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder="Protokolün kısa özeti"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={labelClass}>İlgili organlar</span>
              <button
                type="button"
                onClick={() => setOrgans((prev) => [...prev, emptyOrgan()])}
                className="rounded-lg border border-emerald-300/80 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-900 hover:bg-emerald-100"
              >
                + Organ
              </button>
            </div>

            <datalist id={datalistId}>
              {organSuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>

            {organs.map((organ, index) => (
              <div
                key={organ.id ?? index}
                className="rounded-xl border border-violet-100/90 bg-violet-50/40 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-violet-900">Organ {index + 1}</span>
                  {organs.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setOrgans((prev) => prev.filter((_, i) => i !== index))}
                      className="text-xs font-bold text-rose-700 hover:text-rose-900"
                    >
                      Kaldır
                    </button>
                  ) : null}
                </div>
                <label className={labelClass}>Organ adı</label>
                <input
                  className={inputClass}
                  list={datalistId}
                  value={organ.name}
                  onChange={(e) => updateOrgan(index, { name: e.target.value })}
                  placeholder={organSuggestions.length > 0 ? "Listeden seçin veya yazın" : "Organ adı"}
                />
                <label className={`${labelClass} mt-2`}>Protokol özeti</label>
                <textarea
                  className={`${inputClass} min-h-[56px] resize-y`}
                  value={organ.protocolSummary}
                  onChange={(e) => updateOrgan(index, { protocolSummary: e.target.value })}
                />
                <label className={`${labelClass} mt-2`}>Uygulama notları</label>
                <textarea
                  className={`${inputClass} min-h-[56px] resize-y`}
                  value={organ.applicationNotes}
                  onChange={(e) => updateOrgan(index, { applicationNotes: e.target.value })}
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Görünüm</label>
                    <select
                      className={inputClass}
                      value={organ.footView}
                      onChange={(e) =>
                        updateOrgan(index, { footView: e.target.value as ProtocolFootView })
                      }
                    >
                      <option value="taban">Taban</option>
                      <option value="yan">Yan</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Ayak</label>
                    <select
                      className={inputClass}
                      value={organ.footSide}
                      onChange={(e) =>
                        updateOrgan(index, { footSide: e.target.value as ProtocolFootSide })
                      }
                    >
                      <option value="left">Sol</option>
                      <option value="right">Sağ</option>
                      <option value="both">Her iki ayak</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-violet-100/80 p-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-violet-200/80 bg-white px-3 py-2 text-sm font-bold text-violet-900 hover:bg-violet-50"
          >
            İptal
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg border border-violet-400/80 bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700"
          >
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
