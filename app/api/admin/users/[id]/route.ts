import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";
import { isUserPremiumPackage, adminPermissionsToPayload, mapDbUser } from "@/lib/admin/userManagement";
import {
  guardAdminLockoutById,
  requireMainAdmin,
  requireMainAdminForAdminTarget,
  resolveIsSuperAdmin,
  isSuperAdminWorkspaceViewEnabled,
} from "@/lib/admin/adminGuards";
import { writeAdminAudit, AdminAuditError } from "@/lib/admin/adminAudit";
import {
  computeExcessSessionsToRevoke,
  type SessionLimits,
  type ActiveSessionRow,
} from "@/lib/admin/sessionLimitManagement";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/admin/users/[id] — kullanıcı detayı + ödeme geçmişi */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
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

  // UI workspace kartını yalnız (ana yönetici VE flag açık) ise gösterir — server-derived
  // capability. `viewerIsSuperAdmin` alanı bu iki koşulun birleşimini taşır; flag kapalıysa
  // ana yönetici de kartı görmez (false-success önlenir). Güvenlik ayrıca SERVER'da zorlanır.
  const viewerIsSuperAdmin =
    (await resolveIsSuperAdmin(db, adminId)) && isSuperAdminWorkspaceViewEnabled();

  return NextResponse.json({ user: data, paymentHistory: history ?? [], viewerIsSuperAdmin });
}

