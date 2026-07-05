/**
 * Admin numeroloji API — istemci yardımcıları (çapraz-tenant görüntüleme + veri paylaşımı).
 * Doğrudan Supabase (anon) YERİNE adminGuard'lı server route'lara gider.
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type {
  NumerologyRecordRow,
  NumerologyRecordListItem,
} from "@/app/numeroloji/helpers/numerolojiKayit";

function adminHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-admin-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

async function adminApi(
  path: string,
  opts: RequestInit = {},
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...opts,
      headers: { ...adminHeaders(), ...((opts.headers as Record<string, string>) ?? {}) },
    });
  } catch {
    return { ok: false, status: 0, json: { error: "Bağlantı hatası." } };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok && json.ok !== false, status: res.status, json };
}

function errMsg(r: { status: number; json: Record<string, unknown> }): string {
  const e = r.json.error;
  return typeof e === "string" && e.trim() ? e : `İşlem başarısız (HTTP ${r.status}).`;
}

export async function adminListNumerologyAnalyses(
  tenantId: string,
): Promise<{ data: NumerologyRecordListItem[] | null; error: string | null }> {
  const res = await adminApi(`/api/admin/numeroloji/records?tenantId=${encodeURIComponent(tenantId)}`);
  if (!res.ok) return { data: null, error: errMsg(res) };
  return { data: (Array.isArray(res.json.rows) ? res.json.rows : []) as NumerologyRecordListItem[], error: null };
}

export async function adminGetNumerologyRecordById(
  id: string,
  tenantId: string,
): Promise<{ data: NumerologyRecordRow | null; error: string | null }> {
  const res = await adminApi(
    `/api/admin/numeroloji/records?tenantId=${encodeURIComponent(tenantId)}&id=${encodeURIComponent(id)}`,
  );
  if (res.status === 404) return { data: null, error: "Kayıt bulunamadı." };
  if (!res.ok) return { data: null, error: errMsg(res) };
  const row = res.json.row;
  if (!row) return { data: null, error: "Kayıt bulunamadı." };
  return { data: row as NumerologyRecordRow, error: null };
}

export async function adminTransferNumerology(
  table: "numerology_knowledge_records" | "numerology_stone_assignments",
  sourceTenantId: string,
  targetTenantId: string,
  filterIds?: string[],
): Promise<{ inserted: number; error: string | null }> {
  const res = await adminApi("/api/admin/numeroloji/transfer", {
    method: "POST",
    body: JSON.stringify({ table, sourceTenantId, targetTenantId, filterIds }),
  });
  if (!res.ok) return { inserted: 0, error: errMsg(res) };
  return { inserted: Number(res.json.inserted ?? 0), error: null };
}
