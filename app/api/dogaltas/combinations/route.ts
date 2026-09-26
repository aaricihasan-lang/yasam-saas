import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";

export const runtime = "nodejs";

/**
 * GET /api/dogaltas/combinations
 *
 * Kullanıcının kendi tenant'ındaki kombinasyonları okur (liste + detay sayfaları).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id SUNUCUDAN (oturumdan) alınır; client'tan GELMEZ → çapraz-tenant
 *     okuma imkânsızdır (publishable key ile doğrudan SELECT yerine).
 *   - SELECT yalnızca tenant_id = session tenant ile sınırlıdır.
 *
 * Query:
 *   - issue yoksa → tenant'ın TÜM kombinasyonları.
 *   - issue varsa → yalnızca o başlığın varyantları.
 *   - count=1 → satır İNMEDEN yalnız tenant'a ait TAM sayım döner
 *     ({ ok, count }). Dashboard "Toplam Kombinasyon" bunu kullanır → tüm
 *     satırları tarayıcıya indirip length saymaz; DB satır cap'inden etkilenmez.
 *
 * Sıralama: issue ASC, variant_index ASC (sayfa gruplaması bununla uyumlu).
 */

const COMBINATION_COLUMNS =
  "id,tenant_id,source_id,issue,description,variant_index,source,stones_text,notes_text,notes_text_2,notes_text_3,created_at,updated_at,origin_type";

const MAX_ISSUE = 500;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;

  const { db, tenantId } = guard;

  const rawIssue = req.nextUrl.searchParams.get("issue");
  const issue = rawIssue?.trim() ? rawIssue.trim().slice(0, MAX_ISSUE) : null;

  // Sayım modu: head:true → gövde inmeden PostgREST exact count.
  const countOnly = req.nextUrl.searchParams.get("count") != null;
  if (countOnly) {
    let cq = db
      .from("combinations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (issue) cq = cq.eq("issue", issue);
    const { count, error } = await cq;
    if (error) {
      return serverErrorResponse({
        route: "dogaltas/combinations",
        action: "GET:count",
        tenantId,
        cause: error,
      });
    }
    return NextResponse.json({ ok: true, count: count ?? 0 });
  }

  let query = db
    .from("combinations")
    .select(COMBINATION_COLUMNS)
    .eq("tenant_id", tenantId); // SUNUCUDAN — tenant dışı okuma engellenir

  if (issue) {
    query = query.eq("issue", issue);
  }

  const { data, error } = await query
    .order("issue", { ascending: true })
    .order("variant_index", { ascending: true });

  if (error) {
    return serverErrorResponse({
      route: "dogaltas/combinations",
      action: "GET",
      tenantId,
      cause: error,
    });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
