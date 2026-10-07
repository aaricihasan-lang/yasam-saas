import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { isUuid } from "@/lib/danisan/clientCreate";
import {
  createHdProfileForJourneyClient,
  createJourneyClientWithHdProfile,
  linkHdProfileToJourneyClient,
  linkHdProfileToNewJourneyClient,
  getJourneyHdSummary,
  syncHdBirthDateFromJourney,
  unlinkHdProfile,
  type JourneyFail,
} from "@/lib/human-design/api/journeyLink";

export const runtime = "nodejs";

/**
 * GET  /api/hd/clients/journey?journey_client_id= — Danışan Yolculuğu "Human Design" sekmesi özeti
 *      (salt okuma; human_design izni; merkezî danışan bu tenant'ta değilse 404). Yalnız özet: analiz
 *      tarihi, hesap anı doğum bilgisi, tip/profil kodu, tür — computed_result / provider_raw /
 *      koordinat DÖNMEZ; harita HD'nin kendi profesyonel görünümünde açılır.
 *
 * POST /api/hd/clients/journey — HD profili ↔ merkezî Danışan Yolculuğu danışanı eylemleri.
 *
 * Gövde: { action, ... }
 *   create_new        { ad, soyad, dogum, birth_time, birth_location_ref, request_id? }
 *                     → merkezî danışan + bağlı HD profili (aynı doğrulama/idempotency DY ile)
 *   create_for_existing { journey_client_id, birth_time, birth_location_ref, birth_date? }
 *   link_existing     { hd_client_id, journey_client_id }      (uzman onayı; otomatik değil)
 *   link_new          { hd_client_id, ad, soyad, request_id? } (eski profil için yeni merkezî danışan)
 *   unlink            { hd_client_id }                          (HD verisi SİLİNMEZ)
 *   sync_birth_date   { hd_client_id }                          (merkezî → HD, tek yön)
 *
 * Güvenlik: requireModuleAccess("human_design") (DY izni gerekmez — ürün kararı 3); tenant + user
 * SUNUCUDAN; demo hesap yazamaz; başka tenant'ın kaydı 404 (varlık sızdırılmaz); çakışma 409;
 * ham DB hatası dönmez. Roxy ÇAĞRILMAZ.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function failRes(f: JourneyFail): Response {
  return NextResponse.json(
    { ok: false, code: f.code, error: f.error, ...(f.hdClientId ? { hd_client_id: f.hdClientId } : {}) },
    { status: f.status, headers: NO_STORE },
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  const id = (new URL(req.url).searchParams.get("journey_client_id") ?? "").trim();
  if (!isUuid(id)) return NextResponse.json({ ok: false, code: "INVALID_ID", error: "Geçersiz danışan." }, { status: 400, headers: NO_STORE });
  const { db, tenantId } = guard;
  const { data: cli, error: cliErr } = await db.from("clients").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (cliErr) return NextResponse.json({ ok: false, code: "DB_ERROR", error: "Danışan doğrulanamadı." }, { status: 500, headers: NO_STORE });
  if (!cli) return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "Danışan bulunamadı." }, { status: 404, headers: NO_STORE });
  const r = await getJourneyHdSummary(db, tenantId, id);
  if (r.error) return NextResponse.json({ ok: false, code: "DB_ERROR", error: "Human Design kayıtları yüklenemedi." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, profile: r.profile, analyses: r.analyses }, { status: 200, headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında danışan işlemleri yapılamaz." },
      { status: 403, headers: NO_STORE },
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." }, { status: 400, headers: NO_STORE });
  }
  if (!isObj(raw)) {
    return NextResponse.json({ ok: false, code: "MALFORMED_JSON", error: "İstek gövdesi nesne olmalı." }, { status: 400, headers: NO_STORE });
  }
  const { db, tenantId, userId } = guard;
  const action = str(raw.action);

  switch (action) {
    case "create_new": {
      const r = await createJourneyClientWithHdProfile(db, tenantId, userId, raw);
      if (!r.ok) return failRes(r);
      if (r.created) await trackUsage(guard, req, { module: "human_design", action: "record_created", subEntity: "client", resourceId: r.hdClientId });
      return NextResponse.json({ ok: true, hd_client_id: r.hdClientId, journey_client_id: r.journeyClientId }, { status: 200, headers: NO_STORE });
    }
    case "create_for_existing": {
      const r = await createHdProfileForJourneyClient(db, tenantId, userId, raw);
      if (!r.ok) return failRes(r);
      await trackUsage(guard, req, { module: "human_design", action: "record_created", subEntity: "client", resourceId: r.hdClientId });
      return NextResponse.json({ ok: true, hd_client_id: r.hdClientId, journey_client_id: r.journeyClientId }, { status: 200, headers: NO_STORE });
    }
    case "link_existing": {
      const r = await linkHdProfileToJourneyClient(db, tenantId, str(raw.hd_client_id), str(raw.journey_client_id));
      if (!r.ok) return failRes(r);
      await trackUsage(guard, req, { module: "human_design", action: "record_updated", subEntity: "client", resourceId: r.hdClientId });
      return NextResponse.json({ ok: true, hd_client_id: r.hdClientId, journey_client_id: r.journeyClientId }, { status: 200, headers: NO_STORE });
    }
    case "link_new": {
      const r = await linkHdProfileToNewJourneyClient(db, tenantId, str(raw.hd_client_id), raw);
      if (!r.ok) return failRes(r);
      await trackUsage(guard, req, { module: "human_design", action: "record_updated", subEntity: "client", resourceId: r.hdClientId });
      return NextResponse.json({ ok: true, hd_client_id: r.hdClientId, journey_client_id: r.journeyClientId }, { status: 200, headers: NO_STORE });
    }
    case "unlink": {
      const r = await unlinkHdProfile(db, tenantId, str(raw.hd_client_id));
      if (!r.ok) return failRes(r);
      return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
    }
    case "sync_birth_date": {
      const r = await syncHdBirthDateFromJourney(db, tenantId, str(raw.hd_client_id));
      if (!r.ok) return failRes(r);
      return NextResponse.json({ ok: true, birth_date: r.birthDate }, { status: 200, headers: NO_STORE });
    }
    default:
      return NextResponse.json({ ok: false, code: "UNKNOWN_ACTION", error: "Geçersiz işlem." }, { status: 400, headers: NO_STORE });
  }
}
