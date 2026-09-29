import { NextResponse } from "next/server";
import { logServerError } from "@/lib/http/apiError";
import type { UsageGuardContext } from "@/lib/usage/trackUsage";
import type { FailableUsageAction } from "@/lib/usage/usageTaxonomy";

/**
 * Refleksoloji API'leri için ORTAK hata yanıtı yardımcıları (REF-016).
 *
 * Amaç: istemciye ham Supabase/Postgres `error.message` (tablo/kolon/22P02/stack)
 * SIZDIRMAMAK. Teknik ayrıntı yalnız sunucu logunda kalır; istemci generic mesaj alır.
 *
 * ⚠️ Loglama: yalnız DB hata özeti (code + message) + kısa bağlam yazılır.
 *   Not içeriği, ek (attachment) verisi, token vb. GİZLİ veri ASLA loglanmaz.
 */

function briefDbError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown };
    const code = typeof e.code === "string" ? e.code : "";
    const msg = typeof e.message === "string" ? e.message : "";
    return [code, msg].filter(Boolean).join(" ").slice(0, 300);
  }
  return String(error).slice(0, 300);
}

/** USAGE360 hata bağlamı (opsiyonel). Kimlik YALNIZ route guard'ından. */
export type RefleksolojiUsageFailure = {
  guard: UsageGuardContext;
  req: { headers: Headers } | null;
  failedAction: FailableUsageAction;
  subEntity: "protocol" | "organ" | "atlas" | "note";
};

/**
 * Sunucu (500) hatası: teknik ayrıntıyı loglar, istemciye generic mesaj döner.
 * @param context kısa bağlam etiketi (ör. "atlas.PUT") — yalnız server logunda.
 * @param opts.usage verilirse Usage360 action_failed(server) olayı kaydedilir (yanıt aynı kalır).
 */
export function jsonServerError(
  context: string,
  error: unknown,
  opts?: { usage?: RefleksolojiUsageFailure },
): NextResponse {
  if (opts?.usage) {
    // USAGE360: başarısız iş işlemi → yanıttan SONRA tek action_failed (error_class=server).
    // Ortak logServerError yolu (lib/http/apiError) olayı trackUsageLater ile zamanlar; olaya
    // mesaj / cause / bağlam etiketi YAZILMAZ — yalnız modül + başarısız eylem + alt-varlık.
    const { guard, req, failedAction, subEntity } = opts.usage;
    logServerError({
      route: "refleksoloji",
      action: context,
      tenantId: guard.tenantId,
      cause: error,
      usage: { guard, req, module: "reflexology", failedAction, subEntity },
    });
  } else {
    console.error(`[refleksoloji] ${context}: ${briefDbError(error)}`);
  }
  return NextResponse.json(
    { ok: false, error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." },
    { status: 500 },
  );
}
