/**
 * AŞAMA 2 / BUG-005 — Danışan Word'ünde Anamnez ve Beslenme özeti (owner kararı A) harness'ı.
 *
 * A) SAF builder → GERÇEK DOCX: tamamlanmış anamnez yalnız yanıtlanmış alanlarla (Türkçe etiket/değer;
 *    seçenek, evet/hayır+ayrıntı, tablo satırları), taslak form → bölüm yok; Beslenme profil · alerji ·
 *    son 10 ölçüm; veri yoksa bölüm uydurulmaz; seçilmezse (Tam Rapor dahil) bölüm yok; tablolar sabit.
 * B) GERÇEK route + embedded Postgres (PROD'A SIFIR TEMAS; ZZ_ sentetik): açık rıza yoksa 409, rıza
 *    geri alınınca yine 409, yalnız tamamlanmış form, başka danışanın/tenant'ın formu reddi, Danışan
 *    Yolculuğu izni olmayan 403, Tam Rapor'da otomatik eklenmeme, rapor üretiminin DB'yi değiştirmemesi.
 *
 * Çalıştır: npx tsx scripts/asama2-bug005/harness.ts [--out <klasör>]
 */
import Module from "node:module";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
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

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg("--out");
if (OUT) mkdirSync(OUT, { recursive: true });

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
  return { text, headings, tables: tbls.length, fixed, maxGrid };
}
async function renderDoc(doc: Document, name: string) {
  const buf = await Packer.toBuffer(doc);
  if (OUT) writeFileSync(path.join(OUT, `${name}.docx`), buf);
  return parse(buf);
}

const ANSWERS = {
  "A.reason": "ZZ Uyku düzensizliği ve yorgunluk — çğıöşü",
  "A.expectation": "",
  "A.duration": "m6_12",
  "B.height_cm": 168.5,
  "B.conditions": { v: true, d: "ZZ Tiroid takibi" },
  "B.surgeries": [{ what: "ZZ Apandisit", year: "2010" }],
};
const anamnezRow = (status: string) => ({
  id: "an-1", kind: "initial", title: "ZZ İlk görüşme formu", assessment_date: "2026-09-10", status,
  template_version: "std-v1", form_custom: null, answers: ANSWERS, completed_at: "2026-09-10T10:00:00Z",
});
const MEAS = Array.from({ length: 12 }, (_, i) => ({
  measured_at: `2026-${String(1 + (i % 9)).padStart(2, "0")}-${String(10 + i).padStart(2, "0")}`,
  weight_kg: 70 + i / 2, height_cm: 168, waist_cm: i % 2 ? 80 : null, hip_cm: null, note: i === 0 ? "ZZ sabah ölçümü" : null,
}));

