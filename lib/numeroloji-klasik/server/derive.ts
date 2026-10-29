/**
 * Klasik Numeroloji — yerel türetmeler (SAF; sağlayıcı çağrısı YOK).
 *
 * "İki Sistem" (dual): canlı doğrulamada (29.10.2026, 5/5 vaka) /dual yanıtı birebir
 *   pythagorean = /chart core.expression ve chaldean = /chaldean destiny çıktı → /dual ÇAĞRILMAZ;
 *   kişi analizinde chart + chaldean sonuçlarından burada birleştirilir (provider_meta.derived).
 */
import type { ChaldeanResult, ChartResult, DualResult } from "../model";
import { reduceSingle } from "../oracle/reduce";

export const DUAL_DERIVATION = "dual_from_chart_chaldean";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** chart + chaldean normalize sonuçlarından DualResult; yapı beklenen değilse null (dual "failed" sayılır). */
export function deriveDualFromChartChaldean(chart: unknown, chaldean: unknown): DualResult | null {
  if (!isObj(chart) || !isObj(chaldean)) return null;
  const c = chart as unknown as ChartResult;
  const k = chaldean as unknown as ChaldeanResult;
  const expr = c.core?.expression;
  const dest = k.destiny;
  if (!isObj(expr) || !isObj(dest) || typeof expr.value !== "number" || typeof dest.root !== "number") return null;
  const nm = isObj(k.numberMeaning) && k.numberMeaning.number === dest.root ? k.numberMeaning : null;
  const agreement = reduceSingle(expr.value) === dest.root;
  return {
    name: typeof k.name === "string" ? k.name : typeof c.profile?.name === "string" ? c.profile.name : "",
    pythagorean: { ...expr, title: expr.meaning?.title ?? "", keywords: expr.meaning?.keywords ?? [] },
    chaldean: { ...dest, planet: nm?.planet ?? "", title: nm?.title ?? "", caution: typeof k.caution === "boolean" ? k.caution : false },
    agreement,
    note: "",
    verification: { status: "unverified" },
  };
}
