import type { NumerolojiMotorOut } from "./numerolojiPlainMetin";

export type GorselTemaIdKayit = "kozmikMor" | "altinMist" | "kuzeyIsiklari" | "okyanusDerinligi";

export type AnalysisDataPayload = {
  version: 1;
  motor: NumerolojiMotorOut;
  summary: string;
  tas?: AnalysisTasData;
  gorsel?: AnalysisGorselData;
};

export type AnalysisTasData = {
  bileklik?: string;
  kolye?: string;
  kutle?: string;
  notlar?: string;
};

export type AnalysisGorselData = {
  temaId?: GorselTemaIdKayit;
  uzmanAdi?: string;
  gorselTaslariGoster?: boolean;
  tasBileklik?: string;
  tasKolye?: string;
  tasKutle?: string;
};

const KAYIT_BOLUM_YOK = "Bu bölüm bu kayıtta bulunmuyor.";

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** Supabase `analysis_data` alanından motor çıktısını okur. */
export function extractMotorFromAnalysisJson(raw: unknown): NumerolojiMotorOut | null {
  const o = asRecord(raw);
  if (!o) return null;
  const motor = o.motor;
  if (!motor || typeof motor !== "object" || Array.isArray(motor)) return null;
  const ver = o.version;
  if (ver !== undefined && ver !== 1) return null;
  return motor as NumerolojiMotorOut;
}

export function extractSummaryFromAnalysisData(raw: unknown): string | null {
  const o = asRecord(raw);
  if (!o) return null;
  const s = o.summary;
  return typeof s === "string" && s.trim().length > 0 ? s.trim() : null;
}

export function extractTasFromAnalysisData(raw: unknown): AnalysisTasData | null {
  const o = asRecord(raw);
  if (!o) return null;
  const tas = o.tas;
  if (!tas || typeof tas !== "object" || Array.isArray(tas)) return null;
  const t = tas as Record<string, unknown>;
  const out: AnalysisTasData = {};
  if (typeof t.bileklik === "string" && t.bileklik.trim()) out.bileklik = t.bileklik.trim();
  if (typeof t.kolye === "string" && t.kolye.trim()) out.kolye = t.kolye.trim();
  if (typeof t.kutle === "string" && t.kutle.trim()) out.kutle = t.kutle.trim();
  if (typeof t.notlar === "string" && t.notlar.trim()) out.notlar = t.notlar.trim();
  return Object.keys(out).length > 0 ? out : null;
}

export function extractGorselFromAnalysisData(raw: unknown): AnalysisGorselData | null {
  const o = asRecord(raw);
  if (!o) return null;
  const gorsel = o.gorsel;
  if (!gorsel || typeof gorsel !== "object" || Array.isArray(gorsel)) return null;
  const g = gorsel as Record<string, unknown>;
  const out: AnalysisGorselData = {};
  if (typeof g.temaId === "string") out.temaId = g.temaId as GorselTemaIdKayit;
  if (typeof g.uzmanAdi === "string") out.uzmanAdi = g.uzmanAdi;
  if (typeof g.gorselTaslariGoster === "boolean") out.gorselTaslariGoster = g.gorselTaslariGoster;
  if (typeof g.tasBileklik === "string") out.tasBileklik = g.tasBileklik;
  if (typeof g.tasKolye === "string") out.tasKolye = g.tasKolye;
  if (typeof g.tasKutle === "string") out.tasKutle = g.tasKutle;
  return Object.keys(out).length > 0 ? out : null;
}

export function kayitBolumYokMesaji(): string {
  return KAYIT_BOLUM_YOK;
}
