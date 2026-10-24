"use client";

import {
  createContext,
  ReactNode,
  useContext,
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
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(
    null
  );

  const confirm = (opts: ConfirmOptions) => {
    setOptions(opts);

    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  };

  const close = (result: boolean) => {
    resolver?.(result);
    setOptions(null);
    setResolver(null);
  };

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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/40 bg-white shadow-2xl">
            <div
              className={`bg-gradient-to-r ${toneClasses[tone]} px-6 py-5 text-white`}
            >
              <div className="text-lg font-black">
                {options.title || "Onay gerekiyor"}
              </div>
              <div className="mt-1 text-sm text-white/85">
                Lütfen işlemi onayla
              </div>
            </div>

            <div className="px-6 py-6">
              <p className="text-[15px] font-semibold leading-relaxed text-slate-700">
                {options.message}
              </p>

              <div className="mt-7 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-2xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-200"
                >
                  {options.cancelText || "Vazgeç"}
                </button>

                <button
                  type="button"
                  onClick={() => close(true)}
                  className={`rounded-2xl bg-gradient-to-r ${toneClasses[tone]} px-5 py-2.5 text-sm font-black text-white shadow-lg transition hover:scale-[1.02]`}
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