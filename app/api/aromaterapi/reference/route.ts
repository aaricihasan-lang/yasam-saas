import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";

export const runtime = "nodejs";

/**
 * /api/aromaterapi/reference — Bilgi Bankası referans sayfaları + satırları (K-2).
 * Salt-okuma. tenant_id DAİMA oturumdan; YALNIZ oturum tenant'ının kendi kayıtları
 * döner. Paylaşımlı (tenant_id IS NULL) içerik DÖNMEZ (tenant izolasyonu; ARO-027).
 * Tarayıcı bu tablolara doğrudan erişmez (RLS-kilitli, yalnız service_role).
 */

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "aromatherapy");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const { data: sheets, error: sheetsErr } = await db
    .from("aromatherapy_reference_sheets")
    .select("id, sheet_name, display_title, headers, sort_order")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order");
  // ARO-02 / NAT-AROMA-F1: ham DB mesajı istemciye dönmez; ayrıntı yalnız sunucu logunda + ref.
  if (sheetsErr) return serverErrorResponse({ route: "aromaterapi/reference", action: "GET.sheets", tenantId, cause: sheetsErr });
  if (!sheets || sheets.length === 0) return NextResponse.json({ ok: true, sheets: [], rows: [] });

  const sheetIds = sheets.map((s) => s.id as string);
  const { data: rows, error: rowsErr } = await db
    .from("aromatherapy_reference_rows")
    .select("id, sheet_id, row_index, cells, is_header")
    .in("sheet_id", sheetIds)
    .order("row_index");
  if (rowsErr) return serverErrorResponse({ route: "aromaterapi/reference", action: "GET.rows", tenantId, cause: rowsErr });

  return NextResponse.json({ ok: true, sheets, rows: rows ?? [] });
}
