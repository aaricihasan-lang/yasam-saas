import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * /admin/* rotalarını korur (hızlı ret).
 * Admin oturum cookie'si (`yasam_admin_session`, opak oturum token'ı) yoksa ana sayfaya
 * redirect eder. DB sorgusu yapmaz — token + admin doğrulaması app/admin/layout.tsx'te
 * (lib/auth/adminShellSession) yapılır. Sabit, lib/auth/adminShellSession.ADMIN_SESSION_COOKIE
 * ile aynıdır (proxy bundle'ına Supabase bağımlılığı sokmamak için burada tekrarlanır).
 */
const ADMIN_SESSION_COOKIE = "yasam_admin_session";

export function proxy(request: NextRequest) {
  const adminCookie = request.cookies.get(ADMIN_SESSION_COOKIE);

  if (!adminCookie?.value) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