/** PATCH /api/admin/users/[id] — kullanıcı bilgileri veya modül izinleri */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  // Hedef bir admin ise yalnız ana yönetici düzenleyebilir (normal admin başka
  // adminin kritik alanlarını / modül / lisans / rol bilgisini değiştiremez).
  const adminTarget = await requireMainAdminForAdminTarget(db, adminId, id);
  if (!adminTarget.ok) {
    return NextResponse.json({ error: adminTarget.error }, { status: adminTarget.status });
  }

  const body = (await req.json()) as {
    action?: "edit" | "modules" | "license";
    fullName?: string;
    email?: string;
    role?: string;
    active?: boolean;
    modulePermissions?: Record<string, boolean>;
    licenseType?: string;
    allowedActiveSessions?: number;
    allowedLocations?: number;
    allowedDesktopSessions?: number;
    allowedMobileSessions?: number;
    allowedTabletSessions?: number;
    allowedUnknownSessions?: number;
    securityMode?: string;
    securityExempt?: boolean;
    licenseNote?: string;
    confirmExcessRevocation?: boolean;
  };

  if (body.action === "license") {
    // Self-target koruması: admin kendi oturum limitlerini bu ekrandan değiştiremez
    // (yanlışlıkla kendi oturumunu kapatma riski).
    if (id === adminId) {
      return NextResponse.json(
        { error: "Kendi oturum limitlerinizi bu ekrandan değiştiremezsiniz." },
        { status: 403 },
      );
    }

    const VALID_LICENSE_TYPES  = ["single", "professional", "family", "partner", "team", "custom"];
    const VALID_SECURITY_MODES = ["strict", "normal", "flexible"];

    // ── Sıkı validasyon — geçersiz değer → 400 ───────────────────────────
    if (!VALID_LICENSE_TYPES.includes(String(body.licenseType ?? ""))) {
      return NextResponse.json(
        { error: `Geçersiz licenseType. Kabul edilenler: ${VALID_LICENSE_TYPES.join(", ")}` },
        { status: 400 },
      );
    }
    if (!VALID_SECURITY_MODES.includes(String(body.securityMode ?? ""))) {
      return NextResponse.json(
        { error: `Geçersiz securityMode. Kabul edilenler: ${VALID_SECURITY_MODES.join(", ")}` },
        { status: 400 },
      );
    }

    // P3 semantiği: oturum limitleri -1 (SINIRSIZ) · 0 (YASAK) · N (max).
    const allowedActiveSessions  = Number(body.allowedActiveSessions);
    const allowedLocations       = Number(body.allowedLocations);
    const allowedDesktopSessions = Number(body.allowedDesktopSessions ?? -1);
    const allowedMobileSessions  = Number(body.allowedMobileSessions  ?? -1);
    const allowedTabletSessions  = Number(body.allowedTabletSessions  ?? -1);
    const allowedUnknownSessions = Number(body.allowedUnknownSessions ?? -1);

    const validLimit = (n: number) => Number.isInteger(n) && n >= -1 && n <= 10000;
    if (!validLimit(allowedActiveSessions)) {
      return NextResponse.json({ error: "allowedActiveSessions -1 (sınırsız), 0 (yasak) veya pozitif tam sayı olmalıdır." }, { status: 422 });
    }
    if (!Number.isInteger(allowedLocations) || allowedLocations < 1 || allowedLocations > 20) {
      return NextResponse.json({ error: "allowedLocations 1–20 arasında tam sayı olmalıdır." }, { status: 422 });
    }
    if (!validLimit(allowedDesktopSessions) || !validLimit(allowedMobileSessions) || !validLimit(allowedTabletSessions) || !validLimit(allowedUnknownSessions)) {
      return NextResponse.json({ error: "Cihaz limitleri -1 (sınırsız), 0 (yasak) veya pozitif tam sayı olmalıdır." }, { status: 422 });
    }

    const securityExempt = body.securityExempt === true;
    const licenseNote    = String(body.licenseNote ?? "").trim().slice(0, 500);

    const newLimits: SessionLimits = {
      total:   allowedActiveSessions,
      desktop: allowedDesktopSessions,
      mobile:  allowedMobileSessions,
      tablet:  allowedTabletSessions,
      unknown: allowedUnknownSessions,
    };

    // Audit için mevcut (eski) limitleri çek.
    const { data: before } = await db
      .from("users")
      .select("allowed_active_sessions, allowed_desktop_sessions, allowed_mobile_sessions, allowed_tablet_sessions, allowed_unknown_sessions")
      .eq("id", id)
      .maybeSingle();

    // Limit DÜŞÜRME fazlalığı: exempt değilse aktif oturumlara göre hesapla.
    let revokePlan = { toRevoke: [] as string[], total: 0, byDevice: { desktop: 0, mobile: 0, tablet: 0, unknown: 0 } };
    if (!securityExempt) {
      const { data: activeSessions } = await db
        .from("user_sessions")
        .select("id, platform, created_at")
        .eq("user_id", id)
        .eq("is_active", true);
      revokePlan = computeExcessSessionsToRevoke((activeSessions ?? []) as ActiveSessionRow[], newLimits);
    }

    // Fazla oturum kapanacaksa ONAYSIZ uygulama YAPMA → 409 preview.
    if (revokePlan.total > 0 && body.confirmExcessRevocation !== true) {
      return NextResponse.json(
        {
          ok: false,
          requiresConfirmation: true,
          excessSessionCount: revokePlan.total,
          byDevice: revokePlan.byDevice,
          error: `Bu limitler ${revokePlan.total} aktif oturumu kapatacak. Onaylayın.`,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { error } = await db.from("users").update({
      license_type:              body.licenseType,
      allowed_active_sessions:   allowedActiveSessions,
      allowed_locations:         allowedLocations,
      allowed_desktop_sessions:  allowedDesktopSessions,
      allowed_mobile_sessions:   allowedMobileSessions,
      allowed_tablet_sessions:   allowedTabletSessions,
      allowed_unknown_sessions:  allowedUnknownSessions,
      security_mode:             body.securityMode,
      security_exempt:           securityExempt,
      license_note:              licenseNote || null,
    }).eq("id", id);

    if (error) return NextResponse.json({ error: "Lisans güncellenemedi." }, { status: 500 });

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
        return NextResponse.json(
          { error: "Limitler güncellendi ancak fazla oturumlar kapatılamadı. Lütfen tekrar deneyin." },
          { status: 500 },
        );
      }
      revokedSessionCount = revoked?.length ?? 0;
    }

    // Audit (mevcut Faz G action: total_session_limit_changed). Parola/PII yok.
    try {
      const actorIsMainAdmin = await resolveIsSuperAdmin(db, adminId);
      await writeAdminAudit(db, {
        actorAdminId: adminId,
        action: "total_session_limit_changed",
        targetUserId: id,
        actorIsMainAdmin,
        oldValue: before ?? null,
        newValue: {
          allowed_active_sessions:  allowedActiveSessions,
          allowed_desktop_sessions: allowedDesktopSessions,
          allowed_mobile_sessions:  allowedMobileSessions,
          allowed_tablet_sessions:  allowedTabletSessions,
          allowed_unknown_sessions: allowedUnknownSessions,
        },
        context: { revoked_session_count: revokedSessionCount, by_device: revokePlan.byDevice },
      });
    } catch (e) {
      if (e instanceof AdminAuditError) {
        return NextResponse.json({ error: "İşlem kaydı oluşturulamadı." }, { status: 500 });
      }
      throw e;
    }

    return NextResponse.json({ ok: true, revokedSessionCount }, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.action === "modules") {
    if (!body.modulePermissions || typeof body.modulePermissions !== "object") {
      return NextResponse.json({ error: "modulePermissions gerekli." }, { status: 400 });
    }

    // Premium pakette modül izinleri değiştirilemez — sunucu koruması
    const { data: currentRow } = await db
      .from("users")
      .select(USERS_SAFE_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (!currentRow) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }

    const mapped = mapDbUser(currentRow as unknown as Record<string, unknown>);
    if (isUserPremiumPackage(mapped)) {
      return NextResponse.json(
        { error: "Premium pakette modül izinleri değiştirilemez." },
        { status: 400 },
      );
    }

    const { error } = await db
      .from("users")
      .update({ module_permissions: adminPermissionsToPayload(body.modulePermissions as never) })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Varsayılan: edit (fullName, email, role, active)
  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!fullName || !email) {
    return NextResponse.json({ error: "Ad ve e-posta zorunludur." }, { status: 400 });
  }

  // Rol yükseltme koruması: sadece 'admin' veya 'expert' kabul edilir
  const role = body.role === "admin" ? "admin" : "expert";
  const willBeActive = body.active !== false;

  // Bir kullanıcıyı ADMIN yapmak (rol yükseltme) yalnız ana yöneticiye açıktır.
  if (role === "admin") {
    const main = await requireMainAdmin(db, adminId);
    if (!main.ok) return NextResponse.json({ error: main.error }, { status: main.status });
  }

  // Admin kendi hesabını edit ile pasifleştiremez.
  if (id === adminId && !willBeActive) {
    return NextResponse.json(
      { error: "Kendi hesabınızı pasifleştiremezsiniz." },
      { status: 400 },
    );
  }

  // Kilitlenme koruması: owner / son aktif admin pasifleştirilemez veya rolü düşürülemez.
  if (!willBeActive || role !== "admin") {
    const lock = await guardAdminLockoutById(db, id, {
      willBeActive,
      willBeAdmin: role === "admin",
    });
    if (!lock.ok) {
      return NextResponse.json({ error: lock.error }, { status: lock.status });
    }
  }

  const updatePayload: Record<string, unknown> = {
    full_name: fullName,
    email,
    role,
    active: willBeActive,
  };

  // BF-11F-B: e-posta normalized-unique index (users_email_normalized_uidx) ile aynı
  // kanonik sözleşme; case/whitespace varyantı çakışması unique_violation (23505) verir.
  // Ham DB hatası kullanıcıya SIZDIRILMAZ; çakışma 409'a, diğer hatalar generic 500'e maplenir.
  const { error } = await db.from("users").update(updatePayload).eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Bu e-posta adresi zaten kayıtlı." }, { status: 409 });
    }
    return NextResponse.json({ error: "Kullanıcı güncellenemedi." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
