/**
 * ÜYE YÖNETİMİ FAZ 2 (MEM-018) — ortak durum rozetleri ve TEK terminoloji kaynağı.
 * Ham enum (expert/admin/approved…) kullanıcıya gösterilmez.
 *
 * Eksenler (birbirinin yerine kullanılmaz):
 *   ONAY DURUMU: Onay Bekliyor · Onaylandı · Reddedildi
 *   HESAP DURUMU: Aktif · Pasif
 *   ROL: Uzman · Yönetici
 *   ÖDEME: Ödendi · Ödeme Bekliyor · Gecikti · Ödemeden Muaf · Belirtilmemiş
 *   GÜVENLİK İSTİSNASI (oturum/cihaz kısıtı yok) ödeme muafiyetinden AYRIDIR.
 */
import type { ApprovalStatusUi, ManagedUserRole, PaymentStatusUi } from "@/lib/admin/userManagement";

export const ROLE_LABELS: Record<ManagedUserRole, string> = { expert: "Uzman", admin: "Yönetici" };
export const APPROVAL_LABELS: Record<ApprovalStatusUi, string> = {
  pending: "Onay Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};
export const ACCOUNT_LABELS = { active: "Aktif", passive: "Pasif" } as const;
export const PAYMENT_LABELS_UI: Record<PaymentStatusUi, string> = {
  paid: "Ödendi",
  pending: "Ödeme Bekliyor",
  overdue: "Gecikti",
  exempt: "Ödemeden Muaf",
  unknown: "Belirtilmemiş",
};

const pill = "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] font-black ring-1";

export function RoleBadge({ role }: { role: ManagedUserRole }) {
  return (
    <span
      className={`${pill} ${
        role === "admin" ? "bg-violet-100 text-violet-900 ring-violet-200" : "bg-sky-100 text-sky-900 ring-sky-200"
      }`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export function ApprovalBadge({ status }: { status: ApprovalStatusUi }) {
  const tone =
    status === "approved"
      ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
      : status === "rejected"
        ? "bg-rose-100 text-rose-900 ring-rose-200"
        : "bg-amber-100 text-amber-900 ring-amber-200";
  return <span className={`${pill} ${tone}`}>{APPROVAL_LABELS[status]}</span>;
}

export function AccountBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`${pill} ${
        active ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-slate-200 text-slate-700 ring-slate-300"
      }`}
    >
      {active ? ACCOUNT_LABELS.active : ACCOUNT_LABELS.passive}
    </span>
  );
}

export function PackageBadge({ label }: { label: string }) {
  return <span className={`${pill} bg-amber-50 text-amber-950 ring-amber-200`}>Paket: {label}</span>;
}

const PAYMENT_TONES: Record<PaymentStatusUi, string> = {
  paid: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  pending: "bg-amber-100 text-amber-900 ring-amber-200",
  overdue: "bg-rose-100 text-rose-900 ring-rose-200",
  exempt: "bg-sky-100 text-sky-900 ring-sky-200",
  unknown: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function PaymentBadge({ status }: { status: PaymentStatusUi }) {
  return <span className={`${pill} ${PAYMENT_TONES[status]}`}>Ödeme: {PAYMENT_LABELS_UI[status]}</span>;
}

export function SecurityExemptBadge() {
  return (
    <span className={`${pill} bg-fuchsia-50 text-fuchsia-900 ring-fuchsia-200`} title="Oturum ve cihaz kısıtları uygulanmaz">
      Güvenlik istisnası
    </span>
  );
}
