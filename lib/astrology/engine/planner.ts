// Astroloji Hesap Motoru — MİNİMUM-İSTEK PLANLAYICI (SAF; önbellek sorgusu enjekte edilir).
//
// Adımlar: seçim → normalize seçenek → birimler → kapsama budaması → tekilleştirme → önbellek kontrolü.
// Çıktı: "X hesap seçildi → Y yeni sağlayıcı isteği → Z kayıtlı sonuç". Engellenen seçimler (ör. saat
// bilinmeyen profilde return, karşı taraf yok) istek ÜRETMEZ ve nedeniyle raporlanır.
// "Tümünü hesapla" YOKTUR; yalnız açıkça seçilen teknikler planlanır.

import { ASTRO_CONFIRM_THRESHOLD, ASTRO_MAX_SELECTIONS_PER_RUN } from "../config";
import { getTechnique, type CalcUnit, type TechniqueId, type UnitContext } from "./techniques";

export type Selection = { technique: TechniqueId; options: Record<string, unknown> };
export type SelectionBlock = { code: string; error: string };
export type PlannedSelection = Selection & { ctx: UnitContext | null; blocked: SelectionBlock | null };

export type PlannedUnit = CalcUnit & { cached: boolean; selectionIndexes: number[] };

export type ExecutionPlan = {
  selectedCount: number;
  blockedCount: number;
  units: PlannedUnit[];
  newRequestCount: number;
  cachedCount: number;
  coveredCount: number;
  dedupedCount: number;
  requiresConfirmation: boolean;
  /** Seçim indeksi → bu seçimin birimlerinin input_hash listesi (parça sırasıyla). */
  selectionUnits: string[][];
  blocks: (SelectionBlock | null)[];
};

export type ParseSelectionsResult = { ok: true; selections: Selection[] } | { ok: false; code: string; error: string };

export function parseSelections(raw: unknown, now: Date = new Date()): ParseSelectionsResult {
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
    const options = def.parseOptions(o.options, now);
    if (!options) return { ok: false, code: "INVALID_OPTIONS", error: `Geçersiz seçenekler: ${def.label}.` };
    out.push({ technique: def.id, options });
  }
  return { ok: true, selections: out };
}

export function buildPlan(selections: PlannedSelection[], isCached: (inputHash: string) => boolean): ExecutionPlan {
  const all: { unit: CalcUnit; sel: number }[] = [];
  const blocks: (SelectionBlock | null)[] = [];
  selections.forEach((s, i) => {
    const def = getTechnique(s.technique);
    if (!def || s.blocked || !s.ctx) {
      blocks.push(s.blocked ?? { code: "UNAVAILABLE", error: "Hesaplanamıyor." });
      return;
    }
    const us = def.units(s.ctx, s.options);
    if (us.length === 0) {
      blocks.push({ code: "NO_UNIT", error: `${def.label}: ${def.noUnitsReason?.(s.ctx, s.options) ?? "hesap birimi oluşturulamadı."}` });
      return;
    }
    blocks.push(null);
    for (const u of us) all.push({ unit: u, sel: i });
  });

  // Kapsama: aynı gövdeyle çalışan bir birim başka bir endpoint'i kapsıyorsa o birim gereksizdir.
  const coveredKeys = new Set<string>();
  for (const { unit } of all) for (const c of unit.covers) coveredKeys.add(`${c}|${JSON.stringify(unit.body)}`);

  const byHash = new Map<string, PlannedUnit>();
  const selectionUnits: string[][] = selections.map(() => []);
  let covered = 0;
  let deduped = 0;
  for (const { unit, sel } of all) {
    if (coveredKeys.has(`${unit.endpoint}|${JSON.stringify(unit.body)}`)) {
      covered += 1;
      continue;
    }
    selectionUnits[sel].push(unit.inputHash);
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
    blockedCount: blocks.filter(Boolean).length,
    units,
    newRequestCount,
    cachedCount: units.length - newRequestCount,
    coveredCount: covered,
    dedupedCount: deduped,
    requiresConfirmation: newRequestCount > ASTRO_CONFIRM_THRESHOLD,
    selectionUnits,
    blocks,
  };
}

/** İstemciye dönen özet (gövde/doğum verisi/hash İÇERMEZ). */
export function publicPlanSummary(plan: ExecutionPlan, selections?: (Selection & { ctx?: UnitContext | null })[]) {
  return {
    selectedCount: plan.selectedCount,
    blockedCount: plan.blockedCount,
    newRequestCount: plan.newRequestCount,
    cachedCount: plan.cachedCount,
    coveredCount: plan.coveredCount,
    dedupedCount: plan.dedupedCount,
    requiresConfirmation: plan.requiresConfirmation,
    units: plan.units.map((u) => ({ technique: u.technique, endpoint: u.endpoint, cached: u.cached, timeDependent: u.timeDependent, part: u.part })),
    selections: plan.blocks.map((b, i) => ({
      technique: selections?.[i]?.technique ?? null,
      /** Normalize seçenekler (ör. "şimdi" → UTC saat başı) — çalıştırmada AYNEN geri gönderilir. */
      options: selections?.[i]?.options ?? null,
      unitCount: plan.selectionUnits[i]?.length ?? 0,
      newRequests: (plan.selectionUnits[i] ?? []).filter((h) => plan.units.find((u) => u.inputHash === h && !u.cached)).length,
      blocked: b,
      /** Teknik özel önizleme bilgisi (ör. ayın lunar return'leri ve yaklaşık anları). */
      info: planInfoOf(selections?.[i]),
    })),
  };
}

function planInfoOf(s: (Selection & { ctx?: UnitContext | null }) | undefined): Record<string, unknown> | null {
  if (!s || !s.ctx) return null;
  const def = getTechnique(s.technique);
  return def?.planInfo ? def.planInfo(s.ctx, s.options) : null;
}
