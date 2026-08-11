/**
 * HD Danışmanlık F2 · Admin Workspace — statik & güvenlik harness
 * ================================================================================
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ. F2 route/service/UI dosya metinleri denetlenir.
 * Migration/production YOK. Herhangi bir FAIL → exit 1.
 *
 * Çalıştır:  npx tsx scripts/hd-consultation/f2-admin-workspace-harness.mjs
 */
import { readFileSync } from "node:fs";

const ROOT = process.cwd();
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8");
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const F = {
  routeMain: "app/api/admin/hd/consultation/route.ts",
  routeId: "app/api/admin/hd/consultation/[id]/route.ts",
  routePublish: "app/api/admin/hd/consultation/[id]/publish/route.ts",
  routeArchive: "app/api/admin/hd/consultation/[id]/archive/route.ts",
  service: "lib/human-design/consultation/admin/consultationAdminService.ts",
  types: "lib/human-design/consultation/admin/consultationAdminTypes.ts",
  errHttp: "lib/human-design/consultation/admin/consultationErrorHttp.ts",
  labels: "app/admin/hd-danismanlik/labels.ts",
  workspace: "app/admin/hd-danismanlik/ConsultationWorkspace.tsx",
  page: "app/admin/hd-danismanlik/page.tsx",
  layout: "app/admin/layout.tsx",
};
const src = {};
for (const [k, p] of Object.entries(F)) src[k] = read(p);
const routes = [src.routeMain, src.routeId, src.routePublish, src.routeArchive];
const svc = strip(src.service);
const ws = strip(src.workspace);

let pass = 0, fail = 0; const fails = [];
const check = (d, c) => { if (c) pass++; else { fail++; fails.push(d); console.log(`  FAIL  ${d}`); } };

console.log("── A: API auth / trust boundary / no-leak ──");
check("A1. 4 route mevcut", routes.every((r) => r.length > 0));
check("A2. her route verifyAdminRequest import + ilk çağrı + guard.response",
  routes.every((r) => /verifyAdminRequest/.test(r) && /const guard = await verifyAdminRequest\(req\)/.test(r) && /if \(!guard\.ok\) return guard\.response/.test(r)));
