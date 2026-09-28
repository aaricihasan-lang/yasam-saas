import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { handleCompute } from "@/lib/human-design/api/handleCompute";

export const runtime = "nodejs";

/**
 * POST /api/hd/compute — doğrulanmış HD chart hesabı (FAZ 5 / ADIM 2b).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenantId SUNUCUDA session/user kaydından alınır; request'ten GÜVENİLMEZ.
 *   - STATELESS: DB okuma/yazma YOK; tenant yalnız erişim kapısı (izolasyon gereksiz).
 *   - Yanıt no-store (kişisel veri). Birth data LOGLANMAZ.
 *   - Hesap: lib/human-design/api/handleCompute (saf; validate → computeHumanDesignChart).
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Saf hesap (handleCompute) için ince async sınır — motor/doğrulama DEĞİŞMEZ. */
async function runCompute(raw: unknown): Promise<ReturnType<typeof handleCompute>> {
  return handleCompute(raw);
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;

  // guard.tenantId sunucudan gelir; stateless compute'ta veri-izolasyonu için
  // kullanılmaz (persist/read yok). Auth yine de zorunlu (açık endpoint olmasın).

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = await runCompute(raw);
  // USAGE360: yalnız BAŞARILI hesap analysis_run sayılır (stateless: kaynak id yok; doğum
  // verisi telemetriye GİRMEZ). Motor hatası (500) → action_failed(server); 400 → olay yok.
  if (result.status === 200) {
    await trackUsage(guard, req, { module: "human_design", action: "analysis_run", subEntity: "chart" });
  } else if (result.status >= 500) {
    await trackUsage(guard, req, { module: "human_design", action: "action_failed", failedAction: "analysis_run", subEntity: "chart", errorClass: "server" });
  }
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
}

export async function GET(_req: NextRequest): Promise<Response> {
  return NextResponse.json(
    { ok: false, code: "METHOD_NOT_ALLOWED", error: "Yalnız POST desteklenir." },
    { status: 405, headers: { ...NO_STORE, Allow: "POST" } },
  );
}
