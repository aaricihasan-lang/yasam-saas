// Human Design — Hazır Eğitim Haritaları · ERİŞİM KAPILARI (YALNIZ SUNUCU, FAİL-CLOSED).
//
// Mevcut auth zinciri DEĞİŞMEZ; burada yalnız ÇAĞRILIR:
//   • verifyAdminRequest  — x-admin-id + oturum token'ı binding + role=admin + active
//   • verifyUserRequest   — x-user-id + oturum token'ı binding + active + onay durumu (+ profil)
//   • hasMembershipAccessForRow / resolveModuleAccess — üyelik ve Human Design modül izni
// Bu dosyaya özel ek kurallar:
//   OWNER  : users.is_super_admin IS TRUE + role=admin + active + demo değil (DB'den, her istekte).
//            e-posta fallback / admin_level / OWNER_TENANT_ID KULLANILMAZ. DB RPC'leri aynı kuralı tekrar uygular.
//   EĞİTMEN: role=expert (admin/super-admin BYPASS YOK) + demo değil + premium üyelik + Human Design izni
//            + owner'ın verdiği ETKİN yetki (granted_tenant_id = users.tenant_id) — her istekte DB'den, önbelleksiz.
// Hazırlık kapısı KAPALIYSA (varsayılan) her şey DB'ye gitmeden 404.
// Tüm red dalları AYNI 404 gövdesini döner (özelliğin varlığı sızdırılmaz) + Cache-Control: no-store.

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { hasMembershipAccessForRow } from "@/lib/auth/membershipAccessCore";
import { resolveModuleAccess } from "@/lib/auth/moduleAccessCore";
import { EDU_RPC, EDU_TABLES, EDU_UUID_RE } from "./educationContract";

assertServerOnly("lib/human-design/education/educationAccess");

export const EDU_NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Hazırlık kapısı (varsayılan KAPALI): `HD_EDUCATION_CATALOG_ENABLED` YALNIZ tam "true" ise özellik vardır.
 * Eksik / boş / "1" / "TRUE" → KAPALI: tüm eğitim uçları DB'ye gitmeden 404, owner bağlantısı ve ekranı yok.
 * Migration 20271110000000 uygulanmadan AÇILMAZ (açma sırası: migration → env → yeniden deploy).
 */
export function isEducationCatalogEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.HD_EDUCATION_CATALOG_ENABLED === "true";
}

/** Tek tip "yok" yanıtı — hiçbir red dalı farklı gövde/başlık üretmez. */
export function eduNotFound(): NextResponse {
  return NextResponse.json({ ok: false, error: "Bulunamadı." }, { status: 404, headers: EDU_NO_STORE });
}

export type EduOwnerContext = { db: SupabaseClient; ownerId: string };
export type EduViewerContext = { db: SupabaseClient; userId: string };
export type EduGateResult<T> = { ok: true; ctx: T } | { ok: false; response: NextResponse };

type UserRow = {
  id?: unknown; role?: unknown; active?: unknown; is_super_admin?: unknown; is_demo_account?: unknown; tenant_id?: unknown;
};

/** KATI owner kararı (yalnız DB satırı; fallback YOK). */
export async function isEducationOwner(db: SupabaseClient, userId: string | null | undefined): Promise<boolean> {
  if (!userId || !EDU_UUID_RE.test(userId)) return false;
  try {
    const { data, error } = await db
      .from("users")
      .select("id, role, active, is_super_admin, is_demo_account")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return false;
    const row = data as UserRow;
    return (
      row.is_super_admin === true &&
      String(row.role ?? "").trim().toLowerCase() === "admin" &&
      row.active === true &&
      row.is_demo_account !== true
    );
  } catch {
    return false;
  }
}

export type EduGateDeps = {
  verifyAdmin?: typeof verifyAdminRequest;
  verifyUser?: typeof verifyUserRequest;
  /** Test: hazırlık kapısı için ortam (varsayılan process.env). */
  env?: Record<string, string | undefined>;
};

