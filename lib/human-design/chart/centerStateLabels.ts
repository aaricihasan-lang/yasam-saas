// HD-UZMAN-01 — Kayıtlı harita satırı için merkez durum etiketleri (SAF; yalnız sunum yardımcısı).

import { hdCenterLabelFromCode } from "../codeHelpers";
import { HD_CENTER_CODES, HD_CENTER_STATE_LABEL, classifyChartRowCenters, type HdCenterState } from "./centerStates";

type ChartRowLike = Parameters<typeof classifyChartRowCenters>[0];

/**
 * Tanımlı OLMAYAN merkezler: "G / Kimlik Merkezi (G Center) — Tanımsız" biçiminde. Durum kanıtlı
 * sınıflandırmadan gelir; kanıt yoksa "Doğrulanamadı" yazılır (Açık tahmin edilmez).
 */
export function nonDefinedCenterLabels(
  row: ChartRowLike,
  /** I18N: yalnız GÖSTERİM etiketleri (varsayılan = Türkçe sözlük, bugünkü çıktı birebir). Sınıflandırma değişmez. */
  labels: { center: (code: string) => string; state: (state: HdCenterState) => string } = { center: hdCenterLabelFromCode, state: (s) => HD_CENTER_STATE_LABEL[s] },
): string[] {
  const { states } = classifyChartRowCenters(row);
  const active = new Set(Array.isArray(row.active_centers) ? (row.active_centers as unknown[]) : []);
  const out: string[] = [];
  for (const code of HD_CENTER_CODES) {
    const st = states[code].state;
    if (st === "defined") continue;
    // Kayıtta tanımlı görünen ama doğrulanamayan merkez burada listelenmez (Tanımlı listesinde kalır).
    if (st === "unverified" && active.has(code)) continue;
    const inOpen = Array.isArray(row.open_centers) && (row.open_centers as unknown[]).includes(code);
    if (st === "unverified" && !inOpen) continue;
    out.push(`${labels.center(code)} — ${labels.state(st)}`);
  }
  return out;
}
