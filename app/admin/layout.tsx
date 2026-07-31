import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import type { ReactNode } from "react";

/**
 * Admin route guard — Server Component.
 * middleware.ts cookie varlığını kontrol eder (hızlı red).
 * Bu layout DB'de role=admin AND active=true doğrular (manipülasyon koruması).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const adminId = cookieStore.get("yasam_admin_id")?.value?.trim();

  if (!adminId) redirect("/");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) redirect("/");

  const db = createClient(supabaseUrl, serviceKey);

  const { data } = await db
    .from("users")
    .select("id, role")
    .eq("id", adminId)
    .eq("role", "admin")
    .eq("active", true)
    .maybeSingle();

  if (!data) redirect("/");

  return (
    <>
      {/* Admin navigation — Human Design merkezî içerik yönetimi bağlantısı (tek). */}
      <nav className="border-b border-slate-200 bg-white/80 px-4 py-1.5 text-xs">
        <Link href="/admin/human-design" className="font-semibold text-indigo-700 hover:underline">
          Human Design İçerik Yönetimi
        </Link>
      </nav>
      {children}
    </>
  );
}
