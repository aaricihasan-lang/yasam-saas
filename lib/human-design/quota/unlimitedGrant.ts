import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";

assertServerOnly("lib/human-design/quota/unlimitedGrant");

/**
 * HUMAN DESIGN — 24 saatlik geçici sınırsız kullanım izni (owner talimatı 05.11.2026).
 *
 * • İstisna YALNIZ iki hacim kotasıdır: hd-roxy-user (20/saat) ve hd-roxy-tenant (100/gün); bu sayaçları kullanan HD API
 *   girişlerinde uygulanır: BodyGraph (charts/roxy), Connection/Penta (relations), Dört Ok/Variables (charts/variables),
 *   Kişisel Transit (transit/personal) ve Eğitim Merkezi kurgusal harita (education/private/fictional). Inflight kilitleri,
 *   önbellek/yeniden kullanım, genel transit gezegen kotaları (hd-transit-planets-*) ve sağlayıcı DEĞİŞMEZ.
 * • İzinli istekte normal sayaç HİÇ çağrılmaz → istisnai kullanım normal limitleri doldurmaz; aynı tenant'taki diğer
 *   uzmanların sayaçları etkilenmez.
 * • İzin kontrolünde her türlü hata → izin YOK (fail-closed: normal sınırlar uygulanır).
 * • Yazma tek yoldan: DB fonksiyonu hd_unlimited_grant_24h (owner + hedef DB'de yeniden doğrulanır, süre uzatılmaz).
 */
