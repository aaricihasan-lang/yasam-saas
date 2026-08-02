import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/aromaterapi/reference — Bilgi Bankası referans sayfaları + satırları (K-2).
 * Salt-okuma. tenant_id DAİMA oturumdan; kullanıcının kendi kayıtları +
 * paylaşımlı (tenant_id IS NULL) admin içeriği döner.
 * Tarayıcı bu tablolara doğrudan erişmez (RLS-kilitli, yalnız service_role).
 */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const { data: sheets, error: sheetsErr } = await db
    .from("aromatherapy_reference_sheets")
    .select("id, sheet_name, display_title, headers, sort_order")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("is_active", true)
    .order("sort_order");
  if (sheetsErr) return NextResponse.json({ ok: false, error: sheetsErr.message }, { status: 500 });
  if (!sheets || sheets.length === 0) return NextResponse.json({ ok: true, sheets: [], rows: [] });

  const sheetIds = sheets.map((s) => s.id as string);
  const { data: rows, error: rowsErr } = await db
    .from("aromatherapy_reference_rows")
    .select("id, sheet_id, row_index, cells, is_header")
    .in("sheet_id", sheetIds)
    .order("row_index");
  if (rowsErr) return NextResponse.json({ ok: false, error: rowsErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, sheets, rows: rows ?? [] });
}
