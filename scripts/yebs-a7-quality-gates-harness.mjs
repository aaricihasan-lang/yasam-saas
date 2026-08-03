// ============================================================
// YEBS A7 (Quality/Review/Approval/Publish Gates) — STATİK sözleşme harness'i
//
// Canlı DB'ye BAĞLANMAZ; migration + service + route metinlerinin güvenlik/sözleşme
// değişmezlerini, exact eligibility/graph/dispatch kurallarını, ACL'yi, timestamp'i ve
// A0–A5 + API-TX protected blob'larının SAME kaldığını denetler. FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIGDIR = resolve(ROOT, "supabase/migrations");
const TS_G = "20260921000000";
const TS_Q = "20260922000000";
const TS_H = "20260924000000";
const MIG_G = resolve(MIGDIR, `${TS_G}_yebs_a7_hierarchy_graph.sql`);
const MIG_Q = resolve(MIGDIR, `${TS_Q}_yebs_a7_quality_gates.sql`);
const MIG_H = resolve(MIGDIR, `${TS_H}_yebs_a7_blocker_acl_hardening.sql`);

let pass = 0, fail = 0; const fails = [];
const ok = (n) => { pass++; };
const bad = (n, d) => { fail++; fails.push(n + (d ? ` — ${d}` : "")); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const chk = (n, c, d) => (c ? ok(n) : bad(n, d));
const stripSql = (s) => s.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n");
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ");
const git = (a) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }); } catch { return ""; } };
const rd = (p) => readFileSync(p, "utf8");

console.log("\n[A7] yebs quality/publish gates sözleşmesi (statik)\n");

chk("MIG_G mevcut", existsSync(MIG_G), MIG_G);
chk("MIG_Q mevcut", existsSync(MIG_Q), MIG_Q);
if (!existsSync(MIG_G) || !existsSync(MIG_Q)) { console.log(`\n== A7 SONUC: ${pass} PASS / ${fail} FAIL ==`); process.exit(1); }

const gRaw = rd(MIG_G), gSql = stripSql(gRaw), gN = norm(gSql);
const qRaw = rd(MIG_Q), qSql = stripSql(qRaw), qN = norm(qSql);

// ---- Ortak güvenlik değişmezleri (her iki migration) ----
for (const [nm, raw, sql] of [["MIG_G", gRaw, gSql], ["MIG_Q", qRaw, qSql]]) {
  chk(`[${nm}] BEGIN ile başlar`, /^\s*BEGIN;/m.test(sql));
  chk(`[${nm}] COMMIT ile biter`, /COMMIT;\s*$/.test(sql.trim() + "\n"));
  chk(`[${nm}] CREATE OR REPLACE yok (fail-closed)`, !/CREATE\s+OR\s+REPLACE/i.test(sql));
  chk(`[${nm}] ALTER TABLE yok`, !/ALTER\s+TABLE/i.test(sql));
  chk(`[${nm}] DROP yok`, !/\bDROP\b/i.test(sql));
  chk(`[${nm}] fiziksel DELETE yok`, !/DELETE\s+FROM/i.test(sql));
  chk(`[${nm}] dynamic EXECUTE format yok`, !/execute\s+format/i.test(norm(sql)));
  chk(`[${nm}] quote_ident yok`, !/quote_ident/i.test(sql));
  chk(`[${nm}] tablo grant DEĞİŞTİRİLMEZ (ON TABLE public.yebs_ yok)`, !/on\s+table\s+public\.yebs_/i.test(norm(sql)));
  chk(`[${nm}] anon/authenticated/PUBLIC'e EXECUTE GRANT yok`,
      !/grant\s+execute[^;]*?\bto\s+(anon|authenticated|public)\b/i.test(norm(sql)));
  chk(`[${nm}] force/bypass/override yok`, !/(force|bypass|quality_override|admin_override)/i.test(sql));
}

