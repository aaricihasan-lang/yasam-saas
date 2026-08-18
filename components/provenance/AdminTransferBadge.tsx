import type { CSSProperties } from "react";

/**
 * Merkezî provenance rozeti — NÖTRLENDİ (kalıcı olarak hiçbir şey render etmez).
 *
 * BAĞLAYICI ÜRÜN KURALI (Veri Aktarım Merkezi): admin kütüphanesinden uzmana
 * aktarılmış kayıt, uzman tarafında "Admin'den geldi / Admin Kütüphanesi" benzeri
 * HİÇBİR görünür köken etiketi taşımaz — kayıt uzmanın kendi normal kaydı gibi
 * görünür (liste/detay/edit/rapor). Bu component eskiden 🎁 "Admin Kütüphanesi"
 * chip'i gösteriyordu; ürün kuralı gereği artık her durumda `null` döner.
 *
 * Aktarım route'u da GÖRÜNÜR origin_type='admin_transfer'/origin_label alanlarını
 * ARTIK YAZMAZ (yalnız iç audit/rollback alanları). Böylece hem yeni aktarımlar
 * hem de eski aktarılmış satırlar için hiçbir yerde admin köken rozeti görünmez.
 *
 * NOT: İmzalar (props/exports) geriye-uyum için korunur; 11 modül yüzeyi bu
 * component'i import etmeye devam eder ama görünür çıktı üretmez.
 */

export const ADMIN_TRANSFER_ORIGIN = "admin_transfer";

/**
 * Geriye-uyum export'u. Görünür rozet KALDIRILDIĞI için tüketiciler bu değeri
 * yalnız iç mantıkta kullanabilir; UI'da köken göstermek için KULLANILMAMALIDIR.
 */
export function isAdminTransferOrigin(originType: unknown): boolean {
  return originType === ADMIN_TRANSFER_ORIGIN;
}

type Props = {
  originType?: unknown;
  variant?: "chip" | "inline";
  className?: string;
  style?: CSSProperties;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AdminTransferBadge(_props: Props) {
  // Ürün kuralı: uzmana görünür admin köken etiketi YOK. Her zaman null.
  return null;
}

export default AdminTransferBadge;
