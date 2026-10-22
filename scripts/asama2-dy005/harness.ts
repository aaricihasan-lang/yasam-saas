/**
 * AŞAMA 2 / DY-005 · DY-006 — Kayıtlı Numeroloji analizinin danışan Word raporuna eklenmesi harness'ı.
 *
 * A) SAF builder → GERÇEK DOCX: değerler kaydın SNAPSHOT'ından gelir (motorun bu isim/tarih için
 *    üreteceği değerlerle bilerek ÇELİŞEN sentetik snapshot → belgede snapshot değerleri), eski
 *    metodoloji notu, okunamayan snapshot → yeniden hesap YOK, kayıt verilmezse mevcut DY-004 özeti,
 *    girdi verisi değişmez.
 * B) GERÇEK route + embedded Postgres (PROD'A SIFIR TEMAS; ZZ_ sentetik): GET açık seçim bayrağı,
 *    seçili kayıt → 200, Numeroloji izni yok → 403, başka tenant kaydı → 404, geçersiz id → 400,
 *    bölüm seçili değilse kayıt okunmaz, otomatik eşleştirme yok, DB değişmez.
 *
 * Çalıştır: npx tsx scripts/asama2-dy005/harness.ts [--out <klasör>]
 */
import Module from "node:module";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { Packer, type Document } from "docx";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg("--out");
if (OUT) mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: unknown, msg: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}${detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 400)}`); }
}
const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
async function parse(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const text = xml.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join("")).join("\n");
  const headings = xml.split("</w:p>").filter((x) => /<w:pStyle w:val="Heading1"\/>/.test(x))
    .map((x) => Array.from(x.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join("").trim());
  return { xml, text, headings };
}
async function render(doc: Document, name: string) {
  const buf = await Packer.toBuffer(doc);
  if (OUT) writeFileSync(path.join(OUT, `${name}.docx`), buf);
  return parse(buf);
}
function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") { Object.freeze(o); for (const v of Object.values(o as object)) deepFreeze(v); }
  return o;
}

/** Bilerek "motor dışı" değerler: motor bu isim/tarih için asla bu metinleri üretmez. */
const SNAP = (methodology: string | null) => ({
  version: 1,
  motor: {
    anaKulvar: { display: "SNAP-ANA 44/8" },
    yanKulvar: { display: "SNAP-YAN 13/4" },
    ifadeSayisi: { display: "SNAP-IFADE 7" },
    hayatYolu: { display: "SNAP-HY 29/11" },
    pinKodu: { k1: 1, k2: 2, k3: 3, k4: 4, k5: 5, k6: 6, k7: 7, k8: 8, k9: 9 },
  },
  summary: "ZZ özet",
  ...(methodology ? { calc: { methodology } } : {}),
});

async function main() {
  const B = await import("../../app/api/clients/[id]/word-report/clientReportBuilder");
  const { NUMEROLOJI_METHODOLOGY_VERSION } = await import("../../lib/numeroloji/methodology");
  type DS = Parameters<typeof B.buildClientFullReport>[0]["data"];
  const DATA: DS = deepFreeze({
    client: { id: "c1", ad: "ZZ Ayşe", soyad: "Çiğdem", dogum: "1990-03-15" },
    notes: null, appointments: [], stones: [], sessions: [], homeworks: [], analyses: [], charges: [],
  } as unknown as DS);
  const before = JSON.stringify(DATA);

  console.log("\n── A) SAF builder → gerçek DOCX");
  const rec = deepFreeze({ id: "r1", name: "ZZ Ayşe", surname: "Çiğdem", birth_date: "1990-03-15", created_at: "2026-10-01T09:30:00Z", analysis_data: SNAP(NUMEROLOJI_METHODOLOGY_VERSION) });
  const d1 = await render(B.buildClientFullReport({ data: DATA, profileImg: null, numerologyRecord: rec }, {}).doc, "dy005-kayitli");
  ok(d1.headings.some((h) => /Numeroloji — Kayıtlı Analiz$/.test(h)) && !d1.headings.some((h) => /Numeroloji Özeti/.test(h)), "kayıt seçilince başlık 'Numeroloji — Kayıtlı Analiz' (canlı özet yok)", d1.headings);
  ok(["SNAP-ANA 44/8", "SNAP-YAN 13/4", "SNAP-IFADE 7", "SNAP-HY 29/11"].every((v) => d1.text.includes(v)), "değerler KAYITLI snapshot'tan (motor yeniden hesaplamadı)");
  ok(d1.text.includes("[1] [2] [3] [4] | [5] [6] [7] | [8] [9]"), "PIN kodu snapshot'tan");
  ok(/Analizdeki Ad Soyad/.test(d1.text) && d1.text.includes("ZZ Ayşe Çiğdem") && /Analizdeki Doğum Tarihi/.test(d1.text) && /15 Mart 1990/.test(d1.text), "kaydın kendi adı + doğum tarihi açıkça yazılır (Türkçe)");
  ok(/uzman tarafından seçilmiştir/.test(d1.text) && /kayıt: 01\.10\.2026/.test(d1.text), "kaynak notu + kayıt tarihi", d1.text.match(/kayıt:[^)]*/)?.[0]);
  ok(!/önceki hesaplama metodolojisi/.test(d1.text), "güncel metodoloji damgası → eski yöntem notu yok");
  ok(!/Element Dağılımı|Zirve Yılları|Kişisel Yıl/.test(d1.text), "canlı hesaplanan tablolar (element/zirve/kişisel yıl) eklenmez");

  const d2 = await render(B.buildClientFullReport({ data: DATA, profileImg: null, numerologyRecord: { ...rec, analysis_data: SNAP(null) } }, {}).doc, "dy005-eski-yontem");
  ok(/önceki hesaplama metodolojisiyle/.test(d2.text) && d2.text.includes("SNAP-ANA 44/8"), "damgasız (eski) kayıt → eski yöntem notu, değerler yine snapshot");

  const d3 = await render(B.buildClientFullReport({ data: DATA, profileImg: null, numerologyRecord: { ...rec, analysis_data: { version: 1, motor: { anaKulvar: {} } } } }, {}).doc, "dy005-okunamadi");
  ok(/okunamadı; değerler yeniden hesaplanmadı/.test(d3.text) && !/Hayat Yolu|Ana Kulvar/.test(d3.text), "bozuk snapshot → yalnız 'okunamadı' notu, yeniden hesap YOK");

  const d4 = await render(B.buildClientFullReport({ data: DATA, profileImg: null }, {}).doc, "dy005-kayitsiz");
  ok(d4.headings.some((h) => /Numeroloji Özeti/.test(h)) && !/SNAP-/.test(d4.text), "kayıt verilmezse mevcut DY-004 özeti aynen");

  const d5 = await render(B.buildClientFullReport({ data: DATA, profileImg: null, numerologyRecord: rec }, { sections: ["notlar"], variant: "custom" }).doc, "dy005-bolum-secili-degil");
  ok(!/Numeroloji/.test(d5.text), "Özel Raporda Numeroloji seçili değilse kayıt eklenmez");
  ok(JSON.stringify(DATA) === before, "girdi verisi değişmedi");

  await routeTests();
}

type Opt = { numerology?: { savedAnalysisLink?: boolean; explicitSelection?: boolean } };

async function routeTests() {
  console.log("\n── B) Gerçek route + embedded Postgres (prod'a sıfır temas)");
  const { SERVICE_KEY, ANON_KEY, startDyTestEnv, seedDyUser, seedRichClient } = await import("../wt7/dyTestEnv");
  const env = await startDyTestEnv({ port: 54527, dirName: "asama2-dy005-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    // numerology_records — üretimdeki sütunların bu akışta okunanları (client_id YOK, prod ile aynı).
    await su.query(`
      create table if not exists public.numerology_records (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
        name text, surname text, birth_date text, analysis_data jsonb, is_demo_seed boolean default false, created_at timestamptz default now());
      create table if not exists public.human_design_clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, name text, birth_date text, journey_client_id uuid, created_at timestamptz default now());
      create table if not exists public.human_design_reports (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, client_id uuid, chart_id uuid, title text,
        report_kind text, schema_version text, snapshot jsonb, created_at timestamptz default now());
      grant select, insert, update, delete on all tables in schema public to service_role;`);
    const A = await seedDyUser(su, "NA");
    const Bu = await seedDyUser(su, "NB");
    const NONUM = await seedDyUser(su, "NONUM");
    await su.query(`update public.users set module_permissions=$2 where id=$1`, [A.id, JSON.stringify({ clients: true, numerology: true })]);
    await su.query(`update public.users set module_permissions=$2, tenant_id=$3 where id=$1`, [NONUM.id, JSON.stringify({ clients: true }), A.tenant]);
    const ca = await seedRichClient(su, A.tenant, 1);
    const ins = async (tenant: string, name: string) => (await su.query(
      `insert into public.numerology_records(tenant_id, name, surname, birth_date, analysis_data) values ($1,$2,'Çiğdem-Işık1','1990-03-15',$3) returning id`,
      [tenant, name, JSON.stringify(SNAP("x"))])).rows[0].id as string;
    const recA = await ins(A.tenant, "ZZ_Ayşe1");
    const recB = await ins(Bu.tenant, "ZZ_Ayşe1");

    const route = await import("../../app/api/clients/[id]/word-report/route");
    const req = (method: string, u: { id: string; token: string }, body?: unknown) =>
      new NextRequest(`http://localhost/api/clients/${ca}/word-report`, { method, headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token }, body: body === undefined ? undefined : JSON.stringify(body) });
    const ctx = { params: Promise.resolve({ id: ca }) };
    const dbHash = async () => (await su.query(`select md5(string_agg(row_to_json(x)::text, '|' order by x.id)) h from public.numerology_records x`)).rows[0].h as string;
    const h0 = await dbHash();

    let r = await route.GET(req("GET", A), ctx);
    let j = (await r.json()) as Opt;
    ok(r.status === 200 && j.numerology?.savedAnalysisLink === false && j.numerology?.explicitSelection === true, "GET: otomatik bağ yok + açık seçim mümkün (Numeroloji izni var)", j.numerology);
    r = await route.GET(req("GET", NONUM), ctx);
    j = (await r.json()) as Opt;
    ok(r.status === 200 && j.numerology?.explicitSelection === false, "GET: Numeroloji izni yoksa açık seçim kapalı", j.numerology);

    r = await route.POST(req("POST", A, { reportKind: "full" }), ctx);
    let p = await parse(Buffer.from(await r.arrayBuffer()));
    ok(r.status === 200 && p.headings.some((h) => /Numeroloji Özeti/.test(h)) && !/SNAP-/.test(p.text),
      "kayıt seçilmeden: isim/doğum tarihi aynı kayıt olsa bile OTOMATİK eklenmez (mevcut özet)", p.headings);

    r = await route.POST(req("POST", A, { reportKind: "full", numerologyRecordId: recA }), ctx);
    p = await parse(Buffer.from(await r.arrayBuffer()));
    ok(r.status === 200 && p.headings.some((h) => /Numeroloji — Kayıtlı Analiz/.test(h)) && p.text.includes("SNAP-ANA 44/8") && /önceki hesaplama metodolojisiyle/.test(p.text),
      "seçili kayıt → 200, snapshot değerleri + eski yöntem notu", p.headings);

    r = await route.POST(req("POST", NONUM, { reportKind: "full", numerologyRecordId: recA }), ctx);
    ok(r.status === 403, "Numeroloji izni olmayan uzman kayıt ekleyemez → 403", r.status);
    r = await route.POST(req("POST", A, { reportKind: "full", numerologyRecordId: recB }), ctx);
    ok(r.status === 404, "başka tenant'ın kaydı → 404", r.status);
    r = await route.POST(req("POST", A, { reportKind: "full", numerologyRecordId: "00000000-0000-4000-8000-000000000000" }), ctx);
    ok(r.status === 404, "olmayan kayıt → 404", r.status);
    r = await route.POST(req("POST", A, { reportKind: "full", numerologyRecordId: "abc" }), ctx);
    ok(r.status === 400, "geçersiz id → 400", r.status);
    r = await route.POST(req("POST", A, { reportKind: "custom", sections: ["notlar"], numerologyRecordId: recB }), ctx);
    p = await parse(Buffer.from(await r.arrayBuffer()));
    ok(r.status === 200 && !/Numeroloji/.test(p.text), "Numeroloji bölümü seçili değilse kayıt OKUNMAZ ve eklenmez", r.status);
    ok((await dbHash()) === h0, "rapor üretimi numerology_records'u değiştirmedi");
  } finally {
    await env.stop();
  }
}

main()
  .catch((e) => { fail++; console.error(e); })
  .finally(() => {
    console.log(`\nAŞAMA 2 / DY-005·006 harness: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  });
