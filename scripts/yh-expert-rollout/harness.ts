/**
 * YAŞAM HAFIZASI™ — TÜM UZMANLARA AÇILIM (Stage 2) harness (PASS/BLOCKED).
 *
 * Saf mantık (permission / shared-clamp / flag-seed / client DTO) + statik sözleşme
 * (route gate, migration, UI wiring) denetimi. Production/DB YOK.
 *   npm run yh:expert-rollout:harness
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_MODULE_PERMISSIONS,
  PREMIUM_EXPERT_MODULE_KEYS,
  buildPremiumModulePermissionsPayload,
  hasModulePermissionForProfile,
  hasModulePermission,
} from "@/lib/auth/modulePermissions";
import type { YasamUser } from "@/lib/auth/yasamUser";
import { resolveAllowShared } from "@/lib/yasam-hafizasi/ui/searchRequest";
import { gradeExpertPremiumWithYasamHafizasi } from "@/lib/yasam-hafizasi/expertPremiumGrant";
import {
  toTenantClientSearchResult,
  filterTenantByModules,
  computeTenantFacets,
  distinctClientIds,
  CLIENT_NAME_FALLBACK,
  type TenantClientRpcRow,
} from "@/lib/yasam-hafizasi/client/tenantClientSearchResult";
import { parseClientSearchRequest, withinDateWindow } from "@/lib/yasam-hafizasi/client/clientSearchRequest";
import { isSyntheticTenantId, ADMIN_LIBRARY_TENANT_ID, SYNTHETIC_TENANT_IDS } from "@/lib/tenancy/syntheticTenants";

const checks: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail = ""): void => {
  checks.push({ name, ok, detail });
};
const read = (p: string): string => readFileSync(join(process.cwd(), p), "utf8");
/** Kod-only negatif assert'ler için yorumları (/* *​/ ve //) çıkar. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const CLIENT = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const SID = "dddddddd-dddd-4ddd-dddd-dddddddddddd";

function rpcRow(over: Partial<TenantClientRpcRow> = {}): TenantClientRpcRow {
  return {
    id: SID,
    client_id: CLIENT,
    source_module: "danisan_seans",
    source_table: "client_sessions",
    source_id: SID,
    unit_type: "record",
    title: "Seans",
    snippet: "klinik metin",
    evidence_fields: [{ kind: "paragraph", text: "bas agrisi" }],
    topic_tags: ["Refleksoloji"],
    expert_relations: [],
    occurred_at: "2026-05-01",
    source_updated_at: null,
    ...over,
  };
}

async function run(): Promise<void> {
  // ─── 1) PERMISSION MODEL ─────────────────────────────────────────────────
  // DEFAULT fail-closed false (KRİTİK: true YAPILMADI).
  add("default-yasam-hafizasi-false", DEFAULT_MODULE_PERMISSIONS.yasam_hafizasi === false, String(DEFAULT_MODULE_PERMISSIONS.yasam_hafizasi));

  // YH generic premium payload'ında YOK → hiçbir düz users.update perm'i flag olmadan set edemez
  // (perm yalnız atomik yh_grant_expert_access ile verilir → PARTIAL imkânsız).
  add("premium-keys-exclude-yasam-hafizasi", !(PREMIUM_EXPERT_MODULE_KEYS as readonly string[]).includes("yasam_hafizasi"), "");
  add("premium-payload-omits-yasam-hafizasi", buildPremiumModulePermissionsPayload().yasam_hafizasi === undefined, String(buildPremiumModulePermissionsPayload().yasam_hafizasi));

  // admin → erişir (merkezî bypass; ekstra ürün özelliği DEĞİL, yalnız izin kapısı).
  add("admin-access", hasModulePermissionForProfile({ role: "admin", module_permissions: {} }, "yasam_hafizasi") === true, "");
  // eligible expert + yasam_hafizasi=true → erişir.
  add("expert-with-perm-access", hasModulePermissionForProfile({ role: "expert", module_permissions: { yasam_hafizasi: true } }, "yasam_hafizasi") === true, "");
  // expert + permission=false → erişemez.
  add("expert-without-perm-denied", hasModulePermissionForProfile({ role: "expert", module_permissions: { yasam_hafizasi: false } }, "yasam_hafizasi") === false, "");
  // premium olsa DAHİ per-user flag esas (bypass yok): package_type premium ama perm yok → denied.
  const premiumNoPerm = hasModulePermission({ role: "expert", package_type: "premium", module_permissions: {} } as unknown as YasamUser, "yasam_hafizasi");
  add("premium-without-perm-denied", premiumNoPerm === false, String(premiumNoPerm));
  // null profil → denied (fail-closed).
  add("null-profile-denied", hasModulePermissionForProfile(null, "yasam_hafizasi") === false, "");

  // ─── 2) SHARED/GLOBAL HARD-DISABLE ───────────────────────────────────────
  add("shared-clamp-flag-and-request-true", resolveAllowShared(true, true) === false, "");
  add("shared-clamp-any-input-false", resolveAllowShared(false, true) === false && resolveAllowShared(true, false) === false, "");

  // ─── 3) ATOMIC PREMIUM-GRADE HELPER (membership + YH TEK transaction; perm+flag birlikte) ──
  const UID = "99999999-9999-4999-9999-999999999999";
  const MEMBERSHIP = { package_type: "premium", membership_status: "active", plan: "premium" };
  const MODULES = { clients: true, stones: true };
  // RPC 'premium_with_yh' → ok (premium + perm + flags atomik olarak DB'de BİRLİKTE yazıldı).
  {
    let fn = "", args: Record<string, unknown> = {};
    const fakeDb = { rpc: async (name: string, a: Record<string, unknown>) => { fn = name; args = a; return { data: "premium_with_yh", error: null }; } } as never;
    const r = await gradeExpertPremiumWithYasamHafizasi(fakeDb, UID, MEMBERSHIP, MODULES);
    add("grade-calls-atomic-rpc", fn === "yh_grade_expert_premium" && args.p_user_id === UID && args.p_membership === MEMBERSHIP && args.p_module_permissions === MODULES, `${fn}`);
    add("grade-with-yh-ok", r.ok === true && r.outcome === "premium_with_yh", JSON.stringify(r));
  }
  // Ineligible → RPC 'premium_no_yh' → ok (premium uygulandı, YH atlandı; hata DEĞİL, fail-closed).
  {
    const fakeDb = { rpc: async () => ({ data: "premium_no_yh", error: null }) } as never;
    const r = await gradeExpertPremiumWithYasamHafizasi(fakeDb, UID, MEMBERSHIP, MODULES);
    add("grade-no-yh-ok", r.ok === true && r.outcome === "premium_no_yh", JSON.stringify(r));
  }
  // RPC hata → ok:false (FAIL-CLOSED; çağıran premium geçişini başarısız saymalı → tx ROLLBACK, PARTIAL yok).
  {
    const fakeDb = { rpc: async () => ({ data: null, error: { message: "x" } }) } as never;
    const r = await gradeExpertPremiumWithYasamHafizasi(fakeDb, UID, MEMBERSHIP, MODULES);
    add("grade-error-fail-closed", r.ok === false && r.outcome === "error", JSON.stringify(r));
  }
  // Boş userId → error (fail-closed).
  {
    const fakeDb = { rpc: async () => ({ data: "premium_with_yh", error: null }) } as never;
    const r = await gradeExpertPremiumWithYasamHafizasi(fakeDb, "", MEMBERSHIP, MODULES);
    add("grade-empty-user-error", r.ok === false, JSON.stringify(r));
  }

  // ─── 4) TENANT-WIDE CLIENT DTO (tenant isolation surface) ────────────────
  {
    const names = new Map<string, string>([[CLIENT, "Ayşe Yılmaz"]]);
    const res = toTenantClientSearchResult(rpcRow(), names);
    add("client-dto-resolves-name", res !== null && res.clientName === "Ayşe Yılmaz" && res.clientId === CLIENT, "");
    add("client-dto-carries-occurredAt", res !== null && res.occurredAt === "2026-05-01", "");
    // ad çözülemezse nötr fallback (PII sızıntısı değil).
    const noName = toTenantClientSearchResult(rpcRow(), new Map());
    add("client-dto-name-fallback", noName !== null && noName.clientName === CLIENT_NAME_FALLBACK, "");
    // geçersiz client_id → null (fail-closed eleme).
    const bad = toTenantClientSearchResult(rpcRow({ client_id: "not-uuid" }), names);
    add("client-dto-invalid-clientid-null", bad === null, "");
    // bilinmeyen modül → null.
    const badMod = toTenantClientSearchResult(rpcRow({ source_module: "hacked" }), names);
    add("client-dto-unknown-module-null", badMod === null, "");
  }
  {
    const names = new Map<string, string>([[CLIENT, "A B"]]);
    const rows = [rpcRow(), rpcRow({ id: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee", source_module: "danisan_not", source_table: "client_notes" })];
    const dtos = rows.map((r) => toTenantClientSearchResult(r, names)).filter((x): x is NonNullable<typeof x> => x !== null);
    add("client-facets-count", computeTenantFacets(dtos).reduce((s, f) => s + f.count, 0) === 2, "");
    add("client-filter-by-module", filterTenantByModules(dtos, ["danisan_not"]).length === 1, "");
    add("client-distinct-ids", distinctClientIds(rows).length === 1, "");
  }

  // ─── 5) REQUEST PARSING (limit clamp / malformed / date) ─────────────────
  add("parse-rejects-bad-limit", parseClientSearchRequest({ q: "x", limit: 9999 }).ok === false, "");
  add("parse-rejects-bad-date", parseClientSearchRequest({ q: "x", dateFrom: "notdate" }).ok === false, "");
  add("parse-accepts-valid", parseClientSearchRequest({ q: "x", modules: ["danisan_seans"], dateFrom: "2026-01-01", limit: 20 }).ok === true, "");
  add("date-window-filters", withinDateWindow("2026-05-01", "2026-01-01", "2026-06-01") === true && withinDateWindow("2025-01-01", "2026-01-01", undefined) === false, "");

  // ─── 6) STATIK: SEV-3 route gate + no global count ───────────────────────
  {
    const health = read("app/api/yasam-hafizasi/health/route.ts");
    const healthCode = stripComments(health);
    add("health-module-gate", /hasModulePermissionForProfile\(\s*profile\s*,\s*"yasam_hafizasi"\s*\)/.test(health) && /includeProfile:\s*true/.test(health), "");
    add("health-no-global-count", !/mainIndexRows/.test(healthCode) && !/\.is\("tenant_id",\s*null\)/.test(healthCode), "");
    add("health-tenant-scoped-count", /\.eq\("tenant_id",\s*tenantId\)/.test(health), "");

    const config = read("app/api/yasam-hafizasi/config/route.ts");
    add("config-module-gate", /hasModulePermissionForProfile\(\s*profile\s*,\s*"yasam_hafizasi"\s*\)/.test(config) && /includeProfile:\s*true/.test(config), "");

    const searchReq = read("lib/yasam-hafizasi/ui/searchRequest.ts");
    add("resolve-allow-shared-hard-false", /export function resolveAllowShared[\s\S]*return false;/.test(searchReq), "");
  }

  // ─── 7) STATIK: UI wiring (iki alan; shared UI kaldırıldı) ───────────────
  {
    const ws = read("app/yasam-hafizasi/components/YasamHafizasiWorkspace.tsx");
    add("workspace-has-tabs", /MemoryAreaTabs/.test(ws) && /ClientMemoryPanel/.test(ws), "");
    add("workspace-no-allowshared", !/allowShared/.test(stripComments(ws)), "");
    add("workspace-tabpanels", /role="tabpanel"/.test(ws), "");

    const fb = read("app/yasam-hafizasi/components/FilterBar.tsx");
    add("filterbar-no-allowshared", !/allowShared/.test(fb), "");

    const tabs = read("app/yasam-hafizasi/components/MemoryAreaTabs.tsx");
    add("tabs-accessible", /role="tablist"/.test(tabs) && /role="tab"/.test(tabs) && /aria-selected/.test(tabs) && /ArrowRight/.test(tabs), "");
    add("tabs-two-areas", /Mesleki Hafıza/.test(tabs) && /Danışan Hafızası/.test(tabs), "");

    const panel = read("app/yasam-hafizasi/components/ClientMemoryPanel.tsx");
    add("client-panel-uses-tenant-helper", /fetchTenantClientYhSearch/.test(panel), "");
    add("client-panel-renders-clientname", /clientName/.test(panel), "");
    add("client-panel-date-filters", /dateFrom/.test(panel) && /dateTo/.test(panel), "");
    add("client-panel-not-active-state", /not-active/.test(panel), "");

    const helper = read("lib/yasam-hafizasi/client/tenantClientSearchApiClient.ts");
    add("tenant-helper-hits-client-search", /\/api\/yasam-hafizasi\/client-search/.test(helper), "");
    add("tenant-helper-no-tenant-client-override", !/tenantId/.test(stripComments(helper)) && !/clientId/.test(stripComments(helper)), "");

    const page = read("app/yasam-hafizasi/page.tsx");
    add("page-copy-two-areas", /danışan/i.test(page) && !/sonraki faz/i.test(page), "");
  }

  // ─── 8) STATIK: provisioning/grant yollarının HEPSİ tek atomik sözleşmeye uyar ──
  {
    // package (premium grant): atomik premium-grade RPC + FAIL-CLOSED; eski best-effort/ayrı-write YOK.
    const pkg = read("app/api/admin/users/[id]/package/route.ts");
    const pkgCode = stripComments(pkg);
    add("package-uses-atomic-grade", /gradeExpertPremiumWithYasamHafizasi\(/.test(pkgCode) && /packagePlan === "premium"/.test(pkgCode), "");
    add("package-grade-fail-closed", /if \(!graded\.ok\)[\s\S]{0,140}status:\s*500/.test(pkgCode), "");
    // Premium branch RPC'den ÖNCE ayrı users.update YAPMAZ (iki ardışık write yok); ayrıca eski
    // best-effort helper referansları kaldırıldı.
    add("package-no-legacy-helpers", !/grantYasamHafizasiExpertAccess|ensureTenantYasamHafizasiEnabled|flagsAdmin/.test(pkgCode), "");

    // edit route: YH iznini KORUR (düşürmez), grant/revoke YAPMAZ (UI'da YH yok) → PARTIAL üretmez.
    const editRoute = read("app/api/admin/users/[id]/route.ts");
    add("edit-route-preserves-yh", /newPayload\.yasam_hafizasi\s*=\s*oldPerms\.yasam_hafizasi === true/.test(editRoute), "");

    // create yolları (register public + admin create): DEFAULT (all-false) → create'te YH YOK.
    const reg = read("app/api/register/route.ts");
    add("register-default-perms-no-yh", /modulePermissions:\s*DEFAULT_MODULE_PERMISSIONS/.test(reg), "");
    const adminCreate = read("app/api/admin/users/route.ts");
    add("admin-create-default-perms-no-yh", /modulePermissions:\s*DEFAULT_MODULE_PERMISSIONS/.test(adminCreate), "");

    // DEFAULT fail-closed false + generic premium payload YH içermez (kaynak seviyesi).
    const mp = read("lib/auth/modulePermissions.ts");
    add("default-perms-not-true-in-source", /yasam_hafizasi:\s*false/.test(mp), "");

    // Eski best-effort/ayrı helper'lar kaldırıldı (superseded by atomik yh_grade_expert_premium).
    let flagsAdminGone = false;
    try { read("lib/yasam-hafizasi/flagsAdmin.ts"); } catch { flagsAdminGone = true; }
    let grantHelperGone = false;
    try { read("lib/yasam-hafizasi/grantExpertAccess.ts"); } catch { grantHelperGone = true; }
    add("legacy-helpers-removed", flagsAdminGone && grantHelperGone, "");
    // Atomik premium-grade helper mevcut + RPC'yi çağırır.
    const helperSrc = read("lib/yasam-hafizasi/expertPremiumGrant.ts");
    add("premium-grade-helper-calls-rpc", /yh_grade_expert_premium/.test(helperSrc), "");
  }

  // ─── 9) STATIK: EXPAND migration (yalnız RPC/contract; kullanıcı açılımı YOK) ─────
  {
    const expandPath = "supabase/migrations/20261221000000_yh_grade_expert_premium_rpc.sql";
    const expand = read(expandPath);
    const expandSql = expand.replace(/--[^\n]*/g, "");
    // ATOMİK PREMIUM-GRADE RPC: membership + module perms + active/approved + YH perm + YH flags
    // TEK function/transaction'da; DEFINER + service_role; POST-TRANSACTION eligibility.
    add("expand-grade-rpc-exists", /CREATE OR REPLACE FUNCTION public\.yh_grade_expert_premium\(\s*p_user_id\s+uuid,\s*p_membership\s+jsonb,\s*p_module_permissions\s+jsonb/.test(expandSql), "");
    add("expand-grade-rpc-definer-service-role", /SECURITY DEFINER/.test(expandSql) && /GRANT EXECUTE ON FUNCTION public\.yh_grade_expert_premium\(uuid, jsonb, jsonb\) TO service_role/.test(expandSql), "");
    add(
      "expand-grade-rpc-post-transition-eligibility",
      /UPDATE public\.users SET[\s\S]*active\s*=\s*true[\s\S]*approval_status\s*=\s*'approved'[\s\S]*RETURNING \* INTO v_user;[\s\S]*v_eligible\s*:=[\s\S]*v_user\.active\s*=\s*true[\s\S]*approval_status[\s\S]*'approved'[\s\S]*premium/.test(expandSql),
      "",
    );
    add(
      "expand-grade-rpc-eligible-implies-yh",
      /IF v_eligible THEN[\s\S]*jsonb_build_object\('yasam_hafizasi',\s*true\)[\s\S]*INSERT INTO public\.yasam_hafizasi_flags[\s\S]*ON CONFLICT \(tenant_id\) DO UPDATE[\s\S]*yh_enabled = true, yh_hizli = true[\s\S]*RETURN 'premium_with_yh'/.test(expandSql),
      "",
    );
    add("expand-grade-rpc-ineligible-no-yh", /RETURN 'premium_no_yh'/.test(expandSql), "");
    // ADIM 1 caller-supplied module_permissions'tan yasam_hafizasi'yi DB seviyesinde STRIP eder
    // (`- 'yasam_hafizasi'`) → YH grant authority YALNIZ ADIM 3 eligible branch'i.
    add("expand-first-update-sanitizes-caller-yh", /module_permissions\s*=\s*\(?COALESCE\(p_module_permissions,\s*module_permissions,\s*'\{\}'::jsonb\)\)?\s*-\s*'yasam_hafizasi'/.test(expandSql), "");
    // ADIM 1 (ilk UPDATE) yasam_hafizasi'yi TRUE'ya SET ETMEZ; yasam_hafizasi=true YALNIZ IF v_eligible sonrası.
    {
      const eligIdx = expandSql.indexOf("IF v_eligible THEN");
      const beforeEligible = eligIdx >= 0 ? expandSql.slice(0, eligIdx) : expandSql;
      add("expand-yh-true-only-in-eligible-branch", eligIdx >= 0 && !/yasam_hafizasi['"]?\s*,\s*true/.test(beforeEligible) && !/yasam_hafizasi['"]?\s*:\s*true/.test(beforeEligible), "");
    }
    // FAIL-CLOSED PREMIUM GATE (TUTARLILIK): package_type VE plan ikisi birden premium DEĞİLSE
    // (OR mantığı: biri bile <> premium ise) UPDATE'ten ÖNCE RAISE ile reddedilir.
    {
      const gateMatch = /IF lower\(coalesce\(p_membership->>'package_type',\s*''\)\)\s*<>\s*'premium'\s*OR lower\(coalesce\(p_membership->>'plan',\s*''\)\)\s*<>\s*'premium' THEN\s*RAISE EXCEPTION/.test(expandSql);
      const gateIdx = expandSql.search(/<>\s*'premium'[\s\S]*RAISE EXCEPTION[^\n]*tutarli premium/);
      const firstUpdateIdx = expandSql.indexOf("UPDATE public.users SET");
      add("expand-premium-fail-closed-gate-strict", gateMatch, "");
      add("expand-premium-gate-before-update", gateIdx >= 0 && firstUpdateIdx >= 0 && gateIdx < firstUpdateIdx, "");
      // ÇELİŞKİLİ payload'ı geçiren eski gevşek AND-gate KALMADI.
      add("expand-premium-gate-not-loose-and", !/p_membership->>'package_type',\s*''\)\)\s*<>\s*'premium'\s*AND lower\(coalesce\(p_membership->>'plan',\s*''\)\)\s*<>\s*'premium'/.test(expandSql), "");
      // Resulting eligibility TUTARLI: package_type VE plan ayrı ayrı premium; COALESCE-cross çelişkisi KALDIRILDI.
      add("expand-eligibility-strict-both-premium",
        /lower\(coalesce\(v_user\.package_type,\s*''\)\)\s*=\s*'premium'\s*AND\s*lower\(coalesce\(v_user\.plan,\s*''\)\)\s*=\s*'premium'/.test(expandSql)
        && !/coalesce\(v_user\.package_type,\s*v_user\.plan,\s*''\)/.test(expandSql), "");
    }
    // KRİTİK: EXPAND HİÇBİR kullanıcı açılımı/data DML yapmaz (yalnız fonksiyon tanımı).
    add("expand-no-bulk-rollout", !/_yh_rollout_users/.test(expandSql) && !/CREATE TEMP TABLE/.test(expandSql), "");
    add("expand-no-admin-seed", !/VALUES\s*\('aa8b960b-f4f1-4e5b-89f5-109bc030c147'/.test(expandSql), "");
    // EXPAND top-level DML yok: yalnız CREATE FUNCTION + REVOKE/GRANT (INSERT/UPDATE yalnız fonksiyon gövdesinde).
    add("expand-only-function-and-grants", /CREATE OR REPLACE FUNCTION/.test(expandSql) && !/INSERT INTO public\.yasam_hafizasi_flags\s*\(tenant_id, yh_enabled, yh_hizli\)\s*SELECT/.test(expandSql), "");
  }

  // ─── 9b) ADVERSARIAL — GATE 1 caller-YH sanitize + premium fail-closed invariantları ─────
  // DB'siz harness: RPC gövdesi SQL-yapısal, helper transport fakeDb ile doğrulanır.
  {
    const expandSql = read("supabase/migrations/20261221000000_yh_grade_expert_premium_rpc.sql").replace(/--[^\n]*/g, "");
    const eligIdx = expandSql.indexOf("IF v_eligible THEN");
    const before = eligIdx >= 0 ? expandSql.slice(0, eligIdx) : expandSql;
    const eligible = eligIdx >= 0 ? expandSql.slice(eligIdx) : "";
    const sanitized = /module_permissions\s*=\s*\(?COALESCE\(p_module_permissions,\s*module_permissions,\s*'\{\}'::jsonb\)\)?\s*-\s*'yasam_hafizasi'/.test(expandSql);
    const eligibilityGate = /v_user\.role\s*=\s*'expert'/.test(expandSql)
      && /v_user\.active\s*=\s*true/.test(expandSql)
      && /lower\(coalesce\(v_user\.approval_status,\s*''\)\)\s*=\s*'approved'/.test(expandSql)
      && /lower\(coalesce\(v_user\.package_type,\s*''\)\)\s*=\s*'premium'/.test(expandSql)
      && /lower\(coalesce\(v_user\.plan,\s*''\)\)\s*=\s*'premium'/.test(expandSql)
      && /coalesce\(v_user\.is_demo_account,\s*false\)\s*=\s*false/.test(expandSql);
    const yhTrueOnlyInEligible = eligIdx >= 0
      && !/yasam_hafizasi['"]?\s*[,:]\s*true/.test(before)
      && /jsonb_build_object\('yasam_hafizasi',\s*true\)/.test(eligible);

    // (A1) ineligible + caller {"yasam_hafizasi":true} → YH grant OLUŞAMAZ:
    //      ADIM 1 caller YH'yi strip eder, YH=true YALNIZ eligibility gate geçen branch'te.
    add("adv-ineligible-malicious-yh-no-grant", sanitized && yhTrueOnlyInEligible && eligibilityGate, "");
    // (A2) demo expert + malicious YH → YH yok (eligibility is_demo_account=false).
    add("adv-demo-expert-no-yh", /coalesce\(v_user\.is_demo_account,\s*false\)\s*=\s*false/.test(expandSql) && sanitized, "");
    // (A3) role != expert + malicious YH → YH yok (eligibility role='expert').
    add("adv-non-expert-no-yh", /v_user\.role\s*=\s*'expert'/.test(expandSql) && sanitized, "");
    // (A4) eligible real expert + caller YH false/absent → eligible branch YH=true set eder.
    add("adv-eligible-branch-grants-yh", yhTrueOnlyInEligible, "");
    // (A5) generic premium permission payload YH authority DEĞİLDİR (kaynak seviyesi).
    add("adv-generic-premium-not-yh-authority",
      !(PREMIUM_EXPERT_MODULE_KEYS as readonly string[]).includes("yasam_hafizasi")
      && buildPremiumModulePermissionsPayload().yasam_hafizasi === undefined, "");
    // (A6) çelişkili/non-premium p_membership → premium-grade RPC FAIL-CLOSED: UPDATE'ten ÖNCE RAISE.
    {
      const gateIdx = expandSql.search(/<>\s*'premium'[\s\S]*RAISE EXCEPTION[^\n]*tutarli premium/);
      const updIdx = expandSql.indexOf("UPDATE public.users SET");
      add("adv-non-premium-fail-closed", gateIdx >= 0 && updIdx >= 0 && gateIdx < updIdx, "");
    }
    // (A6b) transport: RPC hatası (DB RAISE dahil) → helper ok:false (çağıran premium'u başarısız sayar).
    {
      const fakeDb = { rpc: async () => ({ data: null, error: { message: "tutarli premium payload gerekli" } }) } as never;
      const r = await gradeExpertPremiumWithYasamHafizasi(fakeDb, "99999999-9999-4999-9999-999999999999", { package_type: "premium", plan: "trial" }, { clients: true });
      add("adv-helper-non-premium-error-fail-closed", r.ok === false && r.outcome === "error", JSON.stringify(r));
    }
    // (A7) geçerli premium YALNIZ package_type VE plan İKİSİ birden premium ise gate'i geçer (OR mantığı).
    add("adv-valid-premium-passes-gate",
      /lower\(coalesce\(p_membership->>'package_type',\s*''\)\)\s*<>\s*'premium'\s*OR lower\(coalesce\(p_membership->>'plan',\s*''\)\)\s*<>\s*'premium'/.test(expandSql), "");
    // (A8) flag write failure → TÜM transaction rollback: plpgsql fonksiyon gövdesinde ara COMMIT YOK
    //      (perm UPDATE + flags INSERT aynı atomik statement; both-or-neither).
    add("adv-no-intermediate-commit-in-body",
      eligIdx >= 0 && !/COMMIT\s*;/i.test(eligible.replace(/RETURN 'premium_with_yh';[\s\S]*$/, ""))
      && /UPDATE\s+public\.users[\s\S]*INSERT INTO public\.yasam_hafizasi_flags/.test(eligible), "");
    // (A9) retry idempotent: CREATE OR REPLACE + perm MERGE (||) + flags ON CONFLICT DO UPDATE.
    add("adv-idempotent-retry",
      /CREATE OR REPLACE FUNCTION public\.yh_grade_expert_premium/.test(expandSql)
      && /COALESCE\(module_permissions,\s*'\{\}'::jsonb\)\s*\|\|\s*jsonb_build_object\('yasam_hafizasi',\s*true\)/.test(expandSql)
      && /ON CONFLICT \(tenant_id\) DO UPDATE/.test(expandSql), "");
    // (A10) EXPAND apply-time data rollout içermez (bulk/admin-seed/activation/backfill/reconcile).
    add("adv-expand-no-apply-time-rollout",
      !/UPDATE public\.users SET[\s\S]*WHERE[\s\S]*role\s*=\s*'expert'[\s\S]*AND active/.test(expandSql.replace(/\$\$[\s\S]*\$\$/, "")) // fonksiyon gövdesi hariç top-level
      && !/backfill/i.test(expandSql) && !/reconcile/i.test(expandSql) && !/yh_source_activation/i.test(expandSql), "");
  }

  // ─── 9c) PREMIUM PAYLOAD CONSISTENCY — çelişkili payload'ı reddet (gate = OR mantığı) ─────
  // Gate SQL semantiği: package_type VE plan İKİSİ birden 'premium' değilse RAISE. Aşağıdaki saf
  // predicate SQL OR-gate'ini birebir yansıtır; SQL'e bağı yukarıdaki `adv-valid-premium-passes-gate`
  // (OR regex) + `expand-eligibility-strict-both-premium` ile kurulur.
  {
    const norm = (v: unknown): string => String(v ?? "").trim().toLowerCase();
    // Gate reddeder ⇔ ikisinden herhangi biri premium DEĞİL (SQL: <>premium OR <>premium).
    const gateRejects = (pkg: unknown, plan: unknown): boolean =>
      norm(pkg) !== "premium" || norm(plan) !== "premium";
    // Resulting eligibility (premium invariant): package_type VE plan ayrı ayrı premium (COALESCE-cross YOK).
    const resultingPremium = (pkg: unknown, plan: unknown): boolean =>
      norm(pkg) === "premium" && norm(plan) === "premium";

    // 1. package_type=premium, plan=trial → reject
    add("consistency-1-premium-trial-reject", gateRejects("premium", "trial") === true, "");
    // 2. package_type=trial, plan=premium → reject
    add("consistency-2-trial-premium-reject", gateRejects("trial", "premium") === true, "");
    // 3. both premium → PASS (gate geçirir)
    add("consistency-3-both-premium-pass", gateRejects("premium", "premium") === false, "");
    // 4. both non-premium → reject
    add("consistency-4-both-nonpremium-reject", gateRejects("trial", "pro") === true && gateRejects("pro", "trial") === true, "");
    // 4b. null/eksik required alan → fail-closed reject (gerçek caller her zaman ikisini de gönderir).
    add("consistency-4b-missing-field-reject", gateRejects("premium", null) === true && gateRejects(null, "premium") === true && gateRejects(undefined, undefined) === true, "");
    // 5. valid premium + eligible → YH permission + enabled + hizli (yalnız tutarlı premium resulting state).
    //    (Gate geçen tek payload = both premium; sonra eligible branch YH+flags yazar — yapısal olarak doğrulandı.)
    {
      const expandSql = read("supabase/migrations/20261221000000_yh_grade_expert_premium_rpc.sql").replace(/--[^\n]*/g, "");
      const eligIdx = expandSql.indexOf("IF v_eligible THEN");
      const eligible = eligIdx >= 0 ? expandSql.slice(eligIdx) : "";
      const yhOnGrant = /jsonb_build_object\('yasam_hafizasi',\s*true\)/.test(eligible)
        && /INSERT INTO public\.yasam_hafizasi_flags[\s\S]*yh_enabled = true, yh_hizli = true/.test(eligible)
        && /RETURN 'premium_with_yh'/.test(eligible);
      add("consistency-5-valid-premium-eligible-grants-yh", resultingPremium("premium", "premium") === true && yhOnGrant, "");
      // 6. malicious YH=true + ineligible → YH yok: ADIM 1 strip + YH yalnız eligible branch (before-branch temiz).
      const before = eligIdx >= 0 ? expandSql.slice(0, eligIdx) : expandSql;
      const stripped = /module_permissions\s*=\s*\(?COALESCE\(p_module_permissions,\s*module_permissions,\s*'\{\}'::jsonb\)\)?\s*-\s*'yasam_hafizasi'/.test(expandSql);
      add("consistency-6-malicious-yh-ineligible-no-grant", stripped && !/yasam_hafizasi['"]?\s*[,:]\s*true/.test(before) && resultingPremium("premium", "trial") === false, "");
    }
  }

  // ─── 10) STATIK: ACTIVATION migration (kullanıcı açılımı; code deploy SONRASI) ─────
  {
    const actPath = "supabase/migrations/20261221000100_yh_expert_rollout_activation.sql";
    const act = read(actPath);
    const actSql = act.replace(/--[^\n]*/g, "");
    // ACTIVATION DB contract/function KURMAZ (yalnız data açılımı).
    add("activation-no-rpc-contract", !/CREATE OR REPLACE FUNCTION/.test(actSql), "");
    // Existing expert: perm MERGE + flags upsert + cohort/exclusions.
    add("activation-merge-permissions", /module_permissions\s*=\s*[\s\S]*\|\|\s*jsonb_build_object\('yasam_hafizasi',\s*true\)/.test(actSql), "");
    add("activation-flags-upsert-enabled-hizli", /ON CONFLICT \(tenant_id\) DO UPDATE[\s\S]*yh_enabled\s*=\s*true[\s\S]*yh_hizli\s*=\s*true/.test(actSql), "");
    add("activation-excludes-demo-and-admin-library", /40f842a0-e3e8-448c-8971-9a938e1faccb/.test(actSql) && /aa8b960b-f4f1-4e5b-89f5-109bc030c147/.test(actSql), "");
    add("activation-excludes-demo-user-tenants", /is_demo_account/.test(actSql) && /NOT EXISTS/.test(actSql), "");
    add("activation-premium-active-cohort", /role\s*=\s*'expert'/.test(actSql) && /active\s*=\s*true/.test(actSql) && /premium/.test(actSql), "");
    // ADMIN PARITY: yalnız ADMIN_LIBRARY_TENANT; yh_shared EXPLICIT false (INSERT + ON CONFLICT).
    add(
      "activation-admin-flag-seed",
      /INSERT INTO public\.yasam_hafizasi_flags \(tenant_id, yh_enabled, yh_hizli, yh_shared\)\s*VALUES \('aa8b960b-f4f1-4e5b-89f5-109bc030c147'::uuid, true, true, false\)[\s\S]*ON CONFLICT \(tenant_id\) DO UPDATE[\s\S]*yh_enabled = true, yh_hizli = true, yh_shared = false/.test(actSql),
      "",
    );
    add("activation-admin-tenant-matches-ts-constant", actSql.includes(ADMIN_LIBRARY_TENANT_ID), "");
    // NEGATİF invariantlar.
    add("activation-no-shared-true", !/yh_shared\s*=\s*true/i.test(actSql), "");
    add("activation-no-backfill-reconcile", !/reconcile/i.test(actSql) && !/backfill_allowed/i.test(actSql) && !/yh_source_activation/i.test(actSql) && !/is_active\s*=\s*true/i.test(actSql), "");
    add("activation-non-destructive", !/DELETE\s+FROM/i.test(actSql) && !/\bTRUNCATE\b/i.test(actSql) && !/DROP\s+TABLE\s+public\./i.test(actSql), "");
  }

  // ─── 11) SYNTHETIC/TEST classification: TEK KAYNAK yeniden kullanımı (paralel mantık YOK) ──
  {
    // (B) Admin bypass: module_permissions.yasam_hafizasi=false OLSA DAHİ role=admin → erişir
    //     (flags parity ile arama da fonksiyonel; izin değeri değiştirilmez).
    add("admin-bypass-even-with-false-perm", hasModulePermissionForProfile({ role: "admin", module_permissions: { yasam_hafizasi: false } }, "yasam_hafizasi") === true, "");

    // (D) Synthetic single-source: yalnız ADMIN_LIBRARY_TENANT_ID synthetic; gerçek tenant değil.
    add("synthetic-single-source", SYNTHETIC_TENANT_IDS.length === 1 && isSyntheticTenantId(ADMIN_LIBRARY_TENANT_ID) === true, "");
    add("synthetic-real-tenant-false", isSyntheticTenantId("11111111-1111-4111-1111-111111111111") === false && isSyntheticTenantId(null) === false, "");

    // Client processor synthetic exclusion'ı bu TEK KAYNAK helper'ı kullanır (paralel mantık yok).
    const cep = read("lib/yasam-hafizasi/client/clientEventProcessor.ts");
    add("client-processor-reuses-synthetic-helper", /isSyntheticTenantId\(/.test(cep) && /from ["'][^"']*syntheticTenants["']/.test(cep.replace(/@\//g, "")) || /isSyntheticTenantId/.test(cep), "");

    // Synthetic/demo exclusion STRUCTURAL (yorumda değil, kod): EXPAND RPC eligibility + ACTIVATION bulk.
    const expandSql2 = read("supabase/migrations/20261221000000_yh_grade_expert_premium_rpc.sql").replace(/--[^\n]*/g, "");
    const actSql2 = read("supabase/migrations/20261221000100_yh_expert_rollout_activation.sql").replace(/--[^\n]*/g, "");
    add("expand-rpc-excludes-synthetic-demo-structural",
      /aa8b960b-f4f1-4e5b-89f5-109bc030c147/.test(expandSql2) && /40f842a0-e3e8-448c-8971-9a938e1faccb/.test(expandSql2) && /is_demo_account/.test(expandSql2), "");
    add("activation-bulk-excludes-synthetic-demo-structural",
      /aa8b960b-f4f1-4e5b-89f5-109bc030c147/.test(actSql2) && /40f842a0-e3e8-448c-8971-9a938e1faccb/.test(actSql2) && /is_demo_account/.test(actSql2), "");

    // CODE DEPENDENCY yalnız EXPAND RPC'ye bağlı (activation data'ya DEĞİL): helper + package RPC adını
    // kullanır; activation migration'ına kod referansı YOK.
    const helperSrc2 = read("lib/yasam-hafizasi/expertPremiumGrant.ts");
    const pkgSrc = read("app/api/admin/users/[id]/package/route.ts");
    add("code-depends-on-expand-rpc-only",
      /yh_grade_expert_premium/.test(helperSrc2) && /gradeExpertPremiumWithYasamHafizasi/.test(pkgSrc) &&
      !/yh_expert_rollout_activation/.test(helperSrc2) && !/yh_expert_rollout_activation/.test(pkgSrc), "");
  }
}

async function main(): Promise<void> {
  await run();
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  process.stdout.write(`\nYH EXPERT ROLLOUT HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);
  process.stdout.write(failed.length > 0 ? "RESULT: BLOCKED\n" : "RESULT: PASS\n");
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();
