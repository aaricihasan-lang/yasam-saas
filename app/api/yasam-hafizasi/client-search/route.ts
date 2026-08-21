import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getTenantFlags } from "@/lib/yasam-hafizasi/flags";
import {
  parseClientSearchRequest,
  withinDateWindow,
} from "@/lib/yasam-hafizasi/client/clientSearchRequest";
import {
  computeTenantFacets,
  distinctClientIds,
  filterTenantByModules,
  toTenantClientSearchResult,
  type TenantClientSearchResponse,
  type TenantClientSearchResult,
} from "@/lib/yasam-hafizasi/client/tenantClientSearchResult";
import {
  runTenantClientRetrieval,
  type TenantClientRpcDb,
} from "@/lib/yasam-hafizasi/client/tenantClientRetrieval";

export const runtime = "nodejs";

/**
 * POST /api/yasam-hafizasi/client-search — TENANT-WIDE PRIVATE CLIENT SEARCH (Politika Kilidi md.6).
 *
 * Per-client aramadan (/api/clients/[id]/yasam-hafizasi/search) farkı: client_id URL'de
 * DEĞİL → uzmanın TÜM danışan geçmişinde (kendi tenant'ı) arar. Professional aramadan
 * (/api/yasam-hafizasi/search) yapısal olarak AYRIDIR (ayrı PRIVATE client index + RPC).
 *
 * Güvenlik (md.4/md.5/md.7):
 *   - verifyUserRequest; tenant YALNIZ session'dan (body/header/query'den tenant KABUL EDİLMEZ).
 *   - yasam_hafizasi modül izni; yh_enabled+yh_hizli flag; demo → safe-empty.
 *   - shared/canonical İÇERİK karışmaz (allowShared=false + ayrı index; RPC demo hariç).
 *   - Danışan adı index'te YOK: client_id → clients (tenant-scoped) server-side resolve.
 *   - Şema/RPC henüz uygulanmadıysa (dormant) → güvenli "henüz etkin değil".
 */

function json(body: TenantClientSearchResponse, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}
function fail(query: string, code: string, status: number): NextResponse {
  return json({ ok: false, query, total: 0, facets: [], results: [], code }, status);
}
function empty(query: string, extra?: Partial<TenantClientSearchResponse>): NextResponse {
  return json({ ok: true, query, total: 0, facets: [], results: [], ...extra });
}

/** client_id → görünen ad (tenant-scoped; PII index'te değil, burada resolve). */
async function resolveClientNames(
  db: SupabaseClient,
  tenantId: string,
  clientIds: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (clientIds.length === 0) return map;
  const { data } = await db
    .from("clients")
    .select("id, ad, soyad")
    .eq("tenant_id", tenantId)
    .in("id", [...clientIds]);
  for (const row of (data ?? []) as { id: string; ad: string | null; soyad: string | null }[]) {
    const name = `${row.ad ?? ""} ${row.soyad ?? ""}`.trim();
    if (typeof row.id === "string") map.set(row.id, name);
  }
  return map;
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account, profile } = guard;

  if (!hasModulePermissionForProfile(profile, "yasam_hafizasi")) {
    return fail("", "YH_MODULE_FORBIDDEN", 403);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("", "YH_INVALID_BODY", 400);
  }
  const parsed = parseClientSearchRequest(rawBody);
  if (!parsed.ok) return fail("", parsed.code, 400);
  const { q, modules, dateFrom, dateTo, limit } = parsed.value;

  // Demo / flag kapısı → güvenli boş (arama yapılmaz).
  if (is_demo_account) return empty(q, { disabled: true, reason: "demo" });
  const flags = await getTenantFlags(tenantId, db);
  if (!flags.yh_enabled || !flags.yh_hizli) {
    return empty(q, { disabled: true, reason: "flag-disabled" });
  }

  if (q.length === 0) return empty(q, { emptyReason: "no-query" });

  const outcome = await runTenantClientRetrieval(db as unknown as TenantClientRpcDb, {
    rawQuery: q,
    sessionTenantId: tenantId,
    limit,
  });
  if (outcome.kind === "noop") return empty(q, { emptyReason: "no-results" });
  // Şema/RPC henüz production'a uygulanmadı → dormant güvenli disabled state.
  if (outcome.kind === "unavailable") return empty(q, { disabled: true, reason: "not-active" });
  if (outcome.kind === "error") return fail(q, "YH_SEARCH_FAILED", 500);

  // Ad resolve (md.7): yalnız sonuçta geçen client_id'ler, tenant-scoped.
  const nameById = await resolveClientNames(db, tenantId, distinctClientIds(outcome.rows));

  const all: TenantClientSearchResult[] = outcome.rows
    .map((r) => toTenantClientSearchResult(r, nameById))
    .filter((r): r is TenantClientSearchResult => r !== null);
  const dated = all.filter((r) => withinDateWindow(r.occurredAt, dateFrom, dateTo));
  const facets = computeTenantFacets(dated);
  const displayed = filterTenantByModules(dated, modules).slice(0, limit);
  const emptyReason =
    displayed.length === 0 ? (modules || dateFrom || dateTo ? "filtered" : "no-results") : undefined;

  return json({ ok: true, query: q, total: displayed.length, facets, results: displayed, emptyReason });
}
