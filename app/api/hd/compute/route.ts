import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { handleCompute } from "@/lib/human-design/api/handleCompute";

export const runtime = "nodejs";

/**
 * POST /api/hd/compute — doğrulanmış HD chart hesabı (FAZ 5 / ADIM 2b).
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user_id binding.
 *   - tenantId SUNUCUDA session/user kaydından alınır; request'ten GÜVENİLMEZ.
 *   - STATELESS: DB okuma/yazma YOK; tenant yalnız erişim kapısı (izolasyon gereksiz).
 *   - Yanıt no-store (kişisel veri). Birth data LOGLANMAZ.
 *   - Hesap: lib/human-design/api/handleCompute (saf; validate → computeHumanDesignChart).
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
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

  const result = handleCompute(raw);
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
}

export async function GET(_req: NextRequest): Promise<Response> {
  return NextResponse.json(
    { ok: false, code: "METHOD_NOT_ALLOWED", error: "Yalnız POST desteklenir." },
    { status: 405, headers: { ...NO_STORE, Allow: "POST" } },
  );
}
