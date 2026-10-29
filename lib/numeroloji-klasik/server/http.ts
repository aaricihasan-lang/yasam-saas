/**
 * Klasik Numeroloji — route yardımcıları (YALNIZ SUNUCU): no-store yanıtlar, bayrak 404'ü, sınırlı gövde okuma.
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { NextResponse, type NextRequest } from "next/server";
import { CLASSIC_MAX_BODY_BYTES, parseClassicJsonBody, type Validation } from "../input";
import { readBodyTextLimited } from "./bodyReader";
import { CLASSIC_ERRORS, type ClassicErrorCode } from "./errors";

assertServerOnly("lib/numeroloji-klasik/server/http");

export const NO_STORE = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } as const;

export function classicJson(status: number, body: unknown, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

export function classicError(code: ClassicErrorCode, extra: Record<string, string> = {}): NextResponse {
  const e = CLASSIC_ERRORS[code];
  return classicJson(e.status, { ok: false, code, error: e.error }, extra);
}

/** Bayrak kapalı / bilinmeyen kaynak — varlık sızdırmayan tek tip 404. */
export function classicNotFound(): NextResponse {
  return classicError("NOT_FOUND");
}

export function validationResponse(v: Extract<Validation<unknown>, { ok: false }>): NextResponse {
  const status = v.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
  return classicJson(status, { ok: false, code: v.code, error: v.error, ...(v.field ? { field: v.field } : {}) });
}

/** Content-Length ön kontrolü + gövdeyi AKIŞ olarak en fazla 16 KB okur (aşıldığı an 413; chunked dahil). */
export async function readClassicBody(req: NextRequest): Promise<Validation<unknown>> {
  const r = await readBodyTextLimited(req, CLASSIC_MAX_BODY_BYTES);
  if (!r.ok) {
    return r.code === "PAYLOAD_TOO_LARGE"
      ? { ok: false, code: "PAYLOAD_TOO_LARGE", error: "İstek çok büyük." }
      : { ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." };
  }
  return parseClassicJsonBody(r.text);
}
