import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getServerDb } from "@/lib/supabase-server";
import { ADMIN_SESSION_COOKIE, resolveAdminShellUserId } from "@/lib/auth/adminShellSession";
import { isAstrologyShellOwner } from "@/lib/astrology/access/ownerGate";
import { isAstrologyModuleEnabled } from "@/lib/astrology/config";

/**
 * Astroloji kabuk kapısı — Server Component (OWNER-ONLY, satış sonrası pilot).
 *
 * Üst admin layout'u yalnız "aktif admin" doğrular; bu katman ek olarak:
 *   1) kill switch (ASTROLOGY_MODULE_ENABLED === "true") — kapalıysa DB'ye gitmeden notFound(),
 *   2) opak admin oturum token'ı → aktif admin (API ile aynı kural),
 *   3) KATI owner (users.is_super_admin + admin + aktif; e-posta fallback YOK).
 * Herhangi biri başarısızsa notFound() — sayfa HTML'i ve istemci paketi hiç gönderilmez.
 * Bu kapı UI içindir; veri yetkisi ayrıca her API route'unda requireAstrologyOwner ile verilir.
 * cookies() kullanımı segmenti dinamik yapar (statik önbellek yok).
 */
export default async function AstrologyLayout({ children }: { children: ReactNode }) {
  if (!isAstrologyModuleEnabled()) notFound();
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  let allowed = false;
  try {
    const db = getServerDb();
    const adminId = await resolveAdminShellUserId(db, token);
    allowed = await isAstrologyShellOwner(db, adminId);
  } catch {
    allowed = false;
  }
  if (!allowed) notFound();
  return <>{children}</>;
}
