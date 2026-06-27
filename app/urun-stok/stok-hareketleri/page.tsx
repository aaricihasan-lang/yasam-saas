import { redirect } from "next/navigation";

/**
 * Stok Hareketleri — K-3 kararıyla şimdilik GİZLENDİ.
 * Ürün & Stok Merkezi'nin amacı resmi stok/muhasebe değil; basit stok takibi.
 * Ayrı hareket günlüğü (fiş/fatura/hareket kaydı) yapılmadı. Bu rota artık
 * canlı stok kontrol ekranına yönlendirir. İleride ihtiyaç olursa geri alınır
 * (önceki salt-okuma uygulaması git geçmişinde).
 */
export default function StokHareketleriPage() {
  redirect("/urun-stok/canli-stok");
}
