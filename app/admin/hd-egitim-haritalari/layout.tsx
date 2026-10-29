import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getServerDb } from "@/lib/supabase-server";
import { ADMIN_SESSION_COOKIE, resolveAdminShellUserId } from "@/lib/auth/adminShellSession";
import { isEducationOwner } from "@/lib/human-design/education/educationAccess";

/**
 * Hazır Eğitim Haritaları yönetim kabuğu — Server Component (YALNIZ PLATFORM OWNER).
 * Üst admin layout'u "aktif admin" doğrular; bu katman ek olarak opak admin oturum token'ı → aktif admin →
 * KATI owner (users.is_super_admin + admin + aktif + demo değil; e-posta fallback YOK) ister.
 * Owner değilse notFound(): sayfa HTML'i ve istemci paketi gönderilmez. Veri yetkisi her API çağrısında ayrıca verilir.
 */
export default async function EducationOwnerLayout({ children }: { children: ReactNode }) {
  // Owner yönetim ekranı katalog hazırlık kapısından BAĞIMSIZ (owner kararı 29.10.2026); yalnız KATI owner girer.
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  let allowed = false;
  try {
    const db = getServerDb();
    const adminId = await resolveAdminShellUserId(db, token);
    allowed = await isEducationOwner(db, adminId);
  } catch {
    allowed = false;
  }
  if (!allowed) notFound();
  return <>{children}</>;
}
