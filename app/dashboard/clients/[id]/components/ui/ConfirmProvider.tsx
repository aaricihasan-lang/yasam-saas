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
    danger: "border-[#9b1c12] bg-[#b42318] hover:bg-[#9b1c12]",
    info: "border-[#13284b] bg-[#13284b] hover:bg-[#1d3762]",
    success: "border-[#0c5c5c] bg-[#0f6e6e] hover:bg-[#0c5c5c]",
    warning: "border-[#7a4d00] bg-[#9a6100] hover:bg-[#7a4d00]",
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {options && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(15,29,54,0.45)] px-4 backdrop-blur-[3px]">
          <div className="w-full max-w-md overflow-hidden rounded-[14px] border border-[#e3e7ee] bg-white shadow-[0_24px_60px_-24px_rgba(15,29,54,0.45)]">
            <div
              className="border-b border-[#e3e7ee] bg-[#f8f9fb] px-6 py-5"
            >
              <div className="text-lg font-extrabold text-[#0f1d36]">
                {options.title || "Onay gerekiyor"}
              </div>
              <div className="mt-1 text-sm text-[#55637a]">
                Lütfen işlemi onayla
              </div>
            </div>

            <div className="px-6 py-6">
              <p className="text-[15px] font-medium leading-relaxed text-[#1f3050]">
                {options.message}
              </p>

              <div className="mt-7 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-[10px] border border-[#d4dae3] bg-white px-4 py-2 text-sm font-bold text-[#1f3050] transition hover:bg-[#f8f9fb]"
                >
                  {options.cancelText || "Vazgeç"}
                </button>

                <button
                  type="button"
                  onClick={() => close(true)}
                  className={`rounded-[10px] border ${toneClasses[tone]} px-4 py-2 text-sm font-bold text-white transition`}
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