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
  computeClientFacets,
  filterClientByModules,
  toClientSearchResult,
  type ClientSearchResponse,
  type ClientSearchResult,
} from "@/lib/yasam-hafizasi/client/clientSearchResult";
import { runClientRetrieval, type ClientRpcDb } from "@/lib/yasam-hafizasi/client/clientRetrieval";

export const runtime = "nodejs";

/**
 * POST /api/clients/[id]/yasam-hafizasi/search — DANIŞAN-scoped Yaşam Hafızası araması (BF-14 P1).
 *
 * Global professional aramadan (/api/yasam-hafizasi/search) yapısal olarak AYRIDIR:
 * yalnız public.yasam_hafizasi_client_index'i client-scoped RPC ile sorgular.
 *
 * Güvenlik:
 *   - verifyUserRequest; tenant YALNIZ session'dan; client_id YALNIZ URL'den
 *     (body/header/query'den tenant/client KABUL EDİLMEZ).
 *   - clientBelongsToTenant → başka tenant/olmayan client 404 (enumeration fail-closed).
 *   - yasam_hafizasi modül izni; yh_enabled+yh_hizli flag; demo → safe-empty.
 *   - shared/canonical İÇERİK client yanıtına KARIŞMAZ (allowShared=false + ayrı index).
 *   - Şema/RPC henüz uygulanmadıysa (dormant) → güvenli "Danışan Hafızası henüz etkin değil".
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: ClientSearchResponse, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}
function fail(query: string, code: string, status: number): NextResponse {
  return json({ ok: false, query, total: 0, facets: [], results: [], code }, status);
}
function empty(query: string, extra?: Partial<ClientSearchResponse>): NextResponse {
  return json({ ok: true, query, total: 0, facets: [], results: [], ...extra });
}

async function clientBelongsToTenant(db: SupabaseClient, clientId: string, tenantId: string): Promise<boolean> {
  const { data } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return Boolean(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account, profile } = guard;

  if (!hasModulePermissionForProfile(profile, "yasam_hafizasi")) {
    return fail("", "YH_MODULE_FORBIDDEN", 403);
  }

  const { id: clientId } = await params;
  if (!UUID_RE.test(clientId)) return fail("", "YH_INVALID_CLIENT", 400);
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return fail("", "YH_CLIENT_NOT_FOUND", 404);
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

  const outcome = await runClientRetrieval(db as unknown as ClientRpcDb, {
    rawQuery: q,
    sessionTenantId: tenantId,
    clientId,
    limit,
  });
  if (outcome.kind === "noop") return empty(q, { emptyReason: "no-results" });
  // Şema/RPC henüz production'a uygulanmadı → dormant güvenli disabled state.
  if (outcome.kind === "unavailable") return empty(q, { disabled: true, reason: "not-active" });
  if (outcome.kind === "error") return fail(q, "YH_SEARCH_FAILED", 500);

  const all: ClientSearchResult[] = outcome.rows
    .map(toClientSearchResult)
    .filter((r): r is ClientSearchResult => r !== null);
  const dated = all.filter((r) => withinDateWindow(r.occurredAt, dateFrom, dateTo));
  const facets = computeClientFacets(dated);
  const displayed = filterClientByModules(dated, modules).slice(0, limit);
  const emptyReason =
    displayed.length === 0 ? (modules || dateFrom || dateTo ? "filtered" : "no-results") : undefined;

  return json({ ok: true, query: q, total: displayed.length, facets, results: displayed, emptyReason });
}
