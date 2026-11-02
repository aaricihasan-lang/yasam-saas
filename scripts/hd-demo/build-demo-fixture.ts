/**
 * D3 — Human Design DEMO örneğini üretir (owner kararı 2026-11-02).
 *
 *   İlk kurulum (yalnız bir kez, ham kayıt depo DIŞINDA):
 *     npx tsx --tsconfig scripts/tsconfig.demo-vitrin-tests.json scripts/hd-demo/build-demo-fixture.ts --from-raw <ham.json>
 *   Yeniden üretim / CI denetimi (ağ yok, anahtar yok):
 *     npx tsx --tsconfig scripts/tsconfig.demo-vitrin-tests.json scripts/hd-demo/build-demo-fixture.ts [--check]
 *
 * Akış:
 *   1) Kayıtlı Roxy yanıtları ÜRETİMİN doğrulayıcılarından geçer (verifyRecorded: şema, normalize, Design anı, yerel motor 26/26,
 *      Dört Ok yerel çapraz denetim, Connection/Penta tutarlılığı). Biri bile geçmezse DURUR.
 *   2) --from-raw: lisanslı açıklama metinleri ayıklanır (sanitize.ts) → scripts/hd-demo/roxy-demo-structural.json (depoya giren
 *      tek kayıt; metinsiz). Ayıklanmış kayıt da aynı doğrulamalardan geçer.
 *   3) Kayıt satırları üretimin yazdığı alanlarla kurulur (roxyChartService / relationService / variablesStore ile aynı) ve
 *      GERÇEK okuma servisleri salt okunur bellek içi DB üzerinde çalıştırılır → her demo okuma isteğinin yanıtı kaydedilir.
 *   4) Sızıntı denetimi: çıktıda sağlayıcı açıklama metni yok (--from-raw'da ham metinlerle birebir arama; her modda uzun metin
 *      yalnız yerel içerikten gelebilir — ayıklanmış kayıtta 40+ karakterlik dize yok).
 *   5) lib/human-design/demo/fixture.generated.ts — TEK METİN SABİTİ (D8 deseni; büyük JSON içe aktarımı tip denetiminde OOM yapar).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROXY_BODYGRAPH_ENDPOINT, ROXY_CONNECTION_ADAPTER_VERSION, ROXY_CONNECTION_ENDPOINT, ROXY_PENTA_ADAPTER_VERSION, ROXY_PENTA_ENDPOINT, ROXY_POLICY, ROXY_PROVIDER_ID } from "@/lib/human-design/providers/roxy/config";
import { ROXY_CONTRACT_VERSION, ROXY_ENGINE_VERSION } from "@/lib/human-design/api/roxyChartService";
import { getComputedChart, listComputedCharts, listManualChartsWithClients, getManualChartByClient } from "@/lib/human-design/api/chartPersistence";
import { getHdClient, listHdClients } from "@/lib/human-design/api/clientPersistence";
import { getHdJourneyInfo } from "@/lib/human-design/api/journeyLink";
import { listHdAnalysisGroups } from "@/lib/human-design/api/hdAnalysisList";
import { getChartSystemReading } from "@/lib/human-design/api/systemReadingService";
import { readSavedChartVariables } from "@/lib/human-design/variables/variablesService";
import { ROXY_VARIABLES_ADAPTER_VERSION, ROXY_VARIABLES_ENDPOINT } from "@/lib/human-design/variables/roxyVariablesClient";
import { getRelationAnalysis, listRelationAnalyses, listRelationCandidates, RELATION_ANALYSES, RELATION_PARTICIPANTS } from "@/lib/human-design/relations/relationService";
import { listRelationReports, relationKnowledge } from "@/lib/human-design/relations/relationExtras";
import { connectionExplanations, pentaExplanations } from "@/lib/human-design/relations/explanations";
import { validateRoxyConnection, type HdConnectionResult } from "@/lib/human-design/relations/connection";
import { validateRoxyPenta, type HdPentaResult } from "@/lib/human-design/relations/penta";
import { DEMO_CONNECTION, DEMO_PENTA, DEMO_PEOPLE } from "./demoPeople";
import { verifyRecorded, type Recorded } from "./verifyRecorded";
import { longStrings, sanitizeProviderTexts } from "./sanitize";
import { memoryDb } from "./memoryDb";

const ROOT = resolve(__dirname, "../..");
const STRUCTURAL = resolve(__dirname, "roxy-demo-structural.json");
const OUT = resolve(ROOT, "lib/human-design/demo/fixture.generated.ts");

// Sabit demo kimlikleri (gerçek tenant / kullanıcı DEĞİL; yanıtlarda görünür, hiçbir gerçek kayda karşılık gelmez).
export const DEMO_TENANT_ID = "d3d00000-0000-4000-8000-000000000000";
const DEMO_USER_ID = "d3f00000-0000-4000-8000-000000000000";
const letter = (k: string) => k.toLowerCase();
export const demoClientId = (k: string) => `d3c00000-0000-4000-8000-00000000000${letter(k)}`;
export const demoChartId = (k: string) => `d3a00000-0000-4000-8000-00000000000${letter(k)}`;
export const DEMO_CONNECTION_ID = "d3e00000-0000-4000-8000-000000000001";
export const DEMO_PENTA_ID = "d3e00000-0000-4000-8000-000000000002";
const BASE_MS = Date.parse("2026-11-02T08:00:00.000Z");
const at = (minutes: number) => new Date(BASE_MS + minutes * 60_000).toISOString();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

type Resp = { status: number; body: unknown };

function canonicalKey(method: string, path: string, query: Record<string, string> = {}): string {
  const qs = Object.keys(query).sort().map((k) => `${k}=${query[k]}`).join("&");
  return `${method} ${path}${qs ? `?${qs}` : ""}`;
}

async function build(rec: Recorded): Promise<{ json: string; report: string[] }> {
  const v = verifyRecorded(rec);
  const people = v.people;
  const tables: Record<string, Record<string, unknown>[]> = {
    human_design_clients: [],
    human_design_charts: [],
    human_design_chart_variables: [],
    [RELATION_ANALYSES]: [],
    [RELATION_PARTICIPANTS]: [],
  };
  people.forEach((p, i) => {
    const k = p.person.key;
    const inputHash = sha(`hd-demo-d3|${JSON.stringify(p.input)}`);
    tables.human_design_clients.push({
      id: demoClientId(k),
      tenant_id: DEMO_TENANT_ID,
      user_id: DEMO_USER_ID,
      name: p.person.name,
      birth_date: p.person.date,
      birth_time: p.person.time,
      birth_place: p.district.label,
      birth_location_id: p.district.id,
      birth_location_label: p.district.label,
      birth_timezone: p.district.tz,
      birth_latitude: p.district.lat,
      birth_longitude: p.district.lon,
      journey_client_id: null,
      chart_image_url: null,
      external_chart_url: null,
      notes: null,
      created_at: at(i),
      updated_at: at(i),
    });
    // roxyChartService insert payload ile aynı alanlar (+ DB varsayılanları).
    tables.human_design_charts.push({
      id: demoChartId(k),
      tenant_id: DEMO_TENANT_ID,
      user_id: DEMO_USER_ID,
      client_id: demoClientId(k),
      client_name: p.person.name,
      source: "computed",
      provider: ROXY_PROVIDER_ID,
      birth_date: p.person.date,
      birth_time: p.input.time,
      birth_place: p.district.label,
      timezone: p.district.tz,
      location_id: p.district.id,
      input: p.input,
      computed_result: p.chart.chart,
      provider_raw: p.bodygraphRaw,
      input_hash: inputHash,
      engine_version: ROXY_ENGINE_VERSION,
      contract_version: ROXY_CONTRACT_VERSION,
      type_code: p.chart.codes.type_code,
      authority_code: p.chart.codes.authority_code,
      profile_code: p.chart.codes.profile_code,
      definition_code: p.chart.codes.definition_code,
      active_centers: p.chart.codes.active_centers,
      open_centers: p.chart.codes.open_centers,
      gates: p.chart.codes.gates,
      channels: p.chart.codes.channels,
      external_chart_url: null,
      chart_image_url: null,
      notes: null,
      created_at: at(10 + i),
      updated_at: at(10 + i),
    });
    // variablesStore satırı — anahtar variablesService ile AYNI formül.
    const cacheKey = sha([ROXY_VARIABLES_ADAPTER_VERSION, ROXY_POLICY.nodeType, ROXY_POLICY.lang, DEMO_TENANT_ID, demoChartId(k), inputHash, p.birthUtcIso].join("|"));
    tables.human_design_chart_variables.push({
      tenant_id: DEMO_TENANT_ID,
      chart_id: demoChartId(k),
      cache_key: cacheKey,
      provider: ROXY_PROVIDER_ID,
      endpoint: ROXY_VARIABLES_ENDPOINT,
      adapter_version: ROXY_VARIABLES_ADAPTER_VERSION,
      node_type: ROXY_POLICY.nodeType,
      lang: ROXY_POLICY.lang,
      chart_input_hash: inputHash,
      utc_offset_seconds: p.utcOffsetSeconds,
      result: p.variablesRaw,
      created_by: DEMO_USER_ID,
      created_at: at(20 + i),
      updated_at: at(20 + i),
    });
  });
  const chartRow = (k: string) => tables.human_design_charts.find((c) => c.id === demoChartId(k))!;
  const relation = (id: string, kind: "connection" | "penta", keys: readonly string[], result: unknown, raw: unknown, relationType: string, minute: number) => {
    tables[RELATION_ANALYSES].push({
      id,
      tenant_id: DEMO_TENANT_ID,
      user_id: DEMO_USER_ID,
      kind,
      member_count: keys.length,
      relation_type: relationType,
      provider: ROXY_PROVIDER_ID,
      endpoint: kind === "connection" ? ROXY_CONNECTION_ENDPOINT : ROXY_PENTA_ENDPOINT,
      adapter_version: kind === "connection" ? ROXY_CONNECTION_ADAPTER_VERSION : ROXY_PENTA_ADAPTER_VERSION,
      node_type: ROXY_POLICY.nodeType,
      lang: ROXY_POLICY.lang,
      input_hash: sha(`hd-demo-d3|${kind}|${keys.join(",")}`),
      result,
      provider_raw: raw,
      expert_comment: null,
      expert_comment_updated_at: null,
      expert_comment_updated_by: null,
      created_at: at(minute),
      updated_at: at(minute),
    });
    keys.forEach((k, position) => {
      const c = chartRow(k);
      tables[RELATION_PARTICIPANTS].push({
        analysis_id: id,
        tenant_id: DEMO_TENANT_ID,
        position,
        client_id: demoClientId(k),
        client_name: c.client_name,
        source_chart_id: c.id,
        source_input_hash: c.input_hash,
        created_at: at(minute),
      });
    });
  };
  const cv = validateRoxyConnection(v.connectionRaw);
  const pv = validateRoxyPenta(v.pentaRaw, DEMO_PENTA.length);
  if (!cv.ok || !pv.ok) throw new Error("ilişki doğrulaması (beklenmeyen)");
  relation(DEMO_CONNECTION_ID, "connection", DEMO_CONNECTION, cv.value, v.connectionRaw, "business", 40);
  relation(DEMO_PENTA_ID, "penta", DEMO_PENTA, pv.value, v.pentaRaw, "team", 41);

  // ── Gerçek okuma servisleri (salt okunur DB) ─────────────────────────────────────────────────────────────────
  const db = memoryDb(tables) as SupabaseClient;
  const ctx = { db, tenantId: DEMO_TENANT_ID, userId: DEMO_USER_ID, isDemo: false };
  const responses: Record<string, Resp> = {};
  const put = (key: string, status: number, body: unknown) => {
    if (responses[key]) throw new Error(`yinelenen yanıt anahtarı ${key}`);
    responses[key] = { status, body };
  };
  const must = <T extends { error: string | null }>(r: T, what: string): T => {
    if (r.error) throw new Error(`${what}: ${r.error}`);
    return r;
  };

  // /api/hd/analyses — tüm satırlar (sayfalama / arama çalışma anında saf olarak uygulanır)
  const groups = await listHdAnalysisGroups(db, DEMO_TENANT_ID, { limit: 50 });
  if (!groups.ok) throw new Error(`analyses: ${groups.error}`);
  const analysisRows = groups.rows;

  // /api/hd/charts
  put(canonicalKey("GET", "charts"), 200, { ok: true, data: must(await listComputedCharts(db, DEMO_TENANT_ID), "charts").rows });
  put(canonicalKey("GET", "charts", { scope: "manual" }), 200, { ok: true, rows: must(await listManualChartsWithClients(db, DEMO_TENANT_ID), "manual").rows });
  put(canonicalKey("GET", "clients"), 200, { ok: true, rows: must(await listHdClients(db, DEMO_TENANT_ID), "clients").rows });
  for (const p of people) {
    const k = p.person.key;
    const chartId = demoChartId(k);
    const clientId = demoClientId(k);
    put(canonicalKey("GET", "charts", { client_id: clientId }), 200, { ok: true, data: must(await listComputedCharts(db, DEMO_TENANT_ID, { clientId }), "charts.client").rows });
    put(canonicalKey("GET", "charts", { scope: "manual", client_id: clientId }), 200, { ok: true, row: must(await getManualChartByClient(db, DEMO_TENANT_ID, clientId), "manual.client").row });
    const g = must(await getComputedChart(db, DEMO_TENANT_ID, chartId), "chart");
    if (!g.row) throw new Error(`chart ${k} okunamadı`);
    put(canonicalKey("GET", "charts", { id: chartId }), 200, { ok: true, data: g.row });
    const sr = await getChartSystemReading(db, DEMO_TENANT_ID, chartId);
    if (sr.status !== 200 || !("available" in sr.body) || sr.body.available !== true) throw new Error(`system reading ${k}: ${JSON.stringify(sr.body).slice(0, 200)}`);
    put(canonicalKey("GET", "charts/system-reading", { id: chartId }), sr.status, sr.body);
    const vr = await readSavedChartVariables(ctx, { chart_id: chartId }, { log: (m, d) => console.error(m, d ?? "") });
    if (vr.status !== 200 || !vr.body.ok || !("found" in vr.body) || vr.body.found !== true) throw new Error(`variables ${k}: ${JSON.stringify(vr.body).slice(0, 300)}`);
    put(canonicalKey("POST", "charts/variables/saved", { chart_id: chartId }), vr.status, vr.body);
    const c = must(await getHdClient(db, DEMO_TENANT_ID, clientId), "client");
    if (!c.row) throw new Error(`client ${k}`);
    const { info } = await getHdJourneyInfo(db, DEMO_TENANT_ID, c.row as { name?: string | null; birth_date?: string | null; journey_client_id?: string | null });
    put(canonicalKey("GET", "clients", { id: clientId }), 200, { ok: true, row: c.row, journey: info.journey, journey_suggestions: info.suggestions });
    const rl = await listRelationAnalyses(ctx, { clientId });
    if (!rl.ok) throw new Error(`relations.client ${k}`);
    put(canonicalKey("GET", "relations", { client_id: clientId }), 200, { ok: true, rows: rl.rows });
  }

  // /api/hd/relations
  const rl = await listRelationAnalyses(ctx, { clientId: null });
  if (!rl.ok || rl.rows.length !== 2) throw new Error("relations listesi");
  put(canonicalKey("GET", "relations"), 200, { ok: true, rows: rl.rows });
  const cand = await listRelationCandidates(ctx);
  if (!cand.ok) throw new Error("relations.candidates");
  put(canonicalKey("GET", "relations/candidates"), 200, { ok: true, rows: cand.rows });
  for (const id of [DEMO_CONNECTION_ID, DEMO_PENTA_ID]) {
    const g = await getRelationAnalysis(ctx, id);
    if (!g.body.ok) throw new Error(`relation ${id}: ${JSON.stringify(g.body)}`);
    put(canonicalKey("GET", `relations/${id}`), g.status, g.body);
    const a = g.body.analysis;
    const names = a.participants.map((p) => p.name);
    const analysis = a.kind === "connection" ? connectionExplanations(a.result as HdConnectionResult, names[0], names[1]) : pentaExplanations(a.result as HdPentaResult, names);
    const kn = await relationKnowledge(ctx, a, { forReport: false });
    if (!kn.ok) throw new Error(`relation knowledge ${id}`);
    // Uzman (admin olmayan) yanıtı ile aynı: central null, systemReading null.
    put(canonicalKey("GET", `relations/${id}/knowledge`), 200, { ok: true, analysis, expert: kn.groups, central: null, systemReading: null });
    const rr = await listRelationReports(ctx, id);
    put(canonicalKey("GET", `relations/${id}/reports`), rr.status, rr.body);
  }
  put(canonicalKey("GET", "journey-clients"), 200, { ok: true, rows: [] });

  const out = {
    note: "D3 Human Design demo örneği — SENTETİK kişiler; gerçek RoxyAPI yanıtları (2026-11-02, 12 çağrı) üretim doğrulayıcılarından geçti; sağlayıcı açıklama metinleri ayıklandı. Elle düzenlemeyin: scripts/hd-demo/build-demo-fixture.ts.",
    people: people.map((p) => ({ key: p.person.key, name: p.person.name, clientId: demoClientId(p.person.key), chartId: demoChartId(p.person.key) })),
    relationIds: [DEMO_CONNECTION_ID, DEMO_PENTA_ID],
    analysisRows,
    responses,
  };
  return { json: JSON.stringify(out), report: v.report };
}

function emit(json: string): string {
  return `// Bu dosya scripts/hd-demo/build-demo-fixture.ts ile ÜRETİLİR — elle düzenlemeyin.\n// D3 Human Design demo örneği (sentetik kişiler; doğrulanmış kayıtlı yanıtlar; sağlayıcı açıklama metni yok).\nconst HD_DEMO_FIXTURE_JSON = ${JSON.stringify(json)};\nexport default HD_DEMO_FIXTURE_JSON;\n`;
}

async function main(): Promise<void> {
  const fromRawIdx = process.argv.indexOf("--from-raw");
  const check = process.argv.includes("--check");
  let structural: Recorded;
  let rawTexts: string[] = [];
  if (fromRawIdx > 0) {
    const raw = JSON.parse(readFileSync(resolve(process.argv[fromRawIdx + 1]), "utf8")) as Recorded;
    const rv = verifyRecorded(raw);
    console.log(`Ham kayıt doğrulaması:\n  ${rv.report.join("\n  ")}`);
    structural = {
      ...raw,
      note: "D3 Human Design demo — SENTETİK kişiler için gerçek RoxyAPI yanıtlarının METİNSİZ yapısal kopyası (2026-11-02, 12 çağrı; açıklama metinleri lisans gereği ayıklandı). Elle düzenlemeyin.",
      entries: raw.entries.map((e) => ({ ...e, raw: sanitizeProviderTexts(e.raw) })),
    } as Recorded & { note: string };
    const collect = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(collect);
      else if (x && typeof x === "object") Object.values(x).forEach(collect);
      else if (typeof x === "string" && x.length >= 30) rawTexts.push(x);
    };
    raw.entries.forEach((e) => collect(e.raw));
    writeFileSync(STRUCTURAL, `${JSON.stringify(structural, null, 1)}\n`);
    console.log("Yapısal (metinsiz) kayıt yazıldı: scripts/hd-demo/roxy-demo-structural.json");
  } else {
    if (!existsSync(STRUCTURAL)) throw new Error("roxy-demo-structural.json yok");
    structural = JSON.parse(readFileSync(STRUCTURAL, "utf8")) as Recorded;
  }
  const leftovers = structural.entries.flatMap((e) => longStrings(e.raw, 40).map((s) => `${e.label} ${s}`));
  if (leftovers.length) throw new Error(`Yapısal kayıtta uzun sağlayıcı metni kaldı: ${leftovers.slice(0, 5).join("; ")}`);

  const { json, report } = await build(structural);
  const keptInStructural = new Set<string>();
  structural.entries.forEach((e) => {
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") Object.values(x).forEach(walk);
      else if (typeof x === "string") keptInStructural.add(x);
    };
    walk(e.raw);
  });
  const leaks = rawTexts.filter((t) => !keptInStructural.has(t) && json.includes(JSON.stringify(t).slice(1, -1)));
  if (leaks.length) throw new Error(`SIZINTI: ${leaks.length} sağlayıcı metni çıktıda`);
  const text = emit(json);
  console.log(`Yapısal kayıt doğrulaması:\n  ${report.join("\n  ")}`);
  if (check) {
    const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (cur !== text) {
      console.error("FAIL: lib/human-design/demo/fixture.generated.ts güncel değil (build-demo-fixture.ts ile yeniden üretin).");
      process.exit(1);
    }
    console.log("PASS: demo örneği yeniden üretildi ve depodakiyle birebir aynı.");
    return;
  }
  writeFileSync(OUT, text);
  console.log(`Yazıldı: lib/human-design/demo/fixture.generated.ts (${(text.length / 1024).toFixed(0)} KB)`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.stack ?? e.message : e);
    process.exit(1);
  });
}
