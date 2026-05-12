"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export type ToastInput = {
  title?: string;
  message: string;
  type?: ToastType;
  duration?: number;
};

type ToastItem = Required<Pick<ToastInput, "message">> &
  Omit<ToastInput, "message" | "type" | "duration"> & {
    id: string;
    type: ToastType;
    duration: number;
  };

type ToastContextType = {
  showToast: (options: ToastInput) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

const DEFAULT_DURATION_MS = 4000;

function newToastId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const typeStyles: Record<
  ToastType,
  { bar: string; ring: string; title: string; body: string; icon: string }
> = {
  success: {
    bar: "bg-emerald-400",
    ring: "ring-emerald-500/25 border-emerald-500/35",
    title: "text-emerald-100",
    body: "text-emerald-50/95",
    icon: "✓",
  },
  error: {
    bar: "bg-rose-500",
    ring: "ring-rose-500/25 border-rose-500/40",
    title: "text-rose-100",
    body: "text-rose-50/95",
    icon: "!",
  },
  warning: {
    bar: "bg-amber-400",
    ring: "ring-amber-500/25 border-amber-500/40",
    title: "text-amber-100",
    body: "text-amber-50/95",
    icon: "⚠",
  },
  info: {
    bar: "bg-indigo-400",
    ring: "ring-indigo-500/25 border-indigo-400/35",
    title: "text-indigo-100",
    body: "text-indigo-50/95",
    icon: "i",
  },
};

const panelBg: Record<ToastType, string> = {
  success:
    "bg-gradient-to-br from-emerald-950/95 via-emerald-950/90 to-slate-950/95",
  error:
    "bg-gradient-to-br from-rose-950/95 via-rose-950/90 to-slate-950/95",
  warning:
    "bg-gradient-to-br from-amber-950/95 via-amber-950/88 to-slate-950/95",
  info: "bg-gradient-to-br from-slate-900/95 via-indigo-950/92 to-slate-950/95",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const dismiss = useCallback((id: string) => {
    const existing = timersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (options: ToastInput) => {
      const id = newToastId();
      const type: ToastType = options.type ?? "info";
      const duration = options.duration ?? DEFAULT_DURATION_MS;

      const item: ToastItem = {
        id,
        title: options.title,
        message: options.message,
        type,
        duration,
      };

      setToasts((prev) => [...prev, item]);

      const timer = setTimeout(() => {
        dismiss(id);
      }, duration);
      timersRef.current.set(id, timer);
    },
    [dismiss]
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timerId) => clearTimeout(timerId));
      timersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      <div
        className="pointer-events-none fixed right-0 top-0 z-[10000] flex max-h-[100dvh] w-full max-w-[min(100vw-1rem,22rem)] flex-col gap-2 overflow-y-auto p-3 sm:right-0 sm:top-0 sm:max-w-[min(100vw-1.5rem,24rem)] sm:p-4"
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="pointer-events-auto ml-auto flex w-full flex-col gap-2">
          {toasts.map((toast) => {
            const styles = typeStyles[toast.type];

            return (
              <div
                key={toast.id}
                role="status"
                className={`relative flex overflow-hidden rounded-2xl border shadow-[0_16px_50px_rgba(0,0,0,0.35)] backdrop-blur-md ${panelBg[toast.type]} ${styles.ring} ring-1`}
              >
                <div
                  className={`w-1 shrink-0 ${styles.bar}`}
                  aria-hidden
                />

                <div className="flex min-w-0 flex-1 flex-col gap-1 py-3 pl-3 pr-10">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xs font-black text-white/90 ring-1 ring-white/15"
                      aria-hidden
                    >
                      {styles.icon}
                    </span>

                    <div className="min-w-0 flex-1">
                      {toast.title ? (
                        <div
                          className={`text-sm font-black leading-tight ${styles.title}`}
                        >
                          {toast.title}
                        </div>
                      ) : null}

                      <p
                        className={`text-[13px] font-semibold leading-snug ${toast.title ? "mt-0.5" : ""} ${styles.body}`}
                      >
                        {toast.message}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl text-lg font-bold text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:ring-2 focus-visible:ring-white/40"
                  aria-label="Kapat"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast, ToastProvider içinde kullanılmalı.");
  }

  return context;
}
