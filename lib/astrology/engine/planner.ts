// Astroloji Hesap Motoru — MİNİMUM-İSTEK PLANLAYICI (SAF; önbellek sorgusu enjekte edilir).
//
// Adımlar: seçim → birimler → kapsama budaması → tekilleştirme → önbellek kontrolü.
// Çıktı: "X hesap seçildi → Y yeni sağlayıcı isteği → Z kayıtlı sonuç". "Tümünü hesapla"
// YOKTUR; yalnız açıkça seçilen teknikler planlanır.

import { ASTRO_CONFIRM_THRESHOLD, ASTRO_MAX_SELECTIONS_PER_RUN } from "../config";
import type { NatalBirthInput } from "../providers/roxy/natal";
import { getTechnique, type CalcUnit, type TechniqueId } from "./techniques";

export type Selection = { technique: TechniqueId; options: Record<string, unknown> };

export type PlannedUnit = CalcUnit & { cached: boolean; selectionIndexes: number[] };

export type ExecutionPlan = {
  selectedCount: number;
  units: PlannedUnit[];
  newRequestCount: number;
  cachedCount: number;
  /** Kapsama nedeniyle hiç çalıştırılmayacak birim sayısı. */
  coveredCount: number;
  /** Seçim içinde aynı hesap birden çok kez istendiyse tekilleştirilen sayı. */
  dedupedCount: number;
  requiresConfirmation: boolean;
};

export type ParseSelectionsResult =
  | { ok: true; selections: Selection[] }
  | { ok: false; code: string; error: string };

export function parseSelections(raw: unknown): ParseSelectionsResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, code: "NO_SELECTION", error: "En az bir hesaplama seçilmelidir." };
  }
  if (raw.length > ASTRO_MAX_SELECTIONS_PER_RUN) {
    return { ok: false, code: "TOO_MANY_SELECTIONS", error: `Tek seferde en fazla ${ASTRO_MAX_SELECTIONS_PER_RUN} hesaplama seçilebilir.` };
  }
  const out: Selection[] = [];
  for (const item of raw) {
    const o = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
    const def = getTechnique(o?.technique);
    if (!o || !def) return { ok: false, code: "UNKNOWN_TECHNIQUE", error: "Bilinmeyen hesaplama türü." };
    const options = def.parseOptions(o.options);
    if (!options) return { ok: false, code: "INVALID_OPTIONS", error: "Geçersiz hesaplama seçenekleri." };
    out.push({ technique: def.id, options });
  }
  return { ok: true, selections: out };
}

export function buildPlan(
  selections: Selection[],
  birth: NatalBirthInput,
  isCached: (inputHash: string) => boolean,
): ExecutionPlan {
  const all: { unit: CalcUnit; sel: number }[] = [];
  selections.forEach((s, i) => {
    const def = getTechnique(s.technique);
    if (!def) return;
    for (const u of def.units(birth, s.options)) all.push({ unit: u, sel: i });
  });

  // Kapsama: aynı gövdeyle çalışan bir birim başka bir endpoint'i kapsıyorsa o birim gereksizdir.
  const coveredKeys = new Set<string>();
  for (const { unit } of all) {
    for (const c of unit.covers) coveredKeys.add(`${c}|${JSON.stringify(unit.body)}`);
  }

  const byHash = new Map<string, PlannedUnit>();
  let covered = 0;
  let deduped = 0;
  for (const { unit, sel } of all) {
    if (coveredKeys.has(`${unit.endpoint}|${JSON.stringify(unit.body)}`)) {
      covered += 1;
      continue;
    }
    const existing = byHash.get(unit.inputHash);
    if (existing) {
      deduped += 1;
      if (!existing.selectionIndexes.includes(sel)) existing.selectionIndexes.push(sel);
      continue;
    }
    byHash.set(unit.inputHash, { ...unit, cached: isCached(unit.inputHash), selectionIndexes: [sel] });
  }
  const units = [...byHash.values()];
  const newRequestCount = units.filter((u) => !u.cached).length;
  return {
    selectedCount: selections.length,
    units,
    newRequestCount,
    cachedCount: units.length - newRequestCount,
    coveredCount: covered,
    dedupedCount: deduped,
    requiresConfirmation: newRequestCount > ASTRO_CONFIRM_THRESHOLD,
  };
}

/** İstemciye dönen özet (gövde/doğum verisi/hash İÇERMEZ). */
export function publicPlanSummary(plan: ExecutionPlan) {
  return {
    selectedCount: plan.selectedCount,
    newRequestCount: plan.newRequestCount,
    cachedCount: plan.cachedCount,
    coveredCount: plan.coveredCount,
    dedupedCount: plan.dedupedCount,
    requiresConfirmation: plan.requiresConfirmation,
    units: plan.units.map((u) => ({ technique: u.technique, endpoint: u.endpoint, cached: u.cached, timeDependent: u.timeDependent })),
  };
}
