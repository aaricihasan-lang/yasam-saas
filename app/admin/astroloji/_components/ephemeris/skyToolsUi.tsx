"use client";

/**
 * Gökyüzü Araçları — ortak sunum parçaları (tablo + mobil kart, katlanır ayar paneli, zaman biçimleri). Yalnız sunum; veri yok.
 * Zamanlar tarayıcının saat diliminde gösterilir (Türkiye'de "TSİ"); UT ayrıca verilir. Belirsizlik 1 saati aşarsa saat
 * gösterilmez, yalnız tarih (≈) verilir (yanıltıcı kesinlik olmasın).
 */
import { useMemo, type ReactNode } from "react";
import s from "./skyTools.module.css";

export { s as st };

export function useTimeZone(): { tz: string; label: string } {
  return useMemo(() => {
    let tz = "UTC";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      /* UTC */
    }
    return { tz, label: tz === "Europe/Istanbul" ? "TSİ" : tz };
  }, []);
}

export function fmtLocal(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  }
}
export const fmtLocalDate = (ms: number, tz: string) => fmtLocal(ms, tz).slice(0, 10);
export const fmtLocalClock = (ms: number, tz: string) => fmtLocal(ms, tz).slice(11);
export const fmtUt = (ms: number) => new Date(Math.round(ms / 60000) * 60000).toISOString().slice(0, 16).replace("T", " ") + " UT";
/** Belirsizlik 1 saati aşarsa yalnız tarih (≈). */
export const fmtLocalU = (ms: number, u: number, tz: string) => (u > 3600 ? `≈ ${fmtLocalDate(ms, tz)}` : fmtLocal(ms, tz));
export const fmtUtU = (ms: number, u: number) => (u > 3600 ? `≈ ${new Date(ms).toISOString().slice(0, 10)} UT` : fmtUt(ms));

/** Masaüstünde tablo, <768'de kart listesi (ilk sütun kart başlığı; kısa alanlar iki sütun, tek kalan tam genişlik). */
export function DataTable({ head, rows, mobileHead, testId }: { head: string[]; rows: { key: string; cells: ReactNode[] }[]; mobileHead?: string[]; testId?: string }) {
  const mh = mobileHead ?? head;
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
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.cardsM}>
        {rows.map((r) => (
          <div key={r.key} className={s.mcard}>
            {r.cells.map((c, i) => (
              <div key={i} className={`${s.mrow} ${i === 0 ? s.mtitle : r.cells.length % 2 === 0 && i === r.cells.length - 1 ? s.mfull : ""}`}>
                <span className={s.mk}>{mh[i]}</span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** Ayar paneli: masaüstünde hep açık; <768'de sonuç varken katlanır (tek satır özet + Düzenle). */
export function ParamsPanel({ summary, open, onToggle, children }: { summary: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <aside className={`${s.panel} ${s.params} ${open ? s.paramsOpen : s.paramsClosed}`} aria-label="Ayarlar">
      <button type="button" className={s.paramsToggle} aria-expanded={open} onClick={onToggle}>
        <span className={s.ptT}>Ayarlar</span>
        <span className={s.ptS}>{summary}</span>
        <span className={s.ptB}>{open ? "Kapat" : "Düzenle"}</span>
      </button>
      <div className={s.paramsBody}>{children}</div>
    </aside>
  );
}

export function Seg<T extends string>({ label, options, value, onChange, testId }: { label: string; options: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; testId?: string }) {
  return (
    <div className={s.seg} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} data-testid={testId ? `${testId}-${v}` : undefined}>
          {l}
        </button>
      ))}
    </div>
  );
}
