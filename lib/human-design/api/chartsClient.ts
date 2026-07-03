// FAZ 9C — Hesaplanmış HD haritasını kaydetme (istemci fetch yardımcısı).
//
// POST /api/hd/charts'a auth header'larıyla (x-user-id + x-session-token) istek atar.
// Yalnız INPUT gönderilir — sunucu recompute-on-save yapar; computed_result GÖNDERİLMEZ
// (gönderilse de 9B tarafında yok sayılır). computeClient.ts'in auth desenini yansıtır
// (o dosya DEĞİŞMEZ). Engine/compute/BodyGraph'a dokunmaz.

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { HdChartResult } from "../engine/contract";

export type SaveChartInput = { date: string; time: string; timezone: string };

export type SaveChartResult =
  | { ok: true; id: string }
  | { ok: false; status: number; code?: string; error: string };

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

/** Hesaplanmış haritayı sunucuya kaydeder (kişisel; client_id/location_id gönderilmez). */
export async function saveComputedChart(
  input: SaveChartInput,
  opts: { birthPlace?: string } = {},
): Promise<SaveChartResult> {
  const body: Record<string, unknown> = { input };
  const place = opts.birthPlace?.trim();
  if (place) body.birth_place = place;

  let res: Response;
  try {
    res = await fetch("/api/hd/charts", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: "Ağ hatası. Bağlantını kontrol et." };
  }

  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (res.ok && j.ok === true && typeof j.id === "string") {
    return { ok: true, id: j.id };
  }
  return {
    ok: false,
    status: res.status,
    code: typeof j.code === "string" ? j.code : undefined,
    error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
  };
}

// -------------------------------------------------------
// FAZ 9D — hesaplanmış harita listeleme / tekil okuma / silme (9B GET/DELETE)
// -------------------------------------------------------

export type ComputedChartListRow = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  birth_date: string | null;
  birth_place: string | null;
  timezone: string | null;
  type_code: string | null;
  authority_code: string | null;
  profile_code: string | null;
  definition_code: string | null;
  source: string | null;
  created_at: string;
};

export type ComputedChartDetail = {
  id: string;
  client_name: string | null;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  timezone: string | null;
  created_at: string;
  computed_result: HdChartResult | null;
};

export async function listComputedCharts(): Promise<{ rows: ComputedChartListRow[]; error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/hd/charts", { method: "GET", headers: authHeaders() });
  } catch {
    return { rows: [], error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && Array.isArray(j.data)) {
    return { rows: j.data as ComputedChartListRow[], error: null };
  }
  return { rows: [], error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

export async function getComputedChart(
  id: string,
): Promise<{ row: ComputedChartDetail | null; error: string | null }> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/charts?id=${encodeURIComponent(id)}`, { method: "GET", headers: authHeaders() });
  } catch {
    return { row: null, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && j.data && typeof j.data === "object") {
    return { row: j.data as ComputedChartDetail, error: null };
  }
  return { row: null, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

export async function deleteComputedChart(id: string): Promise<{ ok: boolean; error: string | null }> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/charts?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
  } catch {
    return { ok: false, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true) return { ok: true, error: null };
  return { ok: false, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}
