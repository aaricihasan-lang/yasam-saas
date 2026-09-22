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

export type ParseRangeResult =
  | { ok: true; range: DateRange }
  | { ok: false; error: string };

/**
 * ?from=&to= ISO tarih/zaman ayrıştırma — KATI. Verilmeyen parametre null (filtre yok);
 * VERİLMİŞ ama parse edilemeyen değer → HATA (sessizce filtresiz sorguya DÖNMEZ). Ters
 * aralık (from >= to) → HATA. Uygulama UTC saklar; gün gösterimi TR RPC içinde.
 */
export function parseRange(params: URLSearchParams): ParseRangeResult {
  const parseOne = (key: string): { ok: true; value: string | null } | { ok: false } => {
    const raw = params.get(key);
    if (raw == null || raw.trim() === "") return { ok: true, value: null };
    const t = Date.parse(raw);
    if (Number.isNaN(t)) return { ok: false };
    return { ok: true, value: new Date(t).toISOString() };
  };
  const f = parseOne("from");
  if (!f.ok) return { ok: false, error: "Geçersiz 'from' tarihi (ISO bekleniyor)." };
  const t = parseOne("to");
  if (!t.ok) return { ok: false, error: "Geçersiz 'to' tarihi (ISO bekleniyor)." };
  if (f.value && t.value && Date.parse(f.value) >= Date.parse(t.value)) {
    return { ok: false, error: "Geçersiz tarih aralığı: 'from' < 'to' olmalı." };
  }
  return { ok: true, range: { from: f.value, to: t.value } };
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
