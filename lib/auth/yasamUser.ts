/** Oturum — Supabase `login_user` RPC / users tablosundan gelen rol ile */

import { hasExpertMembershipAccess } from "@/lib/auth/membership";
import {
  parseModulePermissions,
  type ModulePermissions,
} from "@/lib/auth/modulePermissions";
import { clearDemoUrunStok } from "@/lib/demo/demoUrunStok";

export type UserRole = "admin" | "expert";

export type SubscriptionStatus = "active" | "trial" | "passive" | string;

export type ApprovalStatus = "pending" | "approved" | "rejected" | string;

export type YasamUser = {
  id: string;
  tenant_id?: string;
  full_name?: string;
  name?: string;
  email?: string;
  role: UserRole;
  status?: string;
  plan?: string;
  package_type?: string;
  subscription_status?: SubscriptionStatus;
  membership_status?: string;
  trial_started_at?: string;
  trial_ends_at?: string;
  membership_started_at?: string;
  membership_ends_at?: string | null;
  approval_status?: ApprovalStatus;
  active?: boolean;
  module_permissions?: ModulePermissions;
  admin_level?: string;
  is_demo_account?: boolean;
};

const LOCKED_SUBSCRIPTION_TOAST =
  "Üyeliğiniz aktif değil. Yönetici ile iletişime geçin.";

export const PENDING_APPROVAL_MESSAGE =
  "Hesabınız yönetici onayı bekliyor.";

export const INACTIVE_ACCOUNT_MESSAGE =
  "Hesabınız pasif durumda. Lütfen sistem yöneticisiyle iletişime geçin.";

const STORAGE_KEY = "yasam_user";
const SESSION_TOKEN_KEY = "yasam_session_token";

/** Aynı oturumda tekrarlayan users SELECT'lerini sınırla */
const USER_SYNC_TTL_MS = 90_000;

let lastUserSyncAt = 0;
let syncInFlight: Promise<YasamUser | null> | null = null;

export function invalidateYasamUserSyncCache(): void {
  lastUserSyncAt = 0;
  syncInFlight = null;
}

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

  const fullNameFromRow =
    r.full_name ?? r.fullName ?? null;
  const nameRaw = r.name != null ? String(r.name).trim() : "";
  const fullName =
    fullNameFromRow != null
      ? String(fullNameFromRow).trim()
      : nameRaw && !nameRaw.includes("@")
        ? nameRaw
        : undefined;

  return {
    id,
    tenant_id: r.tenant_id != null ? String(r.tenant_id) : undefined,
    full_name: fullName || undefined,
    name: nameRaw || undefined,
    email: r.email != null ? String(r.email).trim() : undefined,
    role,
    status: r.status != null ? String(r.status) : undefined,
    plan: r.plan != null ? String(r.plan).trim() : undefined,
    package_type:
      r.package_type != null ? String(r.package_type).trim().toLowerCase() : undefined,
    subscription_status:
      r.subscription_status != null
        ? String(r.subscription_status).trim().toLowerCase()
        : undefined,
    membership_status:
      r.membership_status != null
        ? String(r.membership_status).trim().toLowerCase()
        : undefined,
    trial_started_at:
      r.trial_started_at != null ? String(r.trial_started_at).trim() : undefined,
    trial_ends_at:
      r.trial_ends_at != null ? String(r.trial_ends_at).trim() : undefined,
    membership_started_at:
      r.membership_started_at != null
        ? String(r.membership_started_at).trim()
        : undefined,
    membership_ends_at:
      r.membership_ends_at != null ? String(r.membership_ends_at).trim() : null,
    admin_level:
      r.admin_level != null ? String(r.admin_level).trim() : undefined,
    is_demo_account: r.is_demo_account === true,
    approval_status: resolveApprovalStatus(r),
    active:
      parseActiveFlag(r.active) ??
      parseActiveFlag(r.is_active) ??
      parseActiveFlag(r.isActive),
    module_permissions: parseModulePermissions(r.module_permissions),
  };
}

