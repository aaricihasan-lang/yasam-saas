import { memberAccountState, type MemberAccountState } from "@/lib/admin/membershipActions";

/**
 * Deneme Üyeleri — HESAP durumu ile DENEME durumu ayrı gösterilir (yalnız gösterim; erişim kararı DEĞİL).
 *   Hesap  : users.active + users.archived_at (Aşama 4a modeli: Aktif / Pasif / Arşivde)
 *   Deneme : admin_trial_list `phase` (Başlamamış / Devam ediyor / Süresi dolmuş / İncelemede / Durdurulmuş / Pro)
 * Pasif bir hesapta deneme süresi işlemeye devam edebilir; tek "Aktif" rozeti bu durumu yanlış anlatıyordu.
 */
export type TrialPhase = "not_started" | "active" | "expired" | "review" | "suspended" | "converted";

export const TRIAL_PHASE_LABEL: Record<TrialPhase, string> = {
  not_started: "Başlamamış",
  active: "Devam ediyor",
  expired: "Süresi dolmuş",
  review: "İncelemede",
  suspended: "Durdurulmuş",
  converted: "Pro",
};
export const TRIAL_PHASE_CLASS: Record<TrialPhase, string> = {
  not_started: "bg-slate-100 text-slate-700",
  active: "bg-emerald-50 text-emerald-700",
  expired: "bg-amber-50 text-amber-800",
  review: "bg-rose-50 text-rose-700",
  suspended: "bg-slate-200 text-slate-700",
  converted: "bg-violet-50 text-violet-700",
};

export const ACCOUNT_STATE_LABEL: Record<MemberAccountState, string> = {
  active: "Aktif",
  passive: "Pasif",
  archived: "Arşivde",
};
export const ACCOUNT_STATE_CLASS: Record<MemberAccountState, string> = {
  active: "bg-emerald-50 text-emerald-700",
  passive: "bg-rose-50 text-rose-700",
  archived: "bg-slate-200 text-slate-700",
};

/**
 * Satırdaki hesap durumu. `active` hiç gelmediyse (beklenmeyen yanıt) null → rozet çizilmez; tahminle "Pasif"
 * ya da "Aktif" yazılmaz. `archived_at` gelmediyse (4a öncesi şema / okuma hatası) yalnız `active`e bakılır:
 * arşiv ⇒ pasif değişmezi sayesinde arşivdeki hesap en kötü "Pasif" görünür, hiçbir zaman "Aktif" değil.
 */
export function trialAccountState(row: { active?: unknown; archived_at?: unknown }): MemberAccountState | null {
  if (typeof row.active !== "boolean") return null;
  return memberAccountState({ active: row.active, archivedAt: row.archived_at });
}

/** Hesap kullanılamıyorken (pasif / arşiv) deneme durumunun ne anlama geldiğini açıklayan kısa not. */
export function trialAccountNote(account: MemberAccountState | null, phase: TrialPhase): string | null {
  if (account === null || account === "active") return null;
  const head = account === "archived" ? "Hesap arşivde" : "Hesap pasif";
  if (phase === "active") return `${head}: üye giriş yapamaz. Deneme süresi hesap durumundan bağımsız işlemeye devam eder.`;
  if (phase === "not_started") return `${head}: üye giriş yapamaz; deneme ilk başarılı girişte başlayacağı için henüz başlamadı.`;
  return `${head}: üye giriş yapamaz. Deneme durumu ayrıca gösterilir.`;
}
