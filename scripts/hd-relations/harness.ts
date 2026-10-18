/**
 * HD İLİŞKİ VE GRUP ANALİZLERİ (Connection + Penta) — servis/şema/rapor harness'i (SAF + sahte DB).
 * Gerçek DB / gerçek Roxy YOK. Sahte Roxy yanıtları scripts/hd-relations/fakeRelationRoxy.ts'ten
 * (sunucu doğrulayıcısından bağımsız üretici). Global fetch kilitli: herhangi bir ağ çağrısı FAIL.
 *
 * Çalıştır: npx tsx scripts/hd-relations/harness.ts
 */
import JSZip from "jszip";

let netCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  netCalls++;
  throw new Error("harness: ağ çağrısı yasak");
}) as typeof fetch;

import { createFakeDb } from "../hd-roxy/fakeDb";
import { engineChart, fakeConnectionResponse, fakePentaResponse, PEOPLE, type Moment } from "./fakeRelationRoxy";
import {
  checkConnectionConsistency,
  connectionDynamicFor,
  expectedConnection,
  validateRoxyConnection,
} from "../../lib/human-design/relations/connection";
import { checkPentaConsistency, validateRoxyPenta, PENTA_CHANNELS, PENTA_GATES, type HdPentaResult } from "../../lib/human-design/relations/penta";
import {
  createRelationAnalysis,
  deleteRelationAnalysis,
  getRelationAnalysis,
  listRelationAnalyses,
  listRelationCandidates,
  relationKindForCount,
  participantChartFacts,
  type RelationServiceDeps,
} from "../../lib/human-design/relations/relationService";
import { renderRelationReportBuffer, relationReportFilename } from "../../lib/human-design/relations/relationReport";
import { createRelationReport, getRelationReportSnapshot } from "../../lib/human-design/relations/relationExtras";
import { callRoxyConnection, callRoxyPenta } from "../../lib/human-design/providers/roxy/relationClient";
import type { RoxyCallResult } from "../../lib/human-design/providers/roxy/client";
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ FAIL: ${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 400)}` : ""}`); }
}
const section = (t: string) => console.log(`\n[${t}]`);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const TA = "aaaaaaaa-0000-4000-8000-0000000000aa";
const TB = "bbbbbbbb-0000-4000-8000-0000000000bb";
const UA = "aaaaaaaa-0000-4000-8000-0000000000a1";
const cid = (n: number, t = "a") => `${t.repeat(8)}-0000-4000-8000-0000000c00${String(n).padStart(2, "0")}`;
const hid = (n: number, t = "a") => `${t.repeat(8)}-0000-4000-8000-0000000d00${String(n).padStart(2, "0")}`;
const NAMES = ["Ayşe Yılmaz", "Mehmet Kaya", "Zeynep Demir", "Ali Çelik", "Elif Şahin", "Can Öztürk"];

function seed() {
  const clients: Record<string, unknown>[] = [];
  const charts: Record<string, unknown>[] = [];
  PEOPLE.forEach((m, i) => {
    clients.push({ id: cid(i), tenant_id: TA, name: NAMES[i], birth_date: m.date, birth_time: m.time.slice(0, 5) });
    charts.push({
      id: hid(i), tenant_id: TA, client_id: cid(i), source: "computed", provider: "roxyapi",
      input: { date: m.date, time: m.time, timezone: m.timezone, latitude: m.latitude, longitude: m.longitude, nodeType: "true", lang: "tr" },
      input_hash: `ih-${i}`, computed_result: engineChart(m), birth_place: `Yer ${i}`, created_at: "2026-10-01T10:00:00Z",
    });
  });
  // B tenant: aynı kişi verisiyle başka uzmanın danışanı (sızmamalı).
  clients.push({ id: cid(0, "b"), tenant_id: TB, name: "B Danışan", birth_date: PEOPLE[0].date, birth_time: "19:00" });
  charts.push({ id: hid(0, "b"), tenant_id: TB, client_id: cid(0, "b"), source: "computed", provider: "roxyapi", input: { date: PEOPLE[0].date, time: PEOPLE[0].time, timezone: PEOPLE[0].timezone, latitude: PEOPLE[0].latitude, longitude: PEOPLE[0].longitude, nodeType: "true", lang: "tr" }, input_hash: "ih-b", computed_result: engineChart(PEOPLE[0]), birth_place: "B", created_at: "2026-10-01T10:00:00Z" });
  // Uygun olmayanlar: manuel harita / eksik girdi / geçersiz saat dilimi / doğum bilgisi değişmiş.
  clients.push({ id: cid(10), tenant_id: TA, name: "Manuel Kişi", birth_date: "1980-01-01", birth_time: "10:00" });
  charts.push({ id: hid(10), tenant_id: TA, client_id: cid(10), source: "manual", provider: null, input: null, computed_result: null, created_at: "2026-10-01T10:00:00Z" });
  clients.push({ id: cid(11), tenant_id: TA, name: "Geçersiz TZ", birth_date: "1990-01-01", birth_time: "10:00" });
  charts.push({ id: hid(11), tenant_id: TA, client_id: cid(11), source: "computed", provider: "roxyapi", input: { date: "1990-01-01", time: "10:00:00", timezone: "Mars/Olympus", latitude: 0, longitude: 0, nodeType: "true" }, computed_result: engineChart({ ...PEOPLE[1], date: "1990-01-01" }), created_at: "2026-10-01T10:00:00Z" });
  clients.push({ id: cid(12), tenant_id: TA, name: "Saat Yok", birth_date: "1990-05-05", birth_time: null });
  charts.push({ id: hid(12), tenant_id: TA, client_id: cid(12), source: "computed", provider: "roxyapi", input: { date: "1990-05-05", time: "08:00:00", timezone: "Europe/Istanbul", latitude: 41, longitude: 29, nodeType: "true" }, computed_result: engineChart({ date: "1990-05-05", time: "08:00:00", timezone: "Europe/Istanbul", latitude: 41, longitude: 29 }), created_at: "2026-10-01T10:00:00Z" });
  clients.push({ id: cid(13), tenant_id: TA, name: "Eksik Hesap", birth_date: "1991-05-05", birth_time: "08:00" });
  charts.push({ id: hid(13), tenant_id: TA, client_id: cid(13), source: "computed", provider: "roxyapi", input: { date: "1991-05-05", time: "08:00:00", timezone: "Europe/Istanbul", latitude: 41, longitude: 29, nodeType: "true" }, computed_result: { activations: [] }, created_at: "2026-10-01T10:00:00Z" });
  // Aynı kişi farklı profil (aynı ad + aynı doğum anı).
  clients.push({ id: cid(14), tenant_id: TA, name: "ayşe  YILMAZ", birth_date: PEOPLE[0].date, birth_time: "19:00" });
  charts.push({ ...clone(charts[0]), id: hid(14), client_id: cid(14), input_hash: "ih-14" });
  return createFakeDb({ human_design_clients: clients, human_design_charts: charts, human_design_relation_analyses: [], human_design_relation_participants: [] });
}

