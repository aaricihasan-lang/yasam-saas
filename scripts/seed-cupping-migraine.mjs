/**
 * Seed: KUPA & HACAMAT — MİGREN pilotu (kaynak-bazlı rahatsızlık kaydı).
 *
 * Kaynak: scripts/data/hacamat-topics/migraine.json
 * Oluşturur: cupping_topics(1 "Migren") + cupping_topic_sources(3) +
 *            cupping_point_topics(5) + cupping_point_topic_sources(8).
 * REUSE: mevcut source (source_name) + mevcut point (code). YENİ source/point YOK.
 * MIGRATION/SCHEMA YOK. points/sources/placements/techniques/knowledge/safety'e DOKUNULMAZ.
 * BAŞKA topic (Baş ağrısı, sinüzit, tansiyon...) OLUŞTURULMAZ.
 *
 * Kullanım (proje kökünde):
 *   node scripts/seed-cupping-migraine.mjs --dry-run
 *   node scripts/seed-cupping-migraine.mjs
 *
 * İDEMPOTENT:
 *   topic:              (tenant, title="Migren")
 *   topic_source:       (tenant, topic_id, source_id)
 *   point_topic:        (tenant, topic_id, point_id)
 *   point_topic_source: (tenant, point_topic_id, source_id)
 *
 * tenant_id = ADMIN_TENANT_ID (Kupa master içerik tenant'ı). service_role YALNIZ server-side.
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

const data = JSON.parse(readFileSync(join(__dirname, "data", "hacamat-topics", "migraine.json"), "utf-8"));
const SRC_NAME = data._meta.reuse_sources_by_name;
const VALID_EV = ["traditional", "historical", "expert_educational"];

const TABLES = {
  topics: "cupping_topics",
  topicSources: "cupping_topic_sources",
  pointTopics: "cupping_point_topics",
  pointTopicSources: "cupping_point_topic_sources",
  points: "cupping_points",
  sources: "cupping_sources",
  placements: "cupping_point_placements",
  techniques: "cupping_techniques",
  knowledge: "cupping_knowledge_records",
  safety: "cupping_safety_notes",
  pointSources: "cupping_point_sources",
};

async function count(table) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", T);
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}
async function snapshot(label) {
  const out = {};
  for (const k of Object.keys(TABLES)) out[k] = await count(TABLES[k]);
  console.log(`\n📊 ${label} (tenant ${T}):`);
  for (const k of Object.keys(TABLES)) console.log(`   ${TABLES[k].padEnd(30)} = ${out[k]}`);
  return out;
}

async function run() {
  console.log(`\n════════ MİGREN pilotu load ${DRY_RUN ? "(DRY-RUN)" : "(LIVE PRODUCTION WRITE)"} ════════`);

  // preflight
  for (const c of [...data.topic_sources, ...data.point_topic_sources]) {
    if (c.evidence_class && !VALID_EV.includes(c.evidence_class)) throw new Error(`forbidden/bad evidence_class: ${c.evidence_class}`);
  }

  const before = await snapshot("BASELINE");

  // ── Resolve existing sources (by source_name) + points (by code) — REUSE, create YOK ──
  const srcId = {};
  for (const [key, name] of Object.entries(SRC_NAME)) {
    const { data: s, error } = await db.from(TABLES.sources).select("id").eq("tenant_id", T).eq("source_name", name).maybeSingle();
    if (error) throw new Error(`source lookup ${key}: ${error.message}`);
    if (!s) throw new Error(`BLOCKER: mevcut source bulunamadı '${name}' — canonical load yapılmamış olabilir.`);
    srcId[key] = s.id;
  }
  const codes = [...new Set([...data.point_topics.map((p) => p.point), ...data.point_topic_sources.map((c) => c.point)])];
  const ptId = {};
  for (const code of codes) {
    const { data: p, error } = await db.from(TABLES.points).select("id").eq("tenant_id", T).eq("code", code).maybeSingle();
    if (error) throw new Error(`point lookup ${code}: ${error.message}`);
    if (!p) throw new Error(`BLOCKER: mevcut point bulunamadı '${code}'.`);
    ptId[code] = p.id;
  }
  console.log(`✅ reuse: ${Object.keys(srcId).length} source + ${codes.length} point (yeni source/point YOK).`);

  const rep = { topic: 0, topicSrc: { ins: 0, skip: 0 }, pt: { ins: 0, skip: 0 }, ptSrc: { ins: 0, skip: 0 } };

  // ── 1) TOPIC (Migren) — (tenant,title) idempotent ──
  let topicId;
  {
    const { data: ex, error } = await db.from(TABLES.topics).select("id").eq("tenant_id", T).eq("title", data.topic.title).maybeSingle();
    if (error) throw new Error(`topic lookup: ${error.message}`);
    if (ex) { topicId = ex.id; console.log(`   = topic reuse "${data.topic.title}"`); }
    else if (DRY_RUN) { topicId = "DRY-TOPIC"; rep.topic = 1; console.log(`   [dry] +topic "${data.topic.title}"`); }
    else {
      const row = { tenant_id: T, title: data.topic.title, category: data.topic.category, description: data.topic.description, sort_order: 1, is_active: true };
      const { data: created, error: e2 } = await db.from(TABLES.topics).insert(row).select("id").single();
      if (e2) throw new Error(`topic insert: ${e2.message}`);
      topicId = created.id; rep.topic = 1;
    }
  }

  // ── 2) TOPIC-SOURCES — (tenant,topic_id,source_id) idempotent ──
  let so = 0;
  for (const ts of data.topic_sources) {
    so++;
    const source_id = srcId[ts.source];
    if (!DRY_RUN) {
      const { data: ex, error } = await db.from(TABLES.topicSources).select("id").eq("tenant_id", T).eq("topic_id", topicId).eq("source_id", source_id).maybeSingle();
      if (error) throw new Error(`topic_source lookup ${ts.source}: ${error.message}`);
      if (ex) { rep.topicSrc.skip++; continue; }
    }
    const row = { tenant_id: T, topic_id: topicId, source_id, locator: ts.locator ?? null, evidence_class: ts.evidence_class ?? null, note: ts.note ?? null, sort_order: so };
    if (DRY_RUN) { rep.topicSrc.ins++; continue; }
    const { error } = await db.from(TABLES.topicSources).insert(row).select("id").single();
    if (error) throw new Error(`topic_source insert ${ts.source}: ${error.message}`);
    rep.topicSrc.ins++;
  }

  // ── 3) POINT-TOPICS — (tenant,topic_id,point_id) idempotent; map point→relationId ──
  const relId = {};
  for (const pt of data.point_topics) {
    const point_id = ptId[pt.point];
    const { data: ex, error } = DRY_RUN ? { data: null } : await db.from(TABLES.pointTopics).select("id").eq("tenant_id", T).eq("topic_id", topicId).eq("point_id", point_id).maybeSingle();
    if (error) throw new Error(`point_topic lookup ${pt.point}: ${error.message}`);
    if (ex) { relId[pt.point] = ex.id; rep.pt.skip++; continue; }
    // NOT: cupping_point_topics'te sort_order kolonu YOK (POINT_TOPIC_WRITABLE: point_id/topic_id/note/source_note/relation_strength).
    const row = { tenant_id: T, topic_id: topicId, point_id, relation_strength: pt.relation_strength ?? null, note: pt.note ?? null };
    if (DRY_RUN) { relId[pt.point] = `DRY-${pt.point}`; rep.pt.ins++; continue; }
    const { data: created, error: e2 } = await db.from(TABLES.pointTopics).insert(row).select("id").single();
    if (e2) throw new Error(`point_topic insert ${pt.point}: ${e2.message}`);
    relId[pt.point] = created.id; rep.pt.ins++;
  }

  // ── 4) POINT-TOPIC-SOURCES — (tenant,point_topic_id,source_id) idempotent ──
  let co = 0;
  for (const c of data.point_topic_sources) {
    co++;
    const point_topic_id = relId[c.point];
    const source_id = srcId[c.source];
    if (!point_topic_id) throw new Error(`point_topic_source: relation yok ${c.point}`);
    if (!DRY_RUN) {
      const { data: ex, error } = await db.from(TABLES.pointTopicSources).select("id").eq("tenant_id", T).eq("point_topic_id", point_topic_id).eq("source_id", source_id).maybeSingle();
      if (error) throw new Error(`pts lookup ${c.point}/${c.source}: ${error.message}`);
      if (ex) { rep.ptSrc.skip++; continue; }
    }
    const row = { tenant_id: T, point_topic_id, source_id, locator: c.locator ?? null, evidence_class: c.evidence_class ?? null, note: c.note ?? null, sort_order: co };
    if (DRY_RUN) { rep.ptSrc.ins++; continue; }
    const { error } = await db.from(TABLES.pointTopicSources).insert(row).select("id").single();
    if (error) throw new Error(`pts insert ${c.point}/${c.source}: ${error.message}`);
    rep.ptSrc.ins++;
  }

  console.log(`\n📦 LOAD RESULT ${DRY_RUN ? "(dry)" : ""}:`);
  console.log(`   topic:              +${rep.topic}`);
  console.log(`   topic_sources:      +${rep.topicSrc.ins} / skip ${rep.topicSrc.skip}`);
  console.log(`   point_topics:       +${rep.pt.ins} / skip ${rep.pt.skip}`);
  console.log(`   point_topic_sources:+${rep.ptSrc.ins} / skip ${rep.ptSrc.skip}`);

  if (DRY_RUN) { console.log("\n🟡 DRY-RUN — production'a hiçbir şey yazılmadı."); return; }

  const after = await snapshot("POST-LOAD");
  const delta = (k) => after[k] - before[k];
  console.log("\n🔎 DELTA:");
  for (const k of Object.keys(TABLES)) console.log(`   ${TABLES[k].padEnd(30)} Δ ${delta(k) >= 0 ? "+" : ""}${delta(k)}`);
  const scope = ["points", "sources", "placements", "techniques", "knowledge", "safety", "pointSources"];
  const viol = scope.filter((k) => delta(k) !== 0);
  console.log(`\n🛡️  SCOPE GUARD (Δ0): ${viol.length ? "❌ " + viol.join(",") : "✅ points/sources/placements/techniques/knowledge/safety/point_sources tümü Δ0"}`);

  // ── DB ACCEPTANCE ──
  const { data: migrenRows } = await db.from(TABLES.topics).select("id,title").eq("tenant_id", T).eq("title", "Migren");
  const migCount = (migrenRows ?? []).length;
  const tId = migrenRows?.[0]?.id;
  const { data: tsrc } = await db.from(TABLES.topicSources).select("source_id").eq("tenant_id", T).eq("topic_id", tId);
  const { data: rels } = await db.from(TABLES.pointTopics).select("id,point_id").eq("tenant_id", T).eq("topic_id", tId);
  const relByPoint = {};
  for (const r of rels ?? []) relByPoint[r.point_id] = r.id;
  // point-topic-sources for this topic's relations
  const relIds = (rels ?? []).map((r) => r.id);
  const { data: ptsAll } = await db.from(TABLES.pointTopicSources).select("point_topic_id,source_id").eq("tenant_id", T).in("point_topic_id", relIds.length ? relIds : ["00000000-0000-0000-0000-000000000000"]);
  const distinctSrcByRel = {};
  for (const r of ptsAll ?? []) {
    (distinctSrcByRel[r.point_topic_id] ||= new Set()).add(r.source_id);
  }
  const relOf = (code) => relByPoint[ptId[code]];
  const distinctCount = (code) => (distinctSrcByRel[relOf(code)]?.size ?? 0);
  const hasSrc = (code, key) => distinctSrcByRel[relOf(code)]?.has(srcId[key]) ?? false;

  console.log("\n✅ DB ACCEPTANCE:");
  console.log(`   exactly 1 Migren topic:              ${migCount === 1 ? "PASS" : "FAIL (" + migCount + ")"}`);
  console.log(`   3 topic sources:                     ${(tsrc ?? []).length === 3 ? "PASS" : "FAIL (" + (tsrc ?? []).length + ")"}`);
  console.log(`   5 point-topic relations:             ${(rels ?? []).length === 5 ? "PASS" : "FAIL (" + (rels ?? []).length + ")"}`);
  console.log(`   8 point-topic citations:             ${(ptsAll ?? []).length === 8 ? "PASS" : "FAIL (" + (ptsAll ?? []).length + ")"}`);
  console.log(`   HCP006 distinct source = 3:          ${distinctCount("HCP006") === 3 ? "PASS" : "FAIL (" + distinctCount("HCP006") + ")"}`);
  console.log(`   HCP010 distinct source = 2:          ${distinctCount("HCP010") === 2 ? "PASS" : "FAIL (" + distinctCount("HCP010") + ")"}`);
  console.log(`   HCP002 includes Benli:               ${hasSrc("HCP002", "BENLI") ? "PASS" : "FAIL"}`);
  console.log(`   HCP026 includes Benli:               ${hasSrc("HCP026", "BENLI") ? "PASS" : "FAIL"}`);
  console.log(`   HCP029 includes Hacamat2:            ${hasSrc("HCP029", "HACAMAT2") ? "PASS" : "FAIL"}`);
  console.log(`   ortak-nokta (>=2 distinct source):   Kulak Arkası=${distinctCount("HCP006")}, Omuz=${distinctCount("HCP010")} → beklenen {3,2}`);
  console.log(`   topics delta (yalnız +1 Migren):     ${delta("topics") === 1 ? "PASS" : "FAIL (" + delta("topics") + ")"}`);

  console.log("\n🏁 done.");
}

run().catch((e) => { console.error("\n💥 FATAL:", e.message); process.exit(1); });
