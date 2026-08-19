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
  CUPPING_TABLES,
} from "../lib/cupping/fields";
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
    ok(/requireModuleAccess\(\s*req,\s*"cupping"\)/.test(src), `gate: ${rel} requireModuleAccess("cupping")`);
    ok(/runtime\s*=\s*"nodejs"/.test(src), `runtime: ${rel} nodejs`);
    // Ham DB error.message SIZMAZ (route'lar sabit mesajlı api helper kullanır)
    ok(!/error\.message/.test(src), `güvenli-hata: ${rel} ham error.message DÖNMEZ`);
    // Yazma yapan route'lar demo short-circuit içerir
    if (/export async function (POST|PATCH|DELETE)/.test(src)) {
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

  console.log(`\ncupping-module harness: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log("Başarısızlar:", fails);
    process.exit(1);
  }
  console.log("✅ Kupa & Hacamat — gate/tenant/güvenli-hata + RLS + harita registry + transfer additive geçti.");
}

run();
