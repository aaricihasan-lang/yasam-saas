import type { FootView } from "../types";

export function isHandView(view: FootView): boolean {
  return view === "el_avuc" || view === "el_sirt";
}

const LABEL_H = 20;

type ImageRect = { left: number; top: number; width: number; height: number };

/** Görselin altında etiket için yer var mı (object-contain boşluğu). */
function hasRoomBelow(rect: ImageRect, containerHeight: number): boolean {
  return rect.width > 0 && containerHeight - (rect.top + rect.height) >= LABEL_H;
}

function Labels({ rect }: { rect: ImageRect }) {
  const tone = "absolute top-0.5 -translate-x-1/2 text-[11px] tracking-wide";
  return (
    <>
      <span className={`${tone} font-bold text-slate-500`} style={{ left: rect.left + rect.width * 0.25 }}>
        Sol
      </span>
      <span className={`${tone} font-semibold text-slate-300`} style={{ left: rect.left + rect.width * 0.5 }} aria-hidden>
        |
      </span>
      <span className={`${tone} font-bold text-slate-500`} style={{ left: rect.left + rect.width * 0.75 }}>
        Sağ
      </span>
    </>
  );
}

/**
 * El görsellerinin ALTINDA (görselin dışında) sade "Sol | Sağ" yön etiketi.
 * El fotoğraflarında görselin solu = sol el, sağı = sağ el (anatomik); görselin içine
 * yazılmaz. Konum object-contain görsel dikdörtgenine hizalanır:
 *   - `placement="inside"`: görselin hemen altında boşluk varsa kapsayıcı İÇİNDE
 *     (absolute) görsel kenarına yapışık çizilir.
 *   - `placement="strip"`: boşluk yoksa kapsayıcının ALTINDA ince şerit olarak çizilir.
 * İkisi birlikte render edilir; her durumda yalnız biri görünür.
 */
export function HandSideLabels({
  rect,
  containerHeight,
  placement,
}: {
  rect: ImageRect;
  containerHeight: number;
  placement: "inside" | "strip";
}) {
  const room = hasRoomBelow(rect, containerHeight);
  if (placement === "inside") {
    if (!room) return null;
    return (
      <div
        className="pointer-events-none absolute inset-x-0 z-10 select-none"
        style={{ top: rect.top + rect.height, height: LABEL_H }}
        aria-label="Sol el solda, sağ el sağda"
      >
        <Labels rect={rect} />
      </div>
    );
  }
  if (room) return null;
  return (
    <div className="relative shrink-0 select-none" style={{ height: LABEL_H }} aria-label="Sol el solda, sağ el sağda">
      {rect.width > 0 ? <Labels rect={rect} /> : null}
    </div>
  );
}
