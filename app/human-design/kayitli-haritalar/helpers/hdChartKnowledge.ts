"use client";

/**
 * "Kişinin Human Design Bilgileri" — client salt-okuma fetch'i.
 * /api/hd/bilgi-bankasi?resource=chart-knowledge (requireModuleAccess) hattına
 * x-user-id + x-session-token ile GET atar. YALNIZ okuma; mutation YOK.
 * service_role tarayıcıya gelmez. Auth deseni hdCanonicalRead.ts ile aynıdır.
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { HdPersonalKnowledge } from "@/lib/human-design/knowledge/personalKnowledge";

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return { "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) };
}

export type ChartKnowledgeResult =
  | { ok: true; knowledge: HdPersonalKnowledge }
  | { ok: false; locked: boolean; notFound: boolean; error: string };

export async function fetchChartKnowledge(chartId: string): Promise<ChartKnowledgeResult> {
  let res: Response;
  try {
    res = await fetch(
      `/api/hd/bilgi-bankasi?resource=chart-knowledge&chart_id=${encodeURIComponent(chartId)}`,
      { method: "GET", headers: authHeaders(), cache: "no-store" },
    );
  } catch {
    return { ok: false, locked: false, notFound: false, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && j.knowledge && typeof j.knowledge === "object") {
    return { ok: true, knowledge: j.knowledge as HdPersonalKnowledge };
  }
  return {
    ok: false,
    locked: res.status === 401 || res.status === 403,
    notFound: res.status === 404,
    error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
  };
}
