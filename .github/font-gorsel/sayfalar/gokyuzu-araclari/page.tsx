"use client";
// KANIT SAYFASI (yalnız CI runner'ında; ürüne girmez). Gerçek SkyToolsDesk (Gökyüzü Araçları). Oturum yok → erişim yoklaması
// başarısız döner; bileşen kendi tasarımıyla bütün sekmeleri gösterir (sunucu yine engeller). Kredi / sağlayıcı çağrısı yok.
import SkyToolsDesk from "@/app/admin/astroloji/_components/ephemeris/SkyToolsDesk";

export default function Page() {
  return <SkyToolsDesk />;
}
