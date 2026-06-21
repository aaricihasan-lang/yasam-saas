import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * /admin/* rotalarını korur.
 * yasam_admin_id cookie'si yoksa ana sayfaya redirect eder.
 * DB sorgusu yapmaz — DB doğrulaması app/admin/layout.tsx'te yapılır.
 */
export function proxy(request: NextRequest) {
  const adminCookie = request.cookies.get("yasam_admin_id");

  if (!adminCookie?.value) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
