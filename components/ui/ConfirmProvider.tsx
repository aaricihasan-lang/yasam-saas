"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ConfirmTone = "danger" | "info" | "success" | "warning";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
};

type ConfirmContextType = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);
  const [busy, setBusy] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = (opts: ConfirmOptions) => {
    setBusy(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  };

  const close = (result: boolean) => {
    if (busy && result) return; // silme devam ederken tekrar tetikleme
    resolver?.(result);
    setOptions(null);
    setResolver(null);
    setBusy(false);
  };

  // Focus yönetimi ve klavye trap
  useEffect(() => {
    if (!options) return;

    // Modal açılınca cancel butonuna odaklan
    const timer = setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 30);

    function handleKeyDown(e: KeyboardEvent) {
      if (!modalRef.current) return;

      // Escape → iptal et (hiçbir şey silme)
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
        return;
      }

      // Tab tuşunu modal içinde kapat
      if (e.key === "Tab") {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const tone = options?.tone || "info";

  const toneClasses: Record<ConfirmTone, string> = {
    danger: "from-rose-600 to-red-700",
    info: "from-sky-600 to-indigo-700",
    success: "from-emerald-600 to-teal-700",
    warning: "from-amber-500 to-orange-600",
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {options && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
          aria-hidden={false}
          onClick={(e) => {
            // Dışarı tıklama → iptal et (silmeyi tetikleme)
            if (e.target === e.currentTarget) close(false);
          }}
        >
          <div
            ref={modalRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/40 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`bg-gradient-to-r ${toneClasses[tone]} px-6 py-5 text-white`}
            >
              <div id="confirm-title" className="text-lg font-black">
                {options.title || "Onay gerekiyor"}
              </div>
              <div className="mt-1 text-sm text-white/85">
                Lütfen işlemi onayla
              </div>
            </div>

            <div className="px-6 py-6">
              <p id="confirm-message" className="text-[15px] font-semibold leading-relaxed text-slate-700">
                {options.message}
              </p>

              <div className="mt-7 flex justify-end gap-3">
                <button
                  ref={cancelBtnRef}
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-2xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                >
                  {options.cancelText || "Vazgeç"}
                </button>

                <button
                  ref={confirmBtnRef}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    close(true);
                  }}
                  className={`rounded-2xl bg-gradient-to-r ${toneClasses[tone]} px-5 py-2.5 text-sm font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white`}
                >
                  {options.confirmText || "Tamam"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm, ConfirmProvider içinde kullanılmalı.");
  }
  return context;
}
