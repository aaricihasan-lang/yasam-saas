// ============================================================
// YEBS A8 — Lifecycle action map (backend geçiş allowlist'lerinden birebir)
//
// UI KENDİ bağımsız state machine'ini uydurmaz. Buradaki geçişler
// 20260916 canonical_transitions + 20260922 A7 quality_gates allowlist'lerinin
// yansımasıdır. Backend her zaman son otoritedir (write RPC satır kilidiyle
// yeniden değerlendirir). force/bypass/override YOKTUR.
// ============================================================

export type LifecycleGroup = "canonical" | "source" | "claimlike";

export type LifecycleAction = {
  key: string;
  label: string;
  target: string;
  direction: "forward" | "backward";
  destructive: boolean;
  /** A7 kalite/dependency geçişi → aksiyon öncesi eligibility taze çağrılır. */
  eligibilityRequired: boolean;
  reasonRequired: true; // backend tüm transition'larda reason ister
  confirmTitle: string;
  successMessage: string;
};

const A: LifecycleGroup = "canonical";
const B: LifecycleGroup = "source";
const C: LifecycleGroup = "claimlike";

// Yardımcı kısayollar
const fwd = (key: string, label: string, target: string, elig: boolean, confirmTitle: string, ok: string): LifecycleAction =>
  ({ key, label, target, direction: "forward", destructive: false, eligibilityRequired: elig, reasonRequired: true, confirmTitle, successMessage: ok });
const back = (key: string, label: string, target: string, elig: boolean, destructive: boolean, confirmTitle: string, ok: string): LifecycleAction =>
  ({ key, label, target, direction: "backward", destructive, eligibilityRequired: elig, reasonRequired: true, confirmTitle, successMessage: ok });

const ARCHIVE = (elig: boolean): LifecycleAction =>
  ({ key: "archive", label: "Arşivle", target: "archived", direction: "backward", destructive: true, eligibilityRequired: elig, reasonRequired: true, confirmTitle: "Kaydı arşivle", successMessage: "Kayıt arşivlendi." });
const UNARCHIVE: LifecycleAction =
  { key: "unarchive", label: "Arşivden Çıkar", target: "draft", direction: "forward", destructive: false, eligibilityRequired: false, reasonRequired: true, confirmTitle: "Arşivden çıkar", successMessage: "Kayıt taslağa alındı." };

const CANONICAL_MAP: Record<string, LifecycleAction[]> = {
  draft: [fwd("verify", "Doğrula", "verified", false, "Doğrula", "Kayıt doğrulandı.")],
  verified: [
    fwd("approve", "Onayla", "approved", false, "Onayla", "Kayıt onaylandı."),
    back("to_draft", "Taslağa Al", "draft", false, false, "Taslağa al", "Kayıt taslağa alındı."),
  ],
  approved: [
    fwd("publish", "Yayınla", "published", true, "Yayınla", "Kayıt yayımlandı."),
    back("to_verified", "Onayı Geri Al", "verified", false, false, "Onayı geri al", "Onay geri alındı."),
  ],
  published: [
    back("unpublish", "Yayından Al", "approved", true, true, "Yayından al", "Kayıt yayından alındı."),
  ],
};

const SOURCE_MAP: Record<string, LifecycleAction[]> = {
  draft: [fwd("verify", "Doğrula", "verified", false, "Doğrula", "Kaynak doğrulandı."), ARCHIVE(false)],
  verified: [
    fwd("approve", "Onayla", "approved", false, "Onayla", "Kaynak onaylandı."),
    back("to_draft", "Taslağa Al", "draft", false, false, "Taslağa al", "Kaynak taslağa alındı."),
    ARCHIVE(false),
  ],
  approved: [
    fwd("publish", "Yayınla", "published", true, "Yayınla", "Kaynak yayımlandı."),
    back("to_verified", "Onayı Geri Al", "verified", false, false, "Onayı geri al", "Onay geri alındı."),
    ARCHIVE(false),
  ],
  published: [
    back("unpublish", "Yayından Al", "approved", true, true, "Yayından al", "Kaynak yayından alındı."),
    ARCHIVE(true),
  ],
  archived: [UNARCHIVE],
};

const CLAIMLIKE_MAP: Record<string, LifecycleAction[]> = {
  draft: [fwd("to_review", "İncelemeye Al", "under_review", false, "İncelemeye al", "Kayıt incelemeye alındı."), ARCHIVE(false)],
  under_review: [
    fwd("to_needs_verification", "Doğrulamaya Gönder", "needs_verification", false, "Doğrulamaya gönder", "Doğrulamaya gönderildi."),
    back("to_draft", "Taslağa Al", "draft", false, false, "Taslağa al", "Taslağa alındı."),
    ARCHIVE(false),
  ],
  needs_verification: [
    fwd("verify", "Doğrula", "verified", true, "Doğrula", "Kayıt doğrulandı."),
    back("to_review", "İncelemeye Al", "under_review", false, false, "İncelemeye al", "İncelemeye alındı."),
    back("to_draft", "Taslağa Al", "draft", false, false, "Taslağa al", "Taslağa alındı."),
    ARCHIVE(false),
  ],
  verified: [
    fwd("approve", "Onayla", "approved", true, "Onayla", "Kayıt onaylandı."),
    back("to_needs_verification", "Doğrulamayı Geri Al", "needs_verification", false, false, "Geri al", "Doğrulama geri alındı."),
    ARCHIVE(false),
  ],
  approved: [
    fwd("publish", "Yayınla", "published", true, "Yayınla", "Kayıt yayımlandı."),
    back("to_verified", "Onayı Geri Al", "verified", false, false, "Onayı geri al", "Onay geri alındı."),
    ARCHIVE(false),
  ],
  published: [
    back("unpublish", "Yayından Al", "approved", true, true, "Yayından al", "Kayıt yayından alındı."),
    ARCHIVE(true),
  ],
  archived: [UNARCHIVE],
};

const GROUP_MAP: Record<LifecycleGroup, Record<string, LifecycleAction[]>> = {
  canonical: CANONICAL_MAP,
  source: SOURCE_MAP,
  claimlike: CLAIMLIKE_MAP,
};

export const ENTITY_LIFECYCLE_GROUP: Record<string, LifecycleGroup> = {
  tradition: A, school: A, concept: A, source: B, claim: C, relation: C,
};

/** Verilen (grup, mevcut durum) için görünür lifecycle aksiyonları. */
export function lifecycleActions(group: LifecycleGroup, status: string): LifecycleAction[] {
  return GROUP_MAP[group][status] ?? [];
}
