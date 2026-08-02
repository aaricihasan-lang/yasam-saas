/**
 * BF-13 — Arama isteği doğrulama + karar (SAF; test edilebilir).
 *
 * DEĞİŞMEZ: tenant/client BURADA OKUNMAZ. Yalnız q/modules/allowShared/limit
 * ayrıştırılır; body'deki tenantId/clientId gibi alanlar TAMAMEN yok sayılır
 * (tenant yalnız server session'dan çözülür).
 */
import { YH_CANDIDATE_LIMIT, type YhFlags, type YhSourceModule } from "@/lib/yasam-hafizasi/config";
import { YH_MAX_QUERY_LENGTH } from "@/lib/yasam-hafizasi/search/queryPipeline";
import { isYhSourceModule } from "./moduleLabels";

export interface ParsedSearchRequest {
  q: string;
  modules?: YhSourceModule[];
  allowShared: boolean;
  limit: number;
}

export type ParseSearchResult =
  | { ok: true; value: ParsedSearchRequest }
  | { ok: false; code: string };

export function parseSearchRequest(body: unknown): ParseSearchResult {
  if (!body || typeof body !== "object") return { ok: false, code: "YH_INVALID_BODY" };
  const b = body as Record<string, unknown>;

  const rawQ = b.q;
  if (rawQ !== undefined && typeof rawQ !== "string") return { ok: false, code: "YH_INVALID_BODY" };
  const q = typeof rawQ === "string" ? rawQ.trim() : "";
  if (q.length > YH_MAX_QUERY_LENGTH) return { ok: false, code: "YH_QUERY_TOO_LONG" };

  let modules: YhSourceModule[] | undefined;
  if (b.modules !== undefined) {
    if (!Array.isArray(b.modules) || !b.modules.every(isYhSourceModule)) {
      return { ok: false, code: "YH_INVALID_MODULES" };
    }
    modules = b.modules as YhSourceModule[];
  }

  let limit = YH_CANDIDATE_LIMIT;
  if (b.limit !== undefined) {
    const n = Number(b.limit);
    if (!Number.isInteger(n) || n <= 0 || n > YH_CANDIDATE_LIMIT) {
      return { ok: false, code: "YH_INVALID_LIMIT" };
    }
    limit = n;
  }

  if (b.allowShared !== undefined && typeof b.allowShared !== "boolean") {
    return { ok: false, code: "YH_INVALID_BODY" };
  }
  const allowShared = b.allowShared === true;

  return { ok: true, value: { q, ...(modules ? { modules } : {}), allowShared, limit } };
}

/** Demo veya kapalı flag → arama yapılmaz (güvenli boş sonuç). */
export function isSearchDisabled(flags: YhFlags, isDemo: boolean): boolean {
  return isDemo || !flags.yh_enabled || !flags.yh_hizli;
}

/** yh_shared kapalıysa istek ne olursa olsun shared KAPALI (server clamp). */
export function resolveAllowShared(flagShared: boolean, requested: boolean): boolean {
  return flagShared && requested;
}
