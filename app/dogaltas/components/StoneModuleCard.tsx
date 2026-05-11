import Link from "next/link";

type StoneModuleCardProps = {
  title: string;
  subtitle: string;
  icon: string;
  href: string;
  color: string;
};

export default function StoneModuleCard({
  title,
  subtitle,
  icon,
  href,
  color,
}: StoneModuleCardProps) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-[18px] border border-slate-200/80 bg-white/85 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: color }}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xl ring-1 ring-slate-200/80">
            {icon}
          </div>

          <div>
            <h2 className="text-[18px] font-bold tracking-tight text-slate-900">
              {title}
            </h2>

            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
              {subtitle}
            </p>
          </div>
        </div>

        <span className="mt-1 text-lg text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-slate-600">
          →
        </span>
      </div>
    </Link>
  );
}