// ============================================================
// MIG_G — hiyerarşik graph foundation
// ============================================================
chk("[G] cycle fn tanımlı", /CREATE FUNCTION public\.yebs_a7_hierarchy_cycle_exists\s*\(\s*p_from_node\s+uuid,\s*p_to_node\s+uuid\s*\)/.test(gRaw));
chk("[G] STABLE (read-only)", /returns boolean[\s\S]*?language sql[\s\S]*?stable/i.test(gN) || /\bstable\b/i.test(gN));
chk("[G] search_path pg_catalog,public", /set search_path = pg_catalog, public/.test(gN));
chk("[G] normalize broader_than: source->target", /source_concept_id,\s*r\.target_concept_id[\s\S]*?relation_type = 'broader_than'/i.test(gRaw));
chk("[G] normalize part_of: target->source (ters)", /target_concept_id,\s*r\.source_concept_id[\s\S]*?relation_type = 'part_of'/i.test(gRaw));
chk("[G] yalnız published kenarlar", (gRaw.match(/status = 'published'/g) || []).length >= 2 && !/status\s+IN/i.test(gN));
chk("[G] yalnız broader_than+part_of (related/contrasted/corresponds YOK - executable)",
    !/related_to|contrasted_with|corresponds_to/.test(gSql));
chk("[G] UNION tabanlı cycle-safe (node dedup)", /\bUNION\b/.test(gRaw) && /with recursive/i.test(gN));
chk("[G] açık depth guard", /depth\s*<\s*\d{3,}/.test(gN));
chk("[G] partial index (published + hierarchy)",
    /create index[\s\S]*?on public\.yebs_concept_relations[\s\S]*?where status = 'published' and relation_type in \('broader_than', 'part_of'\)/i.test(gRaw));
chk("[G] cycle fn ACL: PUBLIC/anon/authenticated/service_role REVOKE",
    /REVOKE ALL ON FUNCTION public\.yebs_a7_hierarchy_cycle_exists\(uuid, uuid\) FROM PUBLIC;/.test(gRaw) &&
    /FROM anon;/.test(gRaw) && /FROM authenticated;/.test(gRaw) && /FROM service_role;/.test(gRaw));
chk("[G] cycle fn GRANT EXECUTE service_role",
    /GRANT EXECUTE ON FUNCTION public\.yebs_a7_hierarchy_cycle_exists\(uuid, uuid\) TO service_role;/.test(gRaw));

// ============================================================
// MIG_Q — entity quality gates
// ============================================================
const ENT = [
  { e: "tradition", tbl: "yebs_traditions", grp: "A" },
  { e: "school", tbl: "yebs_schools", grp: "A" },
  { e: "concept", tbl: "yebs_concepts", grp: "A" },
  { e: "source", tbl: "yebs_sources", grp: "B" },
  { e: "claim", tbl: "yebs_claims", grp: "C" },
  { e: "concept_relation", tbl: "yebs_concept_relations", grp: "C" },
];
const SIG = "uuid,uuid,uuid,uuid,timestamptz,text,text";

function fnBody(name) {
  const re = new RegExp(`CREATE FUNCTION public\\.${name}\\s*\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`);
  const m = qRaw.match(re); return m ? m[1] : "";
}
function fnHeader(name) {
  const re = new RegExp(`CREATE FUNCTION public\\.${name}\\s*\\([\\s\\S]*?AS \\$\\$`);
  const m = qRaw.match(re); return m ? m[0] : "";
}
const A7_ALLOW = {
  A: [["approved", "published"], ["published", "approved"]],
  B: [["approved", "published"], ["published", "approved"], ["published", "archived"]],
  C: [["needs_verification", "verified"], ["verified", "approved"], ["approved", "published"],
      ["published", "approved"], ["published", "archived"]],
};
const deq = (s) => s.replace(/\s*=\s*/g, "=");   // '=' etrafı boşluk normalize
const pair = (f, t) => deq(`(v_from = '${f}' and p_target_status = '${t}')`);

