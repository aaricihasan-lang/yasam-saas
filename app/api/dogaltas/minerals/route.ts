import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";
import {
  MINERALS_LIST_SELECT,
  MINERALS_LIST_SEARCH_SELECT,
  MINERALS_LIST_PAGE_SIZE,
  MINERALS_UNCATEGORIZED_FILTER,
  buildMineralsListSearchOrFilter,
  mapMineralListRow,
} from "@/lib/dogaltas/mineralsListFetch";
import { serverErrorResponse } from "@/lib/http/apiError";

export const runtime = "nodejs";

/**
 * /api/dogaltas/minerals — Mineral tabloya güvenli server kapısı (Faz 1-A).
 * Mineraller HER ZAMAN tenant-only (.eq tenant_id) — library merge yok (mevcut davranış).
 * tenant_id daima oturumdan; client'tan alınmaz.
 */

const MINERAL_WRITABLE = [
  "source_id", "name", "aciklama", "kategori", "organ_etkileri", "fiziksel",
  "zihinsel", "cakralar", "fizyoloji", "eksiklik_belirtileri",
  "fazlalik_belirtileri", "doz_asimi", "iceren_taslar",
] as const;

function pick(body: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in body) out[k] = body[k];
  return out;
}

function slugify(s: string): string {
  return s.toLocaleLowerCase("tr-TR")
    .replace(/ş/g, "s").replace(/ı/g, "i").replace(/ç/g, "c").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── GET: list | count | all ─────────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") ?? "list";
  const q = sp.get("q")?.trim() ?? "";
  const category = sp.get("category")?.trim() ?? "";

  try {
    // all: kombinasyon-oluştur mineral öneri + tam tarama.
    // Mineral öneri DEMO hesapta library'yi de içerir (mevcut showcase davranışı);
    // normal uzman yalnız kendi tenant'ı.
    if (mode === "all") {
      const ids = is_demo_account && tenantId !== ADMIN_LIBRARY_TENANT_ID
        ? [tenantId, ADMIN_LIBRARY_TENANT_ID] : [tenantId];
      const { data, error } = await db
        .from("minerals").select(MINERALS_LIST_SEARCH_SELECT)
        .in("tenant_id", ids).order("created_at", { ascending: false, nullsFirst: false });
      if (error) return serverErrorResponse({ route: "dogaltas/minerals", action: "GET:all", tenantId, cause: error });
      return NextResponse.json({ ok: true, rows: data ?? [] });
    }

    // Arama artık SERVER-SIDE SQL ilike (.or) — F-05 çekirdek alanları
    // (name/aciklama/kategori/source_id), trgm-index destekli, bounded, tenant-scoped.
    // Eski JS full-scan KALDIRILDI (route'a/browser'a tüm korpus inmez; sessiz
    // truncation riski yok). Dizi/JSON detay alanları hızlı-yol arama kapsamı dışıdır.
    const orFilter = q ? buildMineralsListSearchOrFilter(q) : null;
    // q verildi ama sanitize sonrası boşsa (yalnız ,()%' vb.) → yanlış geniş eşleşme
    // yerine boş sonuç.
    if (q && !orFilter) {
      if (mode === "count") return NextResponse.json({ ok: true, count: 0 });
      return NextResponse.json({ ok: true, rows: [] });
    }

    const applyCategory = <T>(query: T): T => {
      const q2 = query as unknown as {
        or: (f: string) => T; eq: (c: string, v: string) => T;
      };
      if (category === MINERALS_UNCATEGORIZED_FILTER) return q2.or("kategori.is.null,kategori.eq.");
      if (category) return q2.eq("kategori", category);
      return query;
    };

    if (mode === "count") {
      let query = db.from("minerals").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      query = applyCategory(query);
      if (orFilter) query = query.or(orFilter);
      const { count, error } = await query;
      if (error) return serverErrorResponse({ route: "dogaltas/minerals", action: "GET:count", tenantId, cause: error });
      return NextResponse.json({ ok: true, count: count ?? 0 });
    }

    // Pagination — limit sunucuda clamp'lenir (client keyfine 10000 yapamaz).
    const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0);
    const rawLimit = Number.parseInt(sp.get("limit") ?? String(MINERALS_LIST_PAGE_SIZE), 10) || MINERALS_LIST_PAGE_SIZE;
    const limit = Math.min(Math.max(1, rawLimit), 100);
    let query = db.from("minerals").select(MINERALS_LIST_SELECT)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    query = applyCategory(query);
    if (orFilter) query = query.or(orFilter);
    const { data, error } = await query;
    if (error) return serverErrorResponse({ route: "dogaltas/minerals", action: "GET:list", tenantId, cause: error });
    return NextResponse.json({ ok: true, rows: (data ?? []).map((r) => mapMineralListRow(r as Record<string, unknown>)) });
  } catch (e) {
    return serverErrorResponse({ route: "dogaltas/minerals", action: "GET", tenantId, cause: e });
  }
}

// ─── POST: create ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  // O-5: Kanonik alan `name` (DB kolonu da `name`; UI bunu gönderir). Uyum için
  // `mineral_name` alias'ı da güvenle kabul edilir — `stones` tablosu `stone_name`
  // kullandığından yaygın karışıklık. `name` öncelikli; ikisi de yoksa net 400.
  const name = String(body.name ?? body.mineral_name ?? "").trim();
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "Mineral adı zorunludur ('name' veya 'mineral_name' alanı)." },
      { status: 400 },
    );
  }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const payload = pick(body, MINERAL_WRITABLE);
  payload.name = name;
  if (!payload.source_id || String(payload.source_id).trim() === "") payload.source_id = slugify(name);
  payload.tenant_id = tenantId; // SUNUCUDAN

  const { data, error } = await db.from("minerals").insert(payload).select("id").single();
  if (error) return serverErrorResponse({ route: "dogaltas/minerals", action: "POST", tenantId, cause: error });
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
