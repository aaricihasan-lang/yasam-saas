import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { mapSaleRpcError } from "@/lib/urun-stok/salesErrors";

export const runtime = "nodejs";

/**
 * /api/urun-stok/sales — Ürün & Stok CANONICAL satış kapısı (USM-001/003/004/005).
 *
 * POST  — atomik satış: inventory_sale_create_atomic RPC (tek transaction, satır
 *         kilidi, stok yeterlilik, snapshot, idempotency). tenant_id + created_by
 *         DAİMA oturumdan; istemciden ALINMAZ (mass-assignment koruması).
 * GET   — tenant-scoped, sayfalı satış geçmişi (DB-canonical). limit/offset.
 *
 * Auth: requireModuleAccess(req, "stok") — token-bound, tenant session'dan.
 */

const ALLOWED_TYPES = new Set(["dogaltas", "oil", "soap_cream", "accessory", "other"]);
const MAX_LINES = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IncomingLine = {
  inventory_type?: unknown;
  inventory_id?: unknown;
  quantity?: unknown;
  markup_pct?: unknown;
  unit_sale_price?: unknown;
};

type CleanLine = {
  inventory_type: string;
  inventory_id: string;
  quantity: number;
  markup_pct?: number;
  unit_sale_price?: number;
};

function finitePos(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : null;
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stok");
  if (!guard.ok) return guard.response;
  const { db, tenantId, userId, is_demo_account } = guard;

  let body: {
    idempotency_key?: unknown;
    source?: unknown;
    note?: unknown;
    lines?: unknown;
  };
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const idempotencyKey = String(body.idempotency_key ?? "").trim();
  if (!idempotencyKey || idempotencyKey.length > 200)
    return NextResponse.json({ ok: false, error: "Geçersiz işlem anahtarı." }, { status: 400 });

  if (!Array.isArray(body.lines) || body.lines.length < 1)
    return NextResponse.json({ ok: false, error: "Satış satırı gerekli." }, { status: 400 });
  if (body.lines.length > MAX_LINES)
    return NextResponse.json({ ok: false, error: "Çok fazla satış satırı." }, { status: 400 });

  const cleanLines: CleanLine[] = [];
  for (const raw of body.lines as IncomingLine[]) {
    const type = String(raw?.inventory_type ?? "").trim().toLowerCase();
    if (!ALLOWED_TYPES.has(type))
      return NextResponse.json({ ok: false, error: "Geçersiz ürün kategorisi." }, { status: 400 });

    const invId = String(raw?.inventory_id ?? "").trim();
    if (!UUID_RE.test(invId))
      return NextResponse.json({ ok: false, error: "Geçersiz ürün kimliği." }, { status: 400 });

    const qty = finitePos(raw?.quantity);
    if (qty === null || qty <= 0)
      return NextResponse.json({ ok: false, error: "Satılacak miktar geçersiz." }, { status: 400 });

    const line: CleanLine = { inventory_type: type, inventory_id: invId, quantity: qty };

    if (raw?.markup_pct != null && raw.markup_pct !== "") {
      const m = finitePos(raw.markup_pct);
      if (m === null || m < 0)
        return NextResponse.json({ ok: false, error: "Kâr oranı geçersiz." }, { status: 400 });
      line.markup_pct = m;
    }
    if (raw?.unit_sale_price != null && raw.unit_sale_price !== "") {
      const p = finitePos(raw.unit_sale_price);
      if (p === null || p < 0)
        return NextResponse.json({ ok: false, error: "Satış fiyatı geçersiz." }, { status: 400 });
      line.unit_sale_price = p;
    }
    cleanLines.push(line);
  }

  // Demo hesap: kalıcı yazma yok (server no-op). İstemci yalnız yerel önizleme yapar.
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const source = String(body.source ?? "central").trim().slice(0, 40) || "central";
  const note = String(body.note ?? "").slice(0, 500);

  const { data, error } = await db.rpc("inventory_sale_create_atomic", {
    p_tenant_id: tenantId,
    p_created_by: userId,
    p_idempotency_key: idempotencyKey,
    p_source: source,
    p_note: note,
    p_lines: cleanLines,
  });

  if (error) {
    const mapped = mapSaleRpcError(error);
    if (mapped.status === 500) {
      // Beklenmeyen: sunucu logu bırak (token/secret İÇERMEZ), UI'ya ham metin verme.
      console.error("[urun-stok/sales] RPC hata", {
        code: (error as { code?: string }).code, source, lines: cleanLines.length,
      });
    }
    return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
  }

  const result = data as { sale_id?: string; duplicate?: boolean; sale?: unknown; items?: unknown };
  return NextResponse.json({
    ok: true,
    sale_id: result?.sale_id,
    duplicate: Boolean(result?.duplicate),
    sale: result?.sale ?? null,
    items: result?.items ?? [],
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stok");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);
  const statusFilter = sp.get("status");
  const invTypeRaw = sp.get("inventory_type");

  const SALE_COLS = "id, source, status, note, sold_at, total_cost, total_sale, total_profit, item_count, cancelled_at";
  const ITEM_COLS = "id, sale_id, inventory_type, inventory_id, product_name_snapshot, product_subtitle_snapshot, unit, quantity, unit_cost_snapshot, unit_sale_price_snapshot, markup_pct, currency_snapshot, line_cost_total, line_sale_total, line_profit";

  // ── Kategori-filtreli mod (USM: kategori "Satış Geçmişi" sekmesi aynı canonical
  //    inventory_sales/items verisinden beslenir). inventory_type ALLOWLIST'ten;
  //    ham SQL identifier ASLA kullanıcı girdisinden oluşturulmaz.
  if (invTypeRaw !== null) {
    if (!ALLOWED_TYPES.has(invTypeRaw)) {
      return NextResponse.json({ ok: false, error: "Geçersiz ürün kategorisi." }, { status: 400 });
    }
    const iq = db
      .from("inventory_sale_items")
      .select(ITEM_COLS)
      .eq("tenant_id", tenantId)
      .eq("inventory_type", invTypeRaw)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit); // limit+1 → hasMore

    const { data: itemRowsRaw, error: itemErr } = await iq;
    if (itemErr) {
      console.error("[urun-stok/sales] kategori satır hata", { code: (itemErr as { code?: string }).code });
      return NextResponse.json({ ok: false, error: "Satış geçmişi okunamadı." }, { status: 500 });
    }
    const allItems = (itemRowsRaw ?? []) as Array<{ sale_id: string }>;
    const hasMore = allItems.length > limit;
    const pageItems = hasMore ? allItems.slice(0, limit) : allItems;

    let sales: unknown[] = [];
    if (pageItems.length > 0) {
      const saleIds = [...new Set(pageItems.map((i) => i.sale_id))];
      let sq = db.from("inventory_sales").select(SALE_COLS).eq("tenant_id", tenantId).in("id", saleIds);
      if (statusFilter === "completed" || statusFilter === "cancelled") sq = sq.eq("status", statusFilter);
      const { data: saleRows, error: saleErr } = await sq;
      if (saleErr) {
        console.error("[urun-stok/sales] kategori satış hata", { code: (saleErr as { code?: string }).code });
        return NextResponse.json({ ok: false, error: "Satış geçmişi okunamadı." }, { status: 500 });
      }
      sales = saleRows ?? [];
    }
    return NextResponse.json({ ok: true, sales, items: pageItems, hasMore, limit, offset });
  }

  // ── Genel (satış-bazlı) mod
  let q = db
    .from("inventory_sales")
    .select(SALE_COLS)
    .eq("tenant_id", tenantId)
    .order("sold_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit); // limit+1 satır → hasMore tespiti

  if (statusFilter === "completed" || statusFilter === "cancelled") {
    q = q.eq("status", statusFilter);
  }

  const { data: salesRows, error } = await q;
  if (error) {
    console.error("[urun-stok/sales] liste hata", { code: (error as { code?: string }).code });
    return NextResponse.json({ ok: false, error: "Satış geçmişi okunamadı." }, { status: 500 });
  }

  const rows = (salesRows ?? []) as Array<{ id: string }>;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  let items: unknown[] = [];
  if (pageRows.length > 0) {
    const ids = pageRows.map((r) => r.id);
    const { data: itemRows, error: itemErr } = await db
      .from("inventory_sale_items")
      .select(ITEM_COLS)
      .in("sale_id", ids);
    if (itemErr) {
      console.error("[urun-stok/sales] satır hata", { code: (itemErr as { code?: string }).code });
      return NextResponse.json({ ok: false, error: "Satış geçmişi okunamadı." }, { status: 500 });
    }
    items = itemRows ?? [];
  }

  return NextResponse.json({ ok: true, sales: pageRows, items, hasMore, limit, offset });
}