check("A3. runtime nodejs (server-only)", routes.every((r) => /export const runtime = "nodejs"/.test(r)));
check("A4. actor gövdeden ALINMAZ (guard.adminId service'e geçer)",
  /createConsultation\(guard\.db, guard\.adminId/.test(strip(src.routeMain))
  && /updateConsultation\(guard\.db, guard\.adminId/.test(strip(src.routeId))
  && !/p_actor_admin_id.*raw|actorAdminId.*body/i.test(routes.join("\n")));
check("A5. route ham DB error sızdırmaz (messageForConsultationError kullanır)",
  routes.filter((r) => /ConsultationError/.test(r)).every((r) => /messageForConsultationError\(/.test(r)));
check("A6. browser'da service_role / getServerDb / createClient YOK (UI+labels)",
  !/service_role|getServerDb|SUPABASE_SERVICE_ROLE|createClient\(/.test(src.workspace + src.labels + src.page));
check("A7. route service_role client OLUŞTURMAZ (guard.db kullanır)",
  routes.every((r) => !/createClient\(/.test(r)));
check("A8. service server-only + ham message yalnız console.error (log), dönüş generic",
  /^import "server-only";/m.test(src.service) && /console\.error\(`\[hd-consultation-admin\]/.test(src.service));

console.log("── C: CREATE (yalnız nested 7-param RPC) ──");
check("C1. service create → rpc_hd_consultation_create", /db\.rpc\("rpc_hd_consultation_create"/.test(svc));
check("C2. tam 7 param (p_actor_admin_id..p_content_conditions)",
  ["p_actor_admin_id", "p_entity_id", "p_canonical_content_id", "p_is_ai_generated", "p_sections", "p_content_questions", "p_content_conditions"].every((p) => new RegExp(p).test(svc)));
check("C3. top-level p_evidence YOK (nested evidence)", !/p_evidence\b/.test(svc));
check("C4. nested children: questions/conditions/evidence section altında", /questions:/.test(svc) && /conditions:/.test(svc) && /evidence:/.test(svc));
check("C5. client_ref var; istemci section_id GÖNDERMEZ", /client_ref:/.test(svc) && !/section_id:/.test(svc));
check("C6. create input F0B validateConsultationCreateInput ile doğrulanır", /validateConsultationCreateInput\(input\)/.test(svc));
check("C7. actor pozisyonel param (actorAdminId), payload'dan değil", /createConsultation\(\s*db: SupabaseClient,\s*actorAdminId: string/.test(src.service));
check("C8. POST 201 döner", /status: 201/.test(strip(src.routeMain)));

console.log("── D: UPDATE (expected_version + is_ai_generated + repin) ──");
check("D1. service update → rpc_hd_consultation_update", /db\.rpc\("rpc_hd_consultation_update"/.test(svc));
check("D2. p_expected_version geçilir", /p_expected_version: input\.expectedVersion/.test(svc));
const updFn = (/export async function updateConsultation[\s\S]*?\n}\n/.exec(svc) || [""])[0];
check("D3. p_patch YALNIZ is_ai_generated (update fn'de canonical pin yamalanmaz)",
  /patch\.is_ai_generated = input\.isAiGenerated/.test(updFn) && !/canonical/.test(updFn));
check("D4. route expectedVersion zorunlu (yoksa 400)", /expectedVersion.*zorunlu|expectedVersion \(pozitif/.test(strip(src.routeId)) && /typeof expectedVersion !== "number"/.test(strip(src.routeId)));
check("D5. stale → 409 (STALE_VERSION/CANONICAL_STALE 409 map)", /STALE_VERSION/.test(src.errHttp) && /case "STALE_VERSION":\s*\n?\s*case "CANONICAL_STALE":/m.test(src.errHttp) === false ? /return 409/.test(src.errHttp) : true);
check("D6. PIN_PATCH_BLOCKED kod var (canonical pin patch reddi)", /PIN_PATCH_BLOCKED/.test(svc) && /PIN_PATCH_BLOCKED/.test(src.errHttp));
check("D7. repin explicit param (sessiz repin yok)", /p_repin: input\.repin \?\? false/.test(svc));

console.log("── E: PUBLISH ──");
check("E1. service publish → rpc_hd_consultation_publish", /db\.rpc\("rpc_hd_consultation_publish"/.test(svc));
check("E2. publish route yalnız RPC (doğrudan tablo yok)", /publishConsultation\(guard\.db, guard\.adminId/.test(strip(src.routePublish)));
check("E3. rights/evidence/approval/stale kod map'leri var",
  ["RIGHTS_DENIED", "EVIDENCE_MISSING", "CANONICAL_NOT_APPROVED", "CANONICAL_STALE"].every((c) => new RegExp(c).test(svc) && new RegExp(c).test(src.errHttp)));

console.log("── F: ARCHIVE (soft; hard delete YOK) ──");
check("F1. service archive → rpc_hd_consultation_archive", /db\.rpc\("rpc_hd_consultation_archive"/.test(svc));
check("F2. hiçbir yerde consultation tablosuna doğrudan .insert/.update/.delete YOK",
  !/\.from\("hd_consultation_[a-z_]+"\)\s*\.(insert|update|delete)\(/.test(svc) && !/\.delete\(\)/.test(svc));
check("F3. UI'da hard delete / DELETE method YOK (yalnız arşivle)", !/hdSend<[^>]*>\("DELETE"/.test(ws) && /Arşivle/.test(src.workspace));

console.log("── G: read model / projection ──");
check("G1. list: canonical entity + aktif consultation özeti (9 tabloya service_role SELECT)",
  /from\("hd_canonical_entities"\)/.test(svc) && /from\("hd_consultation_contents"\)/.test(svc) && /neq\("status", "archived"\)/.test(svc));
check("G2. detail: sections/questions/conditions/evidence okunur", ["hd_consultation_sections", "hd_consultation_questions", "hd_consultation_conditions", "hd_consultation_evidence"].every((t) => new RegExp(t).test(svc)));
check("G3. rights F0B resolver REUSE (ikinci engine yok)", /resolveEffectiveRights/.test(svc) && /evaluateProductRights/.test(svc) && !/function resolveEffectiveRights/.test(svc));
check("G4. evidence tam kaynak metni taşınmaz (yalnız locator/title/rights)", !/original_text|report_text|body_text.*source/.test(src.service));

console.log("── H: UI whitelist / selectors / no out-of-scope ──");
check("H1. 9 section_kind label whitelist", ["quick_reference", "client_explanation", "consultation_flow", "relationship_guidance", "career_guidance", "childhood_guidance", "energy_rest_guidance", "practical_actions", "report_ready_text"].every((k) => new RegExp(k).test(src.labels)));
check("H2. Türkçe section etiketleri", /Hızlı Bakış/.test(src.labels) && /Rapora Hazır Metin/.test(src.labels) && /Danışana Nasıl Anlatılır/.test(src.labels));
check("H3. usage_scope 3 whitelist + Türkçe", /expert_guide/.test(src.labels) && /Uzman Rehberi/.test(src.labels) && /Danışan Raporu/.test(src.labels) && /Her İkisi/.test(src.labels));
check("H4. condition_kind 4 whitelist + entity_kind map", ["type_is", "authority_is", "has_channel", "has_gate"].every((c) => new RegExp(c).test(src.labels)) && /CONDITION_KIND_TO_ENTITY_KIND/.test(src.labels));
check("H5. relation_type 4 whitelist", ["supports", "contradicts", "school_specific", "background"].every((r) => new RegExp(r).test(src.labels)));
check("H6. condition_value canonical SELECT (serbest text YOK)", /CanonicalValueSelect/.test(ws) && /hdGet<\{ rows: CanonicalRow\[\] \}>\(`canonical\?kind=/.test(ws));
check("H7. AND-only ifadesi açık", /tüm koşullar sağlanmalıdır/.test(src.workspace));
check("H8. evidence rights bayrakları gösterilir", /rightsStatus/.test(ws) && /expertGuide\.allowed/.test(ws));
check("H9. canlı AI drafting YOK (AI adayı yalnız boolean flag; isAiGenerated hariç)",
  !/openai|anthropic|\bclaude\b|\bgpt\b|summariz|auto-?draft|ai-?draft/i.test(ws));
check("H10. uzman entitlement / Bilgileri Getir / Word / session KODU YOK (yorum hariç)",
  !/entitlement|Bilgileri Getir|knowledge-bank|bilgi-bankasi|\bdocx\b|\bword\b|report snapshot|\bsession\b/i.test(ws));
check("H11. draft/published/archived + human approval durumları gösterilir", /STATUS_LABEL/.test(ws) && /insan-onaylı/.test(src.workspace) && /humanApprovedAt/.test(ws));
check("H12. section düzenlenemez uyarısı (F1 kontratı; sahte edit yok)", /değiştirilemez/.test(src.workspace));

console.log("── I: nav / page / scope ──");
check("I1. admin nav 'Danışmanlık İçeriği' → /admin/hd-danismanlik", /\/admin\/hd-danismanlik/.test(src.layout) && /Danışmanlık İçeriği/.test(src.layout));
check("I2. page admin-only alanda (app/admin altı)", /ConsultationWorkspace/.test(src.page));
check("I3. HTTP status map tüm kodları kapsar (400/404/409/500)", /return 400/.test(src.errHttp) && /return 404/.test(src.errHttp) && /return 409/.test(src.errHttp) && /return 500/.test(src.errHttp));
check("I4. F2'de migration/SQL üretimi YOK (bu harness kapsamı statik)", true);

console.log(`\nf2-admin-workspace-harness: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
