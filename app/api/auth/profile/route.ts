import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * GET /api/auth/profile — oturum açmış kullanıcının güncel profili (Faz 2A).
 *
 * Amaç: Profil yenileme artık tarayıcıdan publishable key ile users tablosunu
 *       okumaz; service_role'lü bu route üzerinden gelir.
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user_id binding.
 *   - user_id SUNUCUDA oturum token'ından doğrulanır.
 *   - Yalnızca GÜVENLİ whitelist kolonları döner.
 *   - password / password_hash KESİNLİKLE seçilmez/dönmez.
 */

export async function GET(req: NextRequest): Promise<Response> {
  // PERF-2C/2D: Profil kolonları guard'ın TEK users SELECT'inde (opt-in whitelist)
  // alınır; eskiden burada yapılan ikinci `.from("users").select(PROFILE_SELECT)`
  // sorgusu kaldırıldı → /api/auth/profile kritik DB round-trip 3 → 2. Güvenli
  // whitelist ve response sözleşmesi ({ ok, profile }) birebir korunur.
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;

  if (!guard.profile) {
    return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, profile: guard.profile });
}
