"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type DangerDeleteMode = "selected" | "all";

type BiyoenerjiDangerDeleteModalProps = {
  open: boolean;
  /** "selected" → tek aşamalı onay; "all" → 3 aşamalı + doğrulama kodu */
  mode: DangerDeleteMode;
  /** Silinecek kayıt sayısı (modalda net gösterilir) */
  count: number;
  /** Modül adı (ör. "Biyoenerji Seansları") */
  resourceLabel: string;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

/** SIL-XXXX biçiminde, karıştırılması zor (I/O/0/1 hariç) rastgele doğrulama kodu üretir. */
function generateVerifyCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `SIL-${suffix}`;
}

const cancelBtnClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-[13px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50";

const dangerBtnClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-black text-white shadow-[0_10px_24px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50";

const continueBtnClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-[13px] font-black text-white shadow-[0_10px_24px_rgba(217,119,6,0.22)] transition hover:bg-amber-700 disabled:opacity-50";

export function BiyoenerjiDangerDeleteModal({
  open,
  mode,
  count,
  resourceLabel,
  isDeleting,
  onClose,
  onConfirm,
}: BiyoenerjiDangerDeleteModalProps) {
  // Aşama: 1 = ilk uyarı, 2 = geri alınamaz uyarısı, 3 = doğrulama kodu
  const [stage, setStage] = useState(1);
  const [verifyCode, setVerifyCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Modal her açıldığında baştan başlat + yeni kod üret
  useEffect(() => {
    if (!open) return;
    setStage(1);
    setCodeInput("");
    setVerifyCode(generateVerifyCode());
  }, [open]);

  // Aşama 3'e gelince kod kutusuna odaklan
  useEffect(() => {
    if (open && mode === "all" && stage === 3) {
      const t = window.setTimeout(() => codeInputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [open, mode, stage]);

  // Body scroll kilidi
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) onClose();
    },
    [isDeleting, onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, handleEscape]);

  if (!open || typeof document === "undefined") return null;

  const codeMatches = codeInput.trim().toUpperCase() === verifyCode;
  const isAll = mode === "all";

  const titleText = isAll
    ? "Tüm Kayıtları Sil"
    : `Seçili ${count} Kaydı Sil`;

  let body: React.ReactNode;

  if (!isAll) {
    // Seçilenleri sil — tek aşamalı onay
    body = (
      <>
        <h3 className="mt-2 text-[18px] font-black leading-snug text-slate-950">
          Seçili {count} kaydı silmek istediğinizden emin misiniz?
        </h3>
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-500">
          Bu işlem geri alınamaz. Seçtiğiniz kayıtlar <b>{resourceLabel}</b> listesinden kalıcı olarak silinir.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button type="button" disabled={isDeleting} onClick={onClose} className={cancelBtnClass}>
            Vazgeç
          </button>
          <button type="button" disabled={isDeleting || count === 0} onClick={onConfirm} className={dangerBtnClass}>
            {isDeleting ? "⏳ Siliniyor…" : `🗑 Evet, ${count} kaydı sil`}
          </button>
        </div>
      </>
    );
  } else if (stage === 1) {
    body = (
      <>
        <h3 className="mt-2 text-[18px] font-black leading-snug text-slate-950">
          Bu listedeki tüm kayıtları silmek istediğinizden emin misiniz?
        </h3>
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-500">
          <b>{resourceLabel}</b> modülündeki <b>{count}</b> kayıt etkilenecek.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button type="button" disabled={isDeleting} onClick={onClose} className={cancelBtnClass}>
            Vazgeç
          </button>
          <button type="button" disabled={isDeleting} onClick={() => setStage(2)} className={continueBtnClass}>
            Devam Et
          </button>
        </div>
      </>
    );
  } else if (stage === 2) {
    body = (
      <>
        <h3 className="mt-2 text-[18px] font-black leading-snug text-rose-700">
          Bu işlem geri alınamaz.
        </h3>
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-600">
          Bu modüldeki <b>tüm kayıtlar ({count})</b> kalıcı olarak silinecek. Silinen veriler geri getirilemez.
          Devam etmeden önce yedek aldığınızdan emin olun.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button type="button" disabled={isDeleting} onClick={onClose} className={cancelBtnClass}>
            Vazgeç
          </button>
          <button type="button" disabled={isDeleting} onClick={() => setStage(3)} className={continueBtnClass}>
            Anladım, Devam Et
          </button>
        </div>
      </>
    );
  } else {
    // stage 3 — doğrulama kodu
    body = (
      <>
        <h3 className="mt-2 text-[18px] font-black leading-snug text-slate-950">
          Silmeyi onaylamak için kodu yazın
        </h3>
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-600">
          Aşağıdaki kodu kutuya <b>aynen</b> yazın. Bu, yanlışlıkla toplu silmeyi önler.
        </p>
        <div className="mt-4 flex items-center justify-center rounded-xl border-2 border-dashed border-rose-300 bg-rose-50/70 px-4 py-3">
          <span className="select-all font-mono text-2xl font-black tracking-[0.3em] text-rose-700">
            {verifyCode}
          </span>
        </div>
        <input
          ref={codeInputRef}
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="Kodu buraya yazın"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          disabled={isDeleting}
          className="mt-3 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-center font-mono text-lg font-black uppercase tracking-[0.2em] text-slate-900 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-200/60 disabled:opacity-60"
        />
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button type="button" disabled={isDeleting} onClick={onClose} className={cancelBtnClass}>
            Vazgeç
          </button>
          <button
            type="button"
            disabled={isDeleting || !codeMatches || count === 0}
            onClick={onConfirm}
            className={dangerBtnClass}
          >
            {isDeleting ? "⏳ Siliniyor…" : `🗑 Kalıcı Olarak Sil (${count})`}
          </button>
        </div>
      </>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[20050] flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onClick={() => !isDeleting && onClose()}
    >
      <div
        className="w-full max-w-[460px] rounded-[22px] border border-white/90 bg-white p-5 shadow-[0_24px_64px_-12px_rgba(15,23,42,0.22)] ring-1 ring-rose-100/60 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bio-danger-delete-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black tracking-[0.14em] text-rose-700 ring-1 ring-rose-100">
            <span aria-hidden>⚠</span>
            {isAll ? "TÜMÜNÜ SİL" : "TOPLU SİLME"}
          </span>
          {isAll ? (
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
              Adım {stage}/3
            </span>
          ) : null}
        </div>
        <h2 id="bio-danger-delete-title" className="sr-only">
          {titleText}
        </h2>
        {body}
      </div>
    </div>,
    document.body,
  );
}
