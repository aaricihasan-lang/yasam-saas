import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * GET /api/settings/location — kullanıcının varsayılan konumu (yoksa null)
 * PUT /api/settings/location — varsayılan konumu upsert et
 * Header: x-user-id + x-session-token
 *
 * Güvenlik: verifyUserRequest ilk adım; user_id/tenant_id YALNIZ guard'dan gelir
 * (istemci body'sinden ASLA). Demo hesap PUT'ta DB'ye yazamaz. RLS bypass yalnız
 * service-role db (getServerDb) üzerinden; tablo anon/authenticated'e kapalı.
 */

const PREF_COLUMNS = "location_id, name, country_code, lat, lon, elev, tz, source, updated_at";

export async function GET(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { userId, db } = guard;

  const { data, error } = await db
    .from("user_location_prefs")
    .select(PREF_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ location: data ?? null });
}

export async function PUT(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { userId, tenantId, is_demo_account, db } = guard;

  // Demo hesap: kalıcı yazma yok.
  if (is_demo_account) {
    return NextResponse.json(
      { error: "Demo hesapta varsayılan konum kaydedilemez." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    location_id?: unknown; name?: unknown; country_code?: unknown;
    lat?: unknown; lon?: unknown; elev?: unknown; tz?: unknown; source?: unknown;
  };

  // ── Validasyon (user_id/tenant_id body'den OKUNMAZ) ──
  const location_id  = String(body.location_id ?? "").trim();
  const name         = String(body.name ?? "").trim();
  const country_code = String(body.country_code ?? "").trim().toUpperCase();
  const tz           = String(body.tz ?? "").trim();
  const lat          = Number(body.lat);
  const lon          = Number(body.lon);
  const elev         = body.elev == null || body.elev === "" ? 0 : Number(body.elev);
  const source       = body.source == null ? null : (String(body.source).trim() || null);

  if (!location_id)                 return NextResponse.json({ error: "Konum kimliği gerekli." }, { status: 400 });
  if (!name)                        return NextResponse.json({ error: "Şehir adı gerekli." }, { status: 400 });
  if (country_code.length !== 2)    return NextResponse.json({ error: "Ülke kodu 2 harf olmalı." }, { status: 400 });
  if (!tz)                          return NextResponse.json({ error: "Saat dilimi gerekli." }, { status: 400 });
  if (!Number.isFinite(lat) || lat < -90 || lat > 90)     return NextResponse.json({ error: "Enlem -90 ile 90 arasında olmalı." }, { status: 400 });
  if (!Number.isFinite(lon) || lon < -180 || lon > 180)   return NextResponse.json({ error: "Boylam -180 ile 180 arasında olmalı." }, { status: 400 });
  if (!Number.isFinite(elev))       return NextResponse.json({ error: "Rakım sayısal olmalı." }, { status: 400 });

  const { data, error } = await db
    .from("user_location_prefs")
    .upsert(
      { user_id: userId, tenant_id: tenantId, location_id, name, country_code, lat, lon, elev, tz, source },
      { onConflict: "user_id" },
    )
    .select(PREF_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, location: data });
}
