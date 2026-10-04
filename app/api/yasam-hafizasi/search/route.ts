import { NextRequest, NextResponse } from "next/server";
import { demoYhProfessionalCandidates } from "@/lib/demo/demoYasamHafizasi";
import { membershipInactiveResponse, verifyUserRequest } from "@/lib/auth/userGuard";
import { hasMembershipAccessForRow } from "@/lib/auth/membershipAccessCore";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getTenantFlags } from "@/lib/yasam-hafizasi/flags";
import { filterByYhScope, resolveYhModuleScope, yhSqlModuleFilter } from "@/lib/yasam-hafizasi/moduleScope";
import { YH_SOURCE_MODULES } from "@/lib/yasam-hafizasi/config";
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
  // P1-4 ÜYELİK kapısı (requireModuleAccess ile AYNI kural; admin muaf).
  if (!hasMembershipAccessForRow(guard.profile ?? {})) return membershipInactiveResponse();
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

  // DEMO VİTRİN: demo hesap gerçek retrieval'a (RPC/index) HİÇ gitmez; sentetik fixture aynı
  // eşleme + kapsam + faset + limit akışından geçer (yanıt sözleşmesi birebir aynı).
  if (is_demo_account) {
    if (q.length === 0) return empty(q, { emptyReason: "no-query" });
    const demoScope = resolveYhModuleScope(profile?.role, profile?.module_permissions);
    const demoAll = filterByYhScope(demoScope, demoYhProfessionalCandidates(q).map(toSearchResult));
    const demoShown = filterByModules(demoAll, modules).slice(0, limit);
    return json({
      ok: true, query: q, total: demoShown.length, facets: computeFacets(demoAll), results: demoShown,
      emptyReason: demoShown.length === 0 ? (modules && modules.length > 0 ? "filtered" : "no-results") : undefined,
    });
  }

  // Flag kapısı → güvenli boş sonuç.
  const flags = await getTenantFlags(tenantId, guard.db);
  if (isSearchDisabled(flags, is_demo_account)) {
    return empty(q, { disabled: true });
  }

  // Boş sorgu → arama yapma.
  if (q.length === 0) return empty(q, { emptyReason: "no-query" });

  const allowShared = resolveAllowShared(flags.yh_shared, requestedShared);
  const { descriptor } = buildRetrievalDescriptor({ rawQuery: q, sessionTenantId: tenantId, allowShared });
  if (descriptor.kind === "noop") return empty(q, { emptyReason: "no-results" });

  // ÜYE YÖNETİMİ FAZ 2: aktif kapsam = uzmanın GÜNCEL module_permissions'ı (tek kaynak). Kapsam +
  // istenen modüller SQL'de LIMIT'ten ÖNCE uygulanır (kapalı modül ilk N'i doldurup açık modül
  // sonucunu gizleyemez). Aşağıdaki uygulama-katmanı filtreleri savunma derinliği olarak kalır.
  const scope = resolveYhModuleScope(profile?.role, profile?.module_permissions);
  const sqlModules = yhSqlModuleFilter(scope, YH_SOURCE_MODULES, modules);
  const execResult = await createSupabaseRetrievalExecutor()(descriptor, { modules: sqlModules });
  if (execResult.kind === "error") return fail(q, "YH_SEARCH_FAILED", 500);
  if (execResult.kind === "noop") return empty(q, { emptyReason: "no-results" });

  // Candidate → güvenli DTO; faset sonuçtan; sunum modül filtresi + limit.
  const all = filterByYhScope(scope, execResult.candidates.map(toSearchResult));
  const facets = computeFacets(all);
  const displayed = filterByModules(all, modules).slice(0, limit);
  const emptyReason =
    displayed.length === 0 ? (modules && modules.length > 0 ? "filtered" : "no-results") : undefined;

  return json({ ok: true, query: q, total: displayed.length, facets, results: displayed, emptyReason });
}
