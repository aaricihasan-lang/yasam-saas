import { getSyncedTenantId, getSyncedYasamUser } from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";
import { buildAnalizOzeti, type NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";
import {
  mergeGorselIntoAnalysisData,
  type AnalysisDataPayload,
  type AnalysisGorselData,
} from "../utils/analysisJson";

/** Diğer modüllerle aynı demo tenant — yasam_user yoksa kullanılır. */
export const NUMEROLOJI_TENANT_ID = "11111111-1111-1111-1111-111111111111";

const TABLE = "numerology_records";

export type NumerologyRecordRow = {
  id: string;
  tenant_id: string;
  name: string;
  surname: string;
  birth_date: string;
  analysis_data: unknown;
  created_at: string;
};

export type NumerologyRecordListItem = NumerologyRecordRow;

/** @deprecated getSyncedTenantId kullanın — admin tenant yedeği yok */
export function getTenantIdFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("yasam_user");
    if (!raw) return null;
    const u = JSON.parse(raw) as { tenant_id?: string };
    const tid = u.tenant_id?.trim();
    return tid || null;
  } catch {
    return null;
  }
}

/** Veri sorgusu öncesi DB ile senkron tenant */
export async function resolveNumerolojiTenantId(): Promise<string | null> {
  return getSyncedTenantId();
}

/** API export route'ları için hem userId hem tenantId döner. */
export async function resolveNumerolojiUserAndTenant(): Promise<{
  userId: string;
  tenantId: string;
} | null> {
  const user = await getSyncedYasamUser();
  const tenantId = user?.tenant_id?.trim();
  const userId = user?.id?.trim();
  if (!userId || !tenantId) return null;
  return { userId, tenantId };
}

export function sortRecordsByNameTurkish(rows: NumerologyRecordListItem[]): NumerologyRecordListItem[] {
  return [...rows].sort((a, b) =>
    `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`, "tr-TR"),
  );
}

export async function saveNumerologyAnalysis(input: {
  name: string;
  surname: string;
  birthDate: string;
  motor: NumerolojiMotorOut;
}): Promise<{ error: string | null; id?: string }> {
  const tenantId = await resolveNumerolojiTenantId();
  if (!tenantId) {
    return { error: "Aktif kullanıcı tenant_id bulunamadı. Lütfen tekrar giriş yapın." };
  }
  const analysis_data: AnalysisDataPayload = {
    version: 1,
    motor: input.motor,
    summary: buildAnalizOzeti(input.motor),
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
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
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };
  const rows = (data ?? []) as NumerologyRecordListItem[];
  return { data: sortRecordsByNameTurkish(rows), error: null };
}

export async function getNumerologyAnalysisById(
  id: string,
  tenantId: string,
): Promise<{ data: NumerologyRecordRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Kayıt bulunamadı." };

  return { data: data as NumerologyRecordRow, error: null };
}

/** Kayıtlı analizin yalnızca `analysis_data.gorsel` alanını günceller. */
export async function updateNumerologyAnalysisGorsel(
  id: string,
  tenantId: string,
  gorselData: AnalysisGorselData,
  currentAnalysisData: unknown,
): Promise<{ error: string | null; analysis_data?: AnalysisDataPayload }> {
  const merged = mergeGorselIntoAnalysisData(currentAnalysisData, gorselData);
  if (!merged) {
    return { error: "Kayıt verisi güncellenemedi." };
  }

  const { error } = await supabase
    .from(TABLE)
    .update({ analysis_data: merged })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };
  return { error: null, analysis_data: merged };
}

/** Geriye dönük uyumluluk */
export type NumerologyAnalysisRow = NumerologyRecordRow;
