import type { ReactNode } from "react";
import { WorkspaceRoutes } from "@/app/admin/dogaltas-kutuphane/_components/ownerRoutes";
import { requireStoneLibraryFlag } from "../_shared/flag";

/**
 * Doğaltaş modülü içi owner çalışma alanı (taş / yeni taş / çeviri / uzman erişimi). Yönetim Paneli'ndeki aynı bileşenler,
 * Doğaltaş adresleriyle. Hazırlık kapısı kapalıysa sunucuda 404. Owner kararı her veri / işlem çağrısında sunucuda verilir:
 * owner olmayan herkes API'den tek tip 404 alır ve ekran "bulunamadı" durumunu gösterir (veri istemciye gitmez).
 */
export default async function StoneLibraryWorkspaceLayout({ children }: { children: ReactNode }) {
  await requireStoneLibraryFlag();
  return <WorkspaceRoutes>{children}</WorkspaceRoutes>;
}
