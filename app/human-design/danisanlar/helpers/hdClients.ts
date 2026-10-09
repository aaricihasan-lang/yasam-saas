// Sprint-3 — human_design_clients CRUD artık /api/hd/clients server route'u (service_role)
// üzerinden yapılır. Tarayıcıdaki anon Supabase erişimi KALDIRILDI (kimliksiz cross-tenant
// PII read/write riski). Auth deseni chartsClient.ts'i yansıtır (x-user-id + x-session-token).
//
// Dışa açık fonksiyon imzaları ve dönüş şekilleri DEĞİŞMEDİ → tüm Danışanlar/Harita/Rapor
// ekran bileşenleri dokunulmadan çalışmaya devam eder. HD engine/BodyGraph'a dokunmaz.

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type {
  HumanDesignClient,
  HumanDesignClientInsert,
} from "@/lib/human-design/types";

export type HdClientRow = HumanDesignClient;

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export async function listHdClients(): Promise<{
  rows: HdClientRow[];
  error: string | null;
}> {
  let res: Response;
  try {
    res = await fetch("/api/hd/clients", { method: "GET", headers: authHeaders() });
  } catch {
    return { rows: [], error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && Array.isArray(j.rows)) {
    return { rows: j.rows as HdClientRow[], error: null };
  }
  return { rows: [], error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

/** Listeden seçilen doğum yeri referansı (yerel kimlik | sunucu-imzalı ref); sunucu çözer. */
type LocationRefInput = { birth_location_ref?: string | null };

export async function insertHdClient(
  input: Omit<HumanDesignClientInsert, "tenant_id" | "user_id"> & LocationRefInput,
): Promise<{ id: string | null; error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/hd/clients", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(input),
    });
  } catch {
    return { id: null, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && typeof j.id === "string") {
    return { id: j.id, error: null };
  }
  return { id: null, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

export async function updateHdClient(
  id: string,
  input: Partial<Omit<HumanDesignClientInsert, "tenant_id" | "user_id">> & LocationRefInput,
  expectedUpdatedAt?: string | null,
): Promise<{ error: string | null; conflict?: boolean; updatedAt?: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/hd/clients", {
      method: "PATCH",
      headers: authHeaders(),
      // P2-9: yüklenen sürüm gönderilir → başka oturumdaki değişiklik ezilmez (409).
      body: JSON.stringify(expectedUpdatedAt ? { ...input, id, expected_updated_at: expectedUpdatedAt } : { ...input, id }),
    });
  } catch {
    return { error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true) return { error: null, updatedAt: typeof j.updated_at === "string" ? j.updated_at : null };
  return { error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`, conflict: res.status === 409 };
}

export type HdJourneyRef = { id: string; ad: string; soyad: string; dogum: string | null };

export async function getHdClient(
  id: string,
): Promise<{ row: HdClientRow | null; error: string | null; journey?: HdJourneyRef | null; suggestions?: HdJourneyRef[] }> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/clients?id=${encodeURIComponent(id)}`, {
      method: "GET",
      headers: authHeaders(),
    });
  } catch {
    return { row: null, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && j.row && typeof j.row === "object") {
    return {
      row: j.row as HdClientRow,
      error: null,
      // AŞAMA 3C: bağlı merkezî danışan + (bağlı değilse) yalnız ÖNERİLER — otomatik bağlama yok.
      journey: (j.journey as HdJourneyRef | null | undefined) ?? null,
      suggestions: Array.isArray(j.journey_suggestions) ? (j.journey_suggestions as HdJourneyRef[]) : [],
    };
  }
  return { row: null, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

/**
 * Profil silme sonrası kalmış yetim görselleri yeniden temizler (sunucu ilişkilerden türetir;
 * istemciden yol gönderilmez). Dönen sayılar bilgi amaçlıdır.
 */
export async function retryHdImageCleanup(): Promise<{ ok: boolean; removed: number; failed: number; error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/hd/clients/storage-cleanup", { method: "POST", headers: authHeaders() });
  } catch {
    return { ok: false, removed: 0, failed: 0, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const removed = typeof j.removed === "number" ? j.removed : 0;
  const failed = typeof j.failed === "number" ? j.failed : 0;
  if (res.ok && j.ok === true) return { ok: true, removed, failed, error: null };
  return { ok: false, removed, failed, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

export type HdClientDeleteScope ={ analyses: number; reports: number; journeyLinked: boolean };

/** Silme onayı öncesi KESİN kapsam (sunucu: yalnız profil + tenant kimliğiyle). */
export async function previewHdClientDelete(id: string): Promise<{ scope: HdClientDeleteScope | null; error: string | null }> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/clients?id=${encodeURIComponent(id)}&delete_preview=1`, { headers: authHeaders(), cache: "no-store" });
  } catch {
    return { scope: null, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && typeof j.analyses === "number" && typeof j.reports === "number") {
    return { scope: { analyses: j.analyses, reports: j.reports, journeyLinked: j.journeyLinked === true }, error: null };
  }
  return { scope: null, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

/**
 * Profil + bağlı Human Design analizleri + Word raporları silinir. `expect` onayda gösterilen
 * kapsamdır; sunucuda daha fazla kayıt varsa hiçbir şey silinmez (code: DELETE_SCOPE_CHANGED).
 */
export async function deleteHdClient(
  id: string,
  expect: { analyses: number; reports: number },
): Promise<{ error: string | null; code?: string; deletedAnalyses?: number; deletedReports?: number; warnings?: string[] }> {
  let res: Response;
  try {
    const qs = `id=${encodeURIComponent(id)}&expect_analyses=${expect.analyses}&expect_reports=${expect.reports}`;
    res = await fetch(`/api/hd/clients?${qs}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  } catch {
    return { error: "Ağ hatası: silme sonucu doğrulanamadı. Listeyi yenileyip kontrol edin; gerekirse tekrar deneyin." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true) {
    return {
      error: null,
      deletedAnalyses: typeof j.deletedAnalyses === "number" ? j.deletedAnalyses : 0,
      deletedReports: typeof j.deletedReports === "number" ? j.deletedReports : 0,
      warnings: Array.isArray(j.warnings) ? (j.warnings as string[]) : [],
    };
  }
  return { error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`, code: typeof j.code === "string" ? j.code : undefined };
}
