import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/security/csp-report — CSP NONCE C1-v2 ihlal raporları (canary politikasının report-uri'si).
 *
 *   - YALNIZ POST; diğer metotlar 405 (Next varsayılanı).
 *   - Yalnız CSP rapor içerik türleri (application/csp-report, application/reports+json,
 *     application/json); gövde ≤ 16 KB.
 *   - Bellek içi rate limit (IP başına dakikada 60) — DB yazımı YOK.
 *   - Yalnız REDAKTE telemetri: ihlal edilen direktif + engellenen kaynağın ORIGIN'i (yol/sorgu yok)
 *     + belge YOLU (sorgu/parça yok). Token/cookie/kimlik/URL sorgusu LOGLANMAZ.
 *   - Rapor işleme hatası ana akışı etkilemez; her durumda 204 (veya 4xx) — gövde yok.
 */
const MAX_BYTES = 16 * 1024;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const ALLOWED_TYPES = ["application/csp-report", "application/reports+json", "application/json"];
const hits = new Map<string, { n: number; start: number }>();

function rateLimited(key: string, now = Date.now()): boolean {
  const cur = hits.get(key);
  if (!cur || now - cur.start > WINDOW_MS) {
    hits.set(key, { n: 1, start: now });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  cur.n += 1;
  return cur.n > MAX_PER_WINDOW;
}

/** Test için. */
export function __resetCspReportRateLimit(): void {
  hits.clear();
}

function originOnly(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (["inline", "eval", "self", "data", "blob", "wasm-eval", "trusted-types-policy"].includes(v)) return v;
  try {
    return new URL(v).origin;
  } catch {
    return v.slice(0, 32).replace(/[^a-z0-9:-]/gi, "");
  }
}

function pathOnly(raw: unknown): string {
  try {
    return new URL(String(raw ?? "")).pathname.slice(0, 120);
  } catch {
    return "";
  }
}

type ReportBody = Record<string, unknown>;

function extractReports(json: unknown): ReportBody[] {
  if (Array.isArray(json)) return json.map((r) => ((r as { body?: ReportBody })?.body ?? (r as ReportBody)) as ReportBody);
  const legacy = (json as { "csp-report"?: ReportBody } | null)?.["csp-report"];
  return legacy ? [legacy] : [];
}

export async function POST(req: NextRequest): Promise<Response> {
  const empty = (status: number) => new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.includes(type)) return empty(415);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BYTES) return empty(413);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return empty(429);

  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return empty(413);
    const reports = extractReports(JSON.parse(text)).slice(0, 10);
    for (const r of reports) {
      const directive = String(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? "").split(" ")[0].slice(0, 40);
      const blocked = originOnly(r["blocked-uri"] ?? r.blockedURL);
      const doc = pathOnly(r["document-uri"] ?? r.documentURL);
      console.warn(JSON.stringify({ evt: "csp_violation", directive, blocked, doc }));
    }
  } catch {
    return empty(400);
  }
  return empty(204);
}
