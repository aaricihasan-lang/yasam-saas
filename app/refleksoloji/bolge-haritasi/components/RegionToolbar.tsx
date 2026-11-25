import { Brush, Circle, CircleDot, Eraser, Footprints, Hand, Move, Pencil, Save, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import premium from "@/app/_premium/refleksoloji/bolgeHaritasi.module.css";
import { POINT_SIZES } from "../types";
import type { FootView, PointSize, RegionDrawShape, RegionToolMode } from "../types";

type RegionToolbarProps = {
  selectedView: FootView;
  setSelectedView: (view: FootView) => void;
  toolMode: RegionToolMode;
  setToolMode: (mode: RegionToolMode) => void;
  drawShape: RegionDrawShape;
  setDrawShape: (shape: RegionDrawShape) => void;
  /** Nokta boyutu: seçili nokta varsa onun boyutu, yoksa yeni noktaların boyutu. */
  pointSize: PointSize;
  onPointSizeChange: (size: PointSize) => void;
  /** Boyut seçici yalnız Nokta aracı ya da seçili bir nokta varken görünür. */
  showPointSize: boolean;
  onSave: () => void;
  onClear: () => void;
  /**
   * ÜRÜN KURALI: false ise (telefon/dar ekran) düzenleme kümesi (çizim/taşı/kaydet/
   * temizle) gizlenir. Sol/Sağ Ayak + Taban/Yan görünüm toggle'ları KORUNUR
   * (bunlar VIEW kontrolüdür, düzenleme değil).
   */
  editingAllowed: boolean;
};

// REF-014: mobilde ~44px dokunma hedefi (min-h-11), sm+ ekranda kompakt (h-7).
// 2026-10-20 premium (owner GÖRSEL PASS + tek satır düzeltmesi): kompakt düğme; masaüstünde 16 araç tek satır.
// Telefonda dokunmatik hedef 44px korunur (düzenleme kümesi zaten gizli).
const btnBase =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-[9px] border px-2.5 text-xs font-bold shadow-sm transition-colors duration-200 md:min-h-0 md:h-8 md:px-[7px] md:text-[11.5px]";

const activeRing = "ring-[1.5px] ring-violet-500/45";

/** Araç simgesi (yalnız görsel; araç kimliğine göre sabit — kayda göre değil). */
const ico = "h-3.5 w-3.5 shrink-0";

function btnClass(idle: string, active: boolean) {
  return `${btnBase} ${idle} ${active ? activeRing : ""}`;
}

/** Seçicideki önizleme nokta çapı (px) — gerçek çapların küçültülmüş sırası. */
const POINT_SIZE_SWATCH_PX: Record<PointSize, number> = { xs: 3, sm: 6, md: 9, lg: 13 };

export function RegionToolbar({
  selectedView,
  setSelectedView,
  toolMode,
  setToolMode,
  drawShape,
  setDrawShape,
  pointSize,
  onPointSizeChange,
  showPointSize,
  onSave,
  onClear,
  editingAllowed,
}: RegionToolbarProps) {
  const t = useTranslations("reflexology.zoneMap.toolbar");
  const tc = useTranslations("reflexology.common");
  const isAdd = toolMode === "add";
  const isMove = toolMode === "move";

  return (
    <div className="flex w-full shrink-0 justify-center pb-2">
      <div className={premium.toolbar} role="toolbar" aria-label={t("aria")}>
        <div className={premium.toolRow}>
        {/* DÜZENLEME KÜMESİ — yalnız geniş ekranda (telefon/dar ekranda gizli). */}
        {editingAllowed ? (
          <>
        <div className={premium.group}>
        {/* W10: "Bölge Ekle" kaldırıldı — araç seçimi çizimi doğrudan başlatır (RegionMapLayout.selectDrawShape).
            Organ seçimi sonrası hiçbir araç basılı değildir (çizim korumalı). */}
        <button
          type="button"
          onClick={() => setDrawShape("oval")}
          aria-pressed={isAdd && drawShape === "oval"}
          className={btnClass("border-violet-200 bg-violet-50 text-violet-700", isAdd && drawShape === "oval")}
        >
          <Circle className={ico} aria-hidden />
          {t("oval")}
        </button>

        <button
          type="button"
          onClick={() => setDrawShape("rect")}
          aria-pressed={isAdd && drawShape === "rect"}
          className={btnClass("border-blue-200 bg-blue-50 text-blue-700", isAdd && drawShape === "rect")}
        >
          <Square className={ico} aria-hidden />
          {t("rect")}
        </button>

        <button
          type="button"
          onClick={() => setDrawShape("free_draw")}
          aria-pressed={isAdd && drawShape === "free_draw"}
          className={btnClass(
            "border-pink-200 bg-pink-50 text-pink-700",
            isAdd && drawShape === "free_draw",
          )}
        >
          <Pencil className={ico} aria-hidden />
          {t("freeDraw")}
        </button>

        <button
          type="button"
          onClick={() => setDrawShape("thick_line")}
          aria-pressed={isAdd && drawShape === "thick_line"}
          className={btnClass(
            "border-orange-200 bg-orange-50 text-orange-700",
            isAdd && drawShape === "thick_line",
          )}
        >
          <Brush className={ico} aria-hidden />
          {t("thickLine")}
        </button>

        <button
          type="button"
          onClick={() => setDrawShape("point")}
          aria-pressed={isAdd && drawShape === "point"}
          className={btnClass("border-rose-200 bg-rose-50 text-rose-700", isAdd && drawShape === "point")}
        >
          <CircleDot className={ico} aria-hidden />
          {t("point")}
        </button>

        {showPointSize ? (
          <div
            role="radiogroup"
            aria-label={t("pointSizeAria")}
            className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-lg border border-rose-200 bg-rose-50/70 px-0.5 shadow-sm sm:min-h-0 sm:h-7"
          >
            {POINT_SIZES.map((size) => {
              const active = size === pointSize;
              const swatch = POINT_SIZE_SWATCH_PX[size];
              return (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={tc(`pointSizes.${size}`)}
                  title={tc(`pointSizes.${size}`)}
                  onClick={() => onPointSizeChange(size)}
                  className={`flex h-10 w-9 items-center justify-center rounded-md transition-colors duration-200 sm:h-6 sm:w-6 ${
                    active ? "bg-white shadow-sm ring-1 ring-rose-300" : "hover:bg-white/70"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`block rounded-full ${active ? "bg-rose-600" : "bg-rose-400"}`}
                    style={{ width: swatch, height: swatch }}
                  />
                </button>
              );
            })}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setToolMode("move")}
          aria-pressed={isMove}
          className={btnClass("border-cyan-200 bg-cyan-50 text-cyan-700", isMove)}
        >
          <Move className={ico} aria-hidden />
          {t("move")}
        </button>

        <button
          type="button"
          onClick={onSave}
          className={btnClass("border-transparent bg-[#22a35a] text-white hover:bg-[#1c8f4e]", false)}
        >
          <Save className={ico} aria-hidden />
          {t("save")}
        </button>

        <button
          type="button"
          onClick={onClear}
          className={btnClass("border-red-200 bg-red-50 text-red-700", false)}
        >
          <Eraser className={ico} aria-hidden />
          {t("clear")}
        </button>
        </div>

        <span className={premium.div} aria-hidden />
          </>
        ) : null}

        <div className={premium.group}>

        {/* 2026-10-24: ayrı "Sol/Sağ Ayak (El)" düğmeleri kaldırıldı — görsellerde iki taraf birlikte durur;
            taraf çizimin görseldeki yarısından belirlenir (utils/footSideFromPosition.ts). */}
        {/* EKOLE BAĞIMSIZ: 3 bağımsız görünüm — uzman MANUEL seçer. Organ adı
            görünümü belirlemez. Organ seçili olmasa da seçilebilir. */}
        {([
          { view: "taban", tone: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700" },
          { view: "yan_ic", tone: "border-purple-200 bg-purple-50 text-purple-700" },
          { view: "yan_dis", tone: "border-violet-200 bg-violet-50 text-violet-700" },
        ] as const).map(({ view, tone }) => (
          <button
            key={view}
            type="button"
            onClick={() => setSelectedView(view)}
            aria-pressed={selectedView === view}
            className={btnClass(tone, selectedView === view)}
          >
            <Footprints className={ico} aria-hidden />
            {tc(`views.${view}.short`)}
          </button>
        ))}

        {/* El yüzeyleri — iki el aynı görselde (sol yarı sol el, sağ yarı sağ el). */}
        {([
          { view: "el_avuc", tone: "border-teal-200 bg-teal-50 text-teal-700" },
          { view: "el_sirt", tone: "border-amber-200 bg-amber-50 text-amber-700" },
        ] as const).map(({ view, tone }) => (
          <button
            key={view}
            type="button"
            onClick={() => setSelectedView(view)}
            aria-pressed={selectedView === view}
            className={btnClass(tone, selectedView === view)}
          >
            <Hand className={ico} aria-hidden />
            {tc(`views.${view}.short`)}
          </button>
        ))}
        </div>
        </div>
      </div>
    </div>
  );
}
