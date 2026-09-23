import { NextResponse } from "next/server";

/**
 * BIO-013 — Biyoenerji CRUD hata sanitizasyonu.
 *
 * Ham Supabase/DB `error.message` (tablo/kolon adı, PostgREST internals) İSTEMCİYE
 * DÖNMEZ. Teknik detay yalnız sunucu logunda tutulur; istemciye kısa, güvenli,
 * DB yapısını açığa çıkarmayan bir mesaj döner. Token/secret/PII loglanmaz —
 * yalnız Supabase error nesnesi + kısa context yazılır.
 */
export function bioDbError(
  context: string,
  error: unknown,
  userMessage = "İşlem sırasında bir hata oluştu.",
): NextResponse {
  console.error(`[biyoenerji] ${context}:`, error);
  return NextResponse.json({ ok: false, error: userMessage }, { status: 500 });
}
