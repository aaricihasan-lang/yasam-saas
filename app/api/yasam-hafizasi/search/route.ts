import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getTenantFlags } from "@/lib/yasam-hafizasi/flags";
import { buildRetrievalDescriptor } from "@/lib/yasam-hafizasi/search/queryPipeline";
import { createSupabaseRetrievalExecutor } from "@/lib/yasam-hafizasi/search/supabaseRetrievalAdapter";
import {
  isSearchDisabled,
  parseSearchRequest,
  resolveAllowShared,
} from "@/lib/yasam-hafizasi/ui/searchRequest";
import {
  computeFacets,
  filterByModules,
  toSearchResult,
  type YhSearchResponse,
} from "@/lib/yasam-hafizasi/ui/searchResult";

export const runtime = "nodejs";

/**
 * POST /api/yasam-hafizasi/search — Yaşam Hafızası kullanıcı arama kapısı (BF-13).
 *
 * Ürün: uzmanın FARKLI modüllerdeki MESLEKİ bilgi/içeriklerini tek noktadan arar
 * (danışan-scoped DEĞİL; index'te client_id yok). İkinci retrieval mantığı YAZILMAZ;
 * mevcut executor/RPC yeniden kullanılır.
 *
 * Güvenlik:
 *   - verifyUserRequest (x-user-id + x-session-token binding); inactive/pending → 403 (guard).
 *   - tenant YALNIZ doğrulanmış session'dan; body/query/header'dan tenant/client KABUL EDİLMEZ.
 *   - yasam_hafizasi modül izni server-side (admin bypass merkezî mantıkla).
 *   - yh_enabled + yh_hizli flag'i; demo → güvenli boş sonuç.
 *   - yh_shared kapalıysa shared istekleri ZORLA kapatılır (resolveAllowShared).
 *   - retrieval service_role yalnız server (executor içinde); tenant descriptor.visibility ile.
 */

function json(body: YhSearchResponse, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}
function fail(query: string, code: string, status: number): NextResponse {
  return json({ ok: false, query, total: 0, facets: [], results: [], code }, status);
}
function empty(query: string, extra?: Partial<YhSearchResponse>): NextResponse {
  return json({ ok: true, query, total: 0, facets: [], results: [], ...extra });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  const { tenantId, is_demo_account, profile } = guard;

  // Modül izni (server-side; admin merkezî bypass). İzin yoksa 403.
  if (!hasModulePermissionForProfile(profile, "yasam_hafizasi")) {
    return fail("", "YH_MODULE_FORBIDDEN", 403);
  }

  // Gövde ayrıştırma (tenant/client body'den ASLA okunmaz).
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("", "YH_INVALID_BODY", 400);
  }
  const parsed = parseSearchRequest(rawBody);
  if (!parsed.ok) return fail("", parsed.code, 400);
  const { q, modules, allowShared: requestedShared, limit } = parsed.value;

  // Flag + demo kapısı → güvenli boş sonuç.
  const flags = await getTenantFlags(tenantId, guard.db);
  if (isSearchDisabled(flags, is_demo_account)) {
    return empty(q, { disabled: true });
  }

  // Boş sorgu → arama yapma.
  if (q.length === 0) return empty(q, { emptyReason: "no-query" });

  const allowShared = resolveAllowShared(flags.yh_shared, requestedShared);
  const { descriptor } = buildRetrievalDescriptor({ rawQuery: q, sessionTenantId: tenantId, allowShared });
  if (descriptor.kind === "noop") return empty(q, { emptyReason: "no-results" });

  const execResult = await createSupabaseRetrievalExecutor()(descriptor);
  if (execResult.kind === "error") return fail(q, "YH_SEARCH_FAILED", 500);
  if (execResult.kind === "noop") return empty(q, { emptyReason: "no-results" });

  // Candidate → güvenli DTO; faset TÜM sonuçtan; sunum modül filtresi + limit.
  const all = execResult.candidates.map(toSearchResult);
  const facets = computeFacets(all);
  const displayed = filterByModules(all, modules).slice(0, limit);
  const emptyReason =
    displayed.length === 0 ? (modules && modules.length > 0 ? "filtered" : "no-results") : undefined;

  return json({ ok: true, query: q, total: displayed.length, facets, results: displayed, emptyReason });
}
