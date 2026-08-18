/**
 * Şifa Rehberi — server-side arama/list parametre + keyset cursor yardımcıları.
 *
 * SAF (yan etkisiz) — hem API route'u hem test harness'i aynı sözleşmeyi kullanır.
 * Tenant BURADA yoktur: tenant her zaman sunucu session'ından türetilir (asla q/cursor'dan).
 *
 * Keyset cursor: `(fold(name), id)` tuple'ı. `fold(name)` istemcide JS foldTr ile
 * hesaplanır — SQL sifa_fold ile BİT-PARITY olduğu kanıtlıdır (normalizeTr.ts) →
 * ekstra kolon dönmeye gerek yoktur.
 */

export const SEARCH_MAX_Q = 200;
export const SEARCH_DEFAULT_LIMIT = 50;
export const SEARCH_MAX_LIMIT = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GuideSearchCursor = { afterFold: string; afterId: string };

export type GuideSearchQuery = {
  /** Ham (kırpılmış, cap'lenmiş) sorgu metni. */
  q: string;
  /** search: q anlamlı; list: q boş → A–Z bounded liste. */
  mode: "list" | "search";
  /** Opsiyonel kategori filtresi (trim; boş → yok). */
  category: string | null;
  /** [1, SEARCH_MAX_LIMIT] arası; varsayılan SEARCH_DEFAULT_LIMIT. */
  limit: number;
  /** İlk sayfa → null. */
  cursor: GuideSearchCursor | null;
};

/** Malformed cursor sinyali — route bunu 400'e çevirir (sessiz ilk-sayfa DEĞİL). */
export class BadCursorError extends Error {
  constructor() {
    super("bad_cursor");
    this.name = "BadCursorError";
  }
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

/** `(afterFold, afterId)` → opaque cursor. */
export function encodeCursor(afterFold: string, afterId: string): string {
  return `${b64urlEncode(afterFold)}.${afterId}`;
}

/**
 * Opaque cursor → `(afterFold, afterId)`. Malformed ise BadCursorError fırlatır.
 * Boş/undefined girişte çağrılmamalıdır (route absent'i ayrı ele alır).
 */
export function decodeCursor(raw: string): GuideSearchCursor {
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) throw new BadCursorError();
  const afterId = raw.slice(dot + 1);
  if (!UUID_RE.test(afterId)) throw new BadCursorError();
  let afterFold: string;
  try {
    afterFold = b64urlDecode(raw.slice(0, dot));
  } catch {
    throw new BadCursorError();
  }
  return { afterFold, afterId };
}

function clampLimit(raw: string | null): number {
  if (raw == null || raw === "") return SEARCH_DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return SEARCH_DEFAULT_LIMIT;
  if (n < 1) return 1;
  if (n > SEARCH_MAX_LIMIT) return SEARCH_MAX_LIMIT;
  return n;
}

/**
 * URLSearchParams → doğrulanmış GuideSearchQuery. Cursor malformed ise BadCursorError.
 * q > SEARCH_MAX_Q ise sessizce kırpılır (reddedilmez — kullanıcı yazmaya devam edebilir).
 */
export function parseGuideSearchParams(sp: URLSearchParams): GuideSearchQuery {
  const rawQ = (sp.get("q") ?? "").slice(0, SEARCH_MAX_Q);
  const q = rawQ;
  const trimmed = q.trim();
  const rawCat = (sp.get("category") ?? "").trim();
  const category = rawCat === "" ? null : rawCat.slice(0, 120);
  const limit = clampLimit(sp.get("limit"));

  const cursorRaw = sp.get("cursor");
  const cursor =
    cursorRaw != null && cursorRaw !== "" ? decodeCursor(cursorRaw) : null;

  return {
    q,
    mode: trimmed === "" ? "list" : "search",
    category,
    limit,
    cursor,
  };
}
