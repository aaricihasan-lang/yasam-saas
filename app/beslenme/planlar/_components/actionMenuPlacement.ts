/**
 * Beslenme plan editörü ⋮ aksiyon menüsü — VIEWPORT-AWARE yerleşim hesabı (SAF; DOM/React YOK).
 *
 * NEDEN: Menü tetiğin ekran içi konumuna göre aşağı/yukarı açılmalı ve hiçbir kenardan taşmamalı.
 *   Gerçek masaüstü hatasında (Hasan Hoca) alt satırdaki besinin menüsü ekranın altına kayıyordu.
 *   Bu modül yalnız SAYISAL yerleşimi üretir; birim-test edilebilir (ActionMenu bunu kullanır).
 *
 * SÖZLEŞME:
 *   - Aşağı açıksa üstten `top` çıpalı; aşağıda menünün alt kenarı ≤ viewport-alt − MARGIN.
 *   - Yukarı açıksa alttan `bottom` çıpalı (menü yüksekliği ÖLÇÜLMEDEN flip); üst kenarı ≥ MARGIN.
 *   - `maxHeight` seçilen taraftaki boşluğa sınırlanır (≥0); menü kendi içinde kayar (scroll).
 *   - `left` tetiğin sağ kenarına hizalanır, sonra [MARGIN, viewport-genişlik − MARGIN − WIDTH]'e kelepçelenir.
 */

export const ACTION_MENU_WIDTH = 192; // w-48 (px)
export const ACTION_MENU_MARGIN = 8; // viewport kenar boşluğu (px)
export const ACTION_MENU_GAP = 4; // tetik ile menü arası boşluk (px)
export const ACTION_MENU_ROW_EST = 38; // yön kararı için satır yüksekliği tahmini (ölçüm gerektirmez)

export type ActionMenuRect = { top: number; bottom: number; right: number };
export type ActionMenuViewport = { width: number; height: number };
export type ActionMenuPlacement =
  | { placement: "down"; left: number; top: number; maxHeight: number }
  | { placement: "up"; left: number; bottom: number; maxHeight: number };

/**
 * Tetik dikdörtgeni + viewport + öğe sayısından menü yerleşimini üretir.
 *   - Varsayılan aşağı; yalnız altta yer yetmez VE üstte daha çok yer varsa yukarı flip.
 *   - Yükseklik hiç ölçülmez: aşağı=top çıpa, yukarı=bottom çıpa → her iki durumda da
 *     menü viewport'a sığar; taşarsa maxHeight ile içeride kayar.
 */
export function computeActionMenuPlacement(
  btn: ActionMenuRect,
  vp: ActionMenuViewport,
  itemCount: number,
): ActionMenuPlacement {
  const spaceBelow = vp.height - btn.bottom - ACTION_MENU_MARGIN;
  const spaceAbove = btn.top - ACTION_MENU_MARGIN;
  const estHeight = itemCount * ACTION_MENU_ROW_EST + 8;
  const openDown = spaceBelow >= estHeight || spaceBelow >= spaceAbove;

  // Yatay: tetiğin sağ kenarına hizala, sonra viewport'a kelepçele (asla taşma).
  let left = btn.right - ACTION_MENU_WIDTH;
  left = Math.min(left, vp.width - ACTION_MENU_MARGIN - ACTION_MENU_WIDTH);
  left = Math.max(ACTION_MENU_MARGIN, left);

  if (openDown) {
    return {
      placement: "down",
      left,
      top: btn.bottom + ACTION_MENU_GAP,
      maxHeight: Math.max(0, spaceBelow - ACTION_MENU_GAP),
    };
  }
  return {
    placement: "up",
    left,
    bottom: vp.height - btn.top + ACTION_MENU_GAP,
    maxHeight: Math.max(0, spaceAbove - ACTION_MENU_GAP),
  };
}
