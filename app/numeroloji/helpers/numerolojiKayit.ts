import { supabase } from "@/lib/supabase";
import { buildAnalizOzeti, type NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";
import type { AnalysisDataPayload } from "../utils/analysisJson";

export type NumerologyRecordRow = {
  id: string;
  tenant_id: string;
  name: string;
  surname: string;
  birth_date: string;
  analysis_data: unknown;
  created_at: string;
};

export type NumerologyRecordListItem = Pick<
  NumerologyRecordRow,
  "id" | "name" | "surname" | "birth_date" | "created_at" | "analysis_data"
>;

const TABLE = "numerology_records";

export function getTenantIdFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("yasam_user");
    if (!raw) return null;
    const u = JSON.parse(raw) as { tenant_id?: string };
    return typeof u.tenant_id === "string" && u.tenant_id.length > 0 ? u.tenant_id : null;
  } catch {
    return null;
  }
}

export function sortRecordsByNameTurkish<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "tr-TR"));
}

export async function saveNumerologyAnalysis(input: {
  tenantId: string;
  name: string;
  surname: string;
  birthDate: string;
  motor: NumerolojiMotorOut;
}): Promise<{ error: string | null; id?: string }> {
  const analysis_data: AnalysisDataPayload = {
    version: 1,
    motor: input.motor,
    summary: buildAnalizOzeti(input.motor),
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      tenant_id: input.tenantId,
      name: input.name.trim(),
      surname: input.surname.trim(),
      birth_date: input.birthDate.trim(),
      analysis_data,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  const id = typeof data?.id === "string" ? data.id : undefined;
  return { error: null, id };
}

export async function listNumerologyAnalyses(tenantId: string): Promise<{
  data: NumerologyRecordListItem[] | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, name, surname, birth_date, analysis_data, created_at")
    .eq("tenant_id", tenantId);

  if (error) return { data: null, error: error.message };
  const rows = (data ?? []) as NumerologyRecordListItem[];
  return { data: sortRecordsByNameTurkish(rows), error: null };
}

export async function getNumerologyAnalysisById(
  id: string,
  tenantId: string,
): Promise<{ data: NumerologyRecordRow | null; error: string | null }> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Kayıt bulunamadı." };
  if (data.tenant_id !== tenantId) return { data: null, error: "Bu kayda erişim yok." };

  return { data: data as NumerologyRecordRow, error: null };
}

/** Geriye dönük uyumluluk */
export type NumerologyAnalysisRow = NumerologyRecordRow;
