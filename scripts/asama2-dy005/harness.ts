/**
 * AŞAMA 2 / DY-005 · DY-006 — Kayıtlı Numeroloji analizi ↔ danışan KALICI bağı + danışan Word'ü harness'ı.
 *
 * 0) MOTOR DEĞİŞMEDİ KANITI: origin/main'deki lib/numeroloji ağacı geçici klasöre çıkarılır; aynı 400
 *    sentetik girdi için main motoru ile bu daldaki motorun tam çıktıları (JSON) birebir karşılaştırılır;
 *    motor / hesap / kayıt üretme dosyalarında dal farkı olmadığı git ile doğrulanır.
 * A) SAF builder → GERÇEK DOCX: tam profesyonel içerik (temel değerler, PIN, Çakra Omurgası 10 satır,
 *    Elementler, Değişim–Dönüşüm, Zirve, Mücadele, Harflerin Yankılanışı, Sonuç Özeti) SNAPSHOT'tan;
 *    bilerek değiştirilmiş snapshot değerleri belgede (yeniden hesap YOK); Numeroloji modülünün kendi
 *    Word'ü ile karşılaştırmalı tablo içeriği; eksik bölüm uydurulmaz; yıl sınırı / Gelecek Yıllar.
 * B) GERÇEK route + embedded Postgres + migration 20271120000300 (PROD'A SIFIR TEMAS; ZZ_ sentetik):
 *    bağlama / kaldırma, yanlış tenant / yanlış danışan, yetkisiz erişim, demo, eşzamanlı bağlama,
 *    isimle otomatik eşleştirme olmaması, danışan silinince kaydın korunması, kolon yokken fail-closed,
 *    Word yalnız bağlı + yetkili kayıtlar, snapshot bütünlüğü.
 *
 * Çalıştır: npx tsx scripts/asama2-dy005/harness.ts [--out <klasör>]
 */
import Module from "node:module";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { Document, Packer } from "docx";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const ROOT = process.cwd();
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg("--out");
if (OUT) mkdirSync(OUT, { recursive: true });
const MIG = "20271120000300_numerology_records_client_link.sql";

