// Human Design Variables — BAĞIMSIZ çapraz denetim (SAF; ağ / DB yok). Mühürlü motor DEĞİŞTİRİLMEZ, yalnız ÇAĞRILIR.
//
// Sunucunun kendi doğum anından (UTC) yerel efemerisle (astronomy-engine sağlayıcısı) Personality Güneş / Kuzey Düğüm ve
// Design anında (Güneş −88°, mevcut design-solver) Güneş / Kuzey Düğüm boylamları hesaplanır. Yerel motorun ölçülmüş hata
// payı (transit çalışması: 100 000 anlık Swiss Ephemeris taraması, ×1,5) + çözücü toleransı bandı içindeki (Color, Tone)
// adayları üretilir. Sağlayıcının her ok için verdiği Color/Tone bu aday kümesinde OLMALIDIR; değilse sonuç gösterilmez.
// Not: Base (18,75″) yerel bandın altında kalabilir → Base bu denetimin kapsamı DIŞINDADIR (zaten bilgilendirici).

import { AstronomyEnginePlanetLongitudeProvider } from "../engine/ae-provider";
import { solveDesignTimeUtc } from "../engine/design-solver";
import { dateToJulianDay } from "../engine/julian";
import type { PlanetName } from "../engine/types";
import { transitUncertaintyArcsec } from "../transit/generalTransit";
import { ARROW_SPECS, colorToneCandidates, type VariableKey } from "./variablesMath";
import type { VariablesDto } from "./variablesContract";

/** Design anı çözücüsünün toleransı (1″) + kayan nokta emniyeti. */
const SOLVER_EXTRA_ARCSEC = 2;

export type LocalArrowBand = { key: VariableKey; longitude: number; bandArcsec: number; candidates: string[] };

export function localVariableBands(birthUtc: Date): LocalArrowBand[] {
  const provider = new AstronomyEnginePlanetLongitudeProvider();
  const design = solveDesignTimeUtc({ birthUtc, provider }).designUtc;
  const lonAt = (utc: Date, body: PlanetName) => {
    const p = provider.getLongitudes(dateToJulianDay(utc)).find((x) => x.planet === body);
    if (!p || !Number.isFinite(p.longitude)) throw new Error(`yerel boylam yok: ${body}`);
    return p.longitude;
  };
  return ARROW_SPECS.map((s) => {
    const at = s.side === "design" ? design : birthUtc;
    const body: PlanetName = s.planet === "Sun" ? "Sun" : "NorthNode";
    const lon = lonAt(at, body);
    const band = transitUncertaintyArcsec(body, at.getUTCFullYear()) + SOLVER_EXTRA_ARCSEC;
    return { key: s.key, longitude: lon, bandArcsec: band, candidates: [...colorToneCandidates(lon, band)] };
  });
}

export type CrossCheck = { ok: true } | { ok: false; mismatches: Array<{ key: VariableKey; provider: string; candidates: string[] }> };

/** Sağlayıcının Color/Tone değerleri yerel bağımsız bant adaylarıyla tutarlı mı? */
export function crossCheckVariables(dto: VariablesDto, bands: LocalArrowBand[]): CrossCheck {
  const mismatches: Array<{ key: VariableKey; provider: string; candidates: string[] }> = [];
  for (const a of dto.arrows) {
    const b = bands.find((x) => x.key === a.key);
    const got = `${a.color}.${a.tone}`;
    if (!b || !b.candidates.includes(got)) mismatches.push({ key: a.key, provider: got, candidates: b?.candidates ?? [] });
  }
  return mismatches.length ? { ok: false, mismatches } : { ok: true };
}
