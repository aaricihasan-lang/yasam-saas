import type { FootSide, FootView, RegionDrawShape, RegionToolMode } from "../types";

type RegionToolbarProps = {
  selectedFoot: FootSide;
  setSelectedFoot: (foot: FootSide) => void;
  selectedView: FootView;
  setSelectedView: (view: FootView) => void;
  toolMode: RegionToolMode;
  setToolMode: (mode: RegionToolMode) => void;
  drawShape: RegionDrawShape;
  setDrawShape: (shape: RegionDrawShape) => void;
  onSave: () => void;
  onClear: () => void;
};

const btnBase =
  "inline-flex h-12 min-w-[110px] shrink-0 items-center justify-center rounded-2xl border px-6 text-sm font-bold shadow-md transition-all duration-200 hover:scale-[1.03]";

const activeRing = "ring-2 ring-purple-300 scale-[1.03]";

function btnClass(idle: string, active: boolean) {
  return `${btnBase} ${idle} ${active ? activeRing : ""}`;
}

export function RegionToolbar({
  selectedFoot,
  setSelectedFoot,
  selectedView,
  setSelectedView,
  toolMode,
  setToolMode,
  drawShape,
  setDrawShape,
  onSave,
  onClear,
}: RegionToolbarProps) {
  const isAdd = toolMode === "add";
  const isMove = toolMode === "move";

  return (
    <div className="flex w-full shrink-0 justify-center px-8 pb-3">
      <div
        className="mx-auto w-fit max-w-[calc(100vw-120px)] rounded-[28px] border border-purple-100/90 bg-white/80 px-5 py-4 backdrop-blur-md"
        role="toolbar"
        aria-label="Bölge haritası araçları"
      >
        <div className="flex flex-nowrap items-center justify-center gap-3 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:thin]">
        <button
          type="button"
          onClick={() => setToolMode("add")}
          aria-pressed={isAdd}
          className={btnClass("border-emerald-200 bg-emerald-50 text-emerald-700", isAdd)}
        >
          Bölge Ekle
        </button>

        <button
          type="button"
          onClick={() => setDrawShape("oval")}
          aria-pressed={drawShape === "oval"}
          className={btnClass("border-violet-200 bg-violet-50 text-violet-700", drawShape === "oval")}
        >
          Oval
        </button>

        <button
          type="button"
          onClick={() => setDrawShape("rect")}
          aria-pressed={drawShape === "rect"}
          className={btnClass("border-blue-200 bg-blue-50 text-blue-700", drawShape === "rect")}
        >
          Kare
        </button>

        <button
          type="button"
          onClick={() => setDrawShape("free_draw")}
          aria-pressed={drawShape === "free_draw"}
          className={btnClass(
            "border-pink-200 bg-pink-50 text-pink-700",
            drawShape === "free_draw",
          )}
        >
          Manuel Çizim
        </button>

        <button
          type="button"
          onClick={() => setDrawShape("thick_line")}
          aria-pressed={drawShape === "thick_line"}
          className={btnClass(
            "border-orange-200 bg-orange-50 text-orange-700",
            drawShape === "thick_line",
          )}
        >
          Kalın Çizgi
        </button>

        <button
          type="button"
          onClick={() => setToolMode("move")}
          aria-pressed={isMove}
          className={btnClass("border-cyan-200 bg-cyan-50 text-cyan-700", isMove)}
        >
          Taşı / Düzenle
        </button>

        <button
          type="button"
          onClick={onSave}
          className={btnClass("border-green-300 bg-green-100 text-green-800", false)}
        >
          Kaydet
        </button>

        <button
          type="button"
          onClick={onClear}
          className={btnClass("border-red-200 bg-red-50 text-red-700", false)}
        >
          Temizle
        </button>

        <span className="mx-1 hidden h-10 w-px shrink-0 bg-purple-200/80 sm:inline" aria-hidden />

        <button
          type="button"
          onClick={() => setSelectedFoot("left")}
          aria-pressed={selectedFoot === "left"}
          className={btnClass(
            "border-indigo-200 bg-indigo-50 text-indigo-700",
            selectedFoot === "left",
          )}
        >
          Sol Ayak
        </button>

        <button
          type="button"
          onClick={() => setSelectedFoot("right")}
          aria-pressed={selectedFoot === "right"}
          className={btnClass(
            "border-sky-200 bg-sky-50 text-sky-700",
            selectedFoot === "right",
          )}
        >
          Sağ Ayak
        </button>

        <span className="mx-1 hidden h-10 w-px shrink-0 bg-purple-200/80 sm:inline" aria-hidden />

        <button
          type="button"
          onClick={() => setSelectedView("taban")}
          aria-pressed={selectedView === "taban"}
          className={btnClass(
            "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
            selectedView === "taban",
          )}
        >
          Taban Görünümü
        </button>

        <button
          type="button"
          onClick={() => setSelectedView("yan")}
          aria-pressed={selectedView === "yan"}
          className={btnClass(
            "border-purple-200 bg-purple-50 text-purple-700",
            selectedView === "yan",
          )}
        >
          Yan Görünümü
        </button>
        </div>
      </div>
    </div>
  );
}
