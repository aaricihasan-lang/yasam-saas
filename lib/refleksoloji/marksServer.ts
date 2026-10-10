import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserGuardOk } from "@/lib/auth/userGuard";
import { isUuid } from "@/lib/refleksoloji/uuid";
import type { ClientMark, MarkSession } from "@/lib/refleksoloji/markSurfaces";

/**
 * Refleksoloji DANIŞAN İŞARET HARİTASI — sunucu ortak yardımcıları.
 *
 * Tüm sorgular `tenant_id = guard.tenantId` ile kapsamlanır (body'den tenant/client
 * sahipliği ASLA alınmaz). Seans → danışan bağı `requireClientInTenant` ile, nokta → seans
 * bağı `loadSessionInTenant` ile sunucuda doğrulanır; DB composite FK'leri ikinci kilittir.
 */

export type OkGuard = UserGuardOk;
export { isUuid };

export const SESSION_COLUMNS =
  "id, client_id, session_date, title, note, created_at, updated_at";
export const MARK_COLUMNS =
  "id, session_id, surface, side, x, y, size, intensity, note, created_at, updated_at";

const UID_RE = /^[A-Za-z0-9_-]{8,80}$/;

/** İstemci idempotency anahtarı (opsiyonel). Geçersizse yok sayılır. */
export function cleanSourceUid(v: unknown): string | null {
  return typeof v === "string" && UID_RE.test(v) ? v : null;
}

export function jsonError(status: number, error: string, code?: string): NextResponse {
  return NextResponse.json({ ok: false, error, ...(code ? { code } : {}) }, { status, headers: NO_STORE });
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Migration henüz uygulanmadı mı? (tablo yok) */
export function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}

export function marksNotReady(): NextResponse {
  return jsonError(503, "Danışan işaret haritası henüz etkin değil.", "MARKS_NOT_READY");
}


export async function readJsonBody(req: NextRequest, maxBytes = 16 * 1024): Promise<{ ok: true; body: unknown } | { ok: false; res: NextResponse }> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, res: jsonError(400, "Geçersiz istek gövdesi.") };
  }
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return { ok: false, res: jsonError(413, "İstek çok büyük.") };
  }
  if (!raw) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, res: jsonError(400, "Geçersiz istek gövdesi.") };
  }
}

type SessionRow = Omit<MarkSession, "mark_count">;

export async function loadSessionInTenant(
  db: SupabaseClient,
  tenantId: string,
  sessionId: string,
): Promise<{ row: SessionRow | null; error: unknown }> {
  if (!isUuid(sessionId)) return { row: null, error: null };
  const { data, error } = await db
    .from("reflexology_mark_sessions")
    .select(SESSION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", sessionId)
    .maybeSingle();
  return { row: (data as SessionRow | null) ?? null, error };
}

export async function countSessionMarks(
  db: SupabaseClient,
  tenantId: string,
  sessionId: string,
  filter?: { surface?: string; side?: string },
): Promise<{ count: number | null; error: unknown }> {
  let q = db
    .from("reflexology_marks")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId);
  if (filter?.surface) q = q.eq("surface", filter.surface);
  if (filter?.side) q = q.eq("side", filter.side);
  const { count, error } = await q;
  return { count: typeof count === "number" ? count : null, error };
}

export function toMark(row: Record<string, unknown>): ClientMark {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    surface: row.surface as ClientMark["surface"],
    side: row.side as ClientMark["side"],
    x: Number(row.x),
    y: Number(row.y),
    size: row.size as ClientMark["size"],
    intensity: (row.intensity as ClientMark["intensity"]) ?? null,
    note: (row.note as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Postgres CHECK/trigger ihlali (ör. 400 nokta sınırı) → kullanıcıya anlamlı 422. */
export function isCheckViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "23514";
}
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "23505";
}
export function isFkViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "23503";
}
