// Human Design — Eğitmene Özel Eğitim Haritaları · ERİŞİM KAPILARI (YALNIZ SUNUCU, FAİL-CLOSED).
//
// Mevcut auth zinciri DEĞİŞMEZ; burada yalnız ÇAĞRILIR:
//   • verifyAdminRequest — x-admin-id + oturum token'ı binding + role=admin + active
//   • verifyUserRequest  — x-user-id + oturum token'ı binding + active + onay (+ profil)
//   • hasMembershipAccessForRow / resolveModuleAccess — üyelik + Human Design modül izni
// Ek kurallar DB'de (hd_edu_priv_whoami → hd_edu_priv_resolve_actor) HER İSTEKTE yeniden uygulanır:
//   OWNER  : users.is_super_admin + role=admin + aktif + demo değil (role=admin TEK BAŞINA owner DEĞİLDİR).
//   EĞİTMEN: role=expert + aktif + onaylı + demo değil + HD izni + owner'ın verdiği ETKİN özel arşiv yetkisi
//            (granted_tenant_id = users.tenant_id) + owner'ın arşiv anahtarı AÇIK. Rol/tenant değişimi → kalıcı iptal.
// Owner kararı 31.10.2026: hazırlık kapısı owner'ın arşiv anahtarıdır (DB, isPrivateArchiveOpen); `HD_PRIVATE_EDUCATION_ENABLED="false"`
// yalnız acil kapatmadır (her şey DB'ye gitmeden 404). Merkezî katalog anahtarından AYRI.
// Tüm red dalları AYNI 404 gövdesi + Cache-Control: no-store (özelliğin / kaydın varlığı sızdırılmaz).

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { hasMembershipAccessForRow } from "@/lib/auth/membershipAccessCore";
import { resolveModuleAccess } from "@/lib/auth/moduleAccessCore";
import { PRIV_RPC, PRIV_UUID_RE, type PrivActorKind } from "./privateContract";

assertServerOnly("lib/human-design/education/private/privateAccess");

export const PRIV_NO_STORE = { "Cache-Control": "no-store" } as const;

/** Varsayılan KAPALI: yalnız tam "true". Merkezî `HD_EDUCATION_CATALOG_ENABLED` ile BAĞLANTISIZ. */
export function isPrivateEducationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.HD_PRIVATE_EDUCATION_ENABLED === "true";
}

/**
 * Owner kararı 31.10.2026 — özel arşiv Owner panelinden yönetilir (Vercel / yeniden deploy GEREKMEZ):
 *   HD_PRIVATE_EDUCATION_ENABLED === "false" → KAPALI (acil kapatma; DB'ye bakılmaz)
 *   aksi hâlde owner arşiv anahtarı: hd_edu_private_control.archive_open (varsayılan FALSE; tabloya doğrudan yetki YOK —
 *   eğitmen çözümü hd_edu_priv_resolve_actor anahtarı DB'de zorunlu tutar). Owner yönetimi anahtardan bağımsızdır.
 */
export function privateEnvKillSwitch(env: Record<string, string | undefined> = process.env): boolean {
  return env.HD_PRIVATE_EDUCATION_ENABLED === "false";
}

export function privNotFound(): NextResponse {
  return NextResponse.json({ ok: false, error: "Bulunamadı." }, { status: 404, headers: PRIV_NO_STORE });
}

export type PrivContext = { db: SupabaseClient; actorId: string; kind: PrivActorKind };
export type PrivGateResult = { ok: true; ctx: PrivContext } | { ok: false; response: NextResponse };
export type PrivGateDeps = {
  verifyAdmin?: typeof verifyAdminRequest;
  verifyUser?: typeof verifyUserRequest;
  env?: Record<string, string | undefined>;
};

/**
 * PostgREST RPC değeri: gerçek PostgREST skaler / jsonb değeri doğrudan döner; bazı istemciler tek satırlı
 * `[{ <fn>: değer }]` biçimi verir. İkisi de aynı değere indirgenir.
 */
export function rpcValue(fn: string, data: unknown): unknown {
  if (Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === "object" && !Array.isArray(data[0])) {
    const keys = Object.keys(data[0] as Record<string, unknown>);
    if (keys.length === 1 && keys[0] === fn) return (data[0] as Record<string, unknown>)[fn];
  }
  return data;
}

/** DB aktör çözümü (owner / trainer / null). Hata → null (fail-closed). */
export async function resolvePrivateActor(db: SupabaseClient, actorId: string): Promise<PrivActorKind | null> {
  if (!PRIV_UUID_RE.test(actorId)) return null;
  try {
    const r = await db.rpc(PRIV_RPC.whoami, { p_actor: actorId });
    if (r.error) return null;
    const v = rpcValue(PRIV_RPC.whoami, r.data);
    return v === "owner" || v === "trainer" ? v : null;
  } catch {
    return null;
  }
}

/** Owner yönetim uçlarının İLK satırı (admin oturumu + DB owner doğrulaması). */
export async function requirePrivateOwner(req: NextRequest, deps: PrivGateDeps = {}): Promise<PrivGateResult> {
  if (privateEnvKillSwitch(deps.env)) return { ok: false, response: privNotFound() };
  try {
    const guard = await (deps.verifyAdmin ?? verifyAdminRequest)(req);
    if (!guard.ok) return { ok: false, response: privNotFound() };
    if ((await resolvePrivateActor(guard.db, guard.adminId)) !== "owner") return { ok: false, response: privNotFound() };
    return { ok: true, ctx: { db: guard.db, actorId: guard.adminId, kind: "owner" } };
  } catch {
    return { ok: false, response: privNotFound() };
  }
}

/**
 * Eğitmen uçlarının İLK satırı (kullanıcı oturumu). Uzman: üyelik + HD izni + DB'de 'trainer'.
 * Owner kendi uzman tenant'ında da kendi özel kayıtlarını yönetebilir (DB'de 'owner'); başka her rol 404.
 */
export async function requirePrivateTrainer(req: NextRequest, deps: PrivGateDeps = {}): Promise<PrivGateResult> {
  if (privateEnvKillSwitch(deps.env)) return { ok: false, response: privNotFound() };
  try {
    const guard = await (deps.verifyUser ?? verifyUserRequest)(req, { includeProfile: true });
    if (!guard.ok) return { ok: false, response: privNotFound() };
    const profile = guard.profile ?? null;
    if (!profile) return { ok: false, response: privNotFound() };
    const role = String(profile.role ?? "").trim().toLowerCase();
    // DB çözümü HER ZAMAN çağrılır: rol değişmişse etkin yetki burada kalıcı kapanır.
    const kind = await resolvePrivateActor(guard.db, guard.userId);
    if (role === "admin") {
      return kind === "owner" ? { ok: true, ctx: { db: guard.db, actorId: guard.userId, kind: "owner" } } : { ok: false, response: privNotFound() };
    }
    if (role !== "expert" || kind !== "trainer") return { ok: false, response: privNotFound() };
    if (guard.is_demo_account || profile.is_demo_account === true) return { ok: false, response: privNotFound() };
    if (profile.active !== true) return { ok: false, response: privNotFound() };
    if (!hasMembershipAccessForRow(profile)) return { ok: false, response: privNotFound() };
    if (!resolveModuleAccess(profile.role, profile.module_permissions, "human_design", { isDemo: false })) {
      return { ok: false, response: privNotFound() };
    }
    return { ok: true, ctx: { db: guard.db, actorId: guard.userId, kind: "trainer" } };
  } catch {
    return { ok: false, response: privNotFound() };
  }
}
