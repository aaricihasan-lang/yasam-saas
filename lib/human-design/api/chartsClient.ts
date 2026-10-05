// FAZ 9C — Hesaplanmış HD haritasını kaydetme (istemci fetch yardımcısı).
//
// POST /api/hd/charts'a auth header'larıyla (x-user-id + x-session-token) istek atar.
// Yalnız INPUT gönderilir — sunucu recompute-on-save yapar; computed_result GÖNDERİLMEZ
// (gönderilse de 9B tarafında yok sayılır). computeClient.ts'in auth desenini yansıtır
// (o dosya DEĞİŞMEZ). Engine/compute/BodyGraph'a dokunmaz.

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { HdComputedChart } from "../chart/computedChart";

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
  location_id?: string | null;
  engine_version?: string | null;
  created_at: string;
};

export type ComputedChartDetail = {
  id: string;
  client_id?: string | null;
  client_name: string | null;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  timezone: string | null;
  created_at: string;
  /** Eski kayıtlar: dahili motor çıktısı; RoxyAPI kayıtları: genişletilmiş sözleşme. */
  computed_result: HdComputedChart | null;
  // Skaler kolonlar (Roxy kayıtlarında uygulama kodları; eski kayıtlarda motor RAW değerleri).
  type_code?: string | null;
  authority_code?: string | null;
  profile_code?: string | null;
  definition_code?: string | null;
  active_centers?: string[] | null;
  open_centers?: string[] | null;
  gates?: number[] | null;
  channels?: string[] | null;
  provider?: string | null;
  engine_version?: string | null;
  location_id?: string | null;
};

export async function listComputedCharts(
  opts: { clientId?: string } = {},
): Promise<{ rows: ComputedChartListRow[]; error: string | null }> {
  const qs = opts.clientId ? `?client_id=${encodeURIComponent(opts.clientId)}` : "";
  let res: Response;
  try {
    res = await fetch(`/api/hd/charts${qs}`, { method: "GET", headers: authHeaders() });
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

// -------------------------------------------------------
// FAZ 1 — RoxyAPI otomatik hesaplama (POST /api/hd/charts/roxy)
// Yalnız kimlikler gönderilir: doğum tarihi/saati danışan kaydından, tz/koordinat sunucuda çözülür.
// -------------------------------------------------------

export type RoxyComputeResult =
  | { ok: true; id: string; reused: boolean }
  | { ok: false; status: number; code?: string; error: string };

export async function computeRoxyChart(clientId: string, locationId: string): Promise<RoxyComputeResult> {
  let res: Response;
  try {
    res = await fetch("/api/hd/charts/roxy", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ client_id: clientId, location_id: locationId }),
    });
  } catch {
    return { ok: false, status: 0, error: "Ağ hatası. Bağlantınızı kontrol edin." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && typeof j.id === "string") {
    return { ok: true, id: j.id, reused: j.reused === true };
  }
  return {
    ok: false,
    status: res.status,
    code: typeof j.code === "string" ? j.code : undefined,
    error: typeof j.error === "string" ? j.error : `Hesaplama yapılamadı (HTTP ${res.status}).`,
  };
}
