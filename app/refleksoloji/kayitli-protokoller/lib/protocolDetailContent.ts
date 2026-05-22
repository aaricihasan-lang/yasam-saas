import type { ReflexologyProtocolRecord } from "../types";

function reflexologyText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
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

function extractStepsFromRaw(raw: Record<string, unknown> | null): string[] {
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
      if (text.length > 0) return [text];
    }
  }

  return [];
}

export function parseApplicationSteps(
  applicationNotes: string | null | undefined,
  rawJson: Record<string, unknown> | null,
): string[] {
  const fromRaw = extractStepsFromRaw(rawJson);
  if (fromRaw.length > 0) return fromRaw;

  const notes = applicationNotes?.trim() ?? "";
  const fromNotes = parseLinesToSteps(notes);
  if (fromNotes.length > 0) return fromNotes;

  return [];
}

export function resolveApplicationNotesDisplay(
  applicationNotes: string | null | undefined,
  steps: string[],
): string | null {
  const notes = applicationNotes?.trim() ?? "";
  if (!notes) return null;

  if (steps.length === 0) return notes;

  const joined = steps.join("\n").trim();
  if (joined === notes) return null;

  const lines = parseLinesToSteps(notes);
  if (lines.length > 0 && lines.length === steps.length) return null;

  return notes;
}

export function extractSourceDescription(
  rawJson: Record<string, unknown> | null,
  opts: { applicationNotes?: string | null; targetProblem?: string | null; title?: string | null },
): string | null {
  if (!rawJson) return null;

  const skip = new Set(
    [opts.applicationNotes, opts.targetProblem, opts.title]
      .map((v) => v?.trim())
      .filter(Boolean) as string[],
  );

  for (const key of ["kaynak", "source", "kisa_aciklama", "description", "aciklama"] as const) {
    const text = reflexologyText(rawJson[key]);
    if (text && !skip.has(text)) return text;
  }

  return null;
}

export function protocolHeroTitle(protocol: ReflexologyProtocolRecord): string {
  return (
    protocol.target_problem?.trim() ||
    protocol.title?.trim() ||
    "Başlıksız protokol"
  );
}

export function formatRawJsonForDev(raw: Record<string, unknown> | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}
