import type { NumerolojiMotorOut } from "./numerolojiPlainMetin";

export type AnalysisDataPayload = {
  version: 1;
  motor: NumerolojiMotorOut;
  summary: string;
};

/** Supabase `analysis_data` (veya eski `analysis_json`) alanından motor çıktısını okur. */
export function extractMotorFromAnalysisJson(raw: unknown): NumerolojiMotorOut | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const motor = o.motor;
  if (!motor || typeof motor !== "object" || Array.isArray(motor)) return null;
  const ver = o.version;
  if (ver !== undefined && ver !== 1) return null;
  return motor as NumerolojiMotorOut;
}

export function extractSummaryFromAnalysisData(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = (raw as Record<string, unknown>).summary;
  return typeof s === "string" && s.trim().length > 0 ? s.trim() : null;
}