type Calls = { connection: number; penta: number };
function deps(calls: Calls, over: Partial<RelationServiceDeps> & { conn?: (b: { personA: Moment; personB: Moment }) => RoxyCallResult; pent?: (b: { members: Moment[] }) => RoxyCallResult } = {}): RelationServiceDeps {
  return {
    config: { apiKey: "zz-harness-fake-roxy-key", baseUrl: "https://roxyapi.com/api/v2" },
    callConnection: async (_c, body) => {
      calls.connection++;
      return over.conn ? over.conn(body as never) : { ok: true, raw: fakeConnectionResponse(body.personA, body.personB, { lang: "tr" }) };
    },
    callPenta: async (_c, body) => {
      calls.penta++;
      return over.pent ? over.pent(body as never) : { ok: true, raw: fakePentaResponse(body.members) };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    sleep: async () => undefined,
    idSecret: "zz-test-secret",
    ...over,
  };
}
const ctxOf = (db: ReturnType<typeof seed>["db"], tenantId = TA, isDemo = false) => ({ db, tenantId, userId: UA, isDemo });
const P = (...idx: number[]) => ({ participants: idx.map((i) => ({ client_id: cid(i), chart_id: hid(i) })) });

async function main() {
  // ─────────────────────────────────────────────────────────────────────────
  section("A — OpenAPI şeması: Connection");
  const conn = fakeConnectionResponse(PEOPLE[0], PEOPLE[1], { lang: "tr" });
  const vc = validateRoxyConnection(conn);
  ok("A1 geçerli Connection yanıtı doğrulanır", vc.ok, vc.ok ? undefined : vc.errors);
  if (!vc.ok) throw new Error("connection fixture");
  ok("A2 dört dinamik + toplam tutarlı", vc.value.summary.electromagnetic + vc.value.summary.dominance + vc.value.summary.compromise + vc.value.summary.companionship === vc.value.totalChannels);
  ok("A3 kanal yönü sağlayıcıdan bağımsız (34/20 → 20-34 biçimi)", vc.value.channels.every((c) => /^\d+-\d+$/.test(c.id) && Number(c.id.split("-")[0]) < Number(c.id.split("-")[1])));
  ok("A4 9 merkez uygulama sırasında + definedBy 'both' → [A,B]", vc.value.centers.length === 9 && vc.value.centers.every((c) => c.definedBy.every((x) => x === "A" || x === "B")));
  ok("A5 lang=tr yerel alanları taşınır (nameLocalized / dynamicLocalized)", vc.value.channels.every((c) => c.nameLocalized !== null && c.dynamicLocalized !== null) && vc.value.combinedDefinitionLocalized !== null);
  const bad = (mut: (r: Record<string, unknown>) => void) => { const r = clone(conn) as Record<string, unknown>; mut(r); return validateRoxyConnection(r).ok; };
  ok("A6 nesne değil → red", !validateRoxyConnection(null).ok && !validateRoxyConnection([]).ok);
  ok("A7 bilinmeyen dynamic → red", !bad((r) => { (r.channels as Record<string, unknown>[])[0].dynamic = "Synergy"; }));
  ok("A8 summary sayısı uyuşmaz → red", !bad((r) => { (r.summary as Record<string, number>).dominance += 1; }));
  ok("A9 totalChannels ≠ channels → red", !bad((r) => { r.totalChannels = 99; }));
  ok("A10 8 merkez → red", !bad((r) => { (r.centers as unknown[]).pop(); }));
  ok("A11 bilinmeyen merkez kimliği → red", !bad((r) => { (r.centers as Record<string, unknown>[])[0].id = "xyz"; }));
  ok("A12 definedBy bilinmeyen değer → red", !bad((r) => { (r.centers as Record<string, unknown>[])[0].definedBy = ["C"]; }));
  ok("A13 resmî 36 kanal dışı → red", !bad((r) => { (r.channels as Record<string, unknown>[])[0].gateA = 1; (r.channels as Record<string, unknown>[])[0].gateB = 2; }));
  ok("A14 personAGates kanal dışı kapı → red", !bad((r) => { (r.channels as Record<string, unknown>[])[0].personAGates = [64]; }));
  ok("A15 combinedDefinition bilinmeyen → red", !bad((r) => { r.combinedDefinition = "Quintuple"; }));
  ok("A16 channels null → red", !bad((r) => { r.channels = null; }));
  ok("A17 dinamik kuralı (OpenAPI): 1+1 EM, 2+0 Dom, 2+1 Comp, 2+2 Companionship", connectionDynamicFor(1, 1) === "Electromagnetic" && connectionDynamicFor(2, 0) === "Dominance" && connectionDynamicFor(0, 2) === "Dominance" && connectionDynamicFor(2, 1) === "Compromise" && connectionDynamicFor(1, 2) === "Compromise" && connectionDynamicFor(2, 2) === "Companionship" && connectionDynamicFor(1, 0) === null);

  section("A — Connection ↔ kayıtlı bireysel haritalar");
  const fA = participantChartFacts(engineChart(PEOPLE[0]))!;
  const fB = participantChartFacts(engineChart(PEOPLE[1]))!;
  const exp = expectedConnection(fA.gates, fB.gates, fA.defined, fB.defined);
  ok("A18 bağımsız üretilen Roxy yanıtı = kayıtlı haritalardan beklenen (0 hata)", checkConnectionConsistency(vc.value, exp).length === 0, checkConnectionConsistency(vc.value, exp));
  const tamper = clone(vc.value);
  tamper.channels[0].dynamic = tamper.channels[0].dynamic === "Dominance" ? "Electromagnetic" : "Dominance";
  ok("A19 dinamik değişirse tutarsızlık yakalanır", checkConnectionConsistency(tamper, exp).length > 0);
  const t2 = clone(vc.value);
  t2.centers[0].definedBy = t2.centers[0].definedBy.length ? [] : ["A"];
  ok("A20 definedBy değişirse tutarsızlık yakalanır", checkConnectionConsistency(t2, exp).length > 0);
  const t3 = clone(vc.value);
  t3.channels.pop();
  ok("A21 eksik kanal yakalanır", checkConnectionConsistency(t3, exp).length > 0);

  section("A — OpenAPI şeması: Penta");
  for (const n of [3, 4, 5]) {
    const pr = fakePentaResponse(PEOPLE.slice(0, n));
    const vp = validateRoxyPenta(pr, n);
    ok(`A22 ${n} kişi Penta yanıtı doğrulanır (6 kanal, 12 kapı)`, vp.ok && vp.value.channels.length === 6 && vp.value.gates.length === 12, vp.ok ? undefined : vp.errors);
    ok(`A23 ${n} kişi: heldBy kayıtlı haritalarla tutarlı`, vp.ok && checkPentaConsistency(vp.value, PEOPLE.slice(0, n).map((m) => participantChartFacts(engineChart(m))!.gates)).length === 0);
  }
  const pr3 = fakePentaResponse(PEOPLE.slice(0, 3));
  const pbad = (mut: (r: Record<string, unknown>) => void, n = 3) => { const r = clone(pr3) as Record<string, unknown>; mut(r); return validateRoxyPenta(r, n).ok; };
  ok("A24 memberCount ≠ gönderilen → red", !pbad(() => undefined, 4));
  ok("A25 5 kanal → red", !pbad((r) => { (r.channels as unknown[]).pop(); }));
  ok("A26 Penta dışı kanal → red", !pbad((r) => { (r.channels as Record<string, unknown>[])[0].gateA = 34; (r.channels as Record<string, unknown>[])[0].gateB = 20; }));
  ok("A27 yanlış position → red", !pbad((r) => { (r.channels as Record<string, unknown>[])[0].position = "lower"; }));
  ok("A28 isCore yanlış → red", !pbad((r) => { (r.channels as Record<string, unknown>[])[0].isCore = true; }));
  ok("A29 heldBy üye indeksi aralık dışı → red", !pbad((r) => { (r.gates as Record<string, unknown>[])[0].heldBy = [3]; (r.gates as Record<string, unknown>[])[0].filled = true; }));
  ok("A30 filled ↔ heldBy çelişkisi → red", !pbad((r) => { const g = (r.gates as Record<string, unknown>[]).find((x) => (x.heldBy as number[]).length > 0)!; g.filled = false; }));
  ok("A31 gapGates çelişkisi → red", !pbad((r) => { (r.summary as Record<string, unknown>).gapGates = [99]; }));
  ok("A32 coreDefined çelişkisi → red", !pbad((r) => { const s = r.summary as Record<string, unknown>; s.coreDefined = !s.coreDefined; }));
  ok("A33 Penta sabitleri: 6 kanal (3 üst / 3 alt), 12 kapı", PENTA_CHANNELS.filter((c) => c.position === "upper").length === 3 && PENTA_GATES.length === 12);
  ok("A34 kişi sayısı → uç: 2 Connection, 3–5 Penta, 1/6 yok", relationKindForCount(2) === "connection" && [3, 4, 5].every((n) => relationKindForCount(n) === "penta") && relationKindForCount(1) === null && relationKindForCount(6) === null);
  const vp3 = validateRoxyPenta(pr3, 3);
  if (vp3.ok) {
    const t = clone(vp3.value);
    const g = t.gates.find((x) => x.heldBy.length > 0)!;
    g.heldBy = g.heldBy.map((i) => (i + 1) % 3);
    ok("A35 kapı sahibi kişi değişirse (sıra karışması) tutarsızlık yakalanır", checkPentaConsistency(t, PEOPLE.slice(0, 3).map((m) => participantChartFacts(engineChart(m))!.gates)).length > 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section("B — Connection servis akışı");
  const s1 = seed();
  const calls: Calls = { connection: 0, penta: 0 };
  const c1 = await createRelationAnalysis(ctxOf(s1.db), { ...P(0, 1), relation_type: "spouse" }, deps(calls));
  ok("B1 iki yetkili danışan → Connection oluşturulur (1 çağrı)", c1.status === 200 && c1.body.ok && c1.body.kind === "connection" && !c1.body.reused && calls.connection === 1 && calls.penta === 0, c1);
  const aRows = s1.tables.human_design_relation_analyses;
  const pRows = s1.tables.human_design_relation_participants;
  ok("B2 analiz satırı: tür, tenant, uç, adaptör, nodeType, lang, sonuç + ham yanıt", aRows.length === 1 && aRows[0].tenant_id === TA && aRows[0].kind === "connection" && aRows[0].endpoint === "/human-design/connection" && aRows[0].adapter_version === "roxy-connection-1" && aRows[0].node_type === "true" && aRows[0].lang === "tr" && !!aRows[0].result && !!aRows[0].provider_raw && aRows[0].relation_type === "spouse");
  ok("B3 katılımcılar: gerçek danışan id'leri, sıra, kaynak analiz + girdi kimliği; doğum verisi ÇOĞALTILMAZ", pRows.length === 2 && pRows[0].client_id === cid(0) && pRows[0].position === 0 && pRows[1].client_id === cid(1) && pRows[0].source_chart_id === hid(0) && pRows[0].source_input_hash === "ih-0" && !("birth_date" in pRows[0]) && !("birth_time" in pRows[0]));
  const c2 = await createRelationAnalysis(ctxOf(s1.db), P(0, 1), deps(calls));
  ok("B4 aynı seçim tekrar → kayıtlı sonuç (Roxy çağrısı YOK)", c2.body.ok && c2.body.reused && calls.connection === 1 && (c2.body as { id: string }).id === (c1.body as { id: string }).id);
  const c3 = await createRelationAnalysis(ctxOf(s1.db), P(1, 0), deps(calls));
  ok("B5 ters sıra aynı çift → kayıtlı sonuç (çağrı YOK)", c3.body.ok && c3.body.reused && calls.connection === 1);
  const dup = await createRelationAnalysis(ctxOf(s1.db), { participants: [{ client_id: cid(0), chart_id: hid(0) }, { client_id: cid(0), chart_id: hid(0) }] }, deps(calls));
  ok("B6 aynı danışan iki kez → 422 (çağrı YOK)", dup.status === 422 && !dup.body.ok && dup.body.code === "DUPLICATE_PARTICIPANT" && calls.connection === 1);
  const same = await createRelationAnalysis(ctxOf(s1.db), { participants: [{ client_id: cid(0), chart_id: hid(0) }, { client_id: cid(14), chart_id: hid(14) }] }, deps(calls));
  ok("B7 aynı kişi farklı profil (aynı ad + doğum anı) → 422 SAME_PERSON", same.status === 422 && !same.body.ok && same.body.code === "SAME_PERSON");
  const noTime = await createRelationAnalysis(ctxOf(s1.db), P(0, 12), deps(calls));
  ok("B8 eksik doğum saati (danışan kaydında saat yok) → 409, çağrı YOK", noTime.status === 409 && !noTime.body.ok && noTime.body.code === "BIRTH_DATA_CHANGED" && calls.connection === 1);
  const badTz = await createRelationAnalysis(ctxOf(s1.db), P(0, 11), deps(calls));
  ok("B9 geçersiz şehir/saat dilimi → 422 CHART_INCOMPLETE, çağrı YOK", badTz.status === 422 && !badTz.body.ok && badTz.body.code === "CHART_INCOMPLETE" && calls.connection === 1);
  const manual = await createRelationAnalysis(ctxOf(s1.db), P(0, 10), deps(calls));
  ok("B10 manuel/eski harita → 422 CHART_NOT_ELIGIBLE (otomatik analiz gerekli)", manual.status === 422 && !manual.body.ok && manual.body.code === "CHART_NOT_ELIGIBLE");
  const incomplete = await createRelationAnalysis(ctxOf(s1.db), P(0, 13), deps(calls));
  ok("B11 26 aktivasyonu olmayan kayıtlı analiz → 422 CHART_INCOMPLETE", incomplete.status === 422 && !incomplete.body.ok && incomplete.body.code === "CHART_INCOMPLETE");
  const cross = await createRelationAnalysis(ctxOf(s1.db), { participants: [{ client_id: cid(0), chart_id: hid(0) }, { client_id: cid(0, "b"), chart_id: hid(0, "b") }] }, deps(calls));
  ok("B12 başka tenant danışanı → 404 (çağrı YOK)", cross.status === 404 && calls.connection === 1);
  const wrongChart = await createRelationAnalysis(ctxOf(s1.db), { participants: [{ client_id: cid(0), chart_id: hid(1) }, { client_id: cid(1), chart_id: hid(0) }] }, deps(calls));
  ok("B13 başka danışanın analizi → 404 CHART_NOT_FOUND", wrongChart.status === 404 && !wrongChart.body.ok && wrongChart.body.code === "CHART_NOT_FOUND");
  ok("B14 1 kişi / 6 kişi → 422 PARTICIPANT_COUNT", (await createRelationAnalysis(ctxOf(s1.db), P(0), deps(calls))).status === 422 && (await createRelationAnalysis(ctxOf(s1.db), P(0, 1, 2, 3, 4, 5), deps(calls))).status === 422);
  ok("B15 demo hesap → 403", (await createRelationAnalysis(ctxOf(s1.db, TA, true), P(0, 2), deps(calls))).status === 403);
  ok("B16 doğum verisi gövdeden kabul edilmez (yalnız kimlik)", (await createRelationAnalysis(ctxOf(s1.db), { participants: [{ client_id: cid(0), chart_id: hid(0), date: "2000-01-01" }, { client_id: cid(2), chart_id: hid(2) }] }, deps(calls))).body.ok);
  const before = calls.connection;
  const bodyStr = (await createRelationAnalysis(ctxOf(s1.db), { participants: "x" }, deps(calls))).status;
  ok("B17 bozuk gövde → 400, çağrı YOK", bodyStr === 400 && calls.connection === before);

  section("B — Sağlayıcı hataları ve fail-closed");
  const s2 = seed();
  const k2: Calls = { connection: 0, penta: 0 };
  for (const kind of ["timeout", "network", "unauthorized", "rate_limited", "bad_request", "server_error", "malformed_json"] as const) {
    const r = await createRelationAnalysis(ctxOf(s2.db), P(0, 1), deps(k2, { conn: () => ({ ok: false, kind, status: null }) }));
    ok(`B18 sağlayıcı hatası ${kind} → ${r.status}, kayıt YOK`, !r.body.ok && s2.tables.human_design_relation_analyses.length === 0);
  }
  const inv = await createRelationAnalysis(ctxOf(s2.db), P(0, 1), deps(k2, { conn: () => ({ ok: true, raw: { totalChannels: 1 } }) }));
  ok("B19 null/eksik/bozuk yanıt → 502, kayıt YOK", inv.status === 502 && s2.tables.human_design_relation_analyses.length === 0);
  const inc = await createRelationAnalysis(ctxOf(s2.db), P(0, 1), deps(k2, { conn: (b) => ({ ok: true, raw: fakeConnectionResponse(b.personA, PEOPLE[3]) }) }));
  ok("B20 tutarsız sonuç (başka kişinin haritası) → 502 PROVIDER_INCONSISTENT, kayıt YOK", inc.status === 502 && !inc.body.ok && inc.body.code === "PROVIDER_INCONSISTENT" && s2.tables.human_design_relation_analyses.length === 0);
  const noCfg = await createRelationAnalysis(ctxOf(s2.db), P(0, 1), deps(k2, { config: null }));
  ok("B21 yapılandırma yok → 503 (çağrı YOK)", noCfg.status === 503);
  const locked = await createRelationAnalysis(ctxOf(s2.db), P(0, 1), deps(k2, { rateLimit: async (scope) => ({ allowed: scope !== "hd-roxy-relation-inflight", retryAfterSec: 5 }) }));
  ok("B22 eşzamanlı aynı istek (çift tık / çoklu sekme) → 409 IN_PROGRESS, ücretli çağrı YOK", locked.status === 409 && !locked.body.ok && locked.body.code === "IN_PROGRESS");
  const before2 = k2.connection;
  const limited = await createRelationAnalysis(ctxOf(s2.db), P(0, 1), deps(k2, { rateLimit: async (scope) => ({ allowed: scope !== "hd-roxy-user", retryAfterSec: 60 }) }));
  ok("B23 kullanıcı kotası doluysa → 429, çağrı YOK (BodyGraph ile ortak kova)", limited.status === 429 && k2.connection === before2);
  // Eşzamanlı iki istek: biri ücretli çağrı, diğeri kayıtlı sonucu bekler.
  const s3 = seed();
  const k3: Calls = { connection: 0, penta: 0 };
  let claims = 0;
  const lockDeps = deps(k3, { rateLimit: async (scope) => (scope === "hd-roxy-relation-inflight" ? { allowed: claims++ === 0, retryAfterSec: 5 } : { allowed: true, retryAfterSec: 0 }) });
  const [r1, r2] = await Promise.all([createRelationAnalysis(ctxOf(s3.db), P(0, 1), lockDeps), createRelationAnalysis(ctxOf(s3.db), P(0, 1), lockDeps)]);
  ok("B24 eşzamanlı iki istek → tek ücretli çağrı, ikisi de aynı kayıt", k3.connection === 1 && r1.body.ok && r2.body.ok && s3.tables.human_design_relation_analyses.length === 1, { r1: r1.body, r2: r2.body, calls: k3.connection });
  // Tablo yok (migration uygulanmamış) → 503, Roxy çağrısı YOK.
  const s4 = seed();
  const k4: Calls = { connection: 0, penta: 0 };
  const missingDb = { from: (t: string) => (t === "human_design_relation_analyses" ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: "42P01", message: 'relation "human_design_relation_analyses" does not exist' } }) }) }) }) } : (s4.db as unknown as { from: (t: string) => unknown }).from(t)) } as unknown as typeof s4.db;
  const mres = await createRelationAnalysis(ctxOf(missingDb), P(0, 1), deps(k4));
  ok("B25 migration uygulanmamış → 503 RELATIONS_UNAVAILABLE, Roxy çağrısı YOK", mres.status === 503 && !mres.body.ok && mres.body.code === "RELATIONS_UNAVAILABLE" && k4.connection === 0, mres);
  // Katılımcı yazılamazsa analiz geri alınır.
  const s5 = seed();
  const failingDb = { from: (t: string) => (t === "human_design_relation_participants" ? { insert: async () => ({ data: null, error: { code: "XX000", message: "simulated" } }) } : (s5.db as unknown as { from: (t: string) => unknown }).from(t)) } as unknown as typeof s5.db;
  const fr = await createRelationAnalysis(ctxOf(failingDb), P(0, 1), deps({ connection: 0, penta: 0 }));
  ok("B26 katılımcı kaydı başarısız → analiz geri alınır (yarım kayıt kalmaz)", fr.status === 500 && s5.tables.human_design_relation_analyses.length === 0);

  // ─────────────────────────────────────────────────────────────────────────
  section("C — Penta servis akışı (3 / 4 / 5 kişi)");
  for (const n of [3, 4, 5]) {
    const s = seed();
    const k: Calls = { connection: 0, penta: 0 };
    const idx = Array.from({ length: n }, (_, i) => i);
    const r = await createRelationAnalysis(ctxOf(s.db), { ...P(...idx), relation_type: "family" }, deps(k));
    ok(`C1 ${n} kişi → Penta (Connection değil), 1 çağrı`, r.body.ok && r.body.kind === "penta" && k.penta === 1 && k.connection === 0, r);
    const rows = s.tables.human_design_relation_participants;
    ok(`C2 ${n} kişi: katılımcı sırası Roxy üye sırasıyla aynı`, rows.length === n && rows.every((p, i) => p.position === i && p.client_id === cid(i)));
    const again = await createRelationAnalysis(ctxOf(s.db), P(...idx.slice().reverse()), deps(k));
    ok(`C3 ${n} kişi: farklı sıra aynı grup → kayıtlı sonuç (çağrı YOK)`, again.body.ok && again.body.reused && k.penta === 1);
    const view = await getRelationAnalysis(ctxOf(s.db), (r.body as { id: string }).id);
    ok(`C4 ${n} kişi: yeniden açma — kapı sahipleri doğru kişilerle eşleşir`, view.body.ok && (() => {
      const res = view.body.analysis.result as HdPentaResult;
      return res.gates.every((g) => g.heldBy.every((i) => participantChartFacts(engineChart(PEOPLE[i]))!.gates.includes(g.gate)));
    })());
  }
  const sp = seed();
  const kp: Calls = { connection: 0, penta: 0 };
  ok("C5 Penta tekrarlanan katılımcı → 422", (await createRelationAnalysis(ctxOf(sp.db), { participants: [0, 1, 1].map((i) => ({ client_id: cid(i), chart_id: hid(i) })) }, deps(kp))).status === 422 && kp.penta === 0);
  ok("C6 Penta eksik doğum verisi → 409", (await createRelationAnalysis(ctxOf(sp.db), P(0, 1, 12), deps(kp))).status === 409 && kp.penta === 0);
  const pinc = await createRelationAnalysis(ctxOf(sp.db), P(0, 1, 2), deps(kp, { pent: (b) => ({ ok: true, raw: fakePentaResponse([b.members[1], b.members[0], b.members[2]]) }) }));
  ok("C7 Penta üye sırası karışmış yanıt → 502 PROVIDER_INCONSISTENT, kayıt YOK", pinc.status === 502 && sp.tables.human_design_relation_analyses.length === 0);

  // ─────────────────────────────────────────────────────────────────────────
  section("D — Okuma, liste, tarihsel nitelik, silme");
  const s6 = seed();
  const k6: Calls = { connection: 0, penta: 0 };
  const made = await createRelationAnalysis(ctxOf(s6.db), P(0, 1), deps(k6));
  const id = (made.body as { id: string }).id;
  const pent = await createRelationAnalysis(ctxOf(s6.db), P(0, 2, 3), deps(k6));
  const pid = (pent.body as { id: string }).id;
  const g1 = await getRelationAnalysis(ctxOf(s6.db), id);
  ok("D1 kayıtlı Connection açılır: katılımcı adları sırayla, ham sağlayıcı yanıtı DÖNMEZ", g1.body.ok && g1.body.analysis.participants.map((p) => p.name).join() === `${NAMES[0]},${NAMES[1]}` && !JSON.stringify(g1.body).includes("provider_raw") && !JSON.stringify(g1.body).includes("zz-harness-fake-roxy-key"));
  ok("D2 katılımcı doğum bilgisi kayıtlı kaynak analizden (çoğaltılmadan) görünür", g1.body.ok && g1.body.analysis.participants[0].birthDate === PEOPLE[0].date && g1.body.analysis.participants[0].birthPlace === "Yer 0" && g1.body.analysis.participants.every((p) => p.status === "current"));
  ok("D3 başka tenant → 404", (await getRelationAnalysis(ctxOf(s6.db, TB), id)).status === 404);
  ok("D4 geçersiz id → 400", (await getRelationAnalysis(ctxOf(s6.db), "x")).status === 400);
  // Doğum bilgisi sonradan değişti → tarihsel uyarı, otomatik yeniden hesap YOK
  (s6.tables.human_design_clients.find((c) => c.id === cid(1)) as Record<string, unknown>).birth_time = "07:00";
  const g2 = await getRelationAnalysis(ctxOf(s6.db), id);
  ok("D5 doğum bilgisi değişince sonuç tarihsel işaretlenir; ücretli hesap YOK", g2.body.ok && g2.body.analysis.participants[1].status === "birth_data_changed" && k6.connection === 1);
  const list = await listRelationAnalyses(ctxOf(s6.db));
  ok("D6 liste: iki analiz, tür + adlar", list.ok && list.rows.length === 2 && list.rows.some((r) => r.kind === "penta" && r.names.length === 3));
  const byClient = await listRelationAnalyses(ctxOf(s6.db), { clientId: cid(2) });
  ok("D7 danışana göre liste (yalnız katıldığı analizler)", byClient.ok && byClient.rows.length === 1 && byClient.rows[0].id === pid);
  const listB = await listRelationAnalyses(ctxOf(s6.db, TB));
  ok("D8 başka tenant listesi boş (izolasyon)", listB.ok && listB.rows.length === 0);
  const clientsBefore = JSON.stringify(s6.tables.human_design_clients);
  const chartsBefore = JSON.stringify(s6.tables.human_design_charts);
  ok("D9 başka tenant silemez → 404", (await deleteRelationAnalysis(ctxOf(s6.db, TB), id)).status === 404);
  ok("D10 demo silemez → 403", (await deleteRelationAnalysis(ctxOf(s6.db, TA, true), id)).status === 403);
  const del = await deleteRelationAnalysis(ctxOf(s6.db), id);
  ok("D11 analiz silinir; danışanlar ve bireysel BodyGraph analizleri DEĞİŞMEZ", del.status === 200 && JSON.stringify(s6.tables.human_design_clients) === clientsBefore && JSON.stringify(s6.tables.human_design_charts) === chartsBefore && s6.tables.human_design_relation_analyses.length === 1);
  ok("D12 silinen analiz tekrar silinemez → 404", (await deleteRelationAnalysis(ctxOf(s6.db), id)).status === 404);

  section("D — Katılımcı adayları");
  const s7 = seed();
  const cands = await listRelationCandidates(ctxOf(s7.db));
  const cOf = (i: number) => (cands.ok ? cands.rows.find((r) => r.clientId === cid(i)) : undefined);
  ok("D13 adaylar yalnız bu tenant (B tenant danışanı yok)", cands.ok && !cands.rows.some((r) => r.clientId === cid(0, "b")));
  ok("D14 uygun danışan → kayıtlı analiz kimliği + doğum yeri", !!cOf(0)?.chart && cOf(0)!.chart!.id === hid(0) && cOf(0)!.chart!.birthPlace === "Yer 0");
  ok("D15 manuel → 'otomatik analiz gerekli'", cOf(10)?.chart === null && cOf(10)?.reason === "no_auto_chart");
  ok("D16 saat yok / doğum bilgisi değişmiş → uygun değil", cOf(12)?.chart === null && cOf(12)?.reason === "birth_data_changed");
  ok("D17 geçersiz saat dilimi / eksik hesap → uygun değil", cOf(11)?.chart === null && cOf(13)?.chart === null && cOf(13)?.reason === "chart_incomplete");
  ok("D18 aday yanıtı hesap sonucu / ham yanıt TAŞIMAZ", cands.ok && !JSON.stringify(cands.rows).includes("activations"));

  // ─────────────────────────────────────────────────────────────────────────
  section("E — Word raporu (kayıtlı sonuçtan; Roxy çağrısı YOK)");
  const s8 = seed();
  const k8: Calls = { connection: 0, penta: 0 };
  const wc = await createRelationAnalysis(ctxOf(s8.db), { ...P(0, 1), relation_type: "mother_child" }, deps(k8));
  const wp = await createRelationAnalysis(ctxOf(s8.db), P(2, 3, 4, 5), deps(k8));
  const callsBeforeWord = k8.connection + k8.penta;
  const vC = await getRelationAnalysis(ctxOf(s8.db), (wc.body as { id: string }).id);
  const vP = await getRelationAnalysis(ctxOf(s8.db), (wp.body as { id: string }).id);
  if (!vC.body.ok || !vP.body.ok) throw new Error("rapor görünümü yok");
  const docText = async (buf: Buffer) => {
    const z = await JSZip.loadAsync(buf);
    const xml = await z.file("word/document.xml")!.async("string");
    return { xml, text: xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
  };
  const snap = async (id: string, opts: Record<string, unknown> = {}) => {
    const c = await createRelationReport(ctxOf(s8.db), id, opts);
    if (!c.body.ok) throw new Error("rapor oluşturulamadı " + JSON.stringify(c.body));
    const g = await getRelationReportSnapshot(ctxOf(s8.db), c.body.id);
    if (!g.body.ok) throw new Error("snapshot yok");
    return g.body.snapshot;
  };
  const sC = await snap(vC.body.analysis.id);
  const sP = await snap(vP.body.analysis.id);
  const dc = await docText(await renderRelationReportBuffer(sC, { image: null }));
  ok("E1 Connection raporu: başlık 'İlişki Analizi (Connection)' + iki ad + A/B eşleşmesi", dc.text.includes("Human Design İlişki Analizi (Connection)") && dc.text.includes(NAMES[0]) && dc.text.includes(NAMES[1]) && dc.text.includes(`A: ${NAMES[0]}`) && dc.text.includes(`B: ${NAMES[1]}`));
  ok("E2 Connection raporu: dört bağlantı türü + birleşik merkezler + birleşik tanım", ["Elektromanyetik (Electromagnetic)", "Baskınlık (Dominance)", "Uzlaşma (Compromise)", "Arkadaşlık / Eşlik (Companionship)", "Birleşik Merkezler", "Birleşik Tanım (Combined Definition)"].every((x) => dc.text.includes(x)));
  ok("E3 bağlam yalnız bilgi olarak: 'Anne – Çocuk'; puan/yüzde/garanti YOK", dc.text.includes("Anne – Çocuk") && !/%|uyum puanı|başarılı olacak/i.test(dc.text.replace(/bilimsel olarak doğrulanmış bir ilişki tahmini, uyum puanı veya başarı garantisi değildir/g, "")));
  const dpx = await docText(await renderRelationReportBuffer(sP, { image: null }));
  ok("E4 Penta raporu: başlık 'Grup Analizi (Penta)' + dört üye + üst/alt Penta + kapılar + katkılar", dpx.text.includes("Human Design Grup Analizi (Penta)") && [2, 3, 4, 5].every((i) => dpx.text.includes(NAMES[i])) && dpx.text.includes("Üst Penta (G → Boğaz)") && dpx.text.includes("Alt Penta (G → Sakral)") && dpx.text.includes("Penta Kapıları ve Katkılar"));
  ok("E5 raporda API anahtarı / ham yanıt / sağlayıcı adı / uç / nodeType YOK", ![dc.xml, dpx.xml].some((x) => /zz-harness-fake-roxy-key|provider_raw|dynamicLocalized|roxy|\/human-design\/|nodeType|adapter/i.test(x)));
  ok("E6 rapor üretimi Roxy çağrısı YAPMAZ", k8.connection + k8.penta === callsBeforeWord);
  ok("E7 dosya adı Connection/Penta ayrımı + ASCII", /^HD-Iliski-Ayse-Yilmaz-Mehmet-Kaya-\d{4}-\d{2}-\d{2}\.docx$/.test(relationReportFilename(vC.body.analysis, sC.generatedAt)) && relationReportFilename(vP.body.analysis, sP.generatedAt).startsWith("HD-Grup-Penta-"));

  // ─────────────────────────────────────────────────────────────────────────
  section("F — HTTP istemcisi (anahtar yalnız başlıkta; hata gövdesi aktarılmaz)");
  let seen: { url: string; key: string | null; body: string } | null = null;
  const fake = (async (u: string, i: RequestInit) => {
    seen = { url: u, key: new Headers(i.headers).get("x-api-key"), body: String(i.body) };
    return new Response(JSON.stringify({ error: "echo zz-harness-fake-roxy-key" }), { status: 400 });
  }) as never;
  const cr = await callRoxyConnection({ apiKey: "zz-harness-fake-roxy-key", baseUrl: "https://roxyapi.com/api/v2" }, { personA: { ...PEOPLE[0], nodeType: "true" }, personB: { ...PEOPLE[1], nodeType: "true" } }, { fetchImpl: fake, lang: "tr" });
  ok("F1 Connection: doğru uç + lang=tr + X-API-Key; hata gövdesi dönmez", !!seen && (seen as { url: string }).url === "https://roxyapi.com/api/v2/human-design/connection?lang=tr" && (seen as { key: string }).key === "zz-harness-fake-roxy-key" && !cr.ok && !JSON.stringify(cr).includes("zz-harness"));
  ok("F2 Connection gövdesi OpenAPI biçiminde (personA/personB)", JSON.parse((seen as unknown as { body: string }).body).personA.date === PEOPLE[0].date && "personB" in JSON.parse((seen as unknown as { body: string }).body));
  const pr = await callRoxyPenta({ apiKey: "k", baseUrl: "https://roxyapi.com/api/v2" }, { members: PEOPLE.slice(0, 3).map((m) => ({ ...m, nodeType: "true" })) }, { fetchImpl: fake });
  ok("F3 Penta: doğru uç + members[] gövdesi", !pr.ok && (seen as unknown as { url: string }).url.endsWith("/human-design/penta?lang=tr") && JSON.parse((seen as unknown as { body: string }).body).members.length === 3);
  const to = await callRoxyConnection({ apiKey: "k", baseUrl: "https://x" }, { personA: { ...PEOPLE[0], nodeType: "true" }, personB: { ...PEOPLE[1], nodeType: "true" } }, { fetchImpl: (() => new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("a"), { name: "AbortError" })), 5))) as never, timeoutMs: 1 });
  ok("F4 zaman aşımı → timeout", !to.ok && to.kind === "timeout");

  section("G — Kaynak kod sözleşmeleri");
  const read = (p: string) => readFileSync(p, "utf8");
  const svc = read("lib/human-design/relations/relationService.ts");
  ok("G1 servis: tüm sorgular withTenant; provider_raw okuma ucu yok", (svc.match(/withTenant\(/g) ?? []).length >= 10 && !/select\([^)]*provider_raw/.test(svc));
  const ui = read("app/human-design/iliski-grup/components/HdRelationsContent.tsx") + read("app/human-design/iliski-grup/helpers/relationsClient.ts") + read("app/human-design/iliski-grup/components/RelationResultViews.tsx");
  ok("G2 istemci kodunda anahtar / provider_raw / doğrudan Roxy URL'si YOK", !/ROXY_API_KEY|provider_raw|roxyapi\.com/.test(ui));
  ok("G3 Word düğmesi Android'de gizli (no-android) + sunucu androidWordGuard", ui.includes('className="no-android"') && read("app/api/hd/relations/[id]/reports/route.ts").includes("androidWordGuard(req)") && read("app/api/hd/relations/reports/[reportId]/download/route.ts").includes("androidWordGuard(req)"));
  ok("G4 BodyGraph istemcisi / servisi DEĞİŞMEDİ (yeni uçlar ayrı dosyada)", !read("lib/human-design/providers/roxy/client.ts").includes("connection") && !read("lib/human-design/api/roxyChartService.ts").includes("relation"));
  ok("G5 Connection ve Penta ayrı doğrulayıcı (Penta Connection sonucunu kullanmaz)", !read("lib/human-design/relations/penta.ts").includes("connection"));

  // central-client L5 ("Roxy/engine/Word/profesyonel harita/AutoCalc dosyaları DEĞİŞMEDİ"): PR #427 merge edildi;
  // bu PR'da L5'in koruduğu alanda HİÇBİR değişiklik olmamalı (BodyGraph sağlayıcı/motor/harita dosyaları).
  {
    const { execSync } = await import("node:child_process");
    // Owner PASS 2026-10-18: premium BodyGraph tüm HD'de aktif → HdComputedChartView yalnız çizici seçimi için değişebilir
    // (G6b ile denetlenir). Sağlayıcı / motor / Roxy servisi / AutoCalc korumalı kalır.
    const L5 = "lib/human-design/providers lib/human-design/api/roxyChartService.ts lib/human-design/engine app/human-design/danisanlar/components/HdAutoCalcPanel.tsx";
    let names = "GIT_ERROR";
    try {
      names = execSync(`git diff --name-status origin/main -- ${L5}`, { encoding: "utf8" }).trim();
    } catch { /* GIT_ERROR */ }
    ok("G6 L5 korumalı alan (Roxy sağlayıcı / motor / Roxy servisi / AutoCalc) bu PR'da DEĞİŞMEDİ", names === "", names);
    const view = read("app/human-design/kayitli-haritalar/components/HdComputedChartView.tsx");
    ok("G6b bireysel harita görünümü: yalnız çizici seçimi eklendi; pasif Roxy + eski çizim dalları duruyor, hesap / fetch yok", view.includes("premiumStateFromChart(result)") && view.includes("<HdRoxyBodygraph") && view.includes("<BodyGraph result={result} />") && !/fetch\(|computeRoxyChart|callRoxy/.test(view));
  }

  ok("Z ağ çağrısı (gerçek Roxy dahil) 0", netCalls === 0, netCalls);
  globalThis.fetch = realFetch;
  console.log(`\nHD İLİŞKİ VE GRUP ANALİZLERİ: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
