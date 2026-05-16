import Link from "next/link";

export type ReflexologyModuleCardProps = {
  href: string;
  title: string;
  icon: string;
  lines: readonly string[];
  accent: string;
  ring: string;
  wide?: boolean;
  compact?: boolean;
};

export function ReflexologyModuleCard({
  href,
  title,
  icon,
  lines,
  accent,
  ring,
  wide = false,
  compact = false,
}: ReflexologyModuleCardProps) {
  const isCompactLayout = compact && !wide;

  return (
    <Link
      href={href}
      className={`group relative flex h-full min-h-[150px] overflow-hidden border border-white/90 bg-white/80 shadow-[0_18px_48px_-18px_rgba(109,40,217,0.22)] ring-1 backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:border-violet-200/90 hover:bg-white/95 hover:shadow-[0_28px_64px_-20px_rgba(109,40,217,0.32)] active:scale-[0.99] ${ring} ${
        isCompactLayout
          ? "rounded-2xl p-4"
          : wide
            ? "rounded-[28px] p-7 sm:p-8"
            : "rounded-[28px] p-6 sm:p-7"
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
        className={`relative flex h-full ${wide ? "flex-col gap-5 sm:flex-row sm:items-center sm:justify-between" : "flex-col justify-between"}`}
      >
        <div className={`flex items-start ${isCompactLayout ? "gap-3" : "gap-4 sm:gap-5"}`}>
          <span
            className={`inline-flex shrink-0 items-center justify-center border border-violet-200/80 bg-white/95 shadow-[0_8px_24px_-8px_rgba(109,40,217,0.2)] ring-1 ring-white/80 transition-transform duration-300 group-hover:scale-105 ${
              isCompactLayout
                ? "h-11 w-11 rounded-xl text-2xl"
                : "h-16 w-16 rounded-2xl text-3xl sm:h-[4.5rem] sm:w-[4.5rem]"
            }`}
            aria-hidden
          >
            {icon}
          </span>
          <div className="min-w-0 pt-0.5">
            <h2
              className={`font-black tracking-tight text-slate-900 ${
                isCompactLayout ? "text-lg leading-tight" : "text-xl sm:text-2xl"
              }`}
            >
              {title}
            </h2>
            <div className={isCompactLayout ? "mt-1.5 space-y-0.5" : "mt-3 space-y-1.5"}>
              {lines.map((line) => (
                <p
                  key={line}
                  className={`font-medium leading-snug text-slate-600 ${
                    isCompactLayout ? "text-xs" : "text-sm sm:text-[0.95rem]"
                  }`}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-2 font-black uppercase tracking-[0.2em] text-violet-700 transition group-hover:text-violet-900 ${
            isCompactLayout ? "mt-2 text-[10px]" : wide ? "text-xs sm:self-center" : "mt-5 text-xs"
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
