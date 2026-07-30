import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  maxWidthClass?: string;
};

export function HumanDesignShell({ children, maxWidthClass = "max-w-none" }: Props) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(155deg,#eef2ff_0%,#faf5ff_20%,#fdf4ff_40%,#f0f9ff_60%,#fefce8_80%,#eef2ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-28 -top-20 h-[22rem] w-[22rem] rounded-full bg-indigo-400/25 blur-3xl" />
        <div className="absolute -right-20 top-[12%] h-[26rem] w-[26rem] rounded-full bg-violet-300/20 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[15%] h-[20rem] w-[20rem] rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute right-[10%] top-[45%] h-[14rem] w-[14rem] rounded-full bg-fuchsia-300/15 blur-2xl" />
      </div>
      <div className={`relative z-10 mx-auto w-full px-4 py-4 lg:px-8 xl:px-10 ${maxWidthClass}`}>
        {children}
      </div>
    </div>
  );
}
