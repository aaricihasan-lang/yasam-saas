import { NextRequest } from "next/server";
import { requestTranslator } from "@/lib/i18n/serverMessages";
import { jsonNoStore, verifySelfSessionRequest } from "@/lib/auth/sessionModel";

export const runtime = "nodejs";

/**
 * GET /api/me/devices — GİRİŞ GÜVENLİĞİ F2-C: kendi güvenilir cihazlarım (açık anahtar DÖNMEZ).
 * Yetki DB'de: auth_device_list('user', <kendim>) — oturum token'ı aktör kanıtıdır.
 */
export async function GET(req: NextRequest) {
  const te = requestTranslator(req, "auth.server");
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  const { data, error } = await guard.db.rpc("auth_device_list", { p_actor_token: guard.token, p_scope: "user", p_user_id: guard.userId });
  if (error) return jsonNoStore({ error: te("devices.listFailed") }, 500);
  const r = (data ?? {}) as { ok?: unknown; devices?: unknown };
  if (r.ok !== true) return jsonNoStore({ error: "Yetki yok." }, 403);
  return jsonNoStore({ devices: Array.isArray(r.devices) ? r.devices : [] }, 200);
}
