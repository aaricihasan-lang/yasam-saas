import type { NumerolojiMotorOut } from "./numerolojiPlainMetin";

/** Supabase `analysis_json` alanından motor çıktısını güvenli okur. */
export function extractMotorFromAnalysisJson(raw: unknown): NumerolojiMotorOut | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const motor = o.motor;
  if (!motor || typeof motor !== "object" || Array.isArray(motor)) return null;
  const ver = o.version;
  if (ver !== undefined && ver !== 1) return null;
  return motor as NumerolojiMotorOut;
}
