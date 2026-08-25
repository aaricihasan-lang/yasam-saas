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

  // ══ L) SADE OKUMA MODU — FORMAL kaynak-karşılaştırma (DB'den; hard-code YOK) ══════
  ok(/Gelişmiş Düzenleme/.test(amac) && /Okuma Modu/.test(amac),
    "read[ui]: Gelişmiş Düzenleme toggle (okuma modu default)");
  ok(/İlişkili Bölgeler/.test(amac), "read[ui]: 'İlişkili Bölgeler' bölümü");
  ok(/Kaynaklar Ne Diyor\?/.test(amac), "read[ui]: 'Kaynaklar Ne Diyor?' bölümü");
  ok(/new Set\([\s\S]{0,90}source_id/.test(amac),
    "read[ui]: formal kaynak sayısı DISTINCT source_id (Set) — aynı kaynak tekrarı şişmez");
  ok(/rr\.count >= 2/.test(amac), "read[ui]: yalnız >=2 formal kaynaklı bölgede sayı gösterilir");
  ok(/\{rr\.count\}[\s\S]{0,20}kaynakta geçiyor/.test(amac),
    "read[ui]: 'N kaynakta geçiyor' DİNAMİK (hard-code değil)");
  ok(/for \(const ts of topicSources\)/.test(amac),
    "read[ui]: kaynak kartları topic-source'lı DISTINCT source'lardan OTOMATİK türer");
  ok(/SOURCE_TYPE_LABEL\[/.test(amac) && /expert_educational[\s\S]{0,24}Uzman/.test(amac),
    "read[ui]: source_type rozetle resolve (expert_educational→Uzman/Eğitim)");
  ok(!/Zakir Benli|Süleyman Gök|Hacamat 2\b/.test(amac),
    "read[ui]: sabit kaynak ADI hard-code YOK (DB'den çözülür)");
  ok(!/[23] kaynakta geçiyor/.test(amac.replace(/\{[^}]*\}/g, "")),
    "read[ui]: sabit kaynak SAYISI hard-code YOK");
  ok(!/Önerilen Uygulama Sırası|Önerilen Sıra/.test(amac),
    "read[ui]: kaynakları birleştiren global 'uygulama sırası' ÜRETİLMEZ");

  // ══ M) KULLANICI NOTLARI — formal citation'dan AYRI katman ══════════════════════
  ok(/Notlarım/.test(amac), "note[ui]: 'Notlarım' bölümü (formal kaynaklardan ayrı)");
  ok(/\+ Yeni Bilgi \/ Not Ekle/.test(amac), "note[ui]: '+ Yeni Bilgi / Not Ekle'");
  ok(/Kendi Notum/.test(amac), "note[ui]: source_label boşsa 'Kendi Notum'");
  ok(/createTopicNote\(/.test(amac) && /updateTopicNote\(/.test(amac) && /deleteTopicNote\(/.test(amac),
    "note[ui]: not create/edit/delete gerçek API'ye bağlı");
  ok(/listTopicNotes\(/.test(amac), "note[ui]: notlar DB'den okunur (listTopicNotes)");
  ok(/relSourceCount[\s\S]{0,120}relCitations/.test(amac),
    "note[semantik]: formal 'N kaynakta geçiyor' relCitations'tan (FORMAL); notlar bu sayıyı ETKİLEMEZ");
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
  // Mobile/tablet: kart viewport'a sıfır (negatif gutter shell padding'i iptal) + köşesiz.
  ok(/-mx-4/.test(yeni) && /sm:-mx-6/.test(yeni) && /lg:mx-0/.test(yeni),
    "yeniux[resp]: mobile/tablet edge-to-edge (negatif gutter), lg reset");
  ok(/border-y/.test(yeni) && /lg:rounded-2xl/.test(yeni),
    "yeniux[resp]: mobile köşesiz (border-y), desktop rounded-2xl premium kart");
  // BigNoteEditorDialog responsive: mobile 100dvh doldur / desktop 80vh ortalı.
  ok(/100dvh/.test(dialog) && /sm:h-\[80vh\]/.test(dialog),
    "yeniux[resp]: editör mobile 100dvh doldurur / desktop 80vh");
  ok(/p-0 sm:items-center sm:p-6/.test(dialog) && /sm:rounded-2xl/.test(dialog),
    "yeniux[resp]: editör mobile kenara sıfır (p-0, köşesiz), desktop ortalı/rounded");

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

  // 12) PATCH atomiklik (topic-notes/[id]) — insert başarısızsa eski bağlar RESTORE.
  ok(/prevRows/.test(notesItem) && /geri yükle/i.test(notesItem) &&
     /if \(prevRows\.length > 0\)[\s\S]{0,80}\.insert\(prevRows\)/.test(notesItem),
    "note[api]: PATCH point_ids replace — insert başarısızsa eski bağlar RESTORE (partial state yok)");

  console.log(`\ncupping-module harness: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log("Başarısızlar:", fails);
    process.exit(1);
  }
  console.log("✅ Kupa & Hacamat — gate/tenant/güvenli-hata + RLS + harita registry + transfer additive geçti.");
}

run();
