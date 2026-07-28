"use client";

/**
 * NKB-V2 — Çok seçenekli (2+) karar diyaloğu. ConfirmProvider 2-butonludur; aynı kaynağa
 * ikinci not eklenirken "Yeni Not Ekle / Mevcut Notu Güncelle / Vazgeç" gibi 3 yol gerekir.
 * Mobil uyumlu (dikey buton yığını), Escape ile kapanır. Kontrollü bileşen.
 */

import { useEffect } from "react";

export type Choice = { label: string; value: string; tone?: "primary" | "neutral" };

export function ChoiceDialog({
  open,
  title,
  message,
  choices,
  onChoose,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  choices: Choice[];
  onChoose: (value: string) => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl"
      >
        <div className="bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-5 text-white">
          <div className="text-lg font-black">{title}</div>
        </div>
        <div className="px-6 py-5">
          {message ? (
            <p className="text-[15px] font-semibold leading-relaxed text-slate-700">{message}</p>
          ) : null}
          <div className="mt-5 flex flex-col gap-2.5">
            {choices.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => onChoose(c.value)}
                className={`h-11 w-full rounded-2xl px-5 text-sm font-black tracking-wide shadow-sm transition hover:brightness-105 ${
                  c.tone === "primary"
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
                    : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
