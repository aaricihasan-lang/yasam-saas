import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getServerDb } from "@/lib/supabase-server";
import { ADMIN_SESSION_COOKIE, resolveAdminShellUserId } from "@/lib/auth/adminShellSession";
import { isCampaignOwner } from "@/lib/campaign/adminService";

/**
 * Kampanya Merkezi yönetim kabuğu — Server Component (YALNIZ PLATFORM OWNER).
 * Üst admin layout'u "aktif admin" doğrular; bu katman ek olarak KATI owner (is_super_admin + admin + aktif + demo değil;
 * e-posta fallback YOK) ister. Owner değilse notFound(): sayfa HTML'i ve istemci paketi gönderilmez. Admin olmak yetmez.
 * Veri yetkisi her API çağrısında ayrıca verilir (lib/campaign/ownerApi.ts).
 */
export default async function CampaignOwnerLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  let allowed = false;
  try {
    const db = getServerDb();
    const adminId = await resolveAdminShellUserId(db, token);
    allowed = adminId ? await isCampaignOwner(db, adminId) : false;
  } catch {
    allowed = false;
  }
  if (!allowed) notFound();
  return <>{children}</>;
}
