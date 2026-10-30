import CatalogClient from "@/app/admin/dogaltas-kutuphane/CatalogClient";

/**
 * Kütüphane Yönetimi (owner): taş yönetimi kataloğu — Yönetim Paneli'ndeki aynı bileşen, Doğaltaş adresleriyle (layout).
 * Owner kararı sunucudadır: katalog verisi owner ucundan gelir; owner olmayan herkes tek tip 404 → "bulunamadı" (veri yok).
 */
export default function StoneLibraryWorkspaceIndex() {
  return <CatalogClient />;
}
