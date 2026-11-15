import { NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/http/apiError";
import { guardProfile, json, readJsonObject, type Account } from "@/lib/profile/http";
import { parseExpectedVersion, parseProfilePatch } from "@/lib/profile/schema";
import { getProfile, writeProfile, type ProfileState } from "@/lib/profile/service";

export const runtime = "nodejs";

/**
 * GET /api/settings/profile — uzmanın KENDİ profili + salt-okunur hesap bilgisi.
 *     { ok, profile, version, updatedAt, account: { fullName, email }, readOnly }
 *     Kayıt yoksa boş profil (markalama kapalı), version 0.
 * PUT /api/settings/profile — { expectedVersion, profile: { …alanların alt kümesi } }
 *     Gönderilmeyen alan DEĞİŞMEZ. Sürüm tutmazsa 409 (VERSION_CONFLICT) + güncel profil. Geçersiz alanlar 400 + alan bazlı
 *     `fields` haritası.
 *
 * Güvenlik: user/tenant yalnız oturumdan. Ad soyad / giriş e-postası / parola / rol / paket / kimlik alanları KABUL EDİLMEZ
 * (400) ve public.users'a hiçbir şey yazılmaz. Demo hesap / demo tenant yazamaz (403). Silme ucu yok.
 * Hata günlüğüne profil içeriği yazılmaz (yalnız hata kodu + sabit metin).
 */
const ROUTE = "api/settings/profile";

const UNAVAILABLE = { ok: false, code: "PROFILE_UNAVAILABLE", error: "Profil şu anda kullanılamıyor. Lütfen daha sonra yeniden deneyin." };

function view(state: ProfileState, account: Account, readOnly: boolean) {
  const { schemaVersion: _s, version, updatedAt, ...profile } = state; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ok: true, profile, version, updatedAt, account, readOnly };
}

export async function GET(req: NextRequest): Promise<Response> {
  const g = await guardProfile(req, "read");
  if (!g.ok) return g.response;
  const r = await getProfile(g.db, g.owner);
  if (r.ok) return json(view(r.state, g.account, g.readOnly));
  if (r.kind === "unavailable") return json(UNAVAILABLE, 503);
  return serverErrorResponse({ route: ROUTE, action: "get", tenantId: g.owner.tenantId, cause: r.cause });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const g = await guardProfile(req, "write");
  if (!g.ok) return g.response;
  const b = await readJsonObject(req);
  if (!b.ok) return b.response;
  const body = b.body;

  for (const k of Object.keys(body)) {
    if (k !== "expectedVersion" && k !== "profile") return json({ ok: false, error: "Bilinmeyen alan.", path: k }, 400);
  }
  const ev = parseExpectedVersion(body.expectedVersion);
  if (!ev.ok) return json({ ok: false, error: ev.error, path: ev.path }, 400);
  if (body.profile === undefined) return json({ ok: false, error: "Profil gerekli.", path: "profile" }, 400);
  const p = parseProfilePatch(body.profile);
  if (!p.ok) return json({ ok: false, error: p.error, path: p.path, ...(p.fields ? { fields: p.fields } : {}) }, 400);

  const r = await writeProfile(g.db, g.owner, ev.value, p.value);
  if (r.ok) return json(view(r.state, g.account, false));
  if (r.kind === "conflict") {
    return json({ ...view(r.current, g.account, false), ok: false, code: "VERSION_CONFLICT", error: "Profiliniz başka bir sekmede değişti. Güncel hâli yüklendi; değişikliğinizi yeniden deneyin." }, 409);
  }
  if (r.kind === "invalid") return json({ ok: false, error: "Bazı alanlar geçersiz.", path: "profile" }, 400);
  if (r.kind === "unavailable") return json(UNAVAILABLE, 503);
  return serverErrorResponse({ route: ROUTE, action: "put", tenantId: g.owner.tenantId, cause: r.cause });
}
