import type { CSSProperties } from "react";

/**
 * FAZ 1 / P4 — Merkezî provenance rozeti (ARTIK GÖRSEL ETİKET RENDER ETMEZ).
 *
 * ÜRÜN KARARI (2026-08-11): Admin → uzman transfer edilen kayıtlar uzman
 * tarafında HİÇBİR görsel/tekst provenance etiketi göstermez. Bu bileşen tüm
 * çağrı yerlerinde artık `null` render eder — hedef kayıt uzmanın kendi bağımsız
 * kaydı gibi görünür.
 *
 * DEĞİŞMEYEN: origin_type / origin_label / origin_source_id /
 * origin_transfer_batch_id / transferred_at alanları DB'de + audit/rollback/teknik
 * iz sürme için KORUNUR. Transfer snapshot mantığı, edit/delete davranışı ve çağrı
 * yerleri (props kontratı) DEĞİŞMEZ; yalnız görsel rozet kaldırılmıştır.
 *
 * Admin paneli / transfer / audit ekranları bu karardan ETKİLENMEZ (bunlar bu
 * bileşeni kullanmaz; kaynağı teknik olarak görmeye devam eder).
 */

export const ADMIN_TRANSFER_ORIGIN = "admin_transfer";

/** Bir kaydın admin hediyesi (bağımsız kopya) olup olmadığını belirler (mantık; görsel değil). */
export function isAdminTransferOrigin(originType: unknown): boolean {
  return originType === ADMIN_TRANSFER_ORIGIN;
}

type Props = {
  originType?: unknown;
  /** "chip" (varsayılan, listelerde) veya "inline" (detay başlıkları). */
  variant?: "chip" | "inline";
  className?: string;
  style?: CSSProperties;
};

// Props kontratı korunur (çağrı yerleri tip-güvenli kalsın); görsel çıktı yoktur.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AdminTransferBadge(_props: Props) {
  return null;
}

export default AdminTransferBadge;
