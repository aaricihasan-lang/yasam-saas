import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { isDemoTenantId } from "@/lib/auth/demoServerGuard";
import { isActiveLocale } from "@/lib/i18n/locales";
import { isLocaleSwitchingEnabled } from "@/lib/i18n/gate";
import { readLocalePreference, writeLocalePreference } from "@/lib/i18n/localePreferenceStore";

export const runtime = "nodejs";

/**
 * GET /api/me/locale — giriş yapmış uzmanın KENDİ kalıcı dil tercihi.
 *   { ok: true, preference: { status: "set", locale } | { status: "unset" } | { status: "unavailable", reason } }
 * PUT /api/me/locale — { locale } → hesap tercihini kaydeder.
 *
 * Güvenlik: user/tenant yalnız oturumdan (verifyUserRequest). Yalnız AKTİF locale kabul edilir.
 * Yayın kapısı kapalıyken yazma reddedilir (yetkisiz dil seçimi). Demo hesap ortak kullanıldığı için
 * tercih SAKLANMAZ (bir ziyaretçinin dili diğerine taşınmaz). Yanıtlar dil-bağımsız kod taşır; ekran
 * metni istemcide t() ile üretilir.
 */
const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const MAX_BODY = 256;

async function resolveOwner(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return { ok: false as const, response: guard.response };
  const { userId, tenantId, db } = guard;
  if (!userId || !tenantId) return { ok: false as const, response: json({ ok: false, code: "ACCOUNT_INCOMPLETE" }, 403) };
  const demo = guard.is_demo_account || (await isDemoTenantId(tenantId, db));
  return { ok: true as const, owner: { userId, tenantId }, db, demo };
}

export async function GET(req: NextRequest): Promise<Response> {
  const g = await resolveOwner(req);
  if (!g.ok) return g.response;
  if (!isLocaleSwitchingEnabled()) return json({ ok: true, preference: { status: "unavailable", reason: "disabled" } });
  if (g.demo) return json({ ok: true, preference: { status: "unavailable", reason: "demo" } });
  return json({ ok: true, preference: await readLocalePreference(g.db, g.owner) });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const g = await resolveOwner(req);
  if (!g.ok) return g.response;
  if (!isLocaleSwitchingEnabled()) return json({ ok: false, code: "LOCALE_SWITCHING_DISABLED" }, 403);

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json({ ok: false, code: "INVALID_BODY" }, 400);
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY) return json({ ok: false, code: "BODY_TOO_LARGE" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, code: "INVALID_BODY" }, 400);
  }
  const locale = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).locale : undefined;
  if (!isActiveLocale(locale)) return json({ ok: false, code: "INVALID_LOCALE" }, 400);

  if (g.demo) return json({ ok: true, persisted: false, reason: "demo" });
  const r = await writeLocalePreference(g.db, g.owner, locale);
  if (!r.ok) return json({ ok: true, persisted: false, reason: r.reason });
  return json({ ok: true, persisted: true, locale });
}