let pass = 0;
let fail = 0;
function ok(cond: unknown, msg: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}${detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 500)}`); }
}
const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
async function parse(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const text = xml.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join("")).join("\n");
  const headings = xml.split("</w:p>").filter((x) => /<w:pStyle w:val="Heading1"\/>/.test(x))
    .map((x) => Array.from(x.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join("").trim());
  const tbls = xml.split("<w:tbl>").slice(1);
  const fixed = tbls.filter((t) => /<w:tblLayout w:type="fixed"\/>/.test(t)).length;
  const maxGrid = Math.max(0, ...tbls.map((t) => Array.from((t.split("</w:tblGrid>")[0] ?? "").matchAll(/<w:gridCol w:w="(\d+)"/g)).reduce((s, m) => s + Number(m[1]), 0)));
  return { xml, text, headings, tables: tbls.length, fixed, maxGrid };
}
async function renderDoc(doc: Document, name: string) {
  const buf = await Packer.toBuffer(doc);
  if (OUT) writeFileSync(path.join(OUT, `${name}.docx`), buf);
  return parse(buf);
}
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") { Object.freeze(o); for (const v of Object.values(o as object)) deepFreeze(v); }
  return o;
}

// ── 0) Motor değişmedi ─────────────────────────────────────────────────────────
const ENGINE_PATHS = [
  "lib/numeroloji", "app/numeroloji/utils", "app/numeroloji/helpers", "app/numeroloji/bilgi-bankasi",
  "app/numeroloji/analiz", "app/api/numeroloji/analyses/route.ts", "app/api/numeroloji/word-report",
];
const NAMES = ["Ayşe", "Çiğdem", "Işıl", "Ömer", "Gülşah", "Ümit", "İsmail", "Şule", "Hasan", "Zeynep"];
const SURNAMES = ["Öztürk", "Yılmaz", "Çelik", "Şahin", "Doğan", "Kılıç", "Aydın", "Arıcı"];
function syntheticInputs(n: number) {
  const out: { firstName: string; lastName: string; birthDate: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = 1 + ((i * 7) % 28);
    const m = 1 + ((i * 5) % 12);
    const y = 1940 + ((i * 13) % 80);
    out.push({ firstName: NAMES[i % NAMES.length]!, lastName: SURNAMES[(i * 3) % SURNAMES.length]!, birthDate: `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}` });
  }
  return out;
}

async function engineUnchanged() {
  console.log("\n── 0) Numeroloji motoru DEĞİŞMEDİ (dosya + karşılaştırmalı çıktı)");
  const diff = execFileSync("git", ["diff", "--name-only", "origin/main", "--", ...ENGINE_PATHS], { cwd: ROOT, encoding: "utf8" }).trim();
  ok(diff === "", "motor / hesap / kayıt üretme / Numeroloji Word dosyalarında main'e göre fark YOK", diff);
  const tmp = mkdtempSync(path.join(os.tmpdir(), "num-main-"));
  const tar = execFileSync("git", ["archive", "--format=tar", "origin/main", "lib/numeroloji"], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", tmp.replace(/\\/g, "/")], { input: tar });
  const mainEngine = (await import(pathToFileURL(path.join(tmp, "lib/numeroloji/numerolojiMotor.ts")).href)) as { hesaplaNumeroloji: (i: unknown) => unknown };
  const branchEngine = await import("../../lib/numeroloji/numerolojiMotor");
  const inputs = syntheticInputs(400);
  let same = 0;
  const firstDiff: unknown[] = [];
  for (const inp of inputs) {
    const a = sha(mainEngine.hesaplaNumeroloji(inp));
    const b = sha(branchEngine.hesaplaNumeroloji(inp));
    if (a === b) same++; else if (firstDiff.length < 3) firstDiff.push(inp);
  }
  ok(same === inputs.length, `main motoru ile dal motoru 400/400 girdide BİREBİR aynı çıktı (${same}/400)`, firstDiff);
  return branchEngine.hesaplaNumeroloji;
}

// ── A) Builder ─────────────────────────────────────────────────────────────────
async function builderTests(hesapla: (i: { firstName: string; lastName: string; birthDate: string }) => unknown) {
  console.log("\n── A) SAF builder → gerçek DOCX (snapshot salt-okunur)");
  const B = await import("../../app/api/clients/[id]/word-report/clientReportBuilder");
  const S = await import("../../app/api/clients/[id]/word-report/numerologySavedSection");
  const NW = await import("../../app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild");
  const { NUMEROLOJI_METHODOLOGY_VERSION } = await import("../../lib/numeroloji/methodology");

  // Kayıt anında Numeroloji'nin yaptığı gibi snapshot (test fixture'ı); sonra bilerek değiştirilir.
  const motor = JSON.parse(JSON.stringify(hesapla({ firstName: "Ayşe Gül", lastName: "Öztürk", birthDate: "15.03.1975" }))) as Record<string, Record<string, unknown>>;
  motor.anaKulvar = { ...motor.anaKulvar, display: "SNAP-ANA 44/8" };
  (motor.cakraOmurgasi!.sayilar as Record<string, number>)["7"] = 11;
  const analysis = { version: 1, motor, summary: "ZZ kayıtlı sonuç özeti paragrafı.\n\nİkinci paragraf.", calc: { methodology: NUMEROLOJI_METHODOLOGY_VERSION } };
  const rec = deepFreeze({ id: "r1", name: "Ayşe Gül", surname: "Öztürk", birth_date: "15.03.1975", created_at: "2026-10-01T09:30:00Z", analysis_data: analysis });
  const before = sha(rec);

  type DS = Parameters<typeof B.buildClientFullReport>[0]["data"];
  const DATA = deepFreeze({ client: { id: "c1", ad: "ZZ Ayşe Gül", soyad: "Öztürk", dogum: "1975-03-15" }, notes: null, appointments: [], stones: [], sessions: [], homeworks: [], analyses: [], charges: [] } as unknown as DS);

  const d1 = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null, numerologyRecord: rec }, {}).doc, "dy005-tam");
  ok(d1.headings.some((h) => /Numeroloji — Kayıtlı Analiz$/.test(h)) && !d1.headings.some((h) => /Numeroloji Özeti/.test(h)), "başlık 'Numeroloji — Kayıtlı Analiz' (canlı özet yerine)", d1.headings);
  for (const t of ["Temel Numeroloji Değerleri", "PIN Kodu", "Çakra Omurgası", "Elementler", "Değişim — Dönüşüm", "Zirve Yılları", "Mücadele Yılları", "Harflerin Yankılanışı", "Sonuç Özeti (kayıtlı metin)"]) {
    ok(d1.text.includes(t), `profesyonel bölüm Word'de: ${t}`);
  }
  ok(d1.text.includes("SNAP-ANA 44/8"), "temel değer KAYITLI snapshot'tan (değiştirilmiş değer belgede)");
  ok(d1.text.includes("XXXXXXXXXXX  (11)"), "çakra sütunu snapshot'tan (7. çakra sayı desteği 11)");
  const cakraRows = (d1.text.match(/^\d+\. çakra$/gm) ?? []).length;
  ok(cakraRows >= 10, "Çakra Omurgası 10 satır (10→1)", cakraRows);
  ok(/Sol Destek \(Sayı\)/.test(d1.text) && /Sağ Destek \(Harf\)/.test(d1.text), "çakra sütun başlıkları");
  ok(d1.text.includes("ZZ kayıtlı sonuç özeti paragrafı.") && d1.text.includes("İkinci paragraf."), "kayıtlı Sonuç Özeti metni kesilmeden");
  ok(d1.fixed === d1.tables && d1.maxGrid <= 9638, "tüm tablolar sabit düzen + sayfa genişliğinde", { t: d1.tables, f: d1.fixed, g: d1.maxGrid });
  ok(sha(rec) === before, "girdi kaydı (snapshot) değişmedi");

  // Karşılaştırma: Numeroloji modülünün KENDİ Word'ü (Hesap Özetsiz) ile aynı kayıt
  const nw = NW.buildNumerolojiWordChildren([{ ...rec, name: rec.name, surname: rec.surname } as never], { summary: false, plain: true, detailed: false, zamanlama: false, tas: false }, { knowledgeRows: [], entries: [], sourceLabelById: new Map(), stoneRows: [] });
  const nwDoc = await renderDoc(new Document({ sections: [{ children: nw.children as never }] }), "dy005-numeroloji-modul");
  const harfRe = /(\d+)–(\d+)/g;
  const pick = (s: string, from: string, to: string) => { const a = s.indexOf(from); const b = s.indexOf(to, a + 1); return a < 0 ? "" : s.slice(a, b < 0 ? undefined : b); };
  const harfMine = Array.from(pick(d1.text, "Harflerin Yankılanışı", "Sonuç Özeti").matchAll(harfRe)).map((m) => m[0]);
  const harfMod = Array.from(pick(nwDoc.text, "Harflerin Yankılanışı", "\u0000").matchAll(harfRe)).map((m) => m[0]);
  ok(harfMine.length > 0 && JSON.stringify(harfMine) === JSON.stringify(harfMod), "Harflerin Yankılanışı aralıkları Numeroloji modülü Word'ü ile birebir", { harfMine: harfMine.slice(0, 6), harfMod: harfMod.slice(0, 6) });
  const zMine = Array.from(pick(d1.text, "Zirve Yılları", "Mücadele Yılları").matchAll(/(\d+) yaş/g)).map((m) => m[1]);
  const zMod = Array.from(pick(nwDoc.text, "Zirve Yılları", "Mücadele").matchAll(/(\d+) yaş/g)).map((m) => m[1]);
  ok(zMine.length > 0 && JSON.stringify(zMine) === JSON.stringify(zMod), "Zirve yaşları Numeroloji modülü Word'ü ile birebir", { zMine, zMod });
  const degMine = Array.from(pick(d1.text, "Değişim — Dönüşüm", "Zirve Yılları").matchAll(/(\d)\. Değişim\n(\d{4})/g)).map((m) => `${m[1]}:${m[2]}`);
  const degMod = Array.from(pick(nwDoc.text, "Değişim — Dönüşüm", "Zirve Yılları").matchAll(/(\d)\. Değişim\nYıl: (\d{4})/g)).map((m) => `${m[1]}:${m[2]}`);
  ok(degMine.length > 0 && JSON.stringify(degMine) === JSON.stringify(degMod), "Değişim–Dönüşüm (kayıtlı metinden) Numeroloji modülü Word'ü ile birebir", { degMine, degMod });

  // Kayıtlı metin parse + eksik bölüm uydurulmaz
  const parsed = S.parseSavedDegisim(motor.degisimDonusumMetni as unknown as string);
  ok(!!parsed && parsed.yearOnly.length === 5 && parsed.fullDate.length === 5, "Değişim kayıtlı metni 5+5 dönem okunur", parsed && { y: parsed.yearOnly.length, f: parsed.fullDate.length });
  const stripped = JSON.parse(JSON.stringify(analysis)) as { motor: Record<string, unknown> };
  delete stripped.motor.degisimDonusumMetni; delete stripped.motor.harflerinYankilanisi; delete stripped.motor.cakraOmurgasi;
  const d2 = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null, numerologyRecord: { ...rec, analysis_data: stripped } }, {}).doc, "dy005-eksik-bolum");
  ok(!/Değişim — Dönüşüm|Harflerin Yankılanışı|Çakra Omurgası/.test(d2.text) && d2.text.includes("Zirve Yılları"), "snapshot'ta olmayan bölüm UYDURULMAZ (yeniden hesap yok), diğerleri korunur");

  // Yıl sınırı (Numeroloji Word ile aynı kural) + Gelecek Yıllar yetkisi
  const early = S.buildSavedNumerologySection(rec, "1e40af", { currentYear: 1990 });
  const all = S.buildSavedNumerologySection(rec, "1e40af", { currentYear: 1990, futureYears: true });
  const e = await renderDoc(new Document({ sections: [{ children: early as never }] }), "dy005-1990");
  const a = await renderDoc(new Document({ sections: [{ children: all as never }] }), "dy005-gelecek");
  const rng = (t: string) => (t.match(/\d+–\d+/g) ?? []).length;
  ok(rng(e.text) < rng(a.text) && /gelecekte başlayacak olanlar dâhil/.test(a.text) && !/gelecekte başlayacak olanlar dâhil/.test(e.text),
    "yıl sınırı: başlamamış dönemler gizli, Gelecek Yıllar yetkisiyle görünür", { sinirli: rng(e.text), tum: rng(a.text) });

  // Eski metodoloji + okunamayan snapshot
  const legacy = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null, numerologyRecord: { ...rec, analysis_data: { ...analysis, calc: undefined } } }, {}).doc, "dy005-eski");
  ok(/önceki hesaplama metodolojisiyle/.test(legacy.text) && legacy.text.includes("SNAP-ANA 44/8"), "damgasız kayıt → eski yöntem notu, değerler yine snapshot");
  const bad = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null, numerologyRecord: { ...rec, analysis_data: { version: 1, motor: { anaKulvar: {} }, summary: "ZZ kayıtlı özet" } } }, {}).doc, "dy005-okunamadi");
  ok(/okunamadı; değerler yeniden hesaplanmadı/.test(bad.text) && !/Çakra Omurgası|Ana Kulvar/.test(bad.text) && bad.text.includes("ZZ kayıtlı özet"), "bozuk snapshot → yeniden hesap YOK; yalnız kayıtlı özet metni");
  const none = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null }, {}).doc, "dy005-kayitsiz");
  ok(none.headings.some((h) => /Numeroloji Özeti/.test(h)) && !/SNAP-/.test(none.text), "kayıt seçilmezse mevcut DY-004 özeti aynen");
  return analysis;
}

