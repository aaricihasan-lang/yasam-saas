/**
 * HD AŞAMA 1 (2026-10-15) — Güvenlik ve veri bütünlüğü regresyon harness'i.
 *
 * Kapsam: HD-01, HD-02, HD-15, HD-25, HD-27, HD-28 (7 alt madde: GUV-03/04/06/07/08/09/10).
 * Gerçek DB / Storage / RoxyAPI / ağ YOK: bellek-içi sahte Supabase + guard stub'ı.
 * Tüm veri SENTETİK; gerçek başka-tenant dosyasına erişilmez.
 *
 * Çalıştırma: npx tsx scripts/hd-sec-stage1/harness.ts
 */
import Module, { createRequire } from "node:module";
import { createHmac, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

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

// Ağ YASAK — hiçbir test dışarı çıkamaz (Roxy çağrısı 0 kanıtı).
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

// ─── Sahte Supabase ─────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
class FakeDb {
  tables: Record<string, Row[]> = {};
  updates: { table: string; payload: Row }[] = [];
  storageCalls: { op: string; bucket: string; path: string }[] = [];
  objects = new Map<string, Buffer>();
  failTables = new Set<string>();
  from(t: string) { return new FakeQuery(this, t); }
  rpc() { return Promise.resolve({ data: null, error: { message: "rpc yok (harness)" } }); }
  storage = {
    from: (bucket: string) => ({
      createSignedUrl: async (path: string) => { this.storageCalls.push({ op: "sign", bucket, path }); return { data: { signedUrl: `https://signed.test/${bucket}/${path}` }, error: null }; },
      download: async (path: string) => {
        this.storageCalls.push({ op: "download", bucket, path });
        const b = this.objects.get(`${bucket}/${path}`);
        return b ? { data: new Blob([new Uint8Array(b)]), error: null } : { data: null, error: { message: "Object not found" } };
      },
      upload: async (path: string, data: Buffer) => { this.storageCalls.push({ op: "upload", bucket, path }); this.objects.set(`${bucket}/${path}`, Buffer.from(data)); return { data: { path }, error: null }; },
      copy: async (src: string, dst: string) => { this.storageCalls.push({ op: "copy", bucket, path: src }); return { data: { path: dst }, error: null }; },
      remove: async (paths: string[]) => { for (const p of paths) this.storageCalls.push({ op: "remove", bucket, path: p }); return { data: [], error: null }; },
      list: async () => ({ data: [], error: null }),
    }),
  };
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
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; this.db.updates.push({ table: this.table, payload: { ...p } }); return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.preds.push((r) => r[c] === v); return this; }
  in(c: string, vs: unknown[]) { this.preds.push((r) => vs.includes(r[c])); return this; }
  not() { return this; }
  like() { return this; }
  is() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }
  private exec(): { data: unknown; error: unknown } {
    if (this.db.failTables.has(this.table)) return { data: null, error: { code: "42P01", message: 'relation "secret_schema.internal_table" does not exist' } };
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
    return { data, error: null };
  }
  then<T>(res: (v: { data: unknown; error: unknown }) => T, rej?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.exec()).then(res, rej);
  }
}

// ─── Guard ──────────────────────────────────────────────────────────────────
let currentGuard: Row | null = null;
(globalThis as Row).__HDAY_GUARD__ = () => {
  if (!currentGuard) {
    const { NextResponse } = req("next/server");
    return { ok: false, response: NextResponse.json({ ok: false, error: "Yetki gerekli." }, { status: 401 }) };
  }
  return currentGuard;
};
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const C1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function guardFor(db: FakeDb, tenantId = T1): Row {
  return {
    ok: true, db, tenantId, userId: `u-${tenantId.slice(0, 4)}`, is_demo_account: false,
    profile: { role: "expert", membership_status: "active", module_permissions: { human_design: true, hd_system_reading: true } },
  };
}
function mkReq(method: string, url: string, body?: unknown, raw?: string) {
  const { NextRequest } = req("next/server");
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130" },
    ...(body !== undefined || raw !== undefined ? { body: raw ?? JSON.stringify(body) } : {}),
  });
}
async function call(handler: (r: unknown) => Promise<Response>, method: string, url: string, body?: unknown, raw?: string) {
  const res = await handler(mkReq(method, url, body, raw));
  let json: Row = {};
  try { json = (await res.clone().json()) as Row; } catch { /* docx vb. */ }
  return { status: res.status, json };
}

