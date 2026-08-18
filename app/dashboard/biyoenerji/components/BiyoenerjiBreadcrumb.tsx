import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type BiyoenerjiCrumb = {
  label: string;
  href?: string;
};

/**
 * Profesyonel, yeniden kullanılabilir breadcrumb — additive.
 * Son öğe geçerli sayfadır (link değil, aria-current).
 * Mobilde zincir sadeleşir: yalnız son iki öğe görünür (öncekiler gizlenir),
 * böylece uzun zincir küçük ekranda taşmaz.
 */
export default function BiyoenerjiBreadcrumb({
  items,
}: {
  items: BiyoenerjiCrumb[];
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Konum" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[12px] font-semibold text-slate-500">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          // Mobilde yalnız son iki öğeyi göster (index < length-2 gizli).
          const mobileHidden = i < items.length - 2;
          const wrapClass = mobileHidden
            ? "hidden items-center sm:flex"
            : "flex items-center";

          return (
            <li key={`${item.label}-${i}`} className={wrapClass}>
              {i > 0 && (
                <ChevronRight
                  className="mx-0.5 h-3.5 w-3.5 shrink-0 text-slate-300"
                  aria-hidden
                />
              )}
              {isLast || !item.href ? (
                <span
                  className={`inline-flex min-h-[40px] items-center truncate sm:min-h-0 ${
                    isLast ? "text-slate-800" : ""
                  }`}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="inline-flex min-h-[40px] items-center truncate rounded-md px-1 transition hover:text-violet-700 sm:min-h-0"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
