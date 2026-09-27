import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { guardAdminLockoutById, requireMainAdminForAdminTarget } from "@/lib/admin/adminGuards";
import { jsonNoStore, readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";
import {
  buildPremiumMembershipPayload,
  filterMembershipPayloadForRow,
} from "@/lib/auth/membership";
import {
  ADMIN_MODULE_ALIAS_KEYS,
  rowHasMembershipColumns,
  validateApprovalModules,
} from "@/lib/admin/userManagement";
import { isUuid, rpcErrorStatus } from "@/lib/admin/memberRequestValidation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/admin/users/[id]/status
 *
 * Body:
 *   { action: "approve", modules: string[], expectedApproval: "pending" | "rejected" }
 *                                                      — FAZ 1 / MEM-004: modül seçimi ZORUNLU;
 *                                                        gördüğü durum ≠ gerçek → 409 (bayat ekran)
 *   { action: "reject" }                               — MEM-003: yalnız PENDING hedef
 *   { action: "toggle_active", currentActive: boolean }
 *
 * Tüm durum değişiklikleri + ZORUNLU audit + oturum iptali TEK PostgreSQL transaction'ında,
 * hedef satır `FOR UPDATE` kilidi altında (migration 20270129000000):
 *   - approve → admin_approve_expert_with_modules: pending/rejected → approved + active +
 *               Premium + YALNIZ seçilen modüller (+ YH kuralı) + eski oturum iptali. Zaten
 *               onaylı → 409 (membership_started_at / audit tekrar yazılmaz).
 *   - reject  → admin_reject_user: yalnız pending; rejected + inactive + TÜM oturumlar iptal.
 *   - toggle  → admin_set_user_active: durum değişince oturumlar iptal (eski token canlanmaz);
 *               onaysız uzman aktifleştirilemez (409).
 * Owner/son-admin/self/admin-hedef korumaları burada (route) KALIR.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");

  // Adminin kendi hesabı üzerinde durum işlemi engellenir.
  if (id === adminId) return bad("Kendi hesabınız üzerinde durum değişikliği yapamazsınız.");

  // Hedef bir admin ise yalnız ana yönetici durum değiştirebilir.
  const adminTarget = await requireMainAdminForAdminTarget(db, adminId, id);
  if (!adminTarget.ok) return bad(adminTarget.error, adminTarget.status);

  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const body = parsed.value;

  // ── ONAYLA + MODÜL SEÇİMİ → PREMIUM (atomik) ─────────────────────────────
  if (body.action === "approve") {
    const mods = validateApprovalModules(body.modules);
    if (!mods.ok) return bad(mods.error);
    // Bayat ekran koruması: yöneticinin gördüğü onay durumu ZORUNLU (RPC kilit altında karşılaştırır).
    const expectedApproval = body.expectedApproval;
    if (expectedApproval !== "pending" && expectedApproval !== "rejected") {
      return bad("Geçerli beklenen onay durumu (expectedApproval: pending | rejected) gerekli.");
    }

    const { data: currentRow, error: fetchErr } = await db
      .from("users")
      .select(USERS_SAFE_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return bad("Kullanıcı okunamadı.", 500);
    if (!currentRow) return bad("Kullanıcı bulunamadı.", 404);
    const row = currentRow as unknown as Record<string, unknown>;
    if (!rowHasMembershipColumns(row)) return bad("Veritabanında paket kolonları bulunamadı.", 422);
    const membershipPayload = filterMembershipPayloadForRow(buildPremiumMembershipPayload(), row);

    const { data, error } = await db.rpc("admin_approve_expert_with_modules", {
      p_user_id: id,
      p_membership: membershipPayload,
      p_actor_admin_id: adminId,
      p_modules: mods.fullMap,
      p_remove_keys: [...ADMIN_MODULE_ALIAS_KEYS],
      p_expected_approval: expectedApproval,
    });
    if (error) {
      const status = rpcErrorStatus(error);
      if ((error as { code?: string }).code === "UY001") {
        return bad("Uzmanın onay durumu bu sırada değişmiş; sayfayı yenileyip tekrar deneyin.", 409);
      }
      return bad(
        status === 409
          ? "Bu hesap onay bekleyen bir uzman değil (zaten onaylı olabilir). Sayfayı yenileyin."
          : status === 400
            ? "Onay için geçerli modül seçimi gerekli."
            : "Onay işlemi tamamlanamadı (tekrar deneyin).",
        status,
      );
    }
    const result = (data ?? {}) as { modules?: string[]; module_count?: number };
    return jsonNoStore({
      ok: true,
      approval_status: "approved",
      active: true,
      package_type: "premium",
      modules: result.modules ?? mods.selected,
      moduleCount: result.module_count ?? mods.selected.length,
    });
  }

  // ── REDDET (yalnız pending; atomik + oturum iptali) ───────────────────────
  if (body.action === "reject") {
    const lock = await guardAdminLockoutById(db, id, { willBeActive: false });
    if (!lock.ok) return bad(lock.error, lock.status);
    const { data, error } = await db.rpc("admin_reject_user", {
      p_user_id: id,
      p_actor_admin_id: adminId,
    });
    if (error) {
      const status = rpcErrorStatus(error);
      return bad(
        status === 409
          ? "Yalnız onay bekleyen başvurular reddedilebilir. Onaylı üye için “Pasif Yap” veya “Pasife Al ve Arşivle” kullanın."
          : status === 400
            ? "Kullanıcı bulunamadı."
            : "Ret işlemi tamamlanamadı.",
        status,
      );
    }
    const result = (data ?? {}) as { revoked_session_count?: number };
    return jsonNoStore({
      ok: true,
      approval_status: "rejected",
      active: false,
      revokedSessionCount: result.revoked_session_count ?? 0,
    });
  }

  // ── PASİFE AL / AKTİFLEŞTİR (atomik + oturum iptali) ───────────────────────
  if (body.action !== "toggle_active") {
    return bad("Geçersiz action. approve | reject | toggle_active bekleniyor.");
  }

  // İstemcinin gördüğü mevcut durum ZORUNLU (optimistic-concurrency).
  if (typeof body.currentActive !== "boolean") {
    return bad("Geçerli mevcut durum (currentActive) gerekli.");
  }
  const expectedActive = body.currentActive;
  const willBeActive = !expectedActive;

  // Kilitlenme koruması: pasifleştirme owner'ı veya son aktif admini düşüremez.
  if (!willBeActive) {
    const lock = await guardAdminLockoutById(db, id, { willBeActive: false });
    if (!lock.ok) return bad(lock.error, lock.status);
  }

  const { data, error } = await db.rpc("admin_set_user_active", {
    p_user_id: id,
    p_actor_admin_id: adminId,
    p_active: willBeActive,
    p_expected_active: expectedActive,
  });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "UY001") {
      return bad("Kullanıcının güncel durumu değişmiş; sayfayı yenileyip tekrar deneyin.", 409);
    }
    if (code === "UY002") {
      return bad("Onaylanmamış uzman aktifleştirilemez; önce modül seçerek onaylayın.", 409);
    }
    return bad("Durum değişikliği tamamlanamadı.", rpcErrorStatus(error) === 400 ? 400 : 500);
  }
  const result = (data ?? {}) as { revoked_session_count?: number };
  return jsonNoStore({
    ok: true,
    active: willBeActive,
    revokedSessionCount: result.revoked_session_count ?? 0,
  });
}