// ── B) Gerçek route + gerçek PG ─────────────────────────────────────────────────
type J = Record<string, unknown>;
async function routeTests(analysis: unknown) {
  console.log("\n── B) Gerçek route + embedded Postgres + migration (prod'a sıfır temas)");
  const { SERVICE_KEY, ANON_KEY, startDyTestEnv, seedDyUser, seedRichClient } = await import("../wt7/dyTestEnv");
  const env = await startDyTestEnv({ port: 54527, dirName: "asama2-dy005-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  const q = async (sql: string, a: unknown[] = []) => (await su.query(sql, a)).rows;
  try {
    await su.query(`
      do $$ begin
        if not exists (select 1 from pg_constraint where conname='clients_tenant_id_id_key') then
          alter table public.clients add constraint clients_tenant_id_id_key unique (tenant_id, id);
        end if;
      end $$;
      create table if not exists public.numerology_records (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
        name text, surname text, birth_date text, analysis_data jsonb, is_demo_seed boolean default false, created_at timestamptz default now());
      create table if not exists public.human_design_clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, name text, birth_date text, journey_client_id uuid, created_at timestamptz default now());
      create table if not exists public.human_design_reports (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, client_id uuid, chart_id uuid, title text,
        report_kind text, schema_version text, snapshot jsonb, created_at timestamptz default now());
      grant select, insert, update, delete on all tables in schema public to service_role;`);

    const A = await seedDyUser(su, "NA");
    const Bu = await seedDyUser(su, "NB");
    const NOCLI = await seedDyUser(su, "NOCLI");
    const NONUM = await seedDyUser(su, "NONUM");
    const DEMO = await seedDyUser(su, "NDEMO", { demo: true });
    const FUT = await seedDyUser(su, "NFUT");
    await q(`update public.users set module_permissions=$2 where id=$1`, [A.id, JSON.stringify({ clients: true, numerology: true })]);
    await q(`update public.users set module_permissions=$2 where id=$1`, [Bu.id, JSON.stringify({ clients: true, numerology: true })]);
    await q(`update public.users set module_permissions=$2, tenant_id=$3 where id=$1`, [NOCLI.id, JSON.stringify({ numerology: true }), A.tenant]);
    await q(`update public.users set module_permissions=$2, tenant_id=$3 where id=$1`, [NONUM.id, JSON.stringify({ clients: true }), A.tenant]);
    await q(`update public.users set module_permissions=$2, tenant_id=$3 where id=$1`, [DEMO.id, JSON.stringify({ clients: true, numerology: true }), A.tenant]);
    await q(`update public.users set module_permissions=$2, tenant_id=$3 where id=$1`, [FUT.id, JSON.stringify({ clients: true, numerology: true, numerology_future_years: true }), A.tenant]);
    const ca = await seedRichClient(su, A.tenant, 1);
    const ca2 = await seedRichClient(su, A.tenant, 2);
    const cb = await seedRichClient(su, Bu.tenant, 3);
    const ins = async (tenant: string, name: string, surname: string) => (await q(
      `insert into public.numerology_records(tenant_id, name, surname, birth_date, analysis_data) values ($1,$2,$3,'15.03.1990',$4) returning id`,
      [tenant, name, surname, JSON.stringify(analysis)]))[0].id as string;
    // recA ve recSame danışan ca ile AYNI ad/soyada sahip — otomatik eşleşme OLMAMALI.
    const recA = await ins(A.tenant, "ZZ_Ayşe1", "Çiğdem-Işık1");
    const recSame = await ins(A.tenant, "ZZ_Ayşe1", "Çiğdem-Işık1");
    const recB = await ins(Bu.tenant, "ZZ_B", "Kişi");
    const snapHash = async () => (await q(`select md5(string_agg(id::text||coalesce(name,'')||coalesce(surname,'')||coalesce(birth_date,'')||analysis_data::text, '|' order by id)) h from public.numerology_records`))[0].h as string;
    const h0 = await snapHash();

    const link = await import("../../app/api/numeroloji/analyses/[id]/client-link/route");
    const word = await import("../../app/api/clients/[id]/word-report/route");
    const req = (url: string, method: string, u: { id: string; token: string }, body?: unknown) =>
      new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token }, body: body === undefined ? undefined : JSON.stringify(body) });
    const L = async (method: "GET" | "PUT" | "DELETE", u: { id: string; token: string }, rec: string, body?: unknown, qs = "") => {
      const h = method === "GET" ? link.GET : method === "PUT" ? link.PUT : link.DELETE;
      const r = await h(req(`/api/numeroloji/analyses/${rec}/client-link${qs}`, method, u, body), { params: Promise.resolve({ id: rec }) });
      return { status: r.status, json: (await r.json().catch(() => ({}))) as J };
    };
    const W = async (method: "GET" | "POST", u: { id: string; token: string }, client: string, body?: unknown) => {
      const r = await (method === "GET" ? word.GET : word.POST)(req(`/api/clients/${client}/word-report`, method, u, body), { params: Promise.resolve({ id: client }) });
      return r;
    };

    // Migration öncesi: fail-closed, Word çalışmaya devam eder
    let r = await L("GET", A, recA);
    ok(r.status === 503, "migration ÖNCESİ bağ özelliği 503 (fail-closed)", r);
    let wr = await W("GET", A, ca);
    let wj = (await wr.json()) as J;
    ok(wr.status === 200 && (wj.numerology as J)?.savedAnalysisLink === false && ((wj.numerology as J)?.records as unknown[]).length === 0, "migration ÖNCESİ danışan Word seçenekleri çalışır (bağlı liste boş)", wj.numerology);

    const sql = readFileSync(path.join(ROOT, "supabase/migrations", MIG), "utf8");
    await su.query(sql);
    await su.query(sql);
    const cons = await q(`select conname from pg_constraint where conrelid='public.numerology_records'::regclass and conname like 'numerology_records_client%' order by 1`);
    ok(cons.length === 2, "migration iki kez uygulandı (idempotent); CHECK + bileşik FK", cons);
    ok((await q(`select count(*)::int n from public.numerology_records where client_id is not null`))[0].n === 0, "BACKFILL YOK: mevcut kayıtların hepsi bağsız");
    let fkErr = "";
    try { await q(`update public.numerology_records set client_id=$1 where id=$2`, [cb, recA]); } catch (e) { fkErr = String((e as Error).message); }
    ok(/foreign key|violates/i.test(fkErr), "DB seviyesi: başka tenant'ın danışanına bağlamak FK ile imkânsız", fkErr);

    // GET / arama
    r = await L("GET", A, recA);
    ok(r.status === 200 && r.json.link === null && r.json.canLink === true, "GET: bağsız kayıt, bağlanabilir", r.json);
    r = await L("GET", A, recA, undefined, "?search=ZZ_Ay");
    const found = (r.json.rows as { id: string }[] | undefined) ?? [];
    ok(r.status === 200 && found.some((c) => c.id === ca) && !found.some((c) => c.id === cb), "arama: uzmanın yazdığı metin, yalnız kendi tenant'ı", found.length);
    r = await L("GET", NOCLI, recA, undefined, "?search=ZZ");
    ok(r.status === 403, "Danışan Yolculuğu izni yok → danışan araması 403", r.status);
    r = await L("GET", NONUM, recA);
    ok(r.status === 403, "Numeroloji izni yok → 403 (modül kapısı)", r.status);
    r = await L("GET", A, recB);
    ok(r.status === 404, "başka tenant'ın kaydı → 404", r.status);

    // Bağlama
    r = await L("PUT", NOCLI, recA, { clientId: ca });
    ok(r.status === 403, "Danışan Yolculuğu izni yokken bağlama → 403", r.status);
    r = await L("PUT", DEMO, recA, { clientId: ca });
    ok(r.status === 403, "demo hesap bağlayamaz → 403", r.status);
    r = await L("PUT", A, recA, { clientId: cb });
    ok(r.status === 404 && r.json.code === "CLIENT_NOT_FOUND", "yanlış tenant danışanı → 404", r.json);
    r = await L("PUT", A, recB, { clientId: ca });
    ok(r.status === 404, "yanlış tenant kaydı → 404", r.status);
    r = await L("PUT", A, recA, { clientId: "abc" });
    ok(r.status === 400, "geçersiz danışan kimliği → 400", r.status);
    const [x, y] = await Promise.all([L("PUT", A, recA, { clientId: ca }), L("PUT", A, recA, { clientId: ca2 })]);
    ok([x.status, y.status].sort().join(",") === "200,409", "eşzamanlı iki farklı bağlama → tam 1×200 + 1×409", [x.status, y.status]);
    const winner = x.status === 200 ? ca : ca2;
    if (winner !== ca) { await L("DELETE", A, recA, { clientId: ca2 }); await L("PUT", A, recA, { clientId: ca }); }
    r = await L("PUT", A, recA, { clientId: ca });
    ok(r.status === 200, "aynı danışana tekrar bağlama → 200 (değişiklik yok)", r.status);
    r = await L("PUT", A, recA, { clientId: ca2 });
    ok(r.status === 409 && r.json.code === "ALREADY_LINKED", "başka danışana bağlıyken yeniden bağlama → 409", r.json);
    r = await L("GET", A, recA);
    ok(r.status === 200 && (r.json.link as J)?.clientId === ca && ((r.json.link as J)?.client as J)?.ad === "ZZ_Ayşe1", "GET: bağlı danışan adı (izinli)", r.json.link);
    r = await L("GET", NOCLI, recA);
    ok(r.status === 200 && (r.json.link as J)?.client === null && r.json.canLink === false, "Danışan izni yoksa bağlı danışanın adı gösterilmez", r.json);

    // Danışan Word'ü: yalnız bağlı + yetkili kayıtlar; isimle otomatik eşleşme YOK
    wr = await W("GET", A, ca);
    wj = (await wr.json()) as J;
    const recs = ((wj.numerology as J)?.records as { id: string }[]) ?? [];
    ok(wr.status === 200 && recs.length === 1 && recs[0]!.id === recA && !recs.some((z) => z.id === recSame), "Word listesi yalnız BAĞLI kayıt (aynı ad/soyadlı bağsız kayıt listelenmez)", recs);
    wr = await W("GET", NONUM, ca);
    wj = (await wr.json()) as J;
    ok(wr.status === 200 && (wj.numerology as J)?.permitted === false && ((wj.numerology as J)?.records as unknown[]).length === 0, "Numeroloji izni yok → bağlı analizler listelenmez", wj.numerology);
    wr = await W("POST", A, ca, { reportKind: "full", numerologyRecordId: recA });
    let p = await parse(Buffer.from(await wr.arrayBuffer()));
    ok(wr.status === 200 && p.headings.some((h) => /Numeroloji — Kayıtlı Analiz/.test(h)) && ["Çakra Omurgası", "Harflerin Yankılanışı", "Zirve Yılları", "Mücadele Yılları", "Elementler", "PIN Kodu"].every((s) => p.text.includes(s)) && p.text.includes("SNAP-ANA 44/8"),
      "Word: bağlı kayıt tam profesyonel içerikle (snapshot değerleri)", p.headings);
    wr = await W("POST", A, ca, { reportKind: "full", numerologyRecordId: recSame });
    ok(wr.status === 404, "bağsız kayıt (aynı isim) → 404, eklenmez", wr.status);
    wr = await W("POST", A, ca2, { reportKind: "full", numerologyRecordId: recA });
    ok(wr.status === 404, "başka danışana bağlı kayıt bu danışanın Word'üne eklenemez → 404", wr.status);
    wr = await W("POST", NONUM, ca, { reportKind: "full", numerologyRecordId: recA });
    ok(wr.status === 403, "Numeroloji izni yok → kayıt eklenemez 403", wr.status);
    wr = await W("POST", A, ca, { reportKind: "full" });
    p = await parse(Buffer.from(await wr.arrayBuffer()));
    ok(wr.status === 200 && !/SNAP-/.test(p.text), "seçim yapılmadan bağlı kayıt da OTOMATİK eklenmez");
    wr = await W("POST", FUT, ca, { reportKind: "full", numerologyRecordId: recA });
    const pf = await parse(Buffer.from(await wr.arrayBuffer()));
    ok(wr.status === 200 && /gelecekte başlayacak olanlar dâhil/.test(pf.text) && !/gelecekte başlayacak olanlar dâhil/.test((await parse(Buffer.from(await (await W("POST", A, ca, { reportKind: "full", numerologyRecordId: recA })).arrayBuffer()))).text),
      "Gelecek Yıllar yetkisi Numeroloji Word ile aynı kuralla (sunucuda doğrulanır)");

    // Kaldırma
    r = await L("DELETE", A, recA, { clientId: ca2 });
    ok(r.status === 409, "yanlış beklenen danışanla kaldırma → 409 (bağ korunur)", r);
    r = await L("DELETE", NOCLI, recA, { clientId: ca });
    ok(r.status === 403, "izinsiz kaldırma → 403", r.status);
    r = await L("DELETE", A, recA, { clientId: ca });
    ok(r.status === 200, "bağlantı kaldırıldı", r.status);
    ok((await q(`select count(*)::int n from public.numerology_records where id=$1`, [recA]))[0].n === 1, "kaldırma kaydı SİLMEDİ");
    wr = await W("POST", A, ca, { reportKind: "full", numerologyRecordId: recA });
    ok(wr.status === 404, "kaldırılan bağ sonrası Word'e eklenemez", wr.status);

    // Danışan silinince kayıt korunur
    const tmpClient = (await q(`insert into public.clients(tenant_id, ad, soyad) values ($1,'ZZ_Sil','Danışan') returning id`, [A.tenant]))[0].id as string;
    r = await L("PUT", A, recSame, { clientId: tmpClient });
    ok(r.status === 200, "geçici danışana bağlandı", r.status);
    await q(`delete from public.clients where id=$1`, [tmpClient]);
    const after = (await q(`select tenant_id::text t, client_id from public.numerology_records where id=$1`, [recSame]))[0];
    ok(after && after.client_id === null && after.t === A.tenant, "danışan silinince Numeroloji kaydı SİLİNMEZ; yalnız bağ NULL, tenant korunur", after);

    ok((await snapHash()) === h0, "tüm akış boyunca ad/soyad/doğum/analysis_data (snapshot) değişmedi");
  } finally {
    await env.stop();
  }
}

async function main() {
  const hesapla = await engineUnchanged();
  const analysis = await builderTests(hesapla as never);
  await routeTests(analysis);
}

main()
  .catch((e) => { fail++; console.error(e); })
  .finally(() => {
    console.log(`\nAŞAMA 2 / DY-005·006 harness: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  });
