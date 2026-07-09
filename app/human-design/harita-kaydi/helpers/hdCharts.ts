// Sprint-3 Aşama 2 — manuel HD harita CRUD artık /api/hd/charts?scope=manual
// server route'u (service_role) üzerinden. Tarayıcıdaki anon Supabase erişimi
// KALDIRILDI (kimliksiz cross-tenant PII read/write riski). Auth deseni
// chartsClient.ts'i yansıtır. Fonksiyon imzaları DEĞİŞMEDİ.
// HD engine/compute/BodyGraph/SVG'ye dokunmaz — yalnız veri erişimi.

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { HumanDesignChart } from "@/lib/human-design/types";

export type HdChartRow = HumanDesignChart;

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export async function loadClientChart(clientId: string): Promise<{
  row: HdChartRow | null;
  error: string | null;
}> {
  let res: Response;
  try {
    res = await fetch(
      `/api/hd/charts?scope=manual&client_id=${encodeURIComponent(clientId)}`,
      { method: "GET", headers: authHeaders() },
    );
  } catch {
    return { row: null, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true) {
    return { row: (j.row as HdChartRow | null) ?? null, error: null };
  }
  return { row: null, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

type ChartPayload = {
  type_code: string | null;
  authority_code: string | null;
  profile_code: string | null;
  definition_code: string | null;
  active_centers: string[];
  open_centers: string[];
  gates: number[];
  channels: string[];
  notes: string | null;
};

export async function saveClientChart(
  clientId: string,
  values: ChartPayload,
): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/hd/charts?scope=manual", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ client_id: clientId, ...values }),
    });
  } catch {
    return { error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true) return { error: null };
  return { error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}
