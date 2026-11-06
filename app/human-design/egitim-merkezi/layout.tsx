import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { privateEnvKillSwitch } from "@/lib/human-design/education/private/privateAccess";

/**
 * Human Design Eğitim Merkezi — eğitmen kabuğu (FAZ 7) · Server Component.
 *   1) Acil kapatma (HD_PRIVATE_EDUCATION_ENABLED === "false") → DB'ye gitmeden notFound(). Owner kararı 31.10.2026: aksi hâlde
 *      kapı owner'ın arşiv anahtarıdır (DB); kapalıyken eğitmen yoklaması 404 → sayfa içerik çizmez.
 *   2) Oturum istemcide (HD ile aynı mimari): sayfa, sunucu erişim yoklamasından 200 almadan içerik çizmez.
 *   3) Veri yetkisi HER API çağrısında sunucuda ve DB'de verilir (requirePrivateTrainer + hd_edu_priv_* RPC).
 */
export default function EducationCenterLayout({ children }: { children: ReactNode }) {
  if (privateEnvKillSwitch()) notFound();
  return <>{children}</>;
}

export const dynamic = "force-dynamic";
