import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { pickWritableOilFields } from "@/lib/aromaterapi/oilFields";

export const runtime = "nodejs";

/**
 * /api/aromaterapi/oils/[id] — tekil yağ oku (GET) / güncelle (PATCH) / sil (DELETE) (K-2).
 * tenant_id DAİMA oturumdan. GET: kendi kaydı VEYA paylaşımlı (null) kayıt.
 * PATCH/DELETE: yalnız kendi tenant kaydı (.eq id + tenant) → IDOR koruması,
 * global (null) admin kayıtları salt-okunurdur.
 */

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const { id: rawId } = await ctx.params;
  const id = (rawId ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  const { data, error } = await db
    .from("aromatherapy_oils")
    .select("*")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı.", notFound: true }, { status: 404 });
  return NextResponse.json({ ok: true, oil: data });
}

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

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const fields = pickWritableOilFields(body);
  if (!fields.name) return NextResponse.json({ ok: false, error: "Yağ adı zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("aromatherapy_oils")
    .update(fields)
    .eq("tenant_id", tenantId) // oturumdan; başka tenant / global kayıt güncellenemez
    .eq("id", id)
    .select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0)
    return NextResponse.json(
      { ok: false, error: "Güncelleme başarısız — kayıt bulunamadı veya erişim izniniz yok." },
      { status: 403 },
    );
  return NextResponse.json({ ok: true, id });
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
    .from("aromatherapy_oils")
    .delete()
    .eq("tenant_id", tenantId) // oturumdan; başka tenant / global kayıt silinemez
    .eq("id", id)
    .select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0)
    return NextResponse.json(
      { ok: false, error: "Kayıt bulunamadı veya bu hesaba ait değil." },
      { status: 404 },
    );
  return NextResponse.json({ ok: true, id });
}
