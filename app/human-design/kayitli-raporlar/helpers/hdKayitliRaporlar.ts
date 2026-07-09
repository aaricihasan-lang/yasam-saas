// Sprint-4 Aşama-2 — Kayıtlı Raporlar (human_design_reports) listeleme/okuma/silme artık
// /api/hd/reports server route'u (service_role) üzerinden. Danışan join sunucuda yapılır.
// Tarayıcıdaki anon Supabase erişimi KALDIRILDI. İmzalar DEĞİŞMEDİ → ekran/bileşenler
// dokunulmadan çalışır. HD engine/BodyGraph'a dokunmaz.

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { HumanDesignReport, HumanDesignClient } from "@/lib/human-design/types";

export type HdReportWithClient = HumanDesignReport & {
  client: Pick<HumanDesignClient, "id" | "name"> | null;
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

export async function listReportsWithClients(): Promise<{
  rows: HdReportWithClient[];
  error: string | null;
}> {
  let res: Response;
  try {
    res = await fetch("/api/hd/reports", { method: "GET", headers: authHeaders() });
  } catch {
    return { rows: [], error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && Array.isArray(j.rows)) {
    return { rows: j.rows as HdReportWithClient[], error: null };
  }
  return { rows: [], error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

export async function getReportById(id: string): Promise<{
  row: HdReportWithClient | null;
  error: string | null;
}> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/reports?id=${encodeURIComponent(id)}`, {
      method: "GET",
      headers: authHeaders(),
    });
  } catch {
    return { row: null, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && j.row && typeof j.row === "object") {
    return { row: j.row as HdReportWithClient, error: null };
  }
  return { row: null, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

export async function deleteReport(id: string): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/reports?id=${encodeURIComponent(id)}`, {
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