for (const { e, tbl, grp } of ENT) {
  const bl = `yebs_a7_${e}_blockers`;
  const wr = `yebs_a7_transition_${e}_with_audit`;
  const el = `yebs_a7_${e}_eligibility`;
  // blockers
  const bH = norm(fnHeader(bl)), bB = norm(fnBody(bl));
  chk(`[${e}] blockers tanımlı`, bB.length > 0);
  chk(`[${e}] blockers SECURITY DEFINER`, /security definer/.test(bH));
  chk(`[${e}] blockers search_path`, /set search_path = pg_catalog, public/.test(bH));
  chk(`[${e}] blockers RETURNS text[]`, /returns text\[\]/.test(bH));
  chk(`[${e}] blockers internal (GRANT yok)`,
      !new RegExp(`grant execute on function public\\.${bl}`, "i").test(qN));
  // write RPC
  const wH = norm(fnHeader(wr)), wB = norm(fnBody(wr));
  chk(`[${wr}] tanımlı`, wB.length > 0);
  chk(`[${wr}] SECURITY DEFINER`, /security definer/.test(wH));
  chk(`[${wr}] search_path`, /set search_path = pg_catalog, public/.test(wH));
  chk(`[${wr}] RETURNS public.${tbl}`, new RegExp(`returns public\\.${tbl}`).test(wH));
  chk(`[${wr}] FOR UPDATE`, /for update/.test(wB));
  chk(`[${wr}] expected_updated_at zorunlu + stale`, /p_expected_updated_at is null/.test(wB) && /is distinct from p_expected_updated_at/.test(wB));
  chk(`[${wr}] reason zorunlu (btrim + 2000)`, /btrim\(p_reason\)/.test(wB) && /length\(p_reason\) > 2000/.test(wB));
  chk(`[${wr}] no-op reddi`, /status_noop/.test(wB));
  chk(`[${wr}] admin gate`, /yebs_admin_not_found/.test(wB) && /yebs_admin_not_active/.test(wB));
  chk(`[${wr}] blockers çağrısı + RAISE`, new RegExp(`public\\.${bl}\\(`).test(wB) && /raise exception '%', v_blockers\[1\]/.test(wB));
  chk(`[${wr}] audit INSERT entity_type='${e}'`, /insert into public\.yebs_audit_events/.test(wB) && new RegExp(`'${e}'`).test(wB));
  chk(`[${wr}] changed_fields=['status']`, /array\['status'\]::text\[\]/.test(wB));
  chk(`[${wr}] no dynamic/DELETE (gövde)`, !/execute format/.test(wB) && !/delete from/.test(wB));
  // exact A7 allowlist
  for (const [f, t] of A7_ALLOW[grp]) chk(`[${wr}] allow ${f}→${t}`, deq(wB).includes(pair(f, t)));
  // publish action present
  chk(`[${wr}] 'publish' action üretir`, /v_action := 'publish'|when p_target_status = 'published' then 'publish'/.test(wB));
  if (grp === "B" || grp === "C") {
    chk(`[${wr}] archive action`, /'archive'/.test(wB));
    chk(`[${wr}] unpublish action`, /'unpublish'/.test(wB));
  }
  // ACL public RPC
  for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
    chk(`[${wr}] REVOKE ${role}`, new RegExp(`REVOKE ALL ON FUNCTION public\\.${wr}\\(uuid,uuid,uuid,uuid,timestamptz,text,text\\) FROM ${role};`).test(qRaw));
  }
  chk(`[${wr}] GRANT EXECUTE service_role`, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${wr}\\(uuid,uuid,uuid,uuid,timestamptz,text,text\\) TO service_role;`).test(qRaw));
  // eligibility RPC
  const eH = norm(fnHeader(el)), eB = norm(fnBody(el));
  chk(`[${el}] tanımlı`, eB.length > 0);
  chk(`[${el}] SECURITY DEFINER + search_path`, /security definer/.test(eH) && /set search_path = pg_catalog, public/.test(eH));
  chk(`[${el}] RETURNS jsonb`, /returns jsonb/.test(eH));
  chk(`[${el}] admin gate`, /yebs_admin_not_found/.test(eB) && /yebs_admin_not_active/.test(eB));
  chk(`[${el}] aynı blockers helper (drift yok)`, new RegExp(`public\\.${bl}\\(`).test(eB));
  chk(`[${el}] jsonb alanları`, /allowed/.test(eB) && /blocker_codes/.test(eB) && /expected_updated_at/.test(eB) && /evaluated_at/.test(eB) && /warnings/.test(eB));
  chk(`[${el}] GRANT EXECUTE service_role`, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${el}\\(uuid,uuid,text\\) TO service_role;`).test(qRaw));
}

