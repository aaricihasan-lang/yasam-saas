"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { kupaBtnGhost, kupaBtnSuccess } from "./KupaShell";

/**
 * BÜYÜK NOT EDİTÖRÜ — uzun serbest metin alanları (Profesyonel / Çalışma Notu,
 * Serbest Kaynak Notu) için rahat, geniş yazı ekranı.
 *
 * Davranış (kritik): "Notu Kaydet" DB'ye AYRI kayıt yazmaz; metni yalnız parent
 * form state'ine aktarır. Asıl kayıt, ana formun "Kaydet" butonuyla topic create
 * API'sine gider. "Vazgeç" değişikliği açıkça iptal eder. ESC/overlay VERİ KAYBINA
 * yol açmaz: taslak değiştirilmişse (dirty) yalnız açık "Vazgeç"/"Notu Kaydet" kapatır.
 */
export function BigNoteEditorDialog({
  open,
  title,
  value,
  placeholder,
  onSave,
  onCancel,
}: {
  open: boolean;
  title: string;
  value: string;
  placeholder?: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  // Dialog parent tarafından yalnız açıkken mount edilir; useState(value) böylece her
  // açılışta taslağı mevcut (kaydedilmiş) metinle başlatır → "tekrar aç → metin durur".
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Açılışta metin alanını odakla (setState değil — cascading-render yok).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => taRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const dirty = draft !== value;

  // ESC yalnız taslak DEĞİŞMEMİŞSE kapatır (veri kaybı guard'ı).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dirty) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dirty, onCancel]);

  const handleOverlay = useCallback(() => {
    if (!dirty) onCancel();
  }, [dirty, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center p-0 lg:items-center lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={handleOverlay}
        aria-hidden
      />
      {/* Mobile + TABLET (<1024px): ekranı doldur (100dvh, kenara sıfır, köşesiz — 768px
          tablet dahil, klavye açılınca da kullanılabilir). Desktop (>=1024px): ortalanmış
          ~80vh geniş premium editör. Breakpoint `lg` (sm/768 desktop modal'a GEÇMEZ). */}
      <div className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden border-amber-100 bg-white shadow-2xl lg:h-[80vh] lg:max-h-[80vh] lg:max-w-3xl lg:rounded-2xl lg:border">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h3 className="min-w-0 truncate text-sm font-black tracking-tight text-slate-800">{title}</h3>
          {dirty ? (
            <span className="shrink-0 text-[10.5px] font-medium text-amber-600">Kaydedilmemiş değişiklik</span>
          ) : null}
        </div>

        <div className="flex-1 overflow-hidden p-4 lg:p-5">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="h-full w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] leading-7 text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/70"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
          <span className="text-[11px] text-slate-400">{draft.trim().length} karakter</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} className={kupaBtnGhost}>
              Vazgeç
            </button>
            <button type="button" onClick={() => onSave(draft)} className={kupaBtnSuccess}>
              Notu Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
