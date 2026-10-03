import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getServerDb } from "@/lib/supabase-server";
import { ADMIN_SESSION_COOKIE, resolveAdminShellUserId } from "@/lib/auth/adminShellSession";
import AdminSessionApprovalBanner from "@/components/auth/AdminSessionApprovalBanner";

/**
 * Admin route guard — Server Component.
 * proxy.ts cookie varlığını kontrol eder (hızlı red).
 * MEM-015: Bu layout cookie'deki OPAK oturum token'ını API ile AYNI kuralla doğrular:
 * user_sessions'da aktif + sahibi role=admin + active=true. Sahte/bilinen admin UUID'si,
 * uzman token'ı, süresi dolmuş/iptal edilmiş token → kabuk render EDİLMEZ (redirect "/").
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  let adminId: string | null = null;
  try {
    adminId = await resolveAdminShellUserId(getServerDb(), token);
  } catch {
    adminId = null;
  }
  if (!adminId) redirect("/");

  return (
    <>
      {/* OTURUM MODELİ v2: hesabınıza başka cihazdan onay bekleyen web girişi uyarısı. */}
      <AdminSessionApprovalBanner />
      {/* Admin navigation — merkezî içerik yönetimi bağlantıları. */}
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white/80 px-4 py-1.5 text-xs">
        <Link href="/admin/human-design" className="font-semibold text-indigo-700 hover:underline">
          Human Design İçerik Yönetimi
        </Link>
        <Link href="/admin/hd-danismanlik" className="font-semibold text-teal-700 hover:underline">
          Danışmanlık İçeriği
        </Link>
        <Link href="/admin/yebs" className="font-semibold text-violet-700 hover:underline">
          Yaşam Enerjisi Bilgi Sistemi
        </Link>
        <Link href="/admin/magaza" className="font-semibold text-emerald-700 hover:underline">
          Doğal Pazar
        </Link>
      </nav>
      {children}
    </>
  );
}
