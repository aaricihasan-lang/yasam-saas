/**
 * OTURUM MODELİ v2 — sunucu tarafı ortak yardımcılar (yalnız API route'ları).
 *
 *   - verifySelfSessionRequest: "kendi oturumlarım" uçları için token ↔ x-user-id bağı +
 *     users.active (admin ve uzman). Yetki modeli verifyUserRequest ile aynı ilkeye dayanır:
 *     token sahibi = iddia edilen kullanıcı; çıplak user id'ye ASLA güvenilmez.
 *   - toSessionView: user_sessions satırını UI'a güvenli görünüme çevirir. Token, ham UA,
 *     ham IP ASLA dönmez (IP maskeli; cihaz yalnız aile etiketi).
 */
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerDb } from "@/lib/supabase-server";
import { pickSessionCredential, resolveSessionUserId } from "@/lib/auth/sessionTransport";
import { parseUsageUserAgent } from "@/lib/usage/clientContext";
import { maskIp } from "@/lib/security/maskIp";

export const SESSION_VIEW_SELECT =
  "id, session_token, user_agent, platform, client_channel, ip_address, city, country, is_active, session_state, created_at, last_seen_at, ended_at, end_reason, pending_expires_at, approved_at" as const;

const OS_LABELS: Record<string, string> = {
  android: "Android", ios: "iOS", windows: "Windows", macos: "macOS", linux: "Linux", chromeos: "ChromeOS",
};
const BROWSER_LABELS: Record<string, string> = {
  chrome: "Chrome", safari: "Safari", firefox: "Firefox", edge: "Edge", samsung: "Samsung Internet",
  opera: "Opera", webview: "Uygulama içi tarayıcı",
};

/** Ham UA'dan yalnız aile düzeyinde etiket (ör. "Chrome · Windows"). Parmak izi üretmez. */
export function describeDevice(userAgent: unknown, clientChannel: unknown): string {
  if (clientChannel === "android_app") return "Yaşam Sistemi Android uygulaması";
  const parsed = parseUsageUserAgent(typeof userAgent === "string" ? userAgent : "", null);
  const browser = BROWSER_LABELS[parsed.browserFamily] ?? "Tarayıcı";
  const os = OS_LABELS[parsed.osFamily];
  return os ? `${browser} · ${os}` : browser;
}

export type SessionView = {
  id: string;
  kind: "web" | "android_app";
  device: string;
  platform: string | null;
  state: "active" | "pending" | "ended";
  endReason: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  endedAt: string | null;
  pendingExpiresAt: string | null;
  ipMasked: string | null;
  city: string | null;
  country: string | null;
  persistent: boolean;
  current: boolean;
};

/** user_sessions satırı → güvenli görünüm. `currentToken` yalnız "bu cihaz" işareti için. */
export function toSessionView(row: Record<string, unknown>, currentToken?: string | null): SessionView {
  const channel = row.client_channel === "android_app" ? "android_app" : "web";
  const pending =
    row.session_state === "pending_approval" && row.ended_at == null && row.is_active !== true;
  const state: SessionView["state"] = row.is_active === true ? "active" : pending ? "pending" : "ended";
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    id: String(row.id),
    kind: channel,
    device: describeDevice(row.user_agent, row.client_channel),
    platform: str(row.platform),
    state,
    endReason: state === "ended" ? str(row.end_reason) : null,
    createdAt: str(row.created_at),
    lastSeenAt: str(row.last_seen_at),
    endedAt: str(row.ended_at),
    pendingExpiresAt: state === "pending" ? str(row.pending_expires_at) : null,
    ipMasked: maskIp(row.ip_address),
    city: str(row.city),
    country: str(row.country),
    persistent: channel === "android_app",
    current: !!currentToken && row.session_token === currentToken,
  };
}

export type SelfSessionGuard =
  | { ok: true; db: SupabaseClient; userId: string; token: string; role: "admin" | "expert" }
  | { ok: false; response: NextResponse };

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** "Kendi oturumlarım" uçları: token ↔ x-user-id (veya x-admin-id) bağı + aktif kullanıcı. */
export async function verifySelfSessionRequest(req: NextRequest): Promise<SelfSessionGuard> {
  const claimed = (req.headers.get("x-user-id") ?? req.headers.get("x-admin-id") ?? "").trim();
  // HTTPONLY H1–H4: token kaynağı merkezi çözücüde (off → yalnız x-session-token).
  const credential = pickSessionCredential(req);
  if (!claimed || credential.kind === "none") {
    return { ok: false, response: NextResponse.json({ error: "Oturum doğrulaması gerekli." }, { status: 401, headers: NO_STORE }) };
  }
  if (credential.kind === "csrf_denied") {
    return { ok: false, response: NextResponse.json({ error: "İstek kaynağı doğrulanamadı." }, { status: 403, headers: NO_STORE }) };
  }
  let db: SupabaseClient;
  try {
    db = getServerDb();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Sunucu yapılandırma hatası." }, { status: 500, headers: NO_STORE }) };
  }
  const [session, userRes] = await Promise.all([
    resolveSessionUserId(db, credential),
    db.from("users").select("id, role, active").eq("id", claimed).maybeSingle(),
  ]);
  if (session.status === "conflict") {
    return { ok: false, response: NextResponse.json({ error: "Oturum kimliği uyuşmuyor." }, { status: 401, headers: NO_STORE }) };
  }
  const tokenUserId = session.status === "ok" ? session.userId : null;
  const token = session.status === "ok" ? session.token : "";
  if (!tokenUserId) {
    return { ok: false, response: NextResponse.json({ error: "Oturum geçersiz veya süresi dolmuş." }, { status: 401, headers: NO_STORE }) };
  }
  if (tokenUserId !== claimed) {
    return { ok: false, response: NextResponse.json({ error: "Oturum kimliği uyuşmuyor." }, { status: 403, headers: NO_STORE }) };
  }
  const u = userRes.data as { role?: unknown; active?: unknown } | null;
  const role = String(u?.role ?? "").trim().toLowerCase();
  if (!u || u.active !== true || (role !== "admin" && role !== "expert")) {
    return { ok: false, response: NextResponse.json({ error: "Yetki yok." }, { status: 403, headers: NO_STORE }) };
  }
  return { ok: true, db, userId: claimed, token, role: role as "admin" | "expert" };
}

export function jsonNoStore(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}