function parseActiveFlag(value: unknown): boolean | undefined {
  if (value === true || value === 1 || value === "true" || value === "t") {
    return true;
  }
  if (value === false || value === 0 || value === "false" || value === "f") {
    return false;
  }
  return undefined;
}

export function normalizeApprovalStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Admin paneli ile aynı standart: users.active + users.approval_status */
export function resolveApprovalStatus(
  row: Record<string, unknown>,
): ApprovalStatus | undefined {
  if (row.approval_status != null && String(row.approval_status).trim() !== "") {
    return normalizeApprovalStatus(row.approval_status) as ApprovalStatus;
  }
  if (row.is_approved === true || row.approved === true) return "approved";
  if (row.is_approved === false || row.approved === false) return "pending";
  const status = normalizeApprovalStatus(row.status);
  if (status === "approved" || status === "pending" || status === "rejected") {
    return status as ApprovalStatus;
  }
  return undefined;
}

/** Uzman: aktif + onaylı (admin paneli ile uyumlu) */
export function isExpertAccountReady(user: YasamUser): boolean {
  if (user.active !== true) return false;
  const approval = normalizeApprovalStatus(user.approval_status);
  if (approval === "rejected") return false;
  if (approval === "approved") return true;
  if (!approval) return true;
  return false;
}

/**
 * Giriş kontrolü.
 *  - active=false ise HERKES (admin dahil) giriş yapamaz.
 *  - Admin: yalnızca active kontrolüne tabidir (onay/approval'a değil).
 *  - Expert: active + onay kontrolü (mevcut davranış korunur).
 */
export function canLoginYasamUser(
  user: YasamUser,
): { allowed: true } | { allowed: false; message: string } {
  if (user.active !== true) {
    return { allowed: false, message: INACTIVE_ACCOUNT_MESSAGE };
  }
  if (isAdminUser(user)) return { allowed: true };
  if (!isExpertAccountReady(user)) {
    return { allowed: false, message: PENDING_APPROVAL_MESSAGE };
  }
  return { allowed: true };
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

/** Ana panel modüllerine tam erişim (admin her zaman; uzman onay+aktif+üyelik) */
export function hasFullPanelAccess(user: YasamUser | null | undefined): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  return hasExpertMembershipAccess(user);
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

export function saveSessionToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function readSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function clearSessionToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

export function clearYasamUser(): void {
  if (typeof window === "undefined") return;

  // Demo hesap çıkışında modül verilerini temizle — gerçek kullanıcı verisi korunur
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { is_demo_account?: boolean };
      if (parsed.is_demo_account === true) {
        [
          // Refleksoloji
          "yasam-refleksoloji-atlas-v1",
          "yasam-refleksoloji-organs-v1",
          "yasam-refleksoloji-protokoller-v1",
          "yasam-refleksoloji-notlar-v1",
          // Numeroloji bilgi bankası
          "yasam-numeroloji-stone-assignments",
          "yasam-numeroloji-training-explanations",
          // Numeroloji demo örnek analiz (IP hakkı server'da; bu yalnızca görüntüleme cache'i)
          "yasam_demo_numeroloji_analiz",
          // Belge çeviri aktif iş
          "belge_ceviri_active_job",
        ].forEach((k) => localStorage.removeItem(k));

        // Ürün & Stok demo fixture'ları (envanter, satış geçmişi, hareketler, seed bayrağı)
        clearDemoUrunStok();
      }
    }
  } catch { /* JSON parse başarısız olursa sessiz */ }

  localStorage.removeItem(STORAGE_KEY);
  clearSessionToken();
  // Demo oturum verisini temizle (demo hesap olmasa da key yoksa no-op)
  localStorage.removeItem("yasam_demo_session");
  invalidateYasamUserSyncCache();
  // Admin httpOnly cookie'yi temizle (fire-and-forget, tüm logout noktalarını kapsar)
  void fetch("/api/auth/admin-session", { method: "DELETE" }).catch(() => {});
}

