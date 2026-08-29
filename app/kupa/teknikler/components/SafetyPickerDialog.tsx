"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { kupaBtnGhost, kupaInput } from "../../components/KupaShell";
import { listSafety, type CuppingSafetyNote } from "../../lib/api";
import { SAFETY_SEVERITY_LABEL } from "../lib/labels";

/**
 * Minimal güvenlik-master seçici (FAZ 4 / 2B). Aynı tenant'ın güvenlik kayıtları
 * (listSafety) içinden seçim. Zaten ekli olanlar "Ekli" ile pasif. Portal → mobil
 * tam-ekran. Standalone /kupa/guvenlik ekranını landing'e GERİ GETİRMEZ.
 */
export function SafetyPickerDialog({
  attachedIds,
  onPick,
  onClose,
}: {
  attachedIds: Set<string>;
  onPick: (safetyId: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<CuppingSafetyNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    listSafety()
      .then((d) => alive && setItems(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Yüklenemedi."));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLocaleLowerCase("tr");
    if (!needle) return items;
    return items.filter(
      (s) =>
        s.title.toLocaleLowerCase("tr").includes(needle) ||
        (s.content ?? "").toLocaleLowerCase("tr").includes(needle),
    );
  }, [items, q]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Güvenlik kaydı ekle"
      onClick={onClose}
    >
      <div
        className="flex h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:h-[70vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-black text-slate-800">Güvenlik Kaydı Ekle</h3>
          <button type="button" onClick={onClose} className={kupaBtnGhost} aria-label="Kapat">
            Kapat
          </button>
        </div>
        <div className="border-b border-slate-100 p-3">
          <input
            autoFocus
            className={kupaInput}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Güvenlik kaydı ara…"
            aria-label="Güvenlik kaydı ara"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{error}</p>
          ) : items === null ? (
            <p className="p-2 text-[13px] text-slate-400">Yükleniyor…</p>
          ) : items.length === 0 ? (
            <p className="p-2 text-[13px] text-slate-500">Henüz güvenlik kaydı yok.</p>
          ) : filtered.length === 0 ? (
            <p className="p-2 text-[13px] text-slate-400">Eşleşen kayıt yok.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {filtered.map((s) => {
                const attached = attachedIds.has(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={attached}
                      onClick={() => onPick(s.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-amber-400/60 ${
                        attached
                          ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-70"
                          : "border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/40"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold text-slate-800">{s.title}</span>
                        <span className="block truncate text-[12px] text-slate-500">
                          {SAFETY_SEVERITY_LABEL[s.severity] ?? "Bilgi"}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] font-semibold text-slate-500">
                        {attached ? "Ekli" : "Ekle"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
