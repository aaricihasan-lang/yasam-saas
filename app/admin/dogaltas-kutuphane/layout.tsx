import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getServerDb } from "@/lib/supabase-server";
import { ADMIN_SESSION_COOKIE, resolveAdminShellUserId } from "@/lib/auth/adminShellSession";
import { isStoneLibraryOwner } from "@/lib/stone-library/access";
import { requireStoneLibraryFlag } from "@/app/dogaltas/kutuphane/_shared/flag";

/**
 * Doğaltaş Kütüphanesi owner yönetim kabuğu — Server Component (YALNIZ KATI OWNER).
 * Hazırlık kapısı kapalıysa ya da oturum sahibi owner değilse notFound(): sayfa HTML'i gönderilmez.
 * Veri yetkisi her API çağrısında sunucuda ayrıca verilir (owner olmayan herkes tek tip 404 alır).
 */
export default async function StoneLibraryOwnerLayout({ children }: { children: ReactNode }) {
  await requireStoneLibraryFlag();
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  let allowed = false;
  try {
    const db = getServerDb();
    const adminId = await resolveAdminShellUserId(db, token);
    allowed = await isStoneLibraryOwner(db, adminId);
  } catch {
    allowed = false;
  }
  if (!allowed) notFound();
  return <>{children}</>;
}
