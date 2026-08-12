import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { legacyDbErrorResponse } from "@/lib/aromaterapi/legacyErrors";

export const runtime = "nodejs";

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

/**
 * /api/aromaterapi/blends/[id] — tekil blend güncelle (PATCH) / sil (DELETE) (FAZ B2).
 * tenant_id DAİMA oturumdan; .eq("id").eq("tenant_id") → başka tenant'ın kaydına
 * dokunulamaz (IDOR koruması). items sunucuda 8 alana sanitize edilir.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const { id: rawId } = await ctx.params;
  const id = (rawId ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

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
  // tenant_id / id / created_at istemciden ALINMAZ; updated_at trigger'la güncellenir.
  const fields = {
    name,
    notes: String(body.notes ?? ""),
    carrier_oil_id: typeof carrierId === "string" && carrierId ? carrierId : null,
    carrier_oil_name: String(body.carrier_oil_name ?? ""),
    bottle_ml: bottleMl,
    dilution_percent: dilutionPercent,
    drops_per_ml: Math.max(1, Math.floor(toNumber(body.drops_per_ml, 20))),
    total_drops: Math.max(0, Math.floor(toNumber(body.total_drops))),
    items,
  };

  const { data, error } = await db
    .from("aromatherapy_blends")
    .update(fields)
    .eq("id", id)
    .eq("tenant_id", tenantId) // oturumdan; başka tenant'ın kaydı güncellenemez
    .select("*");

  if (error) return legacyDbErrorResponse("blends.update", error, "Karışım güncellenemedi.");
  if (!data || data.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Karışım bulunamadı veya bu hesaba ait değil." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, blend: data[0] });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const { id: rawId } = await ctx.params;
  const id = (rawId ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("aromatherapy_blends")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId) // oturumdan; başka tenant'ın kaydına dokunamaz
    .select("id");

  if (error) return legacyDbErrorResponse("blends.delete", error, "Karışım silinemedi.");
  if (!data || data.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Karışım bulunamadı veya bu hesaba ait değil." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, id });
}
