/**
 * Şifa Rehberi — güvenli (kullanıcı-facing) hata yanıtı + sunucu diagnostiği.
 *
 * AMAÇ: iç/beklenmeyen hatalarda (500) kullanıcı SABİT, güvenli TR mesaj görür;
 * ham Postgres/Supabase detayı (constraint/table/column/SQL/stack) YANITTA ASLA
 * bulunmaz. Teknik ayrıntı yalnız SUNUCU logunda (Vercel Functions) kalır ve
 * opak bir `ref` ile ilişkilendirilir.
 *
 * KAPSAM: yalnız Şifa Rehberi (repo-wide error framework DEĞİL). Mevcut kontrollü
 * 400/401/403/404/409/429 mesajları KORUNUR — bu helper onları değiştirmez; yalnız
 * "unknown/internal" 500 dalları için kullanılır.
 *
 * LOGLAMA GİZLİLİĞİ: q/note/expert_note/attention/source gibi profesyonel KULLANICI
 * İÇERİĞİ ve tam request body LOGLANMAZ. Yalnız route/action, opak ref, tenantId
 * (PII değil; korelasyon için) ve DB sürücüsünün error.message/code'u loglanır.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

/** Kullanıcıya gösterilecek sabit, güvenli TR mesajları (statüye göre). */
export const PUBLIC_ERROR_MESSAGE: Record<number, string> = {
  400: "Gönderilen bilgiler geçersiz.",
  401: "Oturum doğrulanamadı.",
  403: "Bu işlem için yetkiniz yok.",
  404: "Kayıt bulunamadı.",
  409: "İşlem mevcut veriyle çakıştı.",
  429: "Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin.",
  500: "İşlem sırasında beklenmeyen bir hata oluştu.",
};

type ServerErrorContext = {
  /** Örn. "sifa/guides". */
  route: string;
  /** Örn. "GET" / "POST" / "sections.replace". */
  action: string;
  /** Korelasyon için (PII değil). */
  tenantId?: string;
  /** Ham hata (Supabase/Postgres/Error) — YALNIZ sunucu logunda. */
  cause: unknown;
};

function extractDiagnostic(cause: unknown): { message: string; code?: string } {
  if (cause && typeof cause === "object") {
    const c = cause as { message?: unknown; code?: unknown };
    return {
      message: typeof c.message === "string" ? c.message : String(cause),
      code: typeof c.code === "string" ? c.code : undefined,
    };
  }
  return { message: typeof cause === "string" ? cause : String(cause) };
}

/**
 * Beklenmeyen bir iç hatayı sanitize eder: sunucu logu + güvenli 500 JSON yanıtı.
 * Yanıt gövdesi: `{ ok:false, error:"…beklenmeyen…", ref:"<opak>" }`.
 */
export function serverErrorResponse(ctx: ServerErrorContext): NextResponse {
  const ref = randomUUID();
  const { message, code } = extractDiagnostic(ctx.cause);
  // Sunucu diagnostiği — İÇERİK/PII YOK. (Vercel Functions logs.)
  console.error(
    `[sifa-error] route=${ctx.route} action=${ctx.action} ref=${ref}` +
      (ctx.tenantId ? ` tenant=${ctx.tenantId}` : "") +
      (code ? ` code=${code}` : "") +
      ` msg=${message}`,
  );
  return NextResponse.json(
    { ok: false, error: PUBLIC_ERROR_MESSAGE[500], ref },
    { status: 500 },
  );
}

/**
 * Kontrollü statü için güvenli yanıt (opsiyonel özel mesaj). Mevcut kontrollü
 * mesajları koruduğumuz için çoğunlukla gerekmez; yeni uçlarda tutarlılık sağlar.
 */
export function publicErrorResponse(
  status: number,
  message?: string,
  extraHeaders?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { ok: false, error: message ?? PUBLIC_ERROR_MESSAGE[status] ?? PUBLIC_ERROR_MESSAGE[500] },
    { status, ...(extraHeaders ? { headers: extraHeaders } : {}) },
  );
}
