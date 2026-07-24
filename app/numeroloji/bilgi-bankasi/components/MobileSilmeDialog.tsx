"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  SILME_ONAY_METNI,
  silmeBaslat,
  silmeIleri,
  silmeIptal,
  silmeMetinGuncelle,
  silmeOnaylanabilir,
  type SilmeState,
} from "../../helpers/mobileUxLogic";

/**
 * NUM-MOB-1 — Mobil iki-aşamalı (iki bağımsız kapı) silme onay dialog'u.
 * YALNIZ mobilde kullanılır (çağıran taraf md altını garanti eder).
 *
 * Güvenlik sözleşmesi:
 *  - Birinci kapı: kaydın kimliği açıkça yazılır, API çağrılmaz.
 *  - İkinci kapı: kullanıcı birebir "SİL" yazmadan nihai düğme aktif olmaz.
 *  - onConfirm YALNIZ nihai düğmede bir kez çağrılır; süre boyunca kilitli.
 *  - İptal/ESC/backdrop → onConfirm YOK; yazılan doğrulama metni temizlenir.
 *  - createPortal + body scroll lock + ESC + cleanup.
 */
/**
 * YALNIZ açıkken (hedef seçiliyken) parent tarafından mount edilir → state her
 * açılışta useState initializer ile taze başlar (reset effect'e gerek yok).
 */
export function MobileSilmeDialog({
  baslik,
  kimlik,
  onConfirm,
  onClose,
}: {
  /** Örn. "Kaydı sil" veya "Seçili kayıtları sil". */
  baslik: string;
  /** İki kapıda da gösterilen kimlik: "Ana Kulvar — 3" veya "5 kayıt". */
  kimlik: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [state, setState] = useState<SilmeState>(() => silmeBaslat());
  const [busy, setBusy] = useState(false);

  const kapat = useCallback(() => {
    if (busy) return; // silme sürerken kapatma tetiklenmez
    setState(silmeIptal());
    onClose();
  }, [busy, onClose]);

  // Body scroll lock + ESC (mount → unmount).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") kapat();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [kapat]);

  if (typeof document === "undefined") return null;

  const onaylanabilir = silmeOnaylanabilir(state);

  async function handleFinal() {
    if (!silmeOnaylanabilir(state) || busy) return; // çift tıklama koruması + gate
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobil-silme-baslik"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Kapat"
        onClick={kapat}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/40 bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-rose-600 to-red-700 px-5 py-4 text-white">
          <p id="mobil-silme-baslik" className="text-base font-black">{baslik}</p>
          <p className="mt-0.5 text-xs font-semibold text-white/85">
            {state.asama === "onay2" ? "Son adım — bu işlem geri alınamaz" : "Bu işlem kalıcıdır"}
          </p>
        </div>

        <div className="px-5 py-5">
          {state.asama === "onay1" ? (
            <>
              <p className="text-[15px] font-semibold leading-relaxed text-slate-700">
                <span className="font-black text-rose-700">{kimlik}</span> silmek istediğinize emin misiniz?
              </p>
              <div className="mt-6 flex gap-2.5">
                <button
                  type="button"
                  onClick={kapat}
                  className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-200"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => setState((s) => silmeIleri(s))}
                  className="min-h-[44px] flex-1 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 px-4 text-sm font-black text-white shadow-md transition hover:brightness-105"
                >
                  Devam
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold leading-relaxed text-slate-700">
                <span className="font-black text-rose-700">{kimlik}</span> kalıcı olarak silinecek.
              </p>
              <label htmlFor="mobil-silme-onay" className="mt-4 block text-xs font-bold text-slate-600">
                Onaylamak için <span className="font-black text-rose-700">{SILME_ONAY_METNI}</span> yazın
              </label>
              <input
                id="mobil-silme-onay"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                value={state.dogrulama}
                onChange={(e) => setState((s) => silmeMetinGuncelle(s, e.target.value))}
                placeholder={SILME_ONAY_METNI}
                className="mt-1.5 h-11 w-full rounded-xl border-2 border-rose-200 bg-white px-4 text-sm font-black tracking-widest text-slate-900 outline-none ring-1 ring-rose-100 transition focus:border-rose-400 focus:ring-2 focus:ring-rose-300/40"
              />
              <div className="mt-5 flex gap-2.5">
                <button
                  type="button"
                  onClick={kapat}
                  disabled={busy}
                  className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => void handleFinal()}
                  disabled={!onaylanabilir || busy}
                  className="min-h-[44px] flex-1 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 px-4 text-sm font-black text-white shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-500 disabled:opacity-70"
                >
                  {busy ? "Siliniyor…" : "Kaydı Kalıcı Olarak Sil"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
