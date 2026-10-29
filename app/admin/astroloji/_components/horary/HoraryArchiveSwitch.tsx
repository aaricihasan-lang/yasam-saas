"use client";

/** Analiz Arşivi içinde "Doğum Profilleri | Horary Soruları" ayrımı (yeni ana menü yok; mevcut premium sekme stili). */
import { ap } from "../atlas/premium/AtlasPremium";

const MODES = [
  { key: "profiles", label: "Doğum Profilleri" },
  { key: "horary", label: "Horary Soruları" },
] as const;

export default function HoraryArchiveSwitch({ mode, onMode }: { mode: "profiles" | "horary"; onMode: (m: "profiles" | "horary") => void }) {
  return (
    <div role="tablist" aria-label="Arşiv türü" className={`${ap.nav} self-start max-sm:mx-3 max-sm:self-stretch sm:!w-auto`} data-testid="archive-mode-switch">
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
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
