// Atlas — Sade Sati dönem tarihleri: ürün bayrağı + teknik veriye ekleme (SAF; sunucu tarafında attachContext'ten çağrılır).
//
// BAYRAK: `ASTROLOGY_SADE_SATI_PERIODS` YALNIZ tam "true" ise etkin. Varsayılan KAPALI (production'da tanımlı değil) →
// teknik veri, önbellek anahtarı, istek gövdesi, ekran ve rapor ÖNCEKİYLE BİREBİR. Metodoloji (K1) owner onayı bekliyor.
// Ücretli sağlayıcı çağrısı YOK: Janma Rashi yalnız önbellekteki Vedik D1 kaydından, dönemler sürümlü katalogdan.
// FAIL-CLOSED: katalog bütünlüğü (SHA-256) bozuk / D1 yok / Lahiri değil / sağlayıcının günlük evresiyle uyuşmazlık / kapsam dışı
// → tarih ÜRETİLMEZ, nedeni yazılır.

import { createHash } from "node:crypto";
import { SADE_SATI_SIGNS, providerAgrees, sadeSatiPeriods, type SadeSatiPeriods } from "./periods";
import { SATURN_CATALOG_META, SATURN_INGRESSES, type SaturnIngress, type SaturnSign } from "./saturnCatalog";
import type { SadeSatiPeriodsStatus } from "./labels";

export type { SadeSatiPeriodsStatus } from "./labels";

export function isSadeSatiPeriodsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ASTROLOGY_SADE_SATI_PERIODS === "true";
}

/** Katalog SHA-256 girdisi — üretici (naif_katalog_uret.py `catalog_canon`) ile birebir aynı kural. */
export function saturnCatalogSha256(events: readonly SaturnIngress[]): string {
  return createHash("sha256")
    .update(events.map((e) => `${e.utc}|${e.from}|${e.to}|${e.motion}|${e.tolMinPerArcsec.toFixed(2)}`).join("\n"))
    .digest("hex");
}
let INTEGRITY: boolean | null = null;
/** Paketlenen katalog, üst verideki olay sayısı ve SHA-256 ile birebir mi? (süreç başına bir kez; ~1 ms) */
export function saturnCatalogIntact(): boolean {
  if (INTEGRITY === null) INTEGRITY = SATURN_INGRESSES.length === SATURN_CATALOG_META.eventCount && saturnCatalogSha256(SATURN_INGRESSES) === SATURN_CATALOG_META.sha256;
  return INTEGRITY;
}

type D1Like = { schema?: string; frame?: { ayanamsa?: string }; grahas?: { id: string; rashi: string; degreeInRashi: number }[] };

/** Sade Sati teknik verisine (bayrak açıkken) dönemleri ekler. Bayrak kapalıyken çağrılmaz. */
export function attachSadeSatiPeriods<T extends { present: boolean; phase: "rising" | "peak" | "setting" | null; asOf: string; frame: { ayanamsa: string } }>(
  technical: T,
  d1: unknown,
  birthUtc: string | null,
): T & { periods?: SadeSatiPeriods; periodsStatus: SadeSatiPeriodsStatus } {
  if (!saturnCatalogIntact()) return { ...technical, periodsStatus: { state: "blocked", reason: "CATALOG_INTEGRITY" } };
  if (technical.frame.ayanamsa !== "lahiri") return { ...technical, periodsStatus: { state: "unavailable", reason: "AYANAMSA_UNSUPPORTED" } };
  const d = d1 as D1Like | null;
  const moon = d && d.schema === "astro.vedic.d1.v1" && d.frame?.ayanamsa === "lahiri" ? d.grahas?.find((g) => g.id === "moon") : undefined;
  if (!moon || !(SADE_SATI_SIGNS as readonly string[]).includes(moon.rashi)) return { ...technical, periodsStatus: { state: "unavailable", reason: "D1_REQUIRED" } };
  const janma = moon.rashi as SaturnSign;
  const agrees = providerAgrees(janma, technical.asOf, { present: technical.present, phase: technical.phase });
  if (agrees === null) return { ...technical, periodsStatus: { state: "unavailable", reason: "OUT_OF_COVERAGE" } };
  if (!agrees) return { ...technical, periodsStatus: { state: "blocked", reason: "PROVIDER_MISMATCH" } };
  const periods = sadeSatiPeriods({ janmaRashi: janma, asOfUtc: `${technical.asOf}T12:00:00Z`, birthUtc, moonDegreeInRashi: moon.degreeInRashi });
  return { ...technical, periods, periodsStatus: { state: "ok" } };
}
