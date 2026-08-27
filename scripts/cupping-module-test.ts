/**
 * KUPA & HACAMAT — modül statik sözleşme harness'i (DB'ye yazmaz; saf statik + mantık).
 *
 * Çalıştırma:  npx tsx scripts/cupping-module-test.ts   (cwd = repo kökü)
 *
 * KAPSAM: route gate + tenant-forced + demo + güvenli hata; RLS/grant migration şekli;
 * harita registry; modül gate kaydı; admin→uzman transfer additive kayıt (drift).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { CUPPING_BODY_MAPS, getCuppingMap, isKnownCuppingMap } from "../lib/cupping/maps";
import {
  POINT_WRITABLE,
  PLACEMENT_WRITABLE,
  SAFETY_WRITABLE,
  POINT_TOPIC_WRITABLE,
  TOPIC_WRITABLE,
  CUPPING_TABLES,
  CITATION_SPECS,
  isCitationEntity,
  PROTOCOL_WRITABLE,
  PROTOCOL_POINT_WRITABLE,
  PROTOCOL_POINT_META_WRITABLE,
  PROTOCOL_TECHNIQUE_META_WRITABLE,
  PROTOCOL_SAFETY_META_WRITABLE,
  PROTOCOL_STEP_WRITABLE,
  PROTOCOL_STEP_META_WRITABLE,
  PROTOCOL_ENTRY_WRITABLE,
  PROTOCOL_SOURCE_META_WRITABLE,
} from "../lib/cupping/fields";
import { CUPPING_CITATION_COPY_FIELDS } from "../lib/cupping/transferFields";
import { CUPPING_EVIDENCE_CLASSES, CUPPING_RELATION_STRENGTHS } from "../lib/cupping/vocab";
import { ModuleGateKey } from "../lib/auth/moduleAccess";
import { MODULE_ROUTE_PREFIXES, DEFERRED_MODULE_PREFIXES } from "../lib/auth/moduleRouteRegistry";
import { ALL_ACTIVE_GROUP_KEYS, TRANSFER_MODULES } from "../lib/admin/transferRegistry";
import { ALL_TRANSFER_GROUP_KEYS, emptyTransferCounts } from "../lib/admin/veriPaylasimiTransfer";
import { remapJunctionRows } from "../lib/admin/transferJunction";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string): void {
  if (cond) passed++;
  else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name);
  }
}
const read = (p: string) => readFileSync(p, "utf8");

function listRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = `${dir}/${entry}`;
    if (statSync(p).isDirectory()) out.push(...listRoutes(p));
    else if (entry === "route.ts") out.push(p);
  }
  return out;
}

function run(): void {
  // ── A) API ROUTE SÖZLEŞMESİ — her /api/kupa route'u gate'li + güvenli ──────────
  const routes = listRoutes("app/api/kupa");
  ok(routes.length >= 14, `kupa route sayısı okundu (${routes.length})`);
  for (const rel of routes) {
    const src = read(rel);
    // Citation route'ları paylaşılan fabrikaya delege eder (makeCitation*); gate/tenant/demo
    // sözleşmesi fabrikada (aşağıda J bölümünde ayrıca doğrulanır). Diğer route'lar inline.
    const isCitationFactory = /makeCitation(Collection|Item)\(/.test(src);
    if (isCitationFactory) {
      ok(true, `gate(fabrika): ${rel} citation fabrikasına delege`);
    } else {
      ok(/requireModuleAccess\(\s*req,\s*"cupping"\)/.test(src), `gate: ${rel} requireModuleAccess("cupping")`);
    }
    ok(/runtime\s*=\s*"nodejs"/.test(src), `runtime: ${rel} nodejs`);
    // Ham DB error.message SIZMAZ (route'lar sabit mesajlı api helper kullanır)
    ok(!/error\.message/.test(src), `güvenli-hata: ${rel} ham error.message DÖNMEZ`);
    // Yazma yapan route'lar demo short-circuit içerir (fabrika route'ları hariç — J'de test edilir)
    if (!isCitationFactory && /export async function (POST|PATCH|DELETE)/.test(src)) {
      ok(/is_demo_account/.test(src), `demo: ${rel} demo persist yok`);
    }
  }

  // ── B) TENANT ZORLAMA — merkezî helper ─────────────────────────────────────────
  const api = read("lib/cupping/api.ts");
  ok(/\.eq\("tenant_id",\s*tenantId\)/.test(api), "api: okuma/güncelleme tenant_id ile bağlı");
  ok(/\.insert\(\{\s*\.\.\.fields,\s*tenant_id:\s*tenantId\s*\}\)/.test(api), "api: INSERT server tenant_id yazar");
  ok(!/error\.message/.test(api), "api: ham DB error.message DÖNMEZ (sabit mesaj)");
  ok(/assertOwnedRef/.test(api), "api: FK sahiplik doğrulaması (cross-tenant enjeksiyon engeli)");
  // fields allowlist tenant_id/id içermez (yalnız iş alanları)
  const fields = read("lib/cupping/fields.ts");
  ok(!/"tenant_id"|"id"|"origin_/.test(fields.split("CUPPING_TABLES")[1] ?? fields), "fields: writable allowlist tenant_id/id/provenance içermez");
  ok((POINT_WRITABLE as readonly string[]).includes("name") && !(POINT_WRITABLE as readonly string[]).includes("tenant_id"), "fields: POINT_WRITABLE güvenli");
  ok((PLACEMENT_WRITABLE as readonly string[]).includes("point_id") && (SAFETY_WRITABLE as readonly string[]).includes("severity"), "fields: placement/safety alanları");
  // placement route FK sahiplik + map_key + geometri doğrulaması
  const placementRoute = read("app/api/kupa/placements/route.ts");
  ok(/assertOwnedRef\(db,\s*CUPPING_TABLES\.points/.test(placementRoute), "placement: point_id aynı tenant doğrulaması");
  ok(/isKnownCuppingMap\(/.test(placementRoute), "placement: map_key registry doğrulaması");

  // ── C) MODÜL GATE KAYDI ────────────────────────────────────────────────────────
  const modKeyOk: ModuleGateKey = "cupping";
  ok(modKeyOk === "cupping", "moduleAccess: 'cupping' ModuleGateKey union'da");
  ok(MODULE_ROUTE_PREFIXES.some((m) => m.prefix === "app/api/kupa" && m.key === "cupping"), "registry: app/api/kupa → cupping");
  ok(!DEFERRED_MODULE_PREFIXES.some((d) => d.prefix.includes("kupa")), "registry: kupa DEFERRED DEĞİL (gate day-1)");
  const modAccess = read("lib/auth/moduleAccess.ts");
  ok(/cupping:\s*\["kupa"/.test(modAccess), "moduleAccess: cupping alias (kupa)");

  // ── D) ŞEMA MIGRATION — 8 tablo + RLS lock ─────────────────────────────────────
  const schema = read("supabase/migrations/20261216000000_cupping_schema.sql");
  const tables = [
    "cupping_points", "cupping_point_placements", "cupping_topics", "cupping_point_topics",
    "cupping_techniques", "cupping_knowledge_records", "cupping_sources", "cupping_safety_notes",
  ];
  for (const t of tables) {
    ok(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}\\b`).test(schema), `şema: ${t} tablosu`);
  }
  ok(/tenant_id\s+uuid\s+NOT NULL/i.test(schema), "şema: tenant_id uuid NOT NULL");
  ok(/REFERENCES public\.cupping_points \(id\) ON DELETE CASCADE/.test(schema), "şema: placement point_id FK CASCADE");
  ok(/REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM anon, authenticated/.test(schema), "RLS: anon/authenticated REVOKE");
  ok(/ENABLE ROW LEVEL SECURITY/.test(schema), "RLS: ENABLE");
  ok(!/FORCE ROW LEVEL SECURITY/.test(schema), "RLS: FORCE YOK (service_role akışı korunur)");
  ok(!/CREATE POLICY/.test(schema), "RLS: permissive policy YOK (REVOKE-only)");
  ok(/UNIQUE \(tenant_id, point_id, map_key, placement_no\)/.test(schema), "şema: placement unique constraint");
  ok(/gen_random_uuid\(\)/.test(schema), "şema: uuid pk default");

  // ── E) PROVENANCE MIGRATION — additive origin_* ───────────────────────────────
  const prov = read("supabase/migrations/20261216010000_cupping_transfer_provenance.sql");
  ok(/ADD COLUMN IF NOT EXISTS origin_transfer_batch_id uuid/.test(prov), "provenance: batch_id kolonu");
  ok(/ADD COLUMN IF NOT EXISTS transferred_at timestamptz/.test(prov), "provenance: transferred_at kolonu");
  ok(/to_regclass/.test(prov), "provenance: to_regclass guard (idempotent)");
  ok(!/REFERENCES/.test(prov.replace(/--[^\n]*/g, "")) && !/ON DELETE CASCADE/.test(prov.replace(/--[^\n]*/g, "")), "provenance: FK/CASCADE YOK (additive)");
  ok(/'cupping_points'/.test(prov) && /'cupping_point_placements'/.test(prov), "provenance: nokta + yerleşim hedeflenir");
  // point_topics JUNCTION aktarıma dahil → provenance (rollback/audit) gerekli
  ok(/'cupping_point_topics'/.test(prov), "provenance: point_topics dahil (junction rollback/audit)");

  // ── F) HARİTA REGISTRY ─────────────────────────────────────────────────────────
  const mapKeys = ["back_body", "front_body", "head_front", "head_back", "head_left", "head_right", "head_top", "legs_front", "legs_back"];
  ok(CUPPING_BODY_MAPS.length === 9, `registry: 9 harita (${CUPPING_BODY_MAPS.length})`);
  for (const k of mapKeys) ok(!!getCuppingMap(k), `registry: ${k} tanımlı`);
  ok(isKnownCuppingMap("back_body") && !isKnownCuppingMap("uydurma_harita"), "registry: bilinen/bilinmeyen ayrımı");
  ok(CUPPING_BODY_MAPS.every((m) => m.contentWidth > 0 && m.contentHeight > 0), "registry: her haritanın viewBox oranı");

  // ── G) ADMIN → UZMAN TRANSFER additive kaydı (drift-safe) ──────────────────────
  const transferRoute = read("app/api/admin/veri-paylasimi/transfer/route.ts");
  const cupKeys = ["cupping_points", "cupping_topics", "cupping_techniques", "cupping_knowledge", "cupping_sources", "cupping_safety"];
  for (const k of cupKeys) {
    ok(new RegExp(`\\n  ${k}:\\s*\\{`).test(transferRoute), `transfer REGISTRY: ${k}`);
    ok((ALL_ACTIVE_GROUP_KEYS as unknown as string[]).includes(k), `manifest aktif: ${k}`);
    ok((ALL_TRANSFER_GROUP_KEYS as unknown as string[]).includes(k), `helper listesi: ${k}`);
    ok(Object.prototype.hasOwnProperty.call(emptyTransferCounts(), k), `counts: ${k}`);
  }
  // cupping_points RELATIONAL (points + placements, point_id remap, child tenant)
  ok(/cupping_points:\s*\{[\s\S]*?kind:\s*"relational"[\s\S]*?childTable:\s*"cupping_point_placements"[\s\S]*?childParentFk:\s*"point_id"[\s\S]*?childHasTenant:\s*true/.test(transferRoute),
    "transfer: cupping_points relational (placements child, point_id FK remap, child tenant)");
  // admin master tenant modeli = admin_tenant (HD/healing ile aynı, en güncel modül deseni)
  ok(/cupping_topics:\s*\{[\s\S]*?sourceMode:\s*"admin_tenant"/.test(transferRoute), "transfer: cupping admin_tenant source modeli");
  // cupping_point_topics JUNCTION (çift-FK remap) → aktarıma DAHİL
  ok(/\n  cupping_point_topics:\s*\{/.test(transferRoute), "transfer: point_topics REGISTRY'de (junction)");
  ok((ALL_ACTIVE_GROUP_KEYS as unknown as string[]).includes("cupping_point_topics"), "manifest aktif: cupping_point_topics");
  ok((ALL_TRANSFER_GROUP_KEYS as unknown as string[]).includes("cupping_point_topics"), "helper listesi: cupping_point_topics");
  ok(Object.prototype.hasOwnProperty.call(emptyTransferCounts(), "cupping_point_topics"), "counts: cupping_point_topics");
  // UI manifest: cupping modülü + aktif point_topics section
  const cupMod = TRANSFER_MODULES.find((m) => m.key === "cupping");
  ok(!!cupMod && cupMod.sections.some((s) => s.key === "cupping_points" && s.active), "manifest: cupping modülü + aktif nokta section");
  ok(!!cupMod && cupMod.sections.some((s) => s.key === "cupping_point_topics" && s.active), "manifest: point_topics AKTİF (junction transfer)");

  // ── I) JUNCTION FK REMAP — davranışsal (saf remapJunctionRows) ─────────────────
  {
    const mapA = new Map([["srcP1", "tgtP1"], ["srcP2", "tgtP2"]]); // point kaynak→hedef
    const mapB = new Map([["srcT1", "tgtT1"]]);                     // topic kaynak→hedef
    const rows = [
      { id: "rel1", point_id: "srcP1", topic_id: "srcT1", note: "n", relation_strength: "guclu" },
      { id: "rel2", point_id: "srcP2", topic_id: "srcYOK", note: "x" }, // topic yok → skip
      { id: "rel3", point_id: "srcYOK", topic_id: "srcT1" },           // point yok → skip
    ];
    const res = remapJunctionRows({
      rows, copyFields: ["note", "source_note", "relation_strength"],
      fkA: "point_id", fkB: "topic_id", mapA, mapB,
      targetTenantId: "TENANT", batchId: "BATCH", nowIso: "2026-01-01T00:00:00Z",
    });
    ok(res.requested === 3, "junction[1]: requested = kaynak ilişki sayısı");
    ok(res.skipped === 2 && res.payloads.length === 1, "junction[8]: eksik parent → skip (dangling üretilmez)");
    const p = res.payloads[0];
    ok(p.point_id === "tgtP1", "junction[2]: point_id hedefe remap");
    ok(p.topic_id === "tgtT1", "junction[3]: topic_id hedefe remap");
    ok(p.point_id !== "srcP1" && p.topic_id !== "srcT1", "junction[4]: kaynak UUID hedefte YOK");
    ok(p.tenant_id === "TENANT", "junction[5]: hedef tenant yazılır");
    ok(p.origin_transfer_batch_id === "BATCH" && p.origin_source_id === "rel1" && p.transferred_at === "2026-01-01T00:00:00Z",
      "junction[7]: iç provenance (rollback/audit) yazılır");
    ok(p.note === "n" && p.relation_strength === "guclu" && !("id" in p),
      "junction: meta kopyalanır, kaynak id kopyalanmaz");
    // [9] konu→noktalar mantığı transfer SONRASI: remap edilen ilişki hedef parent'lara tutarlı işaret eder
    ok(mapA.get("srcP1") === p.point_id && mapB.get("srcT1") === p.topic_id,
      "junction[9]: konu→nokta ilişkisi hedef tarafta tutarlı (özellik korunur)");
  }
  // route wiring (junction motoru)
  ok(/cupping_point_topics:\s*\{[\s\S]*?kind:\s*"junction"[\s\S]*?junctionFkA:\s*"point_id"[\s\S]*?junctionViaTableA:\s*"cupping_points"[\s\S]*?junctionFkB:\s*"topic_id"[\s\S]*?junctionViaTableB:\s*"cupping_topics"/.test(transferRoute),
    "route: cupping_point_topics junction config (çift FK + via tablo)");
  ok(/async function cloneJunctionGroup\b/.test(transferRoute) && /remapJunctionRows\(/.test(transferRoute),
    "route: cloneJunctionGroup + remapJunctionRows kullanılır");
  ok(/async function buildBatchIdMap\b/.test(transferRoute) && /origin_transfer_batch_id/.test(transferRoute),
    "route[remap kaynağı]: parent readback (buildBatchIdMap by batch id)");
  ok(/groupKeys\.sort\(/.test(transferRoute), "route[6/9]: junction gruplar en sona sıralanır (parent önce)");
  // rollback: junction flat gibi origin_transfer_batch_id ile temizlenir (rollbackGroup non-relational dalı)
  ok(/rollbackGroup/.test(transferRoute) && /origin_transfer_batch_id/.test(transferRoute), "route[7]: rollback junction'ı da batch_id ile temizler");

  // ── H) İZOLASYON — refleksoloji/hacamat namespace'ine sızma yok ───────────────
  ok(CUPPING_TABLES.points === "cupping_points" && CUPPING_TABLES.placements === "cupping_point_placements", "tablolar cupping_* namespace");
  ok(!routes.some((r) => /hacamat/.test(r)), "route: kozmik 'hacamat' namespace'i KULLANILMAZ");

  // ══ J) FAZ 1.5 — CONTENT FOUNDATION / CITATION (tipli junction) ════════════════
  const cf = read("supabase/migrations/20261217000000_cupping_content_foundation.sql");
  const factory = read("lib/cupping/citationApi.ts");
  const citTables = [
    "cupping_point_sources", "cupping_topic_sources", "cupping_point_topic_sources",
    "cupping_technique_sources", "cupping_knowledge_sources", "cupping_safety_sources",
  ];
  // [10] TİPLİ junction — 6 tablo, polimorfik entity_type YOK
  for (const t of citTables) ok(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.%1\\$I`).test(cf) || cf.includes(`'${t}'`), `citation[10]: ${t} tanımlı`);
  ok(!/entity_type/.test(cf), "citation[10b]: polimorfik entity_type YOK (tipli FK)");
  ok(citTables.length === 6 && Object.keys(CITATION_SPECS).length === 6, "citation: 6 tipli citation entity");
  ok(isCitationEntity("point") && !isCitationEntity("uydurma"), "citation: entity guard");
  // [1] create valid — fabrika insertEntity + entity FK map
  ok(/insertEntity\(db,\s*spec\.table/.test(factory) && /fields\[spec\.entityFk\]\s*=/.test(factory), "citation[1]: create fabrika insert + entity FK map");
  // [2]/[18] duplicate guard + idempotency — UNIQUE citation key
  ok(/_unique UNIQUE \(tenant_id, source_id, %2\$I, locator\)/.test(cf), "citation[2/18]: UNIQUE(tenant,source,entity,locator) duplicate guard");
  // [3] invalid source + [4] invalid entity — çift assertOwnedRef
  ok(/assertOwnedRef\(db,\s*CUPPING_TABLES\.sources/.test(factory), "citation[3]: kaynak varlık doğrulaması (assertOwnedRef)");
  ok(/assertOwnedRef\(db,\s*spec\.entityTable/.test(factory), "citation[4]: hedef entity varlık doğrulaması (assertOwnedRef)");
  // [5] cross-tenant source + [6] cross-tenant entity — composite tenant-safe FK
  ok(/_source_fk[\s\S]{0,80}FOREIGN KEY \(tenant_id, source_id\) REFERENCES public\.cupping_sources \(tenant_id, id\)/.test(cf), "citation[5]: composite FK (tenant,source)→cupping_sources (cross-tenant DB engeli)");
  ok(/_entity_fk[\s\S]{0,80}FOREIGN KEY \(tenant_id, %2\$I\) REFERENCES public\.%3\$I \(tenant_id, id\)/.test(cf), "citation[6]: composite FK (tenant,entity)→parent (cross-tenant DB engeli)");
  ok(/ADD CONSTRAINT %I UNIQUE \(tenant_id, id\)/.test(cf), "citation: composite FK hedefi UNIQUE(tenant_id,id) parent'larda");
  // [7]/[8] delete cascade
  ok((cf.match(/ON DELETE CASCADE/g) ?? []).length >= 2, "citation[7/8]: source + entity FK ON DELETE CASCADE");
  // [9] evidence_class invalid — CHECK + fabrika doğrulaması
  ok(/_evidence_chk[\s\S]{0,140}CHECK \(evidence_class IS NULL OR evidence_class IN/.test(cf), "citation[9]: evidence_class CHECK (migration)");
  ok(/evidenceOk\(/.test(factory) && /isEvidenceClass/.test(factory), "citation[9b]: evidence_class fabrika doğrulaması (400)");
  ok(CUPPING_EVIDENCE_CLASSES.length === 6 && (CUPPING_EVIDENCE_CLASSES as readonly string[]).includes("systematic_review"), "citation: evidence vocab (geleneksel≠klinik ayrık)");
  // [11]/[12] anon/auth direct DB blocked; [13] service-role (RLS enable, FORCE yok)
  ok(/REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM anon, authenticated/.test(cf), "citation[11/12]: anon/auth CRUD REVOKE");
  ok(/ENABLE ROW LEVEL SECURITY/.test(cf) && !/FORCE ROW LEVEL SECURITY/.test(cf), "citation[13]: RLS ENABLE, FORCE YOK (service-role)");
  ok(!/CREATE POLICY/.test(cf), "citation: permissive policy YOK (REVOKE-only)");
  // [14]/[15] transfer source + entity remap (6 junction)
  for (const t of citTables) {
    ok(new RegExp(`${t}:\\s*\\{[\\s\\S]*?kind:\\s*"junction"[\\s\\S]*?junctionFkA:\\s*"source_id"[\\s\\S]*?junctionViaTableA:\\s*"cupping_sources"`).test(transferRoute), `citation[14]: ${t} source_id remap (via cupping_sources)`);
    ok((ALL_ACTIVE_GROUP_KEYS as unknown as string[]).includes(t) && (ALL_TRANSFER_GROUP_KEYS as unknown as string[]).includes(t), `citation drift: ${t} manifest + helper`);
    ok(Object.prototype.hasOwnProperty.call(emptyTransferCounts(), t), `citation drift: ${t} counts`);
  }
  ok(/cupping_point_sources:[\s\S]*?junctionFkB:\s*"point_id"[\s\S]*?junctionViaTableB:\s*"cupping_points"/.test(transferRoute), "citation[15]: point_sources entity_id remap (via cupping_points)");
  // [16] point_topic_sources DEPENDENCY: point_topics junction'a bağlı → transferOrder=2
  ok(/cupping_point_topic_sources:\s*\{[\s\S]*?transferOrder:\s*2[\s\S]*?junctionViaTableB:\s*"cupping_point_topics"/.test(transferRoute), "citation[16]: point_topic_sources → point_topics bağımlılığı (transferOrder=2, en sona)");
  ok(/const orderOf\s*=/.test(transferRoute) && /transferOrder \?\?/.test(transferRoute), "citation[16b]: sıralama transferOrder'ı kullanır (via-table readback dolu)");
  // [17] INSERT-only — citation copyFields yalnız meta (id/tenant/FK YOK)
  ok(!(CUPPING_CITATION_COPY_FIELDS as readonly string[]).some((f) => /^(id|tenant_id|source_id|.*_id|origin_)/.test(f) && f !== "sort_order"), "citation[17]: copyFields yalnız meta (INSERT-only; FK ayrı remap)");
  ok((CUPPING_CITATION_COPY_FIELDS as readonly string[]).includes("evidence_class") && (CUPPING_CITATION_COPY_FIELDS as readonly string[]).includes("locator"), "citation[17b]: copyFields locator/evidence_class taşır");
  // [19] no raw DB leak + [20] demo persist=0 (fabrika)
  ok(!/error\.message/.test(factory), "citation[19]: fabrika ham DB error.message DÖNMEZ");
  ok(/is_demo_account/.test(factory) && /demo:\s*true/.test(factory), "citation[20]: demo persist=0 (fabrika short-circuit)");
  ok(/requireModuleAccess\(\s*req,\s*"cupping"\)/.test(factory), "citation: fabrika requireModuleAccess('cupping')");
  // additive kolonlar + NOT VALID (mevcut kolon CHECK apply-safe)
  ok(/ADD COLUMN IF NOT EXISTS synonyms\s+text\[\]/.test(cf) && /ADD COLUMN IF NOT EXISTS laterality/.test(cf), "foundation: points synonyms + laterality additive");
  ok(/ADD COLUMN IF NOT EXISTS technique_type/.test(cf) && /ADD COLUMN IF NOT EXISTS movement_style/.test(cf), "foundation: technique çok-eksenli additive");
  ok(/ADD COLUMN IF NOT EXISTS contraindication_class/.test(cf), "foundation: safety contraindication_class additive");
  ok(/ADD COLUMN IF NOT EXISTS year\s+integer/.test(cf) && /ADD COLUMN IF NOT EXISTS identifier/.test(cf), "foundation: source bibliyografik additive");
  ok(/relation_strength[\s\S]{0,160}NOT VALID/.test(cf) && /source_type[\s\S]{0,220}NOT VALID/.test(cf), "foundation: mevcut kolon CHECK NOT VALID (apply-safe, legacy korunur)");
  ok(!/DROP TABLE|DROP COLUMN/.test(cf.replace(/--[^\n]*/g, "")), "foundation: destructive DDL YOK (additive)");

  // ══ K) GAP-1 + GAP-2 — AMAÇ REHBERİ İLİŞKİ/KONU DETAY UI (migration YOK) ═══════
  // Bu bölüm: schema/API'de zaten var olan relation_strength/note + topic detay
  // alanlarının UI'ya BAĞLI olduğunu (create + edit) statik olarak doğrular.
  const amac = read("app/kupa/amac-rehberi/page.tsx");
  const clientApi = read("app/kupa/lib/api.ts");
  const ptItemRoute = read("app/api/kupa/point-topics/[id]/route.ts");
  // FAZ (mobil/tablet reading UX): TEK-kaynak okuma bileşeni + ayrı detay route + shell.
  const readView = read("app/kupa/amac-rehberi/components/TopicReadView.tsx");
  const readHook = read("app/kupa/amac-rehberi/hooks/useTopicReadData.ts");
  const detailPage = read("app/kupa/amac-rehberi/[topicId]/page.tsx");
  const detailClient = read("app/kupa/amac-rehberi/[topicId]/TopicDetailClient.tsx");
  const shell = read("app/kupa/components/KupaShell.tsx");

  // GAP-1 API kontratı (mevcut — regresyon guard): PATCH FK'leri değiştirmez, meta yazılır
  ok(/updatePointTopic\b/.test(clientApi) && /point-topics\/\$\{id\}[\s\S]{0,60}"PATCH"/.test(clientApi),
    "gap1[api]: client updatePointTopic (PATCH point-topics/:id)");
  ok(/RELATION_META_WRITABLE\s*=\s*POINT_TOPIC_WRITABLE\.filter/.test(ptItemRoute) &&
     /f\s*!==\s*"point_id"[\s\S]{0,40}f\s*!==\s*"topic_id"/.test(ptItemRoute),
    "gap1[api]: PATCH allowlist FK (point_id/topic_id) HARİÇ (yalnız meta güncellenir)");
  ok((POINT_TOPIC_WRITABLE as readonly string[]).includes("relation_strength") &&
     (POINT_TOPIC_WRITABLE as readonly string[]).includes("note"),
    "gap1[fields]: POINT_TOPIC_WRITABLE relation_strength + note içerir");

  // GAP-1 UI: create ilişki relation_strength + note gönderir
  ok(/createPointTopic\(\{[\s\S]*?relation_strength[\s\S]*?note[\s\S]*?\}\)/.test(amac),
    "gap1[ui]: ilişki create relation_strength + note gönderir");
  // GAP-1 UI: mevcut ilişki DÜZENLENEBİLİR (silip-yeniden değil) → updatePointTopic
  ok(/updatePointTopic\(/.test(amac), "gap1[ui]: mevcut ilişki edit (updatePointTopic) UI'da");
  ok(/editRelId/.test(amac) && /İlişki Türü/.test(amac) && /İlişki Açıklaması/.test(amac),
    "gap1[ui]: satır-içi ilişki edit (İlişki Türü + İlişki Açıklaması)");
  // GAP-1 UI: relation_strength kontrollü sözlükten (vocab tek kaynak); 4 değer
  ok(/CUPPING_RELATION_STRENGTHS/.test(amac), "gap1[ui]: relation_strength seçenekleri vocab'dan türetilir");
  ok(CUPPING_RELATION_STRENGTHS.length === 4 &&
     (CUPPING_RELATION_STRENGTHS as readonly string[]).includes("traditional_primary") &&
     (CUPPING_RELATION_STRENGTHS as readonly string[]).includes("modern_supported"),
    "gap1[vocab]: relation_strength 4 kanonik değer");
  ok(/ilişkisinin türünü belirtir/.test(amac), "gap1[ui]: relation_strength helper metni");

  // GAP-2 UI: topic detay alanları create + edit (title/category/description/notes/source_note)
  ok((TOPIC_WRITABLE as readonly string[]).includes("description") &&
     (TOPIC_WRITABLE as readonly string[]).includes("category") &&
     (TOPIC_WRITABLE as readonly string[]).includes("notes") &&
     (TOPIC_WRITABLE as readonly string[]).includes("source_note"),
    "gap2[fields]: TOPIC_WRITABLE description/category/notes/source_note içerir");
  ok(/createTopic\(/.test(amac) && /updateTopic\(/.test(amac),
    "gap2[ui]: topic create + edit (updateTopic) UI'da");
  ok(/topicFormMode/.test(amac) && /"create"/.test(amac) && /"edit"/.test(amac),
    "gap2[ui]: tek form create+edit modu");
  for (const [key, lbl] of [
    ["title", "Başlık"], ["category", "Kategori"], ["description", "Açıklama"],
    ["notes", "Çalışma Notu"], ["source_note", "Serbest Kaynak Notu"],
  ] as const) {
    ok(new RegExp(lbl).test(amac), `gap2[ui]: topic form alanı '${key}' (${lbl})`);
  }
  ok(/description:\s*[\s\S]{0,40}\.trim\(\)/.test(amac) && /category:/.test(amac) &&
     /notes:/.test(amac) && /source_note:/.test(amac),
    "gap2[ui]: form → API body description/category/notes/source_note map eder");
  ok(/serbest\/editöryal kaynak notu/.test(amac), "gap2[ui]: source_note serbest-not helper (yapısal atıf ayrımı)");

  // TEDAVİ DİLİ yasağı: label'larda 'Tedavi Noktaları' vb. kullanılmaz
  ok(!/Tedavi Noktalar/i.test(amac), "dil: 'Tedavi Noktaları' etiketi kullanılmaz (ilişki dili)");

  // CITATION korunumu: point-topic + topic CitationManager AYNEN korunur
  ok(/CuppingCitationManager[\s\S]{0,60}entity="point-topic"/.test(amac) &&
     /CuppingCitationManager[\s\S]{0,60}entity="topic"/.test(amac),
    "gap1/2: point-topic + topic CitationManager korunur (yeniden yazılmadı)");

  // ══ L) SADE OKUMA MODU — FORMAL kaynak-karşılaştırma (TEK KAYNAK TopicReadView) ══════
  // Okuma UI'sı artık reusable TopicReadView'dadır; amac desktop okuma modunda onu kullanır.
  ok(/Gelişmiş Düzenleme/.test(amac) && /Okuma Modu/.test(amac),
    "read[ui]: Gelişmiş Düzenleme toggle (okuma modu default) — amac'ta korunur");
  ok(/<TopicReadView/.test(amac) && /from "\.\/components\/TopicReadView"/.test(amac),
    "read[reuse]: amac desktop okuma paneli TopicReadView bileşenini kullanır (inline read UI YOK)");
  ok(/İlişkili Bölgeler/.test(readView), "read[ui]: 'İlişkili Bölgeler' bölümü (TopicReadView)");
  ok(/Kaynaklar Ne Diyor\?/.test(readView), "read[ui]: 'Kaynaklar Ne Diyor?' bölümü (TopicReadView)");
  ok(/new Set\([\s\S]{0,90}source_id/.test(readView),
    "read[ui]: formal kaynak sayısı DISTINCT source_id (Set) — aynı kaynak tekrarı şişmez");
  ok(/rr\.count >= 2/.test(readView), "read[ui]: yalnız >=2 formal kaynaklı bölgede sayı gösterilir");
  ok(/\{rr\.count\}[\s\S]{0,20}kaynakta geçiyor/.test(readView),
    "read[ui]: 'N kaynakta geçiyor' DİNAMİK (hard-code değil)");
  ok(/for \(const ts of topicSources\)/.test(readView),
    "read[ui]: kaynak kartları topic-source'lı DISTINCT source'lardan OTOMATİK türer");
  ok(/SOURCE_TYPE_LABEL\[/.test(readView) && /expert_educational[\s\S]{0,24}Uzman/.test(readView),
    "read[ui]: source_type rozetle resolve (expert_educational→Uzman/Eğitim)");
  ok(!/Zakir Benli|Süleyman Gök|Hacamat 2\b/.test(readView),
    "read[ui]: sabit kaynak ADI hard-code YOK (DB'den çözülür)");
  ok(!/[23] kaynakta geçiyor/.test(readView.replace(/\{[^}]*\}/g, "")),
    "read[ui]: sabit kaynak SAYISI hard-code YOK");
  ok(!/Önerilen Uygulama Sırası|Önerilen Sıra/.test(readView),
    "read[ui]: kaynakları birleştiren global 'uygulama sırası' ÜRETİLMEZ");
  ok(!/Migren|migren/.test(readView) && !/Migren|migren/.test(readHook),
    "read[reuse]: TopicReadView/loader Migren'e özel hard-code içermez (generic topic)");

  // ══ M) KULLANICI NOTLARI — formal citation'dan AYRI katman (TopicReadView) ═══════════
  ok(/Notlarım/.test(readView), "note[ui]: 'Notlarım' bölümü (formal kaynaklardan ayrı)");
  ok(/\+ Yeni Bilgi \/ Not Ekle/.test(readView), "note[ui]: '+ Yeni Bilgi / Not Ekle'");
  ok(/Kendi Notum/.test(readView), "note[ui]: source_label boşsa 'Kendi Notum'");
  ok(/createTopicNote\(/.test(readView) && /updateTopicNote\(/.test(readView) && /deleteTopicNote\(/.test(readView),
    "note[ui]: not create/edit/delete gerçek API'ye bağlı (TopicReadView)");
  ok(/listTopicNotes\(/.test(readView), "note[ui]: notlar DB'den okunur (listTopicNotes)");
  ok(/relSourceCount[\s\S]{0,120}relCitations/.test(readView),
    "note[semantik]: formal 'N kaynakta geçiyor' relCitations'tan (FORMAL); notlar bu sayıyı ETKİLEMEZ");
  // Notlar okuma UI'sında yönetildiği için amac artık not-CRUD içermez (tek kaynak).
  ok(!/createTopicNote\(|updateTopicNote\(|deleteTopicNote\(/.test(amac),
    "note[reuse]: amac not-CRUD'u DUPLICATE ETMEZ (TopicReadView sahiplenir)");
  ok((clientApi.includes("listTopicNotes") && clientApi.includes("createTopicNote") &&
      clientApi.includes("deleteTopicNote")),
    "note[client]: topic-notes CRUD client'ta");

  // ══ N) NOT API GÜVENLİK (topic-notes route'ları) ════════════════════════════════
  const notesRoute = read("app/api/kupa/topic-notes/route.ts");
  const notesItem = read("app/api/kupa/topic-notes/[id]/route.ts");
  ok(/requireModuleAccess\(req, "cupping"\)/.test(notesRoute) &&
     /requireModuleAccess\(req, "cupping"\)/.test(notesItem),
    "note[api]: requireModuleAccess('cupping') her route'ta");
  ok(/pickWritable\([\s\S]{0,40}TOPIC_NOTE_WRITABLE/.test(notesRoute),
    "note[api]: mass-assignment allowlist (TOPIC_NOTE_WRITABLE)");
  ok(/assertOwnedRef\([\s\S]{0,60}topics/.test(notesRoute) &&
     /assertOwnedRef\([\s\S]{0,60}points/.test(notesRoute),
    "note[api]: topic + point cross-tenant reddi (assertOwnedRef)");
  ok(/is_demo_account/.test(notesRoute) && /is_demo_account/.test(notesItem),
    "note[api]: demo persist=0 guard");
  ok(/\.delete\(\)[\s\S]{0,140}noteId/.test(notesRoute),
    "note[api]: point insert başarısızsa compensating delete (partial state yok)");
  ok(/insertEntity\(db, CUPPING_TABLES\.topicNotes, tenantId/.test(notesRoute),
    "note[api]: tenant_id SERVER-forced (insertEntity), body'den değil");

  // ══ O) NOT MIGRATION GÜVENLİK (additive + kilit) ════════════════════════════════
  const noteMig = read("supabase/migrations/20261001000000_cupping_topic_notes.sql");
  const noteMigCode = noteMig.replace(/--[^\n]*/g, "");
  ok(/cupping_topic_notes/.test(noteMig) && /cupping_topic_note_points/.test(noteMig),
    "note[mig]: iki tablo (cupping_topic_notes + cupping_topic_note_points)");
  ok(/FOREIGN KEY \(tenant_id, topic_id\) REFERENCES public\.cupping_topics \(tenant_id, id\)/.test(noteMig),
    "note[mig]: composite tenant-safe FK → cupping_topics(tenant_id,id)");
  ok(/FOREIGN KEY \(tenant_id, point_id\) REFERENCES public\.cupping_points \(tenant_id, id\)/.test(noteMig),
    "note[mig]: composite tenant-safe FK → cupping_points(tenant_id,id)");
  ok((noteMig.match(/ON DELETE CASCADE/g) ?? []).length >= 3,
    "note[mig]: FK'ler ON DELETE CASCADE (note+note_points)");
  ok(/UNIQUE \(tenant_id, topic_note_id, point_id\)/.test(noteMig),
    "note[mig]: duplicate note-point engeli (UNIQUE)");
  ok(/cupping_topic_notes_tenant_id_key UNIQUE \(tenant_id, id\)/.test(noteMig),
    "note[mig]: composite UNIQUE(tenant_id,id) — child FK hedefi");
  ok((noteMig.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length >= 2,
    "note[mig]: RLS ENABLE (iki tablo)");
  ok(/REVOKE ALL PRIVILEGES[\s\S]{0,80}anon, authenticated/.test(noteMig),
    "note[mig]: anon/authenticated REVOKE (service-role only)");
  ok(!/CREATE POLICY/i.test(noteMig), "note[mig]: permissive policy YOK (cupping_schema deseni)");
  ok(!/FORCE ROW LEVEL SECURITY/i.test(noteMigCode),
    "note[mig]: FORCE RLS YOK (yalnız ENABLE)");
  ok(!/DROP TABLE|DROP COLUMN|ALTER COLUMN|DROP CONSTRAINT/i.test(noteMigCode),
    "note[mig]: destructive DDL YOK (additive) — yorumlar hariç");
  ok(/TOPIC_NOTE_WRITABLE/.test(fields) && /topicNotes:/.test(fields) && /topicNotePoints:/.test(fields),
    "note[fields]: CUPPING_TABLES + TOPIC_NOTE_WRITABLE tanımlı");

  // ══ P) YENİ KAYIT UX — ayrı sayfa + büyük not editörü (migration YOK) ═════════════
  const yeni = read("app/kupa/amac-rehberi/yeni/page.tsx");
  const dialog = read("app/kupa/components/BigNoteEditorDialog.tsx");

  // 1) Sol panel butonu "+ Yeni" değil "+ Yeni Kayıt"; ayrı /yeni sayfasına link.
  ok(/\+ Yeni Kayıt/.test(amac), "yeniux[ui]: sol panel butonu '+ Yeni Kayıt' (belirgin)");
  ok(!/>\s*\+ Yeni\s*</.test(amac), "yeniux[ui]: eski belirsiz '+ Yeni' butonu kaldırıldı");
  ok(/href="\/kupa\/amac-rehberi\/yeni"/.test(amac),
    "yeniux[ui]: '+ Yeni Kayıt' ayrı /yeni sayfasına gider (inline form açmaz)");

  // 2) Yeni kayıt AYRI route dosyası.
  ok(yeni.includes("Yeni Rahatsızlık Kaydı"),
    "yeniux[route]: /yeni ayrı sayfa 'Yeni Rahatsızlık Kaydı' başlığı");
  ok(/breadcrumb=\{\[[\s\S]{0,180}Yeni Kayıt/.test(yeni),
    "yeniux[route]: breadcrumb 'Amaç / Rahatsızlık Rehberi > Yeni Kayıt'");
  // "Rehbere Dön" / özel geri butonu KALDIRILDI — kullanıcı tarayıcı ileri/geri kullanır.
  ok(!/Rehbere Dön/.test(yeni) && !/actions=\{/.test(yeni),
    "yeniux[nav]: 'Rehbere Dön'/özel geri butonu yok (KupaShell actions verilmez)");

  // 3) Yeni route'ta rahatsızlık detayı / kaynak / ilişki / teknik edit RENDER edilmez.
  ok(!/CuppingCitationManager/.test(yeni) &&
     !/listPointTopics|listCitations|İlişkili Bölgeler|Kaynaklar Ne Diyor/.test(yeni),
    "yeniux[route]: yeni sayfada detay/kaynak/ilişki/teknik-edit YOK (yalnız form)");

  // 4+5) Profesyonel/Serbest not: form içinde küçük textarea DEĞİL → büyük editör dialog.
  ok(/BigNoteEditorDialog/.test(yeni), "yeniux[ui]: not alanları büyük editör (BigNoteEditorDialog) kullanır");
  ok(/NoteFieldCard/.test(yeni) && /Not eklemek için tıklayın/.test(yeni) &&
     /Kaynak notu eklemek için tıklayın/.test(yeni),
    "yeniux[ui]: her iki not alanı tıklanabilir kart ('… eklemek için tıklayın')");
  ok(/karakterlik not eklendi/.test(yeni), "yeniux[ui]: dolu not kartı 'N karakterlik not eklendi'");
  ok(/80vh/.test(dialog) && /<textarea/.test(dialog), "yeniux[ui]: editör ~80vh büyük textarea");
  ok(/Notu Kaydet/.test(dialog) && /Vazgeç/.test(dialog), "yeniux[ui]: editör 'Notu Kaydet' + 'Vazgeç'");

  // ── RESPONSIVE genişlik + edge-to-edge (bu turun konusu) ──────────────────────────
  // Desktop: dar ortalı kolon YOK (max-w-2xl kaldırıldı) → geniş çalışma ekranı.
  ok(!/mx-auto[^"]*max-w-2xl/.test(yeni) && !/\bmax-w-2xl\b/.test(yeni),
    "yeniux[resp]: dar max-w-2xl kolon kaldırıldı (desktop geniş)");
  ok(/lg:grid-cols-3/.test(yeni) && /lg:col-span-2/.test(yeni) && /lg:grid-cols-2/.test(yeni),
    "yeniux[resp]: desktop grid (Ad geniş+Kategori dar / iki not kartı yan yana)");
  // Mobile/tablet: GERÇEK edge-to-edge — KupaShell fullBleedBelowLg + shared kupaEdgeCard.
  // Negatif-margin HACK'İ YASAK (kullanıcı bunu reddetti): -mx-* class'ı /yeni'de olmamalı.
  ok(/fullBleedBelowLg/.test(yeni), "yeniux[resp]: /yeni KupaShell fullBleedBelowLg kullanır (page-level edge-to-edge)");
  ok(/kupaEdgeCard/.test(yeni), "yeniux[resp]: /yeni paylaşılan kupaEdgeCard kullanır (formCardCls hack kaldırıldı)");
  ok(!/-mx-4|-mx-6|sm:-mx-/.test(yeni), "yeniux[resp]: negatif-margin gutter HACK'i /yeni'de YOK (page-level çözüm)");
  ok(/border-y/.test(shell) && /lg:rounded-2xl/.test(shell),
    "yeniux[resp]: kupaEdgeCard mobil köşesiz (border-y), desktop rounded-2xl premium (KupaShell)");
  // BigNoteEditorDialog responsive: <1024px (768 TABLET DAHİL) full-screen; >=1024px desktop modal.
  ok(/100dvh/.test(dialog) && /lg:h-\[80vh\]/.test(dialog),
    "yeniux[resp]: editör mobile/tablet 100dvh doldurur / desktop (lg) 80vh");
  ok(/p-0 lg:items-center lg:p-6/.test(dialog) && /lg:rounded-2xl/.test(dialog),
    "yeniux[resp]: editör <1024 kenara sıfır (p-0, köşesiz), >=1024 ortalı/rounded");
  // KRİTİK: desktop modal `sm:` breakpoint'inden BAŞLAMAZ (768 tablet full-screen kalmalı).
  ok(!/sm:h-\[80vh\]|sm:max-w-3xl|sm:rounded-2xl|sm:items-center/.test(dialog),
    "yeniux[resp]: dialog desktop modal'a `sm`/768'de GEÇMEZ (lg breakpoint)");
  // KRİTİK REGRESSION (mobil tam-ekran hapsi): overlay `document.body`'ye PORTAL edilmeli.
  // Aksi halde `fixed inset-0`, backdrop-filter/transform içeren bir ata (kupaEdgeCard
  // bölüm kartı `backdrop-blur`) tarafından o kutuya hapsolur → 100dvh string olsa bile
  // gerçek runtime'da tam-ekran DEĞİL. Portal olmadan bu assertion FAIL vermeli.
  ok(/createPortal\(/.test(dialog) && /document\.body/.test(dialog) && /from "react-dom"/.test(dialog),
    "yeniux[resp]: editör overlay createPortal(document.body) ile ata containing-block tuzağını AŞAR (gerçek 100dvh)");
  ok(/fixed inset-0/.test(dialog),
    "yeniux[resp]: portal overlay viewport-fixed (fixed inset-0) — document-flow textarea DEĞİL");

  // 6+7) modal save → parent FORM STATE (DB'ye ayrı yazmaz); tekrar aç → metin durur.
  ok(/onSave\(draft\)/.test(dialog) && !/createTopicNote|fetch\(/.test(dialog),
    "yeniux[ui]: 'Notu Kaydet' parent state'e aktarır (DB'ye ayrı yazmaz)");
  ok(/setNotes\(t\)/.test(yeni) && /setSourceNote\(t\)/.test(yeni),
    "yeniux[ui]: editör kaydı formun notes/source_note state'ini günceller (tekrar açınca metin durur)");
  ok(/useState\(value\)/.test(dialog) && /value:\s*string/.test(dialog),
    "yeniux[ui]: editör açılışta mevcut değeri (value prop) yükler (kaydedilen metin korunur)");

  // 8/10) Vazgeç: create çağırmadan rehbere döner (yanlış state yazmaz).
  ok(/onCancel/.test(dialog) && /GUIDE_HREF/.test(yeni),
    "yeniux[ui]: Vazgeç create çağırmadan iptal/rehbere döner");
  // ESC/overlay veri kaybı guard: yalnız 'temiz' (dirty değil) iken kapanır.
  ok(/!dirty[\s\S]{0,24}onCancel/.test(dialog),
    "yeniux[ui]: ESC/overlay yalnız değişiklik yokken kapatır (veri kaybı guard)");

  // 9) main save → mevcut createTopic (aynı DB alanları; yeni field YOK).
  ok(/createTopic\(/.test(yeni) &&
     /title:[\s\S]{0,220}category:[\s\S]{0,140}description:[\s\S]{0,140}notes:[\s\S]{0,140}source_note:/.test(yeni),
    "yeniux[api]: create body mevcut alanlar (title/category/description/notes/source_note)");

  // 11) başarılı create sonrası created topic'e dönüş + rehber ?topic= okur.
  ok(/GUIDE_HREF\}\?topic=/.test(yeni) && /\/kupa\/amac-rehberi/.test(yeni),
    "yeniux[flow]: create → ?topic=<id> ile rehbere dönüş");
  ok(/useSearchParams/.test(amac) && /topicParam/.test(amac),
    "yeniux[flow]: rehber ?topic= parametresini okuyup ilgili kaydı seçer");

  // 12) PATCH ATOMİKLİK — GERÇEK TRANSACTION (RPC). Eski "önce yaz sonra doğrula"
  //     yarım-güncelleme + delete→insert→best-effort-restore ANTI-PATTERN'i KALDIRILDI.
  ok(/db\.rpc\(\s*"cupping_topic_note_update_atomic"/.test(notesItem),
    "note[atomic]: PATCH tek transaction RPC (cupping_topic_note_update_atomic) çağırır");
  // Anti-pattern gitti: route artık not alanlarını RPC ÖNCESİ DB'ye yazmıyor.
  ok(!/updateEntity\(/.test(notesItem),
    "note[atomic]: route point doğrulamasından ÖNCE not yazmıyor (updateEntity kaldırıldı → partial yok)");
  ok(!/topicNotePoints\)\s*\.delete\(\)/.test(notesItem) && !/prevRows/.test(notesItem),
    "note[atomic]: delete→insert→restore anti-pattern route'tan kaldırıldı (replace RPC'de, atomik)");
  // tenant_id İSTEMCİDEN değil server'dan; RPC'ye server-side geçer.
  ok(/p_tenant_id:\s*tenantId/.test(notesItem),
    "note[atomic]: RPC'ye tenant_id SERVER-side (guard) geçer — body'den değil");
  // point_ids gönderilmediyse ilişkilere DOKUNMA (p_point_ids = null).
  ok(/hasPoints\s*\?\s*parsePointIds\([\s\S]{0,40}\)\s*:\s*null/.test(notesItem),
    "note[atomic]: point_ids yoksa p_point_ids=null (ilişkilere dokunulmaz)");
  // Hata kodu → sabit güvenli mesaj eşleşmesi (ham DB hatası sızmaz).
  ok(/"45001"[\s\S]{0,60}404/.test(notesItem) && /"45002"[\s\S]{0,60}400/.test(notesItem) &&
     /"45003"[\s\S]{0,60}400/.test(notesItem),
    "note[atomic]: RPC SQLSTATE → 404/400 güvenli mesaj map (45001/45002/45003)");
  ok(!/error\.message/.test(notesItem),
    "note[atomic]: ham DB error.message DÖNMEZ (güvenli sabit mesaj)");
  ok(/is_demo_account/.test(notesItem) && /Not metni boş olamaz/.test(notesItem) &&
     /Çok fazla bölge/.test(notesItem),
    "note[atomic]: demo guard + boş-not + MAX_POINTS kontratı korunur");

  // ── ATOMİK RPC MIGRATION GÜVENLİK + FAILURE-INJECTION KONTRATI ──────────────────
  const atomicMig = read("supabase/migrations/20261227000000_cupping_topic_note_atomic_update.sql");
  const atomicCode = atomicMig.replace(/--[^\n]*/g, "");
  ok(/CREATE OR REPLACE FUNCTION public\.cupping_topic_note_update_atomic\(/.test(atomicMig),
    "note[rpc]: atomik update fonksiyonu (public.cupping_topic_note_update_atomic)");
  ok(/SECURITY INVOKER/.test(atomicMig) && !/SECURITY DEFINER/.test(atomicCode),
    "note[rpc]: SECURITY INVOKER (yetki yükseltmesi/DEFINER YOK)");
  ok(/SET search_path = pg_catalog, public/.test(atomicMig),
    "note[rpc]: search_path sabit (pg_catalog, public)");
  // Failure-injection ATOMİKLİK: sahiplik + boş-not + point-tenant doğrulaması RAISE eder
  // → tek plpgsql gövdesi = tek transaction → her RAISE TAM rollback.
  ok(/RAISE EXCEPTION 'cupping_note_not_found' USING ERRCODE = '45001'/.test(atomicMig),
    "note[rpc-fi]: not bulunamadı → 45001 RAISE (rollback)");
  ok(/RAISE EXCEPTION 'cupping_note_empty' USING ERRCODE = '45002'/.test(atomicMig),
    "note[rpc-fi]: boş not → 45002 RAISE (rollback)");
  ok(/RAISE EXCEPTION 'cupping_point_not_owned' USING ERRCODE = '45003'/.test(atomicMig),
    "note[rpc-fi]: GEÇERSİZ/başka-tenant point → 45003 RAISE (not DEĞİŞMEZ, tam rollback)");
  // point-tenant doğrulaması yazmalarla AYNI fonksiyonda (id::text ile cast-panik yok).
  ok(/p\.tenant_id = p_tenant_id AND p\.id::text = x\.pid/.test(atomicMig),
    "note[rpc-fi]: point AYNI tenant'ta GERÇEK olmalı (id::text karşılaştırma)");
  // Replace (delete→insert) fonksiyon İÇİNDE (route'ta değil) → atomik.
  ok(/DELETE FROM public\.cupping_topic_note_points/.test(atomicMig) &&
     /INSERT INTO public\.cupping_topic_note_points/.test(atomicMig),
    "note[rpc-fi]: note-point REPLACE fonksiyon içinde (tek txn)");
  // NULL point_ids → ilişkilere dokunma; boş dizi → tamamen temizle.
  ok(/IF p_point_ids IS NOT NULL THEN/.test(atomicMig),
    "note[rpc-fi]: p_point_ids NULL → ilişkiler korunur; dizi (boş dahil) → REPLACE");
  // Yanıt sözleşmesi: not satırı + sıralı point_ids döner.
  ok(/to_jsonb\(n\)[\s\S]{0,80}'point_ids'/.test(atomicMig),
    "note[rpc]: fonksiyon not satırı + point_ids döndürür (API yanıt kontratı)");
  // EXECUTE kilidi: yalnız service_role.
  ok(/REVOKE ALL ON FUNCTION public\.cupping_topic_note_update_atomic[\s\S]{0,120}FROM PUBLIC, anon, authenticated/.test(atomicMig),
    "note[rpc]: EXECUTE anon/authenticated/PUBLIC'ten REVOKE");
  ok(/GRANT EXECUTE ON FUNCTION public\.cupping_topic_note_update_atomic[\s\S]{0,120}TO service_role/.test(atomicMig),
    "note[rpc]: EXECUTE yalnız service_role'e GRANT");
  // Kapsam kilidi: yalnız topic_notes + note_points; formal source/citation/YH/Atlas'a DOKUNMAZ.
  ok(!/cupping_topic_sources|cupping_point_topic_sources|cupping_sources|yh_|atlas/i.test(atomicCode),
    "note[rpc]: yalnız topic_notes + note_points'a dokunur (formal source/citation/YH/Atlas YOK)");
  // Additive: fonksiyon değişimi; destructive DDL YOK.
  ok(!/DROP TABLE|DROP COLUMN|ALTER TABLE|TRUNCATE/i.test(atomicCode),
    "note[rpc-mig]: destructive DDL YOK (yalnız CREATE OR REPLACE FUNCTION)");

  // ══ Q) MOBİL/TABLET OKUMA UX — list-only ana sayfa + ayrı detay route + full-bleed ═══
  //     (bu turun konusu; migration YOK. Breakpoint POLİTİKASI: <1024 mobil/tablet, >=1024 desktop.)

  // Q1) Ayrı /[topicId] detay route mevcut (server page, Next 16 params Promise + await).
  ok(/params:\s*Promise<\{\s*topicId:\s*string\s*\}>/.test(detailPage) && /await params/.test(detailPage),
    "readux[route]: /[topicId] server page params Promise + await (Next 16)");
  ok(/<TopicDetailClient\s+topicId=\{decodeURIComponent/.test(detailPage),
    "readux[route]: detay client'e decode edilmiş topicId geçer");

  // Q2) Statik /yeni route KORUNUR (App Router'da dinamik segmentten önce eşleşir → çakışma yok).
  ok(yeni.includes("Yeni Rahatsızlık Kaydı"), "readux[route]: statik /yeni sayfası korunur");

  // Q3) Mobil/tablet: rahatsızlık kartı AYRI okuma route'una Link (lg:hidden); JS innerWidth YOK.
  ok(/href=\{`\/kupa\/amac-rehberi\/\$\{encodeURIComponent\(t\.id\)\}`\}/.test(amac) &&
     /lg:hidden/.test(amac),
    "readux[nav]: mobil/tablet topic kartı dedicated /[topicId] Link (lg:hidden)");
  ok(!/window\.innerWidth|useMediaQuery|matchMedia/.test(amac),
    "readux[nav]: responsive ayrım saf CSS (innerWidth/matchMedia/hydration bağımlılığı YOK)");

  // Q4) Desktop: beğenilen inline seçim (selectTopic) button ile korunur (hidden lg:block).
  ok(/hidden lg:block[\s\S]{0,120}onClick=\{\(\) => selectTopic\(t\.id\)\}/.test(amac) ||
     /onClick=\{\(\) => selectTopic\(t\.id\)\}[\s\S]{0,160}hidden lg:block/.test(amac),
    "readux[nav]: desktop topic button inline selectTopic (hidden lg:block)");

  // Q5) Mobil ana sayfa: sağ okuma/düzenleme paneli GİZLİ (list-only; detay inline AÇILMAZ).
  ok(/hidden lg:flex/.test(amac), "readux[list]: mobil/tablet sağ panel gizli (hidden lg:flex) — list-only");

  // Q6) Reusable TEK-kaynak TopicReadView bileşeni var.
  ok(/export function TopicReadView/.test(readView), "readux[reuse]: TopicReadView bileşeni tanımlı");

  // Q7) Desktop okuma paneli + mobil detay route AYNI TopicReadView'ı kullanır (duplicate YOK).
  ok(/<TopicReadView/.test(amac), "readux[reuse]: desktop (amac) TopicReadView kullanır");
  ok(/<TopicReadView/.test(detailClient) && /from "\.\.\/components\/TopicReadView"/.test(detailClient),
    "readux[reuse]: mobil detay (TopicDetailClient) AYNI TopicReadView'ı kullanır");

  // Q8) Detay verisi topicId ile GERÇEK data'dan yüklenir (hard-code YOK): topics/point_topics/citations.
  ok(/listTopics\(\)/.test(readHook) && /listPointTopics\(\{\s*topicId\s*\}\)/.test(readHook) &&
     /listCitations\("topic",\s*topicId\)/.test(readHook) && /listCitations\("point-topic"/.test(readHook),
    "readux[data]: useTopicReadData topicId ile gerçek data yükler (topics/point_topics/citations)");
  ok(/find\(\(t\) => t\.id === topicId\)/.test(readHook) && /notFound/.test(readHook),
    "readux[data]: topic id ile bulunur; yoksa notFound (hard-code Migren YOK)");

  // Q9) Ayrı okuma sayfasında sidebar/liste/yeni-form YOK (yalnız seçili rahatsızlık okuması).
  ok(!/Rahatsızlıklar<\/h3>|Rahatsızlık ara|\+ Yeni Kayıt/.test(detailClient) &&
     !/Rahatsızlıklar<\/h3>|Rahatsızlık ara|\+ Yeni Kayıt/.test(detailPage),
    "readux[detail]: ayrı okuma sayfasında sol sidebar/liste/yeni-form YOK");

  // Q10) Özel geri/"Rehbere Dön"/floating back butonu YOK (tarayıcı ileri/geri; breadcrumb bilgi amaçlı).
  ok(!/Rehbere Dön/.test(detailClient) && !/Rehbere Dön/.test(detailPage) && !/Rehbere Dön/.test(readView),
    "readux[nav]: detay okuma sayfasında özel 'Rehbere Dön'/floating geri butonu YOK");

  // Q11) KupaShell fullBleedBelowLg opt-in prop (default false → diğer sayfalar değişmez).
  ok(/fullBleedBelowLg\s*=\s*false/.test(shell) && /fullBleedBelowLg\?:\s*boolean/.test(shell),
    "readux[shell]: KupaShell fullBleedBelowLg opt-in (default false)");
  ok(/const containerPad\s*=\s*fullBleedBelowLg\s*\?\s*"px-0 lg:px-8"/.test(shell),
    "readux[shell]: fullBleed <1024 dış padding=0, >=1024 lg:px-8 (premium geri gelir)");

  // Q12) /yeni + /[topicId] fullBleed kullanır (gerçek edge-to-edge).
  ok(/fullBleedBelowLg/.test(yeni), "readux[shell]: /yeni fullBleedBelowLg kullanır");
  ok(/fullBleedBelowLg/.test(detailClient), "readux[shell]: /[topicId] detay fullBleedBelowLg kullanır");

  // Q13) Mobil ana liste de edge-to-edge (fullBleed + köşesiz sidebar kart).
  ok(/fullBleedBelowLg/.test(amac) && /sidebarCardCls/.test(amac) && /border-y/.test(amac),
    "readux[shell]: ana liste mobilde edge-to-edge (fullBleed + köşesiz sidebar kart)");

  // Q14) Açıklama: mobil büyük editör tetikleyicisi (lg:hidden) + desktop inline textarea (hidden lg:block).
  ok(/setNoteDialog\("description"\)/.test(yeni) && /noteDialog === "description"/.test(yeni),
    "readux[desc]: /yeni Açıklama mobilde büyük editör (BigNoteEditorDialog title 'Açıklama')");
  ok(/lg:hidden[\s\S]{0,220}Açıklama eklemek için tıklayın/.test(yeni),
    "readux[desc]: mobil Açıklama tıklanabilir kart (büyük editör tetikler)");
  ok(/hidden lg:block[\s\S]{0,260}id="new-desc"/.test(yeni),
    "readux[desc]: desktop Açıklama INLINE textarea korunur (aynı description state)");

  // Q15) Notlarım not METNİ: mobil büyük (full-screen) editör + desktop inline textarea (aynı nfNote).
  ok(/BigNoteEditorDialog/.test(readView) && /title="Not"/.test(readView),
    "readux[note]: mobil not metni büyük (full-screen) editör kullanır (TopicReadView)");
  ok(/setNoteTextEditor\(true\)/.test(readView) && /lg:hidden/.test(readView) &&
     /className=\{`\$\{kupaInput\} hidden lg:block`\}/.test(readView),
    "readux[note]: not metni mobil editör tetikleyici (lg:hidden) + desktop inline textarea (hidden lg:block)");

  // Q16) REGRESYON: Gelişmiş Düzenleme (teknik yönetim) amac'ta AYNEN korunur (citation manager + link/edit).
  ok(/CuppingCitationManager[\s\S]{0,60}entity="point-topic"/.test(amac) &&
     /CuppingCitationManager[\s\S]{0,60}entity="topic"/.test(amac) &&
     /updatePointTopic\(/.test(amac) && /createPointTopic\(/.test(amac),
    "readux[regresyon]: Gelişmiş Düzenleme (citation/relation) amac'ta korunur");

  // ══════════════════════════════════════════════════════════════════════════
  // V2 CLEAN CORE — Hacamat Protokolleri (FAZ 1). Legacy topics ağacından AYRI.
  // ══════════════════════════════════════════════════════════════════════════
  const v2Tables = [
    "cupping_protocols", "cupping_protocol_points", "cupping_protocol_techniques",
    "cupping_protocol_safety", "cupping_protocol_steps", "cupping_protocol_entries",
    "cupping_protocol_entry_points", "cupping_protocol_sources",
  ];

  // ── V2-A) ŞEMA STATIC CONTRACT (yorum satırları çıkarılmış executable DDL) ──────
  const migCoreRaw = read("supabase/migrations/20261228000000_cupping_protocols_v2_core.sql");
  const migCore = migCoreRaw.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const t of v2Tables) {
    ok(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}\\b`).test(migCore), `v2-şema: ${t} tablosu`);
  }
  ok(!/DROP\s+TABLE/i.test(migCore) && !/DROP\s+COLUMN/i.test(migCore) &&
     !/RENAME\s+TO/i.test(migCore) && !/DROP\s+CONSTRAINT/i.test(migCore),
    "v2-şema: destructive DDL YOK (DROP/RENAME executable satırda yok)");
  ok(!/ALTER TABLE public\.cupping_topics\b/.test(migCore) &&
     !/ALTER TABLE public\.cupping_point_topics\b/.test(migCore) &&
     !/ALTER TABLE public\.cupping_topic_notes\b/.test(migCore),
    "v2-şema: legacy tablolar (topics/point_topics/topic_notes) ALTER EDİLMEZ");
  ok(/ALTER TABLE public\.cupping_sources\s+ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true/.test(migCore),
    "v2-şema: cupping_sources.is_active additive (soft-archive)");

  // RLS lock (8 tablo): ENABLE + anon/auth REVOKE; FORCE/policy YOK.
  for (const t of v2Tables) {
    ok(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`).test(migCore), `v2-rls: ${t} ENABLE`);
    ok(new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t}\\s+FROM anon, authenticated`).test(migCore), `v2-rls: ${t} anon/auth REVOKE`);
  }
  ok(!/FORCE ROW LEVEL SECURITY/.test(migCore), "v2-rls: FORCE YOK");
  ok(!/CREATE POLICY/.test(migCore), "v2-rls: policy YOK (REVOKE-only)");

  // FK davranışı: composite tenant-safe; protokol-child CASCADE, master RESTRICT.
  ok(/FOREIGN KEY \(tenant_id, protocol_id\) REFERENCES public\.cupping_protocols \(tenant_id, id\) ON DELETE CASCADE/.test(migCore),
    "v2-fk: protokol child (tenant,protocol_id)→protocols CASCADE");
  ok(/REFERENCES public\.cupping_points \(tenant_id, id\) ON DELETE RESTRICT/.test(migCore), "v2-fk: master point RESTRICT");
  ok(/REFERENCES public\.cupping_techniques \(tenant_id, id\) ON DELETE RESTRICT/.test(migCore), "v2-fk: master technique RESTRICT");
  ok(/REFERENCES public\.cupping_safety_notes \(tenant_id, id\) ON DELETE RESTRICT/.test(migCore), "v2-fk: master safety RESTRICT");
  ok(/cupping_protocol_entries_source_fk[\s\S]*?REFERENCES public\.cupping_sources \(tenant_id, id\) ON DELETE RESTRICT/.test(migCore),
    "v2-fk: entry source nullable RESTRICT (SET NULL DEĞİL → tenant_id NOT NULL güvenli)");
  ok(/cupping_protocol_entry_points_entry_fk[\s\S]*?REFERENCES public\.cupping_protocol_entries \(tenant_id, id\) ON DELETE CASCADE/.test(migCore),
    "v2-fk: entry_points entry CASCADE");
  ok(/cupping_protocol_entry_points_point_fk[\s\S]*?REFERENCES public\.cupping_points \(tenant_id, id\) ON DELETE RESTRICT/.test(migCore),
    "v2-fk: entry_points master point RESTRICT");

  // STEP INTEGRITY (DB-level): ref → protokol-üyesi child; NO ACTION (RESTRICT DEĞİL).
  ok(/cupping_protocol_steps_ref_point_fk[\s\S]*?REFERENCES public\.cupping_protocol_points \(tenant_id, protocol_id, point_id\) ON DELETE NO ACTION/.test(migCore),
    "v2-step: ref_point composite FK→protocol_points NO ACTION (detach-block + cascade uyumu)");
  ok(/cupping_protocol_steps_ref_technique_fk[\s\S]*?REFERENCES public\.cupping_protocol_techniques \(tenant_id, protocol_id, technique_id\) ON DELETE NO ACTION/.test(migCore),
    "v2-step: ref_technique composite FK→protocol_techniques NO ACTION");
  ok(!/REFERENCES public\.cupping_protocol_points \(tenant_id, protocol_id, point_id\) ON DELETE RESTRICT/.test(migCore) &&
     !/REFERENCES public\.cupping_protocol_techniques \(tenant_id, protocol_id, technique_id\) ON DELETE RESTRICT/.test(migCore),
    "v2-step: ref FK RESTRICT DEĞİL (RESTRICT protokol cascade'ini kırardı)");

  // Natural key / unique + CHECK.
  ok(/cupping_protocol_points_unique UNIQUE \(tenant_id, protocol_id, point_id\)/.test(migCore), "v2-uk: protocol_points natural key (step ref hedefi)");
  ok(/cupping_protocol_techniques_unique UNIQUE \(tenant_id, protocol_id, technique_id\)/.test(migCore), "v2-uk: protocol_techniques natural key");
  ok(/cupping_protocols_tenant_id_key UNIQUE \(tenant_id, id\)/.test(migCore), "v2-uk: protocols UNIQUE(tenant_id,id)");
  ok(/cupping_protocol_entries_tenant_id_key UNIQUE \(tenant_id, id\)/.test(migCore), "v2-uk: entries UNIQUE(tenant_id,id) (entry_points hedefi)");
  ok(/cupping_protocol_sources_unique UNIQUE \(tenant_id, protocol_id, source_id, locator\)/.test(migCore), "v2-uk: protocol_sources locator-dahil (aynı source çoklu locator)");
  ok(/cupping_protocol_entries_content_chk CHECK \(btrim\(content\) <> ''\)/.test(migCore), "v2-chk: entry content boş olamaz");
  ok(/cupping_protocol_steps_body_chk CHECK \(btrim\(body\) <> ''\)/.test(migCore), "v2-chk: step body boş olamaz");

  // ── V2-B) ATOMİK ENTRY RPC ─────────────────────────────────────────────────────
  const migRpc = read("supabase/migrations/20261228000100_cupping_protocol_entry_atomic.sql");
  // İKİ atomik fonksiyon: CREATE + UPDATE (ikisi de tek-txn, INVOKER, service_role-only).
  ok(/CREATE OR REPLACE FUNCTION public\.cupping_protocol_entry_create_atomic\(/.test(migRpc), "v2-rpc: entry CREATE atomik fonksiyon");
  ok(/CREATE OR REPLACE FUNCTION public\.cupping_protocol_entry_update_atomic\(/.test(migRpc), "v2-rpc: entry UPDATE atomik fonksiyon");
  ok((migRpc.match(/SECURITY INVOKER/g) ?? []).length >= 2, "v2-rpc: her iki RPC de SECURITY INVOKER (yetki yükseltmesi yok)");
  ok((migRpc.match(/SET search_path = pg_catalog, public/g) ?? []).length >= 2, "v2-rpc: her iki RPC sabit search_path");
  // CREATE fonksiyonu için REVOKE/GRANT.
  ok(/REVOKE ALL ON FUNCTION public\.cupping_protocol_entry_create_atomic\(uuid, uuid, jsonb, text\[\]\)\s*FROM PUBLIC, anon, authenticated/.test(migRpc),
    "v2-rpc: CREATE EXECUTE anon/auth/public REVOKE");
  ok(/GRANT EXECUTE ON FUNCTION public\.cupping_protocol_entry_create_atomic\(uuid, uuid, jsonb, text\[\]\)\s*TO service_role/.test(migRpc),
    "v2-rpc: CREATE EXECUTE yalnız service_role");
  // UPDATE fonksiyonu için REVOKE/GRANT.
  ok(/REVOKE ALL ON FUNCTION public\.cupping_protocol_entry_update_atomic\(uuid, uuid, jsonb, text\[\]\)\s*FROM PUBLIC, anon, authenticated/.test(migRpc),
    "v2-rpc: UPDATE EXECUTE anon/auth/public REVOKE");
  ok(/GRANT EXECUTE ON FUNCTION public\.cupping_protocol_entry_update_atomic\(uuid, uuid, jsonb, text\[\]\)\s*TO service_role/.test(migRpc),
    "v2-rpc: UPDATE EXECUTE yalnız service_role");
  for (const c of ["45001", "45002", "45003", "45004", "45005"]) ok(migRpc.includes(c), `v2-rpc: SQLSTATE ${c}`);
  ok(/id::text = v_src/.test(migRpc) && /id::text = x\.pid/.test(migRpc), "v2-rpc: source/point id::text karşılaştırması (cast paniği yok)");
  ok(/DELETE FROM public\.cupping_protocol_entry_points[\s\S]*?INSERT INTO public\.cupping_protocol_entry_points/.test(migRpc), "v2-rpc: UPDATE entry-point atomik REPLACE");
  // CREATE: entry INSERT + entry_points INSERT AYNI function gövdesinde (compensating delete DEĞİL).
  const createBody = (migRpc.split("cupping_protocol_entry_update_atomic")[0] ?? "");
  ok(/INSERT INTO public\.cupping_protocol_entries[\s\S]*?INSERT INTO public\.cupping_protocol_entry_points/.test(createBody),
    "v2-rpc: CREATE entry + entry_points AYNI function body (tek txn; compensating delete YOK)");
  ok(/cupping_entry_protocol_not_owned[\s\S]*?45001/.test(createBody) &&
     /p\.tenant_id = p_tenant_id AND p\.id::text = x\.pid/.test(createBody) &&
     /cupping_entry_source_not_owned/.test(createBody),
    "v2-rpc: CREATE txn-içi protocol/point/source sahiplik doğrulaması (RAISE → tam rollback)");
  ok(/GROUP BY x\.pid/.test(createBody), "v2-rpc: CREATE point_ids dedup (GROUP BY; duplicate junction YOK)");

  // ── V2-C) API STATIC + OWNERSHIP + DETACH + ATOMICITY ──────────────────────────
  const rProtocols = read("app/api/kupa/protocols/route.ts");
  ok(/PROTOCOL_WRITABLE/.test(rProtocols) && /pickWritable/.test(rProtocols), "v2-api: protocols POST pickWritable(PROTOCOL_WRITABLE)");
  const rProtocolsId = read("app/api/kupa/protocols/[id]/route.ts");
  ok(/deleteEntity\(db, CUPPING_TABLES\.protocols/.test(rProtocolsId) && /CASCADE/.test(rProtocolsId), "v2-api: protocol delete (çocuklar DB CASCADE)");

  const rPP = read("app/api/kupa/protocol-points/route.ts");
  ok(/assertOwnedRef\(db, CUPPING_TABLES\.protocols/.test(rPP) && /assertOwnedRef\(db, CUPPING_TABLES\.points/.test(rPP), "v2-own: protocol-points POST protocol+point tenant doğrulaması");
  ok(/assertCompositeRef\(db, CUPPING_TABLES\.protocolPoints/.test(rPP) && /409/.test(rPP), "v2-own: protocol-points duplicate → 409");
  const rPT = read("app/api/kupa/protocol-techniques/route.ts");
  ok(/assertOwnedRef\(db, CUPPING_TABLES\.techniques/.test(rPT), "v2-own: protocol-techniques POST technique tenant doğrulaması");
  const rPS = read("app/api/kupa/protocol-safety/route.ts");
  ok(/assertOwnedRef\(db, CUPPING_TABLES\.safety/.test(rPS), "v2-own: protocol-safety POST safety tenant doğrulaması");
  const rPSrc = read("app/api/kupa/protocol-sources/route.ts");
  ok(/assertOwnedRef\(db, CUPPING_TABLES\.sources/.test(rPSrc), "v2-own: protocol-sources POST source tenant doğrulaması");

  const rPPId = read("app/api/kupa/protocol-points/[id]/route.ts");
  ok(/"23503"/.test(rPPId) && /409/.test(rPPId), "v2-detach: protocol-point silme step referanslıysa → 409 (kör 500 değil)");
  const rPTId = read("app/api/kupa/protocol-techniques/[id]/route.ts");
  ok(/"23503"/.test(rPTId) && /409/.test(rPTId), "v2-detach: protocol-technique silme step referanslıysa → 409");

  const rStep = read("app/api/kupa/protocol-steps/route.ts");
  ok(/assertCompositeRef\(db, CUPPING_TABLES\.protocolPoints/.test(rStep) && /assertCompositeRef\(db, CUPPING_TABLES\.protocolTechniques/.test(rStep),
    "v2-step: POST ref_point/ref_technique protokol-üyeliği API'de doğrulanır");
  const rStepId = read("app/api/kupa/protocol-steps/[id]/route.ts");
  ok(/assertCompositeRef\(db, CUPPING_TABLES\.protocolPoints/.test(rStepId), "v2-step: PATCH ref güncellemesi protokol-üyeliği doğrular");
  ok(!(PROTOCOL_STEP_META_WRITABLE as readonly string[]).includes("protocol_id"), "v2-step: PATCH allowlist protocol_id IMMUTABLE");

  const rEntry = read("app/api/kupa/protocol-entries/route.ts");
  // POST = TEK atomik create RPC. compensating-delete / çok-adımlı direct insert anti-pattern YASAK.
  ok(/cupping_protocol_entry_create_atomic/.test(rEntry), "v2-entry: POST tek atomik create RPC");
  ok(!/compensating/i.test(rEntry) &&
     !/\.from\(CUPPING_TABLES\.protocolEntryPoints\)\s*\.insert/.test(rEntry) &&
     !/insertEntity\(db, CUPPING_TABLES\.protocolEntries/.test(rEntry),
    "v2-entry: POST compensating-delete / çok-adımlı direct entry+points insert anti-pattern YOK");
  ok(/45005/.test(rEntry) && /45003/.test(rEntry), "v2-entry: POST source/point sahiplik SQLSTATE map (45003/45005)");
  const rEntryId = read("app/api/kupa/protocol-entries/[id]/route.ts");
  ok(/cupping_protocol_entry_update_atomic/.test(rEntryId) && !/updateEntity/.test(rEntryId), "v2-entry: PATCH atomik RPC (updateEntity anti-pattern YOK)");
  ok(/45005/.test(rEntryId), "v2-entry: PATCH source-not-owned (45005) map");

  // ── V2-D) UNIFIED BİLGİLER + MASS-ASSIGN + LEGACY İZOLASYONU ────────────────────
  ok((PROTOCOL_ENTRY_WRITABLE as readonly string[]).includes("source_id") &&
     (PROTOCOL_ENTRY_WRITABLE as readonly string[]).includes("content") &&
     (PROTOCOL_ENTRY_WRITABLE as readonly string[]).includes("source_label"),
    "v2-bilgiler: entry unified (content + opsiyonel source_id + source_label TEK sınıf; formal/personal ayrımı YOK)");
  ok((PROTOCOL_POINT_WRITABLE as readonly string[]).includes("protocol_id") && (PROTOCOL_POINT_WRITABLE as readonly string[]).includes("point_id"), "v2-fields: protocol_points POST allowlist FK dahil");
  ok((PROTOCOL_STEP_WRITABLE as readonly string[]).includes("protocol_id") && (PROTOCOL_STEP_WRITABLE as readonly string[]).includes("body"), "v2-fields: protocol_steps POST allowlist");
  ok(!(PROTOCOL_WRITABLE as readonly string[]).includes("tenant_id") && !(PROTOCOL_WRITABLE as readonly string[]).includes("id"), "v2-mass: PROTOCOL_WRITABLE tenant_id/id içermez");
  ok(!(PROTOCOL_POINT_META_WRITABLE as readonly string[]).includes("protocol_id") && !(PROTOCOL_POINT_META_WRITABLE as readonly string[]).includes("point_id"), "v2-mass: protocol_points META FK immutable");
  ok(!(PROTOCOL_TECHNIQUE_META_WRITABLE as readonly string[]).includes("technique_id"), "v2-mass: protocol_techniques META FK immutable");
  ok(!(PROTOCOL_SAFETY_META_WRITABLE as readonly string[]).includes("safety_id"), "v2-mass: protocol_safety META FK immutable");
  ok(!(PROTOCOL_SOURCE_META_WRITABLE as readonly string[]).includes("source_id"), "v2-mass: protocol_sources META FK immutable");
  ok(CUPPING_TABLES.protocols === "cupping_protocols" && CUPPING_TABLES.topics === "cupping_topics", "v2-legacy: protocols AYRI tablo; legacy topics korunur");
  ok(!Object.prototype.hasOwnProperty.call(CITATION_SPECS, "protocol"), "v2-legacy: protocol legacy citation ağacına EKLENMEDİ");

  // ══════════════════════════════════════════════════════════════════════════
  // FAZ 2 — Hacamat Protokolleri UI (kontrat). Legacy amac-rehberi DEĞİŞMEZ.
  // ══════════════════════════════════════════════════════════════════════════
  const exists = (p: string) => { try { statSync(p); return true; } catch { return false; } };

  // ── FAZ2-A) Canonical route'lar var; legacy amac-rehberi korunur ────────────────
  ok(exists("app/kupa/protokoller/page.tsx"), "faz2-route: /kupa/protokoller liste");
  ok(exists("app/kupa/protokoller/yeni/page.tsx"), "faz2-route: /kupa/protokoller/yeni");
  ok(exists("app/kupa/protokoller/[id]/page.tsx"), "faz2-route: /kupa/protokoller/[id]");
  ok(exists("app/kupa/protokoller/[id]/loading.tsx") && exists("app/kupa/protokoller/loading.tsx"), "faz2-route: loading.tsx (liste + [id])");
  ok(exists("app/kupa/amac-rehberi/page.tsx") && exists("app/kupa/amac-rehberi/[topicId]/page.tsx"), "faz2-legacy: amac-rehberi route'ları KORUNUR");

  const pApi = read("app/kupa/lib/api.ts");
  const pList = read("app/kupa/protokoller/page.tsx");
  const pNew = read("app/kupa/protokoller/yeni/page.tsx");
  const pDoc = read("app/kupa/protokoller/[id]/ProtocolDocumentClient.tsx");
  const pRel = read("app/kupa/protokoller/components/RelationSection.tsx");
  const pSteps = read("app/kupa/protokoller/components/StepsSection.tsx");
  const pEntries = read("app/kupa/protokoller/components/EntriesSection.tsx");
  const pPicker = read("app/kupa/protokoller/components/MasterPickerDialog.tsx");
  const pHook = read("app/kupa/protokoller/hooks/useProtocolDocument.ts");
  const pListHook = read("app/kupa/protokoller/hooks/useProtocolList.ts");
  const pCard = read("app/kupa/protokoller/components/ProtocolListCard.tsx");
  const pInline = read("app/kupa/protokoller/components/InlineLongText.tsx");
  const pSources = read("app/kupa/protokoller/components/SourcesSection.tsx");
  const pQuick = read("app/kupa/protokoller/components/QuickCreateMasterForm.tsx");
  const newFiles = [pList, pNew, pDoc, pRel, pSteps, pEntries, pPicker, pCard].join("\n\n");

  // ── FAZ2-B) CLIENT wrappers (V2 additive; legacy korunur) ──────────────────────
  for (const fn of ["listProtocols", "createProtocol", "getProtocol", "updateProtocol", "deleteProtocol",
    "listProtocolPoints", "addProtocolPoint", "deleteProtocolPoint", "listProtocolSteps", "addProtocolStep",
    "listProtocolEntries", "createProtocolEntry", "updateProtocolEntry", "deleteProtocolEntry",
    "listProtocolSources", "addProtocolSource"]) {
    ok(new RegExp(`export const ${fn}\\b`).test(pApi), `faz2-client: ${fn}`);
  }
  ok(/export const listTopics\b/.test(pApi) && /export const listTopicNotes\b/.test(pApi), "faz2-client: legacy wrapper'lar KORUNUR");
  ok(/point_ids/.test(pApi) && /createProtocolEntry[\s\S]*?point_ids/.test(pApi), "faz2-entry: create/update wrappers point_ids taşır");

  // ── FAZ2-C) UX kontratı ────────────────────────────────────────────────────────
  ok(!/Gelişmiş Düzenleme/.test(newFiles), "faz2-ux: global 'Gelişmiş Düzenleme' mod YOK (section-level edit)");
  ok(/ProtocolSectionShell/.test(pDoc) || /RelationSection/.test(pDoc), "faz2-ux: section-level bileşen mimarisi");
  ok(/useConfirm/.test(pDoc) && /deleteProtocol\(/.test(pDoc), "faz2-delete: protokol silme useConfirm");
  ok(/useConfirm/.test(pList) && /deleteProtocol\(/.test(pList), "faz2-delete: liste kartı silme useConfirm");
  ok(/useConfirm/.test(pRel) && /useConfirm/.test(pSteps) && /useConfirm/.test(pEntries), "faz2-delete: child (relation/step/entry) silme useConfirm");
  ok(/useToast/.test(pDoc) && /useToast/.test(pRel) && /useToast/.test(pEntries), "faz2-ux: useToast bildirimleri");

  // Unified Bilgiler: tek başlık; "Notlarım"/"Kaynaklar Ne Diyor?"/formal-personal badge YOK.
  ok(/title="Bilgiler"|"Bilgiler"/.test(pEntries), "faz2-bilgiler: tek 'Bilgiler' başlığı");
  ok(!/Notlar[ıi]m/.test(newFiles) && !/Kaynaklar Ne Diyor/.test(newFiles), "faz2-bilgiler: 'Notlarım'/'Kaynaklar Ne Diyor?' YOK");
  ok(!/Kişisel Not|formal kayıt|Formal Bilgi/i.test(newFiles), "faz2-bilgiler: formal/personal discriminator badge YOK");

  // Mobil tam CRUD + full-screen editör + edge-to-edge.
  ok(/fullBleedBelowLg/.test(pList) && /fullBleedBelowLg/.test(pNew) && /fullBleedBelowLg/.test(pDoc), "faz2-mobile: fullBleedBelowLg edge-to-edge");
  ok(/BigNoteEditorDialog/.test(pInline) && /lg:hidden/.test(pInline) && /hidden lg:block/.test(pInline), "faz2-mobile: uzun metin <1024 full-screen editör + desktop inline");
  // PrepSection (Hazırlık/Sonrası/Takip) 3 uzun-metin alanı InlineLongText → BigNoteEditorDialog
  // full-screen path'ine ULAŞMALI (owner UAT blocker'ı buradaydı). Ham <textarea> KULLANMAZ.
  const pPrep = read("app/kupa/protokoller/components/PrepSection.tsx");
  ok(/InlineLongText/.test(pPrep) && (pPrep.match(/<InlineLongText\b/g) || []).length >= 3 && !/<textarea\b/.test(pPrep),
    "faz2-mobile: PrepSection 3 alan (prep/after/follow) InlineLongText full-screen path'i kullanır (ham textarea YOK)");
  ok(!/Rehbere Dön|Geri Dön|floating.*back/i.test(newFiles), "faz2-nav: özel geri/floating-back butonu YOK");

  // FAZ 3A: quick-create ARTIK VAR (technique/safety) — ama YALNIZ gerçek create+attach,
  // sahte/disabled CTA değil. Point quick-create HÂLÂ YOK (aşağıda faz3a-point-exclude).

  // ── FAZ2-D) N+1 HARD GATE ──────────────────────────────────────────────────────
  ok(!/listProtocolPoints|listProtocolTechniques|listProtocolSafety/.test(pList) && !/listProtocol/.test(pCard),
    "faz2-n+1: liste/kart per-kart relation fetch YAPMAZ ('N bölge' sayacı OMIT)");
  ok(!/listPoints\(|listTechniques\(|listSafety\(|listSources\(/.test(pRel) &&
     !/listPoints\(|listTechniques\(/.test(pSteps) &&
     !/listPoints\(|listSources\(/.test(pEntries),
    "faz2-n+1: section bileşenleri master GET yapmaz (doc.master* map kullanır)");
  ok(/listPoints\(\)/.test(pHook) && /listTechniques\(\)/.test(pHook) && /listSafety\(\)/.test(pHook) && /listSources\(\)/.test(pHook) && /Promise\.all/.test(pHook),
    "faz2-n+1: useProtocolDocument master listelerini TEK KEZ (Promise.all) yükler");
  ok(/new Map\(/.test(pHook) && /pointName|pointMap/.test(pHook), "faz2-n+1: master isim çözümü Map ile (loop-içi GET yok)");
  ok(!/listProtocolPoints/.test(pListHook), "faz2-n+1: liste hook'u relation yüklemez");

  // ── FAZ2-E) ENTRY atomik tüketimi (optimistic YOK) ─────────────────────────────
  ok(/createProtocolEntry\(|updateProtocolEntry\(/.test(pEntries) && /doc\.reload\.entries\(\)/.test(pEntries),
    "faz2-entry: create/update sonrası server canonical yeniden çekilir (optimistic YOK)");
  // Kaynak OPSİYONEL — FAZ 3A sade akış: serbest metin (source_label) birincil; ayrı <select>
  // katalog picker KALDIRILDI. Mevcut source_id bağlı entry düzenlenebilir (chip + Kaldır).
  ok(/source_label/.test(pEntries) && /kimden öğrendim/i.test(pEntries) && !/<select/.test(pEntries),
    "faz2-entry: kaynak OPSİYONEL + sade serbest metin (ayrı katalog <select> YOK)");

  // ── FAZ2-F) STEP membership UI ─────────────────────────────────────────────────
  ok(/doc\.points\.map/.test(pSteps) && /doc\.techniques\.map/.test(pSteps),
    "faz2-step: ref_point/ref_technique seçenekleri YALNIZ protokole-bağlı (doc.points/doc.techniques)");
  ok(!/masterPoints\.map[\s\S]{0,80}ref_point|doc\.masterPoints[\s\S]{0,120}Bağlı bölge/.test(pSteps),
    "faz2-step: step ref dropdown master listeden DOĞRUDAN seçtirmez");

  // ── FAZ2-G) Picker erişilebilirlik ─────────────────────────────────────────────
  ok(/role="dialog"/.test(pPicker) && /aria-modal="true"/.test(pPicker) && /Escape/.test(pPicker) && /min-h-\[44px\]/.test(pPicker),
    "faz2-a11y: MasterPickerDialog dialog/aria/Escape/44px");

  // ══ FAZ 3A) MASTER QUICK-CREATE + SADE KAYNAK ════════════════════════════════════

  // A) Picker gerçek-viewport portal (BigNoteEditorDialog ile aynı çözülen sınıf).
  ok(/from "react-dom"/.test(pPicker) && /createPortal\(/.test(pPicker) && /document\.body/.test(pPicker),
    "faz3a-portal: MasterPickerDialog createPortal(document.body) ile ata containing-block tuzağını AŞAR");
  ok(/document\.body\.style\.overflow/.test(pPicker) && /fixed inset-0/.test(pPicker) && /h-\[100dvh\]/.test(pPicker),
    "faz3a-portal: picker body-scroll-lock + fixed inset-0 + 100dvh (gerçek tam-ekran)");
  ok(/typeof document === "undefined"/.test(pPicker),
    "faz3a-portal: picker SSR guard (document yoksa null)");

  // B) Tek surface pick⇄create mode (nested modal YOK).
  ok(/"pick"/.test(pPicker) && /"create"/.test(pPicker) && /quickCreate/.test(pPicker),
    "faz3a-picker: tek surface pick⇄create mode + quickCreate prop (nested modal YOK)");
  ok(/QuickCreateMasterForm/.test(pPicker), "faz3a-picker: create view paylaşılan QuickCreateMasterForm kullanır");

  // C) Quick-create form YALNIZ technique + safety (discriminated union) — point/createPoint YOK.
  ok(/"technique"/.test(pQuick) && /"safety"/.test(pQuick), "faz3a-form: quick-create technique + safety");
  ok(!/"point"/.test(pQuick) && !/createPoint/.test(pQuick), "faz3a-form: quick-create form point İÇERMEZ");

  // D) TR enum eşlemeleri + kod GÖSTERİLMEZ (enum sadece value; UI label Türkçe).
  ok(/dry/.test(pQuick) && /wet/.test(pQuick) && /stationary/.test(pQuick) && /gliding/.test(pQuick) && /flash/.test(pQuick),
    "faz3a-enum: technique_type/movement_style enum value'ları mevcut");
  ok(/Kuru Kupa/.test(pQuick) && /Yaş Kupa/.test(pQuick) && /Sabit/.test(pQuick) && /Kaydırmalı/.test(pQuick),
    "faz3a-enum: technique UI Türkçe etiketler (kod değil)");
  ok(/"info"/.test(pQuick) && /"warning"/.test(pQuick) && /"contraindication"/.test(pQuick) && /Bilgi/.test(pQuick) && /Uyarı/.test(pQuick) && /Kontrendikasyon/.test(pQuick),
    "faz3a-enum: safety severity enum + Türkçe etiketler");
  // severity !== contraindication → contraindication_class DAİMA null.
  ok(/severity === "contraindication" \? contraClass \|\| null : null/.test(pQuick),
    "faz3a-safety: severity kontrendikasyon değilse contraindication_class temizlenir (null)");

  // E) Advisory duplicate — TR-fold normalize (NFKC + tr-lower), agresif değil.
  ok(/normalize\("NFKC"\)/.test(pQuick) && /toLocaleLowerCase\("tr-TR"\)/.test(pQuick),
    "faz3a-dup: normalizeMasterName NFKC + tr-lower");
  ok(/Mevcut Kaydı Kullan/.test(pQuick) && /Yine de Oluştur/.test(pQuick) && /!duplicate \?/.test(pQuick),
    "faz3a-dup: dup varken sessiz create YOK (Mevcut Kaydı Kullan / Yine de Oluştur; birincil oluştur gizli)");

  // F) create → attach orchestration (technique + safety).
  ok(/createTechnique\(/.test(pRel) && /addProtocolTechnique\(/.test(pRel) &&
     /createSafety\(/.test(pRel) && /addProtocolSafety\(/.test(pRel),
    "faz3a-attach: technique/safety create→immediate attach wired");
  // demo/null id → attach YAPMA.
  ok(/!created \|\| !created\.id/.test(pRel), "faz3a-demo: created id yoksa (demo) attach YAPMAZ");
  // create OK / attach FAIL → master rollback YOK (compensating delete YOK).
  ok(!/deleteTechnique\(/.test(pRel) && !/deleteSafety\(/.test(pRel),
    "faz3a-consistency: attach fail'de master rollback/compensating-delete YOK (standalone entity)");
  // targeted master refresh (full reload YOK).
  ok(/reload\.masterTechniques\(\)/.test(pRel) && /reload\.masterSafety\(\)/.test(pRel) && !/reload\.all\(/.test(pRel),
    "faz3a-refresh: quick-create sonrası hedefli master refresh (reload.all YOK)");

  // G) POINT hard exclusion.
  ok(!/entity: "point"/.test(pRel) && !/createPoint\(/.test(pRel), "faz3a-point-exclude: RelationSection point quick-create YOK");
  ok(!/quickCreate/.test(pEntries) && !/createPoint\(/.test(pEntries), "faz3a-point-exclude: EntriesSection point picker quickCreate ALMAZ");
  ok(!/createPoint\(/.test([pRel, pEntries, pSources, pQuick, pPicker].join("\n")),
    "faz3a-point-exclude: FAZ3 quick-create yollarının HİÇBİRİ createPoint çağırmaz");

  // H) Hook targeted master reload (N+1 yok).
  ok(/reloadMasterTechniques/.test(pHook) && /reloadMasterSafety/.test(pHook) && /reloadMasterSources/.test(pHook),
    "faz3a-n+1: useProtocolDocument hedefli master reload sağlar (full reload spam YOK)");
  ok(!/listPoints\(|listTechniques\(|listSafety\(|listSources\(/.test(pSources),
    "faz3a-n+1: SourcesSection loop/section master GET yapmaz");

  // I) SADE KAYNAK — SourcesSection: serbest metin, katalog picker/bibliyografik metadata YOK.
  ok(/Kimden öğrendim/.test(pSources) && !/<select/.test(pSources),
    "faz3a-source: sade 'Kaynak / Kimden öğrendim' serbest metin (ayrı katalog <select> YOK)");
  ok(!/author_or_organization|publication|identifier|source_type|\blanguage\b/.test(pSources),
    "faz3a-source: bibliyografik metadata (yazar/yayın/identifier/tür/dil) UI'da YOK");
  ok(/createSource\(/.test(pSources) && /source_name: text/.test(pSources) && /normalizeMasterName/.test(pSources),
    "faz3a-source: exact-normalized reuse veya arka planda minimal source create (source_name)");
  ok(/datalist/.test(pSources), "faz3a-source: autocomplete datalist (öneri; seçime ZORLAMAZ)");
  ok(/!created \|\| !created\.id/.test(pSources), "faz3a-source: demo/null id → attach YAPMAZ");

  // J) SADE KAYNAK — EntriesSection: serbest metin + datalist + mevcut source_id chip korunur.
  ok(/list="kupa-entry-source-suggestions"/.test(pEntries) && /datalist/.test(pEntries),
    "faz3a-entry-source: serbest metin + autocomplete datalist");
  ok(/draft\.source_id \?/.test(pEntries) && /Kaldır/.test(pEntries),
    "faz3a-entry-source: mevcut kayıtlı kaynak (source_id) chip + Kaldır ile korunur/temizlenir");

  console.log(`\ncupping-module harness: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log("Başarısızlar:", fails);
    process.exit(1);
  }
  console.log("✅ Kupa & Hacamat — gate/tenant/güvenli-hata + RLS + harita registry + transfer additive geçti.");
}

run();
