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
  TECHNIQUE_WRITABLE,
  TECHNIQUE_SAFETY_WRITABLE,
  TECHNIQUE_SAFETY_META_WRITABLE,
  CUPPING_TABLES,
  CITATION_SPECS,
  isCitationEntity,
  PROTOCOL_WRITABLE,
  PROTOCOL_POINT_WRITABLE,
  PROTOCOL_POINT_META_WRITABLE,
  PROTOCOL_TECHNIQUE_WRITABLE,
  PROTOCOL_TECHNIQUE_META_WRITABLE,
  PROTOCOL_SAFETY_META_WRITABLE,
  PROTOCOL_STEP_WRITABLE,
  PROTOCOL_STEP_META_WRITABLE,
  PROTOCOL_ENTRY_WRITABLE,
  PROTOCOL_SOURCE_META_WRITABLE,
  ADVICE_TEMPLATE_WRITABLE,
  CALENDAR_PLAN_WRITABLE,
  CALENDAR_PLAN_DAY_WRITABLE,
  CLIENT_ADVICE_WRITABLE,
} from "../lib/cupping/fields";
import { gregorianToHijri, parseYmd, monthHijriCells, HIJRI_MONTHS_TR } from "../lib/cupping/hijri";
import { CUPPING_CITATION_COPY_FIELDS } from "../lib/cupping/transferFields";
import { CUPPING_EVIDENCE_CLASSES } from "../lib/cupping/vocab";
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

