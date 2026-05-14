import { supabase } from "@/lib/supabase";
import type { NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";

export type AnalysisJsonPayload = {
  version: 1;
  motor: NumerolojiMotorOut;
};

export type NumerologyAnalysisRow = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  full_name: string;
  birth_date: string;
  /** Supabase jsonb — satır okunurken `extractMotorFromAnalysisJson` ile ayrıştırın. */
  analysis_json: unknown;
  created_at: string;
};

const TABLE = "numerology_analyses";

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

export async function saveNumerologyAnalysis(input: {
  tenantId: string;
  clientId?: string | null;
  fullName: string;
  birthDate: string;
  motor: NumerolojiMotorOut;
}): Promise<{ error: string | null; id?: string }> {
  const analysis_json: AnalysisJsonPayload = { version: 1, motor: input.motor };
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      tenant_id: input.tenantId,
      client_id: input.clientId ?? null,
      full_name: input.fullName.trim(),
      birth_date: input.birthDate.trim(),
      analysis_json,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  const id = typeof data?.id === "string" ? data.id : undefined;
  return { error: null, id };
}

export async function listNumerologyAnalyses(tenantId: string): Promise<{
  data: Pick<NumerologyAnalysisRow, "id" | "full_name" | "birth_date" | "created_at">[] | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, full_name, birth_date, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data as Pick<NumerologyAnalysisRow, "id" | "full_name" | "birth_date" | "created_at">[], error: null };
}

export async function getNumerologyAnalysisById(
  id: string,
  tenantId: string,
): Promise<{ data: NumerologyAnalysisRow | null; error: string | null }> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Kayıt bulunamadı." };
  if (data.tenant_id !== tenantId) return { data: null, error: "Bu kayda erişim yok." };

  return { data: data as NumerologyAnalysisRow, error: null };
}
