/**
 * HD AŞAMA 4B — Profesyonel Word v2 (hd-report-2) · HARNESS (DB'siz, ağsız)
 * =======================================================================
 *
 * GERÇEK route handler'ları (create / download / summary) bellek-içi sahte Supabase (tablolar +
 * storage) ve stub guard ile çağrılır ("@/lib/auth/userGuard" yalnız bu süreçte stub'lanır; aynı
 * stub hday harness'iyle paylaşılır). Gerçek Roxy fixture'ı normalize edilip kayıtlı harita olarak
 * kullanılır. Ağ YASAK (fetch sayacı) → Roxy çağrısı 0 kanıtı.
 *
 * Bölümler: A v1 uyumu · B v2 snapshot · C 13+13 · D haç · E merkezler · F kanal/kapı ·
 * G logo/marka · H yüksek çözünürlüklü BodyGraph · I PNG doğrulama · J yetki kapalı ·
 * K yetki açık (3 seçim) · L yetki sonradan kapandı · M değişmezlik · N tenant · O demo/Android/
 * auth · P Roxy=0 · Q DOCX bütünlüğü · R uzun Türkçe · S tekrar indirme · T idempotency ·
 * U BodyGraph politikası · V Sistem Yorumu yok · W malformed · X özet/sızıntı · Y statik değişmezler.
 *
 * Çalıştır: npm run hd:word:v2
 */

import Module, { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import type { HdReportSnapshotV2 } from "../../lib/human-design/reporting/reportSnapshotV2";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const OUT = process.argv[2] || "";

// ─── Stub: guard (hday stub'ı reuse) ──────────────────────────────────────────
const STUBS: Record<string, string> = {
  "server-only": join(ROOT, "scripts/final-hardening/hday-stubs/empty.cjs"),
  "@/lib/auth/userGuard": join(ROOT, "scripts/final-hardening/hday-stubs/userGuard.cjs"),
};
{
  const M = Module as unknown as { _resolveFilename: (r: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  M._resolveFilename = function (r: string, ...rest: unknown[]) {
    if (STUBS[r]) return STUBS[r];
    return orig.call(this, r, ...rest);
  };
}
const req = createRequire(import.meta.url);

// ─── Ağ YASAK (Roxy çağrısı 0 kanıtı) ─────────────────────────────────────────
const fetchCalls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  fetchCalls.push(String(input));
  throw new Error("harness: ağ çağrısı yasak");
}) as typeof fetch;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
function section(t: string): void { console.log(`\n—— ${t}`); }
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─── Sahte Supabase (tablolar + storage) ──────────────────────────────────────
type Row = Record<string, unknown>;
class FakeDb {
  tables: Record<string, Row[]> = {};
  selects: string[] = [];
  objects = new Map<string, Buffer>();
  failUpload = false;
  from(table: string) { return new FakeQuery(this, table); }
  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, data: Buffer, opts?: { upsert?: boolean }) => {
        if (this.failUpload) return { data: null, error: { message: "upload failed" } };
        const k = `${bucket}/${path}`;
        if (this.objects.has(k) && !opts?.upsert) return { data: null, error: { message: "The resource already exists" } };
        this.objects.set(k, Buffer.from(data));
        return { data: { path }, error: null };
      },
      copy: async (src: string, dst: string) => {
        const s = this.objects.get(`${bucket}/${src}`);
        if (!s) return { data: null, error: { message: "Object not found" } };
        if (this.objects.has(`${bucket}/${dst}`)) return { data: null, error: { message: "The resource already exists" } };
        this.objects.set(`${bucket}/${dst}`, Buffer.from(s));
        return { data: { path: dst }, error: null };
      },
      download: async (path: string) => {
        const b = this.objects.get(`${bucket}/${path}`);
        return b ? { data: new Blob([new Uint8Array(b)]), error: null } : { data: null, error: { message: "Object not found" } };
      },
      remove: async (paths: string[]) => {
        for (const p of paths) this.objects.delete(`${bucket}/${p}`);
        return { data: [], error: null };
      },
      list: async () => ({ data: [], error: null }),
    }),
  };
}

class FakeQuery {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private preds: Array<(r: Row) => boolean> = [];
  private payload: Row | Row[] | null = null;
  private cols: string | null = null;
  private mode: "many" | "maybe" | "single" = "many";
  private head = false;
  constructor(private db: FakeDb, private table: string) {}
  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    this.cols = cols ?? "*";
    if (opts?.head) this.head = true;
    if (this.op === "select") this.db.selects.push(`${this.table}:${this.cols}`);
    return this;
  }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.preds.push((r) => r[c] === v); return this; }
  in(c: string, vs: unknown[]) { this.preds.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: unknown) { this.preds.push((r) => (r[c] ?? null) === v); return this; }
  like() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }
  private project(r: Row): Row {
    if (!this.cols || this.cols.trim() === "*") return structuredClone(r);
    const out: Row = {};
    for (const c of this.cols.split(",").map((x) => x.trim()).filter(Boolean)) out[c] = structuredClone(r[c]);
    return out;
  }
  private exec(): { data: unknown; error: unknown; count?: number | null } {
    const rows = (this.db.tables[this.table] ??= []);
    let affected: Row[];
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      for (const p of list) {
        if (p.id && rows.some((r) => r.id === p.id)) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      }
      affected = list.map((p) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...structuredClone(p) }));
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
    return { data, error: null };
  }
  then<T>(res: (v: { data: unknown; error: unknown }) => T, rej?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.exec()).then(res, rej);
  }
}

// ─── Guard bağlantısı ─────────────────────────────────────────────────────────
let currentGuard: Record<string, unknown> | null = null;
(globalThis as Record<string, unknown>).__HDAY_GUARD__ = () => {
  if (!currentGuard) {
    const { NextResponse } = req("next/server");
    return { ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) };
  }
  return currentGuard;
};
function guardFor(db: FakeDb, o: { tenantId: string; system?: boolean; role?: string; demo?: boolean }) {
  return {
    ok: true,
    db,
    tenantId: o.tenantId,
    userId: `user-${o.tenantId.slice(0, 4)}`,
    email: "uzman@example.com",
    is_demo_account: o.demo === true,
    profile: {
      role: o.role ?? "expert",
      full_name: "Ayşe Uzman",
      membership_status: "active",
      module_permissions: { human_design: true, ...(o.system ? { hd_system_reading: true } : {}) },
    },
  };
}
function jsonReq(url: string, body: unknown, headers: Record<string, string> = {}, raw?: string) {
  const { NextRequest } = req("next/server");
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130", ...headers },
    body: raw ?? JSON.stringify(body),
  });
}
async function unzip(buf: ArrayBuffer | Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return { zip, xml, text: xml.replace(/<[^>]+>/g, "") };
}

