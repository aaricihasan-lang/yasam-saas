import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getConceptById, listConceptLabels } from "@/lib/yebs/service/concepts";
import { getSourceById } from "@/lib/yebs/service/sources";
import { pickDisplayTitle } from "./dto";

/**
 * YEBS vitrini read route ortak yardımcıları (server-only).
 *
 * Tüm `/api/yebs/*` GET route'ları verifyAdminRequest ile korunur; bu dosya yalnız
 * query-param arındırma, UUID doğrulama ve (JOIN'siz backend nedeniyle) küçük
 * başlık çözümleme yardımcıları içerir. Mutation YOK.
 */

const DEFAULT_LIMIT = 24;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const MAX_Q_LEN = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string | null | undefined): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** PostgREST filtre-özel karakterlerini arındırır (trim + 100 + `,()*%` strip). */
export function sanitizeQ(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const cleaned = raw.replace(/[,()*%]/g, "").trim().slice(0, MAX_Q_LEN);
  return cleaned.length > 0 ? cleaned : undefined;
}

export type ListParams =
  | { ok: true; limit: number; offset: number; q: string | undefined }
  | { ok: false; code: "YEBS_INVALID_LIMIT" | "YEBS_INVALID_OFFSET"; message: string };

export function parseListParams(sp: URLSearchParams): ListParams {
  let limit = DEFAULT_LIMIT;
  const rawLimit = sp.get("limit");
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < MIN_LIMIT || n > MAX_LIMIT) {
      return {
        ok: false,
        code: "YEBS_INVALID_LIMIT",
        message: `Geçersiz limit (1-${MAX_LIMIT} arası tam sayı olmalıdır).`,
      };
    }
    limit = n;
  }

  let offset = 0;
  const rawOffset = sp.get("offset");
  if (rawOffset !== null) {
    const n = Number(rawOffset);
    if (!Number.isInteger(n) || n < 0) {
      return {
        ok: false,
        code: "YEBS_INVALID_OFFSET",
        message: "Geçersiz offset (0 veya pozitif tam sayı olmalıdır).",
      };
    }
    offset = n;
  }

  return { ok: true, limit, offset, q: sanitizeQ(sp.get("q")) };
}

/**
 * Bir concept'in vitrin başlığını çözer (backend JOIN vermediği için ayrı okuma).
 * Concept yoksa null. Etiket okuması başarısızsa slug fallback.
 */
export async function resolveConceptTitle(
  db: SupabaseClient,
  conceptId: string,
): Promise<string | null> {
  const c = await getConceptById(db, conceptId);
  if (!c.ok) return null;
  const labels = await listConceptLabels(db, conceptId);
  const rows = labels.ok ? labels.rows : [];
  return pickDisplayTitle(rows, c.row.slug);
}

/** Bir kaynağın başlığını çözer (evidence kartında kaynak adı için). */
export async function resolveSourceTitle(
  db: SupabaseClient,
  sourceId: string,
): Promise<string> {
  const s = await getSourceById(db, sourceId);
  return s.ok ? s.row.title : "Kaynak";
}
