/**
 * HD AŞAMA 2 (2026-10-15) — Hesaplama doğruluğu, Word raporları ve Türkçe içerik harness'i.
 *
 * Kapsam: HD-03, HD-04, HD-05, HD-06, HD-07, HD-08, HD-09, HD-13, HD-14, HD-16, HD-23, HD-24, HD-29
 * + 20 canlı Roxy altın profili (14 Ekim denetimi, kayıtlı) ile kayıt → snapshot → Word tutarlılığı.
 * Gerçek DB / Storage / RoxyAPI / ağ YOK: bellek-içi sahte Supabase + guard stub'ı; tüm veri SENTETİK.
 * Üretilen Word dosyaları HD_STAGE2_OUT (varsa) klasörüne yazılır (Word ile açılabilirlik kontrolü için).
 *
 * Çalıştırma: npx tsx scripts/hd-stage2/harness.ts
 */
import Module, { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
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

// Ağ YASAK — Roxy çağrısı 0 kanıtı (sahte callRoxy enjeksiyonu dışında).
const netCalls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  netCalls.push(String(input));
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
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─── Sahte Supabase (AŞAMA 1 harness'iyle aynı davranış) ─────────────────────
type Row = Record<string, unknown>;
class FakeDb {
  tables: Record<string, Row[]> = {};
  updates: { table: string; payload: Row }[] = [];
  inserts: { table: string; payload: Row }[] = [];
  from(t: string) { return new FakeQuery(this, t); }
  rpc() { return Promise.resolve({ data: null, error: { message: "rpc yok (harness)" } }); }
}
class FakeQuery {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private preds: ((r: Row) => boolean)[] = [];
  private payload: Row | Row[] | null = null;
  private cols = "*";
  private mode: "many" | "maybe" | "single" = "many";
  private wantRows = false;
  constructor(private db: FakeDb, private table: string) {}
  select(cols?: string) { this.cols = cols ?? "*"; if (this.op !== "select") this.wantRows = true; return this; }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; for (const x of Array.isArray(p) ? p : [p]) this.db.inserts.push({ table: this.table, payload: { ...x } }); return this; }
  update(p: Row) { this.op = "update"; this.payload = p; this.db.updates.push({ table: this.table, payload: { ...p } }); return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.preds.push((r) => r[c] === v); return this; }
  in(c: string, vs: unknown[]) { this.preds.push((r) => vs.includes(r[c])); return this; }
  neq() { return this; }
  not() { return this; }
  like() { return this; }
  ilike() { return this; }
  is() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  private rng: [number, number] | null = null;
  range(from: number, to: number) { this.rng = [from, to]; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }
  private exec(): { data: unknown; error: unknown } {
    const rows = (this.db.tables[this.table] ??= []);
    let affected: Row[];
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      affected = list.map((p) => ({ id: randomUUID(), ...structuredClone(p) }));
      rows.push(...affected);
    } else {
      affected = rows.filter((r) => this.preds.every((f) => f(r)));
      if (this.op === "update") for (const r of affected) Object.assign(r, this.payload);
      if (this.op === "delete") this.db.tables[this.table] = rows.filter((r) => !affected.includes(r));
    }
    const proj = (r: Row) => {
      if (this.cols.trim() === "*") return structuredClone(r);
      const o: Row = {};
      for (const c of this.cols.split(",").map((x) => x.trim()).filter(Boolean)) o[c.split("->").pop()!.replace(/^>>?/, "")] = r[c];
      return o;
    };
    const data = affected.map(proj);
    if (this.op !== "select" && !this.wantRows) return { data: null, error: null };
    if (this.mode === "maybe") return { data: data[0] ?? null, error: null };
    if (this.mode === "single") return data[0] ? { data: data[0], error: null } : { data: null, error: { message: "no rows" } };
    return { data: this.rng ? data.slice(this.rng[0], this.rng[1] + 1) : data, error: null };
  }
  then<T>(res: (v: { data: unknown; error: unknown }) => T, rej?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.exec()).then(res, rej);
  }
}