async function main() {
  console.log("HD AŞAMA 1 — güvenlik ve veri bütünlüğü harness'i (sahte DB; gerçek DB/Storage/Roxy/ağ YOK)");
  const P = await import("../../lib/human-design/api/chartImagePath");
  const { isTenantHdFilePath } = await import("../../lib/backup/hdFiles");
  const CP = await import("../../lib/human-design/api/clientPersistence");
  const RP = await import("../../lib/human-design/api/reportPersistence");
  const KP = await import("../../lib/human-design/api/knowledgePersistence");
  const KSP = await import("../../lib/human-design/api/knowledgeSourcePersistence");
  const TC = await import("../../lib/human-design/providers/roxy/timeConsistency");
  const RCS = await import("../../lib/human-design/api/roxyChartService");
  const BB = await import("../../lib/human-design/reporting/bodygraphBinding");
  const DRL = await import("../../lib/security/dbRateLimit");
  const { resolveBirthLocalTime } = await import("../../lib/human-design/api/birthTimeResolution");

  // ══ HD-01 / HD-02: merkezî yol doğrulayıcı ══════════════════════════════════
  section("HD-01/HD-02 A. Yol doğrulayıcı — meşru eski biçimler KIRILMAZ");
  const legit = [
    `${T1}/${C1}/bodygraph.png`,
    `${T1}/${C1}/bodygraph.jpg`,
    `${T1}/${C1}/${randomUUID()}.webp`,
    `${T1}/${C1}/${randomUUID()}.jpeg`,
    `${T1}/${C1}/${randomUUID()}.PNG`,
  ];
  for (const p of legit) ok(`A geçerli: ${p.replace(T1, "T").replace(C1, "C")}`, P.isOwnedChartImagePath(p, T1, C1) && isTenantHdFilePath(p, T1));
  const snap = `${T1}/report-snapshots/${randomUUID()}.png`;
  ok("A rapor snapshot yolu geçerli", P.isOwnedReportSnapshotPath(snap, T1) && isTenantHdFilePath(snap, T1));

  section("HD-01/HD-02 B. Traversal / kodlama / ayraç varyasyonları REDDEDİLİR");
  const base = `${T1}/${C1}`;
  const attacks: [string, string][] = [
    ["düz ..", `${base}/../${C2}/x.png`],
    ["iki seviye ..", `${base}/../../${T2}/${C2}/x.png`],
    ["bucket kaçışı", `${base}/../../../client-anamnesis-files/x.png`],
    ["%2e%2e", `${base}/%2e%2e/%2e%2e/${T2}/${C2}/x.png`],
    ["%2E%2e karışık", `${base}/%2E%2e/x.png`],
    [".%2e", `${base}/.%2e/x.png`],
    ["çift kodlama %252e", `${base}/%252e%252e/x.png`],
    ["kodlu / %2f", `${base}%2f..%2fx.png`],
    ["ters eğik çizgi", `${base}\\..\\x.png`],
    ["// çift ayraç", `${T1}//${C1}/x.png`],
    ["baştaki /", `/${base}/x.png`],
    ["sondaki /", `${base}/x.png/`],
    ["tek nokta segment", `${base}/./x.png`],
    ["gizli dosya", `${base}/.x.png`],
    ["sorgu ?", `${base}/x.png?download=1`],
    ["parça #", `${base}/x.png#a`],
    ["boşluk", `${base}/x y.png`],
    ["baş/son boşluk", ` ${base}/x.png`],
    ["kontrol karakteri", `${base}/x\u0000.png`],
    ["unicode nokta (full-width)", `${base}/．．/x.png`],
    ["alt klasör", `${base}/sub/x.png`],
    ["izinsiz uzantı .svg", `${base}/x.svg`],
    ["izinsiz uzantı .pdf", `${base}/x.pdf`],
    ["uzantısız", `${base}/x`],
    ["başka tenant", `${T2}/${C1}/x.png`],
    ["http URL", `https://evil.test/${base}/x.png`],
    ["boş", ""],
    ["çok uzun", `${base}/${"a".repeat(600)}.png`],
  ];
  for (const [label, p] of attacks) {
    ok(`B red (${label})`, !P.isOwnedChartImagePath(p, T1, C1) && !isTenantHdFilePath(p, T1) && !P.isOwnedReportSnapshotPath(p, T1));
  }
  ok("B başka danışanın yolu: danışan sahipliği reddeder (tenant-içi yedek listesi ayrı kural)", !P.isOwnedChartImagePath(`${T1}/${C2}/x.png`, T1, C1) && isTenantHdFilePath(`${T1}/${C2}/x.png`, T1));
  ok("B snapshot alt klasör / traversal reddedilir",
    !P.isOwnedReportSnapshotPath(`${T1}/report-snapshots/../${C1}/x.png`, T1) &&
    !P.isOwnedReportSnapshotPath(`${T1}/report-snapshots/a/x.png`, T1) &&
    !P.isOwnedReportSnapshotPath(`${T2}/report-snapshots/x.png`, T1));
  ok("B geri yükleme geçici klasörü dosya yolu olarak kabul edilmez", !isTenantHdFilePath(`${T1}/.restore-tmp/${randomUUID()}/0.part`, T1));

  section("HD-01/HD-02 C. Kanıt: kabul edilen HER yol URL normalizasyonuyla DEĞİŞMEZ (kaçış imkânsız)");
  const prefix = "https://x.supabase.co/storage/v1/object/sign/hd-chart-images/";
  const accepted = [...legit, snap];
  ok("C kabul edilen yollar: new URL(...).pathname birebir aynı", accepted.every((p) => new URL(prefix + p).pathname === new URL(prefix).pathname + p));
  ok("C (karşı kanıt) saldırı yolları normalize olup başka hedefe gider → doğrulayıcı bunları reddediyor",
    new URL(prefix + `${base}/../../${T2}/${C2}/x.png`).pathname.endsWith(`/hd-chart-images/${T2}/${C2}/x.png`) &&
    new URL(prefix + `${base}/%2e%2e/%2e%2e/%2e%2e/other/x.png`).pathname.endsWith("/sign/other/x.png"));

  section("HD-01 D. chart_image_url İSTEMCİDEN YAZILAMAZ (PATCH /api/hd/clients)");
  {
    const clientsRoute = req("../../app/api/hd/clients/route.ts") as Record<string, (r: unknown) => Promise<Response>>;
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ Sentetik", chart_image_url: null, updated_at: "2026-10-15T00:00:00Z" }];
    currentGuard = guardFor(db);
    const r = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, chart_image_url: `${base}/../${C2}/x.png`, notes: "n" });
    ok("D1 PATCH 200 (diğer alanlar güncellenir)", r.status === 200, JSON.stringify(r.json));
    ok("D2 güncelleme yükünde chart_image_url YOK", db.updates.every((u) => !("chart_image_url" in u.payload)), JSON.stringify(db.updates));
    ok("D3 DB'deki değer değişmedi (null)", db.tables.human_design_clients[0].chart_image_url === null);

    // Kayıtlı (eski/zararlı) traversal yolu → imzalı URL ÜRETİLMEZ, storage'a gidilmez.
    const signRoute = req("../../app/api/hd/chart-image-url/route.ts") as Record<string, (r: unknown) => Promise<Response>>;
    for (const bad of [`${base}/../${C2}/x.png`, `${base}/%2e%2e/%2e%2e/${T2}/${C2}/x.png`, `${base}/%2e%2e/%2e%2e/%2e%2e/client-anamnesis-files/x.pdf`]) {
      db.tables.human_design_clients[0].chart_image_url = bad;
      db.storageCalls = [];
      const s = await call(signRoute.GET, "GET", `http://l/api/hd/chart-image-url?clientId=${C1}`);
      ok(`D4 kayıtlı zararlı yol → imza YOK, storage çağrısı YOK (${bad.includes("%") ? "kodlu" : "düz"})`, s.status === 200 && s.json.signedUrl === null && db.storageCalls.length === 0, JSON.stringify(s.json));
    }
    db.tables.human_design_clients[0].chart_image_url = `${base}/bodygraph.png`;
    db.storageCalls = [];
    const g = await call(signRoute.GET, "GET", `http://l/api/hd/chart-image-url?clientId=${C1}`);
    ok("D5 geçerli eski yol → imzalı URL üretilir (geriye uyum)", g.status === 200 && typeof g.json.signedUrl === "string" && db.storageCalls.length === 1 && db.storageCalls[0].path === `${base}/bodygraph.png`);
    const bid = await call(signRoute.GET, "GET", "http://l/api/hd/chart-image-url?clientId=..%2f..");
    ok("D6 geçersiz clientId → 400", bid.status === 400);
    currentGuard = guardFor(db, T2);
    const other = await call(signRoute.GET, "GET", `http://l/api/hd/chart-image-url?clientId=${C1}`);
    ok("D7 başka tenant'ın danışanı → 403, imza YOK", other.status === 403 && !("signedUrl" in other.json && other.json.signedUrl));
    currentGuard = null;
    const anon = await call(signRoute.GET, "GET", `http://l/api/hd/chart-image-url?clientId=${C1}`);
    ok("D8 oturumsuz → 401", anon.status === 401);
  }

  section("HD-02 E. Geri yükleme: yalnız bu tenant'ın DB'de referans verdiği yol");
  {
    const { planHdFileRestore, storeHdRestorePart, commitHdRestoreFile } = await import("../../lib/backup/hdFiles");
    const db = new FakeDb();
    const good = `${T1}/${C1}/bodygraph.png`;
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, chart_image_url: good }];
    db.tables.human_design_reports = [];
    const ctx = { tenantId: T1, userId: "u", role: "expert", modulePermissions: { human_design: true }, membershipActive: true };
    const sha = "a".repeat(64);
    const plan = await planHdFileRestore(db as never, ctx as never, [
      { bucket: "hd-chart-images", path: good, size: 10, sha256: sha },
      { bucket: "hd-chart-images", path: `${T1}/%2e%2e/%2e%2e/client-anamnesis-files/x.png`, size: 10, sha256: sha },
      { bucket: "hd-chart-images", path: `${T1}/${C1}/../${C2}/x.png`, size: 10, sha256: sha },
      { bucket: "client-anamnesis-files", path: good, size: 10, sha256: sha },
      { bucket: "hd-chart-images", path: `${T1}/${C1}/baska.png`, size: 10, sha256: sha },
    ]);
    ok("E1 referanslı geçerli yol → upload", plan[0].action === "upload", JSON.stringify(plan[0]));
    ok("E2 %2e%2e bucket kaçışı → skip invalid_path", plan[1].action === "skip" && plan[1].reason === "invalid_path");
    ok("E3 düz traversal → skip invalid_path", plan[2].action === "skip" && plan[2].reason === "invalid_path");
    ok("E4 yanlış bucket → skip invalid_path", plan[3].action === "skip" && plan[3].reason === "invalid_path");
    ok("E5 DB'de referansı olmayan yol → skip unreferenced", plan[4].action === "skip" && plan[4].reason === "unreferenced");
    const part = await storeHdRestorePart(db as never, ctx as never, { path: `${T1}/%2e%2e/%2e%2e/client-anamnesis-files/x.png`, upload_id: randomUUID(), index: 0, data_base64: "eA==" });
    const commit = await commitHdRestoreFile(db as never, ctx as never, { path: `${T1}/%2e%2e/%2e%2e/client-anamnesis-files/x.png`, upload_id: randomUUID(), parts: 1, size: 1, sha256: sha });
    ok("E6 kodlu kaçış yolu: parça ve birleştirme 400, storage'a yazım YOK", !part.ok && part.status === 400 && !commit.ok && commit.status === 400 && db.storageCalls.every((c) => !c.path.includes("%")));
    const unrefCommit = await commitHdRestoreFile(db as never, ctx as never, { path: `${T1}/${C1}/baska.png`, upload_id: randomUUID(), parts: 1, size: 1, sha256: sha });
    ok("E7 referanssız geçerli biçimli yol: birleştirme 400", !unrefCommit.ok && unrefCommit.status === 400);
  }

  // ══ HD-27: kimlik doğrulaması + sahte başarı + sahiplik ═════════════════════
  section("HD-27 F. Geçersiz kimlik → 400 (500 değil), DB'ye gidilmez");
  {
    const db = new FakeDb();
    currentGuard = guardFor(db);
    const routes: [string, Record<string, (r: unknown) => Promise<Response>>][] = [
      ["charts", req("../../app/api/hd/charts/route.ts")],
      ["clients", req("../../app/api/hd/clients/route.ts")],
      ["reports", req("../../app/api/hd/reports/route.ts")],
      ["knowledge", req("../../app/api/hd/knowledge/route.ts")],
      ["knowledge-sources", req("../../app/api/hd/knowledge-sources/route.ts")],
      ["system-reading", req("../../app/api/hd/charts/system-reading/route.ts")],
      ["summary", req("../../app/api/hd/reports/professional/summary/route.ts")],
      ["download", req("../../app/api/hd/reports/professional/download/route.ts")],
      ["professional", req("../../app/api/hd/reports/professional/route.ts")],
      ["delete-image", req("../../app/api/hd/delete-chart-image/route.ts")],
    ];
    const R = Object.fromEntries(routes);
    const BAD = "1' OR '1'='1";
    const enc = encodeURIComponent(BAD);
    const cases: [string, Promise<{ status: number; json: Row }>][] = [
      ["GET /charts?id=", call(R.charts.GET, "GET", `http://l/api/hd/charts?id=${enc}`)],
      ["GET /charts?client_id=", call(R.charts.GET, "GET", `http://l/api/hd/charts?client_id=${enc}`)],
      ["DELETE /charts?id=", call(R.charts.DELETE, "DELETE", `http://l/api/hd/charts?id=${enc}`)],
      ["GET /clients?id=", call(R.clients.GET, "GET", `http://l/api/hd/clients?id=${enc}`)],
      ["PATCH /clients id", call(R.clients.PATCH, "PATCH", "http://l/api/hd/clients", { id: BAD, notes: "x" })],
      ["DELETE /clients?id=", call(R.clients.DELETE, "DELETE", `http://l/api/hd/clients?id=${enc}`)],
      ["GET /reports?id=", call(R.reports.GET, "GET", `http://l/api/hd/reports?id=${enc}`)],
      ["GET /reports?countForClient=", call(R.reports.GET, "GET", `http://l/api/hd/reports?countForClient=${enc}`)],
      ["PATCH /reports id", call(R.reports.PATCH, "PATCH", "http://l/api/hd/reports", { id: BAD, title: "x" })],
      ["DELETE /reports?id=", call(R.reports.DELETE, "DELETE", `http://l/api/hd/reports?id=${enc}`)],
      ["DELETE /knowledge?id=", call(R.knowledge.DELETE, "DELETE", `http://l/api/hd/knowledge?id=${enc}`)],
      ["DELETE /knowledge?ids=", call(R.knowledge.DELETE, "DELETE", `http://l/api/hd/knowledge?ids=${randomUUID()},${enc}`)],
      ["DELETE /knowledge-sources?id=", call(R["knowledge-sources"].DELETE, "DELETE", `http://l/api/hd/knowledge-sources?id=${enc}`)],
      ["GET /system-reading?id=", call(R["system-reading"].GET, "GET", `http://l/api/hd/charts/system-reading?id=${enc}`)],
      ["GET /summary?id=", call(R.summary.GET, "GET", `http://l/api/hd/reports/professional/summary?id=${enc}`)],
      ["POST /download reportId", call(R.download.POST, "POST", "http://l/api/hd/reports/professional/download", { reportId: BAD })],
      ["POST /professional chartId", call(R.professional.POST, "POST", "http://l/api/hd/reports/professional", { chartId: BAD })],
      ["POST /delete-chart-image clientId", call(R["delete-image"].POST, "POST", "http://l/api/hd/delete-chart-image", { clientId: BAD })],
    ];
    for (const [label, p] of cases) {
      const r = await p;
      ok(`F ${label} → 400`, r.status === 400, `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
    }
  }

  section("HD-27 G. Silmede sahte başarı YOK + başka uzmanın kaydı");
  {
    const db = new FakeDb();
    const mine = randomUUID();
    const foreign = randomUUID();
    db.tables.human_design_reports = [
      { id: mine, tenant_id: T1, snapshot: null },
      { id: foreign, tenant_id: T2, snapshot: null },
    ];
    db.tables.human_design_knowledge = [{ id: foreign, tenant_id: T2 }];
    db.tables.human_design_knowledge_sources = [{ id: foreign, tenant_id: T2 }];
    const d1 = await RP.deleteReport(db as never, T1, foreign);
    ok("G1 başka tenant'ın raporu: silinmez, 404 (ok:false)", !d1.ok && d1.status === 404 && db.tables.human_design_reports.length === 2);
    const d2 = await RP.deleteReport(db as never, T1, randomUUID());
    ok("G2 olmayan rapor: 404", !d2.ok && d2.status === 404);
    const d3 = await RP.deleteReport(db as never, T1, mine);
    ok("G3 kendi raporu: silinir, ok", d3.ok && db.tables.human_design_reports.length === 1);
    const k1 = await KP.deleteKnowledge(db as never, T1, foreign);
    ok("G4 Bilgi Bankası: başka tenant kaydı silinmez, 404", !k1.ok && k1.status === 404 && db.tables.human_design_knowledge.length === 1);
    const kb = await KP.deleteKnowledgeBulk(db as never, T1, [foreign, randomUUID()]);
    ok("G5 toplu silme: gerçekten silinen sayı 0 (istenen 2 değil)", kb.ok && kb.deletedCount === 0);
    const s1 = await KSP.deleteSource(db as never, T1, foreign);
    ok("G6 kaynak: başka tenant kaydı silinmez, 404", !s1.ok && s1.status === 404 && db.tables.human_design_knowledge_sources.length === 1);
    // Route düzeyinde de 404 + yanıltıcı başarı yok
    currentGuard = guardFor(db);
    const reportsRoute = req("../../app/api/hd/reports/route.ts") as Record<string, (r: unknown) => Promise<Response>>;
    const rr = await call(reportsRoute.DELETE, "DELETE", `http://l/api/hd/reports?id=${foreign}`);
    ok("G7 DELETE /reports başka tenant → 404, ok:false", rr.status === 404 && rr.json.ok === false);
  }

  section("HD-27 H. Eski rapor kaydı: harita DANIŞANA ait olmalı");
  {
    const db = new FakeDb();
    const chartOfC2 = randomUUID();
    const chartOfC1 = randomUUID();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1 }, { id: C2, tenant_id: T1 }];
    db.tables.human_design_charts = [{ id: chartOfC2, tenant_id: T1, client_id: C2 }, { id: chartOfC1, tenant_id: T1, client_id: C1 }];
    const bad = await RP.saveReport(db as never, T1, "u", { clientId: C1, chartId: chartOfC2, title: "t" });
    ok("H1 C1 raporuna C2'nin haritası bağlanamaz", bad.id === null && /danışana ait değil/.test(bad.error ?? ""), JSON.stringify(bad));
    const good = await RP.saveReport(db as never, T1, "u", { clientId: C1, chartId: chartOfC1, title: "t" });
    ok("H2 doğru eşleşme kaydedilir", typeof good.id === "string");
    const long = await RP.saveReport(db as never, T1, "u", { clientId: C1, chartId: chartOfC1, title: "x".repeat(201) });
    ok("H3 başlık uzunluk sınırı (200)", long.id === null);
    const canon = await RP.saveCanonicalReport(db as never, T1, "u", { chartId: chartOfC2, clientId: C1, title: "t", snapshot: {} as never, provenance: {} });
    ok("H4 profesyonel rapor: harita danışanı ≠ rapor danışanı → red", canon.id === null && /uyuşmuyor/.test(canon.error ?? ""), JSON.stringify(canon));
  }

  // ══ HD-28 ═══════════════════════════════════════════════════════════════════
  section("HD-28 #1 (GUV-03) Dış harita bağlantısı yalnız http(s)");
  for (const [u, exp] of [
    ["https://www.jovianarchive.com/chart/1", true],
    ["http://example.com/x", true],
    ["javascript:alert(1)", false],
    ["JAVASCRIPT:alert(1)", false],
    ["data:text/html;base64,PHNjcmlwdD4=", false],
    ["vbscript:x", false],
    ["//evil.test/x", false],
    ["/relative", false],
    ["https://a.test/" + "x".repeat(2100), false],
    ['https://a.test/"onmouseover="x', false],
  ] as [string, boolean][]) {
    ok(`#1 ${u.slice(0, 40)} → ${exp ? "kabul" : "red"}`, CP.isSafeExternalChartUrl(u) === exp);
  }
  {
    const v = CP.validateHdClientFields({ external_chart_url: "javascript:alert(1)" }, "update");
    ok("#1 PATCH doğrulaması javascript: bağlantısını reddeder", !v.ok);
    const src1 = readFileSync(join(ROOT, "app/human-design/kayitli-haritalar/components/HdHaritaDetayModal.tsx"), "utf8");
    ok("#1 görüntüleme: href yalnız http(s) ise basılır", /\/\^https\?:\\\/\\\/\/i\.test\(row\.client\.external_chart_url\)/.test(src1));
  }

  section("HD-28 #2 (GUV-04) Rate limit: rapor/indirme/compute/charts POST instance-bağımsız DB limiti");
  {
    const files = ["app/api/hd/reports/professional/route.ts", "app/api/hd/reports/professional/download/route.ts", "app/api/hd/compute/route.ts", "app/api/hd/charts/route.ts"];
    for (const f of files) {
      const s = readFileSync(join(ROOT, f), "utf8");
      ok(`#2 ${f.replace("app/api/hd/", "")}: hitDbRateLimit + rateLimitBucket, bellek-içi checkRateLimit YOK`, /hitDbRateLimit\(/.test(s) && /rateLimitBucket\(/.test(s) && !/checkRateLimit\(/.test(s));
    }
    // compute davranışsal: 61. istek 429
    const { __resetRateLimitForTest } = req("../../lib/security/rateLimit.ts") as { __resetRateLimitForTest: () => void };
    __resetRateLimitForTest();
    const db = new FakeDb();
    currentGuard = guardFor(db);
    const compute = req("../../app/api/hd/compute/route.ts") as Record<string, (r: unknown) => Promise<Response>>;
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await call(compute.POST, "POST", "http://l/api/hd/compute", {}, "{bozuk")).status;
    ok("#2 compute: kullanıcı başına saatlik sınır → 61. istek 429", last === 429, String(last));
  }

  section("HD-28 #3 (GUV-06) Ham DB hata metni dışarı sızmaz (admin uçları dahil)");
  {
    const { listPublishedGroup } = await import("../../lib/human-design/knowledge/canonicalReadService") as unknown as Record<string, (...a: unknown[]) => Promise<{ ok: boolean; error?: { code: string; message: string } }>>;
    const db = new FakeDb();
    db.failTables = new Set(["hd_canonical_entities", "hd_canonical_content", "hd_canonical_entity"]);
    const origErr = console.error;
    const logged: string[] = [];
    console.error = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); };
    let leaked = "";
    try {
      const fn = listPublishedGroup;
      if (typeof fn === "function") {
        const r = await fn(db as never, "type");
        leaked = r.ok ? "" : String(r.error?.message ?? "");
      }
    } finally {
      console.error = origErr;
    }
    const svc = readFileSync(join(ROOT, "lib/human-design/knowledge/canonicalReadService.ts"), "utf8");
    const cc = readFileSync(join(ROOT, "lib/human-design/admin/centralContentPersistence.ts"), "utf8");
    ok("#3 canonicalReadService: db_error mesajı hdSafeDbError (ham .message yok)", !/message: \w+\.message/.test(svc) && /hdSafeDbError\(/.test(svc));
    ok("#3 centralContentPersistence: db_error mesajı hdSafeDbError", !/error\?\.message \?\?/.test(cc) && /hdSafeDbError\("centralContent"/.test(cc));
    ok("#3 çalışma zamanı: istemciye giden mesaj genel, şema/tablo adı YOK; ayrıntı yalnız sunucu logunda", leaked.length > 0 && !/secret_schema|internal_table|relation/.test(leaked) && logged.some((l) => l.includes("internal_table")), leaked);
  }

  section("HD-28 #4 (GUV-07) Harita kimliği / girdi hash'i doğum verisinden çevrimdışı doğrulanamaz");
  {
    const ident = { tenantId: T1, clientId: C1, date: "1976-02-10", time: "13:45:00", timezone: "Europe/Istanbul", latitude: 39.9334, longitude: 32.8597, nodeType: "true", lang: "tr" };
    const legacyHash = RCS.roxyInputHash(ident);
    const k1 = RCS.roxyKeyedInputHash(ident, "sir-1");
    const k2 = RCS.roxyKeyedInputHash(ident, "sir-2");
    ok("#4 anahtarlı hash ≠ tuzsuz hash; sır değişince değişir", k1 !== legacyHash && k1 !== k2 && /^[0-9a-f]{64}$/.test(k1));
    ok("#4 anahtarlı kimlik ≠ eski kimlik", RCS.roxyKeyedChartIdFor(T1, k1) !== RCS.roxyChartIdFor(T1, legacyHash));
    // Saldırgan modeli: kimliği + tenant + danışanı bilir, doğum verisini tahmin eder → sırsız doğrulayamaz.
    const guessId = RCS.roxyChartIdFor(T1, RCS.roxyInputHash(ident));
    ok("#4 sırsız tahmin (eski formül) yeni kimlikle EŞLEŞMEZ", guessId !== RCS.roxyKeyedChartIdFor(T1, k1));
    const cp = readFileSync(join(ROOT, "lib/human-design/api/chartPersistence.ts"), "utf8");
    ok("#4 GET /charts?id= yanıtından input_hash çıkarılır", /delete row\.input_hash;/.test(cp));
    ok("#4 sır env'den: HD_CHART_ID_SECRET → SUPABASE_SERVICE_ROLE_KEY, yoksa null (sabit yok)",
      RCS.readChartIdSecret({ HD_CHART_ID_SECRET: "a" } as never) === "a" && RCS.readChartIdSecret({ SUPABASE_SERVICE_ROLE_KEY: "b" } as never) === "b" && RCS.readChartIdSecret({} as never) === null);
  }

  section("HD-28 #4b Geriye uyum: eski (tuzsuz kimlikli) kayıt yeniden kullanılır — mükerrer Roxy YOK");
  {
    const FIXTURE = JSON.parse(readFileSync(join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8"));
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ", birth_date: "2018-07-20", birth_time: "19:00", birth_location_id: null }];
    const konya = { id: "tr-42-konya" };
    let roxyCalls = 0;
    const deps = {
      config: { apiKey: "zz", baseUrl: "https://roxy.test" },
      callRoxy: async () => { roxyCalls++; return { ok: true as const, raw: FIXTURE }; },
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
      chartIdSecret: "yeni-sir",
      log: () => undefined,
    };
    const first = await RCS.computeRoxyChart({ db: db as never, tenantId: T1, userId: "u", isDemo: false }, { client_id: C1, location_id: konya.id }, deps as never);
    ok("#4b ilk hesap: yeni (anahtarlı) kimlik, 1 Roxy", first.body.ok && first.body.reused === false && roxyCalls === 1, JSON.stringify(first.body));
    const stored = db.tables.human_design_charts[0];
    // Kaydı ESKİ biçime dönüştür (geçmişte tuzsuz kimlikle yazılmış gibi) → yeni sır ile tekrar.
    const legacyId = randomUUID();
    stored.id = legacyId;
    const again = await RCS.computeRoxyChart({ db: db as never, tenantId: T1, userId: "u", isDemo: false }, { client_id: C1, location_id: konya.id }, { ...deps, chartIdSecret: "rotasyon-sonrasi-sir" } as never);
    ok("#4b eski/farklı kimlikli eşdeğer kayıt bulunur → reused, Roxy 0", again.body.ok && again.body.reused === true && again.body.id === legacyId && roxyCalls === 1, JSON.stringify(again.body));
  }

  section("HD-28 #5 (GUV-08) Rate-limit sırrında SABİT yedek yok; env varken kovalar değişmez");
  {
    const prevRl = process.env.RATE_LIMIT_SECRET;
    const prevSr = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.RATE_LIMIT_SECRET = "zz-env-secret";
    const expected = `hd-word:${createHmac("sha256", "zz-env-secret").update("hd-word:t").digest("hex").slice(0, 40)}`;
    ok("#5 env tanımlı: kova anahtarı eski formülle BİREBİR (mevcut sayaçlar korunur)", DRL.rateLimitBucket("hd-word", "t") === expected);
    delete process.env.RATE_LIMIT_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const origWarn = console.warn;
    console.warn = () => undefined;
    const s1 = DRL.rateLimitSecret();
    console.warn = origWarn;
    ok("#5 env yok: sır 'yasam-rate-limit' DEĞİL, 64 hex rastgele", s1 !== "yasam-rate-limit" && /^[0-9a-f]{64}$/.test(s1));
    ok("#5 sabit dize kaynak kodda yok", !readFileSync(join(ROOT, "lib/security/dbRateLimit.ts"), "utf8").includes('"yasam-rate-limit"'));
    const loc = readFileSync(join(ROOT, "lib/human-design/api/hdLocationRef.ts"), "utf8");
    ok("#5 konum referansı HMAC'i: sabit yedek yok + alan ayrımı (hd-location-ref:)", /return s \? s : null/.test(loc) && /hd-location-ref:/.test(loc));
    if (prevRl !== undefined) process.env.RATE_LIMIT_SECRET = prevRl;
    if (prevSr !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevSr;
  }

  section("HD-28 #6 (GUV-09) Rapor indirmede eski görsel yolu merkezî doğrulayıcıdan geçer");
  {
    const dl = readFileSync(join(ROOT, "app/api/hd/reports/professional/download/route.ts"), "utf8");
    ok("#6 indirme: isOwnedReportSnapshotPath || isOwnedChartImagePath (ikisi de sıkı)", /isOwnedReportSnapshotPath\(imgPath/.test(dl) && /isOwnedChartImagePath\(imgPath/.test(dl));
    ok("#6 v1 snapshot'ta zararlı kayıtlı yol (traversal) indirilmez",
      !P.isOwnedChartImagePath(`${T1}/${C1}/../../${T2}/${C2}/x.png`, T1, C1) && !P.isOwnedChartImagePath(`${T1}/${C1}/%2e%2e/x.png`, T1, C1));
    const st = readFileSync(join(ROOT, "lib/human-design/api/hdStorage.ts"), "utf8");
    ok("#6 rapor snapshot kopyası (copyChartImageToReportSnapshot) aynı doğrulayıcıyı kullanır", /isOwnedChartImagePath\(sourcePath, tenantId, clientId\)/.test(st));
  }

  section("HD-28 #7 (GUV-10) Alan uzunluğu ve girdi sınırları");
  {
    const now = new Date("2026-10-15T09:00:00Z");
    const t = (f: Row, mode: "insert" | "update" = "update") => CP.validateHdClientFields(f, mode, now);
    ok("#7 ad 120 karakter → kabul, 121 → red", t({ name: "a".repeat(120) }).ok && !t({ name: "a".repeat(121) }).ok);
    ok("#7 ad boş / sadece boşluk → red", !t({ name: "" }).ok && !t({ name: "   " }).ok);
    ok("#7 not 5000 → kabul, 5001 → red", t({ notes: "n".repeat(5000) }).ok && !t({ notes: "n".repeat(5001) }).ok);
    ok("#7 doğum yeri 200 → kabul, 201 → red", t({ birth_place: "p".repeat(200) }).ok && !t({ birth_place: "p".repeat(201) }).ok);
    ok("#7 tarih: gelecek (2090) → red", !t({ birth_date: "2090-10-31" }).ok);
    ok("#7 tarih: bugün → kabul, yarın → red", t({ birth_date: "2026-10-15" }).ok && !t({ birth_date: "2026-10-16" }).ok);
    ok("#7 tarih: 30 Şubat / 29 Şubat 2023 → red; 29 Şubat 2024 → kabul", !t({ birth_date: "2010-02-30" }).ok && !t({ birth_date: "2023-02-29" }).ok && t({ birth_date: "2024-02-29" }).ok);
    ok("#7 tarih: 1799 → red, 1800 → kabul", !t({ birth_date: "1799-12-31" }).ok && t({ birth_date: "1800-01-01" }).ok);
    ok("#7 saat: abc / 24:00 / 12:60 → red", !t({ birth_time: "abc" }).ok && !t({ birth_time: "24:00" }).ok && !t({ birth_time: "12:60" }).ok);
    ok("#7 saat: 00:00 / 23:59 / 12:30:15 → kabul", t({ birth_time: "00:00" }).ok && t({ birth_time: "23:59" }).ok && t({ birth_time: "12:30:15" }).ok);
    ok("#7 tarih/saat temizleme (null/boş) → kabul", t({ birth_date: "", birth_time: null }).ok);
    ok("#7 tip hatası (sayı) → red", !t({ notes: 123 }).ok && !t({ birth_date: 19760210 }).ok);
    // Route düzeyi: PATCH kötü tarih → 400, DB'ye yazılmaz
    const db = new FakeDb();
    db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ", birth_date: "1976-02-10", birth_time: "13:45", updated_at: "x" }];
    currentGuard = guardFor(db);
    const clientsRoute = req("../../app/api/hd/clients/route.ts") as Record<string, (r: unknown) => Promise<Response>>;
    const r = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, birth_date: "2090-10-31", birth_time: "abc" });
    ok("#7 PATCH geçersiz tarih/saat → 400, kayıt DEĞİŞMEZ", r.status === 400 && db.tables.human_design_clients[0].birth_date === "1976-02-10" && db.updates.length === 0, JSON.stringify(r.json));
    const big = await call(clientsRoute.PATCH, "PATCH", "http://l/api/hd/clients", { id: C1, notes: "x".repeat(6000) });
    ok("#7 PATCH aşırı uzun not → 400", big.status === 400);
    const charts = req("../../app/api/hd/charts/route.ts") as Record<string, (r: unknown) => Promise<Response>>;
    const longName = await call(charts.POST, "POST", "http://l/api/hd/charts", { client_name: "x".repeat(121), date: "1990-01-01", time: "10:00", timezone: "Europe/Istanbul" });
    ok("#7 POST /charts aşırı uzun ad → 400 FIELD_TOO_LONG", longName.status === 400 && longName.json.code === "FIELD_TOO_LONG");
  }

  // ══ HD-15: Roxy doğum anı tutarlılığı ═══════════════════════════════════════
  section("HD-15 I. Gerçek (canlı) Roxy Design anları ile tutarlılık — 20 profil, 1935–2020");
  {
    // 2026-10-14 denetiminde canlı uygulama akışıyla alınan Roxy yanıtları (kanıt: HD-DENETIM-2026-10-14/kanit/roxy-canli-sonuclar.txt).
    const live: [string, string, string, string, string][] = [
      ["P01", "1976-02-10", "13:45", "Europe/Istanbul", "1975-11-15T20:54:22Z"],
      ["P02", "1988-02-29", "00:00", "Europe/Istanbul", "1987-12-04T05:57:48Z"],
      ["P03", "1999-12-31", "23:59", "Europe/Istanbul", "1999-10-05T11:19:12Z"],
      ["P04", "1985-06-15", "12:00", "Europe/Istanbul", "1985-03-16T20:34:05Z"],
      ["P06", "2016-11-07", "03:30", "Europe/Istanbul", "2016-08-09T04:41:18Z"],
      ["P07", "1979-07-20", "08:15", "Europe/Istanbul", "1979-04-19T13:53:52Z"],
      ["P08", "1942-03-15", "06:00", "Europe/Istanbul", "1941-12-18T06:05:45Z"],
      ["P09", "1935-11-11", "18:20", "Europe/Istanbul", "1935-08-14T01:40:23Z"],
      ["P12", "1994-05-05", "16:40", "Europe/Istanbul", "1994-02-05T20:48:34Z"],
      ["P13", "1972-01-01", "00:00", "Europe/Istanbul", "1971-10-05T11:41:35Z"],
      ["P14", "2005-08-08", "21:05", "Europe/Istanbul", "2005-05-08T19:10:20Z"],
      ["P16", "1990-07-15", "13:00", "Europe/Berlin", "1990-04-14T22:30:40Z"],
      ["P17", "1996-11-03", "09:10", "America/Chicago", "1996-08-05T15:41:32Z"],
      ["P19", "2020-02-29", "12:00", "Europe/Istanbul", "2019-12-04T16:59:30Z"],
      ["P21", "1996-11-03", "09:10", "Europe/Paris", "1996-08-05T08:22:11Z"],
      ["P22", "2020-03-23", "14:30", "Europe/Istanbul", "2019-12-27T09:02:58Z"],
      ["P23", "1941-01-27", "23:00", "Europe/Istanbul", "1940-11-02T02:19:25Z"],
      ["P24", "1966-10-12", "16:50", "Europe/Istanbul", "1966-07-13T16:46:46Z"],
      ["P25", "1996-10-17", "11:25", "Europe/Istanbul", "1996-07-18T14:57:08Z"],
      ["P26", "2000-10-12", "04:35", "Europe/Istanbul", "2000-07-13T03:05:05Z"],
    ];
    let maxDelta = 0;
    let allConsistent = true;
    let allShiftCaught = true;
    for (const [, d, tm, tz, design] of live) {
      const r = resolveBirthLocalTime(d, tm, tz);
      if (r.kind !== "ok") { allConsistent = false; continue; }
      const c = TC.checkDesignInstantConsistency(r.utcIso, design);
      if (c.status !== "consistent") allConsistent = false;
      else maxDelta = Math.max(maxDelta, c.deltaMinutes);
      // Roxy farklı saat dilimi/DST yorumlasaydı (±1 sa) → yakalanmalı
      for (const sh of [-3600e3, 3600e3]) {
        const wrong = TC.checkDesignInstantConsistency(new Date(Date.parse(r.utcIso) + sh).toISOString(), design);
        if (wrong.status !== "mismatch") allShiftCaught = false;
      }
    }
    ok(`I1 20/20 canlı profil TUTARLI (en büyük fark ${maxDelta.toFixed(3)} dk ≤ ${TC.HD_DESIGN_INSTANT_TOLERANCE_MINUTES} dk)`, allConsistent);
    ok("I2 ±1 saatlik tz/DST yorum hatası 20/20 profilde YAKALANIR", allShiftCaught);
    const half = TC.checkDesignInstantConsistency("1990-07-15T11:30:00Z", "1990-04-14T22:30:40Z");
    ok("I3 30 dk'lık (Hindistan tipi) ofset hatası yakalanır", half.status === "mismatch");
    const quarter = TC.checkDesignInstantConsistency("1990-07-15T11:15:00Z", "1990-04-14T22:30:40Z");
    ok("I4 15 dk'lık (Nepal tipi) ofset hatası yakalanır", quarter.status === "mismatch");
    const bad = TC.checkDesignInstantConsistency("1990-07-15T11:00:00Z", "geçersiz");
    ok("I5 sağlayıcı Design anı bozuk → unverifiable (kayıt engellenmez, loglanır)", bad.status === "unverifiable");
  }

  section("HD-15 J. DST sınırları ve tarihsel kurallar (Europe/Istanbul)");
  {
    const gap = resolveBirthLocalTime("2001-03-25", "01:30", "Europe/Istanbul");
    ok("J1 25.03.2001 01:30 (atlanan saat) → gap", gap.kind === "gap");
    const amb = resolveBirthLocalTime("2010-10-31", "03:30", "Europe/Istanbul");
    ok("J2 31.10.2010 03:30 (iki kez yaşanan) → ambiguous", amb.kind === "ambiguous");
    const after2016 = resolveBirthLocalTime("2016-11-07", "03:30", "Europe/Istanbul");
    ok("J3 2016 sonrası kalıcı +03", after2016.kind === "ok" && after2016.utcIso === "2016-11-07T00:30:00.000Z");
    const war = resolveBirthLocalTime("1941-01-27", "23:00", "Europe/Istanbul");
    ok("J4 1940–41 savaş dönemi +03 (kış ortası)", war.kind === "ok" && war.utcIso === "1941-01-27T20:00:00.000Z");
    const w76 = resolveBirthLocalTime("1976-02-10", "13:45", "Europe/Istanbul");
    ok("J5 1976 kışı +02", w76.kind === "ok" && w76.utcIso === "1976-02-10T11:45:00.000Z");
  }

  section("HD-15 K. Servis: tutarsız Design anı KAYDEDİLMEZ (uçtan uca, sahte DB)");
  {
    const FIXTURE = JSON.parse(readFileSync(join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8"));
    const mk = (raw: unknown) => ({
      config: { apiKey: "zz", baseUrl: "https://roxy.test" },
      callRoxy: async () => ({ ok: true as const, raw }),
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
      chartIdSecret: "s",
      log: () => undefined,
    });
    const seed = () => {
      const db = new FakeDb();
      db.tables.human_design_clients = [{ id: C1, tenant_id: T1, name: "ZZ", birth_date: "2018-07-20", birth_time: "19:00" }];
      return db;
    };
    const ctx = (db: FakeDb) => ({ db: db as never, tenantId: T1, userId: "u", isDemo: false });
    const db1 = seed();
    const okRun = await RCS.computeRoxyChart(ctx(db1), { client_id: C1, location_id: "tr-42-konya" }, mk(FIXTURE) as never);
    ok("K1 gerçek fixture (doğum anıyla tutarlı) → kaydedilir", okRun.body.ok === true && (db1.tables.human_design_charts ?? []).length === 1, JSON.stringify(okRun.body));
    const db2 = seed();
    const shifted = { ...FIXTURE, designInstantUtc: new Date(Date.parse(FIXTURE.designInstantUtc) + 60 * 60e3).toISOString() };
    const bad = await RCS.computeRoxyChart(ctx(db2), { client_id: C1, location_id: "tr-42-konya" }, mk(shifted) as never);
    ok("K2 Roxy 1 sa kaymış an kullanmış gibi → 502 PROVIDER_TIME_MISMATCH, kayıt YOK", !bad.body.ok && bad.status === 502 && bad.body.code === "PROVIDER_TIME_MISMATCH" && (db2.tables.human_design_charts ?? []).length === 0);
  }

  // ══ HD-25 ═══════════════════════════════════════════════════════════════════
  section("HD-25 L. BodyGraph bağlama (saf)");
  {
    const png = makeTinyPng();
    const fp = BB.bodygraphFingerprint([34, 5, 5, 64], 4);
    ok("L1 parmak izi sıralı + tekil", fp === "g:5,34,64|c:4");
    const id = randomUUID();
    const txt = BB.bodygraphBindingText(id.toUpperCase(), fp);
    ok("L2 kimlik küçük harfe normalize", txt === `v1|${id}|${fp}`);
    const bound = BB.insertPngTextChunk(png, BB.HD_BODYGRAPH_BIND_KEYWORD, txt);
    ok("L3 etiket okunur", BB.readPngTextChunks(bound).get(BB.HD_BODYGRAPH_BIND_KEYWORD)?.[0] === txt);
    ok("L4 doğrulama: eşleşen → ok; farklı → MISMATCH; etiketsiz → UNBOUND",
      BB.verifyBodygraphBinding(bound, txt).ok &&
      (BB.verifyBodygraphBinding(bound, `v1|${randomUUID()}|${fp}`) as { code?: string }).code === "BODYGRAPH_MISMATCH" &&
      (BB.verifyBodygraphBinding(png, txt) as { code?: string }).code === "BODYGRAPH_UNBOUND");
    const { validateBodygraphPng } = await import("../../lib/human-design/reporting/bodygraphPng");
    const tall = makeTinyPng(1271, 1800);
    const boundTall = BB.insertPngTextChunk(tall, BB.HD_BODYGRAPH_BIND_KEYWORD, txt);
    ok("L5 etiket eklenmiş PNG sunucu biçim doğrulamasından geçer (CRC/yapı bozulmaz)", validateBodygraphPng(Buffer.from(boundTall)).ok);
    let threw = false;
    try { BB.insertPngTextChunk(tall, BB.HD_BODYGRAPH_BIND_KEYWORD, "ç\nenjeksiyon"); } catch { threw = true; }
    ok("L6 etikette yazdırılamaz / ASCII dışı karakter reddedilir", threw);
  }

  section("Genel: ağ çağrısı yapılmadı");
  ok("Z1 harness boyunca dış ağ çağrısı 0", netCalls.length === 0, netCalls.join(", "));

  console.log(`\nHD AŞAMA 1: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.log("FAIL listesi:");
    for (const f of fails) console.log(` - ${f}`);
    process.exit(1);
  }
}

// ─── Küçük PNG üretici ──────────────────────────────────────────────────────
import { deflateSync } from "node:zlib";
function makeTinyPng(w = 4, h = 4): Uint8Array {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0xff);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
