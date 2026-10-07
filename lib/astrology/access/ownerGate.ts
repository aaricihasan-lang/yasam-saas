// Astroloji — OWNER-ONLY KAPI (YALNIZ SUNUCU).
//
// Savunma katmanları (her biri tek başına reddeder):
//   1) Kill switch (ASTROLOGY_MODULE_ENABLED === "true") — kapalıysa herkes için 404.
//   2) Mevcut admin API doğrulaması: verifyAdminRequest (x-admin-id + x-session-token binding,
//      role=admin, active=true). Yetkisiz/anonim/uzman/demo → 404 (401/403 DEĞİL; modülün
//      varlığı sızdırılmaz).
//   3) KATI owner kontrolü: users.is_super_admin === true + role=admin + active=true +
//      is_demo_account !== true. `admin_level` KULLANILMAZ (her admin için 'owner' varsayılanı
//      vardır). resolveIsSuperAdmin'den daha katıdır: e-posta FALLBACK YOK — kolon okunamazsa
//      (migration yok / DB hatası) karar fail-closed false'tur.
//   4) Tenant: owner'ın kendi users.tenant_id'si (istemciden ALINMAZ).
//
// Tüm red dalları AYNI 404 gövdesini döner (dal ayırt edilemez).

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { verifyAdminRequest, type AdminGuardResult } from "@/lib/auth/adminGuard";
import { isAstrologyModuleEnabled } from "../config";
import { resolveAstrologyEntitlements, type AstrologyEntitlements } from "./entitlements";

assertServerOnly("lib/astrology/access/ownerGate");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ASTRO_NO_STORE = { "Cache-Control": "no-store" } as const;

/** Tek tip "yok" yanıtı — hiçbir red dalı farklı gövde/başlık üretmez. */
export function astrologyNotFoundResponse(): NextResponse {
  return NextResponse.json({ ok: false, error: "Bulunamadı." }, { status: 404, headers: ASTRO_NO_STORE });
}

export type AstrologyOwnerCheck =
  | { ok: true; tenantId: string }
  | { ok: false; reason: "db_error" | "not_found" | "not_owner" | "tenant_missing" };

/** KATI owner kararı (e-posta fallback YOK). */
export async function resolveAstrologyOwner(db: SupabaseClient, userId: string): Promise<AstrologyOwnerCheck> {
  if (!UUID_RE.test(userId)) return { ok: false, reason: "not_found" };
  let res: { data: unknown; error: unknown };
  try {
    res = await db
      .from("users")
      .select("id, role, active, is_super_admin, is_demo_account, tenant_id")
      .eq("id", userId)
      .maybeSingle();
  } catch {
    return { ok: false, reason: "db_error" };
  }
  if (res.error) return { ok: false, reason: "db_error" };
  const row = res.data as
    | { role?: unknown; active?: unknown; is_super_admin?: unknown; is_demo_account?: unknown; tenant_id?: unknown }
    | null;
  if (!row) return { ok: false, reason: "not_found" };
  const isOwner =
    row.is_super_admin === true &&
    String(row.role ?? "").trim().toLowerCase() === "admin" &&
    row.active === true &&
    row.is_demo_account !== true;
  if (!isOwner) return { ok: false, reason: "not_owner" };
  const tenantId = String(row.tenant_id ?? "").trim();
  if (!UUID_RE.test(tenantId)) return { ok: false, reason: "tenant_missing" };
  return { ok: true, tenantId };
}

export type AstrologyOwnerContext = {
  db: SupabaseClient;
  userId: string;
  tenantId: string;
  entitlements: AstrologyEntitlements;
};

export type AstrologyGateResult = { ok: true; ctx: AstrologyOwnerContext } | { ok: false; response: NextResponse };

export type AstrologyGateDeps = {
  env?: NodeJS.ProcessEnv;
  verifyAdmin?: (req: NextRequest) => Promise<AdminGuardResult>;
};

/** Her astroloji API route'unun İLK satırı. */
export async function requireAstrologyOwner(req: NextRequest, deps: AstrologyGateDeps = {}): Promise<AstrologyGateResult> {
  if (!isAstrologyModuleEnabled(deps.env)) return { ok: false, response: astrologyNotFoundResponse() };
  let guard: AdminGuardResult;
  try {
    guard = await (deps.verifyAdmin ?? verifyAdminRequest)(req);
  } catch {
    return { ok: false, response: astrologyNotFoundResponse() };
  }
  if (!guard.ok) return { ok: false, response: astrologyNotFoundResponse() };
  const owner = await resolveAstrologyOwner(guard.db, guard.adminId);
  if (!owner.ok) return { ok: false, response: astrologyNotFoundResponse() };
  return {
    ok: true,
    ctx: {
      db: guard.db,
      userId: guard.adminId,
      tenantId: owner.tenantId,
      entitlements: resolveAstrologyEntitlements({ isOwner: true }),
    },
  };
}

/**
 * Sayfa kabuğu (app/admin/astroloji/layout.tsx) ve admin menü bağlantısı için karar.
 * `shellAdminId`: lib/auth/adminShellSession.resolveAdminShellUserId sonucu (opak oturum
 * token'ı → aktif admin). Kill switch kapalıysa DB'ye hiç gidilmez.
 */
export async function isAstrologyShellOwner(
  db: SupabaseClient | null,
  shellAdminId: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (!isAstrologyModuleEnabled(env)) return false;
  if (!db || !shellAdminId) return false;
  const owner = await resolveAstrologyOwner(db, shellAdminId);
  return owner.ok;
}