// ─── PNG üretici (geçerli, tam çözülebilir) ───────────────────────────────────
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc(b: Buffer): number { let c = 0xffffffff; for (const x of b) c = CRC_T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function makePng(w: number, h: number, o: { colorType?: number; bitDepth?: number; interlace?: number; rawLen?: number } = {}): Buffer {
  const ct = o.colorType ?? 2;
  const bpp = ct === 6 ? 4 : 3;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = o.bitDepth ?? 8; ihdr[9] = ct; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = o.interlace ?? 0;
  const raw = Buffer.alloc(o.rawLen ?? (w * bpp + 1) * h, 0xff);
  for (let y = 0; y < h && !o.rawLen; y++) raw[y * (w * bpp + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;

// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  const { normalizeRoxyBodygraph } = await import("../../lib/human-design/providers/roxy/normalize");
  const { validateRoxyBodygraph } = await import("../../lib/human-design/providers/roxy/schema");
  const { extractSystemReading } = await import("../../lib/human-design/providers/roxy/systemReading");
  const { HD_PLANET_ORDER } = await import("../../lib/human-design/bodygraph/planetGlyphs");
  const V2 = await import("../../lib/human-design/reporting/reportSnapshotV2");
  const { validateBodygraphPng, decodePngBase64, HD_BODYGRAPH_PNG_MAX_BYTES } = await import("../../lib/human-design/reporting/bodygraphPng");
  const { renderHdReportV2Buffer, HD_BODYGRAPH_DOC_MAX } = await import("../../lib/human-design/reporting/wordReportV2");
  const { buildReportSnapshot } = await import("../../lib/human-design/reporting/reportSnapshot");
  const { buildPersonalKnowledgeStructure } = await import("../../lib/human-design/knowledge/personalKnowledge");
  const { buildExpertKnowledgeCodes } = await import("../../lib/human-design/normalize/hdAppCodes");
  const { saveCanonicalReport } = await import("../../lib/human-design/api/reportPersistence");
  const { __resetRateLimitStore } = await import("../../lib/rateLimit");
  const create = req("../../app/api/hd/reports/professional/route.ts") as { POST: (r: unknown) => Promise<Response> };
  const download = req("../../app/api/hd/reports/professional/download/route.ts") as { POST: (r: unknown) => Promise<Response> };
  const summary = req("../../app/api/hd/reports/professional/summary/route.ts") as { GET: (r: unknown) => Promise<Response> };
  const URL_C = "http://localhost/api/hd/reports/professional";
  const URL_D = "http://localhost/api/hd/reports/professional/download";

  const T1 = "11111111-1111-4111-8111-111111111111";
  const T2 = "22222222-2222-4222-8222-222222222222";
  const T3 = "33333333-3333-4333-8333-333333333333";
  const { OWNER_TENANT_ID: TA } = await import("../../lib/tenancy/syntheticTenants"); // owner/admin'in kendi uzman tenant'ı

  // ── Gerçek Roxy fixture → kayıtlı harita (normalize; yeni çağrı YOK) ──
  const FIXTURE = JSON.parse(read("scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json")) as Record<string, unknown>;
  // lang=tr BİÇİMİ: repodaki gerçek fixture lang=en. *Localized + Türkçe açıklamalar SENTETİK test değerleridir.
  const LONG_TR =
    "Bu açıklama sentetik test metnidir; Türkçe karakterlerin (İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç) ve uzun paragrafların " +
    "Word belgesinde doğru görüntülendiğini doğrulamak içindir. Sayfa geçişlerinde başlıkların içerikten kopmaması, " +
    "tabloların sayfa dışına taşmaması ve okunabilir bir ritmin korunması hedeflenir.";
  const rawTr = structuredClone(FIXTURE);
  Object.assign(rawTr, {
    typeLocalized: "Jeneratör", strategyLocalized: "Yanıt vermeyi bekle", authorityLocalized: "Sakral",
    definitionLocalized: "Bölünmüş", signatureLocalized: "Tatmin", notSelfLocalized: "Hayal kırıklığı",
    typeDescription: `${LONG_TR}\n\n${LONG_TR}`, strategyDescription: LONG_TR, authorityDescription: LONG_TR,
    profileDescription: LONG_TR, definitionDescription: LONG_TR,
  });
  (rawTr.incarnationCross as Row).angleLocalized = "Sağ Açı";
  (rawTr.incarnationCross as Row).description = LONG_TR;
  for (const c of rawTr.centers as Row[]) { c.theme = `Merkez teması: ${LONG_TR}`; c.notSelfQuestion = "Benlik-dışı soru (test)?"; }
  for (const c of rawTr.channels as Row[]) { c.description = `Kanal açıklaması: ${LONG_TR}`; }
  for (const g of rawTr.gates as Row[]) { g.gateDescription = `Kapı açıklaması: ${LONG_TR}`; g.lineMeaning = "Çizgi anlamı (test)."; }
  const v = validateRoxyBodygraph(rawTr);
  if (!v.ok) throw new Error("fixture geçersiz");
  const n = normalizeRoxyBodygraph(v.value, {
    date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48,
    nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z",
  });
  if (!n.ok) throw new Error("normalize başarısız");
  const ROXY_DESC_MARK = "Kapı açıklaması:"; // provider_raw metni — sızıntı kontrolü için

  const roxyRow = (id: string, tenant: string, clientId: string | null): Row => ({
    id, tenant_id: tenant, source: "computed", provider: "roxyapi",
    computed_result: structuredClone(n.chart), provider_raw: structuredClone(rawTr),
    type_code: n.codes.type_code, authority_code: n.codes.authority_code, profile_code: n.codes.profile_code,
    definition_code: n.codes.definition_code, active_centers: [...n.codes.active_centers], open_centers: [...n.codes.open_centers],
    gates: [...n.codes.gates], channels: [...n.codes.channels], client_id: clientId, client_name: "Elif Şahin Öztürk",
    birth_date: "2018-07-20", birth_time: "19:00:00", birth_place: "Konya, Türkiye", timezone: "Europe/Istanbul",
  });
  const typeCode = `tip_${n.codes.type_code}`;
  const gate0 = n.codes.gates[0];
  const LONG_EXPERT = Array.from({ length: 6 }, (_, i) => `${i + 1}. paragraf — Uzman açıklaması: ${LONG_TR}`).join("\n\n");
  const kb = (tenant: string, code: string, title: string, content: string, extra: Row = {}): Row => ({
    id: randomUUID(), tenant_id: tenant, user_id: "u", category: code.startsWith("tip_") ? "Tipler" : code.startsWith("kapi_") ? "Kapılar" : "Kanallar",
    title, code, content, keywords: [], related_gates: [], related_channels: [], related_centers: [], tags: [], sort_order: 0,
    is_active: true, expert_notes: "ÖZEL-NOT-SIZMAMALI", ...extra,
  });

  const makeDb = () => {
    const db = new FakeDb();
    db.tables.human_design_clients = [
      { id: "c-1", tenant_id: T1, name: "Elif Şahin Öztürk", birth_date: "2018-07-20", birth_time: "19:00", birth_place: "Konya", chart_image_url: null },
      { id: "c-2", tenant_id: T1, name: "Ayşe Çağ", birth_date: "1990-05-01", birth_time: "10:30", birth_place: "İzmir", chart_image_url: `${T1}/c-2/chart.png` },
    ];
    db.objects.set(`hd-chart-images/${T1}/c-2/chart.png`, makePng(800, 1100));
    db.tables.human_design_charts = [
      roxyRow("ch-roxy", T1, "c-1"),
      { id: "ch-man", tenant_id: T1, source: "manual", provider: null, computed_result: null, type_code: "generator", authority_code: "sacral",
        profile_code: "3_5", definition_code: "single", active_centers: ["sacral", "spleen", "heart_ego"], open_centers: null,
        gates: [26, 44, 5], channels: ["26-44"], client_id: "c-2", client_name: null, birth_date: null, birth_time: null, birth_place: null, timezone: null },
      { id: "ch-man-noimg", tenant_id: T1, source: "manual", provider: null, computed_result: null, type_code: "projector", authority_code: "splenic",
        profile_code: null, definition_code: null, active_centers: [], open_centers: null, gates: [5], channels: [], client_id: "c-1", client_name: null },
      roxyRow("ch-roxy-t2", T2, null),
      roxyRow("ch-roxy-t3", T3, null),
      roxyRow("ch-roxy-admin", TA, null),
      { ...roxyRow("ch-roxy-badacts", T1, "c-1"), computed_result: { ...structuredClone(n.chart), activations: n.chart.activations.slice(0, 25) } },
    ];
    db.tables.human_design_knowledge_records = [
      kb(T1, typeCode, "Tip Yorumum", LONG_EXPERT),
      kb(T1, `kapi_${gate0}`, `Kapı ${gate0} Notum`, "Kısa uzman açıklaması — kapı."),
      kb(T1, `kapi_${gate0}`, "Pasif Kayıt", "PASİF-İÇERİK", { is_active: false }),
      kb(T1, `kapi_${gate0}`, "Boş Kayıt", "   "),
      kb(T1, "kapi_99", "Eşleşmeyen", "ESLESMEYEN-ICERIK"),
      kb(T2, typeCode, "Başka Uzman", "BASKA-TENANT-ICERIGI"),
      kb(TA, typeCode, "Admin Kişisel Kaydı", "ADMIN-KISISEL-KAYIT"),
      { ...kb(T1, `kapi_${gate0}`, "Tenant'sız Kayıt", "TENANTSIZ-KAYIT"), tenant_id: null },
    ];
    db.tables.hd_canonical_content = [{ id: "x", canonical_key: typeCode, status: "published", general_description: "ADMIN-CANONICAL-METIN" }];
    db.tables.human_design_reports = [];
    return db;
  };
  const createAs = async (db: FakeDb, g: Parameters<typeof guardFor>[1], body: Row, headers: Record<string, string> = {}) => {
    __resetRateLimitStore();
    currentGuard = guardFor(db, g);
    const res = await create.POST(jsonReq(URL_C, body, headers));
    return { res, body: (await res.json()) as Row };
  };
  const downloadAs = async (db: FakeDb, g: Parameters<typeof guardFor>[1], reportId: unknown, headers: Record<string, string> = {}) => {
    __resetRateLimitStore();
    currentGuard = guardFor(db, g);
    return download.POST(jsonReq(URL_D, { reportId }, headers));
  };
  const BG = makePng(1271, 1800); // 1271/1800 = 0,7061 ≈ 432/612
  const realCapture = OUT && existsSync(join(OUT, "bodygraph-capture.png")) ? readFileSync(join(OUT, "bodygraph-capture.png")) : null;
  const pngForTests = realCapture ?? BG;
  const reportRow = (db: FakeDb, id: unknown) => db.tables.human_design_reports.find((r) => r.id === id) as Row & { snapshot: HdReportSnapshotV2 };

  // ── A) v1 geriye uyumluluk ───────────────────────────────────────────────
  section("A. hd-report-1 geriye uyumluluk");
  {
    const db = makeDb();
    const s = buildPersonalKnowledgeStructure({ type_code: "generator", authority_code: "sacral", gates: [5], channels: [] } as never);
    const rec = new Map<string, unknown>();
    for (const k of s.allKeys) rec.set(k, { meta: { contentId: "c", entityId: "e", entityKind: k.startsWith("tip_") ? "tip" : k.startsWith("otorite_") ? "otorite" : "kapi", canonicalKey: k, version: 1 }, content: { general_description: `V1::${k}`, report_text: "rt", strategy_text: null, signature_text: null, not_self_text: null, decision_mechanism: null, application_text: null, caution_notes: null, general_theme: null, full_channel_text: null, hanging_gate_context: null } });
    const v1 = buildReportSnapshot({ generatedAt: "2026-08-23T10:00:00.000Z", readAt: "2026-08-23T10:00:00.000Z", client: { name: "Eski Rapor" }, chart: { chartId: "ch-man", source: "manual" }, structure: s, recordByKey: rec as never });
    const saved = await saveCanonicalReport(db as never, T1, "u", { id: randomUUID(), chartId: "ch-man", clientId: "c-2", title: "Eski", snapshot: v1, provenance: {} });
    const row = reportRow(db, saved.id);
    ok("A1 v1 snapshot kaydı schema_version=hd-report-1, report_version=1", row?.schema_version === "hd-report-1" && row?.report_version === 1);
    ok("A2 isAnyHdReportSnapshot(v1) && !isHdReportSnapshotV2(v1)", V2.isAnyHdReportSnapshot(v1) && !V2.isHdReportSnapshotV2(v1));
    const res = await downloadAs(db, { tenantId: T1, system: true }, saved.id);
    const { text } = await unzip(await res.arrayBuffer());
    ok("A3 v1 rapor v1 renderer'ıyla iner (Temel Human Design Kimliği + canonical metin)", res.status === 200 && text.includes("Temel Human Design Kimliği") && text.includes("V1::tip_generator"));
    ok("A3b eski v1 rapor indirmesinde profil adı 'Hazırlayan' olarak YAZILMAZ", !text.includes("Hazırlayan"));
    ok("A4 v1 indirmesinde redaksiyon başlığı yok", res.headers.get("X-HD-Report-Redacted") === null);
    const sum = await (async () => { currentGuard = guardFor(db, { tenantId: T1 }); const { NextRequest } = req("next/server"); return summary.GET(new NextRequest(`http://localhost/x?id=${saved.id}`)); })();
    const sj = (await sum.json()) as Row;
    ok("A5 v1 özet ucu çalışır", sum.status === 200 && (sj.summary as Row).type !== undefined);
  }

  // ── B–F) Saf v2 snapshot ─────────────────────────────────────────────────
  const pure = V2.buildReportSnapshotV2({
    generatedAt: "2026-10-08T09:00:00.000Z", chartId: "ch-roxy", source: "computed", provider: "roxyapi",
    client: { name: "Elif Şahin Öztürk", birthDate: "2018-07-20", birthTime: "19:00:00", birthPlace: "Konya, Türkiye", timezone: "Europe/Istanbul" },
    codes: n.codes, computed: n.chart, requested: "both", systemReadingPermitted: true, systemReading: extractSystemReading(rawTr),
    // Servisle aynı: yalnız bu tenant + haritanın kodları (listKnowledgeByCodes eşdeğeri).
    expertRecords: makeDb().tables.human_design_knowledge_records.filter((r) => r.tenant_id === T1 && buildExpertKnowledgeCodes(n.codes).includes(String(r.code))) as never,
    bodygraph: { status: "roxy_render" }, chartImage: null,
  });
  section("B. hd-report-2 snapshot");
  ok("B1 schemaVersion=hd-report-2 ve şema doğrulayıcı geçer", pure.schemaVersion === "hd-report-2" && V2.isHdReportSnapshotV2(pure) && V2.isAnyHdReportSnapshot(pure));
  ok("B2 yerel saat HH:mm (saniyesiz), UTC anı snapshot'ta YOK", pure.client.birthTime === "19:00" && !JSON.stringify(pure).includes("2018-07-20T16:00"));
  ok("B3 kimlik etiketleri Türkçe uygulama sözlüğünden", !!pure.identity.type && !!pure.identity.authority && !!pure.identity.profile && !!pure.identity.definition);
  ok("B4 uzman kayıtları: yalnız aktif + dolu + bu tenant (pasif/boş/T2 yok)", pure.commentary.expert.entries.length === 2 && !JSON.stringify(pure).includes("PASİF-İÇERİK") && !JSON.stringify(pure).includes("BASKA-TENANT"));
  ok("B5 uzman özel notu (expert_notes) snapshot'a GİRMEZ", !JSON.stringify(pure).includes("ÖZEL-NOT-SIZMAMALI"));
  ok("B6 kategori sırası: Tipler önce Kapılar", pure.commentary.expert.entries[0].category === "Tipler");

  section("C. 13 Design + 13 Personality");
  {
    const a = pure.activations;
    ok("C1 status ok, 13 + 13", a.status === "ok" && a.design.length === 13 && a.personality.length === 13);
    if (a.status === "ok") {
      ok("C2 HD sütun sırası (Güneş, Dünya, KAD, GAD, Ay…)", a.design.map((x) => x.planet).join() === HD_PLANET_ORDER.join() && a.personality.map((x) => x.planet).join() === HD_PLANET_ORDER.join());
      const src = new Set(n.chart.activations.map((x) => `${x.side}|${x.body}|${x.gate}|${x.line}`));
      const got = new Set([...a.design.map((x) => `design|${x.planet}|${x.gate}|${x.line}`), ...a.personality.map((x) => `personality|${x.planet}|${x.gate}|${x.line}`)]);
      ok("C3 26 aktivasyon kayıtlı computed_result ile BİREBİR", src.size === 26 && got.size === 26 && [...src].every((k) => got.has(k)));
      const fxSun = (FIXTURE.gates as Row[]).find((g) => g.planet === "Sun" && g.side === "personality")!;
      ok("C4 Personality Güneş = fixture (56.2)", a.personality[0].gate === fxSun.gate && a.personality[0].line === fxSun.line && `${fxSun.gate}.${fxSun.line}` === "56.2");
    }
    ok("C5 eksik aktivasyon (25) → invalid (uydurma yok)", V2.freezeActivations({ activations: n.chart.activations.slice(0, 25) }).status === "invalid");
    const dup = structuredClone(n.chart.activations); dup[1] = { ...dup[0] };
    ok("C6 yinelenen gezegen → invalid", V2.freezeActivations({ activations: dup }).status === "invalid");
    const bad = structuredClone(n.chart.activations); bad[0].line = 7;
    ok("C7 çizgi 7 → invalid", V2.freezeActivations({ activations: bad }).status === "invalid");
    ok("C8 manuel harita → unavailable (bölüm yok)", V2.freezeActivations(null).status === "unavailable");
  }

  section("D. Enkarnasyon Haçı");
  {
    const { crossThemeNames, CROSS_THEME_KEYS } = await import("../../lib/human-design/reporting/crossThemeTr");
    const c1 = crossThemeNames("Right Angle Cross of Contagion 2", "Sağ Açı (Right Angle)");
    ok("D0a owner örneği: Contagion → \"Sağ Açılı Etki Yayma Teması\" + özgün ad", c1.tr === "Sağ Açılı Etki Yayma Teması 2" && c1.en === "Right Angle Cross of Contagion 2" && c1.themeKnown);
    ok("D0b numarasız + \"the\": Sleeping Phoenix", crossThemeNames("Right Angle Cross of the Sleeping Phoenix", null).tr === "Sağ Açılı Uyuyan Anka Teması");
    ok("D0c Sol Açılı + Yan Yana", crossThemeNames("Left Angle Cross of Healing 1", null).tr === "Sol Açılı Şifa Teması 1" && crossThemeNames("Juxtaposition Cross of Thinking", null).tr === "Yan Yana Düşünme Teması");
    const unk = crossThemeNames("Right Angle Cross of Bilinmeyen 3", null);
    ok("D0d sözlükte olmayan tema UYDURULMAZ (genel Türkçe ad + özgün ad)", unk.tr === "Sağ Açılı Enkarnasyon Teması" && unk.en === "Right Angle Cross of Bilinmeyen 3" && !unk.themeKnown);
    const go = crossThemeNames("Sağ Açı (Right Angle) (yalnız kapılar)", "Sağ Açı (Right Angle)");
    ok("D0e sağlayıcı adı yoksa (yalnız kapılar): \"Sağ Açılı Enkarnasyon Teması\" / \"Right Angle Cross\"", go.tr === "Sağ Açılı Enkarnasyon Teması" && go.en === "Right Angle Cross");
    const all = CROSS_THEME_KEYS.flatMap((k) => ["Right Angle", "Left Angle", "Juxtaposition"].map((a) => crossThemeNames(`${a} Cross of ${k} 1`, null)));
    ok("D0f sözlükteki HER tema × 3 açı: Türkçe adda \"Haç\" yok, tema bilinir, İngilizce ad aynen", all.length > 100 && all.every((n) => !/Haç/i.test(n.tr) && n.themeKnown && / Cross of /.test(n.en)));
  }
  ok("D1 ad + kapılar (Personality Güneş/Dünya | Design Güneş/Dünya)", pure.identity.cross?.name === "Right Angle Cross of Laws 2" && pure.identity.cross?.gates === "56/60 | 3/50");
  ok("D2 bozuk haç → null (uydurma yok)", V2.freezeCross({ incarnationCross: { gates: [1, 2, 3] } }) === null);

  section("E. Merkezler");
  ok("E1 9 merkez; tanımlılar kayıtlı active_centers ile aynı", pure.centers.length === 9 && pure.centers.filter((c) => c.defined).map((c) => c.code).sort().join() === [...n.codes.active_centers].sort().join());
  ok("E2 açıklar kayıtlı open_centers ile aynı", pure.centers.filter((c) => !c.defined).map((c) => c.code).sort().join() === [...n.codes.open_centers].sort().join());

  section("F. Kanallar ve kapılar");
  ok("F1 kanallar kayıtlı kodlarla aynı", pure.channels.map((c) => c.code).join() === n.codes.channels.join());
  ok("F2 kapılar kayıtlı kodlarla aynı ve 26 aktivasyonun benzersiz kapıları", pure.gates.map((g) => g.gate).join() === n.codes.gates.join() && new Set(n.chart.activations.map((x) => x.gate)).size === pure.gates.length);
  ok("F3 kanal uçları: her kanalın iki kapısı aktif kapılarda ve kapı→kanal bağı doğru", pure.channels.every((c) => c.gates.every((g) => pure.gates.some((x) => x.gate === g && x.channel === c.code))));
  ok("F4 her kapının aktivasyon listesi computed ile tutarlı", pure.gates.every((g) => g.activations.length === n.chart.activations.filter((x) => x.gate === g.gate).length));

  // ── Route akışları ────────────────────────────────────────────────────────
  section("J. Sistem Yorumu yetkisi KAPALI");
  {
    const db = makeDb();
    const r = await createAs(db, { tenantId: T1 }, { chartId: "ch-roxy", commentary: "system", bodygraphPng: dataUrl(pngForTests) });
    ok("J1 rapor oluşur (200)", r.res.status === 200 && r.body.ok === true, JSON.stringify(r.body));
    const row = reportRow(db, r.body.id);
    ok("J2 seçim 'system' + yetki yok: system=not_permitted; Bilgi Bankası seçilmediği için EKLENMEZ", row?.snapshot.commentary.system.status === "not_permitted" && row.snapshot.commentary.expert.included === false && row.snapshot.commentary.system.reading === null);
    ok("J3 provider_raw HİÇ okunmadı (select kolonlarında yok)", !db.selects.some((s) => s.includes("provider_raw")));
    ok("J4 admin merkezî canonical içeriği okunmadı", !db.selects.some((s) => s.startsWith("hd_canonical_content")));
    const d = await downloadAs(db, { tenantId: T1 }, r.body.id);
    const { text } = await unzip(await d.arrayBuffer());
    ok("J5 DOCX: Bilgi Bankası açıklaması YOK (seçilmedi), Sistem Yorumu bölümü YOK", !text.includes("Uzman Bilgilerim") && !text.includes("Tip Yorumum") && !text.includes("Kaynak: Harita hesaplanırken") && !text.includes(ROXY_DESC_MARK));
    ok("J6 DOCX: admin içeriği / başka uzman / pasif / eşleşmeyen kayıt YOK", !text.includes("ADMIN-CANONICAL") && !text.includes("BASKA-TENANT") && !text.includes("PASİF-İÇERİK") && !text.includes("ESLESMEYEN-ICERIK"));
    // Bilgi Bankası boş tenant → teknik rapor yine oluşur, yorum uydurulmaz.
    const r3 = await createAs(db, { tenantId: T3 }, { chartId: "ch-roxy-t3", commentary: "expert", bodygraphPng: dataUrl(pngForTests) });
    const d3 = await downloadAs(db, { tenantId: T3 }, r3.body.id);
    const t3 = (await unzip(await d3.arrayBuffer())).text;
    ok("J7 boş Bilgi Bankası (açıklama seçili): rapor oluşur; Uzman Açıklamaları bölümü ve danışana teknik 'eşleşme yok' notu YOK", r3.res.status === 200 && !t3.includes("Uzman Açıklamaları") && !t3.includes("eşleşen kayıt bulunmadığından") && r3.body.expertEntries === 0);
  }

  section("K. Sistem Yorumu yetkisi AÇIK — üç seçim");
  const sysDb = makeDb();
  const results: Record<string, { id: unknown; text: string; row: Row & { snapshot: HdReportSnapshotV2 } }> = {};
  for (const sel of ["expert", "system", "both"] as const) {
    const r = await createAs(sysDb, { tenantId: T1, system: true }, { chartId: "ch-roxy", commentary: sel, bodygraphPng: dataUrl(pngForTests) });
    const d = await downloadAs(sysDb, { tenantId: T1, system: true }, r.body.id);
    results[sel] = { id: r.body.id, text: (await unzip(await d.arrayBuffer())).text, row: reportRow(sysDb, r.body.id) };
  }
  ok("K1 yalnız Uzman: uzman var, sistem yok", results.expert.text.includes("Uzman Açıklamaları") && !results.expert.text.includes(ROXY_DESC_MARK) && results.expert.row.snapshot.commentary.system.status === "not_selected");
  ok("K2 yalnız Sistem: sistem var, uzman yok", results.system.text.includes("Sistem Yorumu") && results.system.text.includes(ROXY_DESC_MARK) && !results.system.text.includes("Tip Yorumum") && results.system.row.snapshot.commentary.expert.included === false);
  const both = results.both.text;
  ok("K3 her ikisi: iki AYRI bölüm, kaynak etiketleri açık", both.includes("Bu bölümdeki açıklamalar, raporu hazırlayan uzmanın") && both.includes("Kaynak: Harita hesaplanırken") && both.includes("Tip Yorumum") && both.includes(ROXY_DESC_MARK));
  ok("K4 sıra: Uzman Bilgilerim → Sistem Yorumu → Kaynak Bilgisi", both.indexOf("Bu bölümdeki açıklamalar, raporu hazırlayan") >= 0 && both.indexOf("Bu bölümdeki açıklamalar, raporu hazırlayan") < both.indexOf("Kaynak: Harita hesaplanırken") && both.indexOf("Kaynak: Harita hesaplanırken") < both.lastIndexOf("Kaynak Bilgisi"));
  ok("K5 Sistem Yorumu Türkçe yerelleştirilmiş etiketleri kullanır", both.includes("Tip: Jeneratör") && both.includes("Strateji: Yanıt vermeyi bekle"));
  {
    const r = await createAs(sysDb, { tenantId: T1, system: true }, { chartId: "ch-roxy", bodygraphPng: dataUrl(pngForTests) });
    const k6 = reportRow(sysDb, r.body.id)?.snapshot.commentary;
    ok("K6 seçim gönderilmezse varsayılan: HİÇBİRİ (yalnız teknik içerik)", k6?.requested === "none" && k6.system.status === "not_selected" && k6.expert.included === false && k6.expert.entries.length === 0);
    const bad = await createAs(sysDb, { tenantId: T1, system: true }, { chartId: "ch-roxy", commentary: "admin" });
    ok("K7 geçersiz seçim → 400", bad.res.status === 400 && bad.body.code === "INVALID_COMMENTARY");
  }

  section("P. Gizlilik — içerik seçimi (varsayılan kapalı) + Özel Çalışma Notları asla");
  {
    const pdb = makeDb();
    const NOTE = "ÖZEL-NOT-SIZMAMALI";
    const run = async (g: Parameters<typeof guardFor>[1], body: Row) => {
      const r = await createAs(pdb, g, { chartId: "ch-roxy", bodygraphPng: dataUrl(pngForTests), ...body });
      const d = r.res.status === 200 ? await downloadAs(pdb, g, r.body.id) : null;
      const text = d ? (await unzip(await d.arrayBuffer())).text : "";
      return { r, text, row: r.res.status === 200 ? reportRow(pdb, r.body.id) : null };
    };
    const sys = { tenantId: T1, system: true };
    const none = await run(sys, { commentary: "none" });
    ok("P1 ikisi de KAPALI: teknik içerik var; Bilgi Bankası ve Sistem Yorumu YOK", none.r.res.status === 200 && none.text.includes("Kapılar") && none.text.includes("Kanallar")
      && !none.text.includes("Uzman Bilgilerim") && !none.text.includes("Tip Yorumum") && !none.text.includes(ROXY_DESC_MARK) && !none.text.includes("Sistem Yorumu:"), JSON.stringify(none.r.body));
    ok("P1b ikisi de kapalı: boş başlık / 'eşleşen kayıt yok' notu oluşmaz", !none.text.includes("eşleşen kayıt bulunmadığından") && none.row?.snapshot.commentary.expert.entries.length === 0);
    const kOnly = await run(sys, { commentary: "expert" });
    ok("P2 yalnız Bilgi Bankası: eşleşen açıklamalar AYNEN var, sistem yok", kOnly.text.includes("Tip Yorumum") && kOnly.text.includes("Uzman Açıklamaları") && !kOnly.text.includes(ROXY_DESC_MARK));
    const sOnly = await run(sys, { commentary: "system" });
    ok("P3 yalnız Sistem Yorumu: sistem var, Bilgi Bankası yok", sOnly.text.includes(ROXY_DESC_MARK) && !sOnly.text.includes("Tip Yorumum") && sOnly.row?.snapshot.commentary.expert.included === false);
    const both2 = await run(sys, { commentary: "both" });
    ok("P4 ikisi de açık: iki ayrı bölüm", both2.text.includes("Tip Yorumum") && both2.text.includes(ROXY_DESC_MARK));
    const all = [none, kOnly, sOnly, both2];
    ok("P5 Özel Çalışma Notları HİÇBİR senaryoda ne snapshot'ta ne DOCX'te", all.every((x) => !x.text.includes(NOTE) && !JSON.stringify(x.row?.snapshot ?? {}).includes(NOTE)));
    const kbSelects = pdb.selects.filter((q) => q.startsWith("human_design_knowledge_records:"));
    ok("P5b rapor yolu Bilgi Bankası'nda expert_notes kolonunu HİÇ OKUMAZ (select * yok)", kbSelects.length > 0 && kbSelects.every((q) => !q.includes("expert_notes") && !q.endsWith(":*")), kbSelects.join(" | "));
    // İstemci manipülasyonu: bilinmeyen/sahte alanlar ve seçimler.
    const forged = await run(sys, { commentary: "expert", includeExpertNotes: true, expert_notes: NOTE, includePrivateNotes: true, notes: NOTE, expertNotes: NOTE });
    ok("P6 manipüle istek (includeExpertNotes / expert_notes gövdede): not rapora GİRMEZ", forged.r.res.status === 200 && !forged.text.includes(NOTE) && !JSON.stringify(forged.row?.snapshot ?? {}).includes(NOTE));
    for (const c of ["notes", "private", "expert_notes", "all", "", 1, true, ["expert"], { knowledge: true }]) {
      const bad = await createAs(pdb, sys, { chartId: "ch-roxy", commentary: c, bodygraphPng: dataUrl(pngForTests) });
      ok(`P6b geçersiz seçim ${JSON.stringify(c)} → 400 (sessizce genişletilmez)`, bad.res.status === 400 && bad.body.code === "INVALID_COMMENTARY");
    }
    const noPerm = await run({ tenantId: T1 }, { commentary: "both" });
    ok("P6c yetkisiz uzman 'both' gönderse de Sistem Yorumu EKLENMEZ; yalnız seçtiği açıklamalar", noPerm.row?.snapshot.commentary.system.status === "not_permitted" && !noPerm.text.includes(ROXY_DESC_MARK) && noPerm.text.includes("Tip Yorumum"));
    ok("P7 başka tenant'ın / pasif / ilgisiz kodlu kayıtları hiçbir seçimde yok", all.concat([forged, noPerm]).every((x) => !x.text.includes("BASKA-TENANT") && !x.text.includes("PASİF-İÇERİK") && !x.text.includes("ESLESMEYEN-ICERIK")));
    // Kayıtlı eski Word: sonradan Bilgi Bankası değişse de indirilen içerik AYNI (donmuş snapshot).
    const before = kOnly.text;
    const tipRec = pdb.tables.human_design_knowledge_records.find((r) => String(r.code).startsWith("tip_") && r.tenant_id === T1 && r.is_active === true);
    if (tipRec) { tipRec.content = "DEĞİŞTİRİLMİŞ-SONRADAN"; tipRec.expert_notes = "YENİ-ÖZEL-NOT"; }
    const again = await downloadAs(pdb, sys, kOnly.r.body.id);
    const againText = (await unzip(await again.arrayBuffer())).text;
    ok("P9 kayıtlı eski Word değiştirilmeden iner (Bilgi Bankası sonradan değişse de)", againText === before && !againText.includes("DEĞİŞTİRİLMİŞ-SONRADAN") && !againText.includes("YENİ-ÖZEL-NOT"));
  }

  section("L. Yetki sonradan KAPANDI → indirme filtresi");
  {
    const id = results.both.id;
    const before = createHash("sha256").update(JSON.stringify(reportRow(sysDb, id).snapshot)).digest("hex");
    const d = await downloadAs(sysDb, { tenantId: T1, system: false }, id);
    const { text } = await unzip(await d.arrayBuffer());
    ok("L1 doğrudan download ucu: Sistem Yorumu bölümü ÇIKARILDI", d.status === 200 && !text.includes(ROXY_DESC_MARK) && !text.includes("Kaynak: Harita hesaplanırken"));
    ok("L2 yanıt başlığı X-HD-Report-Redacted: system-reading", d.headers.get("X-HD-Report-Redacted") === "system-reading");
    ok("L3 belgede Sistem Yorumu'nun bu çıktıda yer almadığı yazıyor (teknik yetki ayrıntısı danışana gösterilmez)", text.includes("Sistem Yorumu bu çıktıda yer almamaktadır."));
    ok("L4 uzman bölümü korunur", text.includes("Tip Yorumum"));
    const after = createHash("sha256").update(JSON.stringify(reportRow(sysDb, id).snapshot)).digest("hex");
    ok("L5 DB snapshot DEĞİŞMEDİ (sessiz değişiklik yok)", before === after);
    const back = await downloadAs(sysDb, { tenantId: T1, system: true }, id);
    const tb = (await unzip(await back.arrayBuffer())).text;
    ok("L6 yetki geri açılınca aynı rapor yine tam", tb.includes(ROXY_DESC_MARK) && back.headers.get("X-HD-Report-Redacted") === null);
    const view = V2.applyDownloadPermissions(pure, false);
    ok("L7 saf filtre girdiyi mutasyona uğratmaz", view.systemReadingRedacted && pure.commentary.system.reading !== null && view.snapshot.commentary.system.reading === null);
  }

  section("M. Snapshot değişmezliği");
  {
    const id = results.both.id;
    const first = (await unzip(await (await downloadAs(sysDb, { tenantId: T1, system: true }, id)).arrayBuffer())).xml;
    for (const r of sysDb.tables.human_design_knowledge_records) r.content = "DEĞİŞTİRİLMİŞ-BİLGİ";
    const ch = sysDb.tables.human_design_charts.find((c) => c.id === "ch-roxy")!;
    (ch.computed_result as Row).activations = [];
    (ch.provider_raw as Row).typeDescription = "DEĞİŞTİRİLMİŞ-SİSTEM";
    ch.gates = [1];
    const second = (await unzip(await (await downloadAs(sysDb, { tenantId: T1, system: true }, id)).arrayBuffer())).xml;
    ok("M1 Bilgi Bankası + harita + provider_raw değişse de rapor AYNI", first === second && !second.includes("DEĞİŞTİRİLMİŞ"));
  }

  section("N. Tenant izolasyonu");
  {
    const db = makeDb();
    const own = await createAs(db, { tenantId: T1, system: true }, { chartId: "ch-roxy", commentary: "expert", bodygraphPng: dataUrl(pngForTests) });
    const x = await createAs(db, { tenantId: T2, system: true }, { chartId: "ch-roxy", bodygraphPng: dataUrl(pngForTests) });
    ok("N1 başka tenant'ın haritası → 404", x.res.status === 404);
    const d = await downloadAs(db, { tenantId: T2, system: true }, own.body.id);
    ok("N2 başka tenant'ın raporu indirme → 404", d.status === 404);
    currentGuard = guardFor(db, { tenantId: T2 });
    const { NextRequest } = req("next/server");
    const s = await summary.GET(new NextRequest(`http://localhost/x?id=${own.body.id}`));
    ok("N3 başka tenant'ın rapor özeti → 404", s.status === 404);
    const t2 = await createAs(db, { tenantId: T2 }, { chartId: "ch-roxy-t2", commentary: "expert", bodygraphPng: dataUrl(pngForTests) });
    const tt = (await unzip(await (await downloadAs(db, { tenantId: T2 }, t2.body.id)).arrayBuffer())).text;
    ok("N4 T2 raporunda yalnız T2 uzman bilgisi (T1 kayıtları yok)", tt.includes("BASKA-TENANT-ICERIGI") && !tt.includes("Tip Yorumum"));
    const ownText = (await unzip(await (await downloadAs(db, { tenantId: T1, system: true }, own.body.id)).arrayBuffer())).text;
    ok("N6 uzman raporunda admin'in kişisel kaydı ve tenant'sız (NULL) kayıt YOK", !ownText.includes("ADMIN-KISISEL-KAYIT") && !ownText.includes("TENANTSIZ-KAYIT") && ownText.includes("Tip Yorumum"));
    const adm = await createAs(db, { tenantId: TA, role: "admin" }, { chartId: "ch-roxy-admin", commentary: "expert", bodygraphPng: dataUrl(pngForTests) });
    const admText = (await unzip(await (await downloadAs(db, { tenantId: TA, role: "admin" }, adm.body.id)).arrayBuffer())).text;
    ok("N7 admin raporu YALNIZ admin'in kendi kayıtları (başka uzman kaydı yok)", adm.res.status === 200 && admText.includes("ADMIN-KISISEL-KAYIT") && !admText.includes("Tip Yorumum") && !admText.includes("BASKA-TENANT-ICERIGI"));
    const admX = await createAs(db, { tenantId: TA, role: "admin" }, { chartId: "ch-roxy", bodygraphPng: dataUrl(pngForTests) });
    ok("N8 admin rolü başka uzmanın haritasından rapor üretemez (404, tenant = oturum)", admX.res.status === 404);
    const img = reportRow(db, own.body.id)?.snapshot.chartImage?.storagePath as string;
    ok("N5 BodyGraph yolu tenant'ın rapor klasöründe ({tenant}/report-snapshots/{id}.png)", img === `${T1}/report-snapshots/${own.body.id}.png` && db.objects.has(`hd-chart-images/${img}`));
  }

  section("O. Demo / Android / kimlik");
  {
    const db = makeDb();
    const demo = await createAs(db, { tenantId: T1, demo: true }, { chartId: "ch-roxy" });
    ok("O1 demo hesap → 403", demo.res.status === 403 && demo.body.code === "DEMO_READONLY");
    const android = await createAs(db, { tenantId: T1 }, { chartId: "ch-roxy" }, { "user-agent": "Mozilla/5.0 (Linux; Android 14) wv" });
    ok("O2 Android oluşturma → 403", android.res.status === 403);
    const own = await createAs(db, { tenantId: T1 }, { chartId: "ch-roxy", bodygraphPng: dataUrl(pngForTests) });
    const ad = await downloadAs(db, { tenantId: T1 }, own.body.id, { "user-agent": "Mozilla/5.0 (Linux; Android 14) wv" });
    ok("O3 Android indirme → 403", ad.status === 403);
    currentGuard = null;
    __resetRateLimitStore();
    const un = await create.POST(jsonReq(URL_C, { chartId: "ch-roxy" }));
    const und = await download.POST(jsonReq(URL_D, { reportId: own.body.id }));
    ok("O4 oturumsuz → 401 (oluştur + indir)", un.status === 401 && und.status === 401);
    ok("O5 demo/Android/401 hiçbir rapor satırı yazmadı", db.tables.human_design_reports.length === 1);
  }

  section("H/U. BodyGraph — yüksek çözünürlük + politika");
  {
    const db = makeDb();
    const r = await createAs(db, { tenantId: T1, system: true }, { chartId: "ch-roxy", bodygraphPng: dataUrl(pngForTests) });
    const row = reportRow(db, r.body.id);
    ok("H1 status=roxy_render + ölçü/sha256 snapshot'ta", row.snapshot.bodygraph.status === "roxy_render" && (row.snapshot.bodygraph.height ?? 0) >= 1800 && /^[0-9a-f]{64}$/.test(row.snapshot.bodygraph.sha256 ?? ""));
    const d = await downloadAs(db, { tenantId: T1, system: true }, r.body.id);
    const { zip, xml } = await unzip(await d.arrayBuffer());
    const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !zip.files[f].dir);
    const bufs = await Promise.all(media.map((m) => zip.file(m)!.async("nodebuffer")));
    ok("H2 DOCX'e gömülü BodyGraph bayt-bayt yüklenen PNG ile AYNI (yeniden örnekleme yok → net)", bufs.some((b) => b.equals(pngForTests)));
    const extents = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [Number(m[1]) / 9525, Number(m[2]) / 9525]);
    const big = extents.find(([, h]) => h > 500);
    ok("H3 BodyGraph büyük ve A4'e sığar (≤600×800 px @96dpi), oran korunur", !!big && big[0] <= HD_BODYGRAPH_DOC_MAX.width && big[1] <= HD_BODYGRAPH_DOC_MAX.height && Math.abs(big[0] / big[1] - 432 / 612) < 0.01, JSON.stringify(extents));
    const none = await createAs(db, { tenantId: T1 }, { chartId: "ch-roxy" });
    ok("U1 Roxy haritası + görsel yok + onay yok → 422 BODYGRAPH_REQUIRED (sessiz eksik rapor YOK)", none.res.status === 422 && none.body.code === "BODYGRAPH_REQUIRED");
    const allow = await createAs(db, { tenantId: T1 }, { chartId: "ch-roxy", allowMissingBodygraph: true });
    const at = (await unzip(await (await downloadAs(db, { tenantId: T1 }, allow.body.id)).arrayBuffer())).text;
    ok("U2 açık onayla oluşur; status=missing, belgede açık uyarı", allow.body.bodygraph === "missing" && at.includes("BodyGraph görseli bu rapora eklenemedi") && at.includes("Teknik harita verileri bu ve sonraki sayfalarda"));
    const man = await createAs(db, { tenantId: T1 }, { chartId: "ch-man" });
    ok("U3 manuel harita: danışanın yüklenmiş görseli (owned kopya) → uploaded_image", man.res.status === 200 && man.body.bodygraph === "uploaded_image" && db.objects.has(`hd-chart-images/${T1}/report-snapshots/${man.body.id}.png`));
    const manNo = await createAs(db, { tenantId: T1 }, { chartId: "ch-man-noimg" });
    ok("U4 manuel harita görselsiz → oluşur (onay gerekmez), status=missing", manNo.res.status === 200 && manNo.body.bodygraph === "missing");
    const pngOnManual = await createAs(db, { tenantId: T1 }, { chartId: "ch-man", bodygraphPng: dataUrl(BG) });
    ok("U5 manuel haritaya PNG → 400 BODYGRAPH_NOT_APPLICABLE", pngOnManual.res.status === 400 && pngOnManual.body.code === "BODYGRAPH_NOT_APPLICABLE");
    const rows0 = db.tables.human_design_reports.length;
    const objs0 = db.objects.size;
    const fake = await createAs(db, { tenantId: T1 }, { chartId: "ch-roxy", bodygraphPng: `data:image/png;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}` });
    ok("U6 sahte PNG → 422 BODYGRAPH_INVALID; satır/obje yazılmadı", fake.res.status === 422 && fake.body.code === "BODYGRAPH_INVALID" && db.tables.human_design_reports.length === rows0 && db.objects.size === objs0);
    db.failUpload = true;
    const upFail = await createAs(db, { tenantId: T1 }, { chartId: "ch-roxy", bodygraphPng: dataUrl(BG) });
    db.failUpload = false;
    ok("U7 depolama hatası → 503, rapor satırı yok", upFail.res.status === 503 && db.tables.human_design_reports.length === rows0);
  }

  section("I. PNG imza / boyut / piksel sınırı");
  {
    const t = (b: Buffer | null, codeWanted: string) => { const r = validateBodygraphPng(b); return !r.ok && r.code === codeWanted; };
    ok("I1 geçerli 1271×1800 RGB", validateBodygraphPng(BG).ok);
    ok("I2 geçerli RGBA", validateBodygraphPng(makePng(1271, 1800, { colorType: 6 })).ok);
    if (realCapture) ok("I3 gerçek renderer yakalaması geçer", validateBodygraphPng(realCapture).ok);
    ok("I4 boş", t(Buffer.alloc(0), "EMPTY"));
    ok("I5 JPEG imzası → NOT_PNG", t(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(60).fill(0)]), "NOT_PNG"));
    ok("I6 SVG metni → NOT_PNG", t(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'>".padEnd(80, " ")), "NOT_PNG"));
    const tampered = Buffer.from(BG); tampered[20] ^= 0x01;
    ok("I7 CRC bozulmuş → CORRUPT", t(tampered, "CORRUPT"));
    ok("I8 kesik dosya → CORRUPT", t(BG.subarray(0, BG.length - 6), "CORRUPT"));
    ok("I9 sona eklenmiş veri (polyglot) → CORRUPT", t(Buffer.concat([BG, Buffer.from("<html>")]), "CORRUPT"));
    ok("I10 yükseklik < 1800 → TOO_SMALL", t(makePng(800, 1133), "TOO_SMALL"));
    ok("I11 > 3072 px → TOO_BIG_DIMENSIONS", t(makePng(2400, 3400), "TOO_BIG_DIMENSIONS"));
    ok("I12 yanlış oran (kare) → BAD_ASPECT", t(makePng(1800, 1800), "BAD_ASPECT"));
    ok("I13 16-bit → UNSUPPORTED_FORMAT", t(makePng(1271, 1800, { bitDepth: 16 }), "UNSUPPORTED_FORMAT"));
    ok("I14 interlaced → UNSUPPORTED_FORMAT", t(makePng(1271, 1800, { interlace: 1 }), "UNSUPPORTED_FORMAT"));
    ok("I15 palet (renk tipi 3) → UNSUPPORTED_FORMAT", t(makePng(1271, 1800, { colorType: 3 }), "UNSUPPORTED_FORMAT"));
    ok("I16 IDAT ham boyutu IHDR ile uyuşmaz → CORRUPT", t(makePng(1271, 1800, { rawLen: 1000 }), "CORRUPT"));
    const big = Buffer.alloc(HD_BODYGRAPH_PNG_MAX_BYTES + 10); BG.copy(big);
    ok("I17 bayt limiti aşımı → TOO_LARGE", t(big, "TOO_LARGE"));
    ok("I18 data:image/svg+xml data URL'i çözülmez", decodePngBase64("data:image/svg+xml;base64,PHN2Zz4=") === null);
    const r = await createAs(makeDb(), { tenantId: T1 }, { chartId: "ch-roxy", bodygraphPng: dataUrl(makePng(800, 1133)) });
    ok("I19 route: küçük PNG → 422 (mesaj Türkçe)", r.res.status === 422 && String(r.body.error).includes("1800"));
  }

  section("V. Sistem Yorumu verisi YOK (manuel/legacy)");
  {
    const db = makeDb();
    const only = await createAs(db, { tenantId: T1, system: true }, { chartId: "ch-man", commentary: "system" });
    ok("V1 yalnız Sistem istendi, veri yok → 422 SYSTEM_READING_UNAVAILABLE (anlaşılır)", only.res.status === 422 && only.body.code === "SYSTEM_READING_UNAVAILABLE");
    const bothM = await createAs(db, { tenantId: T1, system: true }, { chartId: "ch-man", commentary: "both" });
    ok("V2 her ikisi → rapor oluşur, system=unavailable (engellenmez, uydurulmaz)", bothM.res.status === 200 && bothM.body.systemReading === "unavailable");
    const tm = (await unzip(await (await downloadAs(db, { tenantId: T1, system: true }, bothM.body.id)).arrayBuffer())).text;
    ok("V3 manuel rapor: aktivasyon sütunları yok, kimlik + kanal/kapı var; danışana teknik sistem notu YOK", !tm.includes("13 aktivasyon") && tm.includes("Danışan ve Harita Kimliği") && tm.includes("Kanallar") && !tm.includes("kayıtlı sistem açıklaması bulunmadığından"));
    const bad = await createAs(db, { tenantId: T1, system: true }, { chartId: "ch-roxy-badacts", bodygraphPng: dataUrl(pngForTests) });
    const tb = (await unzip(await (await downloadAs(db, { tenantId: T1, system: true }, bad.body.id)).arrayBuffer())).text;
    ok("V4 bozuk kayıtlı aktivasyon → sütunlar yerine açık not (uydurma yok)", tb.includes("doğrulanamadığı için aktivasyonlar gösterilmiyor") && !tb.includes("13 aktivasyon"));
  }

  section("W. Malformed payload");
  {
    const db = makeDb();
    __resetRateLimitStore();
    currentGuard = guardFor(db, { tenantId: T1 });
    const r1 = await create.POST(jsonReq(URL_C, null, {}, "{bozuk json"));
    const r2 = await create.POST(jsonReq(URL_C, [1, 2]));
    const r3 = await create.POST(jsonReq(URL_C, { chartId: 42 }));
    const r4 = await create.POST(jsonReq(URL_C, {}));
    const r5 = await create.POST(jsonReq(URL_C, { chartId: "ch-roxy", bodygraphPng: 12345 }));
    ok("W1 bozuk JSON / dizi / sayı chartId / eksik chartId → 400", [r1, r2, r3, r4].every((r) => r.status === 400));
    ok("W2 bodygraphPng tip hatası → 422", r5.status === 422);
    const d1 = await download.POST(jsonReq(URL_D, {}));
    const d2 = await download.POST(jsonReq(URL_D, { reportId: "yok" }));
    ok("W3 indirme: reportId eksik → 400, bilinmeyen → 404", d1.status === 400 && d2.status === 404);
    ok("W4 hiçbir satır yazılmadı", db.tables.human_design_reports.length === 0);
  }

  section("S/T. Tekrar indirme + çift tıklama / idempotency");
  {
    const db = makeDb();
    const requestId = randomUUID();
    const [a, b] = await Promise.all([
      createAs(db, { tenantId: T1, system: true }, { chartId: "ch-roxy", requestId, bodygraphPng: dataUrl(pngForTests) }),
      createAs(db, { tenantId: T1, system: true }, { chartId: "ch-roxy", requestId, bodygraphPng: dataUrl(pngForTests) }),
    ]);
    ok("T1 eşzamanlı çift tıklama → aynı id, TEK satır", a.body.id === b.body.id && db.tables.human_design_reports.length === 1);
    const again = await createAs(db, { tenantId: T1, system: true }, { chartId: "ch-roxy", requestId, bodygraphPng: dataUrl(pngForTests) });
    ok("T2 ağ tekrarı → reused, yeni satır yok", again.body.reused === true && db.tables.human_design_reports.length === 1);
    const other = await createAs(db, { tenantId: T1, system: true }, { chartId: "ch-man", requestId });
    ok("T3 aynı requestId başka harita → 409", other.res.status === 409);
    const nv = await createAs(db, { tenantId: T1, system: true }, { chartId: "ch-roxy", requestId: randomUUID(), bodygraphPng: dataUrl(pngForTests) });
    ok("T4 bilinçli yeni sürüm (yeni requestId) → yeni satır", nv.body.id !== a.body.id && db.tables.human_design_reports.length === 2);
    const x1 = await (await downloadAs(db, { tenantId: T1, system: true }, a.body.id)).arrayBuffer();
    const x2 = await (await downloadAs(db, { tenantId: T1, system: true }, a.body.id)).arrayBuffer();
    ok("S1 aynı raporu tekrar indirme → document.xml AYNI", (await unzip(x1)).xml === (await unzip(x2)).xml);
  }

  section("G/Q/R. DOCX: marka, bütünlük, uzun Türkçe");
  {
    const id = results.both.id;
    const resp = await downloadAs(sysDb, { tenantId: T1, system: true }, id);
    const ab = await resp.arrayBuffer();
    const { zip, xml, text } = await unzip(ab);
    if (OUT) { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, "HD-v2-route-both.docx"), Buffer.from(ab)); }
    const logo = readFileSync(join(ROOT, "public/assets/yasam-sistemi-chart-logo.png"));
    const media = await Promise.all(Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !zip.files[f].dir).map((m) => zip.file(m)!.async("nodebuffer")));
    ok("G1 kapakta Yaşam Sistemi logosu (orijinal şeffaf PNG, bayt-bayt)", media.some((b) => b.equals(logo)));
    const logoExt = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => Number(m[1]) / Number(m[2]));
    ok("G2 logo oranı korunur (520:390)", logoExt.some((r) => Math.abs(r - 520 / 390) < 0.01));
    ok("G3 kapak metinleri", text.includes("YAŞAM SİSTEMİ") && text.includes("HUMAN DESIGN") && text.includes("PROFESYONEL ANALİZ RAPORU") && text.includes("Elif Şahin Öztürk") && text.includes("Rapor Tarihi") && text.includes("yasamsistemi.com"));
    const footers = await Promise.all(Object.keys(zip.files).filter((f) => /^word\/footer\d*\.xml$/.test(f)).map((f) => zip.file(f)!.async("string")));
    ok("G4 alt bilgide sayfa numarası + site adresi", footers.some((f) => f.includes("PAGE") && f.includes("yasamsistemi.com")));
    ok("Q1 A4 sayfa (11906×16838) her bölümde", (xml.match(/<w:pgSz w:w="11906" w:h="16838"/g) ?? []).length === 2);
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    const ids = new Set([...rels.matchAll(/Id="([^"]+)"/g)].map((m) => m[1]));
    const used = [...xml.matchAll(/r:(?:embed|id)="([^"]+)"/g)].map((m) => m[1]);
    ok("Q2 tüm r:embed/r:id ilişkileri tanımlı (onarım uyarısı riski yok)", used.length > 0 && used.every((u) => ids.has(u)));
    const ct = await zip.file("[Content_Types].xml")!.async("string");
    ok("Q3 Content_Types png kayıtlı", /Extension="png"/.test(ct));
    ok("Q4 ham markdown / kontrol karakteri yok", !/(^|\s)##\s|\*\*/.test(text) && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml));
    ok("Q5 kimlik kartı: ad + doğum grubu + HD özeti", text.includes("Elif Şahin Öztürk") && ["Doğum Bilgileri", "Doğum Tarihi", "Doğum Saati (yerel)", "Doğum Yeri", "Saat Dilimi", "Human Design Özeti", "Tip", "Profil", "İç Otorite", "Tanım", "Harita kaynağı", "Rapor tarihi"].every((k) => text.includes(k)));
    // 2026-10-10 owner: Enkarnasyon BodyGraph'tan SONRA; Türkçe ad "Haç"sız + özgün İngilizce ad.
    ok("Q5b \"ENKARNASYON TEMASI (YAŞAM AMACI)\": Türkçe ad + özgün İngilizce ad", text.includes("ENKARNASYON TEMASI (YAŞAM AMACI)") && text.includes("Sağ Açılı Yasalar Teması 2") && text.includes("Right Angle Cross of Laws 2") && text.includes("açıklayıcı çevirisidir; özgün terim esas alınır"));
    ok("Q5c yeni düzende hiçbir yerde \"Haç\" yok (büyük/küçük harf; sistem yorumu + kaynak bilgisi dahil)", !/haç/i.test(text) && !/HAÇ/.test(text));
    // 2026-10-10 premium teknik bölümler (teknik veri korunur)
    ok("Q5e Merkezler: özet sayaçlar + her merkezde aktif kapılar (kayıtlı kapı verisinden)", text.includes("Tanımlı merkez") && text.includes("Açık merkez") && (text.match(/Aktif kapılar/g) ?? []).length === 9);
    ok("Q5f Kanallar: kod rozeti + ad + merkez yolu + kapılar", text.includes("Kapı 3 · Kapı 60") || /Kapı \d+ · Kapı \d+/.test(text));
    ok("Q5g Kapılar: tekrar eden başlık bandı + kanal açıklaması", /<w:tblHeader\/>/.test(xml) && text.includes("Kanal sütunu, kapının tamamladığı tanımlı kanalı gösterir."));
    const paraOf = (needle: string) => [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => m[0]).find((p) => p.includes(needle)) ?? "";
    ok("Q5d BodyGraph kimlikle AYNI sayfada (sayfa sonu yok); Enkarnasyon yeni sayfa başı", paraOf("BodyGraph ve Aktivasyonlar") !== "" && paraOf("Merkezler<") !== "" && !paraOf("BodyGraph ve Aktivasyonlar").includes("pageBreakBefore") && paraOf("ENKARNASYON TEMASI").includes("pageBreakBefore") && !paraOf("Merkezler<").includes("pageBreakBefore"));
    ok("Q6 UTC doğum anı görünür raporda YOK", !text.includes("UTC") && !text.includes("16:00"));
    const order = ["Danışan ve Harita Kimliği", "BodyGraph ve Aktivasyonlar", "ENKARNASYON TEMASI (YAŞAM AMACI)", "Merkezler", "Kanallar", "Kapılar", "Uzman Açıklamaları", "Sistem Yorumu", "Kaynak Bilgisi"].reduce<number[]>((acc, h) => [...acc, text.indexOf(h, (acc.at(-1) ?? -1) + 1)], []);
    ok("Q7 bölüm sırası hedefle aynı", order.every((p, i) => p >= 0 && (i === 0 || p > order[i - 1])), JSON.stringify(order));
    ok("Q8 aktivasyon sütunları: DESIGN (Bilinçdışı) + PERSONALITY (Bilinçli), Türkçe gezegen + Kapı.Çizgi", text.includes("DESIGN") && text.includes("Bilinçdışı") && text.includes("PERSONALITY") && text.includes("Bilinçli") && (text.match(/13 aktivasyon/g) ?? []).length === 2 && /Güneş\s*56\.2/.test(text) && text.includes("Kuzey Ay Düğümü"));
    ok("Q9 tablolar: başlık satırı tekrar + satır bölünmez", xml.includes("<w:tblHeader/>") && xml.includes("<w:cantSplit/>"));
    ok("Q10 boş sayfa riski: ardışık sayfa sonu / boş bölüm yok", !/<w:br w:type="page"\/>\s*<\/w:r>\s*<\/w:p>\s*<w:p>\s*<w:pPr>\s*<w:pageBreakBefore/.test(xml));
    ok("R1 uzun Türkçe içerik eksiksiz (6 paragraf) + Türkçe karakterler", (text.match(/paragraf — Uzman açıklaması/g) ?? []).length === 6 && text.includes("İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç"));
    ok("R1b uzman metni AYNEN: numaralar korunur, madde imine çevrilmez", text.includes("1. paragraf — Uzman açıklaması") && text.includes("6. paragraf — Uzman açıklaması"));
    ok("R1c Sistem Yorumu gezegen adları Türkçe (Pluto → Plüton)", text.includes("Design · Plüton · 61.1") && !text.includes("· Pluto ·"));
    ok("R2 başlıklar içerikten kopmaz (keepNext)", (xml.match(/<w:keepNext\/>/g) ?? []).length > 40);
    ok("R3 teşhis/tedavi uyarısı + bilgilendirme notu; profil adı 'Hazırlayan' olarak OTOMATİK yazılmaz", text.includes("teşhis veya tedavi önerisi içermez") && text.includes("Bilgilendirme") && !text.includes("Hazırlayan: ") && !text.includes("Ayşe Uzman"));
    const last = text.slice(text.lastIndexOf("Kaynak Bilgisi"));
    ok("R4 son sayfada teknik eşleşme / sistem kaydı notları YOK", !last.includes("Uzman Bilgilerim") && !last.includes("eşleşen kayıt") && !last.includes("harita hesaplanırken kaydedilmiş sistem açıklamaları"));
  }

  section("W. Profesyonel düzen (pro-1): hazırlayan · eksiksizlik · eski düzen · eşleşme sayısı");
  {
    const db = makeDb();
    const sys = { tenantId: T1, system: true };
    const mk = async (body: Row) => {
      const r = await createAs(db, sys, { chartId: "ch-roxy", bodygraphPng: dataUrl(pngForTests), ...body });
      const d = r.res.status === 200 ? await downloadAs(db, sys, r.body.id) : null;
      return { r, text: d ? (await unzip(await d.arrayBuffer())).text : "", row: r.res.status === 200 ? reportRow(db, r.body.id) : null };
    };
    const full = await mk({ commentary: "none", preparedBy: "  Human Design Uzmanı Ahmet Yılmaz  " });
    // 2026-10-10 owner: son sayfada büyük "RAPORU HAZIRLAYAN" uzman imza bölümü (eski küçük satır yok).
    ok("W1 dolu hazırlayan: imza bölümünde 'RAPORU HAZIRLAYAN' + ad/unvan (kırpılmış); snapshot'a donar", full.text.includes("RAPORU HAZIRLAYAN") && full.text.includes("Human Design Uzmanı Ahmet Yılmaz") && !full.text.includes("Hazırlayan: ") && full.row?.snapshot.preparedBy === "Human Design Uzmanı Ahmet Yılmaz" && full.row?.snapshot.layout === "pro-1");
    ok("W1c imza bölümü: Rapor Tarihi + İmza satırı; ad, raporun son bölümünde", full.text.includes("RAPOR TARİHİ") && full.text.includes("İmza") && full.text.lastIndexOf("Human Design Uzmanı Ahmet Yılmaz") > full.text.indexOf("Kaynak Bilgisi"));
    ok("W1b profil adı (Ayşe Uzman) yazılmaz", !full.text.includes("Ayşe Uzman"));
    const empty = await mk({ commentary: "none", preparedBy: "   " });
    ok("W2 boş hazırlayan: ad YAZILMAZ; imza bölümünde yalnız boş 'Ad Soyad / Unvan' satırı", !empty.text.includes("Hazırlayan: ") && !empty.text.includes("Ayşe Uzman") && empty.text.includes("RAPORU HAZIRLAYAN") && empty.text.includes("Ad Soyad / Unvan") && empty.row?.snapshot.preparedBy === null);
    const none = await mk({ commentary: "none" });
    ok("W3 hazırlayan önceki rapordan TAŞINMAZ (alan gönderilmezse ad yok, boş satır)", !none.text.includes("Ahmet Yılmaz") && none.text.includes("Ad Soyad / Unvan") && none.row?.snapshot.preparedBy === null);
    const dirty = await mk({ commentary: "none", preparedBy: `Hasan\nHoca\u0007 ${"x".repeat(300)}` });
    ok("W4 kontrol karakteri / satır sonu temizlenir, 120 karakterle sınırlı", typeof dirty.row?.snapshot.preparedBy === "string" && Array.from(String(dirty.row?.snapshot.preparedBy)).length <= 120 && String(dirty.row?.snapshot.preparedBy).startsWith("Hasan Hoca ") && !/[\u0000-\u001f]/.test(String(dirty.row?.snapshot.preparedBy)));
    for (const bad of [123, ["Hasan"], { ad: "Hasan" }, true]) {
      const b = await createAs(db, sys, { chartId: "ch-roxy", bodygraphPng: dataUrl(pngForTests), preparedBy: bad });
      ok(`W5 geçersiz hazırlayan ${JSON.stringify(bad)} → 400`, b.res.status === 400 && b.body.code === "INVALID_PREPARED_BY");
    }
    // Eksiksizlik (kayıtlı computed ile birebir)
    const t = full.text;
    const acts = n.chart.activations;
    ok("W6 13 Design + 13 Personality: her aktivasyon kapı.çizgi değeriyle belgede", (t.match(/13 aktivasyon/g) ?? []).length === 2 && acts.every((a) => t.includes(`${a.gate}.${a.line}`)));
    const { HUMAN_DESIGN_CHANNELS: V2Labels } = await import("../../lib/human-design/constants");
    const centersTr = ["Baş Merkezi", "Ajna Merkezi", "Boğaz Merkezi", "G / Kimlik Merkezi", "Kalp / Ego Merkezi", "Dalak Merkezi", "Solar Pleksus Merkezi", "Sakral Merkez", "Kök Merkezi"];
    ok("W7 dokuz merkezin tamamı (Türkçe ad + özgün terim)", centersTr.every((c) => t.includes(c)) && ["Head", "Throat", "G Center", "Heart", "Spleen", "Solar Plexus", "Sacral", "Root"].every((e) => t.includes(e)));
    const definedN = (full.row?.snapshot.centers ?? []).filter((c) => c.defined).length;
    ok("W7b tanımlı/açık durumları hesaplama sonucundan", t.includes(`${definedN}  Tanımlı merkez`) && t.includes(`${9 - definedN}  Açık merkez`) && (t.match(/●  TANIMLI/g) ?? []).length === definedN && (t.match(/○  AÇIK/g) ?? []).length === 9 - definedN);
    ok("W8 tüm tanımlı kanallar: numara + kaynak veriden ad", n.codes.channels.length > 0 && n.codes.channels.every((c) => {
      const [a, b] = c.split("-");
      const label = (V2Labels.find((x) => x.code === c)?.label ?? "").replace(/^\S+\s/, "");
      return t.includes(`${a}–${b}`) && (!label || t.includes(label));
    }));
    ok("W9 tüm aktif kapılar + çoklu aktivasyonlar kaybolmaz", (full.row?.snapshot.gates ?? []).every((g) => t.includes(`${g.gate}  Kapı`) && g.activations.every((a) => t.includes(`${g.gate}.${a.line}`))));
    ok("W10 Türkçe karakterler korunur", t.includes("Kuzey Ay Düğümü") && t.includes("Dalak Merkezi") && t.includes("Güneş"));
    // Eski kayıtlı rapor: layout YOK → eski düzen AYNEN (eski Word değişmez).
    const legacy = structuredClone(full.row!.snapshot) as Row;
    delete legacy.layout;
    delete legacy.preparedBy;
    const { renderHdReportV2Buffer: renderV2 } = await import("../../lib/human-design/reporting/wordReportV2");
    const lt = (await unzip(await renderV2(legacy as never, { expertName: "Eski Profil Adı" }))).text;
    ok("W11 eski snapshot eski düzende: eski başlıklar + eski kimlik tablosu + eski 'Hazırlayan'", lt.includes("Design / Personality Aktivasyonları") && lt.includes("Ad Soyad") && lt.includes("Hazırlayan: Eski Profil Adı") && !lt.includes("BodyGraph ve Aktivasyonlar"));
    // Eski kayıtlı v2 raporu ROUTE üzerinden indirilince: eski düzen AYNEN, profil adı "Hazırlayan" YOK,
    // kayıtlı snapshot DEĞİŞMEZ (yalnız indirme davranışı).
    const legacyRow = reportRow(db, none.r.body.id) as Row & { snapshot: Row };
    delete legacyRow.snapshot.layout;
    delete legacyRow.snapshot.preparedBy;
    const legacyBefore = JSON.stringify(legacyRow.snapshot);
    const ld = await downloadAs(db, sys, none.r.body.id);
    const ldt = (await unzip(await ld.arrayBuffer())).text;
    ok("W11b eski v2 rapor indirmesi: eski düzen AYNEN + profil adı 'Hazırlayan' olarak YAZILMAZ", ld.status === 200 && ldt.includes("Design / Personality Aktivasyonları") && ldt.includes("Ad Soyad") && !ldt.includes("Hazırlayan") && !ldt.includes("Ayşe Uzman"));
    ok("W11c indirme kayıtlı eski snapshot'ı DEĞİŞTİRMEZ", JSON.stringify(reportRow(db, none.r.body.id).snapshot) === legacyBefore);
    // Word öncesi eşleşme sayısı (yalnız sayı; tenant izole)
    const km = req("../../app/api/hd/reports/professional/knowledge-match/route.ts") as { GET: (r: unknown) => Promise<Response> };
    const { NextRequest } = req("next/server");
    const ask = async (g: Parameters<typeof guardFor>[1], chartId: string) => {
      currentGuard = guardFor(db, g);
      const res = await km.GET(new NextRequest(`http://localhost/x?chartId=${chartId}`));
      return { status: res.status, body: (await res.json()) as Row };
    };
    const roxyUuid = db.tables.human_design_charts.find((c) => c.id === "ch-roxy");
    if (roxyUuid) roxyUuid.id = "00000000-0000-4000-8000-0000000000aa";
    const own = await ask(sys, "00000000-0000-4000-8000-0000000000aa");
    ok("W12 eşleşme sayısı = Word'e girecek aktif açıklama sayısı (yalnız sayı döner)", own.status === 200 && own.body.count === 2 && Object.keys(own.body).sort().join() === "count,ok", JSON.stringify(own.body));
    ok("W12b başka tenant aynı analiz için 404 (sayı sızmaz)", (await ask({ tenantId: T2 }, "00000000-0000-4000-8000-0000000000aa")).status === 404);
    ok("W12c geçersiz kimlik 400", (await ask(sys, "ch-roxy")).status === 400);
    const empty3 = await ask({ tenantId: T3 }, "00000000-0000-4000-8000-0000000000aa");
    ok("W12d Bilgi Bankası boş tenant (analiz başkasının) → 404", empty3.status === 404);
    if (roxyUuid) roxyUuid.id = "ch-roxy";
  }

  section("X. Özet / sızıntı");
  {
    const db = makeDb();
    const r = await createAs(db, { tenantId: T1, system: true }, { chartId: "ch-roxy", bodygraphPng: dataUrl(pngForTests) });
    ok("X1 oluşturma yanıtında provider_raw / yorum metni / anahtar YOK", !JSON.stringify(r.body).includes(ROXY_DESC_MARK) && !JSON.stringify(r.body).includes("provider_raw") && !JSON.stringify(r.body).includes("Tip Yorumum"));
    currentGuard = guardFor(db, { tenantId: T1, system: true });
    const { NextRequest } = req("next/server");
    const s = await summary.GET(new NextRequest(`http://localhost/x?id=${r.body.id}`));
    const sj = JSON.stringify(await s.json());
    ok("X2 v2 özet: teknik özet var, yorum metni YOK", s.status === 200 && sj.includes("Elif Şahin Öztürk") && !sj.includes(ROXY_DESC_MARK) && !sj.includes("Tip Yorumum"));
    const row = reportRow(db, r.body.id);
    ok("X3 rapor satırı schema hd-report-2 / version 2 / report_kind canonical", row.schema_version === "hd-report-2" && row.report_version === 2 && row.report_kind === "canonical");
    ok("X4 snapshot'ta ham provider_raw anahtarları yok (yalnız whitelist DTO)", !JSON.stringify(row.snapshot).includes("profileKeynotes") && !JSON.stringify(row.snapshot).includes("designInstantUtc"));
  }

  section("P. Roxy çağrısı = 0");
  ok("P1 tüm akış boyunca ağ/fetch çağrısı 0", fetchCalls.length === 0, fetchCalls.join(", "));
  {
    const files = [
      "lib/human-design/reporting/reportSnapshotV2.ts", "lib/human-design/reporting/reportSnapshotV2Service.ts",
      "lib/human-design/reporting/wordReportV2.ts", "lib/human-design/reporting/bodygraphPng.ts",
      "lib/human-design/reporting/bodygraphCapture.ts", "app/api/hd/reports/professional/route.ts",
      "app/api/hd/reports/professional/download/route.ts",
    ].map(code).join("\n");
    ok("P2 rapor yolu Roxy istemcisini/çağrısını içe aktarmaz", !/providers\/roxy\/client|callRoxyBodygraph|roxyChartService|searchRoxyLocations|fetch\(/.test(files));
  }

  section("Y. Statik değişmezler");
  {
    const route = code("app/api/hd/reports/professional/route.ts");
    ok("Y1 yetki sunucuda: hasModulePermissionForProfile(guard.profile, \"hd_system_reading\")", /hasModulePermissionForProfile\(guard\.profile, "hd_system_reading"\)/.test(route));
    ok("Y2 tenant yalnız guard'dan (body tenant okunmaz)", !/raw\.tenant|body\.tenant/.test(route));
    const dl = code("app/api/hd/reports/professional/download/route.ts");
    ok("Y3 indirme anında yetki yeniden doğrulanır", /applyDownloadPermissions\(snapshot, hasModulePermissionForProfile\(guard\.profile, "hd_system_reading"\)\)/.test(dl));
    const btn = code("app/human-design/kayitli-haritalar/components/HdProfessionalReportButton.tsx");
    ok("Y4 buton Android'de render edilmez", /if \(isAndroid\) return null;/.test(btn));
    ok("Y5 içerik penceresi herkese; 'Sistem Yorumunu Ekle' yalnız yetkiliye (canUseHdSystemReading); seçimler varsayılan kapalı", /canUseHdSystemReading/.test(btn) && /\{canSystem \?/.test(btn) && /setAddKnowledge\(false\)/.test(btn) && /setAddSystem\(false\)/.test(btn));
    const svc = code("lib/human-design/reporting/reportSnapshotV2Service.ts");
    ok("Y6 v2 servis admin canonical okuyucusunu kullanmaz", !/canonicalReadService|getPublishedRecordsByKeys/.test(svc));
    ok("Y7 uzman kodları Bilgi Bankası paneliyle aynı üretici (buildExpertKnowledgeCodes)", /buildExpertKnowledgeCodes\(codes\)/.test(svc) && /buildExpertKnowledgeCodes/.test(read("app/human-design/kayitli-haritalar/components/HdExpertKnowledgePanel.tsx")));
    const sr = read("lib/human-design/providers/roxy/systemReading.ts");
    ok("Y8 Sistem Yorumu extractor değişmedi (whitelist sabitleri aynı)", /text: 4000/.test(sr) && /export function extractSystemReading/.test(sr));
    ok("Y9 istemci paketine node:crypto girmez (paylaşılan sabitler ayrı modülde)", !/node:/.test(read("lib/human-design/reporting/reportV2Shared.ts")) && !/reportSnapshotV2"/.test(read("app/human-design/kayitli-raporlar/helpers/hdProfessionalReport.ts")));
    ok("Y10 logo dosyası paketleme listesinde (outputFileTracingIncludes)", /"\/api\/hd\/reports\/professional\/download": \["\.\/public\/assets\/yasam-sistemi-chart-logo\.png"\]/.test(read("next.config.ts")));
  }

  // Görsel QA için saf renderer çıktıları (fixture; gerçek yakalanmış BodyGraph varsa onunla).
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    const logo = readFileSync(join(ROOT, "public/assets/yasam-sistemi-chart-logo.png"));
    writeFileSync(join(OUT, "HD-v2-both.docx"), await renderHdReportV2Buffer(pure, { bodygraphImage: pngForTests, logo, expertName: "Ayşe Uzman" }));
    writeFileSync(join(OUT, "HD-v2-redacted.docx"), await renderHdReportV2Buffer(V2.applyDownloadPermissions(pure, false).snapshot, { bodygraphImage: pngForTests, logo, expertName: "Ayşe Uzman", systemReadingRedacted: true }));
    writeFileSync(join(OUT, "HD-v2-nobodygraph.docx"), await renderHdReportV2Buffer({ ...pure, bodygraph: { status: "missing" } }, { logo, expertName: "Ayşe Uzman" }));
    console.log(`\nDOCX çıktıları: ${OUT}`);
  }

  console.log(`\nHD WORD v2: ${pass} PASS / ${fail} FAIL`);
  if (fail) console.log(`FAIL: ${fails.join(" | ")}`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
