/**
 * Klasik Numeroloji — route yardımcıları (YALNIZ SUNUCU): no-store yanıtlar, bayrak 404'ü, sınırlı gövde okuma.
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { NextResponse, type NextRequest } from "next/server";
import { CLASSIC_MAX_BODY_BYTES, parseClassicJsonBody, type Validation } from "../input";
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

/** Content-Length ön kontrolü + gövdeyi en fazla 16 KB okur. */
export async function readClassicBody(req: NextRequest): Promise<Validation<unknown>> {
  const cl = req.headers.get("content-length");
  if (cl && /^\d+$/.test(cl) && Number(cl) > CLASSIC_MAX_BODY_BYTES) return { ok: false, code: "PAYLOAD_TOO_LARGE", error: "İstek çok büyük." };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." };
  }
  return parseClassicJsonBody(text);
}