async function builderTests() {
  console.log("\n── A) SAF builder → gerçek DOCX");
  const B = await import("../../app/api/clients/[id]/word-report/clientReportBuilder");
  type DS = Parameters<typeof B.buildClientFullReport>[0]["data"];
  const DATA = { client: { id: "c1", ad: "ZZ Ayşe", soyad: "Çiğdem", dogum: "1990-03-15" }, notes: { notlar: "ZZ not" }, appointments: [], stones: [], sessions: [], homeworks: [], analyses: [], charges: [] } as unknown as DS;
  const beslenme = {
    profile: { goal_type: "weight_loss", activity_level: "moderate", daily_meal_count: 3, target_weight_kg: 65, water_note: "ZZ günde 2 litre", goal_note: null },
    allergens: [{ name: "Fıstık", note: "ZZ şiddetli" }, { name: "ZZ Çilek", note: null }],
    measurements: MEAS.slice(0, 10), measurementTotal: 12,
  };

  const d0 = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null }, {}).doc, "bug005-varsayilan");
  ok(!d0.headings.some((h) => /Anamnez|Beslenme/.test(h)), "seçilmediğinde (Tam Rapor) Anamnez / Beslenme bölümü YOK", d0.headings);

  const d1 = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null, anamnez: anamnezRow("completed") as never, beslenme }, {}).doc, "bug005-secili");
  ok(d1.headings.some((h) => /\d+\. Anamnez$/.test(h)) && d1.headings.some((h) => /\d+\. Beslenme Özeti$/.test(h)), "açık seçimle iki ayrı bölüm", d1.headings);
  ok(d1.text.includes("A. Görüşme ve Başvuru") && d1.text.includes("Başvuru nedeni") && d1.text.includes("ZZ Uyku düzensizliği ve yorgunluk — çğıöşü"), "anamnez: Türkçe bölüm/etiket/yanıt");
  ok(d1.text.includes("6–12 ay"), "anamnez: seçenek etiketi (kod değil)");
  ok(/Evet — ZZ Tiroid takibi/.test(d1.text), "anamnez: evet/hayır + ayrıntı");
  ok(d1.text.includes("ZZ Apandisit"), "anamnez: tablo satırı yanıtı");
  ok(/168,5|168\.5/.test(d1.text), "anamnez: sayı + birim");
  ok(!d1.text.includes("Temel beklenti"), "anamnez: boş yanıtlı alan rapora girmez");
  ok(/açık rıza kaydı mevcuttur/.test(d1.text), "anamnez: kaynak + rıza notu");
  ok(d1.text.includes("Beslenme Profili") && d1.text.includes("Kilo Verme") && d1.text.includes("Orta Hareketli") && d1.text.includes("ZZ günde 2 litre"), "beslenme: profil (Türkçe etiketler)");
  ok(d1.text.includes("Beyan Edilen Alerjiler") && d1.text.includes("Fıstık") && d1.text.includes("ZZ şiddetli"), "beslenme: alerjiler + not");
  ok(d1.text.includes("Ölçüm Özeti") && /Son 10 ölçüm gösterilmiştir \(toplam 12\)/.test(d1.text) && d1.text.includes("ZZ sabah ölçümü"), "beslenme: son 10 ölçüm + toplam");
  ok(!/Beslenme Planı\n|Öğün Planı|Kalori|Menü/.test(d1.text) && /planın kendi Word raporu ayrıca/.test(d1.text), "beslenme: plan içeriği eklenmez (plan Word'ü ayrı)");
  ok(d1.fixed === d1.tables && d1.maxGrid <= 9638, "tablolar sabit düzen + sayfa genişliği", { t: d1.tables, f: d1.fixed, g: d1.maxGrid });

  const d2 = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null, anamnez: anamnezRow("draft") as never, beslenme: { profile: null, allergens: [], measurements: [], measurementTotal: 0 } }, {}).doc, "bug005-taslak-bos");
  ok(!d2.headings.some((h) => /Anamnez|Beslenme/.test(h)), "taslak form ve boş Beslenme → bölüm UYDURULMAZ", d2.headings);

  // E2E'de yakalanan gerçek durum: DB varsayılanı form_custom = '{}' (kısmi nesne) → çökmemeli.
  const dPartial = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null, anamnez: { ...anamnezRow("completed"), form_custom: {} } as never }, {}).doc, "bug005-form-custom-bos");
  ok(dPartial.text.includes("ZZ Uyku düzensizliği") && dPartial.text.includes("6–12 ay"), "form_custom = {} (DB varsayılanı) → normalize edilir, yanıtlar aktarılır");
  const dBad = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null, anamnez: { ...anamnezRow("completed"), form_custom: { hidden: "x" } } as never }, {}).doc, "bug005-form-custom-bozuk");
  ok(/yapısı okunamadı/.test(dBad.text) && !dBad.text.includes("ZZ Uyku düzensizliği"), "bozuk form_custom → içerik aktarılmaz, açık not");

  const d3 = await renderDoc(B.buildClientFullReport({ data: DATA, profileImg: null, anamnez: { ...anamnezRow("completed"), answers: {} } as never }, {}).doc, "bug005-yanitsiz");
  ok(/yanıtlanmış alan bulunmuyor/.test(d3.text), "yanıtsız tamamlanmış form → açık not (içerik uydurulmaz)");
}

