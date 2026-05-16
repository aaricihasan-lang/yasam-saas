import Link from "next/link";

export type ReflexologyModuleCardProps = {
  href: string;
  title: string;
  icon: string;
  lines: readonly string[];
  accent: string;
  ring: string;
  wide?: boolean;
};

export function ReflexologyModuleCard({
  href,
  title,
  icon,
  lines,
  accent,
  ring,
  wide = false,
}: ReflexologyModuleCardProps) {
  return (
    <Link
      href={href}
      className={`group relative block overflow-hidden rounded-[28px] border border-white/90 bg-white/80 shadow-[0_18px_48px_-18px_rgba(109,40,217,0.22)] ring-1 backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:border-violet-200/90 hover:bg-white/95 hover:shadow-[0_28px_64px_-20px_rgba(109,40,217,0.32)] active:scale-[0.99] ${ring} ${
        wide ? "p-7 sm:p-8" : "p-6 sm:p-7"
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent} opacity-90 transition-opacity duration-300 group-hover:opacity-100`}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-300/20 blur-3xl transition-all duration-300 group-hover:bg-violet-400/30 ${
          wide ? "h-56 w-56" : ""
        }`}
        aria-hidden
      />

      <div
        className={`relative flex ${wide ? "flex-col gap-5 sm:flex-row sm:items-center sm:justify-between" : "flex-col"}`}
      >
        <div className="flex items-start gap-4 sm:gap-5">
          <span
            className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-violet-200/80 bg-white/95 text-3xl shadow-[0_8px_24px_-8px_rgba(109,40,217,0.2)] ring-1 ring-white/80 transition-transform duration-300 group-hover:scale-105 sm:h-[4.5rem] sm:w-[4.5rem]"
            aria-hidden
          >
            {icon}
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
            <div className="mt-3 space-y-1.5">
              {lines.map((line) => (
                <p key={line} className="text-sm font-medium leading-relaxed text-slate-600 sm:text-[0.95rem]">
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-violet-700 transition group-hover:text-violet-900 ${
            wide ? "sm:self-center" : "mt-5"
          }`}
        >
          Modüle git
          <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
