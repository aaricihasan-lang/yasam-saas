/**
 * BF-13 — Yaşam Hafızası kullanıcı arama tek kapsamlı harness (PASS/BLOCKED).
 * Yalnız SAF birimler + fixture; production/DB bağlantısı YOK. Çalıştırma:
 *   npm run yh:bf13:harness
 */
import { buildRetrievalDescriptor } from "@/lib/yasam-hafizasi/search/queryPipeline";
import {
  isSearchDisabled,
  parseSearchRequest,
  resolveAllowShared,
} from "@/lib/yasam-hafizasi/ui/searchRequest";
import {
  computeFacets,
  filterByModules,
  toSearchResult,
} from "@/lib/yasam-hafizasi/ui/searchResult";
import { moduleLabel, sourceLinkFor, isYhSourceModule } from "@/lib/yasam-hafizasi/ui/moduleLabels";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import type { YhFlags } from "@/lib/yasam-hafizasi/config";
import type { Candidate } from "@/lib/yasam-hafizasi/search/types";

const TENANT = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";
const checks: { name: string; ok: boolean; detail: string }[] = [];
function add(name: string, ok: boolean, detail = ""): void {
  checks.push({ name, ok, detail });
}

function flags(over: Partial<YhFlags>): YhFlags {
  return {
    yh_enabled: false,
    yh_hizli: false,
    yh_derin: false,
    yh_semantic: false,
    yh_client_pii: false,
    yh_shared: false,
    ...over,
  };
}