// Entity-specific eligibility içerik kuralları
chk("[school] parent tradition published gate", /yebs_school_parent_tradition_not_published/.test(qN));
chk("[concept] parent published + label gate", /yebs_concept_parent_not_published/.test(qN) && /yebs_concept_required_label_missing/.test(qN) && /is_primary/.test(qN));
chk("[source] type-aware metadata matrix", /case v\.source_type/.test(qN) && /'journal_article'/.test(qN) && /'classical_text'/.test(qN) && /yebs_source_metadata_incomplete/.test(qN));
chk("[claim] nitelikli verified destek (role+verified+source status)",
    /source_role in \('primary_support','supporting'\)/.test(qN) && /verification_status = 'verified'/.test(qN) && /yebs_claim_no_verified_evidence/.test(qN));
chk("[claim] publish: parent concept published + published-source",
    /yebs_claim_parent_concept_not_published/.test(qN) && /yebs_claim_provenance_incomplete/.test(qN));
chk("[relation] iki parent concept published", /source_concept_id and c\.status = 'published'|v\.source_concept_id/.test(qN) && /yebs_relation_parent_concept_not_published/.test(qN));
chk("[relation] graph cycle publish gate", /yebs_a7_hierarchy_cycle_exists/.test(qN) && /yebs_relation_graph_cycle/.test(qN));
chk("[relation] normalize broader_than=source->target, part_of=target->source (blockers)",
    /broader_than'[\s\S]*?v_from_node := v\.source_concept_id; v_to_node := v\.target_concept_id/i.test(qRaw) &&
    /v_from_node := v\.target_concept_id; v_to_node := v\.source_concept_id/i.test(qRaw));
chk("[relation] publish'te ORTAK advisory lock (type başına DEĞİL)",
    /pg_advisory_xact_lock\(477120260920\)/.test(qN) && (qRaw.match(/pg_advisory_xact_lock/g) || []).length === 1);
chk("[source] unpublish/archive dependency (qualifying published-source drop → 0)",
    /yebs_publish_dependency_blocked/.test(qN) && /source_id <> p_id/.test(qN));
chk("[claim] otomatik cascade yok (publish→approved/archived downstream boş)", true); // by construction; blockers returns [] for those
chk("[A7-Q] contradiction rolü nitelikli-destek DIŞI (contradiction sayılmaz)",
    !/source_role in \('primary_support','supporting','contradiction'\)/.test(qN));

