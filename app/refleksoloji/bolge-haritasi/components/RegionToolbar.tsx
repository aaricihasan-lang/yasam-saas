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
  "inline-flex h-11 shrink-0 items-center justify-center rounded-xl border px-5 text-sm font-bold shadow-sm transition-all duration-200";

function activeBtn(extra = "") {
  return `ring-2 ring-purple-300 bg-purple-100 text-purple-950 border-purple-200 ${extra}`;
}

function idleBtn(extra = "") {
  return `border-violet-200/80 bg-white/95 text-slate-800 hover:border-violet-300 hover:bg-violet-50/90 ${extra}`;
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
    <div
      className="shrink-0 border-t border-purple-100 bg-white/85 p-3 shadow-[0_-8px_32px_-12px_rgba(91,33,182,0.12)] backdrop-blur-md"
      role="toolbar"
      aria-label="Bölge haritası araçları"
    >
      <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap pb-0.5 [-ms-overflow-style:none] [scrollbar-width:thin]">
        <button
          type="button"
          onClick={() => setToolMode("add")}
          aria-pressed={isAdd}
          className={`${btnBase} ${isAdd ? activeBtn() : idleBtn("border-emerald-200/90 text-emerald-900 hover:bg-emerald-50")}`}
        >
          Bölge Ekle
        </button>

        <div
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-violet-200/80 bg-violet-50/50 p-1"
          role="group"
          aria-label="Çizim tipi"
        >
          <button
            type="button"
            onClick={() => setDrawShape("oval")}
            aria-pressed={drawShape === "oval"}
            className={`${btnBase} h-10 px-4 ${drawShape === "oval" ? activeBtn() : idleBtn("border-transparent bg-transparent shadow-none")}`}
          >
            Oval
          </button>
          <button
            type="button"
            onClick={() => setDrawShape("rect")}
            aria-pressed={drawShape === "rect"}
            className={`${btnBase} h-10 px-4 ${drawShape === "rect" ? activeBtn() : idleBtn("border-transparent bg-transparent shadow-none")}`}
          >
            Kare
          </button>
          <button
            type="button"
            onClick={() => setDrawShape("free_draw")}
            aria-pressed={drawShape === "free_draw"}
            className={`${btnBase} h-10 px-4 ${drawShape === "free_draw" ? activeBtn() : idleBtn("border-transparent bg-transparent shadow-none")}`}
          >
            Manuel Çizim
          </button>
          <button
            type="button"
            onClick={() => setDrawShape("thick_line")}
            aria-pressed={drawShape === "thick_line"}
            className={`${btnBase} h-10 px-4 ${drawShape === "thick_line" ? activeBtn() : idleBtn("border-transparent bg-transparent shadow-none")}`}
          >
            Kalın Çizgi
          </button>
        </div>

        <button
          type="button"
          onClick={() => setToolMode("move")}
          aria-pressed={isMove}
          className={`${btnBase} ${isMove ? activeBtn() : idleBtn("border-sky-200/90 text-sky-900 hover:bg-sky-50")}`}
        >
          Taşı / Düzenle
        </button>

        <button
          type="button"
          onClick={onSave}
          className={`${btnBase} ${idleBtn("border-violet-300/90 bg-violet-100 text-violet-950 hover:bg-violet-200/90")}`}
        >
          Kaydet
        </button>

        <button
          type="button"
          onClick={onClear}
          className={`${btnBase} ${idleBtn("border-rose-200/90 text-rose-900 hover:bg-rose-50")}`}
        >
          Temizle
        </button>

        <span className="mx-1 hidden h-8 w-px shrink-0 bg-purple-200/80 sm:inline" aria-hidden />

        <button
          type="button"
          onClick={() => setSelectedFoot("left")}
          aria-pressed={selectedFoot === "left"}
          className={`${btnBase} ${selectedFoot === "left" ? activeBtn() : idleBtn()}`}
        >
          Sol Ayak
        </button>

        <button
          type="button"
          onClick={() => setSelectedFoot("right")}
          aria-pressed={selectedFoot === "right"}
          className={`${btnBase} ${selectedFoot === "right" ? activeBtn() : idleBtn()}`}
        >
          Sağ Ayak
        </button>

        <span className="mx-1 hidden h-8 w-px shrink-0 bg-purple-200/80 sm:inline" aria-hidden />

        <button
          type="button"
          onClick={() => setSelectedView("taban")}
          aria-pressed={selectedView === "taban"}
          className={`${btnBase} ${selectedView === "taban" ? activeBtn() : idleBtn()}`}
        >
          Taban Görünümü
        </button>

        <button
          type="button"
          onClick={() => setSelectedView("yan")}
          aria-pressed={selectedView === "yan"}
          className={`${btnBase} ${selectedView === "yan" ? activeBtn() : idleBtn()}`}
        >
          Yan Görünümü
        </button>
      </div>
    </div>
  );
}
