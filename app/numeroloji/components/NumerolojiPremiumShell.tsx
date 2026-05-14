import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** İçerik genişliği: analiz max-w-5xl, hub/liste max-w-3xl */
  maxWidthClass?: string;
};

/**
 * Numeroloji modülü ortak premium arka plan: çok katmanlı gradient,
 * yumuşak ışık lekeleri, içerik için üst katman (z-10).
 */
export function NumerolojiPremiumShell({ children, maxWidthClass = "max-w-5xl" }: Props) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(155deg,#f5f3ff_0%,#fff7ed_18%,#fefce8_36%,#ecfeff_58%,#fae8ff_78%,#eef2ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-28 -top-20 h-[22rem] w-[22rem] rounded-full bg-violet-400/30 blur-3xl" />
        <div className="absolute -right-20 top-[12%] h-[26rem] w-[26rem] rounded-full bg-amber-300/25 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[15%] h-[20rem] w-[20rem] rounded-full bg-sky-400/22 blur-3xl" />
        <div className="absolute right-[10%] top-[45%] h-[14rem] w-[14rem] rounded-full bg-fuchsia-400/15 blur-2xl" />
      </div>
      <div className={`relative z-10 mx-auto w-full px-4 py-8 sm:px-6 sm:py-10 ${maxWidthClass}`}>{children}</div>
    </div>
  );
}
