import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { guardAdminLockoutById, requireMainAdminForAdminTarget } from "@/lib/admin/adminGuards";
import { writeAdminAudit, AdminAuditError } from "@/lib/admin/adminAudit";
import {
  revokeAllActiveSessions,
  resolveActorIsMainAdmin,
  SessionRevokeError,
  SESSION_END_REASON,
  jsonNoStore,
} from "@/lib/admin/accountSessionControls";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/[id]/status
 *
 * Body: { action: "approve" | "reject" | "toggle_active", currentActive?: boolean }
 *
 * P2: toggle_active ile pasife alma artık hedefin TÜM oturumlarını geçersizleştirir
 * ve audit yazar (user_deactivated / user_activated). Aktifleştirme oturum
 * OLUŞTURMAZ (kullanıcı tekrar giriş yapmalı) ve eski revoke edilmiş oturumları
 * canlandırmaz. approve/reject (pending gate, P1) davranışı DEĞİŞMEZ.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  // Adminin kendi hesabı üzerinde pasif/aktif işlemi engellenir
  if (id === adminId) {
    return NextResponse.json(
      { error: "Kendi hesabınız üzerinde durum değişikliği yapamazsınız." },
      { status: 400 },
    );
  }

  // Hedef bir admin ise yalnız ana yönetici durum değiştirebilir (normal admin
  // başka admini yönetemez). Expert hedefte normal admin serbest.
  const adminTarget = await requireMainAdminForAdminTarget(db, adminId, id);
  if (!adminTarget.ok) {
    return NextResponse.json({ error: adminTarget.error }, { status: adminTarget.status });
  }

  const body = (await req.json()) as {
    action?: string;
    currentActive?: boolean;
  };

  let updatePayload: Record<string, unknown>;

  switch (body.action) {
    case "approve":
      updatePayload = {
        approval_status: "approved",
        active: true,
        approved_at: new Date().toISOString(),
      };
      break;

    case "reject":
      updatePayload = {
        approval_status: "rejected",
        active: false,
      };
      break;

    case "toggle_active":
      updatePayload = { active: !body.currentActive };
      break;

    default:
      return NextResponse.json(
        { error: "Geçersiz action. approve | reject | toggle_active bekleniyor." },
        { status: 400 },
      );
  }

  // Kilitlenme koruması: pasifleştirme (active=false) owner'ı veya son aktif admini düşüremez.
  if (updatePayload.active === false) {
    const lock = await guardAdminLockoutById(db, id, { willBeActive: false });
    if (!lock.ok) {
      return NextResponse.json({ error: lock.error }, { status: lock.status });
    }
  }

  const { error } = await db.from("users").update(updatePayload).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── P2: yalnız toggle_active için oturum geçersizleştirme + audit ───────────
  if (body.action === "toggle_active") {
    const willBeActive = updatePayload.active === true;

    if (!willBeActive) {
      // Pasife alma: active=false ZATEN her korumalı isteği bloke eder (per-request
      // active kontrolü); ek olarak tüm oturumları geçersizleştiririz ki istemci
      // giriş ekranına düşsün ve eski token API'de reddedilsin.
      let revokedSessionCount: number;
      try {
        revokedSessionCount = await revokeAllActiveSessions(db, id, SESSION_END_REASON.deactivated);
      } catch (e) {
        if (e instanceof SessionRevokeError) {
          return jsonNoStore({ ok: false, error: "Oturumlar kapatılamadı." }, 500);
        }
        throw e;
      }
      try {
        const actorIsMainAdmin = await resolveActorIsMainAdmin(db, adminId);
        await writeAdminAudit(db, {
          actorAdminId: adminId,
          action: "user_deactivated",
          targetUserId: id,
          actorIsMainAdmin,
          context: { revoked_session_count: revokedSessionCount },
        });
      } catch (e) {
        if (e instanceof AdminAuditError) {
          return jsonNoStore({ ok: false, error: "İşlem kaydı oluşturulamadı." }, 500);
        }
        throw e;
      }
      return jsonNoStore({ ok: true, active: false, revokedSessionCount });
    }

    // Aktifleştirme: oturum OLUŞTURULMAZ; yalnız audit.
    try {
      const actorIsMainAdmin = await resolveActorIsMainAdmin(db, adminId);
      await writeAdminAudit(db, {
        actorAdminId: adminId,
        action: "user_activated",
        targetUserId: id,
        actorIsMainAdmin,
        context: {},
      });
    } catch (e) {
      if (e instanceof AdminAuditError) {
        return jsonNoStore({ ok: false, error: "İşlem kaydı oluşturulamadı." }, 500);
      }
      throw e;
    }
    return jsonNoStore({ ok: true, active: true });
  }

  return NextResponse.json({ ok: true });
}