export const HD_UNLIMITED_GRANT_TABLE = "hd_unlimited_grants";
export const HD_UNLIMITED_GRANT_RPC = "hd_unlimited_grant_24h";
export const HD_UNLIMITED_GRANT_HOURS = 24;
export const HD_UNLIMITED_SCOPES: ReadonlySet<string> = new Set(["hd-roxy-user", "hd-roxy-tenant"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HdRateLimitFn = (scope: string, value: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;
export type ActiveGrant = { grantedAt: string; expiresAt: string };

/** Uzmanın (kendi tenant'ında) şu an aktif izni. Hata / tablo yok / geçersiz kimlik → null (fail-closed). */
export async function readActiveUnlimitedGrant(db: SupabaseClient, userId: string, tenantId: string, nowMs: number = Date.now()): Promise<ActiveGrant | null> {
  if (!UUID_RE.test(userId) || !UUID_RE.test(tenantId)) return null;
  try {
    const { data, error } = await db
      .from(HD_UNLIMITED_GRANT_TABLE)
      .select("granted_at, expires_at")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .gt("expires_at", new Date(nowMs).toISOString())
      .order("expires_at", { ascending: false })
      .limit(1);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as { granted_at?: unknown; expires_at?: unknown };
    const exp = typeof row.expires_at === "string" ? Date.parse(row.expires_at) : NaN;
    if (!Number.isFinite(exp) || exp <= nowMs || typeof row.granted_at !== "string") return null;
    return { grantedAt: row.granted_at, expiresAt: row.expires_at as string };
  } catch {
    return null;
  }
}

/**
 * Route'un mevcut rateLimit sarmalayıcısını sarar: YALNIZ hd-roxy-user / hd-roxy-tenant kapsamında, uzmanın aktif izni
 * varsa sayaç çağrılmadan izin verilir. İzin sorgusu istek başına en fazla bir kez ve yalnız ücretli yola gelindiğinde yapılır.
 */
export function withHdUnlimitedGrant(
  ctx: { db: SupabaseClient; userId: string; tenantId: string; isDemo: boolean },
  base: HdRateLimitFn,
  nowMs: () => number = Date.now,
): HdRateLimitFn {
  let granted: Promise<boolean> | null = null;
  return async (scope, value, limit, windowSeconds) => {
    if (HD_UNLIMITED_SCOPES.has(scope) && !ctx.isDemo) {
      granted ??= readActiveUnlimitedGrant(ctx.db, ctx.userId, ctx.tenantId, nowMs()).then((g) => g !== null, () => false);
      if (await granted) return { allowed: true, retryAfterSec: 0 };
    }
    return base(scope, value, limit, windowSeconds);
  };
}

// ─── Owner yönetimi ──────────────────────────────────────────────────────────

export type UnlimitedOwnerGate = { ok: true; db: SupabaseClient; ownerId: string } | { ok: false };

/**
 * YALNIZ gerçek sistem sahibi: token'a bağlı admin oturumu + DB satırında is_super_admin === true + role admin + aktif +
 * demo değil. admin_level / e-posta / istemci bilgisi KULLANILMAZ. Her hata → reddet (çağıran 404 döner).
 */
export async function requireHdUnlimitedOwner(req: NextRequest, deps: { verifyAdmin?: typeof verifyAdminRequest } = {}): Promise<UnlimitedOwnerGate> {
  try {
    const g = await (deps.verifyAdmin ?? verifyAdminRequest)(req);
    if (!g.ok) return { ok: false };
    const { data, error } = await g.db.from("users").select("role, active, is_super_admin, is_demo_account").eq("id", g.adminId).maybeSingle();
    if (error || !data) return { ok: false };
    const row = data as { role?: unknown; active?: unknown; is_super_admin?: unknown; is_demo_account?: unknown };
    const isOwner = row.is_super_admin === true && String(row.role ?? "").trim().toLowerCase() === "admin" && row.active === true && row.is_demo_account !== true;
    return isOwner ? { ok: true, db: g.db, ownerId: g.adminId } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export type UnlimitedGrantStatus = {
  userId: string;
  eligible: boolean;
  active: boolean;
  grantedAt: string | null;
  expiresAt: string | null;
  serverNow: string;
};

/** Owner ekranı durumu. Hedef yoksa null; uygun değilse eligible=false (buton gösterilmez). */
export async function readUnlimitedGrantStatus(db: SupabaseClient, userId: string, nowMs: number = Date.now()): Promise<UnlimitedGrantStatus | null> {
  if (!UUID_RE.test(userId)) return null;
  const { data, error } = await db.from("users").select("id, role, active, approval_status, is_demo_account, tenant_id").eq("id", userId).maybeSingle();
  if (error) throw new Error("DB_ERROR");
  if (!data) return null;
  const u = data as { role?: unknown; active?: unknown; approval_status?: unknown; is_demo_account?: unknown; tenant_id?: unknown };
  const tenantId = typeof u.tenant_id === "string" ? u.tenant_id : "";
  const eligible = String(u.role ?? "").toLowerCase() === "expert" && u.active === true && u.approval_status === "approved" && u.is_demo_account !== true && UUID_RE.test(tenantId);
  const grant = eligible ? await readActiveUnlimitedGrant(db, userId, tenantId, nowMs) : null;
  return { userId, eligible, active: grant !== null, grantedAt: grant?.grantedAt ?? null, expiresAt: grant?.expiresAt ?? null, serverNow: new Date(nowMs).toISOString() };
}

export type GrantResult = { status: "granted" | "already_active" | "ineligible" | "forbidden"; grantedAt: string | null; expiresAt: string | null };

/** Tek yazma yolu: DB fonksiyonu (kilit + doğrulama + denetim kaydı + DB saati). */
export async function grantHdUnlimited24h(db: SupabaseClient, ownerId: string, userId: string): Promise<GrantResult> {
  if (!UUID_RE.test(userId) || !UUID_RE.test(ownerId)) return { status: "ineligible", grantedAt: null, expiresAt: null };
  const { data, error } = await db.rpc(HD_UNLIMITED_GRANT_RPC, { p_user_id: userId, p_actor_id: ownerId });
  if (error) throw new Error("DB_ERROR");
  const row = (Array.isArray(data) ? data[0] : data) as { out_status?: unknown; out_granted_at?: unknown; out_expires_at?: unknown } | undefined;
  const status = row?.out_status;
  if (status !== "granted" && status !== "already_active" && status !== "ineligible" && status !== "forbidden") throw new Error("DB_ERROR");
  return {
    status,
    grantedAt: typeof row?.out_granted_at === "string" ? row.out_granted_at : null,
    expiresAt: typeof row?.out_expires_at === "string" ? row.out_expires_at : null,
  };
}
