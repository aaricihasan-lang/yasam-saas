// Atlas — DEKLİNASYON PARALELLERİ (aylık) TEKNİK TANIMI (SAF; 2026-10-22). Kayıt defterine (techniques.ts) YALNIZ EK olarak girer.
//
// Mimari karar: western.forecast'a seçenek DEĞİL, ayrı teknik. Gerekçe: (1) forecast natal haritaya göre transit olayları verir
// (doğum verisi gövdede, 90 günlük parçalar); deklinasyon paralelleri iki transit gök cismi arasındaki GÖKYÜZÜ temaslarıdır, doğum verisi
// kullanmaz, birimi takvim AYIDIR; (2) ölçü ekliptik boylam değil ekvator deklinasyonudur (ayrı matematiksel alan); (3) forecast'ın gövde /
// anahtar / görünümüne dokunulmaz (sabit hash). kp.ruling_interval gibi doğum verisinden bağımsız ama danışan çalışma alanında çalışır.
//
// Önbellek: gövde yalnız { yıl, ay, timezone: 0, orb, düğüm } → aynı ay + orb + düğüm her danışan için aynı anahtar (ücret tekrarlanmaz).
// Gösterim saat dilimi (displayTz) gövdeye / anahtara GİRMEZ.

import { ASTRO_PROVIDER_LANG, ROXY_API_VERSION, ROXY_PROVIDER } from "../config";
import { calcInputHash, type CalcIdentity } from "./inputHash";
import type { CalcUnit, TechniqueDefinition } from "./techniques";
import { isValidIanaTimeZone } from "../birth/timeResolution";
import { declinationParallelsBody, projectRoxyDeclinationParallels, ROXY_DECLINATION_PARALLELS } from "../providers/roxy/declinationParallels";
import { DECLINATION_ORB_DEFAULT, DECLINATION_PARALLELS_TECHNICAL_SCHEMA, declinationMonthOk, isDeclinationOrb } from "../model/westernDeclination";
import type { NodeType } from "../model/western";

const o = (raw: unknown) => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;

/** techniques.ts `unit()` ile AYNI kimlik kuralı. */
function unitOf(meta: { endpoint: string; adapter: string }, body: Record<string, unknown>): CalcUnit {
  const identity: CalcIdentity = { provider: ROXY_PROVIDER, providerApiVersion: ROXY_API_VERSION, adapterVersion: meta.adapter, endpoint: meta.endpoint, lang: ASTRO_PROVIDER_LANG, body };
  return { technique: "western.declination_parallels", ...identity, inputHash: calcInputHash(identity), covers: [], timeDependent: true, part: 0 };
}

export function parseDeclinationParallelsOptions(raw: unknown): Record<string, unknown> | null {
  const r = o(raw);
  if (!declinationMonthOk(r.month)) return null;
  const orb = r.orb === undefined ? DECLINATION_ORB_DEFAULT : r.orb;
  if (!isDeclinationOrb(orb)) return null;
  const nodeType = r.nodeType ?? "true";
  if (nodeType !== "true" && nodeType !== "mean") return null;
  const out: Record<string, unknown> = { month: r.month, orb, nodeType };
  if (r.displayTz !== undefined) {
    if (typeof r.displayTz !== "string" || !isValidIanaTimeZone(r.displayTz)) return null;
    out.displayTz = r.displayTz;
  }
  return out;
}

export const westernDeclinationParallels: TechniqueDefinition = {
  id: "western.declination_parallels",
  label: "Deklinasyon paralelleri (aylık)",
  family: "western",
  requiresPartner: false,
  // Doğum verisi kullanılmaz → doğum saati bilinmese de hesaplanır (maske yok).
  requiresKnownTime: false,
  timeDependent: true,
  parseOptions: (raw) => parseDeclinationParallelsOptions(raw),
  units: (_ctx, opt) => [unitOf(ROXY_DECLINATION_PARALLELS, declinationParallelsBody({ month: String(opt.month), orb: Number(opt.orb), nodeType: opt.nodeType as NodeType }))],
  project: (_u, raw, opt) => {
    const r = projectRoxyDeclinationParallels(raw, { month: String(opt.month), orb: Number(opt.orb), nodeType: opt.nodeType as NodeType });
    if (!r.ok) return r;
    return {
      ok: true,
      technical: r.technical,
      technicalSchema: DECLINATION_PARALLELS_TECHNICAL_SCHEMA,
      interpretation: null,
      interpretationSchema: null,
      projectionVersion: ROXY_DECLINATION_PARALLELS.projection,
      unmappedFields: r.unmappedFields,
      droppedValues: r.droppedValues,
    };
  },
};
