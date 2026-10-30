import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getServerDb } from "@/lib/supabase-server";
import {
  ADMIN_SESSION_COOKIE,
  resolveAdminShellSession,
  type AdminShellResolution,
} from "@/lib/auth/adminShellSession";
import ModuleAccessPending from "@/components/auth/ModuleAccessPending";
import { isAstrologyShellOwner } from "@/lib/astrology/access/ownerGate";
import { isEducationOwner } from "@/lib/human-design/education/educationAccess";
import { privateEnvKillSwitch, resolvePrivateActor } from "@/lib/human-design/education/private/privateAccess";

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

  // Final-A3: geçici DB/RPC hatası "yetkisiz" sayılıp "/"'a atılmaz; kabuk yine render edilmez
  // (fail-closed) ve "doğrulanamadı / tekrar dene" gösterilir. Açık red → eskisi gibi redirect("/").
  let shell: AdminShellResolution;
  try {
    shell = await resolveAdminShellSession(getServerDb(), token);
  } catch {
    shell = { status: "unavailable" };
  }
  if (shell.status === "unavailable") return <ModuleAccessPending failed />;
  if (shell.status !== "admin") redirect("/");
  const adminId = shell.adminId;

  // Astroloji (satış sonrası, OWNER-ONLY pilot): bağlantı yalnız kill switch açık + katı owner ise
  // SUNUCUDA render edilir; diğer adminlerin HTML'inde hiç bulunmaz. Kill switch kapalıysa DB'ye gidilmez.
  let showAstrology = false;
  try {
    showAstrology = await isAstrologyShellOwner(getServerDb(), adminId);
  } catch {
    showAstrology = false;
  }
  // Hazır Eğitim Haritaları: bağlantı yalnız KATI platform owner'a sunucuda render edilir. Owner kararı 31.10.2026:
  // owner yönetimi katalog kapısından bağımsız (kapı owner panelindeki anahtardır).
  let showEducation = false;
  try {
    showEducation = await isEducationOwner(getServerDb(), adminId);
  } catch {
    showEducation = false;
  }
  // Eğitmene Özel Eğitim Haritaları: bağlantı yalnız DB'de gerçek owner'a (acil kapatma hariç). Owner kararı 31.10.2026:
  // arşiv anahtarı owner ekranında; diğer adminlerin HTML'inde bağlantı hiç bulunmaz.
  let showPrivateEducation = false;
  try {
    showPrivateEducation = !privateEnvKillSwitch() && (await resolvePrivateActor(getServerDb(), adminId)) === "owner";
  } catch {
    showPrivateEducation = false;
  }

  return (
    <>
      {/* Admin navigation — merkezî içerik yönetimi bağlantıları. */}
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white/80 px-4 py-1.5 text-xs">
        <Link href="/admin/human-design" className="font-semibold text-indigo-700 hover:underline">
          Human Design İçerik Yönetimi
        </Link>
        <Link href="/admin/hd-danismanlik" className="font-semibold text-teal-700 hover:underline">
          Danışmanlık İçeriği
        </Link>
        <Link href="/admin/magaza" className="font-semibold text-emerald-700 hover:underline">
          Doğal Pazar
        </Link>
        <Link href="/admin/yasam-hafizasi" className="font-semibold text-sky-700 hover:underline">
          Yaşam Hafızası Kapsamı
        </Link>
        {showAstrology && (
          <Link href="/admin/astroloji" className="font-semibold text-fuchsia-700 hover:underline">
            Gökyüzü Atlası
          </Link>
        )}
        {showEducation && (
          <Link href="/admin/hd-egitim-haritalari" className="font-semibold text-violet-700 hover:underline">
            Hazır Eğitim Haritaları
          </Link>
        )}
        {showPrivateEducation && (
          <Link href="/admin/hd-ozel-egitim" className="font-semibold text-violet-700 hover:underline">
            Eğitmen Özel Eğitim Arşivleri
          </Link>
        )}
        {(showEducation || showPrivateEducation) && (
          <Link href="/admin/hd-egitim-cizimleri" className="font-semibold text-violet-700 hover:underline">
            Eğitim Çizim Katmanları
          </Link>
        )}
      </nav>
      {children}
    </>
  );
}
