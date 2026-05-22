import type { ReflexologyProtocolRecord } from "../types";

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

function normalizeStepLine(line: string): string {
  return line.replace(/^\s*[\d]+[\.\)\-:]\s*/, "").trim();
}

export function parseLinesToSteps(text: string): string[] {
  const raw = text.trim();
  if (!raw) return [];

  const lines = raw
    .split(/\r?\n/)
    .map((line) => normalizeStepLine(line.trim()))
    .filter(Boolean);

  if (lines.length >= 2) return lines;

  const semicolonParts = raw
    .split(/;+/)
    .map((p) => normalizeStepLine(p.trim()))
    .filter(Boolean);
  if (semicolonParts.length >= 2) return semicolonParts;

  return [];
}

/** raw_json.metin — Uygulama Notları ana kaynağı */
export function resolvePrimaryMetin(
  rawJson: Record<string, unknown> | null,
  applicationNotes?: string | null,
): string | null {
  const fromRaw = pickRawText(rawJson, [
    "metin",
    "uygulama_notlari",
    "uygulama_notu",
    "notes",
    "note",
    "aciklama",
    "description",
  ]);
  if (fromRaw) return fromRaw;

  const db = applicationNotes?.trim();
  return db || null;
}

/** raw_json.hedef — Hedef / Sorun */
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

/** raw_json.kaynak */
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

function formatMethodStep(method: Record<string, unknown>): string {
  const baslik = reflexologyText(method.metod_basligi);
  const metin = reflexologyText(method.metin);
  const aciklama = reflexologyText(method.aciklama);
  const diger = reflexologyText(method.diger_uygulamalar);

  const lines: string[] = [];
  if (baslik) lines.push(baslik);
  if (metin) lines.push(metin);
  if (aciklama && aciklama !== metin) lines.push(aciklama);
  if (diger) lines.push(diger);

  return lines.join("\n").trim();
}

/** raw_json.methods[] → numaralı adımlar */
function extractStepsFromMethods(raw: Record<string, unknown> | null): string[] {
  if (!raw) return [];
  const methods = raw.methods;
  if (!Array.isArray(methods) || methods.length === 0) return [];

  const steps: string[] = [];
  for (const entry of methods) {
    if (!entry || typeof entry !== "object") continue;
    const formatted = formatMethodStep(entry as Record<string, unknown>);
    if (!formatted) continue;

    const lineSteps = parseLinesToSteps(formatted);
    if (lineSteps.length >= 2) {
      steps.push(...lineSteps);
    } else {
      steps.push(formatted);
    }
  }
  return steps;
}

function extractStepsFromLegacyRaw(raw: Record<string, unknown> | null): string[] {
  if (!raw) return [];

  const candidates = [
    raw.adimlar,
    raw.uygulama_adimlari,
    raw.application_steps,
    raw.steps,
    raw.uygulama,
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) {
      const steps = value.map((e) => reflexologyText(e)).filter(Boolean);
      if (steps.length > 0) return steps;
    }
    const text = reflexologyText(value);
    if (text) {
      const fromLines = parseLinesToSteps(text);
      if (fromLines.length > 0) return fromLines;
      return [text];
    }
  }

  return [];
}

/** Uygulama Adımları — önce methods[], sonra legacy alanlar (metin hariç) */
export function parseApplicationSteps(
  applicationNotes: string | null | undefined,
  rawJson: Record<string, unknown> | null,
): string[] {
  const fromMethods = extractStepsFromMethods(rawJson);
  if (fromMethods.length > 0) return fromMethods;

  const fromLegacy = extractStepsFromLegacyRaw(rawJson);
  if (fromLegacy.length > 0) return fromLegacy;

  const notes = applicationNotes?.trim() ?? "";
  const fromNotes = parseLinesToSteps(notes);
  if (fromNotes.length > 0) return fromNotes;

  return [];
}

/**
 * Uygulama Notları — öncelik raw_json.metin; adımlarla aynı metin olsa bile not bölümünde gösterilir.
 */
export function resolveApplicationNotesDisplay(
  applicationNotes: string | null | undefined,
  rawJson: Record<string, unknown> | null,
  _steps: string[],
): string | null {
  return resolvePrimaryMetin(rawJson, applicationNotes);
}

/** Kaynak / Açıklama kartı */
export function extractSourceDescription(
  rawJson: Record<string, unknown> | null,
  opts: {
    applicationNotes?: string | null;
    targetProblem?: string | null;
    title?: string | null;
  },
): string | null {
  const source = resolveSourceText(rawJson, {
    skipTexts: [opts.applicationNotes, opts.targetProblem, opts.title],
  });
  if (source) return source;

  if (!rawJson) return null;

  const skip = new Set(
    [opts.applicationNotes, opts.targetProblem, opts.title, source]
      .map((v) => v?.trim())
      .filter(Boolean) as string[],
  );

  for (const key of ["kisa_aciklama"] as const) {
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
