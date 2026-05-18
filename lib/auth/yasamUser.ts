/** Oturum — Supabase `login_user` RPC / users tablosundan gelen rol ile */

export type UserRole = "admin" | "expert";

export type SubscriptionStatus = "active" | "trial" | "passive" | string;

export type YasamUser = {
  id: string;
  tenant_id?: string;
  name?: string;
  email?: string;
  role: UserRole;
  status?: string;
  plan?: string;
  subscription_status?: SubscriptionStatus;
  trial_ends_at?: string;
};

const LOCKED_SUBSCRIPTION_TOAST =
  "Üyeliğiniz aktif değil. Yönetici ile iletişime geçin.";

const STORAGE_KEY = "yasam_user";

export function normalizeRole(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isAllowedLoginRole(role: unknown): role is UserRole {
  const r = normalizeRole(role);
  return r === "admin" || r === "expert";
}

/** login_user RPC satırı veya localStorage kaydını doğrular */
export function parseLoginUserRecord(raw: unknown): YasamUser | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const role = normalizeRole(r.role);
  if (role !== "admin" && role !== "expert") return null;
  const id = r.id != null ? String(r.id).trim() : "";
  if (!id) return null;
  return {
    id,
    tenant_id: r.tenant_id != null ? String(r.tenant_id) : undefined,
    name: r.name != null ? String(r.name) : undefined,
    email: r.email != null ? String(r.email) : undefined,
    role,
    status: r.status != null ? String(r.status) : undefined,
    plan: r.plan != null ? String(r.plan).trim() : undefined,
    subscription_status:
      r.subscription_status != null
        ? String(r.subscription_status).trim().toLowerCase()
        : undefined,
    trial_ends_at:
      r.trial_ends_at != null ? String(r.trial_ends_at).trim() : undefined,
  };
}

export function normalizeSubscriptionStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Deneme süresi geçerli mi (trial_ends_at şu anki zamandan sonra) */
export function isTrialSubscriptionActive(trialEndsAt: string | undefined): boolean {
  if (!trialEndsAt) return false;
  const end = new Date(trialEndsAt);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() > Date.now();
}

/** Ana panel modüllerine tam erişim (admin her zaman açık) */
export function hasFullPanelAccess(user: YasamUser | null | undefined): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;

  const status = normalizeSubscriptionStatus(user.subscription_status);

  if (status === "active") return true;
  if (status === "passive") return false;
  if (status === "trial") return isTrialSubscriptionActive(user.trial_ends_at);

  return false;
}

export { LOCKED_SUBSCRIPTION_TOAST };

export function readYasamUser(): YasamUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const user = parseLoginUserRecord(JSON.parse(raw));
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return user;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveYasamUser(user: YasamUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearYasamUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function isAdminUser(user: YasamUser | null | undefined): boolean {
  return normalizeRole(user?.role) === "admin";
}

export function isExpertUser(user: YasamUser | null | undefined): boolean {
  return normalizeRole(user?.role) === "expert";
}
