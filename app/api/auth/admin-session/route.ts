import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveAdminUserIdFromSessionToken } from "@/lib/auth/credentialLogin";
import {
  ADMIN_SESSION_COOKIE,
  LEGACY_ADMIN_ID_COOKIE,
  adminSessionCookieOptions,
} from "@/lib/auth/adminShellSession";
import { getSessionCookieConfig, isAndroidAppRequest, readWebSessionCookie } from "@/lib/auth/sessionCookie";
import { checkSameOriginRequest } from "@/lib/security/csrf";

export const runtime = "nodejs";

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role yapılandırması eksik.");
  return createClient(url, key);
}

const isProduction = process.env.NODE_ENV === "production";

/**
 * HTTPONLY H5: cookie modu açıkken (off DEĞİL) web isteğinde Origin / Sec-Fetch-Site doğrulaması.
 * off modda ve Android'de bugünkü davranış birebir korunur (kontrol uygulanmaz).
 */
function originRejected(request: NextRequest): NextResponse | null {
  if (getSessionCookieConfig().mode === "off" || isAndroidAppRequest(request.headers)) return null;
  if (checkSameOriginRequest(request.headers).ok) return null;
  return NextResponse.json({ error: "İstek kaynağı doğrulanamadı." }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/auth/admin-session
 * Admin httpOnly cookie'sini set eder.
 *
 * P0-1 KAPANIŞI: cookie yalnızca, GEÇERLİ bir OTURUM TOKEN'ının (x-session-token)
 * sahibi role='admin' + active=true bir kullanıcıysa verilir. Oturum token'ı artık
 * credential-gated `/api/auth/session` ile üretildiği için bu, önceden yapılmış
 * gerçek kimlik doğrulamasının server-side kanıtıdır. Çıplak bir admin UUID'sine
 * ASLA güvenilmez; "role='admin' olması" tek başına kimlik doğrulama değildir.
 * adminId, cookie'ye client'tan değil, DOĞRULANMIŞ token sahibinden yazılır.
 */
export async function POST(request: NextRequest) {
  try {
    const rejected = originRejected(request);
    if (rejected) return rejected;

    // HTTPONLY H5: header yoksa primary modda web isteği HttpOnly oturum cookie'si ile (Android hariç).
    let sessionToken = request.headers.get("x-session-token")?.trim() ?? "";
    if (!sessionToken && getSessionCookieConfig().mode === "primary" && !isAndroidAppRequest(request.headers)) {
      sessionToken = readWebSessionCookie(request);
    }
    if (!sessionToken) {
      return NextResponse.json(
        { error: "Admin oturum doğrulaması gerekli." },
        { status: 401 },
      );
    }

    const db = getDb();

    const adminId = await resolveAdminUserIdFromSessionToken(db, sessionToken);
    if (!adminId) {
      return NextResponse.json({ error: "Yetki yok." }, { status: 401 });
    }

    // MEM-015: cookie artık imzasız admin UUID DEĞİL; doğrulanmış OPAK oturum token'ı. Admin
    // kabuğu (app/admin/layout) bu token'ı API ile aynı kuralla doğrular. Eski UUID cookie silinir.
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(ADMIN_SESSION_COOKIE, sessionToken, adminSessionCookieOptions(isProduction));
    response.cookies.set(LEGACY_ADMIN_ID_COOKIE, "", { ...adminSessionCookieOptions(isProduction), maxAge: 0 });

    return response;
  } catch {
    // Hata ayrıntısı/stack client'a sızdırılmaz.
    return NextResponse.json({ error: "Admin oturumu başlatılamadı." }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/admin-session
 * Logout sırasında cookie temizlemek için çağrılır.
 */
export async function DELETE(request: NextRequest) {
  const rejected = originRejected(request);
  if (rejected) return rejected;
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  for (const name of [ADMIN_SESSION_COOKIE, LEGACY_ADMIN_ID_COOKIE]) {
    response.cookies.set(name, "", { ...adminSessionCookieOptions(isProduction), maxAge: 0 });
  }
  return response;
}
