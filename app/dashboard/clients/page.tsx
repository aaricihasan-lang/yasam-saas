import { redirect } from "next/navigation";

// /dashboard/clients → /danisan-yolculugu/liste adresine yönlendiriliyor.
// Danışan detay sayfaları /dashboard/clients/[id] konumunda kalmaya devam eder.
export default function ClientsPageRedirect() {
  redirect("/danisan-yolculugu/liste");
}
