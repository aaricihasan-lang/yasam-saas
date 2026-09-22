/**
 * FAZ 1 / İP-6 — expert-stats admin route ortak yardımcıları.
 * Salt-okur: yalnız hedef uzman çözümü + tarih aralığı ayrıştırma. Yetki her route'un
 * kendi verifyAdminRequest çağrısındadır (bu dosya yetki KARARI vermez).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export type DateRange = { from: string | null; to: string | null };

/**
 * ?from=&to= ISO tarih/zaman ayrıştırma. Geçersiz değer → null (filtre yok). Yalnız
 * parse edilebilen ISO kabul edilir; uygulama UTC saklar, gün gösterimi TR RPC içinde.
 */
export function parseRange(params: URLSearchParams): DateRange {
  const norm = (raw: string | null): string | null => {
    if (!raw) return null;
    const t = Date.parse(raw);
    if (Number.isNaN(t)) return null;
    return new Date(t).toISOString();
  };
  return { from: norm(params.get("from")), to: norm(params.get("to")) };
}

export type TargetExpert = {
  userId: string;
  tenantId: string;
  role: string;
  createdAt: string | null;
  approvalStatus: string | null;
  active: boolean;
  isDemo: boolean;
  modulePermissions: Record<string, unknown>;
};

/**
 * Hedef kullanıcıyı service_role ile çözer. tenant_id SUNUCUDA users kaydından gelir
 * (istemciden gelen tenant'a GÜVENİLMEZ). Bulunamazsa null.
 */
export async function resolveTargetExpert(
  db: SupabaseClient,
  userId: string,
): Promise<TargetExpert | null> {
  const { data, error } = await db
    .from("users")
    .select("id, tenant_id, role, created_at, approval_status, active, is_demo_account, module_permissions")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data || !data.tenant_id) return null;
  const mp = data.module_permissions;
  return {
    userId: String(data.id),
    tenantId: String(data.tenant_id),
    role: String(data.role ?? ""),
    createdAt: data.created_at != null ? String(data.created_at) : null,
    approvalStatus: data.approval_status != null ? String(data.approval_status) : null,
    active: data.active === true,
    isDemo: data.is_demo_account === true,
    modulePermissions: mp && typeof mp === "object" && !Array.isArray(mp) ? (mp as Record<string, unknown>) : {},
  };
}
