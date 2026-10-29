// Doğaltaş Kütüphanesi · ERİŞİM KAPILARI (YALNIZ SUNUCU, FAİL-CLOSED).
//
// Mevcut auth zinciri DEĞİŞMEZ; burada yalnız ÇAĞRILIR:
//   • verifyAdminRequest  — x-admin-id + oturum token'ı binding + role=admin + active
//   • verifyUserRequest   — x-user-id + oturum token'ı binding + active + onay durumu (+ profil)
//   • hasMembershipAccessForRow / resolveModuleAccess — üyelik ve Doğaltaş ("stones") modül izni
// Bu dosyaya özel ek kurallar:
//   OWNER : users.is_super_admin IS TRUE + role=admin + active + demo değil (DB'den, her istekte; fallback YOK).
//   UZMAN : role=expert + demo değil + aktif + üyelik + Doğaltaş izni + owner'ın verdiği ETKİN kütüphane yetkisi.
//           Yetki DB'de (stone_library_viewer_allowed) her istekte yeniden doğrulanır; varsayılan: HİÇ KİMSE.
//   Owner olmayan admin: kütüphane KAPALI (admin'in genel modül muafiyeti burada uygulanmaz).
// Hazırlık kapısı KAPALIYSA (varsayılan) her şey DB'ye gitmeden 404. Tüm red dalları AYNI 404 gövdesi + no-store
// (kütüphanenin varlığı sızdırılmaz).

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { hasMembershipAccessForRow } from "@/lib/auth/membershipAccessCore";
import { resolveModuleAccess } from "@/lib/auth/moduleAccessCore";
import { STONE_LIBRARY_ENV_FLAG, STONE_LIBRARY_RPC } from "./contract";

assertServerOnly("lib/stone-library/access");

export const STONE_LIBRARY_NO_STORE = { "Cache-Control": "no-store" } as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isStoneLibraryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[STONE_LIBRARY_ENV_FLAG] === "true";
}

/** Tek tip "yok" yanıtı — hiçbir red dalı farklı gövde/başlık üretmez. */
export function stoneLibraryNotFound(): NextResponse {
  return NextResponse.json({ ok: false, error: "Bulunamadı." }, { status: 404, headers: STONE_LIBRARY_NO_STORE });
}

type OwnerRow = { role?: unknown; active?: unknown; is_super_admin?: unknown; is_demo_account?: unknown };

/** KATI owner kararı (yalnız DB satırı). */
export function isStoneLibraryOwnerRow(row: OwnerRow | null | undefined): boolean {
  return (
    !!row &&
    row.is_super_admin === true &&
    String(row.role ?? "").trim().toLowerCase() === "admin" &&
    row.active === true &&
    row.is_demo_account !== true
  );
}

export async function isStoneLibraryOwner(db: SupabaseClient, userId: string | null | undefined): Promise<boolean> {
  if (!userId || !UUID_RE.test(userId)) return false;
  try {
    const { data, error } = await db
      .from("users")
      .select("id, role, active, is_super_admin, is_demo_account")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return false;
    return isStoneLibraryOwnerRow(data as OwnerRow);
  } catch {
    return false;
  }
}

export type StoneLibraryOwnerContext = { db: SupabaseClient; ownerId: string };
export type StoneLibraryViewerContext = { db: SupabaseClient; viewerId: string; isOwner: boolean };
export type StoneLibraryGateResult<T> = { ok: true; ctx: T } | { ok: false; response: NextResponse };

export type StoneLibraryGateDeps = {
  verifyAdmin?: typeof verifyAdminRequest;
  verifyUser?: typeof verifyUserRequest;
  env?: Record<string, string | undefined>;
};

/** Owner yönetim uçlarının İLK satırı (F2/F3). DB RPC'leri owner'ı ayrıca yeniden doğrular. */
export async function requireStoneLibraryOwner(
  req: NextRequest,
  deps: StoneLibraryGateDeps = {},
): Promise<StoneLibraryGateResult<StoneLibraryOwnerContext>> {
  if (!isStoneLibraryEnabled(deps.env)) return { ok: false, response: stoneLibraryNotFound() };
  try {
    const guard = await (deps.verifyAdmin ?? verifyAdminRequest)(req);
    if (!guard.ok) return { ok: false, response: stoneLibraryNotFound() };
    if (!(await isStoneLibraryOwner(guard.db, guard.adminId))) return { ok: false, response: stoneLibraryNotFound() };
    return { ok: true, ctx: { db: guard.db, ownerId: guard.adminId } };
  } catch {
    return { ok: false, response: stoneLibraryNotFound() };
  }
}

/** PostgREST skaler boolean RPC sonucu (doğrudan değer veya tek satırlı dizi) → boolean. */
export function rpcBoolean(data: unknown): boolean {
  let v: unknown = data;
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  if (v && typeof v === "object") v = Object.values(v as Record<string, unknown>)[0] ?? null;
  return v === true;
}

/** Uzman (ve owner önizleme) okuma uçlarının İLK satırı. */
export async function requireStoneLibraryViewer(
  req: NextRequest,
  deps: StoneLibraryGateDeps = {},
): Promise<StoneLibraryGateResult<StoneLibraryViewerContext>> {
  if (!isStoneLibraryEnabled(deps.env)) return { ok: false, response: stoneLibraryNotFound() };
  try {
    const guard = await (deps.verifyUser ?? verifyUserRequest)(req, { includeProfile: true });
    if (!guard.ok) return { ok: false, response: stoneLibraryNotFound() };
    const profile = guard.profile ?? null;
    if (!profile) return { ok: false, response: stoneLibraryNotFound() };
    const role = String(profile.role ?? "").trim().toLowerCase();
    // verifyUserRequest profili is_super_admin taşımaz → owner kararı ayrı, katı DB okumasıyla.
    const isOwner = role === "admin" ? await isStoneLibraryOwner(guard.db, guard.userId) : false;
    if (role === "admin" && !isOwner) return { ok: false, response: stoneLibraryNotFound() };
    if (!isOwner) {
      if (role !== "expert") return { ok: false, response: stoneLibraryNotFound() };
      if (guard.is_demo_account || profile.is_demo_account === true) return { ok: false, response: stoneLibraryNotFound() };
      if (profile.active !== true) return { ok: false, response: stoneLibraryNotFound() };
      if (!hasMembershipAccessForRow(profile)) return { ok: false, response: stoneLibraryNotFound() };
      if (!resolveModuleAccess(profile.role, profile.module_permissions, "stones", { isDemo: false })) {
        return { ok: false, response: stoneLibraryNotFound() };
      }
    }
    // DB ikinci kilit: owner'ın verdiği etkin yetki (uygunsuzlukta kalıcı iptal) — owner için de aynı fonksiyon.
    const allowed = await guard.db.rpc(STONE_LIBRARY_RPC.viewerAllowed, { p_viewer: guard.userId });
    if (allowed.error || !rpcBoolean(allowed.data)) return { ok: false, response: stoneLibraryNotFound() };
    return { ok: true, ctx: { db: guard.db, viewerId: guard.userId, isOwner } };
  } catch {
    return { ok: false, response: stoneLibraryNotFound() };
  }
}
