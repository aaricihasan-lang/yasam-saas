import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { clientIpFromHeaders, rateLimitBucket } from "@/lib/security/dbRateLimit";
import {
  CSP_REPORT_MAX_BYTES,
  isAllowedCspReportContentType,
  sanitizeCspReportPayload,
  uaClass,
} from "@/lib/security/cspReport";

export const runtime = "nodejs";

/**
 * CSP NONCE C1 — Report-Only ihlal raporu alıcısı (PUBLIC; auth/session YOK).
 *
 * - Yalnız POST (diğer metotlar Next tarafından 405).
 * - Content-Type izin listesi (csp-report / reports+json / json) → aksi 415.
 * - Gövde ≤ 16 KB (Content-Length + akış sayacı) → aksi 413.
 * - Rate limit: bellek-içi (instance-yerel) IP-HMAC kovası + instance geneli tavan. DB rate
 *   limit BİLİNÇLİ olarak kullanılmaz: her spam raporu bir DB yazımına dönüşürdü
 *   (amplifikasyon); bu uç nokta yalnız redakte edilmiş tek satır log yazar. Ham IP
 *   hiçbir yere yazılmaz.
 * - Log: yalnız lib/security/cspReport redaksiyonundan geçen alanlar (directive, blocked
 *   origin/kategori, path sınıfı, disposition, kaba UA sınıfı). Tam URL / query / fragment /
 *   script-sample / IP ASLA.
 * - Yanıtlar gövdesiz; stack/secret dönmez.
 */

const PER_IP_LIMIT = 30;
const GLOBAL_LIMIT = 300;
const WINDOW_MS = 60_000;

function empty(status: number, extra?: Record<string, string>) {
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

async function readCapped(req: NextRequest, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

export async function POST(req: NextRequest) {
  try {
    const now = Date.now();
    const global = checkRateLimit("csp-report:global", GLOBAL_LIMIT, WINDOW_MS, now);
    const perIp = checkRateLimit(
      rateLimitBucket("csp-report-ip", clientIpFromHeaders(req.headers)),
      PER_IP_LIMIT,
      WINDOW_MS,
      now,
    );
    if (!global.ok || !perIp.ok) {
      return empty(429, { "Retry-After": String(Math.max(global.retryAfterSec, perIp.retryAfterSec)) });
    }

    if (!isAllowedCspReportContentType(req.headers.get("content-type"))) return empty(415);

    const text = await readCapped(req, CSP_REPORT_MAX_BYTES);
    if (text === null) return empty(413);

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return empty(400);
    }
    const reports = sanitizeCspReportPayload(payload);
    if (reports === null) return empty(400);

    const ua = uaClass(req.headers.get("user-agent"));
    for (const r of reports) {
      console.warn(JSON.stringify({ evt: "csp_report_c1", ...r, ua }));
    }
    return empty(204);
  } catch {
    return empty(400);
  }
}
