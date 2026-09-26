import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

/**
 * Aromaterapi Bilgi Bankası (knowledge_articles) YAZMA istemci sarmalayıcısı (client-safe).
 * Hafif yazma deseni; tenant/id gövdeye ASLA konmaz — server guard çözer.
 */

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export type ArticleBody = {
  title: string;
  category?: string;
  summary?: string;
  content?: string;
  source?: string;
};

export type ArticleWriteResult = { ok: boolean; id: string | null; errorCode: string | null };

const EMPTY: ArticleWriteResult = { ok: false, id: null, errorCode: null };

async function writeRequest(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
  signal?: AbortSignal,
): Promise<ArticleWriteResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && j.ok === true) return { ok: true, id: (j.id as string) ?? null, errorCode: null };
    return { ...EMPTY, errorCode: typeof j.code === "string" ? j.code : `HTTP_${res.status}` };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return EMPTY;
    return { ...EMPTY, errorCode: "AROMA_WRITE_FAILED" };
  }
}

export function createArticle(body: ArticleBody, signal?: AbortSignal) {
  return writeRequest("/api/aromaterapi/articles", "POST", body, signal);
}

export function updateArticle(id: string, body: Partial<ArticleBody>, signal?: AbortSignal) {
  return writeRequest(`/api/aromaterapi/articles/${id}`, "PATCH", body, signal);
}

export function deleteArticle(id: string, signal?: AbortSignal) {
  return writeRequest(`/api/aromaterapi/articles/${id}`, "DELETE", undefined, signal);
}

const ARTICLE_MESSAGES: Record<string, string> = {
  AROMA_WRITE_INVALID_BODY: "Girdiğiniz bilgiler geçersiz. Başlık zorunludur.",
  AROMA_WRITE_PAYLOAD_TOO_LARGE: "İçerik çok büyük; lütfen kısaltın.",
  AROMA_NOT_FOUND: "Kayıt bulunamadı veya erişim izniniz yok.",
  AROMA_WRITE_FAILED: "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
};

export function articleMessageForCode(code: string | null): string {
  if (!code) return "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
  return ARTICLE_MESSAGES[code] ?? "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
}
