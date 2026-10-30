// Human Design — "HUMAN DESIGN EĞİTİM HARİTALARI" TEK YETKİSİ (FAZ 8 owner kararı) · YALNIZ SUNUCU.
//
// Admin → Kullanıcı → Modül İzinleri ekranındaki TEK anahtarın sunucu tarafı. Tek veri kaynağı merkezî
// hd_education_access_grants tablosudur (20271110); hem Hazır Eğitim Haritaları (merkezî) hem Bana Özel Eğitim
// Haritaları (özel arşiv) bu tek yetkiyi okur. Ayrı not / çizim / görüntüleme / düzenleme / silme yetkisi YOKTUR.
//   • Yalnız GERÇEK owner (users.is_super_admin + admin + aktif + demo değil) görür ve değiştirir; normal admin → 404.
//   • Owner kararı 30.10.2026: anahtar hazırlık kapılarından BAĞIMSIZ görünür ve yönetilir (yetki yönetimi ≠ içerik yayını).
//     Kapılar kapalıyken verilen yetki hiçbir içeriği açmaz: eğitmen uçları (requireEducationViewer / requirePrivateTrainer)
//     kapı kapalıyken DB'ye gitmeden 404 döner. Anahtar ekranı kapıların durumunu açıkça yazar.
//   • Yazma YALNIZ merkezî SECURITY DEFINER RPC'leriyle (aktör DB'de yeniden owner doğrulanır; uygunluk DB'de denetlenir).
//   • Kapatma veri SİLMEZ: kayıtlar ve eğitim çalışmaları korunur, erişim kapanır; yeniden açılınca geçerli olanlar görünür.

import "server-only";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { catalogEnvOverride, isEducationCatalogEnabled, isEducationCatalogOpen, isEducationOwner } from "./educationAccess";
import { isPrivateEducationEnabled, privateEnvKillSwitch } from "./private/privateAccess";
import { ownerOverview } from "./private/privateStore";
import { EduStoreError, grantAccess, ineligibleReason, revokeAccess, type UserRow } from "./educationStore";
import { EDU_TABLES, EDU_UUID_RE } from "./educationContract";

assertServerOnly("lib/human-design/education/educationTrainingAccess");

export const TRAINING_ACCESS_LABEL = "Human Design Eğitim Haritaları";

export function anyEducationFeatureEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return isEducationCatalogEnabled(env) || isPrivateEducationEnabled(env);
}

export type TrainingOwnerGate = { ok: true; db: SupabaseClient; ownerId: string } | { ok: false };

/**
 * Eğitmen erişiminin fiilen açık olup olmadığı — anahtar ekranındaki durum bilgisi için (owner kararı 31.10.2026: kapılar
 * owner panelindeki DB anahtarlarıdır). Özel arşiv durumu yalnız owner RPC'siyle okunur (tabloya doğrudan yetki yok).
 */
export type TrainingAccessGates = { catalogEnabled: boolean; privateEnabled: boolean };
export async function trainingAccessGates(db: SupabaseClient, ownerId: string, env: Record<string, string | undefined> = process.env): Promise<TrainingAccessGates> {
  const catalogEnabled = await isEducationCatalogOpen(db, env);
  let privateEnabled = false;
  if (!privateEnvKillSwitch(env)) {
    try { privateEnabled = (await ownerOverview(db, ownerId)).archiveOpen; } catch { privateEnabled = false; }
  }
  return { catalogEnabled, privateEnabled };
}
/** Acil kapatma: iki eğitim özelliği de ortamda açıkça "false" ise owner eğitim yönetim uçları da kapanır. */
export function educationKillSwitch(env: Record<string, string | undefined> = process.env): boolean {
  return catalogEnvOverride(env) === false && privateEnvKillSwitch(env);
}

