/**
 * Aromaterapi V2 — C3C okuma parametre doğrulaması.
 *
 * SAF (server-only DEĞİL, Supabase/secret YOK): yalnız query-string ayrıştırma ve
 * allowlist doğrulaması. Route katmanı kullanır. tenant_id/tenantId BURADA
 * ayrıştırılmaz — tenant YALNIZ doğrulanmış oturumdan (verifyUserRequest) gelir;
 * istemci query/body değeri tenant için ASLA kabul edilmez.
 */

import {
  READ_DEFAULT_LIMIT,
  READ_DEFAULT_PAGE,
  READ_MAX_LIMIT,
  READ_MAX_Q_LEN,
} from "@/lib/aromaterapi/readTypes";
import { normalizeForSearch } from "@/lib/aromaterapi/searchNormalize";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type ListParamSpec = {
  /** İzinli sıralama anahtarları → gerçek kolon + yön. İlk anahtar varsayılan. */
  sorts: Record<string, { column: string; ascending: boolean }>;
  /** İzinli eşitlik filtreleri → gerçek kolon + değer allowlist'i. */
  filters?: Record<string, { column: string; allow: readonly string[] }>;
  /** Serbest (allowlist'siz) filtreler; yalnız biçim doğrulaması (ör. yıl). */
  yearFilter?: { column: string };
};

export type ParsedListParams = {
  page: number;
  limit: number;
  offset: number;
  q: string | null;
  /** Uygulanacak sıralama (deterministik; route id tie-breaker ekler). */
  sort: { column: string; ascending: boolean };
  /** Doğrulanmış eşitlik filtreleri (kolon → değer). */
  equals: Record<string, string>;
  /** Doğrulanmış yıl filtresi (varsa). */
  year: number | null;
};

export type ParseResult =
  | { ok: true; value: ParsedListParams }
  | { ok: false; code: string };

function parseIntStrict(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Ortak liste parametresi ayrıştırıcı. Geçersiz page/limit/sort/filter/uzun-q
 * durumunda stabil 400 kodu döner. Boş q → null.
 */
export function parseListParams(
  searchParams: URLSearchParams,
  spec: ListParamSpec,
): ParseResult {
  // page
  let page = READ_DEFAULT_PAGE;
  const pageRaw = searchParams.get("page");
  if (pageRaw !== null && pageRaw !== "") {
    const p = parseIntStrict(pageRaw.trim());
    if (p === null || p < 1) return { ok: false, code: "AROMA_INVALID_PAGE" };
    page = p;
  }

  // limit
  let limit = READ_DEFAULT_LIMIT;
  const limitRaw = searchParams.get("limit");
  if (limitRaw !== null && limitRaw !== "") {
    const l = parseIntStrict(limitRaw.trim());
    if (l === null || l < 1 || l > READ_MAX_LIMIT) {
      return { ok: false, code: "AROMA_INVALID_LIMIT" };
    }
    limit = l;
  }

  // q — trim; boş → null; aşırı uzun → 400
  let q: string | null = null;
  const qRaw = searchParams.get("q");
  if (qRaw !== null) {
    const trimmed = qRaw.trim();
    if (trimmed.length > READ_MAX_Q_LEN) {
      return { ok: false, code: "AROMA_QUERY_TOO_LONG" };
    }
    if (trimmed.length > 0) q = trimmed;
  }

  // sort — allowlist; verilmezse ilk anahtar
  const sortKeys = Object.keys(spec.sorts);
  let sort = spec.sorts[sortKeys[0]];
  const sortRaw = searchParams.get("sort");
  if (sortRaw !== null && sortRaw !== "") {
    const key = sortRaw.trim();
    if (!(key in spec.sorts)) return { ok: false, code: "AROMA_INVALID_SORT" };
    sort = spec.sorts[key];
  }

  // eşitlik filtreleri — her biri allowlist'te olmalı
  const equals: Record<string, string> = {};
  if (spec.filters) {
    for (const [param, def] of Object.entries(spec.filters)) {
      const raw = searchParams.get(param);
      if (raw === null || raw === "") continue;
      const val = raw.trim();
      if (!def.allow.includes(val)) {
        return { ok: false, code: "AROMA_INVALID_FILTER" };
      }
      equals[def.column] = val;
    }
  }

  // yıl filtresi — biçim doğrulaması (1400–2100 mantıklı aralık)
  let year: number | null = null;
  if (spec.yearFilter) {
    const raw = searchParams.get("year");
    if (raw !== null && raw !== "") {
      const y = parseIntStrict(raw.trim());
      if (y === null || y < 1400 || y > 2100) {
        return { ok: false, code: "AROMA_INVALID_FILTER" };
      }
      year = y;
    }
  }

  return {
    ok: true,
    value: { page, limit, offset: (page - 1) * limit, q, sort, equals, year },
  };
}

/**
 * PostgREST `.or()` ilike deseni için güvenli arama parçası üretir.
 * Kullanıcı q'sundaki PostgREST kontrol karakterlerini (`,` `(` `)` `*` `%` `\` `"`)
 * boşlukla değiştirir → filtre-string enjeksiyonu ve wildcard sızıntısı önlenir.
 * Sonuç `*term*` (PostgREST ilike wildcard) olarak sarılır.
 */
export function safeIlikePattern(q: string): string {
  const sanitized = q.replace(/[,()*%\\"]/g, " ").trim();
  return `*${sanitized}*`;
}

/**
 * Verilen kolonlar için tek bir PostgREST `.or()` ifadesi kurar:
 * `col1.ilike.*q*,col2.ilike.*q*`. Kolon adları geliştirici-kontrollüdür
 * (allowlist'ten gelir); yalnız q kullanıcı girdisidir ve sanitize edilir.
 */
export function buildOrIlike(columns: readonly string[], q: string): string {
  const pattern = safeIlikePattern(q);
  return columns.map((c) => `${c}.ilike.${pattern}`).join(",");
}

/**
 * Türkçe-normalize arama: kullanıcı q'sunu ARAMA sözleşmesiyle (searchNormalize.ts,
 * SQL `aromatherapy_search_normalize` ile byte-eş) normalize eder ve tablonun
 * generated `search_norm` kolonu üzerinde PostgREST `.or(...ilike...)` ifadesi üretir.
 *
 * `search_norm` zaten SEARCH_COLS kapsamının normalize birleşimidir → tek kolon
 * araması eski çok-kolon `.ilike` kapsamını DARALTMAZ. q önce normalize, sonra
 * `safeIlikePattern` ile PostgREST kontrol karakterlerine karşı sanitize edilir
 * (enjeksiyon güvenliği korunur). Boş/yalnız-sembol q → boş pattern (`**`), tüm
 * satırlar eşleşir; çağıran zaten yalnız `p.q` doluyken uygular.
 */
export function buildSearchNormIlike(q: string): string {
  return buildOrIlike(["search_norm"], normalizeForSearch(q));
}
