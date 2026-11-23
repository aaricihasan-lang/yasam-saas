import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/admin/devices — GİRİŞ GÜVENLİĞİ F2-C: Owner'ın bekleyen cihaz eşleştirme istekleri.
 * Yetki DB'de: yalnız is_super_admin Owner + MFA'lı (QR ile açılmış) Owner oturumu
 * (auth_device_list 'pending'). Açık anahtar DÖNMEZ; yalnız karşılaştırma kodu.
 */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  if (!guard.sessionToken) return NextResponse.json({ error: "Oturum doğrulanamadı." }, { status: 401, headers: NO_STORE });
  const { data, error } = await guard.db.rpc("auth_device_list", { p_actor_token: guard.sessionToken, p_scope: "pending", p_user_id: null });
  if (error) return NextResponse.json({ error: "Liste alınamadı." }, { status: 500, headers: NO_STORE });
  const r = (data ?? {}) as { ok?: unknown; devices?: unknown; code?: unknown };
  if (r.ok !== true) {
    return NextResponse.json(
      { code: "FORBIDDEN_OR_MFA", error: "Cihaz onayları yalnız Owner'ın QR ile açılmış oturumunda görüntülenir." },
      { status: 403, headers: NO_STORE },
    );
  }
  return NextResponse.json({ devices: Array.isArray(r.devices) ? r.devices : [] }, { status: 200, headers: NO_STORE });
}