/** Admin session cookie'yi sunucu üzerinden temizler. clearYasamUser içinde otomatik çağrılır. */
export async function clearAdminSessionCookie(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/auth/admin-session", { method: "DELETE" });
  } catch {
    // best effort
  }
}

export function isAdminUser(user: YasamUser | null | undefined): boolean {
  return normalizeRole(user?.role) === "admin";
}

/** Hero / panel başlığı: full_name → name → boş (email asla gösterilmez) */
export function getYasamUserDisplayName(
  user: YasamUser | null | undefined,
): string {
  if (!user) return "";
  const fullName = user.full_name?.trim();
  if (fullName) return fullName;
  const name = user.name?.trim();
  if (name && !name.includes("@")) return name;
  return "";
}

export function isExpertUser(user: YasamUser | null | undefined): boolean {
  return normalizeRole(user?.role) === "expert";
}

/**
 * Güncel kullanıcı kaydı — güvenli /api/auth/profile (service_role) üzerinden.
 * Tarayıcıdan doğrudan users tablosu okunmaz.
 */
export async function refreshYasamUserFromDb(
  user: YasamUser,
): Promise<YasamUser | null> {
  if (!user.id) return null;

  const token = readSessionToken();
  // Oturum token'ı henüz yoksa (ör. login anında, session oluşturulmadan önce)
  // güvenli API çağrılamaz — mevcut (RPC'den gelen) kaydı koru, login akışını bozma.
  if (!token) return user;

  try {
    const res = await fetch("/api/auth/profile", {
      headers: { "x-user-id": user.id, "x-session-token": token },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("Kullanıcı kaydı yenilenemedi:", res.status);
      return null;
    }

    const json = (await res.json().catch(() => ({}))) as {
      profile?: Record<string, unknown> | null;
    };
    if (!json.profile) return null;

    const row = json.profile;
    return parseLoginUserRecord({
      ...row,
      module_permissions:
        row.module_permissions ?? user.module_permissions ?? undefined,
    });
  } catch (err) {
    console.error("Kullanıcı kaydı yenileme hatası:", err);
    return null;
  }
}

export type SyncYasamUserOptions = {
  /** Giriş sonrası gibi — TTL'yi yok say */
  force?: boolean;
};

/**
 * users tablosundan güncel kaydı alır ve localStorage yasam_user'ı yeniden yazar.
 * TTL içinde tekrar çağrılırsa önbellekten döner (paralel istekler tek sorguda birleşir).
 */
export async function syncYasamUserFromDb(
  seed?: YasamUser | null,
  options?: SyncYasamUserOptions,
): Promise<YasamUser | null> {
  const current = seed ?? readYasamUser();
  if (!current?.id) return null;

  const force = options?.force === true;
  const now = Date.now();

  if (!force && now - lastUserSyncAt < USER_SYNC_TTL_MS) {
    return readYasamUser() ?? current;
  }

  if (syncInFlight && !force) {
    return syncInFlight;
  }

  const run = async (): Promise<YasamUser | null> => {
    const fresh = await refreshYasamUserFromDb(current);
    if (!fresh) return null;
    saveYasamUser(fresh);
    lastUserSyncAt = Date.now();
    return fresh;
  };

  syncInFlight = run().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

/** UI'ı bloklamadan izin/tenant güncellemesi */
export function backgroundSyncYasamUserFromDb(seed?: YasamUser | null): void {
  void syncYasamUserFromDb(seed);
}

/** login_user RPC sonrası users tablosundan güncel alanları yükler */
export async function enrichYasamUserProfile(user: YasamUser): Promise<YasamUser> {
  const synced = await syncYasamUserFromDb(user);
  return synced ?? user;
}

/** @deprecated enrichYasamUserProfile kullanın */
export async function enrichYasamUserFullName(
  user: YasamUser,
): Promise<YasamUser> {
  return enrichYasamUserProfile(user);
}