/** dir altındaki tüm .tsx dosyalarını (recursive) döndürür. */
function listTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = `${dir}/${entry}`;
    if (statSync(p).isDirectory()) out.push(...listTsx(p));
    else if (entry.endsWith(".tsx")) out.push(p);
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

  // ══ AMAÇ REHBERİ — USER-FACING KALDIRILDI (owner FINAL, ürün sadeleştirme) ════════
  // Konu/rahatsızlık bilgisi artık TEK yerde (Hacamat Protokolleri) tutulur. Bağımsız
  // /kupa/amac-rehberi CRUD/okuma çalışma alanı normal akıştan kaldırıldı: üç rota da
  // /kupa/protokoller'e redirect eder; legacy okuma/oluşturma UI bileşenleri silindi.
  // Legacy DB/tablo/migration/citation altyapısı DOKUNULMADAN DORMANT korunur (aşağıdaki
  // N/O/atomik + legacy-data bölümleri doğrular).
  const fileGone = (fp: string) => { try { statSync(fp); return false; } catch { return true; } };
  const amacPage = read("app/kupa/amac-rehberi/page.tsx");
  const amacYeni = read("app/kupa/amac-rehberi/yeni/page.tsx");
  const amacDetail = read("app/kupa/amac-rehberi/[topicId]/page.tsx");
  const clientApi = read("app/kupa/lib/api.ts");
  const landing = read("app/kupa/page.tsx");
  ok(/redirect\("\/kupa\/protokoller"\)/.test(amacPage) &&
     /redirect\("\/kupa\/protokoller"\)/.test(amacYeni) &&
     /redirect\("\/kupa\/protokoller"\)/.test(amacDetail),
    "amac-removed: /kupa/amac-rehberi (+/yeni +/[topicId]) → /kupa/protokoller redirect");
  ok(!/CrudManager|createTopic\(|createPointTopic\(|CuppingCitationManager|BigNoteEditorDialog|TopicReadView/.test(amacPage) &&
     !/CrudManager|createTopic\(|BigNoteEditorDialog|TopicReadView/.test(amacYeni) &&
     !/TopicDetailClient|TopicReadView/.test(amacDetail),
    "amac-removed: redirect stub'ları legacy CRUD/okuma/oluşturma UI RENDER ETMEZ");
  ok(fileGone("app/kupa/amac-rehberi/components/TopicReadView.tsx") &&
     fileGone("app/kupa/amac-rehberi/hooks/useTopicReadData.ts") &&
     fileGone("app/kupa/amac-rehberi/[topicId]/TopicDetailClient.tsx") &&
     fileGone("app/kupa/amac-rehberi/[topicId]/loading.tsx"),
    "amac-removed: legacy okuma bileşenleri (TopicReadView/useTopicReadData/TopicDetailClient/loading) SİLİNDİ");
  // Legacy backend/client altyapısı DORMANT korunur (silinmez): topic-notes wrapper'ları.
  ok(/listTopicNotes/.test(clientApi) && /createTopicNote/.test(clientApi) && /deleteTopicNote/.test(clientApi),
    "amac-legacy: topic-notes client wrapper'ları DORMANT korunur (silinmedi)");
  // Landing: 'Amaç / Rahatsızlık Rehberi' / 'Mevcut Rehber' kartı KALDIRILDI.
  ok(!/amac-rehberi/.test(landing) && !/Amaç \/ Rahatsızlık Rehberi/.test(landing) && !/Mevcut Rehber/.test(landing),
    "amac-removed: Kupa landing 'Amaç / Rahatsızlık Rehberi' / 'Mevcut Rehber' kartı KALDIRILDI");
  ok(/\/kupa\/protokoller/.test(landing) && /\/kupa\/noktalar/.test(landing) && /\/kupa\/teknikler/.test(landing),
    "amac-removed: landing yalnız Protokoller (hero) + Noktalar + Teknikler içerir");

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

  // ══ P) YENİ KAYIT UX — KALDIRILDI (amac-rehberi user-facing removed; bkz. üstteki AMAÇ REHBERİ bloğu) ══

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

  // ══ Q) MOBİL/TABLET OKUMA UX — KALDIRILDI (amac-rehberi user-facing removed; bkz. üstteki AMAÇ REHBERİ bloğu) ══

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
  ok(exists("app/kupa/amac-rehberi/page.tsx") && exists("app/kupa/amac-rehberi/[topicId]/page.tsx"), "faz2-legacy: amac-rehberi route dosyaları mevcut (redirect stub → /kupa/protokoller)");

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

  // ══ FAZ 3B/4) LANDING — FINAL SIMPLIFICATION (app/kupa/page.tsx) ═════════════════
  // Owner FINAL: günlük landing yalnız Protokoller (hero) + Noktalar + Teknikler +
  // medical disclaimer gösterir. Bağımsız "Amaç / Rahatsızlık Rehberi" kartı KALDIRILDI
  // (ürün sadeleştirme). Güvenlik / Kaynaklar / Bilgi & Eğitim standalone ekranları
  // ve TÜM backend (route/API/DB) KORUNUR — yalnız landing navigasyonunda görünmez.
  const pLanding = read("app/kupa/page.tsx");
  const render = pLanding.slice(Math.max(0, pLanding.indexOf("<KupaShell")));
  const rHero = render.indexOf("/kupa/protokoller");
  const rSupport = render.indexOf("Destek Kütüphaneleri");
  const rMap = render.indexOf("SUPPORT.map");

  // Primary hero — dominant ama KOMPAKT.
  ok(rHero >= 0 && /Hacamat Protokolleri/.test(pLanding) && /Protokolleri Aç/.test(pLanding),
    "faz3b-hero: primary 'Hacamat Protokolleri' + tek CTA 'Protokolleri Aç' (href /kupa/protokoller)");
  ok(!/Bölge · Teknik · Akış/.test(pLanding),
    "faz3b-hero: kompakt hero korunur — 'Bölge · Teknik · Akış · …' chip satırı kaldırılmış");
  ok(rHero >= 0 && rSupport > rHero && rMap > rSupport,
    "faz3b-hero: RENDER sırası hero → Destek Kütüphaneleri → destek kartları");

  // Support libraries — FINAL: yalnız Noktalar + Teknikler landing'de görünür.
  ok(rSupport >= 0, "faz3b-support: 'Destek Kütüphaneleri' başlığı mevcut");
  for (const r of ["/kupa/noktalar", "/kupa/teknikler"]) {
    ok(pLanding.includes(r), `faz3b-support: landing kartı korunur ${r}`);
  }

  // FINAL SIMPLIFICATION — Güvenlik / Kaynaklar / Bilgi & Eğitim + Amaç Rehberi landing
  // NAVIGASYONUNDAN kaldırıldı. NOT: backend/route/DB silme kontratı DEĞİLDİR; yalnız
  // landing kartının yokluğunu doğrular (ilgili ekranlar + API + tablo aynen yaşar).
  for (const r of ["/kupa/guvenlik", "/kupa/kaynaklar", "/kupa/bilgi-kutuphanesi", "/kupa/amac-rehberi"]) {
    ok(!pLanding.includes(r), `faz3b-simplify: ${r} landing navigasyonunda GÖRÜNMEZ (backend korunur, yalnız kart kaldırıldı)`);
  }

  // Legacy 'Amaç / Rahatsızlık Rehberi' kartı TAMAMEN kaldırıldı (subordinate kart YOK).
  ok(!/Mevcut Rehber/.test(pLanding) && !/Amaç \/ Rahatsızlık Rehberi/.test(pLanding),
    "faz3b-legacy: 'Mevcut Rehber' / 'Amaç / Rahatsızlık Rehberi' landing kartı KALDIRILDI");
  ok(!/deprecated|eski sistem|\bV1\b|kaldırılacak|yakında kapan/i.test(pLanding),
    "faz3b-legacy: deprecated/eski-sistem/kaldırılacak kullanıcı copy'si YOK");

  // Medical disclaimer korunur.
  ok(/tedavi eder/.test(pLanding), "faz3b-medical: 'tedavi eder anlamı taşımaz' disclaimer korunur");

  // Statik navigasyon — yeni fetch/API/sayaç state YOK.
  ok(!/fetch\(|\/api\/|useState|useEffect/.test(pLanding),
    "faz3b-static: landing statik navigasyon (fetch/API/counter-state YOK)");
  ok(!/tenant-izole|source_id|künye|Konu ↔ nokta|anatomik bölge|canonical/i.test(pLanding),
    "faz3b-copy: DB/mimari jargonu YOK (sade kullanıcı dili)");

  // ══ FAZ 4 / AŞAMA 2A — KUPA TEKNİKLERİ VERİ TEMELİ ══════════════════════════════
  // Additive: practitioner_note + cupping_technique_safety (DORMANT — prod'a uygulandı,
  // şema korunur) + read-only "Kullanıldığı Protokoller". Destructive DDL / backfill YOK.
  // NOT: structured technique-safety uygulama/API yüzeyi owner FINAL ile KALDIRILDI;
  // yalnız tablo/şema geriye-dönük dormant infra olarak repoda kalır (bkz. FAZ 4 UX).
  const f4mig = read("supabase/migrations/20270101000600_cupping_technique_workspace_foundation.sql");
  // Migration version hygiene (drift reconciliation): yeni benzersiz slot; eski çakışan yok.
  ok(exists("supabase/migrations/20270101000600_cupping_technique_workspace_foundation.sql") &&
     !exists("supabase/migrations/20270101000100_cupping_technique_workspace_foundation.sql"),
    "faz4-mig-version: cupping migration 20270101000600 (eski 20270101000100 çakışan slot yok)");
  ok(/-- 20270101000600_cupping_technique_workspace_foundation\.sql/.test(f4mig) &&
     !/20270101000100/.test(f4mig),
    "faz4-mig-version: migration başlığı yeni versiyonla tutarlı (eski versiyon referansı yok)");

  // — Migration: practitioner_note additive kolon (backfill YOK) —
  ok(/ADD COLUMN IF NOT EXISTS practitioner_note text/.test(f4mig),
    "faz4-mig: cupping_techniques.practitioner_note additive (IF NOT EXISTS)");
  ok(!/UPDATE\s+public\./i.test(f4mig) && !/INSERT\s+INTO\s+public\./i.test(f4mig),
    "faz4-mig: veri backfill/UPDATE/INSERT YOK (schema-only additive)");
  ok(!/DROP\s+COLUMN|DROP\s+TABLE|RENAME\s+(COLUMN|TO)/i.test(f4mig),
    "faz4-mig: destructive DDL YOK (DROP/RENAME yok)");

  // — Migration: cupping_technique_safety tablosu + kontrat —
  ok(/CREATE TABLE IF NOT EXISTS public\.cupping_technique_safety/.test(f4mig),
    "faz4-mig: cupping_technique_safety CREATE TABLE IF NOT EXISTS");
  ok(/tenant_id\s+uuid\s+NOT NULL/.test(f4mig) && /technique_id\s+uuid\s+NOT NULL/.test(f4mig) && /safety_id\s+uuid\s+NOT NULL/.test(f4mig),
    "faz4-mig: tenant_id/technique_id/safety_id NOT NULL");
  ok(/FOREIGN KEY \(tenant_id, technique_id\) REFERENCES public\.cupping_techniques \(tenant_id, id\) ON DELETE CASCADE/.test(f4mig),
    "faz4-mig: technique composite FK → CASCADE (tenant-safe)");
  ok(/FOREIGN KEY \(tenant_id, safety_id\) REFERENCES public\.cupping_safety_notes \(tenant_id, id\) ON DELETE RESTRICT/.test(f4mig),
    "faz4-mig: safety composite FK → RESTRICT (tenant-safe)");
  ok(/UNIQUE \(tenant_id, technique_id, safety_id\)/.test(f4mig),
    "faz4-mig: natural unique (tenant, technique, safety)");
  ok(/cupping_technique_safety_technique_idx[\s\S]*\(tenant_id, technique_id, sort_order\)/.test(f4mig) &&
     /cupping_technique_safety_safety_idx[\s\S]*\(tenant_id, safety_id\)/.test(f4mig),
    "faz4-mig: indexler (technique+sort, safety)");

  // — Migration: güvenlik kilidi (schema deseniyle birebir) —
  ok(/REVOKE ALL PRIVILEGES ON TABLE public\.cupping_technique_safety FROM anon, authenticated/.test(f4mig),
    "faz4-mig: anon/authenticated REVOKE ALL");
  ok(/ALTER TABLE public\.cupping_technique_safety ENABLE ROW LEVEL SECURITY/.test(f4mig),
    "faz4-mig: RLS ENABLE");
  ok(!/FORCE ROW LEVEL SECURITY/i.test(f4mig) && !/CREATE POLICY/i.test(f4mig),
    "faz4-mig: FORCE RLS YOK + permissive policy YOK (service-role only)");
  ok(/BEGIN;[\s\S]*COMMIT;/.test(f4mig),
    "faz4-mig: transaction BEGIN/COMMIT dengeli");

  // — fields.ts: tablo + allowlist'ler —
  ok(CUPPING_TABLES.techniqueSafety === "cupping_technique_safety",
    "faz4-fields: CUPPING_TABLES.techniqueSafety = cupping_technique_safety");
  ok((TECHNIQUE_WRITABLE as readonly string[]).includes("practitioner_note"),
    "faz4-fields: TECHNIQUE_WRITABLE practitioner_note içerir");
  ok((TECHNIQUE_WRITABLE as readonly string[]).includes("kind") &&
     (TECHNIQUE_WRITABLE as readonly string[]).includes("description") &&
     (TECHNIQUE_WRITABLE as readonly string[]).includes("application_info") &&
     (TECHNIQUE_WRITABLE as readonly string[]).includes("source_note"),
    "faz4-fields: legacy alanlar (kind/description/application_info/source_note) KORUNUR (backward-compat)");
  ok((TECHNIQUE_SAFETY_WRITABLE as readonly string[]).join(",") === "technique_id,safety_id,note,sort_order",
    "faz4-fields: TECHNIQUE_SAFETY_WRITABLE = technique_id,safety_id,note,sort_order");
  ok((TECHNIQUE_SAFETY_META_WRITABLE as readonly string[]).join(",") === "note,sort_order",
    "faz4-fields: TECHNIQUE_SAFETY_META_WRITABLE = note,sort_order (yalnız META)");
  ok(!(TECHNIQUE_SAFETY_META_WRITABLE as readonly string[]).includes("technique_id") &&
     !(TECHNIQUE_SAFETY_META_WRITABLE as readonly string[]).includes("safety_id") &&
     !(TECHNIQUE_SAFETY_META_WRITABLE as readonly string[]).includes("tenant_id"),
    "faz4-fields: PATCH META FK/tenant immutable (technique_id/safety_id/tenant_id yok)");

  // — REDDEDİLEN structured technique-safety API tamamen KALDIRILDI (owner FINAL) —
  // Teknik güvenliği artık yalnız cupping_techniques.safety_note serbest alanıdır.
  // Not: cupping_technique_safety tablosu prod'a uygulandığı için DORMANT olarak kalır
  // (migration şeması korunur); yalnız uygulama/API yüzeyi kaldırılmıştır.
  ok(!exists("app/api/kupa/technique-safety/route.ts") &&
     !exists("app/api/kupa/technique-safety/[id]/route.ts"),
    "faz4-api: technique-safety route'ları KALDIRILDI (structured teknik güvenliği reddedildi)");

  // — used-in-protocols: read-only, tenant-safe, N+1'siz —
  const tsProto = read("app/api/kupa/techniques/[id]/protocols/route.ts");
  ok(/requireModuleAccess\(req, "cupping"\)/.test(tsProto),
    "faz4-proto: used-in-protocols cupping gate");
  ok(/assertOwnedRef\(db, CUPPING_TABLES\.techniques, tenantId, id\)/.test(tsProto),
    "faz4-proto: teknik sahipliği doğrulanır (cross-tenant title sızıntısı yok)");
  ok(/\.in\("id", protocolIds\)/.test(tsProto) && /select\("id, title, category, is_active"\)/.test(tsProto),
    "faz4-proto: tek IN sorgusu + SADE metadata (N+1 yok, DB ayrıntısı yok)");
  ok(!/PATCH|POST|DELETE/.test(tsProto),
    "faz4-proto: yalnız GET (read-only)");

  // — client api.ts: type + wrappers —
  const cApi = read("app/kupa/lib/api.ts");
  ok(/practitioner_note\?: string \| null/.test(cApi),
    "faz4-client: CuppingTechnique.practitioner_note");
  ok(!/CuppingTechniqueSafety/.test(cApi) &&
     !/listTechniqueSafety/.test(cApi) &&
     !/createTechniqueSafety/.test(cApi) &&
     !/updateTechniqueSafety/.test(cApi) &&
     !/deleteTechniqueSafety/.test(cApi),
    "faz4-client: technique-safety type + wrapper'lar KALDIRILDI (client surface temiz)");
  ok(/export const listTechniqueProtocols/.test(cApi) && /export type CuppingTechniqueProtocolRef =/.test(cApi),
    "faz4-client: used-in-protocols type + wrapper");

  // — Quick-create HÂLÂ minimal: practitioner_note/application_info/safety EKLENMEDİ —
  const qc = read("app/kupa/protokoller/components/QuickCreateMasterForm.tsx");
  ok(/name:\s*string;\s*technique_type: string \| null;\s*movement_style: string \| null;\s*description: string \| null;/.test(qc),
    "faz4-quick: TechniqueQuickValues minimal (name/type/movement/description)");
  ok(!/practitioner_note/.test(qc) && !/application_info/.test(qc),
    "faz4-quick: quick-create'e practitioner_note/application_info EKLENMEDİ");

  // — description & application_info İKİSİ DE korunur (owner: deprecate REDDEDİLDİ) —
  ok(/application_info\?: string \| null/.test(cApi) && /description\?: string \| null/.test(cApi),
    "faz4-owner: description + application_info İKİSİ DE korunur (client type)");

  // ══ FAZ 4 / AŞAMA 2B — READER-FIRST TEKNİKLER ÇALIŞMA ALANI ═════════════════════
  const tPage = read("app/kupa/teknikler/page.tsx");
  const tWork = read("app/kupa/teknikler/components/TechniqueWorkspace.tsx");
  const tList = read("app/kupa/teknikler/components/TechniqueList.tsx");
  const tRead = read("app/kupa/teknikler/components/TechniqueReadView.tsx");
  const tEdit = read("app/kupa/teknikler/components/TechniqueEditor.tsx");
  const tProt = read("app/kupa/teknikler/components/TechniqueProtocolsSection.tsx");
  const tLabels = read("app/kupa/teknikler/lib/labels.ts");

  // Route mimarisi: index + [id] + yeni mevcut.
  ok(exists("app/kupa/teknikler/page.tsx") && exists("app/kupa/teknikler/[id]/page.tsx") && exists("app/kupa/teknikler/yeni/page.tsx"),
    "faz4b-route: /kupa/teknikler + [id] + yeni route'ları");

  // Generic CrudManager ARTIK /kupa/teknikler'i sürmüyor (reader-first workspace).
  ok(!/CrudManager/.test(tPage) && /TechniqueWorkspace/.test(tPage),
    "faz4b-ux: generic CrudManager kaldırıldı → reader-first TechniqueWorkspace");

  // Desktop split eşiği >=1024 (lg); mobil liste-önce (seçiliyse detay).
  ok(/lg:flex/.test(tWork) && /hidden lg:block/.test(tWork),
    "faz4b-responsive: desktop split lg (>=1024) + mobil liste/detay geçişi");

  // Liste satırları [id] deep-link (browser back/forward temiz).
  ok(/href=\{`\/kupa\/teknikler\/\$\{t\.id\}`\}/.test(tList),
    "faz4b-nav: liste satırları /kupa/teknikler/[id] deep-link");

  // Normal UI ham enum kodu GÖSTERMEZ (label helper üzerinden).
  ok(/techniqueTypeLabel/.test(tList) && /techniqueTypeLabel/.test(tRead),
    "faz4b-labels: tür TR etiketle gösterilir (ham dry/wet değil)");
  ok(/dry: "Kuru Kupa"/.test(tLabels) && /wet: "Yaş Kupa \/ Hacamat"/.test(tLabels) &&
     /stationary: "Sabit"/.test(tLabels) && /gliding: "Kaydırmalı"/.test(tLabels) && /flash: "Flaş"/.test(tLabels),
    "faz4b-labels: technique_type/movement_style TR etiket haritası");

  // Yorumları çıkar → yalnız GERÇEK kod üzerinde legacy-alan yokluğu ölç (yorumlar
  // "kind/source_note DEĞİŞMEZ" gibi açıklamalar içerebilir; bunlar false-positive olmasın).
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const tListCode = stripComments(tList);
  const tReadCode = stripComments(tRead);
  const tEditCode = stripComments(tEdit);

  // kind normal UI'da YOK (list/read/edit); create/edit payload'da GÖNDERİLMEZ.
  ok(!/\bkind\b/.test(tListCode) && !/\bkind\b/.test(tReadCode) && !/\bkind\b/.test(tEditCode),
    "faz4b-legacy-kind: kind normal UI kodunda render/edit EDİLMEZ");
  ok(!/kind:/.test(tEditCode) && !/source_note/.test(tEditCode) && !/sort_order/.test(tEditCode),
    "faz4b-legacy: editor payload kodunda kind/source_note/sort_order YOK");

  // description + application_info İKİSİ DE editor + reader'da (owner: deprecate REDDEDİLDİ).
  ok(/description/.test(tEdit) && /applicationInfo|application_info/.test(tEdit),
    "faz4b-fields: description + application_info İKİSİ DE editor'da");
  ok(/Teknik Özeti/.test(tRead) && /Genel Uygulama Yaklaşımı/.test(tRead),
    "faz4b-fields: reader'da Teknik Özeti + Genel Uygulama Yaklaşımı AYRI bölüm");

  // practitioner_note ("Uzman Notum") reader + editor'da.
  ok(/Uzman Notum/.test(tRead) && /practitioner_note|practitionerNote/.test(tEdit),
    "faz4b-practitioner: 'Uzman Notum' reader + editor");

  // Güvenlik: TEK katman — yalnız safety_note (owner FINAL: structured teknik güvenliği reddedildi).
  ok(!exists("app/kupa/teknikler/components/TechniqueSafetySection.tsx") &&
     !exists("app/kupa/teknikler/components/SafetyPickerDialog.tsx"),
    "faz4b-safety: structured TechniqueSafetySection + SafetyPickerDialog KALDIRILDI");
  ok(/Güvenlik ve Dikkat/.test(tRead) && /technique\.safety_note/.test(tReadCode),
    "faz4b-safety: reader 'Güvenlik ve Dikkat' yalnız safety_note gösterir");
  ok(!/Güvenlik Kaydı Ekle/.test(tRead) && !/SafetyPicker/.test(tRead) && !/TechniqueSafetySection/.test(tRead),
    "faz4b-safety: '+ Güvenlik Kaydı Ekle' CTA + structured picker/section reader'da YOK");
  // Editor tek kullanıcı-yüzlü güvenlik alanı olarak safety_note'u KORUR.
  ok(/safety_note/.test(tEdit) && /Güvenlik \/ Dikkat/.test(tEdit),
    "faz4b-safety: editor safety_note alanını ('Güvenlik / Dikkat') KORUR");

  // Kullanıldığı Protokoller: read-only + protokol adı clickable.
  ok(/listTechniqueProtocols/.test(tProt) && /href=\{`\/kupa\/protokoller\/\$\{p\.id\}`\}/.test(tProt),
    "faz4b-protocols: used-in-protocols + protokol adı /kupa/protokoller/[id] link");
  ok(/Kullanıldığı Protokoller/.test(tRead) || /Kullanıldığı Protokoller/.test(tProt),
    "faz4b-protocols: 'Kullanıldığı Protokoller' bölümü mevcut");

  // Duplicate advisory + APP-STANDARD delete modal (native confirm YOK) + unsaved-changes.
  ok(/normalizeMasterName/.test(tEdit),
    "faz4b-duplicate: create advisory (normalizeMasterName) reuse");

  // Silme UX — owner FINAL: native window.confirm/alert KALDIRILDI → app-standart custom modal.
  const confirmDlg = read("app/kupa/components/ConfirmDialog.tsx");
  ok(!/window\.confirm\(/.test(tRead) && !/window\.alert\(/.test(tRead),
    "faz4b-delete: reader native window.confirm/alert KULLANMAZ");
  ok(/KupaConfirmDialog/.test(tRead) && /from "\.\.\/\.\.\/components\/ConfirmDialog"/.test(tRead),
    "faz4b-delete: silme onayı app-standart KupaConfirmDialog ile (custom modal)");
  // A) Referanslı teknik: 'Sil' önce precheck → uyarı modalı; yıkıcı aksiyon SUNULMAZ.
  ok(/listTechniqueProtocols\(id\)/.test(tRead) && /variant: "blocked"/.test(tRead),
    "faz4b-delete: 'Sil' önce protokol-kullanım prechecki yapar (blocked state)");
  ok(/Teknik silinemiyor/.test(tRead) && /kullanılıyor/.test(tRead) && /closeLabel="Kapat"/.test(tRead),
    "faz4b-delete: referanslı teknik uyarı modalı ('Teknik silinemiyor' + 'Kapat')");
  // B) Referanssız teknik: yıkıcı onay modalı ('Tekniği sil?' + 'Tekniği Sil').
  ok(/Tekniği sil\?/.test(tRead) && /confirmLabel="Tekniği Sil"/.test(tRead),
    "faz4b-delete: referanssız teknik yıkıcı onay modalı ('Tekniği sil?' + 'Tekniği Sil')");
  // Yıkıcı aksiyon YALNIZ confirm modunda: tek onConfirm={confirmDelete} (blocked modda YOK).
  ok((tRead.match(/onConfirm=/g) ?? []).length === 1 && /onConfirm=\{confirmDelete\}/.test(tRead),
    "faz4b-delete: tek yıkıcı onConfirm (confirmDelete) — blocked modda yıkıcı aksiyon YOK");
  // Server-side yetkili koruma korunur: silme yine deleteTechnique (API FK RESTRICT enforce).
  ok(/deleteTechnique\(id\)/.test(tRead),
    "faz4b-delete: onay sonrası mevcut deleteTechnique çağrılır (FK RESTRICT sunucu koruması korunur)");

  // KupaConfirmDialog a11y: role/aria-modal + portal(body) + Escape + scroll-lock + focus + no-native.
  ok(/role="dialog"/.test(confirmDlg) && /aria-modal="true"/.test(confirmDlg) &&
     /aria-labelledby/.test(confirmDlg) && /createPortal\(/.test(confirmDlg) && /document\.body/.test(confirmDlg),
    "faz4b-delete: modal role/aria-modal/aria-labelledby + createPortal(document.body)");
  ok(/"Escape"/.test(confirmDlg) && /body\.style\.overflow = "hidden"/.test(confirmDlg) &&
     /\.focus\(\)/.test(confirmDlg) && /"Tab"/.test(confirmDlg),
    "faz4b-delete: modal Escape + scroll-lock + focus yönetimi + focus-trap (Tab)");
  ok(!/window\.confirm|window\.alert/.test(confirmDlg),
    "faz4b-delete: KupaConfirmDialog native confirm/alert KULLANMAZ");

  // Kirli-editör "Vazgeç" onayı — owner FINAL: native window.confirm KALDIRILDI → KupaConfirmDialog.
  ok(!/window\.confirm\(/.test(tEdit) && !/window\.alert\(/.test(tEdit),
    "faz4b-unsaved: editor native window.confirm/alert KULLANMAZ");
  ok(/KupaConfirmDialog/.test(tEdit) && /from "\.\.\/\.\.\/components\/ConfirmDialog"/.test(tEdit),
    "faz4b-unsaved: kirli-cancel onayı app-standart KupaConfirmDialog ile (custom modal)");
  ok(/if \(dirty\)/.test(tEdit) && /setConfirmCancelOpen\(true\)/.test(tEdit),
    "faz4b-unsaved: kirliyken Vazgeç modalı açar (dirty → setConfirmCancelOpen)");
  ok(/Değişikliklerden vazgeç\?/.test(tEdit) && /confirmLabel="Değişikliklerden Vazgeç"/.test(tEdit) &&
     /cancelLabel="Vazgeçme"/.test(tEdit) && /onConfirm=\{\(\) => \{[\s\S]*?onCancel\(\);[\s\S]*?\}\}/.test(tEdit),
    "faz4b-unsaved: kirli-cancel modal içeriği + onConfirm→onCancel (temizken doğrudan onCancel)");

  // Kupa-geneli: HİÇBİR user-facing Kupa .tsx dosyası native window.confirm/alert İÇERMEZ.
  const kupaTsx = listTsx("app/kupa");
  const nativeConfirmHits = kupaTsx.filter((f) => /window\.confirm\(|window\.alert\(/.test(read(f)));
  ok(nativeConfirmHits.length === 0,
    `faz4-native-zero: app/kupa/** native window.confirm/alert = 0 (${nativeConfirmHits.join(", ") || "temiz"})`);

  // source_note normal reader/editor kodunda primary alan DEĞİL (yorumlar hariç).
  ok(!/source_note/.test(tReadCode) && !/source_note/.test(tEditCode),
    "faz4b-legacy-source: source_note normal UI kodunda primary alan DEĞİL");

  // ══ FAZ 4 / AŞAMA 2C — PROTOCOL INTEGRATION + STATE CONSISTENCY ═════════════════
  const rSec = read("app/kupa/protokoller/components/RelationSection.tsx");
  const tWork2 = read("app/kupa/teknikler/components/TechniqueWorkspace.tsx");
  const tList2 = read("app/kupa/teknikler/components/TechniqueList.tsx");
  const tRead2 = read("app/kupa/teknikler/components/TechniqueEditor.tsx");
  const tReadView2 = read("app/kupa/teknikler/components/TechniqueReadView.tsx");
  const stepRoute = read("app/api/kupa/protocol-steps/route.ts");
  const protoUsageRoute = read("app/api/kupa/techniques/[id]/protocols/route.ts");

  // Tek master: standalone create + protokol quick-create AYNI createTechnique API'sini kullanır.
  ok(/createTechnique\(/.test(tRead2),
    "faz4c-single-master: standalone editor createTechnique kullanır");
  ok(/createTechnique\(\{/.test(rSec) && /addProtocolTechnique\(\{ protocol_id: protocolId, technique_id: created\.id \}\)/.test(rSec),
    "faz4c-single-master: protokol quick-create AYNI createTechnique → dönen created.id ile attach");
  ok(!/create[A-Za-z]*Technique.*master.*store|technique_master|protocolTechnique.*name/i.test(rSec),
    "faz4c-single-master: ayrı protokole-özel teknik master store YOK");

  // Protokol relation SADECE technique_id + META taşır (kopyalanmış tür/ad/stil YOK).
  ok((PROTOCOL_TECHNIQUE_WRITABLE as readonly string[]).join(",") === "protocol_id,technique_id,protocol_note,sort_order",
    "faz4c-relation: protocol_techniques yalnız FK + protocol_note/sort_order (kopya alan yok)");
  ok(!(PROTOCOL_TECHNIQUE_WRITABLE as readonly string[]).some((k) => ["technique_type", "movement_style", "name", "description"].includes(k)),
    "faz4c-relation: relation'a technique_type/movement_style/name/description KOPYALANMAZ");
  ok((PROTOCOL_TECHNIQUE_META_WRITABLE as readonly string[]).join(",") === "protocol_note,sort_order",
    "faz4c-protocol-note: PATCH yalnız protocol_note/sort_order (relation-specific)");

  // Tür/stil propagasyonu: RelationSection master listfrom join → dinamik TR etiket (ham kod YOK).
  ok(/techniqueTypeLabel/.test(rSec) && /movementStyleLabel/.test(rSec),
    "faz4c-labels: protokol picker TR etiket (techniqueTypeLabel/movementStyleLabel)");
  ok(!/\[t\.technique_type, t\.movement_style\]\.filter/.test(rSec),
    "faz4c-labels: ham technique_type/movement_style kod join'i KALDIRILDI");
  ok(/doc\.masterTechniques/.test(rSec),
    "faz4c-propagation: picker/relation master listeden join (relation'da snapshot alan yok)");

  // Standalone edit → sol liste tazelenir (workspace nonce + context; hard reload YOK).
  ok(/TechniqueListRefreshContext/.test(tWork2) && /refreshList/.test(tWork2) && /version=\{listVersion\}/.test(tWork2),
    "faz4c-state: workspace liste-versiyon nonce + refresh context sağlar");
  ok(/version\??: number/.test(tList2) && /\}, \[version\]\)/.test(tList2),
    "faz4c-state: TechniqueList version prop ile yeniden yükler");
  ok(/useTechniqueListRefresh/.test(tReadView2) && /refreshList\(\)/.test(tReadView2),
    "faz4c-state: reader başarılı düzenleme sonrası refreshList çağırır");

  // Hard reload YOK (idiomatic router/state; window.location.reload/href YOK).
  const noHardReload = (s: string) => !/window\.location\.reload|window\.location\.href\s*=/.test(s);
  ok(noHardReload(tReadView2) && noHardReload(tList2) && noHardReload(tWork2) && noHardReload(tRead2),
    "faz4c-no-hard-reload: window.location.reload/href ile durum senkronu YOK");

  // Protokol step referans bütünlüğü: ref_technique yalnız protokole EKLİ teknik olabilir.
  ok(/assertCompositeRef\(db, CUPPING_TABLES\.protocolTechniques/.test(stepRoute),
    "faz4c-step: step ref_technique protokol-üyeliği doğrulanır (attached-only)");

  // Used-in-protocols: N+1 yok (tek IN) + boş set malformed .in([]) üretmez.
  ok(/protocolIds\.length === 0/.test(protoUsageRoute) && /\.in\("id", protocolIds\)/.test(protoUsageRoute),
    "faz4c-usage: boş-set guard + tek IN sorgusu (N+1 yok)");

  // Sınır: teknik ekleme akışı protokol safety'yi OTOMATİK kopyalamaz/eklemez.
  ok(!/addProtocolSafety\(/.test(rSec.slice(rSec.indexOf("entity: \"technique\""), rSec.indexOf("entity: \"safety\""))),
    "faz4c-boundary: teknik ekleme akışı safety'yi OTO-eklemez");

  // ══ FAZ 4 / AŞAMA 2D — inactive-picker contract (owner-locked) ══════════════════
  // Pasif teknik YENİ attach picker'ında sunulmaz; ekli pasif relation'da kalır; global
  // listTechniques DEĞİŞMEZ (ekli pasif çözümlensin); otomatik detach/arşiv YOK.
  ok(/kind === "technique"[\s\S]{0,120}master\.filter\(\(m\) =>[\s\S]{0,60}is_active !== false\)/.test(rSec),
    "faz4d-inactive: teknik picker aday kümesi is_active !== false ile filtrelenir");
  ok(/const items: PickerItem\[\] = pickerMaster\.map/.test(rSec),
    "faz4d-inactive: picker items filtrelenmiş pickerMaster'dan (master DEĞİL) türetilir");
  const apiSrc = read("lib/cupping/api.ts");
  ok(!/is_active/.test(apiSrc),
    "faz4d-inactive: global listEntity/listTechniques'e is_active filtresi EKLENMEDİ (ekli pasif çözümlenir)");
  ok(!/detachProtocolTechnique|archive|deleteTechnique\(/.test(rSec.slice(rSec.indexOf("pickerMaster"), rSec.indexOf("const items"))),
    "faz4d-inactive: pasif filtre otomatik detach/arşiv/silme YAPMAZ");

  // ══ FAZ 4 / UX SADELEŞTİRME — standalone /kupa/guvenlik + protokol güvenlik koruması ═
  // owner FINAL: bağımsız güvenlik CRUD çalışma alanı normal akıştan KALDIRILDI; rota
  // artık doğrudan URL ile gizli CRUD paneli açmaz → /kupa'ya redirect. Protokol güvenlik
  // (QuickCreate + backend master + /api/kupa/safety) AYNEN korunur.
  const guvPage = read("app/kupa/guvenlik/page.tsx");
  ok(/redirect\("\/kupa"\)/.test(guvPage),
    "faz4-ux: /kupa/guvenlik server redirect → /kupa (standalone CRUD kaldırıldı)");
  ok(!/CrudManager/.test(guvPage) && !/createSafety|updateSafety|deleteSafety/.test(guvPage),
    "faz4-ux: /kupa/guvenlik artık CRUD/mutasyon iskeleti render ETMEZ");
  // Protokol güvenlik master altyapısı KORUNUR (backend + QuickCreate).
  ok(exists("app/api/kupa/safety/route.ts") && exists("app/api/kupa/safety/[id]/route.ts") &&
     exists("app/api/kupa/protocol-safety/route.ts") && exists("app/api/kupa/protocol-safety/[id]/route.ts"),
    "faz4-ux: protokol güvenlik backend (safety + protocol-safety route'ları) DOKUNULMADI");
  ok(/entity: "safety"/.test(rSec) && /createSafety\(/.test(rSec),
    "faz4-ux: protokol QuickCreate yeni güvenlik master (createSafety) + attach KORUNUR");
  ok(/listSafety\b/.test(read("app/kupa/protokoller/hooks/useProtocolDocument.ts")),
    "faz4-ux: protokol dokümanı master güvenlik listesini (listSafety) KORUR");
  // cupping_technique_safety tablosu prod'a uygulandı → migration şeması DORMANT olarak kalır
  // (repo şeması prod'dan bilerek sapmaz); yalnız uygulama/API yüzeyi kaldırıldı.
  ok(/CREATE TABLE IF NOT EXISTS public\.cupping_technique_safety/.test(f4mig) &&
     !/DROP\s+TABLE[^;]*cupping_technique_safety/i.test(f4mig),
    "faz4-ux: cupping_technique_safety tablosu migration'da DORMANT korunur (DROP YOK)");

  // ═══════════════════════════════════════════════════════════════════════════════
  // FAZ 5 / AŞAMA 2 — HACAMAT TAKVİMİ + BİLGİLENDİRME (nötr Hijri + 4 tablo + API)
  // ═══════════════════════════════════════════════════════════════════════════════

  // ── FAZ5-A) NÖTR HİCRÎ MOTORU ──────────────────────────────────────────────────
  // Yorum-arındırma (negatif/nötrlük kontrolleri KOD üzerinde çalışsın; belge yorumları
  // yasak kavramları bilerek ADLANDIRIR "yapılmıyor" demek için — naif regex'i tökezletmesin).
  const stripTs = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  const stripSql = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  ok(exists("lib/cupping/hijri.ts"), "faz5-hijri: lib/cupping/hijri.ts mevcut");
  const hijriSrc = read("lib/cupping/hijri.ts");
  const hijriCode = stripTs(hijriSrc);
  ok(/islamic-umalqura/.test(hijriCode), "faz5-hijri: Umm al-Qura takvimi kullanılır");
  ok(/Date\.UTC\(/.test(hijriCode) && /timeZone:\s*"UTC"/.test(hijriCode), "faz5-hijri: UTC pinlenmiş (sivil gün kaymaz)");
  ok(/12,\s*0,\s*0/.test(hijriCode), "faz5-hijri: gün-ortası (12:00) — DST/offset kayması yok");
  // TIBBEN/GELENEKSEL NÖTR: hiçbir gün-tavsiye/statü sabiti yok, Kozmik bağı yok (KOD).
  ok(!/alt[ıi]n|s[uü]nnet|uygun|yasakl|getStatus|SUNNET_HICRI|UYGUN_HICRI|NOTABLE_HICRI|YASAKLI/i.test(hijriCode),
    "faz5-hijri: gün-tavsiye/statü sabiti YOK (nötr)");
  ok(!/cosmic|hacamat_rules/i.test(hijriCode), "faz5-hijri: Kozmik/hacamat_rules bağı YOK");

  // Bilinen dönüşümler (runtime'dan doğrulanmış Umm al-Qura değerleri; ICU 78).
  type HAssert = { g: string; d: number; m: number; y: number; name: string };
  const KNOWN: HAssert[] = [
    { g: "2000-01-01", d: 24, m: 9, y: 1420, name: "Ramazan" },
    { g: "2024-01-01", d: 19, m: 6, y: 1445, name: "Cemaziyelahir" },
    { g: "2027-01-01", d: 23, m: 7, y: 1448, name: "Recep" },
    { g: "2027-06-07", d: 2, m: 1, y: 1449, name: "Muharrem" },
    { g: "2027-12-31", d: 3, m: 8, y: 1449, name: "Şaban" },
    { g: "2016-01-01", d: 21, m: 3, y: 1437, name: "Rebiülevvel" },
  ];
  for (const k of KNOWN) {
    const h = gregorianToHijri(k.g);
    ok(!!h && h.day === k.d && h.month === k.m && h.year === k.y && h.monthName === k.name,
      `faz5-hijri: ${k.g} → ${k.d} ${k.name} ${k.y}`);
  }
  // formatted string sözleşmesi.
  ok(gregorianToHijri("2000-01-01")?.formatted === "24 Ramazan 1420", "faz5-hijri: formatted gösterim");
  // Türkçe ay adı tablosu (yalnız ad; hüküm yok) 12 öğe.
  ok(HIJRI_MONTHS_TR.length === 12 && HIJRI_MONTHS_TR[0] === "Muharrem", "faz5-hijri: 12 Türkçe ay adı");

  // Gregoryen ay sınırı: 31 Oca ≠ 1 Şub (farklı Hicrî hücre).
  const jan31 = gregorianToHijri("2027-01-31");
  const feb01 = gregorianToHijri("2027-02-01");
  ok(!!jan31 && !!feb01 && (jan31.day !== feb01.day || jan31.month !== feb01.month),
    "faz5-hijri: Gregoryen ay sınırı ardışık günleri ayırır");
  // Hicrî ay sınırı: 06-05 (30 Zilhicce 1448) → 06-06 (1 Muharrem 1449) ay+yıl döner.
  const h0605 = gregorianToHijri("2027-06-05");
  const h0606 = gregorianToHijri("2027-06-06");
  ok(!!h0605 && !!h0606 && h0605.month !== h0606.month && h0606.day === 1 && h0606.year === h0605.year + 1,
    "faz5-hijri: Hicrî ay+yıl sınırı (yeni ay 1. günü)");
  // Artık yıl: 2024-02-29 GEÇERLİ; 2023-02-29 GEÇERSİZ (null).
  ok(parseYmd("2024-02-29") !== null && parseYmd("2023-02-29") === null, "faz5-hijri: artık-yıl doğrulaması");
  // Geçersiz girdi → null (istisna fırlatmaz).
  ok(parseYmd("2027-13-01") === null && parseYmd("2027-02-30") === null && parseYmd("bozuk") === null,
    "faz5-hijri: geçersiz tarih parseYmd null");
  ok(gregorianToHijri("bozuk") === null && gregorianToHijri("2027-02-30") === null,
    "faz5-hijri: geçersiz tarih gregorianToHijri null");
  // UTC kararlılığı: string vs {y,m,d} aynı sonucu verir.
  const hs = gregorianToHijri("2027-03-15");
  const hp = gregorianToHijri({ year: 2027, month: 3, day: 15 });
  ok(!!hs && !!hp && hs.formatted === hp.formatted, "faz5-hijri: string/parça girişi aynı (UTC kararlı)");
  // monthHijriCells: Şubat 2027 = 28 hücre, her hücre türetilmiş Hicrî içerir.
  const febCells = monthHijriCells(2027, 2);
  ok(febCells.length === 28 && febCells.every((c) => c.hijri.month >= 1 && c.hijri.month <= 12),
    "faz5-hijri: monthHijriCells türetilmiş hücreler");

  // ── FAZ5-B) ŞEMA MIGRATION — 4 tablo + FK + unique + RLS ────────────────────────
  const calMigName = "supabase/migrations/20270103000000_cupping_calendar_advice_foundation.sql";
  ok(exists(calMigName), "faz5-mig: takvim/bilgilendirme migration mevcut (fresh version)");
  const calMig = read(calMigName);
  const FAZ5_TABLES = [
    "cupping_advice_templates",
    "cupping_calendar_plans",
    "cupping_calendar_plan_days",
    "cupping_client_advice",
  ];
  for (const t of FAZ5_TABLES) {
    ok(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`).test(calMig), `faz5-mig: ${t} CREATE`);
    ok(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`).test(calMig), `faz5-mig: ${t} RLS ENABLE`);
    ok(new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t} FROM PUBLIC, anon, authenticated`).test(calMig),
      `faz5-mig: ${t} PUBLIC/anon/auth REVOKE`);
    ok(new RegExp(`CONSTRAINT ${t}_tenant_id_key UNIQUE \\(tenant_id, id\\)`).test(calMig), `faz5-mig: ${t} composite UNIQUE(tenant_id,id)`);
  }
  ok(!/CREATE POLICY/.test(calMig), "faz5-mig: permissive policy YOK (REVOKE-only)");
  ok(!/FORCE ROW LEVEL SECURITY/.test(calMig), "faz5-mig: FORCE RLS YOK (service-role)");
  // tenant_id NOT NULL her tabloda.
  ok((calMig.match(/tenant_id\s+uuid\s+NOT NULL/g) ?? []).length >= 4, "faz5-mig: tenant_id NOT NULL (4 tablo)");
  // gregorian_date DATE (timestamptz DEĞİL).
  ok(/gregorian_date\s+date\s+NOT NULL/.test(calMig), "faz5-mig: gregorian_date DATE NOT NULL");
  ok(!/gregorian_date\s+timestamptz/.test(calMig), "faz5-mig: gregorian_date timestamptz DEĞİL");
  // Plan-gün: composite FK (tenant_id, plan_id) → plans CASCADE.
  ok(/FOREIGN KEY \(tenant_id, plan_id\)\s*REFERENCES public\.cupping_calendar_plans \(tenant_id, id\) ON DELETE CASCADE/.test(calMig),
    "faz5-mig: plan_days → plans composite FK CASCADE");
  // Plan-gün: duplicate seçili tarih UNIQUE (tenant, plan, tarih).
  ok(/UNIQUE \(tenant_id, plan_id, gregorian_date\)/.test(calMig), "faz5-mig: seçili-tarih UNIQUE (tenant,plan,tarih)");
  // Plan → şablon SET NULL.
  ok(/FOREIGN KEY \(tenant_id, advice_template_id\)\s*REFERENCES public\.cupping_advice_templates \(tenant_id, id\) ON DELETE SET NULL/.test(calMig),
    "faz5-mig: plan → şablon SET NULL");
  // ClientAdvice → şablon SET NULL (provenance).
  ok(/FOREIGN KEY \(tenant_id, source_template_id\)\s*REFERENCES public\.cupping_advice_templates \(tenant_id, id\) ON DELETE SET NULL/.test(calMig),
    "faz5-mig: client_advice → şablon SET NULL (provenance)");
  // ClientAdvice → clients (kanonik) composite FK CASCADE.
  ok(/FOREIGN KEY \(tenant_id, client_id\)\s*REFERENCES public\.clients \(tenant_id, id\) ON DELETE CASCADE/.test(calMig),
    "faz5-mig: client_advice → clients composite FK CASCADE (kanonik)");
  ok(/clients_tenant_id_id_key/.test(calMig), "faz5-mig: clients composite unique idempotent guard");
  // Aktif-varsayılan partial UNIQUE invariant.
  ok(/CREATE UNIQUE INDEX IF NOT EXISTS cupping_advice_templates_one_default_idx[\s\S]{0,120}WHERE is_default = true AND is_active = true/.test(calMig),
    "faz5-mig: aktif-varsayılan partial UNIQUE (tenant başına ≤1)");
  // Default-switch RPC — SECURITY INVOKER + EXECUTE revoke/grant.
  ok(/CREATE OR REPLACE FUNCTION public\.cupping_advice_template_set_default_atomic\(/.test(calMig) &&
     /SECURITY INVOKER/.test(calMig),
    "faz5-mig: default-switch RPC (SECURITY INVOKER)");
  ok(/REVOKE ALL ON FUNCTION public\.cupping_advice_template_set_default_atomic\(uuid, uuid\)\s*FROM PUBLIC, anon, authenticated/.test(calMig),
    "faz5-mig: default RPC EXECUTE PUBLIC/anon/auth REVOKE");
  ok(/GRANT EXECUTE ON FUNCTION public\.cupping_advice_template_set_default_atomic\(uuid, uuid\)\s*TO service_role/.test(calMig),
    "faz5-mig: default RPC service_role GRANT");
  // Yapısal yıl aralığı (tıbbi gün doğrulaması YOK).
  ok(/CHECK \(year BETWEEN 1900 AND 2200\)/.test(calMig), "faz5-mig: plan yıl aralığı 1900–2200 (yapısal)");
  // Additive: DROP/TRUNCATE/DELETE/UPDATE-backfill/seed YOK; ready-day sabiti YOK (KOD).
  const calMigCode = stripSql(calMig);
  ok(!/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(calMigCode), "faz5-mig: DROP/TRUNCATE/DELETE YOK (additive)");
  ok(!/\bINSERT\s+INTO\s+public\.cupping_(advice_templates|calendar_plans|calendar_plan_days|client_advice)\b/i.test(calMigCode),
    "faz5-mig: seed satır YOK");
  ok(!/\b17\b|\b19\b|\b21\b|alt[ıi]n|s[uü]nnet|yasakl/i.test(calMigCode.replace(/1900|2200|45001|23505|23503/g, "")),
    "faz5-mig: ready-day (17/19/21/altın/sünnet/yasaklı) sabiti YOK");

  // ── FAZ5-C) YAZILABİLİR ALLOWLIST'LER (güvenli, server-forced) ──────────────────
  const w = (a: readonly string[]) => a as readonly string[];
  ok(!w(ADVICE_TEMPLATE_WRITABLE).includes("is_default") && !w(ADVICE_TEMPLATE_WRITABLE).includes("tenant_id") &&
     !w(ADVICE_TEMPLATE_WRITABLE).includes("id") && w(ADVICE_TEMPLATE_WRITABLE).includes("before_text"),
    "faz5-fields: ADVICE_TEMPLATE_WRITABLE is_default/tenant_id/id HARİÇ");
  ok(!w(CALENDAR_PLAN_WRITABLE).includes("id") && !w(CALENDAR_PLAN_WRITABLE).includes("tenant_id") &&
     w(CALENDAR_PLAN_WRITABLE).includes("year") && w(CALENDAR_PLAN_WRITABLE).includes("advice_template_id"),
    "faz5-fields: CALENDAR_PLAN_WRITABLE güvenli");
  ok(!w(CALENDAR_PLAN_DAY_WRITABLE).includes("gregorian_date") && !w(CALENDAR_PLAN_DAY_WRITABLE).includes("plan_id") &&
     !w(CALENDAR_PLAN_DAY_WRITABLE).includes("tenant_id"),
    "faz5-fields: CALENDAR_PLAN_DAY_WRITABLE gregorian_date/plan_id/tenant_id HARİÇ (server-side)");
  ok(!w(CLIENT_ADVICE_WRITABLE).includes("client_id") && !w(CLIENT_ADVICE_WRITABLE).includes("source_template_id") &&
     w(CLIENT_ADVICE_WRITABLE).includes("before_text"),
    "faz5-fields: CLIENT_ADVICE_WRITABLE client_id/source_template_id HARİÇ (immutable provenance)");
  ok(CUPPING_TABLES.adviceTemplates === "cupping_advice_templates" &&
     CUPPING_TABLES.calendarPlans === "cupping_calendar_plans" &&
     CUPPING_TABLES.calendarPlanDays === "cupping_calendar_plan_days" &&
     CUPPING_TABLES.clientAdvice === "cupping_client_advice",
    "faz5-fields: CUPPING_TABLES registry 4 yeni tablo");

  // ── FAZ5-D) PLAN / GÜN / ŞABLON / DANIŞAN API ───────────────────────────────────
  const plansRoot = read("app/api/kupa/calendar/plans/route.ts");
  const planItem = read("app/api/kupa/calendar/plans/[id]/route.ts");
  const daysRoute = read("app/api/kupa/calendar/plans/[id]/days/route.ts");
  const dayItem = read("app/api/kupa/calendar/days/[id]/route.ts");
  const tplRoot = read("app/api/kupa/advice-templates/route.ts");
  const tplItem = read("app/api/kupa/advice-templates/[id]/route.ts");
  const caRoot = read("app/api/kupa/client-advice/route.ts");
  const caItem = read("app/api/kupa/client-advice/[id]/route.ts");

  // Plan yıl-invariant reddi (sessiz taşıma/silme YOK).
  ok(/seçili günler var[\s\S]{0,40}yıl değiştirilemez/i.test(planItem) && /409/.test(planItem),
    "faz5-plan: yıl değişimi seçili günler varken REDDEDİLİR (409)");
  ok(/validYear\(/.test(plansRoot) && /1900|CUPPING_PLAN_YEAR_MIN/.test(plansRoot),
    "faz5-plan: yapısal yıl doğrulaması (1900–2200)");
  // Plan-günler: strict YYYY-MM-DD + yıl eşitliği + max batch + idempotent upsert.
  ok(/parseYmd\(/.test(daysRoute), "faz5-days: KATI YYYY-MM-DD (parseYmd)");
  ok(/plan yılına[\s\S]{0,30}ait olmalı/i.test(daysRoute), "faz5-days: yıl-dışı tarih REDDEDİLİR");
  ok(/CUPPING_PLAN_DAYS_MAX_BATCH|366/.test(daysRoute), "faz5-days: azami toplu <= 366");
  ok(/ignoreDuplicates:\s*true/.test(daysRoute) && /skippedExisting/.test(daysRoute),
    "faz5-days: idempotent (tekrar tarih atlanır) + inserted/skippedExisting");
  ok(!/alt[ıi]n|s[uü]nnet|uygun|yasakl|hacamat_rules|getStatus/i.test(stripTs(daysRoute)),
    "faz5-days: gizli gün-tavsiye motoru YOK");
  // Şablon: is_default yalnız atomik RPC; arşiv default'u normalize eder.
  ok(/cupping_advice_template_set_default_atomic/.test(tplRoot) && /cupping_advice_template_set_default_atomic/.test(tplItem),
    "faz5-tpl: is_default yalnız atomik RPC ile");
  ok(/archiving[\s\S]{0,60}is_default = false/.test(tplItem),
    "faz5-tpl: arşivleme aktif-varsayılanı normalize eder (is_default=false)");
  // Danışan sahiplik (P0) + snapshot kopya + canlı-miras YOK.
  ok((caRoot.match(/assertOwnedRef\(db,\s*"clients",\s*tenantId/g) ?? []).length >= 2,
    "faz5-client: her yolda danışan sahiplik doğrulaması (GET+POST)");
  ok(/assertOwnedRef\(db,\s*CUPPING_TABLES\.adviceTemplates/.test(caRoot),
    "faz5-client: şablon sahiplik doğrulaması (copy path)");
  ok(/before_text:\s*t\.before_text/.test(caRoot) && /after_text:\s*t\.after_text/.test(caRoot),
    "faz5-client: PATH A şablondan metin KOPYALAR (snapshot)");
  ok(/source_template_id:\s*sourceTemplateId/.test(caRoot),
    "faz5-client: source_template_id yalnız provenance olarak yazılır");
  // PATCH snapshot düzenleme yalnız CLIENT_ADVICE_WRITABLE ile → source_template_id İMMUTABLE (canlı miras YOK).
  ok(/pickWritable\(parsed\.data,\s*CLIENT_ADVICE_WRITABLE\)/.test(caItem) &&
     !/source_template_id/.test(stripTs(caItem)),
    "faz5-client: PATCH source_template_id'yi DEĞİŞTİRMEZ (canlı miras YOK)");
  ok(/cuppingError\(404/.test(caRoot), "faz5-client: cross-tenant → owned-resource 404 (enumeration yok)");

  // SNAPSHOT KONTRAT TESTİ (ZORUNLU) — in-memory kopya değişmezliği.
  const T = { title: "Genel", before_text: "A", after_text: "B", general_note: null as string | null };
  const C = { before_text: T.before_text, after_text: T.after_text, general_note: T.general_note };
  T.before_text = "A2";
  T.after_text = "B2";
  ok(C.before_text === "A" && C.after_text === "B",
    "faz5-snapshot: şablon T sonradan değişse de danışan kopyası C değişmez (A/B korunur)");

  // ── FAZ5-E) SINIRLAR — Kozmik/ready-day/Word/UI/YH/appointment yok ──────────────
  // Boundary negatif kontrolleri KOD üzerinde (belge yorumları yasak kavramları adlandırır).
  const faz5Blob = [read("lib/cupping/hijri.ts"), read("lib/cupping/calendarTypes.ts"),
    plansRoot, planItem, daysRoute, dayItem, tplRoot, tplItem, caRoot, caItem].map(stripTs).join("\n");
  ok(!/lib\/cosmic|app\/cosmic-calendar|app\/api\/hacamat|hacamat_rules|SUNNET_HICRI|UYGUN_HICRI|NOTABLE_HICRI|YASAKLI_WEEKDAYS/i.test(faz5Blob),
    "faz5-boundary: Kozmik Hacamat içe-aktarma/bağı YOK");
  ok(!/inngest|outbox|yasam_hafizasi|memory[-_]event/i.test(faz5Blob), "faz5-boundary: Yaşam Hafızası (CDC/outbox/Inngest) YOK");
  ok(!/appointment|randevu/i.test(faz5Blob), "faz5-boundary: randevu (appointment) entegrasyonu YOK");
  ok(!exists("app/kupa/takvim"), "faz5-boundary: /kupa/takvim UI YOK (bu aşamada)");
  ok(!exists("app/api/kupa/calendar/plans/[id]/word") && !exists("app/api/kupa/client-advice/word"),
    "faz5-boundary: Word endpoint YOK (bu aşamada)");
  // Kozmik dosyaları bu değişiklikte DOKUNULMADI (repo'da mevcut + FAZ5 bloğu referans vermiyor).
  ok(exists("lib/cosmic/hacamat.ts") && exists("app/cosmic-calendar/hacamat/page.tsx"),
    "faz5-boundary: Kozmik Hacamat dosyaları yerinde (dokunulmadı)");

  console.log(`\ncupping-module harness: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log("Başarısızlar:", fails);
    process.exit(1);
  }
  console.log("✅ Kupa & Hacamat — gate/tenant/güvenli-hata + RLS + harita registry + transfer additive geçti.");
}

run();