type J = Record<string, unknown>;
async function routeTests() {
  console.log("\n── B) Gerçek route + embedded Postgres (prod'a sıfır temas)");
  const { SERVICE_KEY, ANON_KEY, startDyTestEnv, seedDyUser, seedRichClient } = await import("../wt7/dyTestEnv");
  const env = await startDyTestEnv({ port: 54529, dirName: "asama2-bug005-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  const q = async (sql: string, a: unknown[] = []) => (await su.query(sql, a)).rows;
  try {
    // Üretimdeki tabloların bu akışta okunan kolonları (sentetik test şeması).
    await su.query(`
      create table if not exists public.client_anamneses (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null,
        kind text not null default 'initial', title text, assessment_date text, status text not null, template_version text not null default 'std-v1',
        form_custom jsonb, answers jsonb, completed_at timestamptz, created_at timestamptz default now());
      create table if not exists public.client_consents (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null,
        consent_type text not null, status text not null, recorded_at timestamptz not null default now());
      create table if not exists public.nutrition_allergens (id uuid primary key default gen_random_uuid(), code text, name_tr text, name_en text);
      create table if not exists public.nutrition_client_profiles (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null,
        goal_type text, goal_note text, activity_level text, dietary_pattern text, daily_meal_count int, target_weight_kg numeric, water_note text,
        lifestyle_note text, general_note text);
      create table if not exists public.nutrition_client_allergens (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null,
        allergen_id uuid, custom_label text, note text);
      create table if not exists public.nutrition_client_measurements (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null,
        measured_at text, weight_kg numeric, height_cm numeric, waist_cm numeric, hip_cm numeric, note text);
      create table if not exists public.numerology_records (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text, surname text, birth_date text, analysis_data jsonb, created_at timestamptz default now());
      create table if not exists public.human_design_clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, name text, birth_date text, journey_client_id uuid, created_at timestamptz default now());
      create table if not exists public.human_design_reports (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, client_id uuid, chart_id uuid, title text,
        report_kind text, schema_version text, snapshot jsonb, created_at timestamptz default now());
      grant select, insert, update, delete on all tables in schema public to service_role;`);
    const A = await seedDyUser(su, "BA");
    const Bu = await seedDyUser(su, "BB");
    const NOC = await seedDyUser(su, "BNOC");
    await q(`update public.users set module_permissions=$2, tenant_id=$3 where id=$1`, [NOC.id, JSON.stringify({ numerology: true }), A.tenant]);
    const ca = await seedRichClient(su, A.tenant, 1);
    const ca2 = await seedRichClient(su, A.tenant, 2);
    const cb = await seedRichClient(su, Bu.tenant, 3);
    const insAn = async (tenant: string, client: string, status: string, completedAt: string | null) => (await q(
      `insert into public.client_anamneses(tenant_id, client_id, title, assessment_date, status, answers, completed_at) values ($1,$2,$3,'2026-09-10',$4,$5,$6) returning id`,
      [tenant, client, `ZZ form ${status}`, status, JSON.stringify(ANSWERS), completedAt]))[0].id as string;
    const anOld = await insAn(A.tenant, ca, "completed", "2026-08-01T10:00:00Z");
    const anNew = await insAn(A.tenant, ca, "completed", "2026-09-10T10:00:00Z");
    const anDraft = await insAn(A.tenant, ca, "draft", null);
    const anOther = await insAn(A.tenant, ca2, "completed", "2026-09-10T10:00:00Z");
    const peanut = (await q(`insert into public.nutrition_allergens(code, name_tr, name_en) values ('peanut','Fıstık','Peanut') returning id`))[0].id as string;
    await q(`insert into public.nutrition_client_profiles(tenant_id, client_id, goal_type, activity_level, water_note) values ($1,$2,'maintenance','light','ZZ su notu')`, [A.tenant, ca]);
    await q(`insert into public.nutrition_client_allergens(tenant_id, client_id, allergen_id, note) values ($1,$2,$3,'ZZ alerji notu')`, [A.tenant, ca, peanut]);
    await q(`insert into public.nutrition_client_allergens(tenant_id, client_id, custom_label) values ($1,$2,'ZZ Kivi')`, [A.tenant, ca]);
    for (const m of MEAS) await q(`insert into public.nutrition_client_measurements(tenant_id, client_id, measured_at, weight_kg, height_cm) values ($1,$2,$3,$4,$5)`, [A.tenant, ca, m.measured_at, m.weight_kg, m.height_cm]);
    await q(`insert into public.nutrition_client_profiles(tenant_id, client_id, goal_type, water_note) values ($1,$2,'other','ZZ_BASKA_TENANT_PROFIL')`, [Bu.tenant, cb]);

    const dbHash = async () => (await q(`select md5(string_agg(t, '|' order by t)) h from (
      select 'a'||row_to_json(x)::text t from public.client_anamneses x union all select 'c'||row_to_json(x)::text from public.client_consents x
      union all select 'p'||row_to_json(x)::text from public.nutrition_client_profiles x union all select 'l'||row_to_json(x)::text from public.nutrition_client_allergens x
      union all select 'm'||row_to_json(x)::text from public.nutrition_client_measurements x) s`))[0].h as string;

    const word = await import("../../app/api/clients/[id]/word-report/route");
    const req = (client: string, method: string, u: { id: string; token: string }, body?: unknown) =>
      new NextRequest(`http://localhost/api/clients/${client}/word-report`, { method, headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token }, body: body === undefined ? undefined : JSON.stringify(body) });
    const W = (method: "GET" | "POST", u: { id: string; token: string }, client: string, body?: unknown) =>
      (method === "GET" ? word.GET : word.POST)(req(client, method, u, body), { params: Promise.resolve({ id: client }) });
    const docOf = async (r: Response) => parse(Buffer.from(await r.arrayBuffer()));

    let r = await W("GET", A, ca);
    let j = (await r.json()) as J;
    const an = j.anamnez as { consent: boolean | null; completed: { id: string }[] };
    ok(r.status === 200 && an.completed.length === 2 && an.completed[0]!.id === anNew && !an.completed.some((x) => x.id === anDraft) && an.consent === false && (j.beslenme as J)?.hasData === true,
      "GET: yalnız tamamlanmış formlar (en yeni önce), rıza yok, Beslenme verisi var", { an, b: j.beslenme });

    const h0 = await dbHash();
    r = await W("POST", A, ca, { reportKind: "full", includeAnamnez: true });
    j = (await r.json()) as J;
    ok(r.status === 409 && /açık rıza kaydı bulunmuyor/.test(String(j.error)), "açık rıza YOK → 409 (anamnez eklenmez)", j);
    await q(`insert into public.client_consents(tenant_id, client_id, consent_type, status, recorded_at) values ($1,$2,'acik_riza_ozel_nitelikli','granted','2026-09-01T00:00:00Z')`, [A.tenant, ca]);
    const h1 = await dbHash();

    r = await W("POST", A, ca, { reportKind: "full" });
    let d = await docOf(r);
    ok(r.status === 200 && !d.headings.some((h) => /Anamnez|Beslenme/.test(h)), "Tam Rapor: rıza + veri olsa da Anamnez / Beslenme OTOMATİK eklenmez", d.headings);
    r = await W("POST", A, ca, { reportKind: "full", includeAnamnez: true, includeBeslenme: true });
    d = await docOf(r);
    ok(r.status === 200 && d.headings.some((h) => /Anamnez$/.test(h)) && d.headings.some((h) => /Beslenme Özeti$/.test(h)), "açık seçim + rıza → iki bölüm", d.headings);
    ok(d.text.includes("ZZ form completed") && d.text.includes("ZZ Uyku düzensizliği"), "varsayılan: en yeni tamamlanmış form");
    ok(d.text.includes("Fıstık") && d.text.includes("ZZ Kivi") && d.text.includes("ZZ alerji notu") && d.text.includes("Koruma / Denge") && /toplam 12/.test(d.text), "Beslenme: profil + alerji (katalog adı + özel) + ölçüm özeti");
    ok(!d.text.includes("ZZ_BASKA_TENANT_PROFIL"), "başka tenant'ın Beslenme verisi sızmaz");
    r = await W("POST", A, ca, { reportKind: "custom", sections: ["notlar"], includeAnamnez: true, anamnezId: anOld });
    d = await docOf(r);
    ok(r.status === 200 && d.headings.some((h) => /Anamnez$/.test(h)) && !d.headings.some((h) => /Beslenme/.test(h)), "Özel Rapor: yalnız işaretlenen hassas bölüm (seçilen form)", d.headings);
    r = await W("POST", A, ca, { reportKind: "full", includeAnamnez: true, anamnezId: anDraft });
    ok(r.status === 404, "taslak form id → 404 (yalnız tamamlanmış)", r.status);
    r = await W("POST", A, ca, { reportKind: "full", includeAnamnez: true, anamnezId: anOther });
    ok(r.status === 404, "başka danışanın formu → 404", r.status);
    r = await W("POST", A, ca, { reportKind: "full", includeAnamnez: true, anamnezId: "abc" });
    ok(r.status === 400, "geçersiz form id → 400", r.status);
    r = await W("POST", A, ca, { reportKind: "full", includeAnamnez: "true", includeBeslenme: 1 });
    d = await docOf(r);
    ok(r.status === 200 && !d.headings.some((h) => /Anamnez|Beslenme/.test(h)), "yalnız boolean true kabul edilir ('true' / 1 → eklenmez)");
    r = await W("POST", A, cb, { reportKind: "full", includeBeslenme: true });
    ok(r.status === 404, "başka tenant'ın danışanı → 404", r.status);
    r = await W("POST", NOC, ca, { reportKind: "full", includeAnamnez: true, includeBeslenme: true });
    ok(r.status === 403, "Danışan Yolculuğu izni olmayan kullanıcı → 403", r.status);
    r = await W("POST", A, ca2, { reportKind: "full", includeAnamnez: true });
    ok(r.status === 409, "rızası olmayan diğer danışan → 409 (rıza danışana özgü)", r.status);

    await q(`insert into public.client_consents(tenant_id, client_id, consent_type, status, recorded_at) values ($1,$2,'acik_riza_ozel_nitelikli','withdrawn','2026-10-01T00:00:00Z')`, [A.tenant, ca]);
    r = await W("POST", A, ca, { reportKind: "full", includeAnamnez: true });
    ok(r.status === 409, "rıza GERİ ALINDI (son kayıt withdrawn) → 409", r.status);
    await q(`delete from public.client_consents where status='withdrawn'`);
    ok((await dbHash()) === h1 && h0 !== h1, "rapor üretimi anamnez / rıza / beslenme verisini değiştirmedi");
  } finally {
    await env.stop();
  }
}

async function main() {
  await builderTests();
  await routeTests();
}

main()
  .catch((e) => { fail++; console.error(e); })
  .finally(() => {
    console.log(`\nAŞAMA 2 / BUG-005 harness: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  });
