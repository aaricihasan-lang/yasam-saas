import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { mapSaleRpcError } from "@/lib/urun-stok/salesErrors";
import { parseSalesHistoryParams, readSalesHistoryPage } from "@/lib/urun-stok/salesHistoryServer";
import { trackUsage } from "@/lib/usage/trackUsage";

import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
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
  if (is_demo_account) return demoReadOnlyResponse();

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
    // USAGE360: yalnız 500 (sunucu) ve 409 (yetersiz stok çakışması); 400/404 olay değil.
    if (mapped.status === 500 || mapped.status === 409) {
      await trackUsage(guard, req, {
        module: "stok",
        action: "action_failed",
        failedAction: "record_created",
        subEntity: "sale",
        errorClass: mapped.status === 409 ? "conflict" : "server",
      });
    }
    return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
  }

  const result = data as { sale_id?: string; duplicate?: boolean; sale?: unknown; items?: unknown };
  // İdempotent tekrar (duplicate) yeni satış değildir → olay yok.
  if (result?.sale_id && !result.duplicate) {
    await trackUsage(guard, req, { module: "stok", action: "record_created", subEntity: "sale", resourceId: result.sale_id, itemCount: cleanLines.length });
  }
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

  // Okuma çekirdeği lib/urun-stok/salesHistoryServer.ts (imleçli sayfalama, 1000-satır tavanı yok,
  // kalem sayısı tutarlılığı). inventory_type ALLOWLIST'ten; ham SQL identifier kullanıcı girdisinden oluşmaz.
  const params = parseSalesHistoryParams(req.nextUrl.searchParams);
  const page = await readSalesHistoryPage(db, tenantId, params);
  if (!page.ok) return NextResponse.json({ ok: false, error: page.error }, { status: page.status });
  return NextResponse.json({
    ok: true,
    sales: page.sales,
    items: page.items,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    itemCountMismatch: page.itemCountMismatch,
    limit: params.limit,
    offset: params.offset,
  });
}
