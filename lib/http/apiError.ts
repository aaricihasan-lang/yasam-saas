/**
 * lib/http/apiError.ts — modül-nötr güvenli (kullanıcı-facing) hata yanıtı.
 *
 * AMAÇ: iç/beklenmeyen hatalarda (500) kullanıcı SABİT, güvenli TR mesaj görür;
 * ham Postgres/Supabase detayı (constraint/table/column/SQL/stack) YANITTA ASLA
 * bulunmaz. Teknik ayrıntı yalnız SUNUCU logunda (Vercel Functions) kalır ve opak
 * bir `ref` ile ilişkilendirilir.
 *
 * KAPSAM: repo-genelinde küçük paylaşımlı yardımcı (global framework refactor'u DEĞİL).
 * Mevcut kontrollü 400/401/403/404/409/429 mesajları KORUNUR — bu helper onları
 * değiştirmez; yalnız "unknown/internal" (DB/storage/exception) 500 dalları için.
 *
 * Precedent: lib/sifa-rehberi/publicApiError.ts (Şifa Rehberi'ne özeldi) — davranış
 * birebir; yalnız log öneki modül-nötr ("[api-error]").
 *
 * LOGLAMA GİZLİLİĞİ: KULLANICI İÇERİĞİ / request body / PII LOGLANMAZ. Yalnız
 * route/action, opak ref, tenantId (korelasyon için) ve DB sürücüsünün message/code'u.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { ModuleGateKey } from "@/lib/auth/moduleAccess";
import { trackUsageLater, type UsageGuardContext } from "@/lib/usage/trackUsage";
import type { FailableUsageAction } from "@/lib/usage/usageTaxonomy";

/** Kullanıcıya gösterilecek sabit, güvenli TR mesajları (statüye göre). */
export const PUBLIC_ERROR_MESSAGE: Record<number, string> = {
  400: "Gönderilen bilgiler geçersiz.",
  401: "Oturum doğrulanamadı.",
  403: "Bu işlem için yetkiniz yok.",
  404: "Kayıt bulunamadı.",
  409: "İşlem mevcut veriyle çakıştı.",
  429: "Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin.",
  500: "İşlem sırasında bir hata oluştu.",
};

export type ServerErrorContext = {
  /** Örn. "clients" / "clients/[id]/notes". */
  route: string;
  /** Örn. "GET" / "POST" / "cascade-delete". */
  action: string;
  /** Korelasyon için (PII değil). */
  tenantId?: string;
  /** Ham hata (Supabase/Postgres/Error) — YALNIZ sunucu logunda. */
  cause: unknown;
  /**
   * USAGE360 (opsiyonel): verilirse başarısız iş işlemi yanıttan SONRA tek bir
   * action_failed (error_class=server) olayı olarak kaydedilir. Olaya hata mesajı / cause /
   * route / ref YAZILMAZ — yalnız modül + başarısız eylem + alt-varlık enum'ları.
   */
  usage?: {
    guard: UsageGuardContext;
    req: { headers: Headers } | null;
    module: ModuleGateKey;
    failedAction: FailableUsageAction;
    subEntity?: string | null;
  };
};

function recordUsageFailure(ctx: ServerErrorContext): void {
  if (!ctx.usage) return;
  const { guard, req, module, failedAction, subEntity } = ctx.usage;
  trackUsageLater(guard, req, { module, action: "action_failed", failedAction, subEntity: subEntity ?? null, errorClass: "server" });
}

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
 * Yanıt gövdesi: `{ ok:false, error:"…bir hata…", ref:"<opak>" }`.
 * Ham `cause` (Supabase/Postgres message) YANITTA yer almaz.
 */
export function serverErrorResponse(ctx: ServerErrorContext): NextResponse {
  recordUsageFailure(ctx);
  const ref = randomUUID();
  const { message, code } = extractDiagnostic(ctx.cause);
  // Sunucu diagnostiği — İÇERİK/PII YOK. (Vercel Functions logs.)
  console.error(
    `[api-error] route=${ctx.route} action=${ctx.action} ref=${ref}` +
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
 * Beklenmeyen bir iç hatayı YALNIZ sunucuda loglar ve opak bir `ref` döndürür
 * (JSON yanıtı çağıran kendi üretir; ör. cascade-delete gibi warnings dizisi
 * içinde raw mesaj yerine bu ref'i kullanmak için).
 */
export function logServerError(ctx: ServerErrorContext): string {
  recordUsageFailure(ctx);
  const ref = randomUUID();
  const { message, code } = extractDiagnostic(ctx.cause);
  console.error(
    `[api-error] route=${ctx.route} action=${ctx.action} ref=${ref}` +
      (ctx.tenantId ? ` tenant=${ctx.tenantId}` : "") +
      (code ? ` code=${code}` : "") +
      ` msg=${message}`,
  );
  return ref;
}
