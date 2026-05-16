import type { FootSide, FootView, RegionToolMode } from "../types";

type RegionToolbarProps = {
  selectedFoot: FootSide;
  setSelectedFoot: (foot: FootSide) => void;
  selectedView: FootView;
  setSelectedView: (view: FootView) => void;
  toolMode: RegionToolMode;
  setToolMode: (mode: RegionToolMode) => void;
};

function toggleButtonClass(active: boolean, variant: "foot" | "view") {
  if (variant === "foot") {
    return `rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-all duration-200 sm:px-3.5 sm:text-xs ${
      active
        ? "scale-[1.03] border-indigo-400/90 bg-gradient-to-br from-indigo-200/85 to-violet-200/70 text-indigo-950 shadow-[0_6px_20px_-8px_rgba(79,70,229,0.45)] ring-1 ring-indigo-300/70"
        : "border-indigo-200/50 bg-indigo-50/35 text-indigo-800/45 opacity-70 hover:border-indigo-200/70 hover:bg-indigo-50/55 hover:opacity-90"
    }`;
  }

  return `rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-all duration-200 sm:px-3.5 sm:text-xs ${
    active
      ? "scale-[1.03] border-fuchsia-400/90 bg-gradient-to-br from-fuchsia-200/80 to-violet-200/65 text-fuchsia-950 shadow-[0_6px_20px_-8px_rgba(192,38,211,0.35)] ring-1 ring-fuchsia-300/65"
      : "border-fuchsia-200/50 bg-fuchsia-50/30 text-fuchsia-900/40 opacity-70 hover:border-fuchsia-200/70 hover:bg-fuchsia-50/50 hover:opacity-90"
  }`;
}

function toolButtonClass(active: boolean) {
  return `rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-all duration-200 sm:px-3.5 sm:text-xs ${
    active
      ? "scale-[1.03] border-violet-400/90 bg-gradient-to-br from-violet-200/85 to-fuchsia-200/70 text-violet-950 shadow-[0_6px_20px_-8px_rgba(109,40,217,0.4)] ring-1 ring-violet-300/70"
      : "border-violet-200/60 bg-violet-50/40 text-violet-900/55 opacity-75 hover:border-violet-200/80 hover:bg-violet-50/60 hover:opacity-95"
  }`;
}

export function RegionToolbar({
  selectedFoot,
  setSelectedFoot,
  selectedView,
  setSelectedView,
  toolMode,
  setToolMode,
}: RegionToolbarProps) {
  return (
    <div
      className="rounded-[18px] border border-white/90 bg-white/85 px-2.5 py-2 shadow-[0_12px_36px_-16px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md sm:px-3"
      role="toolbar"
      aria-label="Bölge haritası araçları"
    >
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => setToolMode("add")}
          aria-pressed={toolMode === "add"}
          className={toolButtonClass(toolMode === "add")}
        >
          Bölge Ekle
        </button>
        <button
          type="button"
          onClick={() => setToolMode("move")}
          aria-pressed={toolMode === "move"}
          className={toolButtonClass(toolMode === "move")}
        >
          Taşı / Düzenle
        </button>
        <button
          type="button"
          disabled
          className="cursor-default rounded-lg border border-violet-200/80 bg-violet-50/55 px-3 py-1.5 text-[11px] font-bold text-violet-900/90 opacity-90 transition sm:px-3.5 sm:text-xs"
          title="Yakında aktif olacak"
        >
          Kaydet
        </button>
        <button
          type="button"
          disabled
          className="cursor-default rounded-lg border border-violet-200/80 bg-violet-50/55 px-3 py-1.5 text-[11px] font-bold text-violet-900/90 opacity-90 transition sm:px-3.5 sm:text-xs"
          title="Yakında aktif olacak"
        >
          Temizle
        </button>

        <span className="mx-0.5 hidden h-5 w-px bg-violet-200/80 sm:inline" aria-hidden />

        <button
          type="button"
          onClick={() => setSelectedFoot("left")}
          aria-pressed={selectedFoot === "left"}
          className={toggleButtonClass(selectedFoot === "left", "foot")}
        >
          Sol Ayak
        </button>
        <button
          type="button"
          onClick={() => setSelectedFoot("right")}
          aria-pressed={selectedFoot === "right"}
          className={toggleButtonClass(selectedFoot === "right", "foot")}
        >
          Sağ Ayak
        </button>

        <span className="mx-0.5 hidden h-5 w-px bg-violet-200/80 sm:inline" aria-hidden />

        <button
          type="button"
          onClick={() => setSelectedView("taban")}
          aria-pressed={selectedView === "taban"}
          className={toggleButtonClass(selectedView === "taban", "view")}
        >
          Taban Görünüm
        </button>
        <button
          type="button"
          onClick={() => setSelectedView("yan")}
          aria-pressed={selectedView === "yan"}
          className={toggleButtonClass(selectedView === "yan", "view")}
        >
          Yan Görünüm
        </button>
      </div>
    </div>
  );
}
