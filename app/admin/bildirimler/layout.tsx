import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { getServerDb } from "@/lib/supabase-server";
import { ADMIN_SESSION_COOKIE, resolveAdminShellUserId } from "@/lib/auth/adminShellSession";
import { resolveIsSuperAdmin } from "@/lib/admin/adminGuards";

/**
 * Tüm bildirimler — Server Component (YALNIZ PLATFORM OWNER).
 * Üst admin layout'u "aktif admin" doğrular; bu katman ek olarak owner (is_super_admin) ister. Owner değilse
 * istemci sayfası hiç render edilmez → bildirim API'sine istek de gitmez. Veri yetkisi ayrıca route + DB'de doğrulanır.
 */
export default async function OwnerNotificationsLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  let allowed = false;
  try {
    const db = getServerDb();
    const adminId = await resolveAdminShellUserId(db, token);
    allowed = adminId ? await resolveIsSuperAdmin(db, adminId) : false;
  } catch {
    allowed = false;
  }
  if (!allowed) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-6" data-owner-history-denied>
        <p className="text-sm font-semibold text-slate-600">Bu alan yalnız platform owner’ına açıktır.</p>
      </main>
    );
  }
  return <>{children}</>;
}