let currentGuard: Row | null = null;
(globalThis as Row).__HDAY_GUARD__ = () => {
  if (!currentGuard) {
    const { NextResponse } = req("next/server");
    return { ok: false, response: NextResponse.json({ ok: false, error: "Yetki gerekli." }, { status: 401 }) };
  }
  return currentGuard;
};
const T1 = "11111111-1111-4111-8111-111111111111";
const C1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function guardFor(db: FakeDb, tenantId = T1): Row {
  return {
    ok: true, db, tenantId, userId: `u-${tenantId.slice(0, 4)}`, is_demo_account: false,
    profile: { role: "expert", membership_status: "active", module_permissions: { human_design: true, hd_system_reading: true } },
  };
}
function mkReq(method: string, url: string, body?: unknown) {
  const { NextRequest } = req("next/server");
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function call(handler: (r: unknown) => Promise<Response>, method: string, url: string, body?: unknown) {
  const res = await handler(mkReq(method, url, body));
  let json: Row = {};
  try { json = (await res.clone().json()) as Row; } catch { /* yok */ }
  return { status: res.status, json };
}

// ─── Geçerli PNG (BodyGraph yerine; oran ~0,706) ─────────────────────────────
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc(b: Buffer): number { let c = 0xffffffff; for (const x of b) c = CRC_T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function makePng(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0xee);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const BODYGRAPH_PNG = makePng(706, 1000);

async function docxParts(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  const core = (await zip.file("docProps/core.xml")?.async("string")) ?? "";
  const text = xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "");
  return { zip, xml, core, text: decodeXml(text) };
}
function decodeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
/** XML 1.0'da yasak karakter (kontrol karakteri, U+FFFE/FFFF, eşleşmemiş vekil) var mı? */
function xmlForbidden(s: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/.test(s) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
}

const OUT_DIR = process.env.HD_STAGE2_OUT ?? null;
const written: string[] = [];
function saveDocx(name: string, buf: Buffer): void {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  const p = join(OUT_DIR, `${name}.docx`);
  writeFileSync(p, buf);
  written.push(p);
}

// ─── 14 Ekim denetiminin 20 canlı Roxy profili (kayıtlı computed_result özeti) ─────────
// Kaynak: HD-DENETIM-2026-10-14/kanit/roxy-canli-sonuclar.txt (prod, GET /api/hd/charts → computed_result).
// Bu sürüm repo içinde değişmez bir kopya olarak tutulur (golden.txt).
type Golden = {
  id: string; date: string; time: string; place: string; tz: string;
  type: string; authority: string; profile: string; definition: string;
  strategy: string; signature: string; notSelf: string; crossName: string; crossAngle: string; crossGates: number[];
  centers: string[]; channels: string[]; acts: { side: "personality" | "design"; body: string; gate: number; line: number }[];
};
const BODY_ORDER = ["Sun", "Earth", "Moon", "NorthNode", "SouthNode", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
function loadGolden(): Golden[] {
  const lines = src("scripts/hd-stage2/golden-roxy-20.txt").split(/\r?\n/).filter((l) => l.startsWith("P"));
  return lines.map((l) => {
    const [id, inp, , , type, authority, profile, definition, strategy, signature, notSelf, crossName, crossAngle, xg, cent, ch, acts] = l.split("~");
    const [date, time, place, tz] = inp.split("|");
    const tokens = acts.split(/\s+/).filter(Boolean);
    return {
      id, date, time, place, tz: tz ?? "Europe/Istanbul",
      type, authority, profile, definition, strategy, signature, notSelf, crossName, crossAngle,
      crossGates: xg.split("/").map(Number),
      centers: cent ? cent.split(",") : [],
      channels: ch ? ch.split(",") : [],
      acts: tokens.map((t, i) => {
        const [g, ln] = t.split(".").map(Number);
        return { side: i < 13 ? "personality" : "design", body: BODY_ORDER[i % 13], gate: g, line: ln } as const;
      }),
    };
  });
}
/** Roxy İngilizce tip → beklenen İngilizce strateji/imza/kendilik-dışı (HD standardı; Roxy çıktısıyla çapraz kontrol). */
const TYPE_KEYNOTES_EN: Record<string, [string, string, string]> = {
  Generator: ["Wait to respond", "Satisfaction", "Frustration"],
  "Manifesting Generator": ["Wait to respond then inform", "Satisfaction", "Frustration"],
  Manifestor: ["Inform", "Peace", "Anger"],
  Projector: ["Wait for the invitation", "Success", "Bitterness"],
  Reflector: ["Wait a lunar cycle", "Surprise", "Disappointment"],
};

async function main() {
  console.log("HD AŞAMA 2 — hesaplama doğruluğu / Word / Türkçe içerik harness'i (sahte DB; gerçek DB/Storage/Roxy/ağ YOK)");
  const SV2 = await import("../../lib/human-design/reporting/reportSnapshotV2");
  const WV2 = await import("../../lib/human-design/reporting/wordReportV2");
  const SR = await import("../../lib/human-design/providers/roxy/systemReading");
  const DL = await import("../../lib/human-design/normalize/hdDisplayLabels");
  const AC = await import("../../lib/human-design/normalize/hdAppCodes");
  const CH = await import("../../lib/human-design/codeHelpers");
  const K = await import("../../lib/human-design/constants");
  const X = await import("../../lib/human-design/reporting/xmlSafeText");
  const KP = await import("../../lib/human-design/api/knowledgePersistence");
  const JL = await import("../../lib/human-design/api/journeyLink");
  const BT = await import("../../lib/human-design/api/birthTimeResolution");
  const RCS = await import("../../lib/human-design/api/roxyChartService");
  const ACS = await import("../../lib/human-design/chart/autoCalcState");
  const CPS = await import("../../lib/human-design/api/chartPersistence");
  const { consistentRoxyResponse } = await import("../hd-roxy/consistentFixture");
  const FIXTURE_JSON = src("scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json");
  const FIXTURE = JSON.parse(FIXTURE_JSON) as Row;

  type Codes = Parameters<typeof SV2.buildReportSnapshotV2>[0]["codes"];
  const baseInput = (codes: Codes, over: Partial<Parameters<typeof SV2.buildReportSnapshotV2>[0]> = {}) => ({
    generatedAt: "2026-10-15T09:00:00.000Z",
    chartId: randomUUID(),
    source: "computed" as const,
    provider: "roxyapi",
    client: { name: "ZZ Sentetik Danışan", birthDate: "1990-07-15", birthTime: "14:30:00", birthPlace: "İstanbul, Türkiye", timezone: "Europe/Istanbul" },
    codes,
    computed: null,
    requested: "none" as const,
    systemReadingPermitted: false,
    systemReading: null,
    expertRecords: [],
    bodygraph: { status: "roxy_render" as const },
    chartImage: null,
    ...over,
  });
  const mkCodes = (o: Partial<Codes>): Codes => ({
    type_code: "generator", authority_code: "sacral", profile_code: "1_3", definition_code: "single",
    active_centers: [], open_centers: [], gates: [], channels: [], ...o,
  } as Codes);

  // ══ HD-03 ══════════════════════════════════════════════════════════════════
  section("HD-03 Çoklu kanal: kapının TÜM tanımlı kanalları; potansiyel kanal eklenmez");
  {
    const integration = ["10-20", "10-34", "10-57", "20-34", "20-57", "34-57"];
    const codes = mkCodes({ gates: [10, 20, 34, 57, 25, 15], channels: integration as never, active_centers: ["g_identity", "throat", "sacral", "spleen"] });
    const s = SV2.buildReportSnapshotV2(baseInput(codes));
    const g = (n: number) => s.gates.find((x) => x.gate === n)!;
    ok("3a Kapı 10 → 10-20, 10-34, 10-57", JSON.stringify(g(10).channels) === JSON.stringify(["10-20", "10-34", "10-57"]));
    ok("3b Kapı 20 → 10-20, 20-34, 20-57", JSON.stringify(g(20).channels) === JSON.stringify(["10-20", "20-34", "20-57"]));
    ok("3c Kapı 34 → 10-34, 20-34, 34-57", JSON.stringify(g(34).channels) === JSON.stringify(["10-34", "20-34", "34-57"]));
    ok("3d Kapı 57 → 10-57, 20-57, 34-57", JSON.stringify(g(57).channels) === JSON.stringify(["10-57", "20-57", "34-57"]));
    ok("3e Asılı kapı 25 (25-51 tanımlı DEĞİL) → kanal YOK (potansiyel kanal eklenmez)", g(25).channels!.length === 0 && g(25).channel === null);
    ok("3f Asılı kapı 15 (5-15 tanımlı DEĞİL) → kanal YOK", g(15).channels!.length === 0);
    ok("3g Geri uyum alanı `channel` = ilk kanal (eski okuyucular)", g(10).channel === "10-20" && g(57).channel === "10-57");
    ok("3h Snapshot şema doğrulaması hâlâ geçer", SV2.isHdReportSnapshotV2(s));
    // Word (pro-1): kapı satırında üç kanal da var
    const buf = await WV2.renderHdReportV2Buffer(s, { bodygraphImage: BODYGRAPH_PNG });
    saveDocx("HD03-entegrasyon-coklu-kanal", buf);
    const { text } = await docxParts(buf);
    const gateBlock = text.slice(text.indexOf("Kanal sütunu"));
    const row10 = gateBlock.slice(gateBlock.indexOf("10  Kapı") >= 0 ? gateBlock.indexOf("10  Kapı") : gateBlock.indexOf("10  Kapı"));
    ok("3i Word kapı tablosu: Kapı 10 satırında 10–20, 10–34, 10–57 (sırayla)", /10–20\s*\n?10–34\s*\n?10–57/.test(row10.slice(0, 600)), row10.slice(0, 300));
    ok("3j Word açıklaması 'tamamını gösterir'", text.includes("Kanal sütunu, kapının ait olduğu tanımlı kanalların tamamını gösterir."));
    ok("3k Word: tanımlı olmayan 25-51 / 5-15 kanalı HİÇBİR yerde yok", !text.includes("25–51") && !text.includes("5–15") && !text.includes("25-51"));
    // ESKİ snapshot (yalnız `channel`): render donmuş kanal listesinden TÜMÜNÜ türetir
    const legacy = structuredClone(s) as typeof s;
    for (const x of legacy.gates) delete (x as { channels?: string[] }).channels;
    ok("3l Eski snapshot: gateChannelCodes donmuş kanallardan tamamını türetir", JSON.stringify(WV2.gateChannelCodes(legacy, legacy.gates.find((x) => x.gate === 34)!)) === JSON.stringify(["10-34", "20-34", "34-57"]) && WV2.gateChannelCodes(legacy, legacy.gates.find((x) => x.gate === 25)!).length === 0);
    const { text: lt } = await docxParts(await WV2.renderHdReportV2Buffer(legacy, { bodygraphImage: BODYGRAPH_PNG }));
    ok("3m Eski snapshot Word'ü de üç kanalı gösterir", /10–20\s*\n?10–34\s*\n?10–57/.test(lt));
    // Eski (layout'suz) düzen de tüm kanalları gösterir
    const old = { ...structuredClone(legacy), layout: undefined } as typeof s;
    const { text: ot } = await docxParts(await WV2.renderHdReportV2Buffer(old, {}));
    ok("3n Eski düzen (layout yok) kapı tablosu: Kapı 57 → 10-57, 20-57, 34-57", /57\. Kapı[\s\S]{0,200}10-57[\s\S]{0,40}20-57[\s\S]{0,40}34-57/.test(ot));
  }

  // ══ HD-04 ══════════════════════════════════════════════════════════════════
  section("HD-04 Strateji / İmza / Kendilik Dışı Tema (tipten, uygulama sözlüğü; uydurma yok)");
  {
    const expect: Record<string, [string, string, string]> = {
      generator: ["Yanıt vermek için beklemek", "Tatmin", "Hayal kırıklığı (Frustration)"],
      manifesting_generator: ["Yanıt vermek için beklemek, sonra bilgilendirmek", "Tatmin", "Hayal kırıklığı (Frustration)"],
      manifestor: ["Harekete geçmeden önce bilgilendirmek", "Huzur", "Öfke"],
      projector: ["Davet beklemek", "Başarı", "Kırgınlık (Bitterness)"],
      reflector: ["Bir ay döngüsünü (~28 gün) beklemek", "Hayret", "Düş kırıklığı (Disappointment)"],
    };
    for (const [type, [st, sg, ns]] of Object.entries(expect)) {
      const s = SV2.buildReportSnapshotV2(baseInput(mkCodes({ type_code: type as never })));
      ok(`4 ${type}: snapshot strateji/imza/kendilik-dışı`, s.identity.strategy === st && s.identity.signature === sg && s.identity.notSelf === ns);
    }
    const unknown = SV2.buildReportSnapshotV2(baseInput(mkCodes({ type_code: null })));
    ok("4f Tip bilinmiyor → üç alan null (uydurma yok)", unknown.identity.strategy === null && unknown.identity.signature === null && unknown.identity.notSelf === null);
    const s = SV2.buildReportSnapshotV2(baseInput(mkCodes({ type_code: "projector", authority_code: "splenic" })));
    const buf = await WV2.renderHdReportV2Buffer(s, { bodygraphImage: BODYGRAPH_PNG });
    saveDocx("HD04-ozet-strateji-imza", buf);
    const { text } = await docxParts(buf);
    const card = text.slice(text.indexOf("Human Design Özeti"), text.indexOf("BodyGraph ve Aktivasyonlar"));
    ok("4g Word Human Design Özeti: Tip, Strateji, Profil, İç Otorite, Tanım, İmza, Kendilik Dışı Tema", ["Tip", "Strateji", "Profil", "İç Otorite", "Tanım", "İmza", "Kendilik Dışı Tema"].every((l) => card.includes(l)) && card.includes("Davet beklemek") && card.includes("Başarı") && card.includes("Kırgınlık (Bitterness)"), card);
    ok("4h Word özet sırası: Tip → Strateji → … → Kendilik Dışı Tema", card.indexOf("Tip") < card.indexOf("Strateji") && card.indexOf("Strateji") < card.indexOf("Profil") && card.indexOf("İmza") < card.indexOf("Kendilik Dışı Tema"));
    // Eski pro-1 snapshot (alanlar yok) → tipten türetilir
    const legacy = structuredClone(s);
    delete legacy.identity.strategy; delete legacy.identity.signature; delete legacy.identity.notSelf;
    const { text: lt } = await docxParts(await WV2.renderHdReportV2Buffer(legacy, { bodygraphImage: BODYGRAPH_PNG }));
    ok("4i Eski snapshot: Strateji/İmza/Kendilik Dışı Tema tip etiketinden türetilir", lt.includes("Davet beklemek") && lt.includes("Kendilik Dışı Tema"));
    // Manuel/tipsiz kayıt: satır yazılmaz
    const manual = SV2.buildReportSnapshotV2(baseInput(mkCodes({ type_code: null }), { source: "manual", provider: null }));
    const { text: mt } = await docxParts(await WV2.renderHdReportV2Buffer(manual, {}));
    ok("4j Tip yoksa Strateji/İmza/Kendilik Dışı Tema satırı YOK", !mt.includes("Strateji") && !mt.includes("Kendilik Dışı Tema"));
  }

  // ══ HD-05 ══════════════════════════════════════════════════════════════════
  section("HD-05 Uygunsuz Roxy çevirileri (Şehit / Kâfir / Sapkın) — merkezî düzeltme");
  {
    const n = DL.normalizeProviderTrText;
    const cases: [string, string][] = [
      ["Şehit üzerinde Kâfir.", "Deneyimleyen üzerinde Çözüm Getiren."],
      ["Şehit: deneme yanılma yoluyla öğrenir", "Deneyimleyen: deneme yanılma yoluyla öğrenir"],
      ["Kâfir: başkalarının beklentiler yüklediği", "Çözüm Getiren: başkalarının beklentiler yüklediği"],
      ["Şehidin yolu, Kâfirin gücü", "Deneyimleyenin yolu, Çözüm Getirenin gücü"],
      ["şehitte ve kafire", "deneyimleyende ve çözüm getirene"],
      ["Sapkının rolü ve Sapkın", "Çözüm Getirenin rolü ve Çözüm Getiren"],
      ["Kâfirler ve Şehitler", "Çözüm Getirenler ve Deneyimleyenler"],
    ];
    for (const [a, b] of cases) ok(`5 "${a}" → "${b}"`, n(a) === b, n(a));
    const safe = "Şehir merkezi, Kafkas dağları, sapık değil; Kâfi gelir; Şehnaz";
    ok("5h İlgisiz kelimeler DEĞİŞMEZ (şehir, Kafkas, sapık, kâfi, Şehnaz)", n(safe) === safe, n(safe));
    ok("5i İdempotent", n(n(cases[0][0])) === cases[0][1]);
    // Gerçek P01 Word metni (canlı denetim kanıtı) ile çıkarıcı
    const tr = structuredClone(FIXTURE);
    Object.assign(tr, {
      profile: "3/5",
      profileDescription: "Şehit üzerinde Kâfir. Bilinçli deneyim, çarpışarak öğrenir.",
      profileKeynotes: { personality: "Şehit: deneme yanılma yoluyla öğrenir, neyin işe yaramadığını keşfeder.", design: "Kâfir: başkalarının beklentiler yüklediği evrenselleştirici, pratik bir güç." },
    });
    const dto = SR.extractSystemReading(tr)!;
    const all = JSON.stringify(dto);
    ok("5j Çıkarılan Sistem Yorumu: Şehit/Kâfir YOK, Deneyimleyen/Çözüm Getiren VAR", !/Şehit|Kâfir|Kafir|Sapkın/i.test(all) && all.includes("Deneyimleyen üzerinde Çözüm Getiren"));
    ok("5k Hesap/teknik değer değişmez: profil numarası '3/5'", dto.general.find((g) => g.key === "profile")!.value === "3/5");
    // ESKİ donmuş rapor (Şehit/Kâfir içeren DTO) render anında düzeltilir; DB snapshot'ı değişmez
    const oldDto = structuredClone(dto);
    oldDto.general = oldDto.general.map((g) => (g.key === "profile" ? { ...g, details: [{ label: "Açıklama", text: "Şehit üzerinde Kâfir." }, { label: "Personality (bilinçli)", text: "Şehit: deneme." }] } : g));
    const s = SV2.buildReportSnapshotV2(baseInput(mkCodes({ profile_code: "3_5" }), { requested: "system", systemReadingPermitted: true, systemReading: oldDto }));
    const frozen = JSON.stringify(s);
    const buf = await WV2.renderHdReportV2Buffer(s, { bodygraphImage: BODYGRAPH_PNG });
    saveDocx("HD05-sistem-yorumu-terim", buf);
    const { text } = await docxParts(buf);
    ok("5l Eski donmuş Sistem Yorumu Word'de Şehit/Kâfir içermez", !/Şehit|Kâfir/.test(text) && text.includes("Deneyimleyen üzerinde Çözüm Getiren"));
    ok("5m Render snapshot nesnesini DEĞİŞTİRMEZ (kayıt aynen)", JSON.stringify(s) === frozen && frozen.includes("Şehit üzerinde Kâfir"));
  }

  // ══ HD-06 ══════════════════════════════════════════════════════════════════
  section("HD-06 Kendilik dışı sorusu yalnız AÇIK merkezde — 9 merkez × 3 durum matrisi");
  {
    const ids = ["head", "ajna", "throat", "g", "heart", "sacral", "solar-plexus", "spleen", "root"];
    let matrixOk = true;
    const detail: string[] = [];
    for (const id of ids) {
      for (const defined of [true, false, null] as const) {
        const dto = SR.harmonizeSystemReading({ general: [], channels: [], activations: [], centers: [{ id, name: id, defined, theme: "Tema", notSelfQuestion: `Açık ${id} sorusu?`, biology: "Bez" }] });
        const c = dto.centers[0];
        const want = defined === false;
        if ((c.notSelfQuestion !== null) !== want || c.theme !== "Tema" || c.biology !== "Bez") { matrixOk = false; detail.push(`${id}/${defined}`); }
      }
    }
    ok("6a 27 vaka: soru yalnız defined=false'ta; tema ve biyoloji her durumda korunur", matrixOk, detail.join(","));
    const en = SR.extractSystemReading(FIXTURE)!;
    ok("6b Gerçek fixture: tanımlı 6 merkezde soru YOK, açık 3 merkezde VAR", en.centers.filter((c) => c.defined).every((c) => c.notSelfQuestion === null) && en.centers.filter((c) => c.defined === false).every((c) => !!c.notSelfQuestion) && en.centers.filter((c) => c.defined === false).length === 3);
    // Word: eski donmuş DTO (tanımlı merkezde soru var) → render'da gösterilmez
    const raw = { general: [], channels: [], activations: [], centers: [
      { id: "ajna", name: "Ajna", defined: true, theme: "Sabit yöntem.", notSelfQuestion: "Açık Ajna emin gibi davranır?", biology: "Hipofiz." },
      { id: "head", name: "Tepe", defined: false, theme: "Başkalarının soruları.", notSelfQuestion: "Bu soru bana mı ait?", biology: "Epifiz." },
    ] };
    const s = SV2.buildReportSnapshotV2(baseInput(mkCodes({}), { requested: "system", systemReadingPermitted: true, systemReading: raw as never }));
    const buf = await WV2.renderHdReportV2Buffer(s, { bodygraphImage: BODYGRAPH_PNG });
    saveDocx("HD06-merkez-sorulari", buf);
    const { text } = await docxParts(buf);
    ok("6c Word: tanımlı Ajna altında açık-merkez sorusu YOK", !text.includes("Açık Ajna emin gibi davranır"));
    ok("6d Word: açık merkezde soru 'Kendilik dışı sorusu' etiketiyle VAR", text.includes("Bu soru bana mı ait?") && text.includes("Kendilik dışı sorusu"));
    ok("6e Word: merkez adı uygulama sözlüğü (Tepe → Baş Merkezi (Head))", text.includes("Baş Merkezi (Head) — Açık") && !text.includes("Tepe —"));
    ok("6f Ekran paneli de merkezî etiketi kullanır", src("app/human-design/kayitli-haritalar/components/HdSystemReadingPanel.tsx").includes("HD_TERM.notSelfQuestion"));
  }

  // ══ HD-23 ══════════════════════════════════════════════════════════════════
  section("HD-23 Türkçe etiket tutarlılığı");
  {
    const gl = (n: number) => K.HUMAN_DESIGN_GATES.find((g) => g.code === n)!.label;
    ok("23a Kapı 64 = Kafa karışıklığı kapısı (Confusion); 63 ile çakışmıyor", gl(64) === "64 — Kafa karışıklığı kapısı" && gl(63) !== gl(64).replace("64", "63"));
    ok("23b Kapı 10 / 46 adında 'kapısı' eki", gl(10).endsWith("kapısı") && gl(46).endsWith("kapısı"));
    ok("23c Tüm 64 kapı etiketi 'kapısı' ile biter", K.HUMAN_DESIGN_GATES.length === 64 && K.HUMAN_DESIGN_GATES.every((g) => g.label.endsWith("kapısı")));
    ok("23d Ego otoritesi: Manifestor → Ego Manifested, Projector → Ego Projected (kod aynı: ego_heart)", CH.hdAuthorityDisplayLabel("ego_heart", "manifestor") === "Ego / Kalp Otoritesi (Ego Manifested)" && CH.hdAuthorityDisplayLabel("ego_heart", "projector") === "Ego / Kalp Otoritesi (Ego Projected)" && AC.toAppAuthorityCode("Ego Manifested") === "ego_heart");
    ok("23e Diğer otoriteler etkilenmez", CH.hdAuthorityDisplayLabel("sacral", "generator") === CH.hdAuthorityLabelFromCode("sacral"));
    const ego = SV2.buildReportSnapshotV2(baseInput(mkCodes({ type_code: "manifestor", authority_code: "ego_heart" })));
    ok("23f Snapshot otorite etiketi Ego ayrımını taşır", ego.identity.authority === "Ego / Kalp Otoritesi (Ego Manifested)");
    ok("23g Merkezî başlıklar: Kendilik Dışı Tema / Kendilik dışı sorusu", DL.HD_TERM.notSelf === "Kendilik Dışı Tema" && DL.HD_TERM.notSelfQuestion === "Kendilik dışı sorusu");
    const files = [
      "lib/human-design/providers/roxy/systemReading.ts", "lib/human-design/reporting/wordReportV2.ts",
      "app/human-design/kayitli-haritalar/components/HdSystemReadingPanel.tsx", "lib/human-design/reporting/reportCompose.ts",
      "lib/human-design/admin/hdFieldMeta.ts", "app/api/admin/veri-paylasimi/transfer/route.ts",
    ];
    const stale = files.filter((f) => /"Benlik-[dD]ışı|"Yanlış-Benlik|"Kendinden-Olmayan|"Benlik Dışı"/.test(src(f)));
    ok("23h Kullanıcıya görünen eski not-self adları (Benlik-dışı / Yanlış-Benlik / Kendinden-Olmayan) kalmadı", stale.length === 0, stale.join(","));
    const dto = SR.extractSystemReading({ ...structuredClone(FIXTURE), typeLocalized: "Jeneratör", authorityLocalized: "Sakral", definitionLocalized: "Bölünmüş" })!;
    const gv = (k: string) => dto.general.find((g) => g.key === k)!;
    ok("23i Sistem Yorumu değerleri uygulama ile aynı (Generator / Sacral Otorite / İkili Tanım (Split))", gv("type").value === CH.hdTypeLabelFromCode("generator") && gv("authority").value === CH.hdAuthorityLabelFromCode("sacral") && gv("definition").value === CH.hdDefinitionLabelFromCode("split"));
    ok("23j Sistem Yorumu başlıkları merkezî (Tip/Strateji/İç Otorite/…/Kendilik Dışı Tema)", gv("type").title === "Tip" && gv("authority").title === "İç Otorite" && gv("notSelf").title === "Kendilik Dışı Tema");
    // 2026-10-15 owner terminoloji kararları (görünen Türkçe + parantez içinde İngilizce; kodlar aynı)
    const chl = (c: string) => K.HUMAN_DESIGN_CHANNELS.find((x) => x.code === c)!.label;
    ok("23l Kanal adları: 2-14 Vuruş (The Beat), 5-15 Ritim (Rhythm), 10-34 Kendini Keşfetme (Exploration), 29-46 Keşif (Discovery)", chl("2-14") === "2-14 Vuruş Kanalı (The Beat)" && chl("5-15") === "5-15 Ritim Kanalı (Rhythm)" && chl("10-34") === "10-34 Kendini Keşfetme Kanalı (Exploration)" && chl("29-46") === "29-46 Keşif Kanalı (Discovery)");
    const names = K.HUMAN_DESIGN_CHANNELS.map((c) => c.label.replace(/^\S+\s+/, ""));
    ok("23m 36 kanalın görünen adı birbirinden farklı (aynı ada sahip iki kanal yok)", new Set(names).size === 36, names.filter((n, i) => names.indexOf(n) !== i).join(","));
    ok("23n Kanal kodları/sırası değişmedi (36 kanal, ilk 1-8, son 47-64)", K.HUMAN_DESIGN_CHANNELS.length === 36 && K.HUMAN_DESIGN_CHANNELS[0].code === "1-8" && K.HUMAN_DESIGN_CHANNELS[35].code === "47-64");
    ok("23o Tip etiketleri Türkçe + (İngilizce): Jeneratör (Generator) … Reflektör (Reflector)", K.HUMAN_DESIGN_TYPES.map((t) => t.label).join("|") === "Jeneratör (Generator)|Manifesting Jeneratör (Manifesting Generator)|Projektör (Projector)|Manifestör (Manifestor)|Reflektör (Reflector)");
    ok("23p Otorite etiketleri Türkçe + (İngilizce): Sakral Otorite (Sacral Authority), Dalak Otoritesi (Splenic Authority)…", CH.hdAuthorityLabelFromCode("sacral") === "Sakral Otorite (Sacral Authority)" && CH.hdAuthorityLabelFromCode("splenic") === "Dalak Otoritesi (Splenic Authority)" && K.HUMAN_DESIGN_AUTHORITIES.every((a) => /\(.+Authority\)$/.test(a.label)));
    ok("23q Merkez etiketleri Türkçe + (İngilizce)", K.HUMAN_DESIGN_CENTERS.every((c) => /^[^()]+ \([A-Za-z ]+\)$/.test(c.label)) && CH.hdCenterLabelFromCode("head") === "Baş Merkezi (Head)");
    ok("23r Kodlar / enum değerleri değişmedi (generator, sacral, ego_heart …)", K.HUMAN_DESIGN_TYPES.map((t) => t.code).join(",") === "generator,manifesting_generator,projector,manifestor,reflector" && K.HUMAN_DESIGN_AUTHORITIES.map((a) => a.code).join(",") === "sacral,emotional,splenic,ego_heart,self_projected,mental_environmental,lunar" && AC.toAppTypeCode("Generator") === "generator" && AC.toAppTypeCode("Manifesting Generator") === "manifesting_generator");
    ok("23s Manifesting Generator: temel Kendilik Dışı Tema 'Hayal kırıklığı' (Roxy teknik değeri Frustration ile aynı)", DL.HD_NOT_SELF_TR.manifesting_generator === "Hayal kırıklığı (Frustration)");
    ok("23k Teknik anahtarlar değişmedi (key: type/strategy/…/notSelf)", dto.general.map((g) => g.key).join(",") === "type,strategy,authority,profile,definition,cross,signature,notSelf");
  }

  // ══ HD-09 ══════════════════════════════════════════════════════════════════
  section("HD-09 Word XML 1.0 güvenliği (kontrol karakterleri)");
  {
    const bad = "Başlık\u000BShift+Enter\u0001\u0008\u000C\u001F￾\uD800 son";
    ok("9a Tek satır: U+000B/U+000C → boşluk; diğer yasaklar silinir", X.hdXmlSafeLine(bad) === "Başlık Shift+Enter  son" && !xmlForbidden(X.hdXmlSafeLine(bad)), JSON.stringify(X.hdXmlSafeLine(bad)));
    ok("9b Çok satır: U+000B → satır sonu", X.hdXmlSafeMultiline("a\u000Bb") === "a\nb");
    const keep = "Çağrı Şükrü İğdır ğüşıöç — مرحبا بالعالم — 😀👍 — \tsekme\nyeni satır\r\nCRLF";
    ok("9c Türkçe, Arapça, emoji (vekil çifti), TAB/LF/CR KORUNUR (güvenli metin değişmez)", X.hdXmlSafeLine(keep) === keep && X.hdXmlSafeMultiline(keep) === keep);
    ok("9d İdempotent", X.hdXmlSafeLine(X.hdXmlSafeLine(bad)) === X.hdXmlSafeLine(bad));
    // Bozuk metinli sentetik danışan + Bilgi Bankası kaydı → Word
    const evil = "ZZ Bozuk\u000BAd\u0002 Çağlar مرحبا 😀";
    const s = SV2.buildReportSnapshotV2(baseInput(mkCodes({ type_code: "generator", gates: [5], channels: [] }), {
      client: { name: evil, birthDate: "1990-07-15", birthTime: "14:30", birthPlace: "İstanbul\u0007, Türkiye", timezone: "Europe/Istanbul" },
      requested: "expert",
      expertRecords: [
        { category: "Tipler\u000B", title: "Generator\u000B(özel)\u0001", code: "tip_generator", content: "Satır 1\u000BSatır 2\u000C\n\nParagraf 2 ￿ son", is_active: true },
      ],
      preparedBy: "Uzman\u000BAd",
    }));
    ok("9e Donan snapshot'ta yasak karakter yok (ad/yer/KB başlık/kategori/içerik)", !xmlForbidden(JSON.stringify([s.client, s.commentary.expert.entries, s.preparedBy])) && s.client.name === "ZZ Bozuk Ad Çağlar مرحبا 😀" && s.commentary.expert.entries[0].content.startsWith("Satır 1\nSatır 2"));
    // Eski (temizlenmemiş) donmuş snapshot da render'da temizlenir
    const legacy = structuredClone(s);
    legacy.client.name = evil;
    legacy.commentary.expert.entries[0].title = "Generator\u000B(özel)";
    legacy.commentary.expert.entries[0].category = "Tipler\u000B";
    const buf = await WV2.renderHdReportV2Buffer(legacy, { bodygraphImage: BODYGRAPH_PNG });
    saveDocx("HD09-kontrol-karakterli-danisan", buf);
    const p = await docxParts(buf);
    const allXml = (await Promise.all(Object.values(p.zip.files).filter((f) => /\.xml$|\.rels$/.test(f.name)).map((f) => f.async("string")))).join("");
    ok("9f Üretilen DOCX'in TÜM XML parçalarında yasak karakter yok", !xmlForbidden(allXml));
    ok("9g Belge başlığı (dc:title) temiz ve Türkçe karakterli", p.core.includes("ZZ Bozuk Ad Çağlar") && !xmlForbidden(p.core));
    ok("9h Türkçe/Arapça/emoji Word metninde korunur", p.text.includes("Çağlar") && p.text.includes("مرحبا") && p.text.includes("😀"));
    ok("9i Bilgi Bankası başlığı Word'de tek satır olarak görünür", p.text.includes("Generator (özel)"));
    // Bilgi Bankası kaydı: yazılırken temizlenir (insert)
    const db = new FakeDb();
    const ins = await KP.insertKnowledge(db as never, T1, "u-1", { category: "Tipler", title: "Başlık\u000Bson", code: "tip_generator", content: "a\u000Bb\u0001c", expert_notes: "not\u000C", is_active: true });
    const row = db.tables.human_design_knowledge_records?.[0] ?? {};
    ok("9j Bilgi Bankası kaydı: başlık/içerik/özel not yasak karaktersiz yazılır", !ins.error && row.title === "Başlık son" && row.content === "a\nbc" && row.expert_notes === "not\n", JSON.stringify({ e: ins.error, row }));
    ok("9k Eski istemci Word hattı (exportHdReportDocx) metinleri temizler", /hdXmlSafeLine\(params\.clientName\)/.test(src("app/human-design/rapor-olustur/helpers/exportHdReportDocx.ts")));
  }

  // ══ HD-07 ══════════════════════════════════════════════════════════════════
  section("HD-07 Doğum yeri: görünen yer = kullanılan konum");
  {
    const clientsRoute = req("../../app/api/hd/clients/route.ts") as Record<string, (r: unknown) => Promise<Response>>;
    const mk = () => {
      const db = new FakeDb();
      db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ", birth_date: "1990-07-15", birth_time: "13:00", birth_place: "Berlin, Berlin, Germany", birth_location_id: "de-berlin", birth_location_label: "Berlin, Berlin, Germany", birth_timezone: "Europe/Berlin", birth_latitude: 52.52, birth_longitude: 13.405, updated_at: "v1" }];
      currentGuard = guardFor(db);
      return db;
    };
    let db = mk();
    const free = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_place: "London" });
    const r0 = db.tables.human_design_clients[0];
    ok("7a Seçilmeden yazılan yer → 400 BIRTH_PLACE_NOT_SELECTED, kayıt DEĞİŞMEZ (sahte 'güncellendi' yok)", free.status === 400 && free.json.code === "BIRTH_PLACE_NOT_SELECTED" && r0.birth_place === "Berlin, Berlin, Germany" && db.updates.length === 0, JSON.stringify(free.json));
    db = mk();
    const pick = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_place: "Herhangi metin", birth_location_ref: "us-il-chicago" });
    const r1 = db.tables.human_design_clients[0];
    ok("7b Listeden seçim: görünen yer = konum etiketi; tz/koordinat aynı kaynaktan", pick.status === 200 && r1.birth_place === r1.birth_location_label && r1.birth_location_id === "us-il-chicago" && r1.birth_timezone === "America/Chicago", JSON.stringify(r1));
    db = mk();
    const same = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, name: "ZZ", birth_place: "Berlin, Berlin, Germany", notes: "yeni not" });
    const r2 = db.tables.human_design_clients[0];
    ok("7c Doğum yeri DEĞİŞMEDEN başka alan güncellenir; mevcut doğru konum korunur", same.status === 200 && r2.notes === "yeni not" && r2.birth_location_id === "de-berlin" && r2.birth_timezone === "Europe/Berlin");
    db = mk();
    const cleared = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_place: "" });
    const r3 = db.tables.human_design_clients[0];
    ok("7d Yer silinirse konum kolonları da temizlenir (etiket ↔ konum çelişkisi oluşmaz)", cleared.status === 200 && r3.birth_place === null && r3.birth_location_id === null && r3.birth_timezone === null);
    // Eski serbest-metin danışan (konum kolonu yok) — değişmeyen yer kaydı engellemez
    const legacyDb = new FakeDb();
    legacyDb.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ", birth_date: "1985-06-15", birth_time: "12:00", birth_place: "Bursa", updated_at: "v" }];
    currentGuard = guardFor(legacyDb);
    const lg = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_place: "Bursa", notes: "n" });
    ok("7e Eski serbest metinli danışan: yer değişmeden kayıt yapılır", lg.status === 200 && legacyDb.tables.human_design_clients[0].notes === "n");
    // Konum AÇIKÇA temizlenirken serbest metin → 400 (konum temizlenip metin yazılamaz)
    db = mk();
    const clrText = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_place: "Serbest Metin Şehir", birth_location_ref: null });
    const r4 = db.tables.human_design_clients[0];
    ok("7k Konum temizlenirken serbest metin yer → 400 BIRTH_PLACE_NOT_SELECTED; konum ve yer DEĞİŞMEZ", clrText.status === 400 && clrText.json.code === "BIRTH_PLACE_NOT_SELECTED" && r4.birth_location_id === "de-berlin" && r4.birth_place === "Berlin, Berlin, Germany" && db.updates.length === 0, JSON.stringify(clrText.json));
    db = mk();
    const clrEmpty = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_place: "", birth_location_ref: "" });
    ok("7l Yer ve konum birlikte temizlenebilir (çelişki yok)", clrEmpty.status === 200 && db.tables.human_design_clients[0].birth_place === null && db.tables.human_design_clients[0].birth_location_id === null);
    // Eski koordinatlar kullanılmaz: yeni seçimden sonra hesap yeni konumun tz + koordinatıyla gider
    db = mk();
    await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_place: "x", birth_location_ref: "us-il-chicago" });
    const sent: Row[] = [];
    const cr = await RCS.computeRoxyChart({ db: db as never, tenantId: T1, userId: "u", isDemo: false }, { client_id: C1, location_id: "client" }, {
      config: { apiKey: "zz", baseUrl: "https://roxy.test" },
      callRoxy: async (_c: unknown, body: unknown) => { sent.push(body as Row); return { ok: true as const, raw: JSON.parse(consistentRoxyResponse(FIXTURE_JSON, JSON.stringify(body))) }; },
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), chartIdSecret: "s", log: () => undefined,
    } as never);
    const b0 = sent[0] ?? {};
    ok("7m Konum değişince hesap YENİ konumun saat dilimi ve koordinatıyla yapılır (eski Berlin kullanılmaz)", cr.status === 200 && sent.length === 1 && b0.timezone === "America/Chicago" && Math.abs(Number(b0.latitude) - 41.8781) < 1e-6 && Math.abs(Number(b0.longitude) + 87.6298) < 1e-6, JSON.stringify(b0));
    const chartRow = (db.tables.human_design_charts ?? [])[0] ?? {};
    ok("7n Kayıtlı analizin yeri/saat dilimi = seçilen yeni konum", chartRow.timezone === "America/Chicago" && String(chartRow.birth_place ?? "").startsWith("Chicago"), JSON.stringify({ tz: chartRow.timezone, p: chartRow.birth_place }));
    const picker = src("app/human-design/components/HdBirthLocationPicker.tsx");
    const detail = src("app/human-design/danisanlar/[id]/HdDanisanDetayContent.tsx");
    ok("7f Seçici ham metni üst forma bildirir (onTextChange)", /onTextChange\?\.\(e\.target\.value\)/.test(picker));
    ok("7g Detay formu: yazılan metin formu değiştirir + önceki seçimi düşürür", /onTextChange=\{\(text\) => \{\s*setPickedLocation\(null\);\s*setForm\(\(p\) => \(p \? \{ \.\.\.p, birth_place: text \} : p\)\);/.test(detail));
    ok("7h Detay formu: seçilmemiş yer için kayıt öncesi uyarı (istek gönderilmez)", detail.includes("Doğum yeri listeden seçilmedi") && detail.indexOf("Doğum yeri listeden seçilmedi") < detail.indexOf("await updateHdClient("));
    ok("7i Roxy konum araması yedeği KORUNDU (yerel sonuç yoksa otomatik ilçe araması)", /merged\.length === 0 && q\.length >= 4/.test(picker) && picker.includes("/api/hd/location/search"));
    const lsRoute = src("app/api/hd/location/search/route.ts");
    ok("7i2 Sunucu Roxy konum arama ucu duruyor (owner kararı: yerel sonuç yoksa Roxy kullanılmaya devam)", /export async function GET/.test(lsRoute) && /roxy/i.test(lsRoute));
    const calc = src("app/human-design/danisanlar/components/HdAutoCalcPanel.tsx");
    ok("7j Kaydedilmemiş yer değişikliğinde hesap kilitli (formDirty)", /if \(busyRef\.current \|\| !state\.location \|\| formDirty \|\| isDemo\) return;/.test(calc));
  }

  // ══ HD-08 / HD-16 ══════════════════════════════════════════════════════════
  section("HD-08 Tarih/saat doğrulaması · HD-16 doğum saati zorunlu");
  {
    const clientsRoute = req("../../app/api/hd/clients/route.ts") as Record<string, (r: unknown) => Promise<Response>>;
    const mk = () => {
      const db = new FakeDb();
      db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ", birth_date: "1990-07-15", birth_time: "14:30", birth_place: "İstanbul, İstanbul, Türkiye", birth_location_id: "tr-34-istanbul", birth_location_label: "İstanbul, İstanbul, Türkiye", birth_timezone: "Europe/Istanbul", updated_at: "v" }];
      currentGuard = guardFor(db);
      return db;
    };
    let db = mk();
    const future = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_date: "2090-10-31" });
    ok("8a Gelecek tarih → 400 (AŞAMA 1 kuralı korunuyor)", future.status === 400 && db.updates.length === 0);
    const feb = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_date: "2023-02-29" });
    ok("8b Takvimde olmayan tarih → 400", feb.status === 400 && db.updates.length === 0);
    db = mk();
    const clrDate = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_date: "" });
    ok("8c Kayıtlı tarih boşaltılamaz → 400 BIRTH_DATA_REQUIRED (yıl silinince sessiz null yok)", clrDate.status === 400 && clrDate.json.code === "BIRTH_DATA_REQUIRED" && db.tables.human_design_clients[0].birth_date === "1990-07-15");
    const clrTime = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_time: null });
    ok("8d HD-16 Kayıtlı doğum saati boşaltılamaz → 400", clrTime.status === 400 && db.tables.human_design_clients[0].birth_time === "14:30");
    const okEdit = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_date: "1990-07-16", birth_time: "09:05" });
    ok("8e Geçerli düzenleme kabul edilir", okEdit.status === 200 && db.tables.human_design_clients[0].birth_date === "1990-07-16" && db.tables.human_design_clients[0].birth_time === "09:05");
    // Eski farklı biçimli değer zorla değiştirilmez
    const legacyDb = new FakeDb();
    legacyDb.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ", birth_date: "1976-02-10", birth_time: "13:45:00", birth_place: "Ankara", updated_at: "v" }];
    currentGuard = guardFor(legacyDb);
    const keep = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_time: "13:45:00", notes: "x" });
    ok("8f Eski 'HH:mm:ss' değer DEĞİŞMEDEN kalır (zorla dönüştürme yok)", keep.status === 200 && legacyDb.tables.human_design_clients[0].birth_time === "13:45:00" && !("birth_time" in legacyDb.updates[0].payload));
    // Mevcut danışana profil: aynı tarih kuralı
    const jdb = new FakeDb();
    const J = randomUUID();
    jdb.tables.clients = [{ id: J, tenant_id: T1, ad: "ZZ", soyad: "Test", dogum: null }];
    jdb.tables.human_design_clients = [];
    const bad = await JL.createHdProfileForJourneyClient(jdb as never, T1, "u", { journey_client_id: J, birth_date: "2023-02-29", birth_time: "10:00", birth_location_ref: "tr-34-istanbul" });
    ok("8g Mevcut danışana profil: 29 Şubat 2023 → 400 BIRTH_DATE_INVALID (önceden 500)", !bad.ok && (bad as { status: number; code: string }).status === 400 && (bad as { code: string }).code === "BIRTH_DATE_INVALID", JSON.stringify(bad));
    const old = await JL.createHdProfileForJourneyClient(jdb as never, T1, "u", { journey_client_id: J, birth_date: "0199-05-01", birth_time: "10:00", birth_location_ref: "tr-34-istanbul" });
    ok("8h Mevcut danışana profil: yıl 0199 → 400", !old.ok && (old as { status: number }).status === 400);
    const noTime = await JL.createHdProfileForJourneyClient(jdb as never, T1, "u", { journey_client_id: J, birth_date: "1990-07-15", birth_time: "", birth_location_ref: "tr-34-istanbul" });
    ok("8i HD-16 Profil oluşturma: saat yok → 400 BIRTH_TIME_REQUIRED", !noTime.ok && (noTime as { code: string }).code === "BIRTH_TIME_REQUIRED");
    const detail = src("app/human-design/danisanlar/[id]/HdDanisanDetayContent.tsx");
    // MOB-01: yerel tarih seçicisi yerine elle yazılabilen HdBirthDateInput — aralık sunucuyla aynı (1800 – bugün).
    const HDI = await import("../../app/human-design/components/HdBirthDateInput");
    const today = "2026-10-16";
    ok("8j Arayüz tarih alanı sunucu aralığıyla aynı (1800-01-01 kabul, 1799 ve yarın ret, 29.02.2023 ret)",
      /<HdBirthDateInput/.test(detail) &&
      HDI.hdParseDateDigits("01011800", today) === "1800-01-01" && HDI.hdParseDateDigits("31121799", today) === null &&
      HDI.hdParseDateDigits("16102026", today) === "2026-10-16" && HDI.hdParseDateDigits("17102026", today) === null &&
      HDI.hdParseDateDigits("29022023", today) === null && HDI.hdParseDateDigits("29022024", today) === "2024-02-29");
    ok("8k Tek doğrulama kaynağı: isValidHdBirthDate hem düzenleme hem profil oluşturmada", /isValidHdBirthDate\(v, now\)/.test(src("lib/human-design/api/clientPersistence.ts")) && /isValidHdBirthDate\(d\)/.test(src("lib/human-design/api/journeyLink.ts")));
    // Hesap: saatsiz danışan → 422, Roxy 0
    const cdb = new FakeDb();
    cdb.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ", birth_date: "1990-07-15", birth_time: null }];
    let rc = 0;
    const r = await RCS.computeRoxyChart({ db: cdb as never, tenantId: T1, userId: "u", isDemo: false }, { client_id: C1, location_id: "tr-34-istanbul" }, { config: { apiKey: "zz", baseUrl: "https://roxy.test" }, callRoxy: async () => { rc++; return { ok: true as const, raw: FIXTURE }; }, rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), chartIdSecret: "s", log: () => undefined } as never);
    ok("8l HD-16 Saatsiz danışan hesaplanmaz (422 MISSING_BIRTH_DATA, Roxy 0; öğlen varsayımı yok)", r.status === 422 && (r.body as Row).code === "MISSING_BIRTH_DATA" && rc === 0);
  }

  // ══ HD-14 / HD-29 ══════════════════════════════════════════════════════════
  section("HD-14 belirsiz saat güvenli ret · HD-29 yaşanmamış saat en erken noktada");
  {
    const gap = BT.birthLocalTimeIssue("2016-03-27", "03:30", "Europe/Istanbul");
    ok("14a Boşluk mesajı: geçiş saatini söyler (03:00 → 04:00 ileri)", gap?.kind === "gap" && gap.code === "BIRTH_TIME_NONEXISTENT" && gap.message.includes("03:00 → 04:00") && gap.message.includes("hiç yaşanmamıştır"), gap?.message);
    const amb = BT.birthLocalTimeIssue("1990-09-30", "01:30", "Europe/Istanbul");
    ok("14b Çakışma mesajı: iki ofset + tahmin yapılmaz", amb?.kind === "ambiguous" && amb.message.includes("UTC+02:00") && amb.message.includes("UTC+03:00") && amb.message.includes("tahmin yapmaz") && amb.message.includes("02:00 → 01:00"), amb?.message);
    const chi = BT.birthLocalTimeIssue("2021-11-07", "01:30", "America/Chicago");
    ok("14c Chicago çakışması: UTC−06:00 ve UTC−05:00", chi?.kind === "ambiguous" && chi.message.includes("UTC−06:00") && chi.message.includes("UTC−05:00"));
    ok("14d Berlin 2021-03-28 02:30 boşluk (02:00 → 03:00)", BT.birthLocalTimeIssue("2021-03-28", "02:30", "Europe/Berlin")?.message.includes("02:00 → 03:00") === true);
    ok("14e 1940-07-01 00:30 İstanbul (gece yarısı geçişi) boşluk", BT.birthLocalTimeIssue("1940-07-01", "00:30", "Europe/Istanbul")?.kind === "gap");
    const valid: [string, string, string][] = [
      ["2016-03-27", "02:59", "Europe/Istanbul"], ["2016-03-27", "04:00", "Europe/Istanbul"], ["1990-09-30", "00:59", "Europe/Istanbul"],
      ["1990-09-30", "02:00", "Europe/Istanbul"], ["2017-01-15", "03:30", "Europe/Istanbul"], ["1976-02-10", "13:45", "Europe/Istanbul"],
      ["2021-03-28", "03:00", "Europe/Berlin"], ["1996-11-03", "09:10", "America/Chicago"], ["1990-07-15", "13:00", "Europe/Berlin"],
    ];
    ok("14f Geçiş sınırındaki ve sıradan geçerli saatler REDDEDİLMEZ (9 vaka)", valid.every(([d, t, z]) => BT.birthLocalTimeIssue(d, t, z) === null), valid.filter(([d, t, z]) => BT.birthLocalTimeIssue(d, t, z) !== null).join(";"));
    // Hesap: çakışma ve boşluk → 422, Roxy 0
    const run = async (date: string, time: string, loc: string) => {
      const db = new FakeDb();
      db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ", birth_date: date, birth_time: time }];
      let n = 0;
      const r = await RCS.computeRoxyChart({ db: db as never, tenantId: T1, userId: "u", isDemo: false }, { client_id: C1, location_id: loc }, {
        config: { apiKey: "zz", baseUrl: "https://roxy.test" },
        callRoxy: async (_c: unknown, body: unknown) => { n++; return { ok: true as const, raw: JSON.parse(consistentRoxyResponse(FIXTURE_JSON, JSON.stringify(body))) }; },
        rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), chartIdSecret: "s", log: () => undefined,
      } as never);
      return { r, n, db };
    };
    const a1 = await run("2010-10-31", "03:30", "tr-34-istanbul");
    ok("14g Hesap: çakışan saat → 422 BIRTH_TIME_AMBIGUOUS, Roxy 0, kayıt yok (sessiz UTC seçimi yok)", a1.r.status === 422 && (a1.r.body as Row).code === "BIRTH_TIME_AMBIGUOUS" && a1.n === 0 && !(a1.db.tables.human_design_charts?.length) && String((a1.r.body as Row).error).includes("iki kez yaşanmıştır"));
    const g1 = await run("2016-03-27", "03:30", "tr-34-istanbul");
    ok("14h Hesap: yaşanmamış saat → 422 BIRTH_TIME_NONEXISTENT, Roxy 0", g1.r.status === 422 && (g1.r.body as Row).code === "BIRTH_TIME_NONEXISTENT" && g1.n === 0);
    const v1 = await run("2016-03-27", "04:30", "tr-34-istanbul");
    ok("14i Hesap: geçişten hemen sonraki geçerli saat hesaplanır (1 Roxy, HD-15 tutarlılık kapısı geçer)", v1.r.status === 200 && v1.r.body.ok === true && v1.n === 1, JSON.stringify(v1.r.body).slice(0, 200));
    // Kayıt (HD-29)
    const clientsRoute = req("../../app/api/hd/clients/route.ts") as Record<string, (r: unknown) => Promise<Response>>;
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ", birth_date: "2001-03-24", birth_time: "01:30", birth_place: "İstanbul, İstanbul, Türkiye", birth_location_id: "tr-34-istanbul", birth_location_label: "İstanbul, İstanbul, Türkiye", birth_timezone: "Europe/Istanbul", updated_at: "v" }];
    currentGuard = guardFor(db);
    const p = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_date: "2001-03-25" });
    ok("29a Düzenleme: tarih değişince saat yaşanmamış olur (P10: 25.03.2001 01:30) → 400, kayıt yok", p.status === 400 && p.json.code === "BIRTH_TIME_NONEXISTENT" && db.tables.human_design_clients[0].birth_date === "2001-03-24", JSON.stringify(p.json));
    const pa = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_date: "2010-10-31", birth_time: "03:30" });
    ok("29b Düzenleme: çakışan (gerçekten yaşanmış) saat KAYDEDİLİR; yalnız hesap güvenli reddeder", pa.status === 200 && db.tables.human_design_clients[0].birth_time === "03:30");
    const pl = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_date: "2021-03-28", birth_time: "02:30", birth_place: "x", birth_location_ref: "de-berlin" });
    ok("29c Düzenleme: yeni konumun saat diliminde yaşanmamış saat → 400 (konum da yazılmaz)", pl.status === 400 && db.tables.human_design_clients[0].birth_location_id === "tr-34-istanbul");
    // Eski geçersiz kayıt başka alan güncellemesini engellemez
    const legacyDb = new FakeDb();
    legacyDb.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ", birth_date: "2001-03-25", birth_time: "01:30", birth_place: "İstanbul, İstanbul, Türkiye", birth_location_id: "tr-34-istanbul", birth_location_label: "İstanbul, İstanbul, Türkiye", birth_timezone: "Europe/Istanbul", updated_at: "v" }];
    currentGuard = guardFor(legacyDb);
    const ln = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, notes: "not" });
    ok("29d Önceden kaydedilmiş yaşanmamış saat, NOT güncellemesini engellemez (mevcut veri zorla değişmez)", ln.status === 200 && legacyDb.tables.human_design_clients[0].birth_time === "01:30");
    // Oluşturma (merkezî danışan + HD profili)
    const jdb = new FakeDb();
    const J = randomUUID();
    jdb.tables.clients = [{ id: J, tenant_id: T1, ad: "ZZ", soyad: "Test", dogum: "2016-03-27" }];
    jdb.tables.human_design_clients = [];
    const cr = await JL.createHdProfileForJourneyClient(jdb as never, T1, "u", { journey_client_id: J, birth_time: "03:30", birth_location_ref: "tr-34-istanbul" });
    ok("29e Profil oluşturma: yaşanmamış saat → 400 BIRTH_TIME_NONEXISTENT, profil yok", !cr.ok && (cr as { code: string }).code === "BIRTH_TIME_NONEXISTENT" && jdb.tables.human_design_clients.length === 0, JSON.stringify(cr));
    const ca = await JL.createHdProfileForJourneyClient(jdb as never, T1, "u", { journey_client_id: J, birth_time: "05:30", birth_location_ref: "tr-34-istanbul" });
    ok("29f Profil oluşturma: geçerli saat kabul", ca.ok === true);
    const detail = src("app/human-design/danisanlar/[id]/HdDanisanDetayContent.tsx");
    ok("29g Arayüz aynı tespit fonksiyonunu kullanır (ikinci kural yok) ve boşlukta kaydı engeller", /birthLocalTimeIssue\(form\.birth_date, form\.birth_time, effectiveLocation\.tz\)/.test(detail) && /dstIssue\?\.kind === "gap"/.test(detail));
    ok("29h Hesap servisi mesajı tek kaynaktan (birthLocalTimeIssue)", /birthLocalTimeIssue\(date, hms, location\.timezone\)/.test(src("lib/human-design/api/roxyChartService.ts")));
  }

  // ══ HD-13 ══════════════════════════════════════════════════════════════════
  section("HD-13 Yeniden hesaplama onayı · görüntüleme kredisiz · eski Word silinmez");
  {
    const rows = [{ id: "old", engine_version: "roxyapi-v1", birth_date: "1990-07-15", birth_time: "14:30:00", birth_place: "İstanbul, İstanbul, Türkiye", timezone: "Europe/Istanbul", location_id: "tr-34-istanbul", created_at: "2026-10-01" }];
    const loc = { id: "tr-34-istanbul", label: "İstanbul, İstanbul, Türkiye", tz: "Europe/Istanbul" };
    const same = ACS.resolveAutoCalcState({ birthDate: "1990-07-15", birthTime: "14:30", birthPlace: loc.label, picked: loc, rows });
    const changed = ACS.resolveAutoCalcState({ birthDate: "1990-07-15", birthTime: "14:31", birthPlace: loc.label, picked: loc, rows });
    ok("13a Aynı girdi → 'open' (kayıtlı analizi aç; Roxy çağrısı yok)", same.kind === "open");
    ok("13b Girdi değişti → 'changed' (yeni hesap = kredi)", changed.kind === "changed");
    const calc = src("app/human-design/danisanlar/components/HdAutoCalcPanel.tsx");
    const iBusy = calc.indexOf("busyRef.current = true;");
    const iConfirm = calc.indexOf("await confirm({");
    // Mükerrer uyarısı (tek liste PR'ı): onaylı tekrar isteği aday anahtarlarını 3. parametreyle taşır;
    // "changed" onayı ilk denemede bir kez sorulur (onaylı tekrar aynı onayı yeniden sormaz).
    const iCompute = calc.indexOf("await computeRoxyChart(clientId, location.id");
    ok("13c Onay yalnız 'changed' durumunda; onaydan ÖNCE çift tıklama kilidi", /if \(state\.kind === "changed"( && acknowledged\.length === 0)?\) \{/.test(calc) && iBusy > 0 && iBusy < iConfirm && iConfirm < iCompute);
    ok("13d İptal → kilit açılır ve HİÇBİR istek gönderilmez", /if \(!ok\) \{\s*busyRef\.current = false;\s*return;\s*\}/.test(calc));
    ok("13e Onay metni: eski analiz + yeni hesap + 1 hesaplama hakkı + eski Word silinmez", calc.includes("Kayıtlı analiz:") && calc.includes("Yeni hesaplama:") && calc.includes("1 Human Design hesaplama hakkı (RoxyAPI)") && calc.includes("Word raporları silinmez"));
    ok("13f 'Profesyonel Haritayı Aç' hesap çağırmaz (yalnız açar)", /onClick=\{\(\) => setOpenId\(state\.chartId\)\}/.test(calc));
    // Sunucu: farklı girdiyle yeni hesap eski analizi ve Word'ü SİLMEZ
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ", birth_date: "2018-07-20", birth_time: "19:00" }];
    let n = 0;
    const deps = { config: { apiKey: "zz", baseUrl: "https://roxy.test" }, callRoxy: async (_c: unknown, body: unknown) => { n++; return { ok: true as const, raw: JSON.parse(consistentRoxyResponse(FIXTURE_JSON, JSON.stringify(body))) }; }, rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), chartIdSecret: "s", log: () => undefined };
    const ctx = { db: db as never, tenantId: T1, userId: "u", isDemo: false };
    const first = await RCS.computeRoxyChart(ctx, { client_id: C1, location_id: "tr-34-istanbul" }, deps as never);
    const firstId = (first.body as Row).id as string;
    db.tables.human_design_reports = [{ id: randomUUID(), tenant_id: T1, client_id: C1, chart_id: firstId, report_kind: "canonical" }];
    const again = await RCS.computeRoxyChart(ctx, { client_id: C1, location_id: "tr-34-istanbul" }, deps as never);
    ok("13g Aynı girdi tekrar → reused, Roxy yalnız 1 (kota koruması)", (again.body as Row).reused === true && n === 1);
    db.tables.human_design_clients[0].birth_time = "19:05";
    const second = await RCS.computeRoxyChart(ctx, { client_id: C1, location_id: "tr-34-istanbul" }, deps as never);
    ok("13h Yeni girdi → yeni analiz (Roxy 2); eski analiz ve eski Word kaydı DURUYOR", second.body.ok === true && second.body.id !== firstId && n === 2 && db.tables.human_design_charts.some((c) => c.id === firstId) && db.tables.human_design_reports.length === 1 && db.tables.human_design_reports[0].chart_id === firstId);
  }

  // ══ HD-24 ══════════════════════════════════════════════════════════════════
  section("HD-24 Danışan adı tutarlılığı");
  {
    const db = new FakeDb();
    const chartId = randomUUID();
    db.tables.human_design_charts = [{ id: chartId, tenant_id: T1, source: "computed", provider: "roxyapi", client_id: C1, client_name: "Ayşe Yılmaz", provider_raw: null, input_hash: "h" }];
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "Ayşe Demir" }];
    const g = await CPS.getComputedChart(db as never, T1, chartId);
    ok("24a Analiz okuması güncel danışan adını ayrıca döner (analiz anındaki ad korunur)", g.row?.current_client_name === "Ayşe Demir" && g.row?.client_name === "Ayşe Yılmaz" && !("input_hash" in (g.row ?? {})));
    const db2 = new FakeDb();
    db2.tables.human_design_charts = [{ id: chartId, tenant_id: T1, source: "computed", provider: "roxyapi", client_id: C1, client_name: "Ayşe" }];
    db2.tables.human_design_clients = [{ id: C1, tenant_id: "99999999-9999-4999-8999-999999999999", name: "Başka Tenant" }];
    const g2 = await CPS.getComputedChart(db2 as never, T1, chartId);
    ok("24b Ad yalnız aynı tenant'tan okunur (başka tenant adı sızmaz)", g2.row !== null && !("current_client_name" in (g2.row ?? {})));
    const modal = src("app/human-design/kayitli-haritalar/components/HdComputedChartModal.tsx");
    ok("24c Analiz penceresi başlığı güncel adı gösterir + ad değiştiyse açıklama", /const displayName = row\?\.current_client_name \|\| row\?\.client_name/.test(modal) && modal.includes("Yeni Word güncel adı kullanır; daha önce oluşturulmuş Word eski adı içerir."));
    ok("24d Yeni Word adı güncel danışan kaydından (tek kaynak)", /chart\.client\?\.name \|\| chart\.client_name/.test(src("lib/human-design/reporting/reportSnapshotV2Service.ts")));
  }

  // ══ ALTIN PROFİLLER ════════════════════════════════════════════════════════
  section("ALTIN 20 profil: canlı Roxy kaydı → kodlar → snapshot → Word tutarlılığı (Roxy çağrısı 0)");
  {
    const gold = loadGolden();
    ok("G0 20 profil yüklendi", gold.length === 20, String(gold.length));
    const CHANNELS = K.HUMAN_DESIGN_CHANNELS.map((c) => c.code);
    const GATE_CENTER: Record<string, string> = { Taç: "head", Zihin: "ajna", Boğaz: "throat", "Benlik G": "g_identity", "Kalp-İrade": "heart_ego", Dalak: "spleen", "Solar Pleksus": "solar_plexus", Sakral: "sacral", Kök: "root" };
    const { GATE_TECHNICAL_DATA } = await import("../../lib/human-design/gateTechnicalData");
    let keynoteOk = 0, chanOk = 0, centerOk = 0, snapOk = 0, wordOk = 0, gateChanOk = 0;
    const problems: string[] = [];
    for (const p of gold) {
      // (1) Roxy strateji/imza/kendilik-dışı ↔ tip (uygulamanın türetme kuralı gerçek veriyle doğrulanır)
      const exp = TYPE_KEYNOTES_EN[p.type];
      if (exp && exp[0] === p.strategy && exp[1] === p.signature && exp[2] === p.notSelf) keynoteOk++; else problems.push(`${p.id} keynote`);
      // (2) Bağımsız kanal türetimi: 26 aktivasyonun kapılarından tamamlanan kanallar = Roxy kanalları
      const gates = new Set(p.acts.map((a) => a.gate));
      const derived = CHANNELS.filter((c) => { const [a, b] = c.split("-").map(Number); return gates.has(a) && gates.has(b); }).sort();
      if (JSON.stringify(derived) === JSON.stringify([...p.channels].sort())) chanOk++; else problems.push(`${p.id} kanal ${derived.join(",")} ≠ ${p.channels.join(",")}`);
      // (3) Tanımlı merkezler = kanal uçlarının merkezleri
      const centers = new Set<string>();
      for (const c of p.channels) for (const g of c.split("-").map(Number)) centers.add(GATE_CENTER[GATE_TECHNICAL_DATA[g].merkez]);
      const roxyCenters = new Set(p.centers.map((c) => AC.toAppCenterCode(c)));
      if (centers.size === roxyCenters.size && [...centers].every((c) => roxyCenters.has(c as never))) centerOk++; else problems.push(`${p.id} merkez`);
      // (4) Snapshot
      const codes = mkCodes({
        type_code: AC.toAppTypeCode(p.type), authority_code: AC.toAppAuthorityCode(p.authority), profile_code: AC.toAppProfileCode(p.profile),
        definition_code: AC.toAppDefinitionCode(p.definition) as never,
        active_centers: [...roxyCenters] as never, open_centers: K.HUMAN_DESIGN_CENTERS.map((c) => c.code).filter((c) => !roxyCenters.has(c as never)) as never,
        gates: [...gates].sort((a, b) => a - b), channels: p.channels as never,
      });
      const computed = { activations: p.acts.map((a) => ({ side: a.side, body: a.body, gate: a.gate, line: a.line })), incarnationCross: { name: p.crossName, angle: p.crossAngle, gates: p.crossGates } };
      const s = SV2.buildReportSnapshotV2(baseInput(codes, { computed, client: { name: `ZZ Altın ${p.id}`, birthDate: p.date, birthTime: p.time, birthPlace: p.place, timezone: p.tz } }));
      // Snapshot gezegenleri HD standart sırasına dizer (Güneş, Dünya, K/G Düğüm, Ay…) → gezegen adıyla eşle.
      const want = (side: "personality" | "design", body: string) => p.acts.find((a) => a.side === side && a.body === body)!;
      const actsOk = s.activations.status === "ok" && [...s.activations.personality, ...s.activations.design].length === 26 &&
        s.activations.personality.every((a) => a.gate === want("personality", a.planet).gate && a.line === want("personality", a.planet).line) &&
        s.activations.design.every((a) => a.gate === want("design", a.planet).gate && a.line === want("design", a.planet).line);
      const gc = s.gates.every((g) => JSON.stringify(g.channels) === JSON.stringify(p.channels.filter((c) => c.split("-").map(Number).includes(g.gate))));
      if (gc) gateChanOk++; else problems.push(`${p.id} kapı-kanal`);
      const idOk = !!codes.type_code && !!codes.authority_code && !!codes.profile_code && !!codes.definition_code &&
        s.identity.type === CH.hdTypeLabelFromCode(codes.type_code) && s.identity.strategy === DL.hdTypeKeynotes(codes.type_code)!.strategy &&
        s.centers.filter((c) => c.defined).length === roxyCenters.size && s.channels.length === p.channels.length &&
        s.identity.cross?.gates === `${p.crossGates[0]}/${p.crossGates[1]} | ${p.crossGates[2]}/${p.crossGates[3]}`;
      if (actsOk && idOk) snapOk++; else problems.push(`${p.id} snapshot acts=${actsOk} id=${idOk}`);
      // (5) Word içeriği kayıtlı haritayla eşleşir
      const buf = await WV2.renderHdReportV2Buffer(s, { bodygraphImage: BODYGRAPH_PNG });
      if (p.id === "P13" || p.id === "P22" || p.id === "P08") saveDocx(`ALTIN-${p.id}`, buf);
      const d = await docxParts(buf);
      const actText = d.text.slice(d.text.indexOf("DESIGN"), d.text.indexOf("ENKARNASYON"));
      const allActs = p.acts.every((a) => actText.includes(`${a.gate}.${a.line}`));
      const allCh = p.channels.every((c) => d.text.includes(c.replace("-", "–")));
      const labels = [s.identity.type!, s.identity.profile!, s.identity.authority!, s.identity.definition!, s.identity.strategy!, s.identity.signature!, s.identity.notSelf!].every((l) => d.text.includes(l));
      if (allActs && allCh && labels && !xmlForbidden(d.xml)) wordOk++; else problems.push(`${p.id} word acts=${allActs} ch=${allCh} lbl=${labels}`);
    }
    ok("G1 20/20: Roxy strateji/imza/kendilik-dışı = tipten türetilen değer (HD-04 türetme kuralı doğrulandı)", keynoteOk === 20, problems.filter((x) => x.includes("keynote")).join(";"));
    ok("G2 20/20: bağımsız kanal türetimi (aktivasyon kapılarından) = Roxy kanalları", chanOk === 20, problems.filter((x) => x.includes("kanal")).join(";"));
    ok("G3 20/20: tanımlı merkezler = kanal uçlarının merkezleri", centerOk === 20, problems.filter((x) => x.includes("merkez")).join(";"));
    ok("G4 20/20: snapshot 26 aktivasyon + kimlik + haç kapıları kayıtla birebir", snapOk === 20, problems.filter((x) => x.includes("snapshot")).join(";"));
    ok("G5 20/20: her kapının kanal listesi = o kapıyı içeren tanımlı kanallar (HD-03)", gateChanOk === 20, problems.filter((x) => x.includes("kapı-kanal")).join(";"));
    ok("G6 20/20: Word'de 26 aktivasyon, tüm kanallar, 7 temel etiket; XML geçerli", wordOk === 20, problems.filter((x) => x.includes("word")).join(";"));
  }

  // ══ W: Word kalite senaryoları (uzun ad / uzun içerik / eksik veri) ══════════
  section("W. Word kalite senaryoları (Word ile açılabilirlik kontrolü için dosya üretimi)");
  {
    const gold = loadGolden().find((g) => g.id === "P13")!;
    const gates = [...new Set(gold.acts.map((a) => a.gate))].sort((a, b) => a - b);
    const centers = gold.centers.map((c) => AC.toAppCenterCode(c)!);
    const codes = mkCodes({ type_code: "manifesting_generator", authority_code: "sacral", profile_code: "1_3", definition_code: "single", active_centers: centers as never, open_centers: K.HUMAN_DESIGN_CENTERS.map((c) => c.code).filter((c) => !centers.includes(c as never)) as never, gates, channels: gold.channels as never });
    const computed = { activations: gold.acts, incarnationCross: { name: gold.crossName, angle: gold.crossAngle, gates: gold.crossGates } };
    const longName = "Âdem Çağlar Öztürk-İğdeli Şükrüoğlu Abdurrahmangazi Karamürsel Yılmazoğulları";
    const longText = Array.from({ length: 40 }, (_, i) => `${i + 1}. paragraf: Uzun uzman açıklaması — ğüşıöç ĞÜŞİÖÇ, satır kırılımı ve tablo taşması kontrolü için yeterince uzun bir metin parçası.`).join("\n\n");
    const s = SV2.buildReportSnapshotV2(baseInput(codes, {
      computed,
      client: { name: longName, birthDate: "1972-01-01", birthTime: "00:00", birthPlace: "Atakum, Samsun, Türkiye (uzun yer adı denemesi)", timezone: "Europe/Istanbul" },
      requested: "expert",
      expertRecords: [{ category: "Tipler", title: "Manifesting Generator — çok uzun bir başlık ".repeat(3), code: "tip_manifesting_generator", content: longText, is_active: true }],
      preparedBy: "Uzm. Psk. Danışman Âdem Çağlar Öztürk-İğdeli (Human Design Analist)",
    }));
    const b1 = await WV2.renderHdReportV2Buffer(s, { bodygraphImage: BODYGRAPH_PNG });
    saveDocx("W1-uzun-ad-uzun-icerik", b1);
    const d1 = await docxParts(b1);
    ok("W1 Uzun ad + 40 paragraf: metin tam (kesilme yok), XML geçerli", d1.text.includes(longName) && d1.text.includes("40. paragraf") && !xmlForbidden(d1.xml));
    // Eksik/opsiyonel veri: manuel kayıt, görsel yok, saat/yer yok, tip yok
    const manual = SV2.buildReportSnapshotV2(baseInput(mkCodes({ type_code: null, authority_code: null, profile_code: null, definition_code: null }), {
      source: "manual", provider: null, client: { name: "ZZ Eksik Veri", birthDate: null, birthTime: null, birthPlace: null, timezone: null }, bodygraph: { status: "missing" },
    }));
    const b2 = await WV2.renderHdReportV2Buffer(manual, {});
    saveDocx("W2-eksik-veri-manuel", b2);
    const d2 = await docxParts(b2);
    ok("W2 Eksik veri: rapor çökmez, uydurma alan yok", d2.text.includes("ZZ Eksik Veri") && !d2.text.includes("Strateji") && !xmlForbidden(d2.xml));
    // Reflektör (kanal yok, tüm merkezler açık)
    const refl = loadGolden().find((g) => g.id === "P22")!;
    const rs = SV2.buildReportSnapshotV2(baseInput(mkCodes({ type_code: "reflector", authority_code: "lunar", profile_code: "6_2", definition_code: "none" as never, open_centers: K.HUMAN_DESIGN_CENTERS.map((c) => c.code) as never, gates: [...new Set(refl.acts.map((a) => a.gate))], channels: [] }), {
      computed: { activations: refl.acts, incarnationCross: { name: refl.crossName, angle: refl.crossAngle, gates: refl.crossGates } },
    }));
    const b3 = await WV2.renderHdReportV2Buffer(rs, { bodygraphImage: BODYGRAPH_PNG });
    saveDocx("W3-reflektor-kanalsiz", b3);
    const d3 = await docxParts(b3);
    ok("W3 Reflektör: 'tanımlı kanal bulunmuyor', 0 tanımlı merkez, Strateji = ay döngüsü", d3.text.includes("Bu haritada tanımlı kanal bulunmuyor.") && d3.text.includes("Bir ay döngüsünü (~28 gün) beklemek"));
  }

  section("Z. Ağ");
  ok("Z1 harness boyunca dış ağ çağrısı 0", netCalls.length === 0, netCalls.join(","));

  if (written.length) console.log(`\nWord çıktıları (${written.length}): ${OUT_DIR}`);
  console.log(`\nHD AŞAMA 2: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.log("FAIL listesi:");
    for (const f of fails) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
