/**
 * lib/store/adminHttp.ts — Doğal Pazar admin route'ları için ortak HTTP yardımcıları.
 *
 * Stabil hata zarfı `{ ok:false, error, code }`. Ham DB hata metni İSTEMCİYE DÖNMEZ.
 */

import { NextResponse } from "next/server";

export const STORE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function storeError(error: string, code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error, code }, { status });
}

export function invalidBody(): NextResponse {
  return storeError("Geçersiz istek gövdesi.", "STORE_INVALID_BODY", 400);
}

export function invalidId(): NextResponse {
  return storeError("Geçersiz kimlik.", "STORE_INVALID_ID", 400);
}

/** Body'i güvenli plain-object'e indirger; değilse null. */
export function asPlainObject(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

/** obj yalnızca allowed anahtarları içeriyor mu? (mass-assignment koruması) */
export function onlyAllowedKeys(obj: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set<string>(allowed);
  for (const key of Object.keys(obj)) if (!set.has(key)) return false;
  return true;
}
