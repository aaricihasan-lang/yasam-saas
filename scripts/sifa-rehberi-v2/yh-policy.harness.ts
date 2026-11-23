/**
 * Şifa Rehberi V2 — YH SAHİPLİK POLİTİKASI zorlayıcı harness'ı (10. aşama; docs/sifa-rehberi-v2/yh-entegrasyon-karari.md).
 * Ağ / DB YOK (saf + kaynak denetimi). Çalıştır: npx tsx scripts/sifa-rehberi-v2/yh-policy.harness.ts
 *   - V2'den YALNIZ kişisel notlar (sifa_topic_blocks, scope 'kisisel', owner_key) indekslenir; kurum kopyası/diğer V2 tabloları YOK.
 *   - Görünürlük: sahipli aday yalnız sahibine + kendi tenant'ında; oturum kullanıcısı yoksa görünmez.
 *   - Oluşturucu: sahip UUID değilse / tenant'a eşitse birim YOK; sahipsiz kaynakların yazma satırı DEĞİŞMEDİ.
 *   - Arama: kullanıcısız çağrı v3'ü denemez (eski zincir aynen); v3 yoksa v2 (sahipli satırsız).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { YH_INDEX_SOURCES, type SourceConfig } from "@/lib/yasam-hafizasi/indexer/sources";
import { YH_MODULE_SOURCE_MATRIX, validateModuleSourceMatrix } from "@/lib/yasam-hafizasi/moduleSourceMatrix";
import { YH_ACTIVATION_MATRIX, validateActivationMatrix } from "@/lib/yasam-hafizasi/activation/activationMatrix";
import { evaluateVisibility, type VisibilityCandidate } from "@/lib/yasam-hafizasi/search/visibilityScope";
import { buildIndexUnit } from "@/lib/yasam-hafizasi/indexer/buildCandidate";
import { toDbIndexRow } from "@/lib/yasam-hafizasi/indexer/indexWritePlan";
import { createSupabaseRetrievalRpcPort, type RetrievalDbClient } from "@/lib/yasam-hafizasi/search/supabaseRetrievalAdapter";

let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${!c && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
const V2_TABLES = ["sifa_topics", "sifa_topic_blocks", "sifa_block_sources", "sifa_topic_links", "sifa_block_assets", "sifa_legacy_import_map"];
const T = "11111111-1111-4111-8111-111111111111";
const U1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function main() {
  console.log("1) Kayıt / matris politikası");
  const v2src = (YH_INDEX_SOURCES as readonly SourceConfig[]).filter((s) => V2_TABLES.includes(s.tableName));
  ok(v2src.length === 1 && v2src[0].sourceKey === "sifa_rehberi_v2:notes" && v2src[0].tableName === "sifa_topic_blocks", "V2'den TEK kaynak: sifa_rehberi_v2:notes (sifa_topic_blocks)", v2src.map((s) => s.sourceKey));
  const n = v2src[0];
  ok(n.ownerColumn === "owner_key" && n.statusColumn === "scope" && JSON.stringify(n.eligibleStatuses) === JSON.stringify(["kisisel"]), "sahip kolonu owner_key + satır kapısı scope='kisisel' (kurum kopyası indekslenmez)");
  ok(n.tenant.mode === "column" && n.classification === "safe-non-pii" && n.unit === "record", "tenant kolonu + safe-non-pii + record");
  ok((YH_INDEX_SOURCES as readonly SourceConfig[]).filter((s) => s.ownerColumn).length === 1, "ownerColumn YALNIZ bu kaynakta (diğer kaynakların davranışı aynen)");
  const act = YH_ACTIVATION_MATRIX.find((a) => a.sourceKey === "sifa_rehberi_v2:notes");
  ok(act?.activationClass === "FUTURE_ONLY_READY" && act.scope === "professional", "aktivasyon: CONTROLLED (FUTURE_ONLY_READY) — DB is_active olmadan işlenmez");
  const sifa = YH_MODULE_SOURCE_MATRIX.find((m) => m.moduleKey === "sifa_rehberi");
  ok(!!sifa && sifa.professionalSourceKeys.includes("sifa_rehberi:guides") && sifa.professionalSourceKeys.includes("sifa_rehberi:guide-sections") && sifa.clientSourceKeys.length === 0, "V1 kaynakları korunuyor; danışan kaynağı yok");
  let valid = true;
  try {
    validateModuleSourceMatrix();
    validateActivationMatrix();
  } catch (e) {
    valid = false;
    console.log(String(e));
  }
  ok(valid, "YH matris doğrulayıcıları geçer");

  console.log("2) Görünürlük kararı (evaluateVisibility)");
  const cand = (owner?: string | null, tenant: string | null = T): VisibilityCandidate => ({ tenantId: tenant, isClientPii: false, isDemoTenant: false, isDemoSource: false, sourceModule: "sifa_rehberi", sourceId: U1, ...(owner !== undefined ? { ownerUserId: owner } : {}) });
  const noStone = async () => false;
  const vis = async (c: VisibilityCandidate, me?: string, tenant = T) => (await evaluateVisibility(c, { sessionTenantId: tenant, allowShared: false, ...(me ? { sessionUserId: me } : {}) }, noStone)).visible;
  ok(await vis(cand(U1), U1), "sahibi kendi notunu görür");
  ok(!(await vis(cand(U1), U2)), "aynı tenant'taki başka uzman GÖREMEZ");
  ok(!(await vis(cand(U1))), "oturum kullanıcısı yoksa sahipli aday GÖRÜNMEZ");
  ok(!(await vis(cand(U1), U1, "22222222-2222-4222-8222-222222222222")), "başka tenant oturumu (aynı kullanıcı kimliği) GÖREMEZ");
  ok(!(await vis(cand(""), U1)), "bozuk sahip değeri → görünmez (fail-closed)");
  ok(await vis(cand(null), U2) && (await vis(cand(undefined), U2)), "sahipsiz (tenant geneli) aday bugünkü gibi görünür");

  console.log("3) Oluşturucu + yazma satırı");
  const row = { id: U2, tenant_id: T, owner_key: U1, scope: "kisisel", title: "Not", content_text: "metin", classification: null, updated_at: "2026-11-21T10:00:00Z", topic_id: U2, deleted_at: null };
  const ext = { evidenceFields: [{ origin: "content_text", kind: "body", text: "metin" }], topicTags: [], expertRelations: [] } as never;
  const unit = buildIndexUnit(n, row, { ok: true, tenantId: T } as never, ext);
  ok(unit?.ownerUserId === U1 && toDbIndexRow(unit!).owner_user_id === U1, "kişisel not → owner_user_id = owner_key");
  ok(buildIndexUnit(n, { ...row, owner_key: T }, { ok: true, tenantId: T } as never, ext) === null, "owner_key = tenant (kurum kaydı) → birim YOK");
  ok(buildIndexUnit(n, { ...row, owner_key: "x" }, { ok: true, tenantId: T } as never, ext) === null, "geçersiz sahip → birim YOK");
  const v1 = (YH_INDEX_SOURCES as readonly SourceConfig[]).find((s) => s.sourceKey === "sifa_rehberi:guides")!;
  const u1 = buildIndexUnit(v1, { id: U2, tenant_id: T, name: "V1", general_summary: "ozet", updated_at: null }, { ok: true, tenantId: T } as never, ext);
  ok(!!u1 && !("ownerUserId" in u1) && !("owner_user_id" in toDbIndexRow(u1)), "sahipsiz kaynak (V1): yazma satırında owner_user_id ANAHTARI YOK (yük bayt bayt aynı)");

  console.log("4) Arama RPC zinciri (sahte DB)");
  const calls: string[] = [];
  const fake = (missing: string[]): RetrievalDbClient => ({
    from: () => ({ select: () => ({}) as never }) as never,
    rpc: async (fn: string, params: Record<string, unknown>) => {
      calls.push(`${fn}${"p_session_user" in params ? `(user=${params.p_session_user})` : ""}`);
      return missing.includes(fn) ? { data: null, error: { message: "x", code: "PGRST202" } } : { data: [], error: null };
    },
  });
  const base = { tsquery: "a", sessionTenantId: T, allowShared: false, weights: [1, 0.6, 0.35, 0.15] as [number, number, number, number], limit: 10, modules: null };
  calls.length = 0;
  await createSupabaseRetrievalRpcPort(fake([]))(base);
  ok(JSON.stringify(calls) === JSON.stringify(["yh_search_candidates_v2"]), "kullanıcısız çağrı: v3 DENENMEZ, bugünkü v2 (eski sözleşme aynen)", calls);
  calls.length = 0;
  await createSupabaseRetrievalRpcPort(fake([]))({ ...base, sessionUserId: U1 });
  ok(JSON.stringify(calls) === JSON.stringify([`yh_search_candidates_v3(user=${U1})`]), "oturum kullanıcısı: v3 + p_session_user", calls);
  calls.length = 0;
  await createSupabaseRetrievalRpcPort(fake(["yh_search_candidates_v3"]))({ ...base, sessionUserId: U1 });
  ok(JSON.stringify(calls) === JSON.stringify([`yh_search_candidates_v3(user=${U1})`, "yh_search_candidates_v2"]), "v3 yok → v2'ye düşer (sahipli satırsız; fail-closed)", calls);

  console.log("5) Kaynak denetimi");
  const route = readFileSync(path.resolve("app/api/yasam-hafizasi/search/route.ts"), "utf8");
  ok(/sessionUserId: guard\.userId/.test(route) && !/sessionUserId:\s*(body|parsed|rawBody|req)/.test(route), "arama rotası kullanıcıyı YALNIZ oturumdan (guard.userId) alır");
  const mig = readFileSync(path.resolve("supabase/migrations/20280110000100_yh_owner_scope_sifa_v2.sql"), "utf8");
  ok(/WHEN \(NEW\.scope = 'kisisel'\)/.test(mig) && /WHEN \(OLD\.scope = 'kisisel'\)/.test(mig), "CDC tetikleyicileri yalnız kişisel satırlarda");
  ok(!/supabase\/migrations\/.*owner_scope/.test(mig) && !mig.includes("yh_source_activation_set("), "migration production aktivasyonu YAPMAZ (kaynak default OFF)");
}

main()
  .catch((e) => {
    fail++;
    console.log(String((e as Error).stack ?? e));
  })
  .finally(() => {
    console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  });
