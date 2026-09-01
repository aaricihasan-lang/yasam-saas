import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveAdminUserIdFromSessionToken } from "@/lib/auth/credentialLogin";

export const runtime = "nodejs";

const COOKIE_NAME = "yasam_admin_id";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 saat

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role yapılandırması eksik.");
  return createClient(url, key);
}

const isProduction = process.env.NODE_ENV === "production";

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
    const sessionToken = request.headers.get("x-session-token")?.trim() ?? "";
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

    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, adminId, {
      httpOnly: true,
      sameSite: "strict",
      secure: isProduction,
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

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
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  });
  return response;
}
