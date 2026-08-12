import { List } from "lucide-react";

/**
 * FAZ 3.1 — Çakra detay iç section navigasyonu (anchor tabanlı, UI-only).
 * Sekme-unmount YOK: yalnız `#hash` anchor'a götürür (deep-link doğal çalışır).
 * Scrollspy YOK (bu pilotta zorunlu değil). Masaüstü: dikey liste (sticky parent).
 * Mobil: kompakt <details> "İçindekiler" (yatay taşan tab dizisi YOK, 44px).
 */
export default function ChakraSectionNav({
  sections,
}: {
  sections: { hash: string; title: string }[];
}) {
  if (sections.length === 0) return null;

  return (
    <>
      {/* Mobil: kompakt açılır içindekiler */}
      <details className="rounded-xl border border-violet-100 bg-white/85 shadow-sm lg:hidden">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 text-[13px] font-black text-slate-700">
          <span className="inline-flex items-center gap-2">
            <List className="h-4 w-4 text-violet-600" strokeWidth={2} aria-hidden />
            İçindekiler
          </span>
          <span className="text-[11px] font-semibold text-violet-600">{sections.length} bölüm</span>
        </summary>
        <ul className="border-t border-slate-100 px-2 pb-2 pt-1">
          {sections.map((s) => (
            <li key={s.hash}>
              <a
                href={`#${s.hash}`}
                className="flex min-h-[44px] items-center rounded-lg px-2 text-[13px] font-semibold text-slate-600 transition hover:bg-violet-50 hover:text-violet-800"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </details>

      {/* Masaüstü: dikey anchor listesi (parent sticky) */}
      <nav aria-label="Çakra bölümleri" className="hidden lg:block">
        <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700/80">
          İçindekiler
        </p>
        <ul className="space-y-0.5">
          {sections.map((s) => (
            <li key={s.hash}>
              <a
                href={`#${s.hash}`}
                className="block rounded-lg px-2 py-1.5 text-[13px] font-semibold text-slate-600 transition hover:bg-violet-50 hover:text-violet-800"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
