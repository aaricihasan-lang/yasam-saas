import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getServerDb } from "@/lib/supabase-server";
import { ADMIN_SESSION_COOKIE, resolveAdminShellUserId } from "@/lib/auth/adminShellSession";
import { resolvePrivateActor } from "@/lib/human-design/education/private/privateAccess";
import { educationKillSwitch } from "@/lib/human-design/education/educationTrainingAccess";

/**
 * Eğitim Çizim Katmanları yönetimi — Server Component (YALNIZ PLATFORM OWNER; FAZ 8).
 * Acil kapatmada (iki eğitim bayrağı da "false") DB'ye gitmeden notFound() — owner kararı 31.10.2026: owner yönetimi
 * kapılardan bağımsız. Aksi hâlde opak admin oturumu → DB'de gerçek owner.
 * role=admin owner DEĞİLDİR. Owner değilse sayfa HTML'i ve istemci paketi gönderilmez; veri yetkisi her API çağrısında ayrıca.
 */
export default async function AnnotationOwnerLayout({ children }: { children: ReactNode }) {
  if (educationKillSwitch()) notFound();
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
