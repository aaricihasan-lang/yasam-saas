/**
 * Seed: KUPA & HACAMAT — canonical hacamat points (cupping_sources + cupping_points + cupping_point_sources).
 *
 * Kaynak: scripts/data/hacamat-canonical/{sources,points,citations}.json
 * Yerel HACAMAT corpus taramasından çıkarılan 39 canonical nokta + kaynak künyeleri + atıflar.
 * SADECE bu 3 tablo yazılır. topics/point_topics/placements/techniques/knowledge/safety'e DOKUNULMAZ.
 * MIGRATION/SCHEMA değişikliği YOK. Numaralı atlas (tercume 1–143) ve Letaif KAPSAM DIŞI.
 *
 * Kullanım (proje kökünde):
 *   node scripts/seed-cupping-canonical-points.mjs --dry-run   # yalnız plan
 *   node scripts/seed-cupping-canonical-points.mjs             # production yaz
 *
 * İDEMPOTENT:
 *   - source: (tenant_id, source_name) varsa reuse, yoksa insert
 *   - point:  (tenant_id, code)        varsa reuse, yoksa insert
 *   - citation(cupping_point_sources): (tenant_id, source_id, point_id) varsa skip, yoksa insert
 * → tekrar çalıştırmak duplicate üretmez.
 *
 * tenant_id = ADMIN_TENANT_ID (Kupa master içerik tenant'ı; app admin@yasamsistemi.com ile aynı).
 * service_role YALNIZ bu server-side script'te kullanılır.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ADMIN_TENANT_ID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (.env.local) gerekli.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const T = ADMIN_TENANT_ID;

const DATA = join(__dirname, "data", "hacamat-canonical");
const sources   = JSON.parse(readFileSync(join(DATA, "sources.json"),   "utf-8")).sources;
const points    = JSON.parse(readFileSync(join(DATA, "points.json"),    "utf-8")).points;
const citations = JSON.parse(readFileSync(join(DATA, "citations.json"), "utf-8")).citations;

const TABLES = {
  sources: "cupping_sources",
  points: "cupping_points",
  pointSources: "cupping_point_sources",
  topics: "cupping_topics",
  pointTopics: "cupping_point_topics",
  placements: "cupping_point_placements",
  techniques: "cupping_techniques",
  knowledge: "cupping_knowledge_records",
  safety: "cupping_safety_notes",
  topicSources: "cupping_topic_sources",
  pointTopicSources: "cupping_point_topic_sources",
};

const VALID_EV = ["traditional", "historical", "expert_educational"]; // modern_clinical/systematic_review YASAK

async function count(table) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", T);
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function snapshot(label) {
  const keys = Object.keys(TABLES);
  const out = {};
  for (const k of keys) out[k] = await count(TABLES[k]);
  console.log(`\n📊 ${label} (tenant ${T}):`);
  for (const k of keys) console.log(`   ${TABLES[k].padEnd(30)} = ${out[k]}`);
  return out;
}

async function run() {
  console.log(`\n════════ KUPA canonical points load ${DRY_RUN ? "(DRY-RUN)" : "(LIVE PRODUCTION WRITE)"} ════════`);

  // ── Preflight: fixture doğrulama ──
  if (points.length !== 39) throw new Error(`points != 39 (${points.length})`);
  const codes = points.map((p) => p.code);
  if (new Set(codes).size !== 39) throw new Error("duplicate point codes");
  const srcKeys = new Set(sources.map((s) => s.key));
  for (const c of citations) {
    if (!srcKeys.has(c.source)) throw new Error(`citation bad source ${c.point}->${c.source}`);
    if (!codes.includes(c.point)) throw new Error(`citation bad point ${c.point}`);
    if (c.evidence_class && !VALID_EV.includes(c.evidence_class)) throw new Error(`citation bad/forbidden ev ${c.point} ${c.evidence_class}`);
  }
  const cov = {};
  for (const c of citations) cov[c.point] = (cov[c.point] || 0) + 1;
  const uncited = codes.filter((c) => !cov[c]);
  if (uncited.length) throw new Error(`uncited points: ${uncited.join(",")}`);
  console.log(`✅ preflight: 39 points, ${sources.length} sources, ${citations.length} citations, 39/39 cited, evidence_class temiz.`);

  const before = await snapshot("BASELINE");

  const report = { sources: { ins: 0, reuse: 0 }, points: { ins: 0, reuse: 0 }, citations: { ins: 0, skip: 0 } };

  // ── 1) SOURCES ──
  const srcId = {};
  for (const s of sources) {
    const { data: ex, error: e1 } = await db.from(TABLES.sources).select("id").eq("tenant_id", T).eq("source_name", s.source_name).maybeSingle();
    if (e1) throw new Error(`source lookup ${s.key}: ${e1.message}`);
    if (ex) { srcId[s.key] = ex.id; report.sources.reuse++; continue; }
    const row = {
      tenant_id: T,
      source_name: s.source_name,
      source_type: s.source_type ?? null,
      author_or_organization: s.author_or_organization ?? null,
      title: s.title ?? null,
      page_or_section: s.page_or_section ?? null,
      year: s.year ?? null,
      identifier: s.identifier ?? null,
      publication: s.publication ?? null,
      language: s.language ?? null,
      note: s.note ?? null,
      sort_order: sources.indexOf(s) + 1,
    };
    if (DRY_RUN) { srcId[s.key] = `DRY-${s.key}`; report.sources.ins++; console.log(`   [dry] +source ${s.key}`); continue; }
    const { data, error } = await db.from(TABLES.sources).insert(row).select("id").single();
    if (error) throw new Error(`source insert ${s.key}: ${error.message}`);
    srcId[s.key] = data.id; report.sources.ins++;
  }

  // ── 2) POINTS ──
  const ptId = {};
  let si = 0;
  for (const p of points) {
    si++;
    const { data: ex, error: e1 } = await db.from(TABLES.points).select("id").eq("tenant_id", T).eq("code", p.code).maybeSingle();
    if (e1) throw new Error(`point lookup ${p.code}: ${e1.message}`);
    if (ex) { ptId[p.code] = ex.id; report.points.reuse++; continue; }
    const row = {
      tenant_id: T,
      name: p.name,
      alt_name: p.alt_name ?? null,
      code: p.code,
      anatomical_region: p.anatomical_region ?? null,
      description: p.description ?? null,
      professional_note: p.professional_note ?? null,
      synonyms: Array.isArray(p.synonyms) ? p.synonyms : [],
      laterality: p.laterality ?? "unspecified",
      sort_order: si,
      is_active: true,
    };
    if (DRY_RUN) { ptId[p.code] = `DRY-${p.code}`; report.points.ins++; console.log(`   [dry] +point ${p.code} ${p.name}`); continue; }
    const { data, error } = await db.from(TABLES.points).insert(row).select("id").single();
    if (error) throw new Error(`point insert ${p.code}: ${error.message}`);
    ptId[p.code] = data.id; report.points.ins++;
  }

  // ── 3) CITATIONS (cupping_point_sources) ──
  let ci = 0;
  for (const c of citations) {
    ci++;
    const source_id = srcId[c.source];
    const point_id = ptId[c.point];
    if (!source_id || !point_id) throw new Error(`citation missing id ${c.point}/${c.source}`);
    if (!DRY_RUN) {
      const { data: ex, error: e1 } = await db.from(TABLES.pointSources).select("id").eq("tenant_id", T).eq("source_id", source_id).eq("point_id", point_id).maybeSingle();
      if (e1) throw new Error(`citation lookup ${c.point}/${c.source}: ${e1.message}`);
      if (ex) { report.citations.skip++; continue; }
    }
    const row = { tenant_id: T, source_id, point_id, locator: c.locator ?? null, evidence_class: c.evidence_class ?? null, note: c.note ?? null, sort_order: ci };
    if (DRY_RUN) { report.citations.ins++; continue; }
    const { error } = await db.from(TABLES.pointSources).insert(row).select("id").single();
    if (error) throw new Error(`citation insert ${c.point}/${c.source}: ${error.message}`);
    report.citations.ins++;
  }

  console.log(`\n📦 LOAD RESULT ${DRY_RUN ? "(dry)" : ""}:`);
  console.log(`   sources:   +${report.sources.ins} inserted, ${report.sources.reuse} reused`);
  console.log(`   points:    +${report.points.ins} inserted, ${report.points.reuse} reused`);
  console.log(`   citations: +${report.citations.ins} inserted, ${report.citations.skip} skipped(existing)`);

  if (DRY_RUN) { console.log("\n🟡 DRY-RUN — production'a hiçbir şey yazılmadı."); return; }

  const after = await snapshot("POST-LOAD");

  // ── DELTA + SCOPE GUARD ──
  const delta = (k) => after[k] - before[k];
  console.log("\n🔎 DELTA:");
  for (const k of Object.keys(TABLES)) console.log(`   ${TABLES[k].padEnd(30)} Δ ${delta(k) >= 0 ? "+" : ""}${delta(k)}`);
  const scopeGuard = ["topics", "pointTopics", "placements", "techniques", "knowledge", "safety", "topicSources", "pointTopicSources"];
  const scopeViolations = scopeGuard.filter((k) => delta(k) !== 0);
  console.log(`\n🛡️  SCOPE GUARD (must be Δ0): ${scopeViolations.length ? "❌ VIOLATION " + scopeViolations.join(",") : "✅ all Δ0"}`);

  // ── DB ACCEPTANCE ──
  const { data: loadedPts } = await db.from(TABLES.points).select("id,code,name").eq("tenant_id", T).like("code", "HCP%");
  const { data: loadedPS } = await db.from(TABLES.pointSources).select("point_id").eq("tenant_id", T);
  const psByPoint = {};
  for (const r of loadedPS ?? []) psByPoint[r.point_id] = (psByPoint[r.point_id] || 0) + 1;
  const hcp = (loadedPts ?? []).filter((p) => /^HCP\d{3}$/.test(p.code));
  const codeSet = new Set(hcp.map((p) => p.code));
  const missing = codes.filter((c) => !codeSet.has(c));
  const dupCodes = hcp.length - codeSet.size;
  const zeroCite = hcp.filter((p) => !psByPoint[p.id]).map((p) => p.code);
  // orphan point_sources: any point_id not in loaded points at all
  const allPtIds = new Set((await db.from(TABLES.points).select("id").eq("tenant_id", T)).data?.map((r) => r.id));
  const orphanPS = (loadedPS ?? []).filter((r) => !allPtIds.has(r.point_id)).length;
  const byCode = Object.fromEntries(hcp.map((p) => [p.code, p]));
  const distinct = (a, b) => byCode[a] && byCode[b] && byCode[a].id !== byCode[b].id;

  console.log("\n✅ DB ACCEPTANCE:");
  console.log(`   39/39 HCP points present:            ${codeSet.size === 39 && missing.length === 0 ? "PASS (" + codeSet.size + ")" : "FAIL missing=" + missing.join(",")}`);
  console.log(`   duplicate canonical points = 0:      ${dupCodes === 0 ? "PASS" : "FAIL " + dupCodes}`);
  console.log(`   every point citation >= 1:           ${zeroCite.length === 0 ? "PASS" : "FAIL " + zeroCite.join(",")}`);
  console.log(`   orphan point_source = 0:             ${orphanPS === 0 ? "PASS" : "FAIL " + orphanPS}`);
  console.log(`   Kalp Arkası (001) != Kâhil (002):    ${distinct("HCP001", "HCP002") ? "PASS (ayrı kayıt)" : "FAIL"}`);
  console.log(`   DU20 (038) != Bıngıldak (003):       ${distinct("HCP003", "HCP038") ? "PASS (ayrı kayıt)" : "FAIL"}`);
  console.log(`   Akhdain (007) != Mastoid (006):      ${distinct("HCP006", "HCP007") ? "PASS (ayrı kayıt)" : "FAIL"}`);
  console.log(`   Nukra (008) ayrı kayıt:              ${byCode["HCP008"] ? "PASS" : "FAIL"}`);
  console.log(`   Ense Çukuru Altı (031) != Nukra:     ${distinct("HCP008", "HCP031") ? "PASS (ayrı kayıt)" : "FAIL"}`);
  console.log(`   point_topic delta = 0:               ${delta("pointTopics") === 0 ? "PASS" : "FAIL"}`);
  console.log(`   placements delta = 0:                ${delta("placements") === 0 ? "PASS" : "FAIL"}`);

  console.log("\n🏁 done.");
}

run().catch((e) => { console.error("\n💥 FATAL:", e.message); process.exit(1); });
