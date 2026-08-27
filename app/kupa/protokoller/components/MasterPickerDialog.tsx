"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { kupaBtnGhost, kupaInput } from "@/app/kupa/components/KupaShell";

export type PickerItem = { id: string; label: string; meta?: string };

/**
 * Master library seçici (point / technique / safety / source için ortak).
 * YALNIZ mevcut master kayıtlardan seçim — QUICK-CREATE YOK (FAZ 3). Master boşsa
 * profesyonel açıklama; sahte/disabled "+ Yeni ... Oluştur" CTA GÖSTERİLMEZ.
 * Erişilebilir: focus, Escape, arama, 44px dokunma hedefi, seçili disable.
 */
export function MasterPickerDialog({
  open,
  title,
  items,
  selectedIds,
  emptyMessage,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  items: PickerItem[];
  selectedIds: string[];
  emptyMessage: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // setState'i deferred timeout'ta yap (sync effect setState → cascading-render lint'i).
    const t = setTimeout(() => {
      setQ("");
      searchRef.current?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    if (!needle) return items;
    return items.filter(
      (it) =>
        it.label.toLocaleLowerCase("tr").includes(needle) ||
        (it.meta ? it.meta.toLocaleLowerCase("tr").includes(needle) : false),
    );
  }, [items, q]);

  if (!open) return null;
  const selected = new Set(selectedIds);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center p-0 lg:items-center lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl lg:h-[70vh] lg:max-w-lg lg:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h3 className="truncate text-sm font-black tracking-tight text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className={kupaBtnGhost} aria-label="Kapat">
            Kapat
          </button>
        </div>
        <div className="border-b border-slate-100 p-3">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ara…"
            className={kupaInput}
            aria-label="Ara"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-slate-500">Aramanızla eşleşen kayıt bulunamadı.</p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((it) => {
                const isSel = selected.has(it.id);
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      disabled={isSel}
                      onClick={() => onPick(it.id)}
                      className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800">{it.label}</span>
                        {it.meta ? <span className="block truncate text-[11px] text-slate-400">{it.meta}</span> : null}
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                        {isSel ? "Ekli" : "Ekle"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
