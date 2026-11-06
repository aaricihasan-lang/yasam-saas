import type { CSSProperties } from "react";

/**
 * V4-003 (2026-11-06 owner): dar bilgi panelinde "Ev başlangıçları (cusp)" ızgarası üst üste biniyordu — sütun sayısı EKRAN
 * genişliğine (sm:) bağlıydı; panel daralınca 3 sütun ~250 px'e sıkışıyor, "N. ev" + burç + derece komşu hücreye taşıyordu.
 *
 * Bu ızgara sütun sayısını KABIN GERÇEK GENİŞLİĞİNE göre belirler (medya sorgusu yok): üç hücre sığıyorsa 3, sığmıyorsa 2,
 * o da sığmıyorsa 1 sütun (en fazla 3). Hücre hiçbir zaman kabından geniş olmaz; en dar durumda hücre içi alt satıra sarılır
 * (ev numarası + burç + derece aynı hücrede kalır, komşuya taşmaz). Sıra ve değerler değişmez.
 */
export const FIT_GRID_MIN = "9.5rem"; // en uzun gerçek hücre ~141 px (ör. "12. ev ♋︎ Yengeç 29°59′"); aşarsa hücre içi sarılır
export const fitGridStyle = (min: string = FIT_GRID_MIN, gap = "1rem", max = 3): CSSProperties => ({
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, max(${min}, calc((100% - ${max - 1} * ${gap}) / ${max}))), 1fr))`,
  columnGap: gap,
});
/** Izgara hücresi: ad solda, değer sağda; yer kalmazsa değer alt satıra iner (kesilmez, binmez). */
export const fitGridCell = "flex min-w-0 flex-wrap items-center justify-between gap-x-2 border-b border-slate-50 py-1";
