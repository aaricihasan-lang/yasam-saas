"use client";

import { useEffect, useRef } from "react";

/**
 * HD rapor ekranına özel, erişilebilir çoklu-seçenek onay dialog'u (HD-1A).
 *
 * ConfirmProvider yalnız ikili (confirm/cancel) desteklediği için, "Yenile"nin
 * üç seçeneği (Vazgeç / Mevcut Metni Koru / Değişiklikleri At) gibi akışlar için
 * kullanılır. Global ConfirmProvider DEĞİŞTİRİLMEZ; iki ardışık binary confirm
 * KULLANILMAZ.
 *
 * - role="dialog", aria-modal, aria-labelledby/describedby
 * - Escape → cancel; backdrop tıklaması → cancel
 * - İlk GÜVENLİ (safe) aksiyona focus; destructive aksiyona OTOFOKUS YOK
 * - Tab focus-trap; kapanınca focus açan elemana döner
 * - Yeni npm paketi YOK
 */

export type UnsavedAction = {
  /** onAction'a geçilecek anahtar (ör. "keep", "discard") */
  key: string;
  label: string;
  /** görünüm/rol: safe = güvenli/iptal (odaklanılan), danger = yıkıcı, primary = vurgulu */
  tone?: "safe" | "danger" | "primary";
};

type Props = {
  title: string;
  message: string;
  actions: UnsavedAction[];
  /** Escape/backdrop → "cancel" anahtarıyla çağrılır. */
  onAction: (key: string) => void;
};

export function HdUnsavedChangesDialog({ title, message, actions, onAction }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const safeBtnRef = useRef<HTMLButtonElement>(null);

  // Focus: aç → güvenli butona odaklan; kapanınca açan elemana geri dön.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    safeBtnRef.current?.focus();
    return () => {
      opener?.focus?.();
    };
  }, []);

  // Escape → cancel; Tab focus-trap.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onAction("cancel");
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onAction]);

  // İlk "safe" aksiyona focus ref'i bağla (yoksa ilk aksiyona).
  const firstSafeIdx = Math.max(0, actions.findIndex((a) => a.tone === "safe"));

  function toneClass(tone?: UnsavedAction["tone"]): string {
    if (tone === "danger") {
      return "border-rose-300/80 bg-rose-600 text-white hover:brightness-105";
    }
    if (tone === "primary") {
      return "border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:brightness-105";
    }
    return "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200";
  }

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onAction("cancel");
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hd-unsaved-title"
        aria-describedby="hd-unsaved-msg"
        className="w-full max-w-md overflow-hidden rounded-[24px] border border-indigo-200/80 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-5 text-white">
          <div id="hd-unsaved-title" className="text-lg font-black">
            {title}
          </div>
        </div>
        <div className="px-6 py-6">
          <p id="hd-unsaved-msg" className="text-[15px] font-semibold leading-relaxed text-slate-700">
            {message}
          </p>
          <div className="mt-7 flex flex-wrap justify-end gap-3">
            {actions.map((a, i) => (
              <button
                key={a.key}
                ref={i === firstSafeIdx ? safeBtnRef : undefined}
                type="button"
                onClick={() => onAction(a.key)}
                className={`rounded-2xl border px-5 py-2.5 text-sm font-black shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 ${toneClass(a.tone)}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
