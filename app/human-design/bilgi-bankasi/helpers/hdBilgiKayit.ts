// Sprint-4 Aşama-1 — human_design_knowledge_records CRUD artık /api/hd/knowledge
// server route'u (service_role) üzerinden. Tarayıcıdaki anon Supabase erişimi
// KALDIRILDI (kimliksiz cross-tenant read/write/delete riski). Auth deseni
// chartsClient.ts'i yansıtır. Fonksiyon imzaları DEĞİŞMEDİ → Bilgi Bankası
// bileşenleri/UI dokunulmadan çalışır. HD engine/BodyGraph'a dokunmaz.

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type {
  HumanDesignKnowledgeRecord,
  HumanDesignKnowledgeRecordInsert,
} from "@/lib/human-design/types";

export type HdKnowledgeRow = HumanDesignKnowledgeRecord;

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export async function listHdKnowledgeRecords(): Promise<{
  rows: HdKnowledgeRow[];
  error: string | null;
}> {
  let res: Response;
  try {
    res = await fetch("/api/hd/knowledge", { method: "GET", headers: authHeaders() });
  } catch {
    return { rows: [], error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && Array.isArray(j.rows)) {
    return { rows: j.rows as HdKnowledgeRow[], error: null };
  }
  return { rows: [], error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

export async function insertHdKnowledgeRecord(
  input: Omit<HumanDesignKnowledgeRecordInsert, "tenant_id" | "user_id">,
): Promise<{ id: string | null; error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/hd/knowledge", {
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

export async function updateHdKnowledgeRecord(
  id: string,
  input: Partial<Omit<HumanDesignKnowledgeRecordInsert, "tenant_id" | "user_id">>,
): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/hd/knowledge", {
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

export async function deleteHdKnowledgeRecord(
  id: string,
): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/knowledge?id=${encodeURIComponent(id)}`, {
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

export async function deleteHdKnowledgeRecords(
  ids: string[],
): Promise<{ error: string | null }> {
  if (ids.length === 0) return { error: null };
  let res: Response;
  try {
    res = await fetch(`/api/hd/knowledge?ids=${encodeURIComponent(ids.join(","))}`, {
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
