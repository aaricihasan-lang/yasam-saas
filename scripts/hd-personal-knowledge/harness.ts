/**
 * HD Chart → Canonical · "Kişinin Human Design Bilgileri" — SAF doğrulama harness'i.
 *   npx tsx scripts/hd-personal-knowledge/harness.ts
 *
 * Kapsam (saf mantık; DB/ağ/production write YOK):
 *   A. Tip mapping 5/5 (RAW + snake_case)
 *   B. Otorite mapping 7/7 (RAW + snake_case; Ego/Mental/Lunar özel)
 *   C. Gate dedup/validate (single/multi/duplicate/invalid)
 *   D. Completed channel türetimi (registry)
 *   E. Hanging gate resolver (6 kilitli senaryo)
 *   F. Assembler (identity/channels/gates/inCompletedChannel/unresolved)
 *   G. Published/draft içerik enjeksiyonu (full/empty/partial; taslak sızmaz)
 */
import {
  buildPersonalKnowledgeStructure,
  assemblePersonalKnowledge,
  type CanonicalContent,
} from "@/lib/human-design/knowledge/personalKnowledge";
import { resolveChannelsAndHanging } from "@/lib/human-design/knowledge/hangingGate";

let pass = 0;
let fail = 0;
const results: string[] = [];
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; results.push(`PASS  ${name}`); }
  else { fail++; results.push(`FAIL  ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); }
}

// ── A. TYPE 5/5 ──────────────────────────────────────────────────────────────
const TYPE_CASES: Array<[string, string]> = [
  ["Generator", "tip_generator"],
  ["Manifesting Generator", "tip_manifesting_generator"],
  ["Manifestor", "tip_manifestor"],
  ["Projector", "tip_projector"],
  ["Reflector", "tip_reflector"],
];
for (const [raw, key] of TYPE_CASES) {
  const s = buildPersonalKnowledgeStructure({ type_code: raw });
  assert(`type RAW '${raw}' → ${key}`, s.typeKey === key && s.unresolved.length === 0, { got: s.typeKey, unresolved: s.unresolved });
}
// snake_case rejimi
for (const [, key] of TYPE_CASES) {
  const code = key.slice("tip_".length);
  const s = buildPersonalKnowledgeStructure({ type_code: code });
  assert(`type snake '${code}' → ${key}`, s.typeKey === key, s.typeKey);
}
// unknown type → unresolved (fail-loud), typeKey null
{
  const s = buildPersonalKnowledgeStructure({ type_code: "SuperType" });
  assert("unknown type → unresolved + null", s.typeKey === null && s.unresolved.some((u) => u.field === "type"), s.unresolved);
}

// ── B. AUTHORITY 7/7 ─────────────────────────────────────────────────────────
const AUTH_CASES: Array<[string, string]> = [
  ["Emotional", "otorite_emotional"],
  ["Sacral", "otorite_sacral"],
  ["Splenic", "otorite_splenic"],
  ["Ego", "otorite_ego_heart"],
  ["Self-Projected", "otorite_self_projected"],
  ["Mental", "otorite_mental_environmental"],
  ["Lunar", "otorite_lunar"],
];
for (const [raw, key] of AUTH_CASES) {
  const s = buildPersonalKnowledgeStructure({ authority_code: raw });
  assert(`authority RAW '${raw}' → ${key}`, s.authorityKey === key && s.unresolved.length === 0, { got: s.authorityKey, unresolved: s.unresolved });
}
for (const [, key] of AUTH_CASES) {
  const code = key.slice("otorite_".length);
  const s = buildPersonalKnowledgeStructure({ authority_code: code });
  assert(`authority snake '${code}' → ${key}`, s.authorityKey === key, s.authorityKey);
}
{
  const s = buildPersonalKnowledgeStructure({ authority_code: "Ego" });
  assert("Ego → otorite_ego_heart (özel)", s.authorityKey === "otorite_ego_heart");
  const s2 = buildPersonalKnowledgeStructure({ authority_code: "Mental" });
  assert("Mental → otorite_mental_environmental (özel)", s2.authorityKey === "otorite_mental_environmental");
}

// ── C. GATES ─────────────────────────────────────────────────────────────────
{
  const s = buildPersonalKnowledgeStructure({ gates: [1] });
  assert("gate single 1 → kapi_1", s.allGates.length === 1 && s.allGates[0].key === "kapi_1");
  const s64 = buildPersonalKnowledgeStructure({ gates: [64] });
  assert("gate 64 → kapi_64", s64.allGates[0]?.key === "kapi_64");
  const sdup = buildPersonalKnowledgeStructure({ gates: [5, 5, 15, 5] });
  assert("gate dedup [5,5,15,5] → [5,15]", sdup.allGates.map((g) => g.gate).join(",") === "5,15", sdup.allGates.map((g) => g.gate));
  const sinv = buildPersonalKnowledgeStructure({ gates: [0, 65, 3] });
  assert("gate invalid 0/65 → unresolved, 3 kalır", sinv.allGates.map((g) => g.gate).join(",") === "3" && sinv.unresolved.filter((u) => u.field === "gate").length === 2, sinv.unresolved);
}

// ── D & E. CHANNELS + HANGING (kilitli senaryolar) ───────────────────────────
// CASE 1: yalnız 10 → hanging; potential 10-20,10-34,10-57
{
  const r = resolveChannelsAndHanging([10]);
  assert("CASE1 no completed", r.completedChannels.length === 0);
  const hg = r.hangingGates.find((h) => h.gate === 10);
  const codes = hg ? hg.potentialChannels.map((p) => p.code).sort() : [];
  assert("CASE1 gate10 hanging + potential 10-20/10-34/10-57", !!hg && JSON.stringify(codes) === JSON.stringify(["10-20", "10-34", "10-57"]), codes);
}
// CASE 2: 10+20 → 10-20 completed; 10,20 hanging DEĞİL
{
  const r = resolveChannelsAndHanging([10, 20]);
  assert("CASE2 10-20 completed", r.completedChannels.some((c) => c.code === "10-20"));
  assert("CASE2 gate10 & gate20 NOT hanging", !r.hangingGates.some((h) => h.gate === 10 || h.gate === 20), r.hangingGates.map((h) => h.gate));
}
// CASE 3: 10+20+34 → 10-20, 10-34, 20-34 completed; 10 hanging değil
{
  const r = resolveChannelsAndHanging([10, 20, 34]);
  const cc = r.completedChannels.map((c) => c.code).sort();
  assert("CASE3 completed 10-20/10-34/20-34", JSON.stringify(cc) === JSON.stringify(["10-20", "10-34", "20-34"]), cc);
  assert("CASE3 gate10 NOT hanging", !r.hangingGates.some((h) => h.gate === 10));
}
// CASE 4: çok potansiyel ama hiçbiri tamam → tek hanging gate, çoklu potential
{
  const r = resolveChannelsAndHanging([10]);
  assert("CASE4 single hanging entry, multiple potential", r.hangingGates.length === 1 && r.hangingGates[0].potentialChannels.length === 3);
}
// CASE 5: completed channel gate ASLA hanging olarak yeniden görünmez
{
  const r = resolveChannelsAndHanging([1, 8, 10]); // 1-8 completed; 10 hanging
  assert("CASE5 completed gates 1,8 not hanging; 10 hanging", !r.hangingGates.some((h) => h.gate === 1 || h.gate === 8) && r.hangingGates.some((h) => h.gate === 10), r.hangingGates.map((h) => h.gate));
}
// CASE 6: no hanging gates (tam kanal, tek başına kapı yok)
{
  const r = resolveChannelsAndHanging([1, 8]);
  assert("CASE6 no hanging gates", r.hangingGates.length === 0 && r.completedChannels.some((c) => c.code === "1-8"));
}
// reversed/unknown channel çapraz-kontrol (stored channels) → unresolved
{
  const s = buildPersonalKnowledgeStructure({ gates: [1, 8], channels: ["8-1", "35-36"] });
  // "8-1" ters yön → unresolved; "35-36" resmi ama 35/36 aktif değil → unresolved (gates yok)
  assert("stored reversed '8-1' → unresolved", s.unresolved.some((u) => u.field === "channel" && u.raw === "8-1"));
  assert("stored '35-36' but gates absent → unresolved", s.unresolved.some((u) => u.field === "channel" && u.raw === "35-36"));
}

// ── F. ASSEMBLER (structure) ─────────────────────────────────────────────────
const FIXTURE = {
  type_code: "Manifesting Generator",
  authority_code: "Emotional",
  // 1-8 completed, 10-20 completed; 47 hanging; duplicate 8
  gates: [1, 8, 8, 10, 20, 47],
  channels: ["1-8", "10-20"],
};
{
  const s = buildPersonalKnowledgeStructure(FIXTURE);
  assert("fixture typeKey", s.typeKey === "tip_manifesting_generator");
  assert("fixture authorityKey", s.authorityKey === "otorite_emotional");
  assert("fixture gate dedup (1,8,10,20,47)", s.allGates.map((g) => g.gate).join(",") === "1,8,10,20,47", s.allGates.map((g) => g.gate));
  assert("fixture completed 1-8 & 10-20", s.completedChannels.map((c) => c.code).sort().join(",") === "1-8,10-20", s.completedChannels.map((c) => c.code));
  const g47 = s.allGates.find((g) => g.gate === 47);
  assert("fixture gate47 inCompletedChannel=false", g47?.inCompletedChannel === false);
  const g1 = s.allGates.find((g) => g.gate === 1);
  assert("fixture gate1 inCompletedChannel=true", g1?.inCompletedChannel === true);
  assert("fixture independentGates = [47]", s.independentGates.map((g) => g.gate).join(",") === "47", s.independentGates.map((g) => g.gate));
  assert("fixture hanging = [47]", s.hangingGates.map((h) => h.gate).join(",") === "47", s.hangingGates.map((h) => h.gate));
  assert("fixture unresolved = 0", s.unresolved.length === 0, s.unresolved);
  // allKeys içerik: tip, otorite, 5 kapı, 2 kanal = 9 benzersiz
  assert("fixture allKeys count = 9", s.allKeys.length === 9, s.allKeys);
}

// ── G. PUBLISHED / DRAFT enjeksiyon ──────────────────────────────────────────
function fakeContent(marker: string): CanonicalContent {
  return {
    general_description: `gd-${marker}`, report_text: `rt-${marker}`,
    strategy_text: null, signature_text: null, not_self_text: null,
    decision_mechanism: null, application_text: null, caution_notes: null,
    general_theme: null, full_channel_text: null,
    hanging_gate_context: marker.startsWith("kapi_") ? `hang-${marker}` : null,
  };
}
{
  const s = buildPersonalKnowledgeStructure(FIXTURE);
  // all published
  const full = new Map<string, CanonicalContent | null>();
  for (const k of s.allKeys) full.set(k, fakeContent(k));
  const dtoFull = assemblePersonalKnowledge({ chartId: "c1", source: "manual" }, s, full, "2026-01-01T00:00:00Z");
  assert("G full: allUnpublished=false", dtoFull.allUnpublished === false);
  assert("G full: type content present", dtoFull.identity.type.content?.general_description === "gd-tip_manifesting_generator");
  assert("G full: hanging context from gate content", dtoFull.hangingGates[0]?.hangingContext === "hang-kapi_47");

  // all draft/null
  const empty = new Map<string, CanonicalContent | null>();
  for (const k of s.allKeys) empty.set(k, null);
  const dtoEmpty = assemblePersonalKnowledge({ chartId: "c1", source: "manual" }, s, empty, "2026-01-01T00:00:00Z");
  assert("G empty: allUnpublished=true", dtoEmpty.allUnpublished === true);
  assert("G empty: structural intact (2 channels, 1 gate, 1 hanging)", dtoEmpty.channels.length === 2 && dtoEmpty.gates.length === 1 && dtoEmpty.hangingGates.length === 1);
  assert("G empty: no draft leakage (content null)", dtoEmpty.identity.type.content === null && dtoEmpty.channels.every((c) => c.content === null));

  // partial: yalnız type published
  const partial = new Map<string, CanonicalContent | null>();
  for (const k of s.allKeys) partial.set(k, null);
  partial.set(s.typeKey!, fakeContent(s.typeKey!));
  const dtoPartial = assemblePersonalKnowledge({ chartId: "c1", source: "manual" }, s, partial, "2026-01-01T00:00:00Z");
  assert("G partial: allUnpublished=false", dtoPartial.allUnpublished === false);
  assert("G partial: authority still null", dtoPartial.identity.authority.content === null);
}

// ── report ──────────────────────────────────────────────────────────────────
for (const r of results) console.log(r);
console.log(`\nSUMMARY: ${pass}/${pass + fail} PASS · ${fail} FAIL`);
console.log(fail === 0 ? "HD-PERSONAL-KNOWLEDGE — PASS" : "HD-PERSONAL-KNOWLEDGE — FAIL");
process.exit(fail === 0 ? 0 : 1);
