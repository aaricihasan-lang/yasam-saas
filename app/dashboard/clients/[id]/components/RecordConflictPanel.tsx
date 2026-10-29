"use client";

import { useState } from "react";

/**
 * H-05 — Danışan Yolculuğu: kayıt çakışması (409) karşılaştırma paneli + silinmiş kayıt (404) bildirimi.
 *
 * GÖRSEL bileşen; veritabanına YAZMAZ. Yalnız farklı alanlar listelenir; her alan için uzman
 * "Benim taslağım" ya da "Güncel kayıt" seçer (varsayılan: güncel kayıt → hiçbir şey kendiliğinden
 * ezilmez). Kayıt, çağıran sekmenin mevcut atomik sürüm kontrolüyle (row_version) yapılır.
 * Masaüstünde iki sütun yan yana, mobilde alt alta.
 */

/** Karşılaştırılan düz kayıt: alan anahtarı → metin değeri. */
export type FlatRecord = Record<string, string>;
export type ConflictChoice = "mine" | "current";

/** Değeri farklı olan alanlar (iki taraftaki anahtarların birleşimi; eksik alan = boş). */
export function differingKeys(mine: FlatRecord, current: FlatRecord): string[] {
  const keys = Array.from(new Set([...Object.keys(current), ...Object.keys(mine)]));
  return keys.filter((k) => (mine[k] ?? "") !== (current[k] ?? ""));
}

/** Güncel kayıttan başlar; yalnız "mine" seçilen farklı alanlarda taslak değeri alınır. */
export function mergeByChoice(mine: FlatRecord, current: FlatRecord, choices: Record<string, ConflictChoice>): FlatRecord {
  const out: FlatRecord = { ...current };
  for (const k of differingKeys(mine, current)) {
    if (choices[k] === "mine") out[k] = mine[k] ?? "";
  }
  return out;
}

/** İki kayıt tüm alanlarda aynı mı (gereksiz UPDATE önleme). */
export function sameRecord(a: FlatRecord, b: FlatRecord): boolean {
  return differingKeys(a, b).length === 0;
}

/** Metni panoya kopyalar; izin yoksa seçim + execCommand yedeği. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export type ConflictLabels = {
  title: string;
  description: string;
  mine: string;
  current: string;
  empty: string;
  save: string;
  saving: string;
  discard: string;
  copy: string;
  copied: string;
  copyFailed: string;
};

export type ConflictField = { key: string; label: string; mine: string; current: string };

export function RecordConflictPanel({
  labels, fields, choices, onChoose, onSave, saving, onDiscard, draftText,
}: {
  labels: ConflictLabels;
  fields: ConflictField[];
  choices: Record<string, ConflictChoice>;
  onChoose: (key: string, choice: ConflictChoice) => void;
  onSave: () => void;
  saving: boolean;
  onDiscard: () => void;
  draftText: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const show = (v: string) => (v.trim() ? v : labels.empty);
  return (
    <div role="alert" data-testid="record-conflict-panel" className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 sm:p-4">
      <h5 className="text-sm font-black text-amber-900">{labels.title}</h5>
      <p className="mt-1 text-xs font-semibold text-amber-900/90">{labels.description}</p>
      <div className="mt-3 space-y-3">
        {fields.map((f) => {
          const choice = choices[f.key] ?? "current";
          return (
            <div key={f.key} data-testid={`conflict-field-${f.key}`} className="rounded-xl border border-amber-200 bg-white p-2.5">
              <div className="mb-2 text-xs font-black text-slate-700">{f.label}</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(["mine", "current"] as const).map((side) => {
                  const selected = choice === side;
                  return (
                    <button
                      key={side}
                      type="button"
                      aria-pressed={selected}
                      data-testid={`conflict-choice-${f.key}-${side}`}
                      onClick={() => onChoose(f.key, side)}
                      className={`min-h-[44px] rounded-xl border-2 p-2 text-left transition ${selected ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
                    >
                      <span className="block text-[11px] font-black uppercase tracking-wide text-slate-500">
                        {selected ? "✓ " : ""}{side === "mine" ? labels.mine : labels.current}
                      </span>
                      <span className="mt-1 block max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm font-semibold text-slate-800">
                        {show(side === "mine" ? f.mine : f.current)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <button
          type="button"
          data-testid="conflict-copy-draft"
          onClick={async () => setCopyState((await copyText(draftText)) ? "ok" : "fail")}
          className="min-h-[44px] rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {copyState === "ok" ? labels.copied : copyState === "fail" ? labels.copyFailed : labels.copy}
        </button>
        <button
          type="button"
          data-testid="conflict-discard"
          onClick={onDiscard}
          className="min-h-[44px] rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {labels.discard}
        </button>
        <button
          type="button"
          data-testid="conflict-save"
          onClick={onSave}
          disabled={saving}
          className="btn-primary min-h-[44px] px-4 py-2 text-sm disabled:opacity-60"
        >
          {saving ? labels.saving : labels.save}
        </button>
      </div>
    </div>
  );
}

export type DeletedLabels = { title: string; message: string; copy: string; copied: string; copyFailed: string; close: string };

/** 404 — kayıt başka cihazda silinmiş: taslak korunur ve kopyalanabilir; kayıt GERİ OLUŞTURULMAZ. */
export function RecordDeletedNotice({ labels, draftText, onClose }: { labels: DeletedLabels; draftText: string; onClose: () => void }) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <div role="alert" data-testid="record-deleted-notice" className="mb-3 rounded-2xl border border-rose-300 bg-rose-50 p-3 sm:p-4">
      <h5 className="text-sm font-black text-rose-900">{labels.title}</h5>
      <p className="mt-1 text-xs font-semibold text-rose-900/90">{labels.message}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          data-testid="deleted-copy-draft"
          onClick={async () => setCopyState((await copyText(draftText)) ? "ok" : "fail")}
          className="min-h-[44px] rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {copyState === "ok" ? labels.copied : copyState === "fail" ? labels.copyFailed : labels.copy}
        </button>
        <button
          type="button"
          data-testid="deleted-close"
          onClick={onClose}
          className="min-h-[44px] rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {labels.close}
        </button>
      </div>
    </div>
  );
}
