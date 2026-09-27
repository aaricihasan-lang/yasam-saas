/**
 * FAZ1 FINAL HARDENING — PAKET HDAY harness'i
 * (Human Design profesyonel Word + manuel harita tutarlılığı · Aromaterapi kaynak silme + karışım
 *  dirty · Doğaltaş kombinasyon kaydet hata eşlemesi · Yaşam Hafızası dürüst durum + backfill kapısı).
 *
 * DB/ağ YOK: route handler'ları bellek-içi sahte Supabase + stub guard ile çağrılır
 * ("server-only" ve "@/lib/auth/userGuard" yalnız bu süreçte stub'lanır). Prod'a bağlanmaz.
 *
 * Çalıştır: npx tsx scripts/final-hardening/hday.harness.ts
 */
import Module, { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import JSZip from "jszip";

import {
  checkManualChartConsistency,
  validateManualChartCodes,
  type ManualChartInput,
} from "../../lib/human-design/manualChartConsistency";
import { HUMAN_DESIGN_PROFILES } from "../../lib/human-design/constants";
import {
  buildHdAuthorityCanonicalKey,
  buildHdChannelCanonicalKeyFromCode,
  buildHdGateCanonicalKey,
  buildHdTypeCanonicalKey,
} from "../../lib/human-design/knowledge-system/canonicalKeys";
import { HD_REPORT_UNPUBLISHED_MESSAGE } from "../../lib/human-design/reporting/reportSnapshot";
import { countUniqueChartGates } from "../../lib/human-design/reporting/reportSnapshotService";
import {
  blendSignature,
  emptyBlendSnapshot,
  isBlendFormDirty,
  type BlendFormSnapshot,
} from "../../app/aromaterapi/karisim-olusturucu/blendFormState";
import { describeSourceReferences, sourceRemovalMode } from "../../lib/aromaterapi/sourceWrite";
import {
  extractCombinationId,
  mapCombinationSaveRpcError,
} from "../../app/api/dogaltas/combinations/save/errorMapping";
import {
  deriveYhCardStatus,
  deriveYhWorkspaceState,
  YH_OUT_OF_SCOPE_TEXT,
} from "../../lib/yasam-hafizasi/ui/healthStatus";
import {
  handleAdminIndexRequest,
  isBackfillWriteAllowed,
  type AdminIndexHandlerDeps,
} from "../../lib/yasam-hafizasi/indexer/adminIndexRequest";
import type { IndexSourcePageResult } from "../../lib/yasam-hafizasi/indexer/indexSourcePage";
import type { ValidatedTenantScope } from "../../lib/yasam-hafizasi/indexer/tenantScopeGate";
import {
  buildCoverageSql,
  buildRunbook,
  selectBackfillSources,
} from "./yh-coverage-backfill";

const ROOT = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string) {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.error(`  FAIL ${name}`);
  }
}
function section(t: string) {
  console.log(`\n── ${t} ──`);
}

// ─── Module stub kancası (yalnız bu süreç) ────────────────────────────────────
const STUBS: Record<string, string> = {
  "server-only": join(__dirname, "hday-stubs", "empty.cjs"),
  "@/lib/auth/userGuard": join(__dirname, "hday-stubs", "userGuard.cjs"),
};
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (STUBS[req]) return STUBS[req];
    return orig.call(this, req, ...rest);
  };
}
const req = createRequire(__filename);

// ─── Bellek-içi sahte Supabase ────────────────────────────────────────────────
type Row = Record<string, unknown>;
type RpcFn = (args: Record<string, unknown>) => { data: unknown; error: unknown };

class FakeDb {
  tables: Record<string, Row[]> = {};
  rpcs: Record<string, RpcFn> = {};
  reads: string[] = [];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  from(table: string) {
    return new FakeQuery(this, table);
  }
  rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    const fn = this.rpcs[name];
    return Promise.resolve(fn ? fn(args) : { data: null, error: { message: `rpc yok: ${name}` } });
  }
}

class FakeQuery {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private preds: Array<(r: Row) => boolean> = [];
  private payload: Row | Row[] | null = null;
  private cols: string | null = null;
  private mode: "many" | "maybe" | "single" = "many";
  private head = false;
  private count = false;
  constructor(private db: FakeDb, private table: string) {}
  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    this.cols = cols ?? "*";
    if (opts?.head) this.head = true;
    if (opts?.count) this.count = true;
    return this;
  }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.preds.push((r) => r[c] === v); return this; }
  in(c: string, vs: unknown[]) { this.preds.push((r) => vs.includes(r[c])); return this; }
  or(expr: string) {
    const conds = expr.split(",").map((part) => {
      const [col, op, ...rest] = part.split(".");
      const val = rest.join(".");
      return (r: Row) => (op === "is" && val === "null" ? r[col] == null : op === "eq" ? String(r[col]) === val : false);
    });
    this.preds.push((r) => conds.some((f) => f(r)));
    return this;
  }
  order() { return this; }
  limit() { return this; }
  range() { return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }
  private project(r: Row): Row {
    if (!this.cols || this.cols.trim() === "*") return { ...r };
    const out: Row = {};
    for (const c of this.cols.split(",").map((x) => x.trim()).filter(Boolean)) out[c] = r[c];
    return out;
  }
  private exec(): { data: unknown; error: unknown; count?: number | null } {
    const rows = (this.db.tables[this.table] ??= []);
    if (this.op === "select") this.db.reads.push(this.table);
    let affected: Row[];
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      affected = list.map((p) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...p }));
      rows.push(...affected);
    } else {
      affected = rows.filter((r) => this.preds.every((f) => f(r)));
      if (this.op === "update") for (const r of affected) Object.assign(r, this.payload);
      if (this.op === "delete") this.db.tables[this.table] = rows.filter((r) => !affected.includes(r));
    }
    if (this.head) return { data: null, error: null, count: affected.length };
    const data = affected.map((r) => this.project(r));
    if (this.mode === "maybe") return { data: data[0] ?? null, error: null };
    if (this.mode === "single") return data[0] ? { data: data[0], error: null } : { data: null, error: { message: "no rows" } };
    return { data, error: null, count: this.count ? affected.length : null };
  }
  then<T>(res: (v: { data: unknown; error: unknown; count?: number | null }) => T, rej?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.exec()).then(res, rej);
  }
}

// Guard stub bağlantısı.
type GuardCall = { kind: string; moduleKey: string | null };
const guardCalls: GuardCall[] = [];
let currentGuard: Record<string, unknown> | null = null;
(globalThis as Record<string, unknown>).__HDAY_GUARD__ = (c: { kind: string; moduleKey: string | null }) => {
  guardCalls.push({ kind: c.kind, moduleKey: c.moduleKey });
  if (!currentGuard) {
    const { NextResponse } = req("next/server");
    return { ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) };
  }
  return currentGuard;
};

