/**
 * CSP NONCE C1 — ihlal raporu redaksiyonu (SAF; harness deterministik test eder).
 *
 * Girdi: `application/csp-report` ({"csp-report": {...}}) veya Reporting API
 * `application/reports+json` ([{type:"csp-violation", body:{...}}]).
 *
 * Çıktı YALNIZ şu alanları içerir:
 *   - directive   : effective/violated directive adı (kısa, [a-z-])
 *   - blocked     : anahtar kelime (inline/eval/…) | şema (data/blob/…) | yalnız ORIGIN
 *   - path        : document URL'inin yalnız PATH sınıfı (query/fragment atılır; UUID, sayı,
 *                   uzun token segmentleri ":id" ile maskelenir)
 *   - disposition : report | enforce
 *
 * ASLA: tam URL, query string, fragment, script-sample/sample, source-file, satır/sütun,
 * referrer, IP, user-agent ham değeri. (Supabase imzalı URL token'ları query'dedir.)
 */

export const CSP_REPORT_MAX_BYTES = 16 * 1024;
export const CSP_REPORT_MAX_ITEMS = 5;

export const CSP_REPORT_CONTENT_TYPES = [
  "application/csp-report",
  "application/reports+json",
  "application/json",
] as const;

export type SanitizedCspReport = {
  directive: string;
  blocked: string;
  path: string;
  disposition: "report" | "enforce" | "unknown";
};

const BLOCKED_KEYWORDS = new Set([
  "inline",
  "eval",
  "wasm-eval",
  "self",
  "trusted-types-policy",
  "trusted-types-sink",
]);
const SAFE_SCHEMES = new Set(["data", "blob", "about", "filesystem", "chrome-extension", "moz-extension", "safari-extension", "safari-web-extension"]);

export function isAllowedCspReportContentType(contentType: string | null): boolean {
  const base = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return (CSP_REPORT_CONTENT_TYPES as readonly string[]).includes(base);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function sanitizeDirective(v: unknown): string {
  const d = str(v).trim().toLowerCase().split(/\s+/)[0] ?? "";
  return /^[a-z-]{1,40}$/.test(d) ? d : "other";
}

/** blocked-uri → anahtar kelime | şema | yalnız origin. Hiçbir zaman path/query döndürmez. */
export function sanitizeBlocked(v: unknown): string {
  const raw = str(v).trim();
  if (!raw) return "none";
  const lower = raw.toLowerCase();
  if (BLOCKED_KEYWORDS.has(lower)) return lower;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw)?.[1]?.toLowerCase();
  if (scheme && SAFE_SCHEMES.has(scheme)) return `${scheme}:`;
  if (scheme === "http" || scheme === "https" || scheme === "wss" || scheme === "ws") {
    try {
      const u = new URL(raw);
      return `${u.protocol}//${u.host}`.toLowerCase();
    } catch {
      return "other";
    }
  }
  return "other";
}

const UUID_SEG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function maskSegment(seg: string): string {
  if (!seg) return seg;
  if (UUID_SEG.test(seg)) return ":id";
  if (/^\d+$/.test(seg)) return ":id";
  // Uzun/rastgele görünen segment (token, e-posta, encode edilmiş veri) → maskele.
  if (seg.length > 32 || /[^A-Za-z0-9._~-]/.test(seg) || /\d{4,}/.test(seg)) return ":id";
  return seg.toLowerCase();
}

/** document-uri → yalnız normalize PATH sınıfı (origin, query, fragment yok). */
export function sanitizeDocumentPath(v: unknown): string {
  const raw = str(v).trim();
  if (!raw) return "unknown";
  let pathname: string;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    return "unknown";
  }
  const segs = pathname.split("/").slice(1, 7).map(maskSegment);
  const out = "/" + segs.join("/");
  return out.length > 120 ? out.slice(0, 120) : out;
}

function sanitizeOne(body: Record<string, unknown>): SanitizedCspReport {
  const directive = sanitizeDirective(
    body["effective-directive"] ?? body.effectiveDirective ?? body["violated-directive"] ?? body.violatedDirective,
  );
  const blocked = sanitizeBlocked(body["blocked-uri"] ?? body.blockedURL ?? body.blockedUri);
  const path = sanitizeDocumentPath(body["document-uri"] ?? body.documentURL ?? body.documentUri);
  const dispRaw = str(body.disposition).toLowerCase();
  const disposition = dispRaw === "report" || dispRaw === "enforce" ? dispRaw : "unknown";
  return { directive, blocked, path, disposition };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Ham JSON gövdesini redakte edilmiş rapor listesine çevirir.
 * Tanınmayan biçim → null (çağıran 400 döner). En fazla CSP_REPORT_MAX_ITEMS kayıt.
 */
export function sanitizeCspReportPayload(payload: unknown): SanitizedCspReport[] | null {
  if (isObj(payload) && isObj(payload["csp-report"])) {
    return [sanitizeOne(payload["csp-report"] as Record<string, unknown>)];
  }
  if (Array.isArray(payload)) {
    const out: SanitizedCspReport[] = [];
    for (const item of payload) {
      if (out.length >= CSP_REPORT_MAX_ITEMS) break;
      if (!isObj(item) || item.type !== "csp-violation" || !isObj(item.body)) continue;
      out.push(sanitizeOne(item.body as Record<string, unknown>));
    }
    return out;
  }
  return null;
}

/** User-agent → kaba tarayıcı sınıfı (fingerprint DEĞİL). */
export function uaClass(ua: string | null): string {
  const s = ua ?? "";
  if (/;\s*wv\)/.test(s)) return "android-webview";
  if (/Edg\//.test(s)) return "edge";
  if (/Firefox\//.test(s)) return "firefox";
  if (/Chrome\//.test(s)) return /Mobile/.test(s) ? "chrome-mobile" : "chrome";
  if (/Safari\//.test(s)) return /Mobile/.test(s) ? "safari-mobile" : "safari";
  return "other";
}
