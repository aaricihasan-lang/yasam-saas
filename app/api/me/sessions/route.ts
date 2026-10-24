import { NextRequest } from "next/server";
import { SESSION_VIEW_SELECT, jsonNoStore, toSessionView, verifySelfSessionRequest } from "@/lib/auth/sessionModel";

export const runtime = "nodejs";

/**
 * GET /api/me/sessions — OTURUM MODELİ v2 "Oturumlarım".
 * Kullanıcı (admin veya uzman) YALNIZ KENDİ oturumlarını görür: aktif + onay bekleyen +
 * son 30 günde kapananlardan en fazla 10. Token/ham UA/ham IP DÖNMEZ (IP maskeli).
 *
 * AUTH-04: herkese açık demo hesabı birçok ziyaretçi tarafından paylaşılır; "kendi oturumların"
 * orada başka kişilerin cihaz/konum bilgisidir → demo'da YALNIZ isteği yapan oturum döner.
 */
export async function GET(req: NextRequest) {
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  const { db, userId, token } = guard;

  if (guard.isDemo) {
    const { data, error } = await db
      .from("user_sessions")
      .select(SESSION_VIEW_SELECT)
      .eq("user_id", userId)
      .eq("session_token", token)
      .is("ended_at", null)
      .limit(1);
    if (error) return jsonNoStore({ ok: false, error: "Oturumlar okunamadı." }, 500);
    const sessions = (data ?? []).map((r) => toSessionView(r as Record<string, unknown>, token));
    return jsonNoStore({ ok: true, sessions });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [openRes, endedRes] = await Promise.all([
    db.from("user_sessions")
      .select(SESSION_VIEW_SELECT)
      .eq("user_id", userId)
      .is("ended_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(50),
    db.from("user_sessions")
      .select(SESSION_VIEW_SELECT)
      .eq("user_id", userId)
      .gte("ended_at", since)
      .order("ended_at", { ascending: false })
      .limit(10),
  ]);
  if (openRes.error || endedRes.error) return jsonNoStore({ ok: false, error: "Oturumlar okunamadı." }, 500);

  const open = (openRes.data ?? [])
    .map((r) => toSessionView(r as Record<string, unknown>, token))
    .filter((v) => v.state !== "ended");
  const ended = (endedRes.data ?? []).map((r) => toSessionView(r as Record<string, unknown>, token));
  return jsonNoStore({ ok: true, sessions: [...open, ...ended] });
}
