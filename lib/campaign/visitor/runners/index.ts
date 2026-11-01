/**
 * KM-3 — ziyaretçi çalıştırıcı kaydı. Ziyaretçiye YALNIZ burada bağlı (gerçek motora bağlanmış ve testli) teknikler
 * gösterilir; katalogda "hazır" olsa bile çalıştırıcısı olmayan teknik ziyaretçi sayfasında GÖRÜNMEZ ve çalıştırılamaz.
 *   - hd:transit     : sınır yakınında Roxy düzeltmesi ve ortak gezegen önbelleği (DB yazımı) ister → KM-3 dışında.
 *   - "doğrulama" / "uygun değil" teknikler: katalog kuralı gereği ziyaretçiye açılmaz.
 * Kozmik Takvim paketi KM-3'te gerçek motora bağlanıp testlerle doğrulandı (catalog: hazır).
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { getCatalogEntry } from "../../catalog";
import { numbAnalysis, numbTiming } from "./numb";
import { atlasLilly } from "./lilly";
import { kozmikPaket } from "./kozmik";
import { hdBodygraph } from "./hd";
import { NUMK_RUNNERS } from "./numk";
import { ATLAS_RUNNERS } from "./atlas";
import type { VisitorRunner } from "./shared";

assertServerOnly("lib/campaign/visitor/runners/index");

const ALL = [hdBodygraph, numbAnalysis, numbTiming, atlasLilly, kozmikPaket, ...NUMK_RUNNERS, ...ATLAS_RUNNERS] as unknown as VisitorRunner<unknown>[];

export const VISITOR_RUNNERS: ReadonlyMap<string, VisitorRunner<unknown>> = new Map(ALL.map((r) => [r.key, r]));

/** Çalıştırıcı + katalog "hazır" + seçilebilir: ziyaretçiye açılabilir mi. */
export function visitorRunnerFor(key: string): VisitorRunner<unknown> | null {
  const r = VISITOR_RUNNERS.get(key);
  const e = getCatalogEntry(key);
  if (!r || !e || e.readiness !== "hazir") return null;
  return r;
}
