import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";
import {
  adminModuleAliasKeys,
  parseLicenseSettings,
  validateModuleChanges,
  type AdminModuleUiKey,
} from "@/lib/admin/userManagement";
import {
  guardAdminLockoutById,
  requireMainAdmin,
  requireMainAdminForAdminTarget,
  resolveIsSuperAdmin,
} from "@/lib/admin/adminGuards";
import { writeAdminAudit, AdminAuditError, type AdminAuditAction } from "@/lib/admin/adminAudit";
import {
  computeExcessSessionsToRevoke,
  type SessionLimits,
  type ActiveSessionRow,
} from "@/lib/admin/sessionLimitManagement";
import { readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import {
  analyzeLockout,
  licenseSettingsEqual,
  SESSION_LIMIT_FIELDS,
  validateLicensePayload,
} from "@/lib/admin/licenseLimits";
import { isUuid, rpcErrorStatus, validateProfileEdit } from "@/lib/admin/memberRequestValidation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "no-store" } as const;

function bad(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: NO_STORE });
}

/** GET /api/admin/users/[id] — kullanıcı detayı + ödeme geçmişi */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Geçersiz kullanıcı ID." }, { status: 400 });
  }

  const { data, error } = await db
    .from("users")
    .select(USERS_SAFE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  const { data: history } = await db
    .from("user_payment_history")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  // GİZLİLİK KARARI (2026-08-24): Admin/owner uzman private-content görüntüleme
  // özelliği kaldırıldı (UI'da workspace kartı da kaldırıldı). Yalnız hesap yönetimi
  // metadata'sı döner.
  // AŞAMA 2 · P1-7: `viewer.isMainAdmin` — UI'nın ana-yöneticiye özel kontrolleri (şifre
  // sıfırlama, e-posta, lisans/güvenlik politikası) göstermesi için SUNUCU kararı. İstemcideki
  // admin_level (canlıda varsayılan 'owner') güvenilmez. Yetki her işlemde ayrıca sunucuda doğrulanır.
  const isMainAdmin = await resolveIsSuperAdmin(db, adminId);
  return NextResponse.json(
    { user: data, paymentHistory: history ?? [], viewer: { isMainAdmin } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function audit(
  db: Parameters<typeof writeAdminAudit>[0],
  params: Omit<Parameters<typeof writeAdminAudit>[1], "action"> & { action: AdminAuditAction },
): Promise<void> {
  await writeAdminAudit(db, params);
}

/**
 * PATCH /api/admin/users/[id] — action: "license" | "modules" | "edit" (zorunlu).
 *
 * FAZ 1:
 *  - license (MEM-001): sıkı tip doğrulama; -1/0/N KAYIPSIZ; no-op kayıt DB'ye DOKUNMAZ;
 *    tüm cihazları kapatan (hesabı kilitleyen) ayar açık `confirmLockout` ister (409 önizleme);
 *    lisans / güvenlik istisnası / limit değişimleri ayrı audit üretir.
 *  - modules (MEM-007/008): YALNIZ değişen anahtar(lar) (`changes`) + kanonik whitelist +
 *    boolean; atomik RPC kilit altında birleştirir (lost-update yok) ve gerçek final
 *    duruma göre audit yazar. Tam izin haritası (`modulePermissions`) KABUL EDİLMEZ.
 *  - edit (MEM-002): yalnız ad/e-posta/rol; `active` → 400 (aktiflik yalnız durum
 *    işlemiyle). Değişen alanlar audit'lenir (değer/PII yazılmaz).
 *
 * AŞAMA 2 · P1-7: license (tamamı) ve edit'te e-posta değişimi YALNIZ ana yönetici (403).
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");

  // Hedef bir admin ise yalnız ana yönetici düzenleyebilir (normal admin başka
  // adminin kritik alanlarını / modül / lisans / rol bilgisini değiştiremez).
  const adminTarget = await requireMainAdminForAdminTarget(db, adminId, id);
  if (!adminTarget.ok) return bad(adminTarget.error, adminTarget.status);

  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const body = parsed.value;

  if (body.action === "license") return patchLicense(db, adminId, id, body);
  if (body.action === "modules") return patchModules(db, adminId, id, body);
  if (body.action === "edit") return patchProfile(db, adminId, id, body);
  return bad("Geçersiz action. license | modules | edit bekleniyor.");
}

type Db = Parameters<typeof writeAdminAudit>[0];

async function patchLicense(db: Db, adminId: string, id: string, body: Record<string, unknown>) {
  // Self-target koruması: admin kendi oturum limitlerini bu ekrandan değiştiremez.
  if (id === adminId) return bad("Kendi oturum limitlerinizi bu ekrandan değiştiremezsiniz.", 403);

  // AŞAMA 2 · P1-7 (owner kararı 14): bu action'ın yazdığı TÜM alanlar (lisans türü, oturum /
  // cihaz limitleri, lokasyon, güvenlik modu, güvenlik istisnası, lisans notu) güvenlik
  // politikasıdır → YALNIZ ana yönetici. Normal admin değerleri GET ile görür, değiştiremez.
  const main = await requireMainAdmin(db, adminId);
  if (!main.ok) return bad("Lisans ve güvenlik politikasını yalnızca ana yönetici değiştirebilir.", 403);

  const v = validateLicensePayload(body);
  if (!v.ok) return bad(v.error);
  const next = v.value;

  const { data: row, error: rowErr } = await db
    .from("users")
    .select(
      "id, license_type, allowed_active_sessions, allowed_locations, allowed_desktop_sessions, allowed_mobile_sessions, allowed_tablet_sessions, allowed_unknown_sessions, security_mode, security_exempt, license_note",
    )
    .eq("id", id)
    .maybeSingle();
  if (rowErr) return bad("Lisans bilgisi okunamadı.", 500);
  if (!row) return bad("Kullanıcı bulunamadı.", 404);

  const before = parseLicenseSettings(row as Record<string, unknown>);

  // No-op: değer değişmediyse DB'ye YAZILMAZ, audit ÜRETİLMEZ (MEM-001).
  if (licenseSettingsEqual(before, next)) {
    return NextResponse.json({ ok: true, changed: false, revokedSessionCount: 0 }, { headers: NO_STORE });
  }

  // Hesabı fiilen kilitleyen ayar (toplam=0 veya tüm cihaz türleri=0; istisna yok) → açık onay.
  const lockout = analyzeLockout(next);
  if (lockout.fullLockout && body.confirmLockout !== true) {
    return bad(
      "Bu ayarlarla kullanıcı HİÇBİR cihazdan giriş yapamaz (hesap fiilen kilitlenir). Onaylayın.",
      409,
      { ok: false, requiresLockoutConfirmation: true },
    );
  }

  const newLimits: SessionLimits = {
    total: next.allowedActiveSessions,
    desktop: next.allowedDesktopSessions,
    mobile: next.allowedMobileSessions,
    tablet: next.allowedTabletSessions,
    unknown: next.allowedUnknownSessions,
  };

  // Limit DÜŞÜRME fazlalığı: exempt değilse aktif oturumlara göre hesapla.
  let revokePlan = { toRevoke: [] as string[], total: 0, byDevice: { desktop: 0, mobile: 0, tablet: 0, unknown: 0 } };
  if (!next.securityExempt) {
    const { data: activeSessions } = await db
      .from("user_sessions")
      .select("id, platform, created_at")
      .eq("user_id", id)
      .eq("is_active", true);
    revokePlan = computeExcessSessionsToRevoke((activeSessions ?? []) as ActiveSessionRow[], newLimits);
  }

  // Fazla oturum kapanacaksa ONAYSIZ uygulama YAPMA → 409 preview.
  if (revokePlan.total > 0 && body.confirmExcessRevocation !== true) {
    return bad(`Bu limitler ${revokePlan.total} aktif oturumu kapatacak. Onaylayın.`, 409, {
      ok: false,
      requiresConfirmation: true,
      excessSessionCount: revokePlan.total,
      byDevice: revokePlan.byDevice,
    });
  }

  const { error } = await db.from("users").update({
    license_type:              next.licenseType,
    allowed_active_sessions:   next.allowedActiveSessions,
    allowed_locations:         next.allowedLocations,
    allowed_desktop_sessions:  next.allowedDesktopSessions,
    allowed_mobile_sessions:   next.allowedMobileSessions,
    allowed_tablet_sessions:   next.allowedTabletSessions,
    allowed_unknown_sessions:  next.allowedUnknownSessions,
    security_mode:             next.securityMode,
    security_exempt:           next.securityExempt,
    license_note:              next.licenseNote || null,
  }).eq("id", id);

  if (error) return bad("Lisans güncellenemedi.", 500);

  // Fazla oturumları deterministik (en eski önce) revoke et (onay verildi).
  let revokedSessionCount = 0;
  if (revokePlan.total > 0) {
    const { data: revoked, error: revErr } = await db
      .from("user_sessions")
      .update({ is_active: false, ended_at: new Date().toISOString(), end_reason: "admin_session_limit" })
      .in("id", revokePlan.toRevoke)
      .eq("is_active", true)
      .select("id");
    if (revErr) {
      return bad("Limitler güncellendi ancak fazla oturumlar kapatılamadı. Lütfen tekrar deneyin.", 500);
    }
    revokedSessionCount = revoked?.length ?? 0;
  }

  // Audit (MEM-010): limit / lisans meta / güvenlik istisnası AYRI kayıtlar. Not içeriği,
  // parola veya PII yazılmaz (yalnız "not değişti" bayrağı).
  try {
    const actorIsMainAdmin = await resolveIsSuperAdmin(db, adminId);
    const limitsChanged = SESSION_LIMIT_FIELDS.some((f) => before[f] !== next[f]);
    if (limitsChanged || revokedSessionCount > 0) {
      await audit(db, {
        actorAdminId: adminId,
        action: "total_session_limit_changed",
        targetUserId: id,
        actorIsMainAdmin,
        oldValue: {
          allowed_active_sessions:  before.allowedActiveSessions,
          allowed_desktop_sessions: before.allowedDesktopSessions,
          allowed_mobile_sessions:  before.allowedMobileSessions,
          allowed_tablet_sessions:  before.allowedTabletSessions,
          allowed_unknown_sessions: before.allowedUnknownSessions,
        },
        newValue: {
          allowed_active_sessions:  next.allowedActiveSessions,
          allowed_desktop_sessions: next.allowedDesktopSessions,
          allowed_mobile_sessions:  next.allowedMobileSessions,
          allowed_tablet_sessions:  next.allowedTabletSessions,
          allowed_unknown_sessions: next.allowedUnknownSessions,
        },
        context: {
          revoked_session_count: revokedSessionCount,
          by_device: revokePlan.byDevice,
          full_lockout: lockout.fullLockout,
        },
      });
    }
    const metaChanged =
      before.licenseType !== next.licenseType ||
      before.allowedLocations !== next.allowedLocations ||
      before.securityMode !== next.securityMode ||
      before.licenseNote !== next.licenseNote;
    if (metaChanged) {
      await audit(db, {
        actorAdminId: adminId,
        action: "license_settings_changed",
        targetUserId: id,
        actorIsMainAdmin,
        oldValue: {
          license_type: before.licenseType,
          allowed_locations: before.allowedLocations,
          security_mode: before.securityMode,
        },
        newValue: {
          license_type: next.licenseType,
          allowed_locations: next.allowedLocations,
          security_mode: next.securityMode,
        },
        context: { note_changed: before.licenseNote !== next.licenseNote },
      });
    }
    if (before.securityExempt !== next.securityExempt) {
      await audit(db, {
        actorAdminId: adminId,
        action: "security_exempt_changed",
        targetUserId: id,
        actorIsMainAdmin,
        oldValue: { security_exempt: before.securityExempt },
        newValue: { security_exempt: next.securityExempt },
      });
    }
  } catch (e) {
    if (e instanceof AdminAuditError) return bad("İşlem kaydı oluşturulamadı.", 500);
    throw e;
  }

  return NextResponse.json({ ok: true, changed: true, revokedSessionCount }, { headers: NO_STORE });
}

async function patchModules(db: Db, adminId: string, id: string, body: Record<string, unknown>) {
  if ("modulePermissions" in body) {
    return bad("Tam izin haritası kabul edilmez; yalnız değişen modül(ler) `changes` ile gönderilmelidir.");
  }
  const v = validateModuleChanges(body.changes);
  if (!v.ok) return bad(v.error);

  const aliases: Record<string, string[]> = {};
  for (const key of Object.keys(v.changes) as AdminModuleUiKey[]) {
    const a = adminModuleAliasKeys(key);
    if (a.length > 0) aliases[key] = a;
  }

  // Atomik: hedef satır FOR UPDATE; yalnız değişen anahtar(lar) birleştirilir (eşzamanlı başka
  // toggle ezilmez) + gerçek önce/sonra farkına göre module_enabled/module_disabled audit AYNI tx.
  const { data, error } = await db.rpc("admin_set_module_permissions", {
    p_user_id: id,
    p_actor_admin_id: adminId,
    p_changes: v.changes,
    p_aliases: aliases,
  });
  if (error) {
    const status = rpcErrorStatus(error);
    return bad(
      status === 409
        ? "Modül izinleri yalnız uzman hesaplarında yönetilebilir."
        : status === 400
          ? "Geçersiz modül değişikliği."
          : "Modül izinleri güncellenemedi.",
      status,
    );
  }
  const result = (data ?? {}) as { enabled?: string[]; disabled?: string[]; module_permissions?: unknown };
  return NextResponse.json(
    {
      ok: true,
      enabled: result.enabled ?? [],
      disabled: result.disabled ?? [],
      modulePermissions: result.module_permissions ?? {},
    },
    { headers: NO_STORE },
  );
}

async function patchProfile(db: Db, adminId: string, id: string, body: Record<string, unknown>) {
  const v = validateProfileEdit(body);
  if (!v.ok) return bad(v.error);
  const { fullName, email, role } = v.value;

  const { data: current, error: curErr } = await db
    .from("users")
    .select("id, full_name, email, role, active")
    .eq("id", id)
    .maybeSingle();
  if (curErr) return bad("Kullanıcı okunamadı.", 500);
  if (!current) return bad("Kullanıcı bulunamadı.", 404);

  const cur = current as { full_name?: unknown; email?: unknown; role?: unknown; active?: unknown };
  const curRole = String(cur.role ?? "").trim().toLowerCase() === "admin" ? "admin" : "expert";
  const nameChanged = String(cur.full_name ?? "").trim() !== fullName;
  const emailChanged = String(cur.email ?? "").trim().toLowerCase() !== email;
  const roleChanged = curRole !== role;

  if (!nameChanged && !emailChanged && !roleChanged) {
    return NextResponse.json({ ok: true, changed: false }, { headers: NO_STORE });
  }

  // AŞAMA 2 · P1-7: e-posta = giriş kimliği. Değiştirilmesi hesap devralmaya kapı açar →
  // YALNIZ ana yönetici. Yalnız isim değişikliği normal admin'e açık kalır.
  if (emailChanged) {
    const main = await requireMainAdmin(db, adminId);
    if (!main.ok) return bad("E-posta adresini yalnızca ana yönetici değiştirebilir.", 403);
  }

  if (roleChanged) {
    if (id === adminId) return bad("Kendi rolünüzü değiştiremezsiniz.", 403);
    // Bir kullanıcıyı ADMIN yapmak (rol yükseltme) yalnız ana yöneticiye açıktır.
    if (role === "admin") {
      const main = await requireMainAdmin(db, adminId);
      if (!main.ok) return bad(main.error, main.status);
    } else {
      // Kilitlenme koruması: owner / son aktif admin rolü düşürülemez.
      const lock = await guardAdminLockoutById(db, id, {
        willBeActive: cur.active === true,
        willBeAdmin: false,
      });
      if (!lock.ok) return bad(lock.error, lock.status);
    }
  }

  // MEM-002: `active` bu yoldan ASLA yazılmaz (yalnız değişen profil alanları).
  const updatePayload: Record<string, unknown> = {};
  if (nameChanged) updatePayload.full_name = fullName;
  if (emailChanged) updatePayload.email = email;
  if (roleChanged) updatePayload.role = role;

  // BF-11F-B: e-posta normalized-unique index; çakışma 409, ham DB hatası SIZDIRILMAZ.
  const { error } = await db.from("users").update(updatePayload).eq("id", id);
  if (error) {
    if (error.code === "23505") return bad("Bu e-posta adresi zaten kayıtlı.", 409);
    return bad("Kullanıcı güncellenemedi.", 500);
  }

  // Audit (MEM-010): hangi alanların değiştiği (değer/PII yok) + rol önce/sonra.
  try {
    const actorIsMainAdmin = await resolveIsSuperAdmin(db, adminId);
    if (nameChanged || emailChanged) {
      await audit(db, {
        actorAdminId: adminId,
        action: "user_profile_updated",
        targetUserId: id,
        actorIsMainAdmin,
        context: {
          fields: [...(nameChanged ? ["name"] : []), ...(emailChanged ? ["email"] : [])],
        },
      });
    }
    if (roleChanged) {
      await audit(db, {
        actorAdminId: adminId,
        action: "role_changed",
        targetUserId: id,
        actorIsMainAdmin,
        oldValue: { role: curRole },
        newValue: { role },
      });
    }
  } catch (e) {
    if (e instanceof AdminAuditError) return bad("İşlem kaydı oluşturulamadı.", 500);
    throw e;
  }

  return NextResponse.json({ ok: true, changed: true }, { headers: NO_STORE });
}