/**
 * TEK yetki anahtarının owner kapısı (owner kararı 30.10.2026): hazırlık kapılarından BAĞIMSIZ; yalnız oturum token'ı
 * doğrulanmış KATI owner. Diğer herkes (normal admin, uzman, demo) aynı 404. Çizim katmanı owner uçları
 * requireTrainingAccessOwner (kapıya bağlı) ile DEĞİŞMEDEN kalır.
 */
export async function requireTrainingAccessManager(req: NextRequest, deps: { verifyAdmin?: typeof verifyAdminRequest } = {}): Promise<TrainingOwnerGate> {
  try {
    const g = await (deps.verifyAdmin ?? verifyAdminRequest)(req);
    if (!g.ok) return { ok: false };
    if (!(await isEducationOwner(g.db, g.adminId))) return { ok: false };
    return { ok: true, db: g.db, ownerId: g.adminId };
  } catch {
    return { ok: false };
  }
}

export async function requireTrainingAccessOwner(req: NextRequest, deps: { verifyAdmin?: typeof verifyAdminRequest; env?: Record<string, string | undefined> } = {}): Promise<TrainingOwnerGate> {
  // Owner kararı 31.10.2026: owner eğitim yönetimi (çizim katmanları dahil) kapılardan bağımsız; yalnız acil kapatma.
  if (educationKillSwitch(deps.env)) return { ok: false };
  try {
    const g = await (deps.verifyAdmin ?? verifyAdminRequest)(req);
    if (!g.ok) return { ok: false };
    if (!(await isEducationOwner(g.db, g.adminId))) return { ok: false };
    return { ok: true, db: g.db, ownerId: g.adminId };
  } catch {
    return { ok: false };
  }
}

export type TrainingAccessStatus = { userId: string; enabled: boolean; eligible: boolean; reason: string | null; grantedAt: string | null };

export async function readTrainingAccess(db: SupabaseClient, userId: string): Promise<TrainingAccessStatus | null> {
  if (!EDU_UUID_RE.test(userId)) return null;
  const [u, g] = await Promise.all([
    db.from("users").select("id, full_name, name, email, role, active, approval_status, is_demo_account, is_super_admin, module_permissions, tenant_id").eq("id", userId).maybeSingle(),
    db.from(EDU_TABLES.grants).select("granted_at, granted_tenant_id").eq("user_id", userId).is("revoked_at", null).maybeSingle(),
  ]);
  if (u.error || g.error) throw new EduStoreError("DB_ERROR");
  if (!u.data) return null;
  const row = u.data as UserRow;
  const reason = ineligibleReason(row);
  const grant = g.data as { granted_at?: string; granted_tenant_id?: string } | null;
  // Etkin satır var ama tenant değişmişse yetki fiilen geçersizdir (erişim kapısı da reddeder) → kapalı gösterilir.
  const enabled = !!grant && grant.granted_tenant_id === row.tenant_id;
  return { userId, enabled, eligible: reason === null, reason, grantedAt: enabled ? grant?.granted_at ?? null : null };
}

/** Açık / kapalı ayarla. İdempotent: zaten istenen durumdaysa DB'ye yazmaz. */
export async function setTrainingAccess(db: SupabaseClient, ownerId: string, userId: string, enabled: boolean): Promise<TrainingAccessStatus> {
  const cur = await readTrainingAccess(db, userId);
  if (!cur) throw new EduStoreError("ED004");
  if (cur.enabled !== enabled) {
    if (enabled) {
      // Tenant değişmiş eski etkin satır varsa önce kapat (merkezî RPC tek etkin satıra izin verir).
      const stale = await db.from(EDU_TABLES.grants).select("id").eq("user_id", userId).is("revoked_at", null).maybeSingle();
      if (stale.data) await revokeAccess(db, ownerId, userId);
      await grantAccess(db, ownerId, userId, null);
    } else {
      await revokeAccess(db, ownerId, userId);
    }
  }
  const after = await readTrainingAccess(db, userId);
  if (!after) throw new EduStoreError("ED004");
  return after;
}