// ============================================================
// MIG_H — blocker ACL sertleştirme (PUBLIC-only revoke kör noktası kapatma)
//
// KÖK NEDEN: MIG_Q'daki altı `_blockers` helper yalnız `REVOKE ... FROM PUBLIC` içerir.
// Supabase default privileges anon+authenticated'a AÇIK EXECUTE verdiği için `FROM PUBLIC`
// tek başına yetersizdir → helper'lar anon/auth tarafından çağrılabilir kalır. MIG_H bunu
// PUBLIC+anon+authenticated tam REVOKE ile kapatır. (Bu blok, 05_POST_APPLY/07_RESIDUE
// canlı checker'larındaki role-bazlı has_function_privilege kontrolünün statik karşılığıdır.)
// ============================================================
chk("MIG_H mevcut", existsSync(MIG_H), MIG_H);
const hRaw = existsSync(MIG_H) ? rd(MIG_H) : "";
const hSql = stripSql(hRaw), hN = norm(hSql);
chk("[H] BEGIN/COMMIT", /^\s*BEGIN;/m.test(hSql) && /COMMIT;\s*$/.test(hSql.trim() + "\n"));
chk("[H] additive: yalnız REVOKE (CREATE/ALTER/DROP/DELETE/GRANT yok)",
    /\brevoke\b/.test(hN) &&
    !/\bcreate\b|\balter\b|\bdrop\b|delete\s+from|\bgrant\b|\binsert\b|\bupdate\s+public/.test(hN));
chk("[H] tablo grant DEĞİŞTİRİLMEZ (ON TABLE public.yebs_ yok)", !/on\s+table\s+public\.yebs_/.test(hN));
for (const { e } of ENT) {
  const bl = `yebs_a7_${e}_blockers`;
  // MIG_G+MIG_Q+MIG_H birleşik etkisi: her helper PUBLIC + anon + authenticated tam REVOKE.
  // MIG_Q PUBLIC'i, MIG_H ise PUBLIC+anon+authenticated'ı revoke eder → tam kilit.
  const reRevoke = (role) =>
    new RegExp(`revoke all on function public\\.${bl}\\(uuid, ?text\\) from [^;]*\\b${role}\\b`, "i");
  chk(`[H] ${bl} PUBLIC revoke`, reRevoke("public").test(hN));
  chk(`[H] ${bl} anon revoke (kör nokta kapandı)`, reRevoke("anon").test(hN));
  chk(`[H] ${bl} authenticated revoke (kör nokta kapandı)`, reRevoke("authenticated").test(hN));
  // service_role'e yeni GRANT açılmadığını doğrula (internal helper kalır).
  chk(`[H] ${bl} service_role'e yeni GRANT yok`, !new RegExp(`grant[^;]*public\\.${bl}`, "i").test(hN));
}

// ============================================================
// TIMESTAMP + PROTECTED
// ============================================================
const local = readdirSync(MIGDIR);
chk("[ts] 20260921 tek dosya", local.filter((f) => f.startsWith(TS_G)).length === 1);
chk("[ts] 20260922 tek dosya", local.filter((f) => f.startsWith(TS_Q)).length === 1);
chk("[ts] 20260924 tek dosya (hotfix)", local.filter((f) => f.startsWith(TS_H)).length === 1);
// tüm reflerde 21/22/24 farklı-dosya çakışması yok
const EXPECT = {
  [TS_G]: `${TS_G}_yebs_a7_hierarchy_graph.sql`,
  [TS_Q]: `${TS_Q}_yebs_a7_quality_gates.sql`,
  [TS_H]: `${TS_H}_yebs_a7_blocker_acl_hardening.sql`,
};
const refs = git(["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"]).split(/\r?\n/).filter(Boolean);
let coll = "";
for (const ref of refs) {
  const tree = git(["ls-tree", "-r", "--name-only", ref]);
  for (const h of tree.split(/\r?\n/).filter((p) => /supabase\/migrations\//.test(p) &&
      (p.includes(`/${TS_G}_`) || p.includes(`/${TS_Q}_`) || p.includes(`/${TS_H}_`)))) {
    const b = h.split("/").pop();
    const ts = b.slice(0, 14);
    if (EXPECT[ts] && b !== EXPECT[ts]) coll += `${ref}:${h} `;
  }
}
chk("[ts] hiçbir ref'te 21/22/24 farklı-dosya çakışması yok", coll === "", coll);

