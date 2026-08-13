import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { OIL_LIST_SELECT, pickWritableOilFields } from "@/lib/aromaterapi/oilFields";
import { legacyDbErrorResponse } from "@/lib/aromaterapi/legacyErrors";
import { parseListParams, buildSearchNormIlike } from "@/lib/aromaterapi/service/readValidation";
import { readFail, readServerError, readListOk } from "@/lib/aromaterapi/service/readErrors";

export const runtime = "nodejs";

/**
 * FAZ 2 liste sözleşmesi — modern C3C paginated okuma (parseListParams).
 * sort: yalnız `name` (asc, deterministik `id` tie-breaker route'ta eklenir).
 * filter: `type` → oil_type allowlist. Arama: search_norm (Türkçe-normalize).
 */
const OILS_LIST_SPEC = {
  sorts: { name: { column: "name", ascending: true } },
  filters: {
    // oil_type allowlist = UI OIL_TYPES ile BİREBİR (6 değer). Eksik değer geçerli bir
    // tipi 400 "Geçersiz filtre değeri"ne düşürür (FAZ 2 filter-contract regresyon fix).
    // 0 kayıtlı tip geçersiz DEĞİLDİR → normal boş sonuç döner.
    type: {
      column: "oil_type",
      allow: ["essential", "carrier", "maceration", "hydrosol", "resin", "absolute"],
    },
  },
} as const;

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

    // Tip facet sayaçları — UI OIL_TYPES ile BİREBİR (6 tip). Eksik tip sayacı facet
    // rozetini yanlışlıkla 0 gösterirdi (FAZ 2 filter-contract regresyon fix).
    const [t, e, c, m, h, r, a] = await Promise.all([
      base(),
      base().eq("oil_type", "essential"),
      base().eq("oil_type", "carrier"),
      base().eq("oil_type", "maceration"),
      base().eq("oil_type", "hydrosol"),
      base().eq("oil_type", "resin"),
      base().eq("oil_type", "absolute"),
    ]);

    const err = t.error || e.error || c.error || m.error || h.error || r.error || a.error;
    if (err) return legacyDbErrorResponse("oils.counts", err, "Sayaçlar yüklenemedi.");

    return NextResponse.json({
      ok: true,
      counts: {
        total: t.count ?? 0,
        essential: e.count ?? 0,
        carrier: c.count ?? 0,
        maceration: m.count ?? 0,
        hydrosol: h.count ?? 0,
        resin: r.count ?? 0,
        absolute: a.count ?? 0,
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
    if (error) return legacyDbErrorResponse("oils.names", error, "İsim listesi yüklenemedi.");
    return NextResponse.json({ ok: true, names: data ?? [] });
  }

  // 3) Liste — FAZ 2: server-side paginated + Türkçe-normalize arama + oil_type filtre.
  //    fetch-all KALDIRILDI (O(all-rows-to-client) yerine O(page_size)).
  const parsed = parseListParams(url.searchParams, OILS_LIST_SPEC);
  if (!parsed.ok) return readFail(parsed.code); // {ok:false, code} + uygun status
  const p = parsed.value;

  let q = db
    .from("aromatherapy_oils")
    .select(OIL_LIST_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId) // DAİMA oturumdan; istemci override edemez
    .eq("is_active", true);
  for (const [col, val] of Object.entries(p.equals)) q = q.eq(col, val); // yalnız oil_type (allowlist)
  if (p.q) q = q.or(buildSearchNormIlike(p.q)); // search_norm ILIKE (normalize + sanitize)

  const { data, error, count } = await q
    .order("name", { ascending: true })
    .order("id", { ascending: true }) // deterministik tie-breaker
    .range(p.offset, p.offset + p.limit - 1);

  if (error) return readServerError("oils.list", error); // ham hata yalnız server log
  return readListOk((data ?? []) as unknown[], p.page, p.limit, count ?? 0);
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
  if (error) return legacyDbErrorResponse("oils.create", error, "Yağ kaydedilemedi.");
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
  if (error) return legacyDbErrorResponse("oils.delete", error, "Yağ silinemedi.");
  return NextResponse.json({ ok: true, deletedIds: (data ?? []).map((r) => r.id as string) });
}
