import { getSyncedTenantId, getSyncedYasamUser } from "@/lib/auth/sessionTenant";
import { numApi, numApiError } from "./numApiClient";
import { buildAnalizOzeti, type NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";
import {
  mergeGorselIntoAnalysisData,
  type AnalysisDataPayload,
  type AnalysisGorselData,
} from "../utils/analysisJson";

/** Diğer modüllerle aynı demo tenant — yasam_user yoksa kullanılır. */
export const NUMEROLOJI_TENANT_ID = "11111111-1111-1111-1111-111111111111";

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
  const analysis_data: AnalysisDataPayload = {
    version: 1,
    motor: input.motor,
    summary: buildAnalizOzeti(input.motor),
  };

  // tenant_id SUNUCUDA session'dan alınır; istemciden gönderilmez.
  const res = await numApi("/api/numeroloji/analyses", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.trim(),
      surname: input.surname.trim(),
      birth_date: input.birthDate.trim(),
      analysis_data,
    }),
  });
  const err = numApiError(res);
  if (err) return { error: err };
  const id = typeof res.json.id === "string" ? res.json.id : undefined;
  return { error: null, id };
}

// NOT: `tenantId` parametresi geriye dönük uyumluluk için korunur; tenant artık
// SUNUCUDA session'dan alınır. Admin (çapraz-tenant) için lib/admin/adminNumerologyApi kullanılır.
export async function listNumerologyAnalyses(_tenantId?: string): Promise<{
  data: NumerologyRecordListItem[] | null;
  error: string | null;
}> {
  void _tenantId;
  const res = await numApi("/api/numeroloji/analyses");
  const err = numApiError(res);
  if (err) return { data: null, error: err };
  const rows = (Array.isArray(res.json.rows) ? res.json.rows : []) as NumerologyRecordListItem[];
  return { data: sortRecordsByNameTurkish(rows), error: null };
}

export async function getNumerologyAnalysisById(
  id: string,
  _tenantId?: string,
): Promise<{ data: NumerologyRecordRow | null; error: string | null }> {
  void _tenantId;
  const res = await numApi(`/api/numeroloji/analyses?id=${encodeURIComponent(id)}`);
  if (res.status === 404) return { data: null, error: "Kayıt bulunamadı." };
  const err = numApiError(res);
  if (err) return { data: null, error: err };
  const row = res.json.row;
  if (!row) return { data: null, error: "Kayıt bulunamadı." };
  return { data: row as NumerologyRecordRow, error: null };
}

/** Kayıtlı analizin yalnızca `analysis_data.gorsel` alanını günceller. */
export async function updateNumerologyAnalysisGorsel(
  id: string,
  _tenantId: string,
  gorselData: AnalysisGorselData,
  currentAnalysisData: unknown,
): Promise<{ error: string | null; analysis_data?: AnalysisDataPayload }> {
  void _tenantId;
  const merged = mergeGorselIntoAnalysisData(currentAnalysisData, gorselData);
  if (!merged) {
    return { error: "Kayıt verisi güncellenemedi." };
  }

  const res = await numApi("/api/numeroloji/analyses", {
    method: "PATCH",
    body: JSON.stringify({ id, analysis_data: merged }),
  });
  const err = numApiError(res);
  if (err) return { error: err };
  return { error: null, analysis_data: merged };
}

/** Geriye dönük uyumluluk */
export type NumerologyAnalysisRow = NumerologyRecordRow;
