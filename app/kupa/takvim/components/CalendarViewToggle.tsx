"use client";

/**
 * FAZ 5 / AŞAMA 3 — Görünüm anahtarı (segmented control): Aylık Düzenleme ↔ Yıllık Özet.
 *
 * İki görünüm AYNI planın/taslağın iki gösterimidir. Anahtar değiştirmek: kaydetmez,
 * taslağı silmez, seçimi sıfırlamaz, yeni plan getirmez — yalnızca gösterimi değiştirir.
 */
export type CalendarView = "monthly" | "annual";

export function CalendarViewToggle({
  view,
  onChange,
}: {
  view: CalendarView;
  onChange: (view: CalendarView) => void;
}) {
  const items: { key: CalendarView; label: string }[] = [
    { key: "monthly", label: "Aylık Düzenleme" },
    { key: "annual", label: "Yıllık Özet" },
  ];
  return (
    <div
      role="group"
      aria-label="Takvim görünümü"
      className="inline-flex w-full items-center gap-1 rounded-2xl border border-amber-100 bg-amber-50/50 p-1 sm:w-auto"
    >
      {items.map((it) => {
        const active = view === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            aria-pressed={active}
            className={[
              "flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 sm:flex-none",
              active
                ? "bg-white text-amber-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
