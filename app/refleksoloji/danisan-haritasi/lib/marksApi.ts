/**
 * Danışan İşaret Haritası — istemci API yardımcıları.
 *
 * Kimlik başlıkları `reflexUserHeaders()` (HTTPONLY H5 uyumlu: token yalnız varsa eklenir,
 * web'de HttpOnly cookie). tenant/danışan sahipliği SUNUCUDA doğrulanır; burada yalnız
 * istek + zaman aşımı + anlaşılır hata metni vardır.
 */
import { reflexUserHeaders } from "@/lib/refleksoloji/reflexStore";
import type { ClientMark, MarkInput, MarkPatch, MarkSession } from "@/lib/refleksoloji/markSurfaces";

const BASE = "/api/refleksoloji/marks";
const TIMEOUT_MS = 20_000;

export class MarksApiError extends Error {
  status: number;
  code: string | null;
  currentCount: number | null;
  constructor(message: string, status: number, code: string | null, currentCount: number | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.currentCount = currentCount;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = reflexUserHeaders();
  if (!headers) throw new MarksApiError("Oturum bulunamadı. Lütfen yeniden giriş yapın.", 401, null, null);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: { ...headers, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
  } catch {
    throw new MarksApiError(
      controller.signal.aborted
        ? "Sunucu yanıt vermedi. Bağlantınızı kontrol edip tekrar deneyin."
        : "Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.",
      0,
      null,
      null,
    );
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => null)) as
    | ({ ok?: boolean; error?: string; code?: string; current_count?: number } & Record<string, unknown>)
    | null;
  if (!res.ok || !json?.ok) {
    throw new MarksApiError(
      json?.error || "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
      res.status,
      typeof json?.code === "string" ? json.code : null,
      typeof json?.current_count === "number" ? json.current_count : null,
    );
  }
  return json as unknown as T;
}

export function newSourceUid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function listSessions(
  clientId: string,
): Promise<{ sessions: MarkSession[]; clientName: string | null }> {
  const r = await call<{ sessions: MarkSession[]; client?: { name?: string } }>(
    `/sessions?client_id=${encodeURIComponent(clientId)}`,
  );
  return { sessions: r.sessions ?? [], clientName: r.client?.name ?? null };
}

export async function createSession(input: {
  client_id: string;
  session_date: string;
  title: string | null;
  note: string | null;
}): Promise<MarkSession> {
  const r = await call<{ session: MarkSession }>(`/sessions`, {
    method: "POST",
    body: JSON.stringify({ ...input, source_uid: newSourceUid() }),
  });
  return r.session;
}

export async function getSession(id: string): Promise<{ session: MarkSession; marks: ClientMark[] }> {
  return call(`/sessions/${encodeURIComponent(id)}`);
}

export async function updateSession(
  id: string,
  patch: Partial<Pick<MarkSession, "session_date" | "title" | "note">>,
): Promise<MarkSession> {
  const r = await call<{ session: MarkSession }>(`/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return r.session;
}

export async function deleteSession(id: string, expectedMarks: number): Promise<void> {
  await call(`/sessions/${encodeURIComponent(id)}?expected_marks=${expectedMarks}`, { method: "DELETE" });
}

export async function addMark(sessionId: string, input: MarkInput, sourceUid: string): Promise<ClientMark> {
  const r = await call<{ mark: ClientMark }>(`/sessions/${encodeURIComponent(sessionId)}/marks`, {
    method: "POST",
    body: JSON.stringify({ ...input, source_uid: sourceUid }),
  });
  return r.mark;
}

export async function patchMark(markId: string, patch: MarkPatch): Promise<ClientMark> {
  const r = await call<{ mark: ClientMark }>(`/items/${encodeURIComponent(markId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return r.mark;
}

export async function deleteMark(markId: string): Promise<void> {
  await call(`/items/${encodeURIComponent(markId)}`, { method: "DELETE" });
}

export async function deleteSurfaceMarks(
  sessionId: string,
  filter: { surface: string; side: string } | null,
  expectedCount: number,
): Promise<number> {
  const r = await call<{ deleted: number }>(`/sessions/${encodeURIComponent(sessionId)}/marks`, {
    method: "DELETE",
    body: JSON.stringify({ ...(filter ?? {}), expected_count: expectedCount }),
  });
  return r.deleted;
}
