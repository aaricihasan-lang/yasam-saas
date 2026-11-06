import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getServerDb } from "@/lib/supabase-server";
import { ADMIN_SESSION_COOKIE, resolveAdminShellUserId } from "@/lib/auth/adminShellSession";
import { privateEnvKillSwitch, resolvePrivateActor } from "@/lib/human-design/education/private/privateAccess";

/**
 * Eğitmen Özel Eğitim Arşivleri yönetimi — Server Component (YALNIZ PLATFORM OWNER; FAZ 7).
 * Acil kapatma (HD_PRIVATE_EDUCATION_ENABLED="false") → DB'ye gitmeden notFound() (owner kararı 31.10.2026: arşiv anahtarı bu
 * ekrandadır, yönetim kapıdan bağımsız). Aksi hâlde opak admin oturumu → aktif admin →
 * DB'de gerçek owner (hd_edu_priv_whoami: is_super_admin + admin + aktif + demo değil). role=admin owner DEĞİLDİR.
 * Owner değilse sayfa HTML'i ve istemci paketi gönderilmez. Veri yetkisi her API çağrısında ayrıca verilir.
 * Kapsam: YALNIZ izinli eğitim arşivi kayıtları (24.08 politikasının owner'ın yazılı onayıyla dar istisnası, 23.10.2026).
 */
export default async function PrivateEducationOwnerLayout({ children }: { children: ReactNode }) {
  if (privateEnvKillSwitch()) notFound();
  const cookieStore = await cookies();
  let allowed = false;
  try {
    const db = getServerDb();
    const adminId = await resolveAdminShellUserId(db, cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    allowed = !!adminId && (await resolvePrivateActor(db, adminId)) === "owner";
  } catch {
    allowed = false;
  }
  if (!allowed) notFound();
  return <>{children}</>;
}

export const dynamic = "force-dynamic";
