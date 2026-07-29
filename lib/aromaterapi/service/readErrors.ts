import "server-only";

import { NextResponse } from "next/server";

/**
 * Aromaterapi V2 — C3C okuma hata sözleşmesi.
 *
 * Mevcut Aromaterapi route standardıyla uyumlu: gövde `{ ok: false, code }`.
 * Ham Supabase/PostgreSQL hata metni (message/details/hint) İSTEMCİYE SIZMAZ;
 * server-side loglanır, yalnız stabil makine kodu döner. İstemci sarmalayıcısı
 * kodu Türkçe kullanıcı mesajına çevirir.
 */

export type ReadErrorCode =
  | "AROMA_INVALID_UUID"
  | "AROMA_INVALID_PAGE"
  | "AROMA_INVALID_LIMIT"
  | "AROMA_INVALID_SORT"
  | "AROMA_INVALID_FILTER"
  | "AROMA_QUERY_TOO_LONG"
  | "AROMA_NOT_FOUND"
  | "AROMA_READ_FAILED";

const READ_ERROR_STATUS: Readonly<Record<ReadErrorCode, number>> = {
  AROMA_INVALID_UUID: 400,
  AROMA_INVALID_PAGE: 400,
  AROMA_INVALID_LIMIT: 400,
  AROMA_INVALID_SORT: 400,
  AROMA_INVALID_FILTER: 400,
  AROMA_QUERY_TOO_LONG: 400,
  AROMA_NOT_FOUND: 404,
  AROMA_READ_FAILED: 500,
};

function statusFor(code: string): number {
  return (READ_ERROR_STATUS as Record<string, number>)[code] ?? 400;
}

/** Stabil hata kodu → `{ ok:false, code }` yanıtı (uygun HTTP status ile). */
export function readFail(code: string): NextResponse {
  return NextResponse.json({ ok: false, code }, { status: statusFor(code) });
}

/** 404 — out-of-tenant/silinmiş detay isteği (varlık sızdırmaz). */
export function readNotFound(): NextResponse {
  return readFail("AROMA_NOT_FOUND");
}

/**
 * Bilinmeyen/DB hatasını güvenli 500'e çevirir. Ham hata YALNIZ sunucuda
 * loglanır; istemciye stabil `AROMA_READ_FAILED` döner.
 */
export function readServerError(context: string, err: unknown): NextResponse {
  try {
    console.error(`[aromaterapi:read:${context}]`, err);
  } catch {
    /* logging kritik değil */
  }
  return readFail("AROMA_READ_FAILED");
}

/** Başarılı liste zarfı yanıtı. */
export function readListOk<T>(
  rows: T[],
  page: number,
  limit: number,
  total: number,
): NextResponse {
  return NextResponse.json({ ok: true, rows, page, limit, total });
}
