/**
 * BF-14 Paket 1 — Client arama isteği doğrulama (SAF; test edilebilir).
 * DEĞİŞMEZ: tenant/client BURADA OKUNMAZ (tenant session'dan, client URL'den).
 */
import { YH_MAX_QUERY_LENGTH } from "@/lib/yasam-hafizasi/search/queryPipeline";
import { isClientSourceModule, type ClientSourceModule } from "./clientSources";

export interface ParsedClientSearchRequest {
  q: string;
  modules?: ClientSourceModule[];
  dateFrom?: string;
  dateTo?: string;
  limit: number;
}

export type ParseClientSearchResult =
  | { ok: true; value: ParsedClientSearchRequest }
  | { ok: false; code: string };

const CLIENT_SEARCH_LIMIT_MAX = 150;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

function isValidDate(v: unknown): v is string {
  return typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
}

export function parseClientSearchRequest(body: unknown): ParseClientSearchResult {
  if (!body || typeof body !== "object") return { ok: false, code: "YH_INVALID_BODY" };
  const b = body as Record<string, unknown>;

  const rawQ = b.q;
  if (rawQ !== undefined && typeof rawQ !== "string") return { ok: false, code: "YH_INVALID_BODY" };
  const q = typeof rawQ === "string" ? rawQ.trim() : "";
  if (q.length > YH_MAX_QUERY_LENGTH) return { ok: false, code: "YH_QUERY_TOO_LONG" };

  let modules: ClientSourceModule[] | undefined;
  if (b.modules !== undefined) {
    if (!Array.isArray(b.modules) || !b.modules.every(isClientSourceModule)) {
      return { ok: false, code: "YH_INVALID_MODULES" };
    }
    modules = b.modules as ClientSourceModule[];
  }

  let dateFrom: string | undefined;
  if (b.dateFrom !== undefined) {
    if (!isValidDate(b.dateFrom)) return { ok: false, code: "YH_INVALID_DATE" };
    dateFrom = b.dateFrom;
  }
  let dateTo: string | undefined;
  if (b.dateTo !== undefined) {
    if (!isValidDate(b.dateTo)) return { ok: false, code: "YH_INVALID_DATE" };
    dateTo = b.dateTo;
  }

  let limit = CLIENT_SEARCH_LIMIT_MAX;
  if (b.limit !== undefined) {
    const n = Number(b.limit);
    if (!Number.isInteger(n) || n <= 0 || n > CLIENT_SEARCH_LIMIT_MAX) {
      return { ok: false, code: "YH_INVALID_LIMIT" };
    }
    limit = n;
  }

  return {
    ok: true,
    value: { q, ...(modules ? { modules } : {}), ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}), limit },
  };
}

/** occurred_at tarih penceresi filtresi (app-layer; RPC'ye tarih parametresi eklemez). */
export function withinDateWindow(occurredAt: string | null, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!occurredAt) return false;
  const t = Date.parse(occurredAt);
  if (Number.isNaN(t)) return false;
  if (from && t < Date.parse(from)) return false;
  if (to && t > Date.parse(to) + 24 * 60 * 60 * 1000 - 1) return false; // gün-sonu dahil
  return true;
}
