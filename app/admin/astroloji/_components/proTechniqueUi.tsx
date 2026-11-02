"use client";

/**
 * Klasik Asalet (#644) ve Transit Taraması (#646) sonuç panelleri — ortak tablo. Masaüstünde tablo; <768'de kart listesi:
 * 0. sütun kart başlığı, kısa alanlar iki sütunda (tek kalan tam genişlik), `full` sütunları tam genişlikte en altta, `long`
 * sütunlarında değer anahtarın altında sola dayalı (etiket listeleri, uzun metin). Yalnız sunum.
 */
import type { ReactNode } from "react";
import s from "./proTechnique.module.css";

export { s as pt };

export function ProTable({ head, rows, wrap = [], full = wrap, long = wrap, testId }: { head: string[]; rows: { key: string; cells: ReactNode[] }[]; wrap?: number[]; full?: number[]; long?: number[]; testId?: string }) {
  return (
    <>
      <div className={`${s.tableWrap} ${s.mHide}`}>
        <table className={s.table} data-testid={testId}>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                {r.cells.map((c, i) => (
                  <td key={i} className={wrap.includes(i) ? s.wrap : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.cardsM}>
        {rows.map((r) => {
          const idx = r.cells.map((_, i) => i).slice(1);
          const half = idx.filter((i) => !full.includes(i));
          const cell = (i: number, cls: string) => (
            <div key={i} className={`${s.mrow} ${cls}`}>
              <span className={s.mk}>{head[i]}</span>
              <span>{r.cells[i]}</span>
            </div>
          );
          return (
            <div key={r.key} className={s.mcard}>
              {cell(0, s.mtitle)}
              {half.map((i, k) => cell(i, half.length % 2 && k === half.length - 1 ? s.mfull : ""))}
              {idx.filter((i) => full.includes(i)).map((i) => cell(i, long.includes(i) ? `${s.mfull} ${s.mlong}` : s.mfull))}
            </div>
          );
        })}
      </div>
    </>
  );
}
