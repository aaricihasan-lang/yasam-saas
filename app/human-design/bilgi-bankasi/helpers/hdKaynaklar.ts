// Bilgi Bankası dinamik KAYNAK sekmeleri — /api/hd/knowledge-sources (service_role) istemci sarmalayıcısı.
// Auth deseni hdBilgiKayit.ts'i yansıtır. Kaynaklar varsayılan rapora AKMAZ.

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type {
  HumanDesignKnowledgeSource,
  HumanDesignKnowledgeSourceInsert,
} from "@/lib/human-design/types";

export type HdSourceRow = HumanDesignKnowledgeSource;
export type HdSourceEditable = Partial<
  Omit<HumanDesignKnowledgeSourceInsert, "tenant_id" | "user_id" | "record_id">
>;

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export async function listHdSources(
  recordId: string,
): Promise<{ rows: HdSourceRow[]; error: string | null }> {
  let res: Response;
  try {
    res = await fetch(
      `/api/hd/knowledge-sources?recordId=${encodeURIComponent(recordId)}`,
      { method: "GET", headers: authHeaders() },
    );
  } catch {
    return { rows: [], error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && Array.isArray(j.rows)) {
    return { rows: j.rows as HdSourceRow[], error: null };
  }
  return { rows: [], error: typeof j.error === "string" ? j.error : `HTTP ${res.status}` };
}

export async function insertHdSource(
  recordId: string,
  input: HdSourceEditable,
): Promise<{ id: string | null; error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/hd/knowledge-sources", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...input, recordId }),
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

export async function updateHdSource(
  id: string,
  input: HdSourceEditable,
): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/hd/knowledge-sources", {
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

export async function deleteHdSource(id: string): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/knowledge-sources?id=${encodeURIComponent(id)}`, {
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
