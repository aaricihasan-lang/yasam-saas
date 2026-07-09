// Sprint-3 Aşama 2 — Kayıtlı Haritalar (manuel/legacy) listeleme + silme artık
// /api/hd/charts?scope=manual server route'u (service_role) üzerinden. Tarayıcıdaki
// anon Supabase erişimi KALDIRILDI. Danışan join sunucuda yapılır. İmzalar DEĞİŞMEDİ.
// HD engine/compute/BodyGraph'a dokunmaz — yalnız veri erişimi.

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { HumanDesignChart, HumanDesignClient } from "@/lib/human-design/types";

export type HdChartWithClient = HumanDesignChart & {
  client: Pick<HumanDesignClient, "id" | "name" | "birth_date" | "birth_time" | "birth_place" | "external_chart_url"> | null;
};

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export async function listChartsWithClients(): Promise<{
  rows: HdChartWithClient[];
  error: string | null;
}> {
  let res: Response;
  try {
    res = await fetch("/api/hd/charts?scope=manual", { method: "GET", headers: authHeaders() });
  } catch {
    return { rows: [], error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && Array.isArray(j.rows)) {
    return { rows: j.rows as HdChartWithClient[], error: null };
  }
  return { rows: [], error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

export async function deleteHdChart(id: string): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/charts?scope=manual&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  } catch {
    return { error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true) return { error: null };
  return { error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}
