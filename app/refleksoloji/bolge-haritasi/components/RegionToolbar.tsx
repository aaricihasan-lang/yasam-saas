import type { FootSide, FootView, RegionToolMode } from "../types";

type RegionToolbarProps = {
  selectedFoot: FootSide;
  setSelectedFoot: (foot: FootSide) => void;
  selectedView: FootView;
  setSelectedView: (view: FootView) => void;
  toolMode: RegionToolMode;
  setToolMode: (mode: RegionToolMode) => void;
};

const btnBase =
  "rounded-lg border px-3.5 py-2 text-sm font-bold transition-all duration-200 sm:px-4";

function activeStyle(tone: string) {
  return `${tone} scale-[1.02] shadow-[0_6px_18px_-6px_rgba(91,33,182,0.35)] ring-1`;
}

function idleStyle(tone: string) {
  return `${tone} hover:brightness-[0.98]`;
}

export function RegionToolbar({
  selectedFoot,
  setSelectedFoot,
  selectedView,
  setSelectedView,
  toolMode,
  setToolMode,
}: RegionToolbarProps) {
  const isAdd = toolMode === "add";
  const isMove = toolMode === "move";

  return (
    <div
      className="shrink-0 rounded-xl border border-white/90 bg-white/85 px-2 py-1.5 shadow-[0_12px_36px_-16px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md sm:px-2.5"
      role="toolbar"
      aria-label="Bölge haritası araçları"
    >
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => setToolMode("add")}
          aria-pressed={isAdd}
          className={`${btnBase} ${
            isAdd
              ? activeStyle(
                  "border-emerald-400/90 bg-gradient-to-br from-emerald-300 to-teal-200 text-emerald-950 ring-emerald-400/50",
                )
              : idleStyle(
                  "border-emerald-200/80 bg-emerald-50/95 text-emerald-900 hover:border-emerald-300/80 hover:bg-emerald-100/90",
                )
          }`}
        >
          Bölge Ekle
        </button>
        <button
          type="button"
          onClick={() => setToolMode("move")}
          aria-pressed={isMove}
          className={`${btnBase} ${
            isMove
              ? activeStyle(
                  "border-sky-400/90 bg-gradient-to-br from-sky-300 to-cyan-200 text-sky-950 ring-sky-400/50",
                )
              : idleStyle(
                  "border-sky-200/80 bg-sky-50/95 text-sky-900 hover:border-sky-300/80 hover:bg-sky-100/90",
                )
          }`}
        >
          Taşı / Düzenle
        </button>
        <button
          type="button"
          disabled
          className={`${btnBase} cursor-default border-violet-200/80 bg-violet-50/95 text-violet-900`}
          title="Yakında aktif olacak"
        >
          Kaydet
        </button>
        <button
          type="button"
          disabled
          className={`${btnBase} cursor-default border-rose-200/80 bg-rose-50/95 text-rose-900`}
          title="Yakında aktif olacak"
        >
          Temizle
        </button>

        <span className="mx-0.5 hidden h-5 w-px bg-violet-200/80 sm:inline" aria-hidden />

        <button
          type="button"
          onClick={() => setSelectedFoot("left")}
          aria-pressed={selectedFoot === "left"}
          className={`${btnBase} ${
            selectedFoot === "left"
              ? activeStyle(
                  "border-indigo-400/90 bg-gradient-to-br from-indigo-300 to-violet-200 text-indigo-950 ring-indigo-400/50",
                )
              : idleStyle(
                  "border-indigo-200/80 bg-indigo-50/95 text-indigo-900 hover:border-indigo-300/80 hover:bg-indigo-100/90",
                )
          }`}
        >
          Sol Ayak
        </button>
        <button
          type="button"
          onClick={() => setSelectedFoot("right")}
          aria-pressed={selectedFoot === "right"}
          className={`${btnBase} ${
            selectedFoot === "right"
              ? activeStyle(
                  "border-indigo-400/90 bg-gradient-to-br from-indigo-300 to-violet-200 text-indigo-950 ring-indigo-400/50",
                )
              : idleStyle(
                  "border-indigo-200/80 bg-indigo-50/95 text-indigo-900 hover:border-indigo-300/80 hover:bg-indigo-100/90",
                )
          }`}
        >
          Sağ Ayak
        </button>

        <span className="mx-0.5 hidden h-5 w-px bg-violet-200/80 sm:inline" aria-hidden />

        <button
          type="button"
          onClick={() => setSelectedView("taban")}
          aria-pressed={selectedView === "taban"}
          className={`${btnBase} ${
            selectedView === "taban"
              ? activeStyle(
                  "border-fuchsia-400/90 bg-gradient-to-br from-fuchsia-300 to-pink-200 text-fuchsia-950 ring-fuchsia-400/50",
                )
              : idleStyle(
                  "border-fuchsia-200/80 bg-fuchsia-50/95 text-fuchsia-900 hover:border-fuchsia-300/80 hover:bg-fuchsia-100/90",
                )
          }`}
        >
          Taban Görünüm
        </button>
        <button
          type="button"
          onClick={() => setSelectedView("yan")}
          aria-pressed={selectedView === "yan"}
          className={`${btnBase} ${
            selectedView === "yan"
              ? activeStyle(
                  "border-fuchsia-400/90 bg-gradient-to-br from-fuchsia-300 to-pink-200 text-fuchsia-950 ring-fuchsia-400/50",
                )
              : idleStyle(
                  "border-fuchsia-200/80 bg-fuchsia-50/95 text-fuchsia-900 hover:border-fuchsia-300/80 hover:bg-fuchsia-100/90",
                )
          }`}
        >
          Yan Görünüm
        </button>
      </div>
    </div>
  );
}