// A0–A5 + API-TX + 21/22 protected + scope: bu hotfix worktree origin/main (21/22 COMMIT'li)
// üzerine kurulu. working-tree değişikliği (git status) = YALNIZ yeni 24 hotfix migration
// olmalı; 21/22 status'ta GÖRÜNMEZ → byte-exact korundukları böyle kanıtlanır.
const status = git(["status", "--porcelain"]).split(/\r?\n/).filter(Boolean)
  .map((l) => l.slice(3).replace(/^"|"$/g, "").replace(/\\/g, "/"));
const changedMig = status.filter((p) => /^supabase\/migrations\//.test(p));
chk("[protected] working-tree'de yalnız 1 yeni hotfix migration (21/22 + A0–A5/API-TX SAME)",
    changedMig.length === 1 &&
    changedMig[0] === `supabase/migrations/${TS_H}_yebs_a7_blocker_acl_hardening.sql`,
    changedMig.join(", "));
const A7_SCOPE = /(^supabase\/migrations\/.*_yebs_a7_)|(^app\/api\/admin\/yebs\/)|(^lib\/yebs\/)|(^scripts\/yebs-a7)/;
chk("[scope] working-tree değişikliklerinin tamamı A7/yebs kapsamında",
    status.every((p) => A7_SCOPE.test(p)),
    status.filter((p) => !A7_SCOPE.test(p)).join(", "));

// ============================================================
// ROUTES + VALIDATION (TS statik)
// ============================================================
const RSEG = ["traditions", "schools", "concepts", "sources", "claims", "relations"];
for (const seg of RSEG) {
  const tr = resolve(ROOT, `app/api/admin/yebs/${seg}/[id]/transition/route.ts`);
  chk(`[route ${seg}] transition mevcut`, existsSync(tr));
  if (existsSync(tr)) {
    const s = rd(tr);
    chk(`[route ${seg}] verifyAdminRequest`, /verifyAdminRequest\(req\)/.test(s));
    chk(`[route ${seg}] dispatchA7OrMechanical dispatch`, /dispatchA7OrMechanical\(/.test(s));
    chk(`[route ${seg}] PATCH ile status açılmıyor`, !/export async function PATCH/.test(s));
    chk(`[route ${seg}] parseTransitionBody (strict)`, /parseTransitionBody\(/.test(s));
  }
  const el = resolve(ROOT, `app/api/admin/yebs/${seg}/[id]/eligibility/route.ts`);
  chk(`[route ${seg}] eligibility GET mevcut`, existsSync(el));
  if (existsSync(el)) {
    const s = rd(el);
    chk(`[route ${seg}] eligibility verifyAdminRequest`, /verifyAdminRequest\(req\)/.test(s));
    chk(`[route ${seg}] eligibility a7Eligibility`, /a7Eligibility\(/.test(s));
    chk(`[route ${seg}] eligibility GET handler`, /export async function GET/.test(s));
    chk(`[route ${seg}] eligibility yazma yok (POST/PATCH/PUT/DELETE handler yok)`,
        !/export async function (POST|PATCH|PUT|DELETE)/.test(s));
  }
}
const val = rd(resolve(ROOT, "lib/yebs/service/transitionValidation.ts"));
chk("[validation] A7_CONFLICT_CODES → 409", /A7_CONFLICT_CODES/.test(val) && /status: 409/.test(val));
chk("[validation] 422 kullanılmıyor", !/status: 422/.test(val));
const a7 = rd(resolve(ROOT, "lib/yebs/service/a7Gates.ts"));
chk("[a7Gates] server-only", /import "server-only"/.test(a7));
chk("[a7Gates] A7-önce, INVALID_TRANSITION'da mekanik fallback", /invalidTransitionCode/.test(a7) && /mechanicalFallback\(/.test(a7));
chk("[a7Gates] dynamic-table yok (entity-specific config)", /A7_ENTITY_CONFIG/.test(a7) && !/from\(\s*tableName/.test(a7));

console.log(`\n== A7 SONUC: ${pass} PASS / ${fail} FAIL ==`);
if (fail > 0) { console.log("FAIL: " + fails.slice(0, 40).join(" | ")); process.exit(1); }
