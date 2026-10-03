import { NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { SESSION_VIEW_SELECT, jsonNoStore, toSessionView } from "@/lib/auth/sessionModel";

export const runtime = "nodejs";

/**
 * GET /api/admin/me/session-approvals — OTURUM MODELİ v2.
 * Aktif admin oturumu (web veya resmi Android), KENDİ hesabına ait onay bekleyen web
 * girişlerini görür: cihaz/tarayıcı ailesi, giriş zamanı, maskeli IP, şehir/ülke.
 * Token/ham UA/ham IP DÖNMEZ. Pending token'ı bu uca erişemez (touch NULL → 401).
 */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { data, error } = await db
    .from("user_sessions")
    .select(SESSION_VIEW_SELECT)
    .eq("user_id", adminId)
    .eq("session_state", "pending_approval")
    .eq("is_active", false)
    .is("ended_at", null)
    .gt("pending_expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) return jsonNoStore({ ok: false, error: "Bekleyen girişler okunamadı." }, 500);

  const pending = (data ?? []).map((r) => {
    const v = toSessionView(r as Record<string, unknown>);
    return {
      id: v.id,
      device: v.device,
      platform: v.platform,
      createdAt: v.createdAt,
      pendingExpiresAt: v.pendingExpiresAt,
      ipMasked: v.ipMasked,
      city: v.city,
      country: v.country,
    };
  });
  return jsonNoStore({ ok: true, pending });
}
