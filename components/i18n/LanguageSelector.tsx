"use client";

/**
 * Yaşam Sistemi — Dil Seçici (temel bileşen).
 *
 * FAZ 1 / AŞAMA 2A: Yalnız Türkçe AKTİF. `ACTIVE_LOCALES` tek eleman olduğunda
 * seçici erişilebilir bir statik göstergedir. İkinci dil eklendiğinde (yalnız
 * `lib/i18n/locales.ts` düzenlenerek) bileşen KOD DEĞİŞMEDEN gerçek bir
 * açılır menüye dönüşür.
 *
 * Premium/sade, responsive, mobil dokunma hedefi ≥44px, klavye + aria uyumlu.
 * Bu turda hiçbir sayfaya MOUNT EDİLMEZ (Ana Sayfa ayrı batch). Kullanım:
 *   import LanguageSelector from "@/components/i18n/LanguageSelector";
 *   <LanguageSelector />
 *
 * `compact`: header kümeleri (hub hero, landing üst bar) için daha küçük buton
 * (min 36px dokunma, px-2, text-xs); dar ekranda etiket kısaltma (TR/EN), sm+
 * tam ad. aria-label her iki modda korunur.
 */
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ACTIVE_LOCALES,
  LOCALE_LABELS,
  type ActiveLocale,
} from "@/lib/i18n/locales";
import { setLocale } from "@/lib/i18n/setLocale";

export default function LanguageSelector({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations("common.language");
  const current = useLocale() as ActiveLocale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const multi = ACTIVE_LOCALES.length > 1;

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onEsc(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function choose(locale: ActiveLocale) {
    setOpen(false);
    if (locale === current) return;
    startTransition(async () => {
      const result = await setLocale(locale);
      if (result.ok) router.refresh();
    });
  }

  const label = LOCALE_LABELS[current] ?? current;
  // compact: dar ekranda kısaltma (TR/EN), sm+ tam ad. Ekran okuyucu aria-label'ı okur.
  const labelNode = compact ? (
    <>
      <span className="sm:hidden">{current.toUpperCase()}</span>
      <span className="hidden sm:inline">{label}</span>
    </>
  ) : (
    label
  );

  // Tek aktif dil: erişilebilir statik gösterge.
  if (!multi) {
    return (
      <span
        className={`inline-flex items-center rounded-full font-medium text-emerald-800/80 ${
          compact ? "min-h-[36px] gap-1 whitespace-nowrap px-2 py-1 text-xs" : "min-h-[44px] gap-2 px-3 py-2 text-sm"
        } ${className}`}
        aria-label={t("current", { label })}
      >
        <GlobeIcon size={compact ? 15 : 18} />
        {labelNode}
      </span>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("select")}
        className={`inline-flex items-center rounded-full border border-emerald-200 bg-white/80 font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-60 ${
          compact ? "min-h-[36px] gap-1 whitespace-nowrap px-2 py-1 text-xs" : "min-h-[44px] gap-2 px-3 py-2 text-sm"
        }`}
      >
        <GlobeIcon size={compact ? 15 : 18} />
        {labelNode}
        {compact ? (
          // Dar ekranda yer kazanmak için ok gizli (buton yine açılır menü).
          <span className="hidden sm:inline-flex" aria-hidden="true">
            <ChevronIcon open={open} />
          </span>
        ) : (
          <ChevronIcon open={open} />
        )}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("list")}
          className="absolute right-0 z-50 mt-2 min-w-[10rem] overflow-hidden rounded-xl border border-emerald-100 bg-white py-1 shadow-lg"
        >
          {ACTIVE_LOCALES.map((locale) => {
            const isSelected = locale === current;
            return (
              <li key={locale} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(locale)}
                  className={`flex min-h-[44px] w-full items-center justify-between px-4 py-2 text-left text-sm transition hover:bg-emerald-50 ${
                    isSelected
                      ? "font-semibold text-emerald-700"
                      : "text-slate-700"
                  }`}
                >
                  {LOCALE_LABELS[locale] ?? locale}
                  {isSelected && <CheckIcon />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GlobeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9s1.3-6.5 3.8-9Z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