function guardFor(db: FakeDb, o: { tenantId: string; role?: string; demo?: boolean; name?: string }) {
  return {
    ok: true,
    db,
    tenantId: o.tenantId,
    userId: `user-${o.tenantId.slice(0, 4)}`,
    email: "uzman@example.com",
    is_demo_account: o.demo === true,
    profile: { role: o.role ?? "expert", full_name: o.name ?? "Ayşe Uzman", module_permissions: {} },
  };
}

function jsonReq(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  const { NextRequest } = req("next/server");
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function docText(buf: ArrayBuffer | Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<[^>]+>/g, "");
}

// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  // ─── HD: motor dokunulmazlığı ──────────────────────────────────────────────
  section("HD · engine dokunulmazlığı");
  {
    const stat = execSync("git diff --stat -- lib/human-design/engine", { cwd: ROOT }).toString().trim();
    const porcelain = execSync("git status --porcelain -- lib/human-design/engine", { cwd: ROOT }).toString().trim();
    ok(stat === "", "git diff --stat -- lib/human-design/engine BOŞ");
    ok(porcelain === "", "git status -- lib/human-design/engine temiz (yeni/silinen dosya yok)");
    const mc = read("lib/human-design/manualChartConsistency.ts");
    ok(/from "@\/lib\/human-design\/engine\/channels"/.test(mc) && /computeTypeAndAuthority/.test(mc) && /computeDefinition/.test(mc),
      "tutarlılık modülü motor saf fonksiyonlarını YALNIZ import eder");
    ok(!/runHdEngine|computeHumanDesignChart|handleCompute/.test(code("app/human-design/harita-kaydi/components/HdHaritaKaydiContent.tsx")),
      "manuel form otomatik harita hesabı ÇAĞIRMAZ");
  }

  // ─── HD: tutarlılık altın çiftleri ─────────────────────────────────────────
  section("HD · manuel harita tutarlılık uyarıları (altın çiftler)");
  {
    const codes = (i: ManualChartInput) => checkManualChartConsistency(i).map((w) => w.code);
    const ALL = ["head", "ajna", "throat", "g_identity", "heart_ego", "solar_plexus", "sacral", "spleen", "root"];
    const openExcept = (a: string[]) => ALL.filter((c) => !a.includes(c));
    // Tutarlı MG: 20-34 (Sakral→Boğaz motor bağlantısı)
    ok(codes({ type_code: "manifesting_generator", authority_code: "sacral", definition_code: "single",
      active_centers: ["sacral", "throat"], open_centers: openExcept(["sacral", "throat"]), channels: ["20-34"], gates: [20, 34] }).length === 0,
      "tutarlı Manifesting Generator (20-34) → 0 uyarı");
    ok(codes({ type_code: "projector", authority_code: "self_projected", definition_code: "single",
      active_centers: ["g_identity", "throat"], open_centers: openExcept(["g_identity", "throat"]), channels: ["7-31"], gates: [7, 31] }).length === 0,
      "tutarlı Projector (7-31, Self-Projected) → 0 uyarı");
    ok(codes({ type_code: "reflector", authority_code: "lunar", active_centers: [], open_centers: ALL, channels: [], gates: [] }).length === 0,
      "tutarlı Reflector (lunar, tüm merkezler açık) → 0 uyarı");
    ok(codes({ type_code: "manifestor", authority_code: "ego_heart", channels: ["21-45"] }).length === 0,
      "Manifestor + 21-45 (Kalp→Boğaz) → motor uyarısı yok");
    ok(codes({ type_code: "generator" }).length === 0 && codes({}).length === 0, "kısmi/boş giriş uyarı üretmez");

    ok(codes({ type_code: "reflector", authority_code: "lunar", active_centers: ["sacral"] }).includes("REFLECTOR_HAS_DEFINED_CENTER"),
      "Reflector + tanımlı Sakral → REFLECTOR_HAS_DEFINED_CENTER");
    ok(codes({ type_code: "reflector", authority_code: "sacral" }).includes("TYPE_AUTHORITY_MISMATCH"),
      "Reflector + Sacral otorite → TYPE_AUTHORITY_MISMATCH");
    ok(codes({ type_code: "generator", active_centers: ["throat"], open_centers: ["sacral"] }).includes("GENERATOR_SACRAL_UNDEFINED"),
      "Generator + Sakral açık → GENERATOR_SACRAL_UNDEFINED");
    ok(codes({ type_code: "projector", active_centers: ["sacral"] }).includes("NON_GENERATOR_SACRAL_DEFINED"),
      "Projector + Sakral tanımlı → NON_GENERATOR_SACRAL_DEFINED");
    ok(codes({ active_centers: ["root"], open_centers: ["root"] }).includes("CENTER_BOTH_DEFINED_AND_OPEN"),
      "aynı merkez hem tanımlı hem açık → CENTER_BOTH_DEFINED_AND_OPEN");
    ok(codes({ type_code: "manifestor", channels: ["7-31"] }).includes("MANIFESTOR_NO_MOTOR_TO_THROAT"),
      "Manifestor + yalnız 7-31 → MANIFESTOR_NO_MOTOR_TO_THROAT");
    ok(codes({ type_code: "projector", channels: ["20-34"] }).includes("PROJECTOR_MOTOR_TO_THROAT"),
      "Projector + 20-34 → PROJECTOR_MOTOR_TO_THROAT");
    ok(codes({ active_centers: ["solar_plexus", "sacral"], authority_code: "sacral" }).includes("AUTHORITY_CENTERS_MISMATCH"),
      "Solar Plexus tanımlı + Sacral otorite → AUTHORITY_CENTERS_MISMATCH (motor hiyerarşisi)");
    ok(codes({ channels: ["1-8"], gates: [1] }).includes("CHANNEL_GATES_MISSING"), "1-8 kanalı + yalnız kapı 1 → CHANNEL_GATES_MISSING");
    ok(codes({ channels: [], gates: [1, 8] }).includes("GATES_CHANNEL_UNMARKED"), "kapı 1+8, kanal yok → GATES_CHANNEL_UNMARKED");
    ok(codes({ type_code: "generator", gates: [20, 34], channels: ["20-34"] }).includes("GATES_TYPE_MISMATCH"),
      "kapılardan türetilen MG ≠ Generator → GATES_TYPE_MISMATCH");
    ok(codes({ definition_code: "split", gates: [20, 34], channels: ["20-34"] }).includes("GATES_DEFINITION_MISMATCH"),
      "kapılardan türetilen tekli tanım ≠ split → GATES_DEFINITION_MISMATCH");
    const msgs = checkManualChartConsistency({ type_code: "reflector", active_centers: ["sacral"] }).map((w) => w.message).join(" ");
    ok(/Reflector/.test(msgs) && !/tip_|otorite_|kapi_|kanal_/.test(msgs), "uyarı metinleri Türkçe ve canonical anahtar içermez");

    // Sunucu allow-list: tutarsızlık ASLA engel değil; bilinmeyen kod → red.
    ok(validateManualChartCodes({ type_code: "reflector", authority_code: "sacral", active_centers: ["sacral"], gates: [1, 8], channels: ["20-34"] }).ok === true,
      "tutarsız ama allow-list içi değerler → kayıt KABUL (uyarı sonrası kayıt mümkün)");
    ok(validateManualChartCodes({ type_code: "wizard" }).ok === false, "bilinmeyen tip kodu → red");
    ok(validateManualChartCodes({ gates: [65] }).ok === false && validateManualChartCodes({ gates: ["5"] }).ok === false, "kapı 65 / string kapı → red");
    ok(validateManualChartCodes({ channels: ["1-2"] }).ok === false, "geçersiz kanal kodu → red");
    ok(validateManualChartCodes({ type_code: null, profile_code: "", active_centers: [] }).ok === true, "boş/null alanlar kabul");
  }

  // ─── HD: terminoloji ───────────────────────────────────────────────────────
  section("HD · terminoloji");
  {
    const labels = HUMAN_DESIGN_PROFILES.map((p) => p.label).join(" | ");
    ok(!/Şehit|Sapkın/.test(labels), "profil etiketlerinde 'Şehit'/'Sapkın' YOK");
    ok(/Deneyimleyen \(Martyr\)/.test(labels) && /Çözüm Getiren \(Heretic\)/.test(labels), "yeni etiketler: Deneyimleyen (Martyr) / Çözüm Getiren (Heretic)");
    ok(HUMAN_DESIGN_PROFILES.length === 12 && HUMAN_DESIGN_PROFILES.some((p) => p.code === "3_5"), "profil KODLARI aynı (12)");
    ok(/<span lang="en">Human Design<\/span>/.test(read("app/human-design/kayitli-haritalar/components/HdComputedChartModal.tsx")) &&
      /<span lang="en">Human Design<\/span>/.test(read("app/human-design/kayitli-haritalar/[id]/HdHaritaDetayContent.tsx")),
      "uppercase başlıklarda 'Human Design' lang=en (DESİGN yok)");
  }

  // ─── HD: profesyonel rapor route'ları (uzman + admin) ─────────────────────
  section("HD · profesyonel Word route'ları (sahte DB + stub guard)");
  {
    const T1 = "11111111-1111-4111-8111-111111111111";
    const T2 = "22222222-2222-4222-8222-222222222222";
    const kType = buildHdTypeCanonicalKey("generator");
    const kAuth = buildHdAuthorityCanonicalKey("sacral");
    const kCh = buildHdChannelCanonicalKeyFromCode("26-44")!;
    const kGate5 = buildHdGateCanonicalKey(5);
    const content = (key: string, kind: string) => ({
      id: randomUUID(), entity_id: randomUUID(), entity_kind: kind, canonical_key: key, status: "published", version: 1,
      general_description: `GD::${key}`, report_text: `RT::${key}`, strategy_text: null, signature_text: null, not_self_text: null,
      decision_mechanism: null, application_text: null, caution_notes: null, general_theme: `TH::${key}`,
      full_channel_text: `FC::${key}`, hanging_gate_context: null,
    });
    const makeDb = () => {
      const db = new FakeDb();
      db.tables.human_design_clients = [
        { id: "c-1", tenant_id: T1, name: "Ayşe Çağ", birth_date: "1990-05-01", birth_time: "10:30", birth_place: "İzmir", chart_image_url: null },
      ];
      db.tables.human_design_charts = [
        { id: "ch-1", tenant_id: T1, source: "manual", type_code: "generator", authority_code: "sacral", profile_code: "3_5",
          definition_code: "single", active_centers: ["sacral", "spleen", "heart_ego"], gates: [26, 44, 5], channels: ["26-44"],
          client_id: "c-1", client_name: null, birth_date: null, birth_time: null, birth_place: null },
        { id: "ch-empty", tenant_id: T1, source: "manual", type_code: "projector", authority_code: "splenic", gates: [], channels: [],
          client_id: "c-1", client_name: null, birth_date: null, birth_time: null, birth_place: null },
        { id: "ch-scrape", tenant_id: T1, source: "manual", type_code: null, authority_code: null,
          gates: Array.from({ length: 40 }, (_, i) => i + 1), channels: [], client_id: "c-1", client_name: null },
        { id: "ch-foreign", tenant_id: T2, source: "manual", type_code: "generator", authority_code: "sacral", gates: [5], channels: [],
          client_id: null, client_name: "Yabancı" },
      ];
      // kapi_5 YAYIMLANMAMIŞ (yalnız draft) → uzman omit / admin fail-loud.
      db.tables.hd_canonical_content = [
        content(kType, "tip"), content(kAuth, "otorite"), content(kCh, "kanal"),
        { ...content(kGate5, "kapi"), status: "draft" },
      ];
      db.tables.human_design_reports = [];
      return db;
    };
    const create = req("../../app/api/hd/reports/professional/route.ts") as { POST: (r: unknown) => Promise<Response> };
    const download = req("../../app/api/hd/reports/professional/download/route.ts") as { POST: (r: unknown) => Promise<Response> };
    const persist = req("../../lib/human-design/api/reportPersistence.ts") as {
      listReportsWithClients: (db: unknown, t: string) => Promise<{ rows: Row[] }>;
      getReportById: (db: unknown, t: string, id: string) => Promise<{ row: Row | null }>;
    };
    const URL_C = "http://localhost/api/hd/reports/professional";
    const URL_D = "http://localhost/api/hd/reports/professional/download";

    // Uzman: kapi_5 yayımlanmamış → rapor OLUŞUR (omit), anahtar sızmaz.
    const db = makeDb();
    guardCalls.length = 0;
    currentGuard = guardFor(db, { tenantId: T1, role: "expert", name: "Ayşe Uzman" });
    let res = await create.POST(jsonReq(URL_C, "POST", { chartId: "ch-1" }));
    let body = (await res.json()) as Record<string, unknown>;
    ok(res.status === 200 && body.ok === true && typeof body.id === "string", "uzman (non-admin) profesyonel rapor OLUŞTURUR → 200");
    ok(guardCalls.some((g) => g.kind === "module" && g.moduleKey === "human_design") && !guardCalls.some((g) => g.kind === "admin"),
      "route requireModuleAccess('human_design') kullanır (admin-only DEĞİL)");
    ok(body.omittedCount === 1 && !JSON.stringify(body).includes(kGate5), "omit modu: 1 bölüm atlandı, yanıtta canonical anahtar YOK");
    const saved = db.tables.human_design_reports[0] as Row & { snapshot: { provenance: { omitted?: Array<Record<string, unknown>> } } };
    ok(!!saved && saved.report_kind === "canonical" && saved.tenant_id === T1, "donmuş snapshot tenant'a canonical olarak kaydedildi");
    ok(JSON.stringify(saved.snapshot.provenance.omitted) === JSON.stringify([{ kind: "kapi", displayName: "Kapı 5" }]),
      "provenance.omitted anahtarsız {kind, displayName}");

    // Liste / detay projeksiyonu snapshot taşımaz.
    const list = await persist.listReportsWithClients(db, T1);
    ok(list.rows.length === 1 && !("snapshot" in list.rows[0]) && !("canonical_provenance" in list.rows[0]),
      "liste projeksiyonu snapshot/canonical_provenance İÇERMEZ");
    const detail = await persist.getReportById(db, T1, String(saved.id));
    ok(!!detail.row && !("snapshot" in detail.row) && !("canonical_provenance" in detail.row), "detay projeksiyonu snapshot İÇERMEZ");

    // İndirme: uzman kendi raporunu indirir; tarih/not/hazırlayan.
    res = await download.POST(jsonReq(URL_D, "POST", { reportId: saved.id }));
    ok(res.status === 200 && (res.headers.get("content-type") ?? "").includes("wordprocessingml"), "uzman kendi raporunu DOCX indirir → 200");
    const cd = res.headers.get("content-disposition") ?? "";
    ok(/Human-Design-Ayse-Cag-\d{4}-\d{2}-\d{2}\.docx/.test(cd), "dosya adı yerel gün damgalı + TR transliterasyon");
    const txt = await docText(await res.arrayBuffer());
    ok(txt.includes("Hazırlayan: Ayşe Uzman") && txt.includes("Bilgilendirme"), "DOCX: wellness notu + 'Hazırlayan: <uzman>'");
    ok(txt.includes("1 Mayıs 1990"), "DOCX: doğum tarihi DATE olarak kaydırmasız (1 Mayıs 1990)");
    ok(txt.includes("Kapı 5") && txt.includes("henüz yayımlanmadığı") && !txt.includes(kGate5), "DOCX: atlanan bölüm anahtarsız bildirildi");
    ok(txt.includes("Profil") && txt.includes("Deneyimleyen (Martyr)") && txt.includes("Tanımlı Merkezler"), "DOCX özet: profil/tanım/merkez satırları");
    res = await download.POST(jsonReq(URL_D, "POST", { reportId: saved.id }, { "user-agent": "Mozilla/5.0 (Linux; Android 14) wv" }));
    ok(res.status === 403, "Android Word kuralı korunur (403)");

    // Başka tenant: chart 404, rapor indirme 404.
    currentGuard = guardFor(db, { tenantId: T2, role: "expert" });
    res = await create.POST(jsonReq(URL_C, "POST", { chartId: "ch-1" }));
    ok(res.status === 404, "başka tenant'ın haritası → 404 (sahiplik)");
    res = await download.POST(jsonReq(URL_D, "POST", { reportId: saved.id }));
    ok(res.status === 404, "başka tenant'ın raporu indirme → 404");

    // Uzman: hiçbir bölüm yayımlanmamış → sade 422, anahtarsız.
    const db2 = makeDb();
    currentGuard = guardFor(db2, { tenantId: T1, role: "expert" });
    res = await create.POST(jsonReq(URL_C, "POST", { chartId: "ch-empty" }));
    body = (await res.json()) as Record<string, unknown>;
    ok(res.status === 422 && body.error === HD_REPORT_UNPUBLISHED_MESSAGE && !/tip_|otorite_|kapi_|kanal_/.test(JSON.stringify(body)),
      "uzman: içerik hiç yayımlanmamış → 422 'henüz yayımlanmadı' (anahtar sızmaz)");

    // Admin: fail-loud korunur (anahtarlı detay yalnız admin'e).
    const db3 = makeDb();
    currentGuard = guardFor(db3, { tenantId: T1, role: "admin" });
    res = await create.POST(jsonReq(URL_C, "POST", { chartId: "ch-1" }));
    body = (await res.json()) as Record<string, unknown>;
    ok(res.status === 422 && body.code === "CANONICAL_MISSING" && String(body.error).includes(kGate5) && db3.tables.human_design_reports.length === 0,
      "admin: yayımlanmamış içerik → 422 fail-loud (kayıt YOK)");

    // Anti-scrape: >26 benzersiz kapı → canonical HİÇ okunmadan red.
    const db4 = makeDb();
    currentGuard = guardFor(db4, { tenantId: T1, role: "expert" });
    res = await create.POST(jsonReq(URL_C, "POST", { chartId: "ch-scrape" }));
    body = (await res.json()) as Record<string, unknown>;
    ok(res.status === 422 && body.code === "CHART_TOO_MANY_GATES" && !db4.reads.includes("hd_canonical_content"),
      "anti-scrape: 40 kapılı harita → 422, canonical tablo okunmadı");
    ok(countUniqueChartGates([1, 2, 2], ["1-8", "20-34"]) === 5, "countUniqueChartGates kapı+kanal birleşimi");

    // Demo → 403; guard yok → 401.
    currentGuard = guardFor(makeDb(), { tenantId: T1, demo: true });
    res = await create.POST(jsonReq(URL_C, "POST", { chartId: "ch-1" }));
    ok(res.status === 403, "demo hesap → 403");
    currentGuard = null;
    res = await create.POST(jsonReq(URL_C, "POST", { chartId: "ch-1" }));
    ok(res.status === 401, "oturumsuz → 401 (guard)");
  }

  // ─── HD: manuel harita kaydı route (uyarı sonrası kayıt) ──────────────────
  section("HD · manuel harita kaydı (allow-list 400, tutarsızlık engel değil)");
  {
    const T1 = "11111111-1111-4111-8111-111111111111";
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: "c-1", tenant_id: T1, name: "X" }];
    db.tables.human_design_charts = [];
    currentGuard = guardFor(db, { tenantId: T1 });
    const charts = req("../../app/api/hd/charts/route.ts") as { POST: (r: unknown) => Promise<Response> };
    const U = "http://localhost/api/hd/charts?scope=manual";
    let res = await charts.POST(jsonReq(U, "POST", {
      client_id: "c-1", type_code: "reflector", authority_code: "sacral", active_centers: ["sacral"], open_centers: [],
      gates: [1], channels: ["1-8"], profile_code: null, definition_code: null, notes: null,
    }));
    let body = (await res.json()) as Record<string, unknown>;
    ok(res.status === 200 && body.ok === true && typeof body.id === "string" && db.tables.human_design_charts.length === 1,
      "tutarsız manuel harita KAYDEDİLİR (200 + id → Profesyonel Word CTA)");
    res = await charts.POST(jsonReq(U, "POST", { client_id: "c-1", type_code: "wizard" }));
    body = (await res.json()) as Record<string, unknown>;
    ok(res.status === 400 && body.code === "INVALID_CHART_CODE", "bilinmeyen kod → 400 INVALID_CHART_CODE");
    const form = code("app/human-design/harita-kaydi/components/HdHaritaKaydiContent.tsx");
    ok(/checkManualChartConsistency\(form\)/.test(form) && /Tutarsızlık uyarıları/.test(form) && /"Yine de Kaydet"/.test(form),
      "form: amber uyarı paneli + engellemeyen 'Yine de Kaydet' onayı");
    ok(/<HdProfessionalReportButton chartId=\{savedChartId\} label="Profesyonel Word oluştur"/.test(form), "kayıt sonrası 'Profesyonel Word oluştur' CTA");
  }

  // ─── HD: UI kapıları ───────────────────────────────────────────────────────
  section("HD · UI (admin gate kaldırıldı, Android korunur, eski hat uzmandan gizli)");
  {
    const btn = code("app/human-design/kayitli-haritalar/components/HdProfessionalReportButton.tsx");
    ok(!/isAdminUser/.test(btn) && /if \(isAndroid\) return null/.test(btn), "Profesyonel Word butonu: admin gate yok, Android gizli");
    const list = code("app/human-design/kayitli-raporlar/components/HdRaporListesi.tsx");
    ok(/isCanonical \?[\s\S]{0,300}!isAndroid \?/.test(list), "Kayıtlı Raporlar: canonical Word İndir uzmana açık");
    const hub = code("app/human-design/page.tsx");
    const hubCards = code("app/human-design/components/HdHubModules.tsx");
    ok(/href: "\/human-design\/rapor-olustur",\s*adminOnly: true/.test(hub), "hub: 'Rapor Oluştur' kartı adminOnly (route korunur)");
    ok(/Kayıtlı Haritalar → Profesyonel Word/.test(hubCards) && /!m\.adminOnly \|\| isAdmin/.test(hubCards), "hub ana CTA + adminOnly filtresi");
    ok(read("app/human-design/rapor-olustur/page.tsx").length > 0, "eski rapor-olustur route'u KORUNDU");
  }

  // ─── AROMA: kaynak düzenle/sil route'ları ─────────────────────────────────
  section("AROMA · kaynak PATCH/DELETE (RPC + audit/tombstone sözleşmesi)");
  {
    const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const S_FREE = "11111111-1111-4111-8111-111111111111";
    const S_USED = "22222222-2222-4222-8222-222222222222";
    const S_B = "33333333-3333-4333-8333-333333333333";
    const TS = "2026-09-20T10:00:00.000Z";
    const db = new FakeDb();
    const sources: Row[] = [
      { id: S_FREE, tenant_id: A, updated_at: TS, title: "Serbest" },
      { id: S_USED, tenant_id: A, updated_at: TS, title: "Atıflı" },
      { id: S_B, tenant_id: B, updated_at: TS, title: "B" },
    ];
    const refs: Record<string, { passages: number; claim_sources: number; method_series: number }> = {
      [S_USED]: { passages: 2, claim_sources: 1, method_series: 0 },
    };
    const audit: Row[] = [];
    db.rpcs.aromatherapy_delete_source_with_audit = (a) => {
      const row = sources.find((s) => s.id === a.p_source_id && s.tenant_id === a.p_tenant_id);
      if (!row) return { data: null, error: { code: "P0001", message: "AROMA_SOURCE_NOT_FOUND" } };
      if (row.updated_at !== a.p_expected_updated_at) return { data: null, error: { code: "P0001", message: "AROMA_STALE" } };
      const r = refs[String(row.id)];
      if (r) return { data: null, error: { code: "P0001", message: "AROMA_SOURCE_REFERENCED", details: JSON.stringify(r) } };
      sources.splice(sources.indexOf(row), 1);
      audit.push({ op: "delete", id: row.id, reason: a.p_reason });
      return { data: { entity_id: row.id, deleted: true, noop: false, updated_at: null }, error: null };
    };
    db.rpcs.aromatherapy_update_source_with_audit = (a) => {
      const row = sources.find((s) => s.id === a.p_source_id && s.tenant_id === a.p_tenant_id);
      if (!row) return { data: null, error: { code: "P0001", message: "AROMA_SOURCE_NOT_FOUND" } };
      row.title = a.p_title;
      return { data: { entity_id: row.id, noop: false, updated_at: "2026-09-21T00:00:00Z" }, error: null };
    };
    const route = req("../../app/api/aromaterapi/sources/[id]/route.ts") as {
      PATCH: (r: unknown, c: unknown) => Promise<Response>;
      DELETE: (r: unknown, c: unknown) => Promise<Response>;
    };
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    const U = (id: string) => `http://localhost/api/aromaterapi/sources/${id}`;
    currentGuard = guardFor(db, { tenantId: A, name: "Aroma Uzman" });

    const patchBody = {
      source_type: "book", title: "Serbest (düzenlendi)", authors: null, organization: null, publication_year: 2020,
      doi: null, pmid: null, isbn: null, url: null, document_no: null, notes: null, status: "draft",
      expected_updated_at: TS, reason: "künye düzeltme",
    };
    let res = await route.PATCH(jsonReq(U(S_FREE), "PATCH", patchBody), ctx(S_FREE));
    ok(res.status === 200 && sources.find((s) => s.id === S_FREE)?.title === "Serbest (düzenlendi)", "kendi kaynağını düzenler → 200");
    res = await route.PATCH(jsonReq(U(S_B), "PATCH", patchBody), ctx(S_B));
    ok(res.status === 404, "başka tenant kaynağını düzenleme → 404");

    res = await route.DELETE(jsonReq(U(S_USED), "DELETE", { expected_updated_at: TS, reason: "gereksiz" }), ctx(S_USED));
    let body = (await res.json()) as Record<string, unknown>;
    const r = body.references as Record<string, number> | undefined;
    ok(res.status === 409 && body.code === "AROMA_SOURCE_REFERENCED" && r?.passages === 2 && r?.claim_sources === 1 && r?.method_series === 0,
      "kullanılan kaynak silme → 409 AROMA_SOURCE_REFERENCED + sayılar");
    ok(sources.some((s) => s.id === S_USED), "kullanılan kaynak SİLİNMEDİ (FK RESTRICT korunur)");
    res = await route.DELETE(jsonReq(U(S_B), "DELETE", { expected_updated_at: TS, reason: "x" }), ctx(S_B));
    ok(res.status === 404, "başka tenant kaynağını silme → 404");
    res = await route.DELETE(jsonReq(U(S_FREE), "DELETE", { expected_updated_at: "2000-01-01T00:00:00.000Z", reason: "x" }), ctx(S_FREE));
    ok(res.status === 409 && ((await res.json()) as Row).code === "AROMA_STALE", "eski sürümle silme → 409 AROMA_STALE");
    res = await route.DELETE(jsonReq(U(S_FREE), "DELETE", { expected_updated_at: TS }), ctx(S_FREE));
    ok(res.status === 400, "gerekçesiz silme → 400");
    res = await route.DELETE(jsonReq(U(S_FREE), "DELETE", { expected_updated_at: TS, reason: "x", tenant_id: B }), ctx(S_FREE));
    ok(res.status === 400, "gövdede tenant_id vb. yasak alan → 400");
    res = await route.DELETE(jsonReq(U(S_FREE), "DELETE", { expected_updated_at: TS, reason: "  artık kullanılmıyor  " }), ctx(S_FREE));
    body = (await res.json()) as Record<string, unknown>;
    ok(res.status === 200 && body.deleted === true && !sources.some((s) => s.id === S_FREE) && audit.length === 1 && audit[0].reason === "artık kullanılmıyor",
      "referanssız kendi kaynağı → 200 silindi (RPC audit/tombstone yolu)");
    const call = db.rpcCalls.find((c) => c.name === "aromatherapy_delete_source_with_audit");
    ok(!!call && call.args.p_tenant_id === A && call.args.p_actor_label_snapshot === "Aroma Uzman", "tenant/actor YALNIZ guard'dan RPC'ye");
    currentGuard = guardFor(db, { tenantId: A, demo: true });
    res = await route.DELETE(jsonReq(U(S_USED), "DELETE", { expected_updated_at: TS, reason: "x" }), ctx(S_USED));
    ok(res.status === 403, "demo hesap silme → 403");

    // Migration 0800 statik sözleşmesi.
    const mig = read("supabase/migrations/20270129000800_aromatherapy_delete_source.sql");
    ok(/SECURITY DEFINER/.test(mig) && /FOR UPDATE/.test(mig) && /'AROMA_SOURCE_REFERENCED'/.test(mig) &&
      /aromatherapy_content_delete_tombstones/.test(mig) && /'delete'/.test(mig) && /'single'/.test(mig),
      "0800: definer + FOR UPDATE + REFERENCED + audit 'delete' + tombstone 'single'");
    ok(/REVOKE ALL ON FUNCTION[\s\S]*FROM anon[\s\S]*GRANT EXECUTE[\s\S]*TO service_role/.test(mig) && /NOTIFY pgrst/.test(mig),
      "0800: REVOKE anon/auth + GRANT service_role + NOTIFY pgrst");
    ok(!/\bmax\s*\(|\bmin\s*\(/i.test(mig.replace(/--.*$/gm, "")), "0800: uuid üzerinde max/min YOK (presale-f2 kuralı)");

    // İstemci saf yardımcılar + UI.
    ok(sourceRemovalMode({ passage_count: 2, knowledge_record_count: 0 }) === "archive-suggested" &&
      sourceRemovalMode({ passage_count: 0, knowledge_record_count: 0 }) === "delete", "detay: kullanılan kaynak → arşiv önerisi");
    ok(describeSourceReferences({ passages: 2, claimSources: 1, methodSeries: 0 }) === "2 pasaj, 1 bilgi kaydı atfı", "referans özeti Türkçe");
    const actions = code("app/aromaterapi/kaynaklar/_components/KaynakDetailActions.tsx");
    ok(/if \(isDemo\) return null/.test(actions) && /Bu kaynak kullanılıyor/.test(actions) && /arşivleyebilirsiniz/.test(actions),
      "detay eylemleri demo'da gizli + 'kullanılıyor; arşivleyebilirsiniz'");
    ok(/extraActions=\{data \? <KaynakDetailActions/.test(code("app/aromaterapi/kaynaklar/[id]/page.tsx")) &&
      /extraActions\?: ReactNode/.test(read("app/aromaterapi/_components/read/DetailScreen.tsx")), "DetailScreen extraActions slotu bağlı");
    ok(/<KaynakForm\s+mode="edit"/.test(read("app/aromaterapi/kaynaklar/[id]/duzenle/page.tsx")), "kaynaklar/[id]/duzenle → KaynakForm edit");
    ok(!/ilerleyen aşamada eklenecek/.test(read("app/aromaterapi/_components/OilsPage.tsx")), "OilsPage gelecek zaman metni kaldırıldı");
  }

  // ─── AROMA: karışım dirty baseline ─────────────────────────────────────────
  section("AROMA · karışım oluşturucu dirty (baseline kıyaslı)");
  {
    const empty = emptyBlendSnapshot(20);
    ok(!isBlendFormDirty(empty, emptyBlendSnapshot(20)), "boş builder → temiz");
    const loaded: BlendFormSnapshot = {
      ...empty, name: "Rahatlama", carrierName: "Jojoba", carrierId: "c1", bottleMl: 50, dilution: 3, dropsPerMl: 25,
      items: [{ oil_id: "o1", oil_name: "Lavanta", drops: 10 }],
    };
    ok(!isBlendFormDirty({ ...loaded }, loaded), "kayıtlı karışım yüklendi, değişiklik yok → temiz (eski kural kirli sayıyordu)");
    ok(isBlendFormDirty({ ...loaded, items: [{ oil_id: "o1", oil_name: "Lavanta", drops: 11 }] }, loaded), "damla değişti → kirli");
    ok(isBlendFormDirty({ ...loaded, carrierName: "Badem" }, loaded), "taşıyıcı değişti → kirli");
    ok(!isBlendFormDirty({ ...loaded, name: "Rahatlama  " }, loaded), "yalnız boşluk farkı → temiz");
    ok(isBlendFormDirty({ ...empty, carrierName: "Jojoba" }, empty), "yeni formda yalnız taşıyıcı → kirli (guard aktif)");
    ok(blendSignature(emptyBlendSnapshot(20)) === blendSignature({ ...empty }), "imza kararlı");
    const page = code("app/aromaterapi/karisim-olusturucu/page.tsx");
    const reset = page.slice(page.indexOf("function resetForm()"), page.indexOf("async function confirmDiscardIfDirty"));
    ok(/setCarrierName\(/.test(reset) && /setCarrierId\(/.test(reset) && /setCarrierContra\(/.test(reset) && /setCarrierNotes\(/.test(reset) && /setBaseline\(empty\)/.test(reset),
      "resetForm taşıyıcı alanlarını temizler + baseline'ı sıfırlar");
    ok(/setBaseline\(\{[\s\S]{0,200}name: blend\.name/.test(page), "loadBlend baseline'ı yüklenen kayda kurar");
  }

  // ─── DOĞALTAŞ: kombinasyon kaydet hata eşleme ─────────────────────────────
  section("DOĞALTAŞ · combinations/save RPC hata eşlemesi");
  {
    ok(mapCombinationSaveRpcError({ message: "stone_not_found_for_tenant" })?.status === 409, "stone_not_found_for_tenant → 409");
    for (const t of ["issue_required", "snapshot_name_required", "stones_must_be_array", "invalid_arguments"]) {
      ok(mapCombinationSaveRpcError({ message: `ERROR: ${t}` })?.status === 400, `${t} → 400`);
    }
    ok(mapCombinationSaveRpcError({ message: "connection reset" }) === null && mapCombinationSaveRpcError(null) === null, "bilinmeyen → null (500)");
    ok(extractCombinationId({ id: "5f0e8f7a-1b2c-4d3e-8f9a-0b1c2d3e4f5a" }) === "5f0e8f7a-1b2c-4d3e-8f9a-0b1c2d3e4f5a" &&
      extractCombinationId({}) === null && extractCombinationId({ id: "x" }) === null && extractCombinationId(null) === null, "RPC sonucu id doğrulaması");

    const T = "44444444-4444-4444-8444-444444444444";
    const route = req("../../app/api/dogaltas/combinations/save/route.ts") as { POST: (r: unknown) => Promise<Response> };
    const U = "http://localhost/api/dogaltas/combinations/save";
    const body = { name: "Uyku", stones: ["Ametist"], stoneRefs: [{ stone_id: "5f0e8f7a-1b2c-4d3e-8f9a-0b1c2d3e4f5a", snapshot_name: "Ametist" }] };
    const run = async (rpc: RpcFn) => {
      const db = new FakeDb();
      db.rpcs.create_combination_with_stones = rpc;
      currentGuard = guardFor(db, { tenantId: T });
      const res = await route.POST(jsonReq(U, "POST", body));
      return { status: res.status, json: (await res.json()) as Record<string, unknown>, db };
    };
    const origErr = console.error;
    console.error = () => {};
    try {
      let r1 = await run(() => ({ data: null, error: { message: "stone_not_found_for_tenant" } }));
      ok(r1.status === 409 && r1.json.code === "stone_not_found" && typeof r1.json.error === "string", "route: yabancı taş → 409 + Türkçe mesaj");
      r1 = await run(() => ({ data: null, error: { message: "issue_required" } }));
      ok(r1.status === 400, "route: issue_required → 400");
      r1 = await run(() => ({ data: null, error: { message: "db down SECRET" } }));
      ok(r1.status === 500 && !JSON.stringify(r1.json).includes("SECRET"), "route: bilinmeyen → 500 (ham hata sızmaz)");
      r1 = await run(() => ({ data: {}, error: null }));
      ok(r1.status === 500, "route: RPC id döndürmedi → 500 (sahte başarı yok)");
      r1 = await run(() => ({ data: { id: "6a0e8f7a-1b2c-4d3e-8f9a-0b1c2d3e4f5a" }, error: null }));
      ok(r1.status === 200 && r1.json.id === "6a0e8f7a-1b2c-4d3e-8f9a-0b1c2d3e4f5a" &&
        r1.db.rpcCalls[0]?.args.p_tenant_id === T, "route: başarı → 200 + id; tenant sunucudan");
    } finally {
      console.error = origErr;
    }
    const migs = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.startsWith("20270129") && /dogaltas/i.test(f));
    ok(migs.length === 0, "yeni Doğaltaş migration'ı YOK");
  }

  // ─── YH: dürüst durum ──────────────────────────────────────────────────────
  section("YH · kart/çalışma alanı durum türetici");
  {
    const on = { yh_enabled: true, yh_hizli: true };
    ok(deriveYhCardStatus(undefined).kind === "loading", "undefined → yükleniyor");
    ok(deriveYhCardStatus(null).text === "—", "hata/null → '—' (hazır iddiası YOK)");
    ok(deriveYhCardStatus({ ok: true, tenantRows: 50, flags: { yh_enabled: false, yh_hizli: false } }).text === "Yakında", "flag kapalı → Yakında");
    ok(deriveYhCardStatus({ ok: true, demo: true, tenantRows: 0, flags: {} }).text === "Yakında", "demo (flag default kapalı) → Yakında");
    ok(deriveYhCardStatus({ ok: true, tenantRows: 0, syntheticTenant: true, flags: on }).text === YH_OUT_OF_SCOPE_TEXT, "sentetik tenant → kapsam dışı (hata değil)");
    ok(deriveYhCardStatus({ ok: true, accessible: true, tenantRows: 1234, flags: on }).text === "1.234 kayıt hazır", "tenantRows>0 → 'N kayıt hazır'");
    ok(deriveYhCardStatus({ ok: true, accessible: true, tenantRows: 0, flags: on }).text === "Hazırlanıyor", "tenantRows=0 → Hazırlanıyor");
    ok(deriveYhWorkspaceState({ ok: true, tenantRows: 0, flags: on }) === "index-empty" &&
      deriveYhWorkspaceState({ ok: true, tenantRows: 0, syntheticTenant: true, flags: on }) === "out-of-scope" &&
      deriveYhWorkspaceState({ ok: true, tenantRows: 3, flags: on }) === "ready" &&
      deriveYhWorkspaceState(null) === "unknown", "çalışma alanı durum eşlemesi");
    const health = code("app/api/yasam-hafizasi/health/route.ts");
    ok(/syntheticTenant: isSyntheticTenantId\(tenantId\)/.test(health), "health route sentetik tenant bilgisini döndürür");
    const page = code("app/page.tsx");
    ok(/item\.permissionKey === "yasam_hafizasi"\s*\?\s*deriveYhCardStatus\(yhHealth\)\.text/.test(page), "ana panel YH kartı health'ten türetilir");
    const ws = code("app/yasam-hafizasi/components/YasamHafizasiWorkspace.tsx");
    ok(/fetchYhHealth\(/.test(ws) && /"index-empty"/.test(ws), "çalışma alanı mount'ta health okur (index-empty durumu)");
  }

  // ─── YH: index-page write kapısı ──────────────────────────────────────────
  section("YH · admin index-page kontrollü backfill write kapısı");
  {
    const TENANT = "55555555-5555-4555-8555-555555555555";
    const result = (mode: "dry-run" | "write"): IndexSourcePageResult =>
      ({
        sourceKey: "dogaltas:stones", mode, fetched: 1, eligibleUnits: 1, excludedDemo: 0, excludedSynthetic: 0,
        summary: { units: 1, skipped: 0, byReason: {} }, nextCursor: null, hasMore: false,
        parentStats: { requested: 0, found: 0, missing: 0 },
        write: mode === "write"
          ? { attempted: 1, written: 1, plannedInsert: 1, plannedUpdate: 0, unchanged: 0, failed: 0, chunksAttempted: 1, chunksSucceeded: 1, errors: [] }
          : null,
        exactMode: false, exactStatus: null,
      }) as unknown as IndexSourcePageResult;
    const mk = (act?: AdminIndexHandlerDeps["readSourceBackfillActivation"]) => {
      const c = { run: 0, act: 0 };
      const deps: AdminIndexHandlerDeps = {
        adminId: "66666666-6666-4666-8666-666666666666",
        checkAdminDemoStatus: async () => ({ ok: true, isDemo: false }),
        runIndexSourcePage: async (v) => {
          c.run++;
          return result(v.mode);
        },
        validateScopedTenant: async () => ({ ok: true, scope: {} as unknown as ValidatedTenantScope }),
        ...(act ? { readSourceBackfillActivation: async (k: string) => { c.act++; return act(k); } } : {}),
      };
      return { deps, c };
    };
    const bodyOf = (mode: string) => ({ sourceKey: "dogaltas:stones", mode, scopedTenantId: TENANT, limit: 50 });

    let t = mk();
    let out = await handleAdminIndexRequest(bodyOf("dry-run"), t.deps);
    ok(out.status === 200 && t.c.run === 1, "dry-run serbest (aktivasyon dep'i gerekmez)");
    t = mk();
    out = await handleAdminIndexRequest(bodyOf("write"), t.deps);
    ok(out.status === 503 && JSON.stringify(out.body).includes("source-activation-unavailable") && t.c.run === 0, "write + dep yok → 503 fail-closed, indeks çalışmaz");
    t = mk(async () => ({ ok: true, isActive: true, backfillAllowed: false }));
    out = await handleAdminIndexRequest(bodyOf("write"), t.deps);
    ok(out.status === 403 && JSON.stringify(out.body).includes("backfill-not-allowed") && t.c.run === 0, "is_active=true, backfill_allowed=false → 403");
    t = mk(async () => ({ ok: true, isActive: false, backfillAllowed: true }));
    out = await handleAdminIndexRequest(bodyOf("write"), t.deps);
    ok(out.status === 403 && t.c.run === 0, "is_active=false → 403");
    t = mk(async () => ({ ok: false }));
    out = await handleAdminIndexRequest(bodyOf("write"), t.deps);
    ok(out.status === 503 && t.c.run === 0, "aktivasyon okunamadı → 503");
    t = mk(async () => { throw new Error("db"); });
    out = await handleAdminIndexRequest(bodyOf("write"), t.deps);
    ok(out.status === 503 && t.c.run === 0, "aktivasyon okuma exception → 503");
    t = mk(async () => ({ ok: true, isActive: true, backfillAllowed: true }));
    out = await handleAdminIndexRequest(bodyOf("write"), t.deps);
    ok(out.status === 200 && t.c.run === 1 && t.c.act === 1, "is_active && backfill_allowed → write çalışır");
    t = mk(async () => ({ ok: true, isActive: true, backfillAllowed: true }));
    await handleAdminIndexRequest(bodyOf("dry-run"), t.deps);
    ok(t.c.act === 0, "dry-run aktivasyon tablosunu OKUMAZ");
    ok(isBackfillWriteAllowed({ ok: true, isActive: true, backfillAllowed: true }) && !isBackfillWriteAllowed(null), "isBackfillWriteAllowed saf karar");
    const route = code("app/api/admin/yasam-hafizasi/index-page/route.ts");
    ok(/readSourceBackfillActivation:/.test(route) && /from\("yh_source_activation"\)/.test(route) && /"is_active, backfill_allowed"/.test(route),
      "route yh_source_activation'ı enjekte eder");
  }

  // ─── YH: backfill aracı ────────────────────────────────────────────────────
  section("YH · kontrollü coverage backfill aracı (prod bağlantısı YOK)");
  {
    const { candidates, excluded } = selectBackfillSources(["refleksoloji", "aromaterapi", "dogaltas", "biyoenerji"]);
    ok(candidates.length > 0, `aday kaynak var (${candidates.length})`);
    ok(!candidates.some((c) => c.sourceKey === "refleksoloji:notes") && excluded.some((e) => e.sourceKey === "refleksoloji:notes"),
      "PII kaynak (refleksoloji:notes) HARİÇ");
    ok(!candidates.some((c) => /^client|appointment/i.test(c.table)), "danışan tabloları aday DEĞİL");
    ok(!candidates.some((c) => c.sourceKey.startsWith("kisisel_arsiv")), "row-gated kişisel arşiv aday DEĞİL");
    const sql = buildCoverageSql(candidates);
    ok(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT)\b/i.test(sql.replace(/--.*$/gm, "")), "coverage SQL salt-okuma");
    ok(sql.includes("aa8b960b-f4f1-4e5b-89f5-109bc030c147") && /yasam_hafizasi_index/.test(sql), "ADMIN_LIBRARY dışlanır + index karşılaştırması");
    const rb = buildRunbook(candidates, excluded);
    ok(/yh_source_activation_set\('dogaltas:stones', true, true/.test(rb) && /yh_source_activation_set\('dogaltas:stones', <önceki is_active>, false/.test(rb),
      "runbook: pencere aç (true,true) → kapat (önceki,false)");
    ok(rb.indexOf('"mode": "dry-run"') > -1 && rb.indexOf('"mode": "write"') > rb.indexOf('"mode": "dry-run"'),
      "runbook: dry-run → write sırası");
    ok(/Refleksoloji \/ Aromaterapi \/ Doğaltaş \/ Biyoenerji/.test(rb), "coverage gap rapor şablonu 4 aile");
    const tool = code("scripts/final-hardening/yh-coverage-backfill.ts");
    ok(!/supabase-server|getServerDb|createClient|fetch\(|process\.env/.test(tool), "araç prod'a / ağa / env'e dokunmaz");
    ok(!/YH_CLIENT_INDEX_SOURCES/.test(tool), "araç client index kaynaklarını okumaz");
  }

  console.log(`\n${"=".repeat(60)}\nHDAY HARNESS: ${pass} PASS / ${fail} FAIL\n${"=".repeat(60)}`);
  if (fail > 0) {
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("HARNESS CRASH:", e);
  process.exit(1);
});
