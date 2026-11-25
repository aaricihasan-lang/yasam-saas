"use client";

/** Analiz Arşivi içinde "Doğum Profilleri | Horary Soruları" ayrımı (yeni ana menü yok; mevcut premium sekme stili). */
import { useTranslations } from "next-intl";
import { ap } from "../atlas/premium/AtlasPremium";

// I18N: sekme adları katalogda (atlas.horary.archive.mode.<key>); anahtar kanonik.
const MODES = [{ key: "profiles" }, { key: "horary" }] as const;

export default function HoraryArchiveSwitch({ mode, onMode }: { mode: "profiles" | "horary"; onMode: (m: "profiles" | "horary") => void }) {
  const t = useTranslations("atlas.horary") as unknown as (key: string, values?: Record<string, string | number>) => string;
  return (
    <div role="tablist" aria-label={t("archive.mode.aria")} className={`${ap.nav} self-start max-sm:mx-3 max-sm:self-stretch sm:!w-auto`} data-testid="archive-mode-switch">
      {MODES.map((m) => {
        const on = mode === m.key;
        return (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onMode(m.key)}
            className={`${ap.navBtn} ${on ? ap.navBtnActive : ""} min-h-[44px] px-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#6f55c9]`}
            data-testid={`archive-mode-${m.key}`}
          >
            {t(`archive.mode.${m.key}`)}
          </button>
        );
      })}
    </div>
  );
}
