import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { guardAdminLockoutById, requireMainAdmin, requireMainAdminForAdminTarget } from "@/lib/admin/adminGuards";
import { jsonNoStore, readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";
import {
  buildApprovalMembershipPayload,
  filterMembershipPayloadForRow,
} from "@/lib/auth/membership";
import {
  ADMIN_MODULE_ALIAS_KEYS,
  rowHasMembershipColumns,
  validateApprovalModules,
} from "@/lib/admin/userManagement";
import { isUuid, rpcErrorStatus } from "@/lib/admin/memberRequestValidation";
import { validateTechniqueGrants } from "@/lib/astrology/access/techniqueGrants";
import { TRIAL_DEFAULT_MODULE_PERMISSIONS } from "@/lib/trial/trialCore";
import { trialClaimHash } from "@/lib/trial/trialServer";

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
 *   { action: "approve_trial", expectedApproval }      — TRIAL7: 7 günlük deneme onayı (Premium DEĞİL;
 *                                                        tek deneme hakkı 24 ay; süre ilk girişte başlar)
 *   { action: "repair_legacy_pro", modules, expectedPackage, astrologyGrants? }
 *                                                      — H2: onaylı + aktif ama paketi Premium OLMAYAN eski
 *                                                        kayıt → Pro (yalnız ana yönetici; bayat ekran 409)
 *   { action: "reject" }                               — MEM-003: yalnız PENDING hedef
 *   { action: "toggle_active", currentActive: boolean }
 *
 * Tüm durum değişiklikleri + ZORUNLU audit + oturum iptali TEK PostgreSQL transaction'ında,
 * hedef satır `FOR UPDATE` kilidi altında (migration 20270129235900):
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
    // 2026-11-03 Gökyüzü Atlası: Astroloji seçiliyse teknik izinleri ZORUNLU ve onayla AYNI işlemde yazılır
    // (admin_approve_expert_with_astrology). Astroloji seçili değilse mevcut onay akışı aynen.
    let astrologyGrants: unknown = null;
    if (mods.fullMap.astrology === true) {
      const g = validateTechniqueGrants(body.astrologyGrants);
      if (!g.ok) {
        const missing = body.astrologyGrants === undefined || body.astrologyGrants === null;
        return NextResponse.json(
          { error: missing || g.code === "EMPTY_SELECTION" ? "Astroloji için en az bir Gökyüzü Atlası tekniği seçilmelidir." : "Geçersiz Astroloji teknik izinleri.", code: missing ? "ASTROLOGY_TECHNIQUES_REQUIRED" : g.code },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      astrologyGrants = g.grants;
    } else if (body.astrologyGrants !== undefined && body.astrologyGrants !== null) {
      return bad("Astroloji seçilmeden teknik izni verilemez.");
    }
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
    // H1: Pro onayı deneme/keşif penceresi YAZMAZ (trial_* anahtarı yok → mevcut tarihçe korunur).
    const membershipPayload = filterMembershipPayloadForRow(buildApprovalMembershipPayload(), row);

    const approveArgs = {
      p_user_id: id,
      p_membership: membershipPayload,
      p_actor_admin_id: adminId,
      p_modules: mods.fullMap,
      p_remove_keys: [...ADMIN_MODULE_ALIAS_KEYS],
      p_expected_approval: expectedApproval,
    };
    const { data, error } = astrologyGrants
      ? await db.rpc("admin_approve_expert_with_astrology", { ...approveArgs, p_astrology_grants: astrologyGrants })
      : await db.rpc("admin_approve_expert_with_modules", approveArgs);
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

  // ── 7 GÜNLÜK DENEMEYİ ONAYLA (TRIAL7; Premium/Pro onayından AYRI) ─────────────
  // Hesap mevcut deneme rejimine geçer (self_7d, not_started); süre ilk başarılı girişte başlar.
  // Tek deneme hakkı: kayıtlı e-postanın kanonik HMAC özeti (istemciden ALINMAZ); son 24 ayda
  // kullanılmışsa 409 ve hesap değişmez. Modüller sabit deneme paketi (Dijital İçerik hariç).
  if (body.action === "approve_trial") {
    const expectedApproval = body.expectedApproval;
    if (expectedApproval !== "pending" && expectedApproval !== "rejected") {
      return bad("Geçerli beklenen onay durumu (expectedApproval: pending | rejected) gerekli.");
    }
    const { data: target, error: targetErr } = await db.from("users").select("email, role").eq("id", id).maybeSingle();
    if (targetErr) return bad("Kullanıcı okunamadı.", 500);
    const email = String((target as { email?: unknown } | null)?.email ?? "").trim();
    if (!target || !email) return bad("Kullanıcı bulunamadı.", 404);
    const { data, error } = await db.rpc("admin_approve_expert_trial", {
      p_actor: adminId,
      p_user_id: id,
      p_expected_approval: expectedApproval,
      p_claim_hash: trialClaimHash(email),
      p_modules: { ...TRIAL_DEFAULT_MODULE_PERMISSIONS },
    });
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "TR410") {
        return bad(
          "Bu e-posta kimliğiyle son 24 ay içinde ücretsiz deneme kullanılmış. Başvuruyu reddedebilir veya ödeme alındıysa Pro üyelik onaylayabilirsiniz.",
          409,
        );
      }
      if (code === "UY001") return bad("Uzmanın onay durumu bu sırada değişmiş; sayfayı yenileyip tekrar deneyin.", 409);
      if (code === "TR409") return bad("Bu hesap 7 günlük deneme için uygun değil (onaylı, Pro, deneme veya demo hesabı).", 409);
      if (code === "TR404") return bad("Kullanıcı bulunamadı.", 404);
      if (code === "TR401") return bad("Yetki yok.", 403);
      return bad("Deneme onayı tamamlanamadı (tekrar deneyin).", 500);
    }
    const result = (data ?? {}) as { revoked_session_count?: number };
    return jsonNoStore({
      ok: true,
      approval_status: "approved",
      active: true,
      package_type: "trial",
      trial_status: "not_started",
      revokedSessionCount: result.revoked_session_count ?? 0,
    });
  }

  // ── H2: ESKİ KAYIT PAKET ONARIMI → PRO (yalnız ana yönetici; atomik + audit) ──────────
  // Onaylı + aktif ama paketi Premium olmayan, 7 günlük deneme rejiminde OLMAYAN eski kayıt. Hiçbir hesaba
  // kendiliğinden uygulanmaz; yalnız bu açık işlemle. Deneme tarihçesi ve ilk onay tarihi değişmez.
  if (body.action === "repair_legacy_pro") {
    const main = await requireMainAdmin(db, adminId);
    if (!main.ok) return bad(main.error, main.status);
    const mods = validateApprovalModules(body.modules);
    if (!mods.ok) return bad(mods.error);
    let astrologyGrants: unknown = null;
    if (mods.fullMap.astrology === true) {
      const g = validateTechniqueGrants(body.astrologyGrants);
      if (!g.ok) return bad("Astroloji için en az bir Gökyüzü Atlası tekniği seçilmelidir.");
      astrologyGrants = g.grants;
    } else if (body.astrologyGrants !== undefined && body.astrologyGrants !== null) {
      return bad("Astroloji seçilmeden teknik izni verilemez.");
    }
    const expectedPackage = body.expectedPackage;
    if (typeof expectedPackage !== "string" || !["", "trial", "pro"].includes(expectedPackage)) {
      return bad("Geçerli beklenen paket durumu (expectedPackage) gerekli.");
    }
    const { data, error } = await db.rpc("admin_repair_legacy_expert_to_pro", {
      p_actor_admin_id: adminId,
      p_user_id: id,
      p_modules: mods.fullMap,
      p_remove_keys: [...ADMIN_MODULE_ALIAS_KEYS],
      p_expected_package: expectedPackage,
      // Astroloji seçili değilse parametre HİÇ gönderilmez (DB varsayılanı NULL).
      ...(astrologyGrants ? { p_astrology_grants: astrologyGrants } : {}),
    });
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "UY001") return bad("Uzmanın paket durumu bu sırada değişmiş; sayfayı yenileyip tekrar deneyin.", 409);
      if (code === "UY002") {
        return bad(
          "Bu hesap eski kayıt onarımına uygun değil (zaten Pro, 7 günlük deneme üyesi, pasif, onaysız veya demo olabilir). Sayfayı yenileyin.",
          409,
        );
      }
      if (code === "UY003") return bad("Pro üyelik için geçerli modül seçimi gerekli.");
      if (code === "42501") return bad("Bu işlem yalnızca ana yöneticiye açıktır.", 403);
      return bad("Pro üyeliğe geçiş tamamlanamadı (tekrar deneyin).", 500);
    }
    const result = (data ?? {}) as { modules?: string[]; module_count?: number; revoked_session_count?: number };
    return jsonNoStore({
      ok: true,
      approval_status: "approved",
      active: true,
      package_type: "premium",
      modules: result.modules ?? mods.selected,
      moduleCount: result.module_count ?? mods.selected.length,
      revokedSessionCount: result.revoked_session_count ?? 0,
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
    return bad("Geçersiz action. approve | approve_trial | repair_legacy_pro | reject | toggle_active bekleniyor.");
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
    if (code === "UY004") {
      // AŞAMA 4a: arşivdeki hesap doğrudan aktifleştirilemez (DB kuralı; düğme gizlemeye güvenilmez).
      return bad("Hesap arşivde. Önce ana yönetici arşivden çıkarmalıdır; ardından hesap aktifleştirilebilir.", 409);
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
