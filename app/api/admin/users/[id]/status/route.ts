import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { guardAdminLockoutById, requireMainAdminForAdminTarget } from "@/lib/admin/adminGuards";
import {
  revokeAllActiveSessions,
  SessionRevokeError,
  SESSION_END_REASON,
  jsonNoStore,
} from "@/lib/admin/accountSessionControls";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";
import {
  buildMembershipUpdatePayload,
  filterMembershipPayloadForRow,
} from "@/lib/auth/membership";
import { rowHasMembershipColumns } from "@/lib/admin/userManagement";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/[id]/status
 *
 * Body: { action: "approve" | "reject" | "toggle_active", currentActive?: boolean }
 *
 * AŞAMA 1 (atomiklik): tüm durum değişiklikleri + ZORUNLU audit TEK PostgreSQL
 * transaction'ında, hedef satır `FOR UPDATE` kilidi altında gerçekleşir (dar-yetkili
 * SECURITY DEFINER RPC'ler — migration 20270105000000):
 *   - approve  → admin_approve_expert_premium (premium+YH+approved_at koru+user_approved),
 *                mevcut module_permissions KORUNUR (RPC'ye NULL geçilir; topluca açma yok).
 *   - reject   → admin_reject_user (rejected+inactive+user_rejected).
 *   - toggle   → admin_set_user_active (active+user_activated/user_deactivated).
 * Audit yazılamazsa hesap değişikliği de COMMIT EDİLMEZ (uygulama-seviyesi telafi YOK).
 * Owner/son-admin/self/admin-hedef korumaları burada (route) KALIR; oturum iptali
 * pasifleştirmede RPC'den SONRA yapılır (active=false zaten erişimi bloke eder).
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  // Adminin kendi hesabı üzerinde durum işlemi engellenir.
  if (id === adminId) {
    return NextResponse.json(
      { error: "Kendi hesabınız üzerinde durum değişikliği yapamazsınız." },
      { status: 400 },
    );
  }

  // Hedef bir admin ise yalnız ana yönetici durum değiştirebilir.
  const adminTarget = await requireMainAdminForAdminTarget(db, adminId, id);
  if (!adminTarget.ok) {
    return NextResponse.json({ error: adminTarget.error }, { status: adminTarget.status });
  }

  const body = (await req.json()) as { action?: string; currentActive?: boolean };

  // ── ONAYLA → OTOMATİK PREMIUM (atomik; izinler korunur) ────────────────────
  if (body.action === "approve") {
    // Paket kolonlarının varlığı + premium membership payload (izinler RPC içinde NULL ile korunur).
    const { data: currentRow, error: fetchErr } = await db
      .from("users")
      .select(USERS_SAFE_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (fetchErr || !currentRow) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }
    const row = currentRow as unknown as Record<string, unknown>;
    if (!rowHasMembershipColumns(row)) {
      return NextResponse.json(
        { error: "Veritabanında paket kolonları bulunamadı." },
        { status: 422 },
      );
    }
    const membershipPayload = filterMembershipPayloadForRow(
      buildMembershipUpdatePayload("premium"),
      row,
    );

    const { error } = await db.rpc("admin_approve_expert_premium", {
      p_user_id: id,
      p_membership: membershipPayload,
      p_actor_admin_id: adminId,
    });
    if (error) {
      return NextResponse.json(
        { error: "Onay / Premium işlemi tamamlanamadı (tekrar deneyin)." },
        { status: 500 },
      );
    }
    return jsonNoStore({
      ok: true,
      approval_status: "approved",
      active: true,
      package_type: "premium",
    });
  }

  // ── REDDET (atomik) ────────────────────────────────────────────────────────
  if (body.action === "reject") {
    const lock = await guardAdminLockoutById(db, id, { willBeActive: false });
    if (!lock.ok) {
      return NextResponse.json({ error: lock.error }, { status: lock.status });
    }
    const { error } = await db.rpc("admin_reject_user", {
      p_user_id: id,
      p_actor_admin_id: adminId,
    });
    if (error) {
      return NextResponse.json({ error: "Ret işlemi tamamlanamadı." }, { status: 500 });
    }
    return jsonNoStore({ ok: true, approval_status: "rejected", active: false });
  }

  // ── PASİFE AL / AKTİFLEŞTİR (atomik + oturum iptali) ───────────────────────
  if (body.action !== "toggle_active") {
    return NextResponse.json(
      { error: "Geçersiz action. approve | reject | toggle_active bekleniyor." },
      { status: 400 },
    );
  }

  const willBeActive = !body.currentActive;

  // Kilitlenme koruması: pasifleştirme owner'ı veya son aktif admini düşüremez.
  if (!willBeActive) {
    const lock = await guardAdminLockoutById(db, id, { willBeActive: false });
    if (!lock.ok) {
      return NextResponse.json({ error: lock.error }, { status: lock.status });
    }
  }

  // Atomik: active + user_activated/user_deactivated audit (tek tx, FOR UPDATE).
  const { error } = await db.rpc("admin_set_user_active", {
    p_user_id: id,
    p_actor_admin_id: adminId,
    p_active: willBeActive,
  });
  if (error) {
    return NextResponse.json({ error: "Durum değişikliği tamamlanamadı." }, { status: 500 });
  }

  if (!willBeActive) {
    // Pasife alma sonrası oturum iptali (RPC'den SONRA): active=false ZATEN her korumalı
    // isteği bloke eder; ek olarak oturumları geçersizleştiririz (defans-in-depth).
    try {
      const revokedSessionCount = await revokeAllActiveSessions(
        db,
        id,
        SESSION_END_REASON.deactivated,
      );
      return jsonNoStore({ ok: true, active: false, revokedSessionCount });
    } catch (e) {
      if (e instanceof SessionRevokeError) {
        // Pasifleştirme + audit COMMIT edildi ve active=false erişimi engeller; yalnız oturum
        // temizliği başarısız. Yönetici gerekirse "tüm cihazlardan çıkış" ile tekrar deneyebilir.
        return jsonNoStore(
          { ok: true, active: false, warning: "Oturumlar kapatılamadı; erişim yine de engellendi." },
          200,
        );
      }
      throw e;
    }
  }

  return jsonNoStore({ ok: true, active: true });
}
