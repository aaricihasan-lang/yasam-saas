// Yaşam Hafızası™ — S2.10 indexWritePlan izole saf harness (DB'siz).
//
// makeSearchText / toDbIndexRow / planIndexWrites / indexConflictKey doğrular.
// GERÇEK fonksiyonlar import edilir (kopya YOK). IO / env / network YOK.
// Çalıştırma:  npx tsx scripts/yh-index-write-plan-harness.ts

import type { BuiltIndexUnit } from "../lib/yasam-hafizasi/indexer/buildCandidate";
import {
  indexConflictKey,
  makeSearchText,
  planIndexWrites,
  toDbIndexRow,
  type ExistingHashMap,
} from "../lib/yasam-hafizasi/indexer/indexWritePlan";
import type { EvidenceField, ExpertRelation } from "../lib/yasam-hafizasi/search/types";

let total = 0;
const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  total += 1;
  if (!cond) errors.push(msg);
}
function J(v: unknown): string {
  return JSON.stringify(v);
}

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const SID1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SID2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const HASH1 = "1".repeat(64);
const HASH2 = "2".repeat(64);

function ev(text: string): EvidenceField {
  return { origin: "content", kind: "paragraph", text };
}
function rel(targetLabel: string): ExpertRelation {
  return { kind: "related", targetLabel };
}
function unit(over: Partial<BuiltIndexUnit>): BuiltIndexUnit {
  return {
    tenantId: TENANT_A,
    sourceModule: "kisisel_arsiv",
    sourceTable: "test_col",
    sourceId: SID1,
    unitType: "record",
    sectionRef: null,
    groupKey: "test:col:" + SID1,
    title: "Başlık",
    titleSource: "title",
    snippet: "Snippet",
    snippetOrigin: "content",
    topicTags: [],
    expertRelations: [],
    evidenceFields: [ev("kanıt")],
    sourceUpdatedAt: null,
    contentHash: HASH1,
    ...over,
  };
}

// ═══ GRUP A — search_text (8) ════════════════════════════════════════════════
{
  const u = unit({ title: "T", snippet: "S", topicTags: ["tag1"], expertRelations: [rel("Rel")], evidenceFields: [ev("Ev")] });
  check(makeSearchText(u) === "T S tag1 Rel Ev", `A1 sabit sıra → ${J(makeSearchText(u))}`);
}
{
  const u = unit({ title: "  çok    boşluk\tvar  ", snippet: null, topicTags: [], expertRelations: [], evidenceFields: [ev("a\n\nb")] });
  check(makeSearchText(u) === "çok boşluk var a b", `A2 whitespace → ${J(makeSearchText(u))}`);
}
{
  const u = unit({ title: null, snippet: "", topicTags: ["", "  ", "x"], expertRelations: [], evidenceFields: [] });
  check(makeSearchText(u) === "x", `A3 boş/null atla → ${J(makeSearchText(u))}`);
}
{
  const u = unit({ title: "İğne Şükrü Öğüt Çağ", snippet: null, topicTags: [], expertRelations: [], evidenceFields: [] });
  check(makeSearchText(u) === "İğne Şükrü Öğüt Çağ", `A4 Türkçe korunur → ${J(makeSearchText(u))}`);
}
{
  const u = unit({ title: "aynı", snippet: "aynı", topicTags: ["aynı"], expertRelations: [], evidenceFields: [ev("aynı")] });
  check(makeSearchText(u) === "aynı", `A5 duplicate tekilleştir → ${J(makeSearchText(u))}`);
}
{
  const u = unit({ title: "A", snippet: "B", topicTags: ["c"], expertRelations: [rel("d")], evidenceFields: [ev("e")] });
  check(makeSearchText(u) === makeSearchText(u), `A6 deterministik`);
}
{
  const u = unit({ title: null, snippet: null, topicTags: [], expertRelations: [], evidenceFields: [ev("   ")] });
  check(makeSearchText(u) === null, `A7 anlamlı metin yok → null (${J(makeSearchText(u))})`);
}
{
  const tags = ["x", "y"];
  const evs = [ev("z")];
  const u = unit({ title: "T", topicTags: tags, evidenceFields: evs });
  const tagsSnap = J(tags), evsSnap = J(evs);
  makeSearchText(u);
  check(J(tags) === tagsSnap && J(evs) === evsSnap, `A8 input mutation yok`);
}

