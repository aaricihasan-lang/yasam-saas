import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";
import { isUserPremiumPackage, adminPermissionsToPayload, mapDbUser } from "@/lib/admin/userManagement";
import {
  guardAdminLockoutById,
  requireMainAdmin,
  requireMainAdminForAdminTarget,
  resolveIsSuperAdmin,
} from "@/lib/admin/adminGuards";

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

  // İsteği yapan adminin ana yönetici olup olmadığı — UI ana-admine özel alanları
  // (workspace görüntüleme) yalnız buna göre gösterir. Güvenlik SERVER'da zorlanır.
  const viewerIsSuperAdmin = await resolveIsSuperAdmin(db, adminId);

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
  };

  if (body.action === "license") {
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

    const allowedActiveSessions  = Number(body.allowedActiveSessions);
    const allowedLocations        = Number(body.allowedLocations);
    const allowedDesktopSessions  = Number(body.allowedDesktopSessions ?? 0);
    const allowedMobileSessions   = Number(body.allowedMobileSessions  ?? 0);
    const allowedTabletSessions   = Number(body.allowedTabletSessions  ?? 0);
    const allowedUnknownSessions  = Number(body.allowedUnknownSessions ?? 0);

    if (!Number.isInteger(allowedActiveSessions) || allowedActiveSessions < 1 || allowedActiveSessions > 50) {
      return NextResponse.json({ error: "allowedActiveSessions 1–50 arasında tam sayı olmalıdır." }, { status: 400 });
    }
    if (!Number.isInteger(allowedLocations) || allowedLocations < 1 || allowedLocations > 20) {
      return NextResponse.json({ error: "allowedLocations 1–20 arasında tam sayı olmalıdır." }, { status: 400 });
    }
    if (!Number.isInteger(allowedDesktopSessions) || allowedDesktopSessions < 0 || allowedDesktopSessions > 20) {
      return NextResponse.json({ error: "allowedDesktopSessions 0–20 arasında tam sayı olmalıdır." }, { status: 400 });
    }
    if (!Number.isInteger(allowedMobileSessions) || allowedMobileSessions < 0 || allowedMobileSessions > 20) {
      return NextResponse.json({ error: "allowedMobileSessions 0–20 arasında tam sayı olmalıdır." }, { status: 400 });
    }
    if (!Number.isInteger(allowedTabletSessions) || allowedTabletSessions < 0 || allowedTabletSessions > 10) {
      return NextResponse.json({ error: "allowedTabletSessions 0–10 arasında tam sayı olmalıdır." }, { status: 400 });
    }
    if (!Number.isInteger(allowedUnknownSessions) || allowedUnknownSessions < 0 || allowedUnknownSessions > 5) {
      return NextResponse.json({ error: "allowedUnknownSessions 0–5 arasında tam sayı olmalıdır." }, { status: 400 });
    }

    const securityExempt = body.securityExempt === true;
    const licenseNote    = String(body.licenseNote ?? "").trim().slice(0, 500);

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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
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
