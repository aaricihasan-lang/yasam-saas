import type { CSSProperties } from "react";

/**
 * FAZ 1 / P4 — Merkezî provenance rozeti.
 *
 * Admin kütüphanesinden uzmana BAĞIMSIZ KOPYA olarak gönderilen kayıtlar için
 * "Adminden gelen bilgi / Kaynak: Admin Kütüphanesi" etiketi. Yalnız köken
 * bilgisidir: kaydı KİLİTLEMEZ, düzenleme/silme ENGELLEMEZ, admin sahipliği
 * OLUŞTURMAZ, canlı senkron ANLAMINA GELMEZ. Admin UUID/e-posta GÖSTERMEZ.
 *
 * Kullanım: <AdminTransferBadge originType={row.origin_type} />
 * (origin_type !== 'admin_transfer' ise hiçbir şey render etmez.)
 */

export const ADMIN_TRANSFER_ORIGIN = "admin_transfer";

/** Bir kaydın admin hediyesi (bağımsız kopya) olup olmadığını belirler. */
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

export function AdminTransferBadge({
  originType,
  variant = "chip",
  className,
  style,
}: Props) {
  if (!isAdminTransferOrigin(originType)) return null;

  const base =
    "inline-flex max-w-full items-center gap-1 truncate rounded-full bg-violet-50 font-black uppercase tracking-wide text-violet-700 ring-1 ring-violet-200";
  const size =
    variant === "inline"
      ? "px-2.5 py-1 text-[10px]"
      : "px-2 py-0.5 text-[9px]";

  return (
    <span
      className={`${base} ${size}${className ? ` ${className}` : ""}`}
      style={style}
      title="Bu kayıt Admin Kütüphanesi'nden bağımsız kopya olarak eklendi. Düzenleyebilir veya silebilirsiniz."
    >
      🎁 Admin Kütüphanesi
    </span>
  );
}

export default AdminTransferBadge;
