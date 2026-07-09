import { supabase } from "@/lib/supabase";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { HumanDesignReport, HumanDesignClient } from "@/lib/human-design/types";

export type HdReportWithClient = HumanDesignReport & {
  client: Pick<HumanDesignClient, "id" | "name"> | null;
};

// Sprint-3 Aşama 3: human_design_clients okuması artık /api/hd/clients server route'undan
// (service_role). Anon Supabase erişimi KALDIRILDI. human_design_reports (kapsam dışı tablo)
// hâlâ supabase üzerinden okunur/silinir.
function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

type ClientMini = Pick<HumanDesignClient, "id" | "name">;

async function fetchAllClients(): Promise<{ list: ClientMini[]; error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/hd/clients", { method: "GET", headers: authHeaders() });
  } catch {
    return { list: [], error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && Array.isArray(j.rows)) {
    return {
      list: (j.rows as HumanDesignClient[]).map((c) => ({ id: c.id, name: c.name })),
      error: null,
    };
  }
  return { list: [], error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

async function fetchClientById(id: string): Promise<ClientMini | null> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/clients?id=${encodeURIComponent(id)}`, {
      method: "GET",
      headers: authHeaders(),
    });
  } catch {
    return null;
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && j.row && typeof j.row === "object") {
    const c = j.row as HumanDesignClient;
    return { id: c.id, name: c.name };
  }
  return null;
}

export async function listReportsWithClients(): Promise<{
  rows: HdReportWithClient[];
  error: string | null;
}> {
  const tenantId = await getSyncedTenantId();
  if (!tenantId) return { rows: [], error: "Aktif kullanıcı bulunamadı." };

  const [reportsRes, clientsRes] = await Promise.all([
    supabase
      .from("human_design_reports")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    fetchAllClients(),
  ]);

  if (reportsRes.error) return { rows: [], error: reportsRes.error.message };
  if (clientsRes.error) return { rows: [], error: clientsRes.error };

  const clientMap = new Map(clientsRes.list.map((c) => [c.id, c]));

  const rows: HdReportWithClient[] = (reportsRes.data ?? []).map((r) => ({
    ...(r as HumanDesignReport),
    client: r.client_id ? (clientMap.get(r.client_id as string) ?? null) : null,
  }));

  return { rows, error: null };
}

export async function getReportById(id: string): Promise<{
  row: HdReportWithClient | null;
  error: string | null;
}> {
  const tenantId = await getSyncedTenantId();
  if (!tenantId) return { row: null, error: "Aktif kullanıcı bulunamadı." };

  const { data: reportData, error: reportErr } = await supabase
    .from("human_design_reports")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (reportErr || !reportData) {
    return { row: null, error: reportErr?.message ?? "Rapor bulunamadı." };
  }

  const report = reportData as HumanDesignReport;

  if (!report.client_id) {
    return { row: { ...report, client: null }, error: null };
  }

  const client = await fetchClientById(report.client_id);

  return {
    row: { ...report, client: client ?? null },
    error: null,
  };
}

export async function deleteReport(id: string): Promise<{ error: string | null }> {
  const tenantId = await getSyncedTenantId();
  if (!tenantId) return { error: "Aktif kullanıcı bulunamadı." };

  const { error } = await supabase
    .from("human_design_reports")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  return { error: error?.message ?? null };
}
