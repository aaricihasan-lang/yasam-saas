import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { legacyDbErrorResponse } from "@/lib/aromaterapi/legacyErrors";

export const runtime = "nodejs";

/**
 * /api/aromaterapi/blends — aromatherapy_blends güvenli server kapısı (FAZ B1).
 * GET (kullanıcının blend listesi), POST (yeni blend).
 * tenant_id DAİMA oturumdan (verifyUserRequest); istemciden ASLA kabul edilmez.
 * Tarayıcı bu tabloya doğrudan erişmez (tablo RLS-kilitli, yalnız service_role).
 */

// items[] snapshot yalnız bu 8 alanı taşır (istemci fazlasını enjekte edemez).
function sanitizeItems(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.map((it) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const oilId = o.oil_id;
    return {
      oil_id: typeof oilId === "string" && oilId ? oilId : null,
      oil_name: String(o.oil_name ?? ""),
      latin_name: String(o.latin_name ?? ""),
      oil_type: String(o.oil_type ?? ""),
      drops: Math.max(0, Math.floor(Number(o.drops) || 0)),
      is_photosensitive: o.is_photosensitive === true,
      contraindications: String(o.contraindications ?? ""),
      safety_notes: String(o.safety_notes ?? ""),
    };
  });
}

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const { data, error } = await db
    .from("aromatherapy_blends")
    .select("*")
    .eq("tenant_id", tenantId) // oturumdan; istemci override edemez
    .eq("is_active", true)
    .order("created_at", { ascending: false, nullsFirst: false });

  if (error) return legacyDbErrorResponse("blends.list", error, "Karışımlar yüklenemedi.");
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "Karışım adı zorunludur." }, { status: 400 });

  const bottleMl = toNumber(body.bottle_ml);
  const dilutionPercent = toNumber(body.dilution_percent);
  if (!(bottleMl > 0)) return NextResponse.json({ ok: false, error: "Şişe hacmi 0'dan büyük olmalıdır." }, { status: 400 });
  if (!(dilutionPercent > 0)) return NextResponse.json({ ok: false, error: "Seyreltme oranı 0'dan büyük olmalıdır." }, { status: 400 });

  const items = sanitizeItems(body.items);
  if (items.length === 0) return NextResponse.json({ ok: false, error: "En az bir uçucu yağ eklemelisiniz." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const carrierId = body.carrier_oil_id;
  const payload = {
    tenant_id: tenantId, // yalnız güvenlik katmanından
    name,
    notes: String(body.notes ?? ""),
    carrier_oil_id: typeof carrierId === "string" && carrierId ? carrierId : null,
    carrier_oil_name: String(body.carrier_oil_name ?? ""),
    bottle_ml: bottleMl,
    dilution_percent: dilutionPercent,
    drops_per_ml: Math.max(1, Math.floor(toNumber(body.drops_per_ml, 20))),
    total_drops: Math.max(0, Math.floor(toNumber(body.total_drops))),
    items,
    is_active: true,
  };

  const { data, error } = await db
    .from("aromatherapy_blends")
    .insert(payload)
    .select("*")
    .single();

  if (error) return legacyDbErrorResponse("blends.create", error, "Karışım kaydedilemedi.");
  return NextResponse.json({ ok: true, blend: data });
}
