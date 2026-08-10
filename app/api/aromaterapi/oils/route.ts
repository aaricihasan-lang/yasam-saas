import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { OIL_LIST_SELECT, pickWritableOilFields } from "@/lib/aromaterapi/oilFields";

export const runtime = "nodejs";

/**
 * /api/aromaterapi/oils — aromatherapy_oils güvenli server kapısı (K-2).
 * tenant_id DAİMA oturumdan (verifyUserRequest); istemciden ASLA kabul edilmez.
 * Okuma: YALNIZ kullanıcının kendi tenant kayıtları. Paylaşımlı/kanonik
 *   (tenant_id IS NULL) kütüphane satırları uzman UI'sında ARTIK gösterilmez —
 *   admin bir yağı vermek isterse P4 transfer ile bağımsız snapshot kopya üretir
 *   (origin_type='admin_transfer'), kopya uzmanın kendi tenant kaydı olur.
 * Yazma: yalnız kendi tenant kayıtları; kanonik (null) kayıtlara dokunulamaz.
 * Tarayıcı bu tabloya doğrudan erişmez (tablo RLS-kilitli, yalnız service_role).
 */

const PAGE = 1000;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const url = new URL(req.url);

  // 1) Hub sayaçları — tek çağrıda 4 head-count (1000 tavanından bağımsız gerçek toplam).
  if (url.searchParams.get("count") === "1") {
    const base = () =>
      db.from("aromatherapy_oils")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

    const [t, e, c, m] = await Promise.all([
      base(),
      base().eq("oil_type", "essential"),
      base().eq("oil_type", "carrier"),
      base().eq("oil_type", "maceration"),
    ]);

    const err = t.error || e.error || c.error || m.error;
    if (err) return NextResponse.json({ ok: false, error: err.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      counts: {
        total: t.count ?? 0,
        essential: e.count ?? 0,
        carrier: c.count ?? 0,
        maceration: m.count ?? 0,
      },
    });
  }

  // 2) İsim haritası (yağ detayında blend eşleştirmesi) — id,name.
  if (url.searchParams.get("names") === "1") {
    const { data, error } = await db
      .from("aromatherapy_oils")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, names: data ?? [] });
  }

  // 3) Liste — windowing ile TÜM sayfalar (kararlı name+id sıralaması).
  const type = url.searchParams.get("type")?.trim() || "";
  const all: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db
      .from("aromatherapy_oils")
      .select(OIL_LIST_SELECT)
      .eq("tenant_id", tenantId)
      .eq("is_active", true);
    if (type) q = q.eq("oil_type", type);

    const { data, error } = await q
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const page = (data ?? []) as unknown as Record<string, unknown>[];
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return NextResponse.json({ ok: true, rows: all });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const fields = pickWritableOilFields(body);
  if (!fields.name) return NextResponse.json({ ok: false, error: "Yağ adı zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("aromatherapy_oils")
    .insert({ ...fields, tenant_id: tenantId }) // tenant_id yalnız güvenlik katmanından
    .select("id")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const rawIds = (body as { ids?: unknown }).ids;
  const ids = Array.isArray(rawIds)
    ? rawIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  if (ids.length === 0)
    return NextResponse.json({ ok: false, error: "Silinecek kayıt seçilmedi." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deletedIds: [] });

  const { data, error } = await db
    .from("aromatherapy_oils")
    .delete()
    .eq("tenant_id", tenantId) // yalnız kendi tenant kayıtları; global (null) dokunulmaz
    .in("id", ids)
    .select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deletedIds: (data ?? []).map((r) => r.id as string) });
}
