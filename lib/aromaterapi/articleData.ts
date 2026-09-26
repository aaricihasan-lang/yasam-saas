import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

/**
 * Aromaterapi Bilgi Bankası (knowledge_articles) — uzmanın KENDİ notları için istemci
 * okuma sarmalayıcısı (client-safe). Header-tabanlı auth (x-user-id/x-session-token).
 */

export type ArticleItem = {
  id: string;
  category: string;
  sort_order: number;
  title: string;
  summary: string;
  content: string;
  source: string;
  is_active: boolean;
  updated_at: string;
};

export type ArticleListResult = {
  ok: boolean;
  rows: ArticleItem[];
  errorCode: string | null;
};

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export async function fetchArticleList(q: string, signal?: AbortSignal): Promise<ArticleListResult> {
  try {
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    const res = await fetch(`/api/aromaterapi/articles${qs}`, { headers: authHeaders(), signal });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || j.ok !== true) {
      return { ok: false, rows: [], errorCode: String(j.code ?? `HTTP_${res.status}`) };
    }
    return { ok: true, rows: (j.rows as ArticleItem[]) ?? [], errorCode: null };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, rows: [], errorCode: null };
    return { ok: false, rows: [], errorCode: "AROMA_READ_FAILED" };
  }
}