/** Owner yönetim uçlarının İLK satırı. Oturum token'ı sunucuda aktörle eşleştirilir; sonra DB owner kontrolü. */
export async function requireEducationOwner(req: NextRequest, deps: EduGateDeps = {}): Promise<EduGateResult<EduOwnerContext>> {
  if (!isEducationCatalogEnabled(deps.env)) return { ok: false, response: eduNotFound() };
  try {
    const guard = await (deps.verifyAdmin ?? verifyAdminRequest)(req);
    if (!guard.ok) return { ok: false, response: eduNotFound() };
    if (!(await isEducationOwner(guard.db, guard.adminId))) return { ok: false, response: eduNotFound() };
    return { ok: true, ctx: { db: guard.db, ownerId: guard.adminId } };
  } catch {
    return { ok: false, response: eduNotFound() };
  }
}

/** PostgREST skaler RPC sonucu (doğrudan değer; bazı istemcilerde tek satırlı dizi) → string | null. */
export function rpcScalar(data: unknown): string | null {
  let v: unknown = data;
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  if (v && typeof v === "object") v = Object.values(v as Record<string, unknown>)[0] ?? null;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Eğitmenin ETKİN yetkisi var mı? Uygunsuzluk (rol / tenant değişimi) varsa yetki DB'de kalıcı kapatılır. */
export async function hasActiveEducationGrant(db: SupabaseClient, userId: string, tenantId: string): Promise<boolean> {
  const { data, error } = await db
    .from(EDU_TABLES.grants)
    .select("id, granted_tenant_id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return false;
  const grant = data as { id?: unknown; granted_tenant_id?: unknown };
  // DB uygunsuzluk denetimi (rol değişti / denetimde rol değişikliği / tenant değişti) → kalıcı iptal.
  const auto = await db.rpc(EDU_RPC.autoRevoke, { p_target: userId });
  if (auto.error) return false; // fail-closed
  if (rpcScalar(auto.data) !== null) return false;
  return String(grant.granted_tenant_id ?? "") === tenantId;
}

/** Eğitmen katalog uçlarının İLK satırı. */
export async function requireEducationViewer(req: NextRequest, deps: EduGateDeps = {}): Promise<EduGateResult<EduViewerContext>> {
  if (!isEducationCatalogEnabled(deps.env)) return { ok: false, response: eduNotFound() };
  try {
    const guard = await (deps.verifyUser ?? verifyUserRequest)(req, { includeProfile: true });
    if (!guard.ok) return { ok: false, response: eduNotFound() };
    const profile = guard.profile ?? null;
    if (!profile) return { ok: false, response: eduNotFound() };
    const role = String(profile.role ?? "").trim().toLowerCase();
    if (role !== "expert") {
      // Admin yapılmış eski eğitmenin etkin yetkisi kalıcı kapatılır (yeniden uzman olunca kendiliğinden dönmez).
      await guard.db.rpc(EDU_RPC.autoRevoke, { p_target: guard.userId }).then(() => undefined, () => undefined);
      return { ok: false, response: eduNotFound() };
    }
    if (guard.is_demo_account || profile.is_demo_account === true) return { ok: false, response: eduNotFound() };
    if (profile.active !== true) return { ok: false, response: eduNotFound() };
    if (!hasMembershipAccessForRow(profile)) return { ok: false, response: eduNotFound() };
    if (!resolveModuleAccess(profile.role, profile.module_permissions, "human_design", { isDemo: false })) {
      return { ok: false, response: eduNotFound() };
    }
    if (!(await hasActiveEducationGrant(guard.db, guard.userId, guard.tenantId))) return { ok: false, response: eduNotFound() };
    return { ok: true, ctx: { db: guard.db, userId: guard.userId } };
  } catch {
    return { ok: false, response: eduNotFound() };
  }
}