// ═══ GRUP B — DB mapping (6) ═════════════════════════════════════════════════
const EXPECTED_KEYS = [
  "content_hash", "evidence_fields", "expert_relations", "group_key", "search_text",
  "section_ref", "snippet", "snippet_origin", "source_id", "source_module",
  "source_table", "source_updated_at", "tenant_id", "title", "title_source",
  "topic_tags", "unit_type",
].join(",");
{
  const u = unit({ title: "Baş", titleSource: "title", snippet: "Sn", snippetOrigin: "content", topicTags: ["t"], sourceUpdatedAt: "2026-01-01T00:00:00Z" });
  const row = toDbIndexRow(u);
  check(
    row.tenant_id === TENANT_A && row.source_module === "kisisel_arsiv" && row.source_table === "test_col" &&
    row.source_id === SID1 && row.unit_type === "record" && row.section_ref === null && row.group_key === "test:col:" + SID1 &&
    row.title === "Baş" && row.title_source === "title" && row.snippet === "Sn" && row.snippet_origin === "content" &&
    row.source_updated_at === "2026-01-01T00:00:00Z" && J(row.topic_tags) === J(["t"]),
    `B1 camel→snake eşleme`,
  );
}
{
  const row = toDbIndexRow(unit({ title: "X", snippet: null, topicTags: [], expertRelations: [], evidenceFields: [ev("Y")] }));
  check(row.search_text === "X Y", `B2 search_text dahil → ${J(row.search_text)}`);
}
{
  const keys = Object.keys(toDbIndexRow(unit({}))).sort().join(",");
  check(keys === EXPECTED_KEYS, `B3 generated/default kolon yok → ${keys}`);
}
{
  const row = toDbIndexRow(unit({ contentHash: HASH2 }));
  check(row.content_hash === HASH2, `B4 content_hash korunur`);
}
{
  const row = toDbIndexRow(unit({ tenantId: null }));
  check(row.tenant_id === null, `B5 shared/null tenant`);
}
{
  const evs = [ev("m")];
  const u = unit({ evidenceFields: evs });
  const snap = J(evs);
  const row = toDbIndexRow(u);
  row.evidence_fields.push(ev("SONRADAN")); // dönen dizi bağımsız olmalı
  check(J(evs) === snap && J(u.evidenceFields) === snap, `B6 input mutation yok (slice)`);
}

// ═══ GRUP C — hash plan (9) ══════════════════════════════════════════════════
function existing(entries: Array<[string, string | null, string | null]>): ExistingHashMap {
  // [sourceId, sectionRef, hash]
  const m = new Map<string, string | null>();
  for (const [sid, sref, hash] of entries) m.set(indexConflictKey(sid, sref), hash);
  return m;
}
{
  const p = planIndexWrites([unit({ sourceId: SID1, contentHash: HASH1 })], existing([]));
  check(p.plannedInsert === 1 && p.plannedUpdate === 0 && p.unchanged === 0 && p.toUpsert.length === 1, `C1 yeni→insert ${J(p)}`);
}
{
  const p = planIndexWrites([unit({ sourceId: SID1, contentHash: HASH2 })], existing([[SID1, null, HASH1]]));
  check(p.plannedUpdate === 1 && p.plannedInsert === 0 && p.unchanged === 0 && p.toUpsert.length === 1, `C2 farklı hash→update ${J(p)}`);
}
{
  const p = planIndexWrites([unit({ sourceId: SID1, contentHash: HASH1 })], existing([[SID1, null, HASH1]]));
  check(p.unchanged === 1 && p.toUpsert.length === 0, `C3 aynı hash→unchanged ${J(p)}`);
}
{
  const p = planIndexWrites([], existing([]));
  check(p.plannedInsert === 0 && p.plannedUpdate === 0 && p.unchanged === 0 && p.toUpsert.length === 0, `C4 boş units`);
}
{
  const p = planIndexWrites([unit({ sourceId: SID1 }), unit({ sourceId: SID2 })], existing([]));
  check(p.toUpsert.length === 2 && p.toUpsert[0].source_id === SID1 && p.toUpsert[1].source_id === SID2, `C5 deterministik sıra`);
}
{
  // aynı key + aynı hash → tekilleştir (bir kez say)
  const p = planIndexWrites([unit({ sourceId: SID1, contentHash: HASH1 }), unit({ sourceId: SID1, contentHash: HASH1 })], existing([]));
  check(p.plannedInsert === 1 && p.toUpsert.length === 1, `C6 aynı key/hash dedup ${J(p)}`);
}
{
  // aynı key + farklı hash → throw
  let threw = false;
  try { planIndexWrites([unit({ sourceId: SID1, contentHash: HASH1 }), unit({ sourceId: SID1, contentHash: HASH2 })], existing([])); } catch { threw = true; }
  check(threw, `C7 aynı key/farklı hash → throw`);
}
{
  // null vs değer section_ref ayrımı (injektif key)
  check(indexConflictKey(SID1, null) !== indexConflictKey(SID1, "") && indexConflictKey(SID1, "x") !== indexConflictKey(SID1, null), `C8 conflict key injektif`);
}
{
  const units = [unit({ sourceId: SID1, contentHash: HASH1 })];
  const snap = J(units);
  planIndexWrites(units, existing([]));
  check(J(units) === snap, `C9 plan/input mutation yok`);
}

// ── Sonuç ─────────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error("S2.10 indexWritePlan harness — BAŞARISIZ:");
  for (const e of errors) console.error("  ✗ " + e);
  process.exit(1);
}
console.log("S2.10 indexWritePlan harness — saf; DB'siz.");
console.log("");
console.log(`CHECK: ${total} kontrol OK (A search_text 8 + B DB mapping 6 + C hash plan 9).`);
console.log("- search_text: sabit sıra title/snippet/tags/relations/evidence; whitespace sadeleşir; Türkçe korunur; duplicate tekil; anlamlı yoksa null");
console.log("- DB row: camel→snake; search_text dahil; generated/default kolon yok; content_hash korunur; mutation yok");
console.log("- plan: yeni→plannedInsert, farklı→plannedUpdate, aynı→unchanged; aynı-key/hash dedup; aynı-key/farklı-hash throw");