function candidate(over: Partial<Candidate>): Candidate {
  return {
    id: "c1",
    tenantId: TENANT,
    sourceModule: "dogaltas",
    sourceTable: "stones",
    sourceId: "s1",
    unitType: "record",
    sectionRef: null,
    groupKey: null,
    title: "Ametist",
    snippet: "mor kuvars",
    evidenceFields: [{ origin: "title", kind: "title", text: "ametist" }],
    topicTags: ["uyku"],
    expertRelations: [{ kind: "benzer", targetLabel: "Kuvars" }],
    tsRank: 0.5,
    sourceUpdatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

// ── Query pipeline ──
{
  const empty = buildRetrievalDescriptor({ rawQuery: "   ", sessionTenantId: TENANT, allowShared: false });
  add("pipeline-empty-query-noop", empty.descriptor.kind === "noop", empty.descriptor.kind);

  const d = buildRetrievalDescriptor({ rawQuery: "ametist uyku", sessionTenantId: TENANT, allowShared: true });
  const okQuery =
    d.descriptor.kind === "query" &&
    d.descriptor.visibility.sessionTenantId === TENANT &&
    d.descriptor.visibility.allowShared === true;
  add("pipeline-query-descriptor+tenant+shared", okQuery, d.descriptor.kind);

  const d2 = buildRetrievalDescriptor({ rawQuery: "ametist", sessionTenantId: TENANT, allowShared: false });
  add(
    "pipeline-allowShared-false-preserved",
    d2.descriptor.kind === "query" && d2.descriptor.visibility.allowShared === false,
    "",
  );
}

// ── parseSearchRequest (tenant/client body'den okunmaz) ──
{
  const p = parseSearchRequest({ q: "  ametist  ", tenantId: "EVIL", clientId: "EVIL", foo: 1 });
  const okParse =
    p.ok &&
    p.value.q === "ametist" &&
    p.value.allowShared === false &&
    p.value.limit === 150 &&
    !("tenantId" in p.value) &&
    !("clientId" in (p.value as unknown as Record<string, unknown>));
  add("parse-valid+tenant-ignored", okParse, JSON.stringify(p));

  add("parse-invalid-q-type", parseSearchRequest({ q: 5 }).ok === false, "");
  add("parse-q-too-long", parseSearchRequest({ q: "x".repeat(201) }).ok === false, "");
  const badMod = parseSearchRequest({ q: "a", modules: ["dogaltas", "hacker"] });
  add("parse-invalid-module", !badMod.ok && badMod.code === "YH_INVALID_MODULES", "");
  const goodMod = parseSearchRequest({ q: "a", modules: ["dogaltas", "aromaterapi"] });
  add("parse-valid-modules", goodMod.ok && goodMod.value.modules?.length === 2, "");
  add("parse-limit-zero", !parseSearchRequest({ q: "a", limit: 0 }).ok, "");
  add("parse-limit-over-150", !parseSearchRequest({ q: "a", limit: 151 }).ok, "");
  add("parse-limit-float", !parseSearchRequest({ q: "a", limit: 1.5 }).ok, "");
  add("parse-limit-valid", (() => { const r = parseSearchRequest({ q: "a", limit: 20 }); return r.ok && r.value.limit === 20; })(), "");
  add("parse-invalid-allowShared", !parseSearchRequest({ q: "a", allowShared: "yes" }).ok, "");
}

// ── flag/demo disabled + allowShared clamp ──
{
  add("disabled-demo", isSearchDisabled(flags({ yh_enabled: true, yh_hizli: true }), true) === true, "");
  add("disabled-enabled-off", isSearchDisabled(flags({ yh_hizli: true }), false) === true, "");
  add("disabled-hizli-off", isSearchDisabled(flags({ yh_enabled: true }), false) === true, "");
  add("enabled-both-on", isSearchDisabled(flags({ yh_enabled: true, yh_hizli: true }), false) === false, "");
  add("clamp-shared-flag-off", resolveAllowShared(false, true) === false, "");
  add("clamp-requested-false", resolveAllowShared(true, false) === false, "");
  // SHARED/GLOBAL HARD-DISABLE (bağlayıcı ürün kararı): flag+request true olsa DAHİ shared
  // ASLA açılmaz → arama her zaman tenant-only. (Önceki "both-on → true" davranışı kaldırıldı.)
  add("clamp-both-on-hard-disabled", resolveAllowShared(true, true) === false, "");
}

// ── moduleLabels + source-link allowlist ──
{
  add("label-known", moduleLabel("sifa_rehberi") === "Şifa Rehberi", "");
  add("label-unknown-passthrough", moduleLabel("mystery") === "mystery", "");
  add("sourcelink-known", sourceLinkFor("refleksoloji") === "/refleksoloji", "");
  add("sourcelink-unknown-null", sourceLinkFor("stones_raw") === null, "");
  add("is-yh-module", isYhSourceModule("dogaltas") && !isYhSourceModule("nope"), "");
}

// ── searchResult DTO (no raw tenantId) + facets + filter ──
{
  const own = toSearchResult(candidate({ tenantId: TENANT }));
  const shared = toSearchResult(candidate({ id: "c2", tenantId: null, sourceModule: "aromaterapi" }));
  const noTenantField = !("tenantId" in (own as unknown as Record<string, unknown>));
  add("dto-no-raw-tenant", noTenantField, "");
  add("dto-isShared-derived", own.isShared === false && shared.isShared === true, "");
  add("dto-moduleLabel+link", own.moduleLabel === "Doğaltaş" && own.sourceLink === "/dogaltas", "");

  const results = [own, shared, toSearchResult(candidate({ id: "c3", sourceModule: "dogaltas" }))];
  const facets = computeFacets(results);
  const dog = facets.find((f) => f.module === "dogaltas");
  add("facets-count", dog?.count === 2 && facets.length === 2, JSON.stringify(facets));
  add("filter-by-module", filterByModules(results, ["aromaterapi"]).length === 1, "");
  add("filter-empty-returns-all", filterByModules(results, []).length === 3, "");
}

// ── server module gate (admin bypass + explicit grant) ──
{
  const admin = hasModulePermissionForProfile({ role: "admin" }, "yasam_hafizasi");
  const noPerm = hasModulePermissionForProfile({ role: "expert", module_permissions: {} }, "yasam_hafizasi");
  const granted = hasModulePermissionForProfile(
    { role: "expert", module_permissions: { yasam_hafizasi: true } },
    "yasam_hafizasi",
  );
  add("gate-admin-bypass", admin === true, "");
  add("gate-expert-no-perm-denied", noPerm === false, "");
  add("gate-expert-granted-allowed", granted === true, "");
}

// ── Özet ──
const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
}
process.stdout.write(`\nBF-13 HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
process.exit(failed.length > 0 ? 1 : 0);
