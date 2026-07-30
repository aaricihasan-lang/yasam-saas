import "server-only";

import { NextResponse } from "next/server";

/**
 * Aromaterapi V2 — C3D ortak yazma hata/yanıt sözleşmesi (server-only).
 *
 * Mevcut Aromaterapi route standardıyla uyumlu: gövde `{ ok: false, code }`.
 * Ham Supabase/PostgreSQL hata metni İSTEMCİYE SIZMAZ; server-side loglanır, yalnız
 * stabil makine kodu döner. C2T claim yazma davranışıyla aynı güvenlik semantiği;
 * ancak claims koduna dokunmaz (bu temel ileriki entity writer'ları içindir).
 */

export type WriteErrorCode =
  | "AROMA_WRITE_INVALID_BODY"
  | "AROMA_WRITE_FORBIDDEN_FIELD"
  | "AROMA_WRITE_INVALID_UUID"
  | "AROMA_WRITE_REASON_REQUIRED"
  | "AROMA_WRITE_REASON_INVALID"
  | "AROMA_WRITE_INVALID_TIMESTAMP"
  | "AROMA_WRITE_DEMO_FORBIDDEN"
  | "AROMA_WRITE_NOT_FOUND"
  | "AROMA_WRITE_STALE"
  | "AROMA_WRITE_CONFLICT"
  | "AROMA_WRITE_FAILED";

const WRITE_ERROR_STATUS: Readonly<Record<WriteErrorCode, number>> = {
  AROMA_WRITE_INVALID_BODY: 400,
  AROMA_WRITE_FORBIDDEN_FIELD: 400,
  AROMA_WRITE_INVALID_UUID: 400,
  AROMA_WRITE_REASON_REQUIRED: 400,
  AROMA_WRITE_REASON_INVALID: 400,
  AROMA_WRITE_INVALID_TIMESTAMP: 400,
  AROMA_WRITE_DEMO_FORBIDDEN: 403,
  AROMA_WRITE_NOT_FOUND: 404,
  AROMA_WRITE_STALE: 409,
  AROMA_WRITE_CONFLICT: 409,
  AROMA_WRITE_FAILED: 500,
};

function statusFor(code: string): number {
  return (WRITE_ERROR_STATUS as Record<string, number>)[code] ?? 400;
}

/** Stabil hata kodu → `{ ok:false, code }` (uygun HTTP status ile). */
export function writeFail(code: string): NextResponse {
  return NextResponse.json({ ok: false, code }, { status: statusFor(code) });
}

/** Demo hesap → 403 (mutation yasak). */
export function writeForbiddenDemo(): NextResponse {
  return writeFail("AROMA_WRITE_DEMO_FORBIDDEN");
}

/**
 * Out-of-tenant / eksik kayıt → 404. Başarılı no-op KULLANILMAZ (Karar 12):
 * başka tenant kaydına mutation isteği daima 404 döner (varlık sızdırmaz).
 */
export function writeNotFound(): NextResponse {
  return writeFail("AROMA_WRITE_NOT_FOUND");
}

/**
 * Bilinmeyen/DB hatasını güvenli 500'e çevirir. Ham hata YALNIZ sunucuda loglanır;
 * istemciye stabil `AROMA_WRITE_FAILED` döner.
 */
export function writeServerError(context: string, err: unknown): NextResponse {
  try {
    console.error(`[aromaterapi:write:${context}]`, err);
  } catch {
    /* logging kritik değil */
  }
  return writeFail("AROMA_WRITE_FAILED");
}

/** Başarılı yazma yanıtı (opsiyonel warnings; ileriki writer'lar id döndürür). */
export function writeOk(payload: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...payload }, { status });
}
