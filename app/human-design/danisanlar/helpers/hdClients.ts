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

export async function insertHdClient(
  input: Omit<HumanDesignClientInsert, "tenant_id" | "user_id">,
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
  input: Partial<Omit<HumanDesignClientInsert, "tenant_id" | "user_id">>,
): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/hd/clients", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ ...input, id }),
    });
  } catch {
    return { error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true) return { error: null };
  return { error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

export async function getHdClient(
  id: string,
): Promise<{ row: HdClientRow | null; error: string | null }> {
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
    return { row: j.row as HdClientRow, error: null };
  }
  return { row: null, error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

export async function deleteHdClient(
  id: string,
): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/clients?id=${encodeURIComponent(id)}`, {
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
