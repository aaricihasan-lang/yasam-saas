import type { ReflexologyProtocolRecord } from "../types";

export type ProtocolClinicalContent = {
  targetProblem: string | null;
  /** record.metin ilk satırı — hedeften farklıysa ayrı kart */
  protocolIntro: string | null;
  applicationSteps: string[];
  applicationNotes: string | null;
  source: string | null;
  stepsFromMethods: boolean;
  stepsFromMetin: boolean;
};

function reflexologyText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function pickRawText(raw: Record<string, unknown> | null, keys: string[]): string | null {
  if (!raw) return null;
  for (const key of keys) {
    const text = reflexologyText(raw[key]);
    if (text) return text;
  }
  return null;
}

function normalizeCompareKey(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

function normalizeStepLine(line: string): string {
  return line.replace(/^\s*[\d]+[\.\)\-:]\s*/, "").trim();
}

function splitMetinToLines(metin: string): string[] {
  return metin
    .split(/\r?\n/)
    .map((line) => normalizeStepLine(line))
    .filter(Boolean);
}

/** trim + lowercase ile satır tekilleştirme */
export function dedupeLines(lines: string[], excludeKeys?: Set<string>): string[] {
  const seen = new Set<string>(excludeKeys ? [...excludeKeys] : []);
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const key = normalizeCompareKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function addToComparePool(pool: Set<string>, ...texts: (string | null | undefined)[]) {
  for (const text of texts) {
    const t = text?.trim();
    if (!t) continue;
    pool.add(normalizeCompareKey(t));
  }
}

function getRawMetin(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;
  return reflexologyText(raw.metin) || null;
}

function splitMetinIntroAndSteps(lines: string[]): {
  intro: string | null;
  stepLines: string[];
} {
  if (lines.length === 0) return { intro: null, stepLines: [] };
  if (lines.length === 1) return { intro: lines[0]!, stepLines: [] };
  return { intro: lines[0]!, stepLines: lines.slice(1) };
}

function formatMethodStep(method: Record<string, unknown>): string {
  const baslik = reflexologyText(method.metod_basligi);
  const metin = reflexologyText(method.metin);
  const aciklama = reflexologyText(method.aciklama);
  const diger = reflexologyText(method.diger_uygulamalar);

  const parts: string[] = [];
  if (baslik) parts.push(baslik);
  if (metin) parts.push(metin);
  if (aciklama && aciklama !== metin) parts.push(aciklama);
  if (diger) parts.push(diger);

  return parts.join("\n").trim();
}

function extractStepsFromMethods(raw: Record<string, unknown> | null): string[] {
  if (!raw) return [];
  const methods = raw.methods;
  if (!Array.isArray(methods) || methods.length === 0) return [];

  const steps: string[] = [];
  for (const entry of methods) {
    if (!entry || typeof entry !== "object") continue;
    const formatted = formatMethodStep(entry as Record<string, unknown>);
    if (formatted) steps.push(formatted);
  }
  return steps;
}

function extractStepsFromLegacyRaw(raw: Record<string, unknown> | null): string[] {
  if (!raw) return [];

  const candidates = [raw.adimlar, raw.uygulama_adimlari, raw.application_steps, raw.steps];

  for (const value of candidates) {
    if (Array.isArray(value)) {
      const steps = value.map((e) => reflexologyText(e)).filter(Boolean);
      if (steps.length > 0) return steps;
    }
    const text = reflexologyText(value);
    if (text) {
      const lines = splitMetinToLines(text);
      if (lines.length >= 2) return lines;
      if (lines.length === 1) return [lines[0]!];
    }
  }

  return [];
}

function resolveSupplementaryNotes(
  raw: Record<string, unknown> | null,
  applicationNotes: string | null | undefined,
  comparePool: Set<string>,
): string | null {
  const parts: string[] = [];

  for (const key of [
    "aciklama",
    "diger_uygulamalar",
    "not",
    "notes",
    "uygulama_notlari",
    "uygulama_notu",
  ] as const) {
    const text = raw ? reflexologyText(raw[key]) : "";
    if (!text) continue;
    const keyNorm = normalizeCompareKey(text);
    if (comparePool.has(keyNorm)) continue;
    comparePool.add(keyNorm);
    parts.push(text);
  }

  const db = applicationNotes?.trim();
  if (db) {
    const dbKey = normalizeCompareKey(db);
    if (!comparePool.has(dbKey)) {
      parts.push(db);
    }
  }

  if (parts.length === 0) return null;
  return parts.join("\n\n");
}

/** Tek giriş noktası — record.metin bir kez parse edilir */
export function buildProtocolClinicalContent(
  protocol: ReflexologyProtocolRecord,
): ProtocolClinicalContent {
  const raw = protocol.raw_json;
  const comparePool = new Set<string>();

  const targetProblem = resolveTargetProblem(protocol, raw);
  addToComparePool(comparePool, targetProblem);

  const methodsStepsRaw = extractStepsFromMethods(raw);
  const stepsFromMethods = methodsStepsRaw.length > 0;

  let protocolIntro: string | null = null;
  let applicationSteps: string[] = [];
  let stepsFromMetin = false;

  const metin = getRawMetin(raw);
  const metinLines = metin ? dedupeLines(splitMetinToLines(metin)) : [];

  if (stepsFromMethods) {
    applicationSteps = dedupeLines(methodsStepsRaw, comparePool);
    addToComparePool(comparePool, ...applicationSteps);

    if (metinLines.length > 0) {
      const introCandidate = metinLines[0]!;
      const introKey = normalizeCompareKey(introCandidate);
      if (!comparePool.has(introKey)) {
        protocolIntro = introCandidate;
        comparePool.add(introKey);
      }
    }
  } else if (metinLines.length > 0) {
    const { intro, stepLines } = splitMetinIntroAndSteps(metinLines);

    if (intro) {
      const introKey = normalizeCompareKey(intro);
      if (!comparePool.has(introKey)) {
        protocolIntro = intro;
        comparePool.add(introKey);
      }
    }

    applicationSteps = dedupeLines(stepLines, comparePool);
    addToComparePool(comparePool, ...applicationSteps);
    stepsFromMetin = applicationSteps.length > 0;
  } else {
    const legacy = dedupeLines(extractStepsFromLegacyRaw(raw), comparePool);
    if (legacy.length > 0) {
      applicationSteps = legacy;
      addToComparePool(comparePool, ...applicationSteps);
    }
  }

  const applicationNotes = resolveSupplementaryNotes(
    raw,
    protocol.application_notes,
    comparePool,
  );

  const source =
    resolveSourceText(raw, {
      skipTexts: [
        targetProblem,
        protocolIntro,
        applicationNotes,
        ...applicationSteps,
      ],
    }) ??
    extractSourceDescription(raw, {
      targetProblem,
      protocolIntro,
      applicationNotes,
    });

  return {
    targetProblem,
    protocolIntro,
    applicationSteps,
    applicationNotes,
    source,
    stepsFromMethods,
    stepsFromMetin,
  };
}

export function resolveTargetProblem(
  protocol: ReflexologyProtocolRecord,
  rawJson: Record<string, unknown> | null,
): string | null {
  const hedef = pickRawText(rawJson, ["hedef", "target", "problem", "sorun", "target_problem"]);
  if (hedef) return hedef;

  return (
    protocol.target_problem?.trim() ||
    protocol.title?.trim() ||
    pickRawText(rawJson, ["title", "name", "baslik", "protokol_adi"]) ||
    null
  );
}

export function protocolHeroTitle(
  protocol: ReflexologyProtocolRecord,
  rawJson: Record<string, unknown> | null = protocol.raw_json,
): string {
  return resolveTargetProblem(protocol, rawJson) || "Başlıksız protokol";
}

export function resolveSourceText(
  rawJson: Record<string, unknown> | null,
  opts?: { skipTexts?: (string | null | undefined)[] },
): string | null {
  const kaynak = pickRawText(rawJson, ["kaynak", "source"]);
  if (!kaynak) return null;

  const skip = new Set(
    (opts?.skipTexts ?? []).map((v) => v?.trim()).filter(Boolean) as string[],
  );
  if (skip.has(kaynak)) return null;

  return kaynak;
}

function extractSourceDescription(
  rawJson: Record<string, unknown> | null,
  opts: {
    applicationNotes?: string | null;
    targetProblem?: string | null;
    protocolIntro?: string | null;
  },
): string | null {
  if (!rawJson) return null;

  const skip = new Set(
    [opts.applicationNotes, opts.targetProblem, opts.protocolIntro]
      .map((v) => v?.trim())
      .filter(Boolean) as string[],
  );

  for (const key of ["kisa_aciklama", "description"] as const) {
    const text = reflexologyText(rawJson[key]);
    if (text && !skip.has(text)) return text;
  }

  return null;
}

export function formatRawJsonForDev(raw: Record<string, unknown> | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

/** @deprecated buildProtocolClinicalContent kullanın */
export function parseApplicationSteps(
  applicationNotes: string | null | undefined,
  rawJson: Record<string, unknown> | null,
): string[] {
  return buildProtocolClinicalContent({
    id: "",
    tenant_id: "",
    source_uid: null,
    title: null,
    target_problem: null,
    organs: null,
    application_notes: applicationNotes ?? null,
    raw_json: rawJson,
    created_at: "",
  }).applicationSteps;
}

/** @deprecated buildProtocolClinicalContent kullanın */
export function resolveApplicationNotesDisplay(
  applicationNotes: string | null | undefined,
  rawJson: Record<string, unknown> | null,
  _steps: string[],
): string | null {
  return buildProtocolClinicalContent({
    id: "",
    tenant_id: "",
    source_uid: null,
    title: null,
    target_problem: null,
    organs: null,
    application_notes: applicationNotes ?? null,
    raw_json: rawJson,
    created_at: "",
  }).applicationNotes;
}

export function parseLinesToSteps(text: string): string[] {
  return splitMetinToLines(text);
}

export function introDiffersFromTarget(
  intro: string | null,
  target: string | null,
): boolean {
  if (!intro?.trim()) return false;
  if (!target?.trim()) return true;
  return normalizeCompareKey(intro) !== normalizeCompareKey(target);
}
