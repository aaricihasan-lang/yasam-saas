/**
 * HD satış öncesi — KAYIT · ANALİZ · WORD · DANIŞAN YOLCULUĞU uçtan uca harness'i.
 *
 * Çalıştırma: npm run hd:analysis-flow:harness
 *
 * Ortam: geçici embedded-postgres + PostgREST shim + Storage emülatörü (scripts/anamnez/testEnv —
 * yalnız 127.0.0.1, PRODUCTION'A SIFIR TEMAS). GERÇEK route handler'ları çağrılır:
 *   journey (yeni / mevcut danışan) → charts/roxy (hesap + otomatik kayıt) → charts (liste/detay)
 *   → reports?brief (hazır Word) → reports/professional (Word v2 oluştur) → download (DOCX) → DY özeti.
 * RoxyAPI: gerçek anahtar KULLANILMAZ (ROXY_API_KEY sahte değerle ezilir); bodygraph çağrısı
 * fixture ile yanıtlanır ve SAYILIR; başka her dış istek reddedilir.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import Module from "node:module";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { NextRequest } from "next/server";
import JSZip from "jszip";
import { SERVICE_KEY, ANON_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";

const ROOT = process.cwd();
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
// Gerçek (ücretli) anahtar bu süreçte ASLA kullanılmaz.
process.env.ROXY_API_KEY = "zz-harness-fake-roxy-key";
delete process.env.ROXY_API_BASE_URL;

const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const FIXTURE = src("scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json");
const JOURNEY_MIGRATION = src("supabase/migrations/20271010000100_hd_client_journey_link.sql");
const HD_BUCKET = "hd-chart-images";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string, detail?: unknown) {
  if (cond) passed++;
  else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name, detail !== undefined ? JSON.stringify(detail).slice(0, 500) : "");
  }
}
const section = (s: string) => console.log(`\n[${s}]`);

// Eski veri (migration/uygulama değişikliği ÖNCESİ yazılmış gibi) — birebir korunmalı.
const TA = "0a0a0a0a-0000-4000-8000-00000000000a";
const TB = "0b0b0b0b-0000-4000-8000-00000000000b";
const LEGACY_CLIENT = "0a0a0a0a-0000-4000-8000-0000000000c1";
const LEGACY_MANUAL_CHART = "0a0a0a0a-0000-4000-8000-0000000000d1";
const LEGACY_REPORT = "0a0a0a0a-0000-4000-8000-0000000000e1";
const LEGACY_V1_REPORT = "0a0a0a0a-0000-4000-8000-0000000000e2";

const HD_DDL = `
create table public.human_design_clients (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, name text not null,
  birth_date date, birth_time text, birth_place text, chart_image_url text, external_chart_url text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  birth_location_id text, birth_location_label text, birth_timezone text, birth_latitude double precision, birth_longitude double precision
);
create table public.human_design_charts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid,
  client_id uuid references public.human_design_clients(id) on delete set null, client_name text,
  birth_date date, birth_time text, birth_place text, external_chart_url text, chart_image_url text,
  type_code text, authority_code text, profile_code text, definition_code text,
  active_centers jsonb not null default '[]', open_centers jsonb not null default '[]', gates jsonb not null default '[]', channels jsonb not null default '[]',
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  timezone text, source text default 'manual', input jsonb, computed_result jsonb, engine_version text, contract_version text,
  location_id text, provider text, provider_raw jsonb, input_hash text
);
create unique index hd_charts_tenant_input_hash_uidx on public.human_design_charts (tenant_id, input_hash) where input_hash is not null;
create table public.human_design_reports (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid,
  client_id uuid references public.human_design_clients(id) on delete set null,
  chart_id uuid references public.human_design_charts(id) on delete set null,
  title text not null default '', selected_codes text[] not null default '{}', generated_content text, edited_content text,
  report_file_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  report_kind text, snapshot jsonb, canonical_provenance jsonb, report_version int, schema_version text
);
create table public.human_design_knowledge_records (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, category text, title text, code text, content text,
  keywords jsonb default '[]', related_gates jsonb default '[]', related_channels jsonb default '[]', related_centers jsonb default '[]', tags jsonb default '[]',
  sort_order int default 0, is_active boolean default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  expert_notes text, origin_type text, origin_label text, origin_source_id uuid, origin_transfer_batch_id uuid, transferred_at timestamptz
);
-- "Kayıt başarısız" simülasyonu: bu isimli danışanın hesaplanmış haritası yazılamaz.
create function public.zz_fail_chart_insert() returns trigger language plpgsql as $$
begin
  if new.client_name = 'ZZ Kayıt Hatası' and new.source = 'computed' then
    raise exception 'zz simulated insert failure';
  end if;
  return new;
end $$;
create trigger zz_fail_chart_insert before insert on public.human_design_charts for each row execute function public.zz_fail_chart_insert();
insert into public.tenants(id, name) values ('${TA}', 'ZZ_FLOW_A'), ('${TB}', 'ZZ_FLOW_B');
insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ('${LEGACY_CLIENT}', '${TA}', 'ZZ Eski Manuel', '1980-01-01', '10:00');
insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, type_code, profile_code) values ('${LEGACY_MANUAL_CHART}', '${TA}', '${LEGACY_CLIENT}', 'ZZ Eski Manuel', 'manual', 'generator', '2/4');
insert into public.human_design_reports(id, tenant_id, client_id, chart_id, title, report_kind, generated_content) values ('${LEGACY_REPORT}', '${TA}', '${LEGACY_CLIENT}', '${LEGACY_MANUAL_CHART}', 'ZZ Eski Rapor', 'legacy', 'eski içerik');
insert into storage.buckets(id, name, public) values ('${HD_BUCKET}', '${HD_BUCKET}', false) on conflict do nothing;
`;
const GRANTS = `grant select, insert, update, delete on public.human_design_clients, public.human_design_charts, public.human_design_reports, public.human_design_knowledge_records to service_role;`;

// ─── Geçerli BodyGraph PNG (renderer çıktısı oranında; sunucu doğrulamasından geçer) ───
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
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0xff);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  // Ortada koyu bir blok (boş görsel değil).
  for (let y = 700; y < 1100; y++) for (let x = 400; x < 870; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 40; raw[o + 1] = 40; raw[o + 2] = 120; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const BODYGRAPH = `data:image/png;base64,${makePng(1271, 1800).toString("base64")}`;

type Auth = { id?: string; token?: string };
type Json = Record<string, unknown>;
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function main() {
  // Dış ağ: yalnız Roxy bodygraph (fixture, sayılır). Diğer her şey reddedilir.
  let roxyCalls = 0;
  let roxyFail: "none" | "network" = "none";
  const external: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return realFetch(input, init);
    if (/roxyapi\.com\/.*human-design\/bodygraph/.test(u)) {
      const key = new Headers(init?.headers).get("x-api-key") ?? new Headers(init?.headers).get("authorization") ?? "";
      if (!key.includes("zz-harness-fake-roxy-key")) external.push(`GERÇEK ANAHTAR?! ${u}`);
      roxyCalls++;
      if (roxyFail === "network") throw new TypeError("fetch failed");
      return new Response(FIXTURE, { status: 200, headers: { "content-type": "application/json" } });
    }
    external.push(u);
    throw new Error("harness: dış ağ çağrısı yasak");
  }) as typeof fetch;

  const env: TestEnv = await startAnamnezTestEnv({
    port: 54398,
    dirName: "hd-analysis-flow-pgdata",
    extraSql: [src("supabase/migrations/20270129000300_clients_create_request_id.sql"), HD_DDL, JOURNEY_MIGRATION, GRANTS],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.HD_LOCATION_REF_SECRET = "zz-hd-flow-test-secret";
  const su = env.su;
  console.log(`embedded-postgres + PostgREST shim + Storage emülatörü hazır (${env.url}).`);

  try {
    // Eski canonical v1 raporu (hd-report-1) — eski motorla üretilmiş gibi; korunmalı ve Word İndir
    // tarafından yeniden kullanılMAMALI (v2 değil).
    await su.query(
      `insert into public.human_design_reports(id, tenant_id, client_id, chart_id, title, report_kind, schema_version, snapshot) values ($1,$2,$3,$4,'ZZ v1 Rapor','canonical','hd-report-1','{}'::jsonb)`,
      [LEGACY_V1_REPORT, TA, LEGACY_CLIENT, LEGACY_MANUAL_CHART],
    );
    const legacySnapshot = JSON.stringify((await su.query(`select * from public.human_design_reports order by id`)).rows);
    const legacyChartSnapshot = JSON.stringify((await su.query(`select * from public.human_design_charts where id=$1`, [LEGACY_MANUAL_CHART])).rows);

    const mk = async (label: string, tenant: string, perms: Record<string, boolean>) => {
      const id = randomUUID();
      const token = `zz-hdflow-${label.toLowerCase()}-${id.slice(0, 8)}`;
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
         values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium',$5,false)`,
        [id, `ZZ_HDFLOW_${label}`, `zz.hdflow.${label.toLowerCase()}@example.test`, JSON.stringify(perms), tenant],
      );
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token } as Auth;
    };
    const U = {
      A: await mk("A", TA, { human_design: true, clients: true, hd_system_reading: true }),
      A2: await mk("A2", TA, { human_design: true, clients: true }),
      B: await mk("B", TB, { human_design: true, clients: true, hd_system_reading: true }),
    };
    const routes = {
      picker: await import("../../app/api/hd/journey-clients/route"),
      journey: await import("../../app/api/hd/clients/journey/route"),
      charts: await import("../../app/api/hd/charts/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
      reports: await import("../../app/api/hd/reports/route"),
      professional: await import("../../app/api/hd/reports/professional/route"),
      download: await import("../../app/api/hd/reports/professional/download/route"),
    };
    async function call(handler: unknown, method: string, auth: Auth, body?: unknown, query = "") {
      const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" };
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(`http://localhost/api/test${query}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      const res = await (handler as Handler)(req, { params: Promise.resolve({}) });
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("json")) return { status: res.status, json: (await res.json()) as Json, buf: null as Buffer | null, headers: res.headers };
      return { status: res.status, json: {} as Json, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
    }
    const compute = (auth: Auth, clientId: string, locationId: string) => call(routes.roxy.POST, "POST", auth, { client_id: clientId, location_id: locationId });
    const count = async (sql: string, p: unknown[] = []) => Number((await su.query(sql, p)).rows[0].n);
    const { latestWordReportId, WORD_V2_SCHEMA_VERSION } = await import("../../lib/human-design/reporting/wordReportPick");
    const { HD_REPORT_V2_SCHEMA_VERSION } = await import("../../lib/human-design/reporting/reportSnapshotV2");
    const { buildExpertKnowledgeCodes, toAppChartCodes } = await import("../../lib/human-design/normalize/hdAppCodes");

    // ── 1–2) YENİ DANIŞAN + MEVCUT DANIŞAN SEÇİMİ ─────────────────────────────
    section("1–2. Yeni danışan oluşturma + mevcut danışan seçimi");
    const created = await call(routes.journey.POST, "POST", U.A, {
      action: "create_new", ad: "Elif", soyad: "Şahin", dogum: "2018-07-20", birth_time: "19:00", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID(),
    });
    ok(created.status === 200 && typeof created.json.hd_client_id === "string", "1 yeni danışan + HD profili oluştu (ilçe konumu sunucuda çözüldü)", created.json);
    const hdA = String(created.json.hd_client_id);
    const journeyA = String(created.json.journey_client_id);
    const prof = (await su.query(`select * from public.human_design_clients where id=$1`, [hdA])).rows[0];
    ok(prof.tenant_id === TA && prof.birth_location_id === "trd-42-selcuklu" && prof.birth_timezone === "Europe/Istanbul", "1b profil tenant A'da; doğum yeri yerel ilçe kimliği + Europe/Istanbul", prof);
    const picked = await call(routes.picker.GET, "GET", U.A, undefined, "?search=Elif Şahin");
    ok(picked.status === 200 && (picked.json.rows as Json[]).some((r) => r.id === journeyA && r.hd_client_id === hdA), "2 mevcut danışan seçicide bulunur ve HD profiline bağlıdır", picked.json);

    // ── 3–7) HESAP + OTOMATİK KAYIT + YENİLEME + YENİDEN AÇMA (Roxy 0) ───────────
    section("3–7. Hesaplama · kalıcı kayıt · sayfa yenileme · yeniden açma");
    const c1 = await compute(U.A, hdA, "client");
    ok(c1.status === 200 && c1.json.ok === true && c1.json.reused === false && roxyCalls === 1, "3 yeni analiz hesaplandı (Roxy 1)", { c1: c1.json, roxyCalls });
    const chartA = String(c1.json.id);
    const row = (await su.query(`select * from public.human_design_charts where id=$1`, [chartA])).rows[0];
    ok(!!row && row.tenant_id === TA && row.client_id === hdA && row.source === "computed" && row.location_id === "trd-42-selcuklu" && !!row.computed_result, "4 analiz hesapla birlikte OTOMATİK ve tam kaydedildi (ayrı Kaydet adımı yok)", row && { t: row.tenant_id, c: row.client_id, s: row.source, l: row.location_id });
    const list = await call(routes.charts.GET, "GET", U.A, undefined, `?client_id=${hdA}`);
    ok(list.status === 200 && (list.json.data as Json[]).some((r) => r.id === chartA), "5 sayfa yenileme: kayıtlı analiz listesinde (sunucudan yeniden okundu)", list.json);
    const allList = await call(routes.charts.GET, "GET", U.A);
    ok((allList.json.data as Json[]).some((r) => r.id === chartA), "5b ana Hesaplama sayfasındaki tüm-analizler listesinde de var");
    const detail = await call(routes.charts.GET, "GET", U.A, undefined, `?id=${chartA}`);
    ok(detail.status === 200 && (detail.json.data as Json).id === chartA && !!(detail.json.data as Json).roxy_render && !("provider_raw" in (detail.json.data as Json)), "6 kayıtlı analiz yeniden açılır (render yükü var, ham yanıt istemciye gitmez)");
    const again = await compute(U.A, hdA, "client");
    ok(again.status === 200 && again.json.reused === true && again.json.id === chartA && roxyCalls === 1, "7 aynı analiz tekrar istendi → kayıtlı açıldı, Roxy çağrısı 0", { again: again.json, roxyCalls });
    ok((await count(`select count(*) n from public.human_design_charts where client_id=$1`, [hdA])) === 1, "7b mükerrer kayıt yok");

    // ── 20) ÇİFT TIKLAMA / EŞZAMANLI ─────────────────────────────────────────────
    section("20. Çift tıklama ve eşzamanlı istek");
    await su.query(`update public.human_design_clients set birth_time='07:15' where id=$1`, [hdA]);
    const before = roxyCalls;
    const conc = await Promise.all([1, 2, 3].map(() => compute(U.A, hdA, "client")));
    const concIds = new Set(conc.map((r) => r.json.id));
    ok(conc.every((r) => r.status === 200 && r.json.ok === true) && concIds.size === 1 && roxyCalls === before + 1, "20 aynı anda 3 istek → tek kayıt, tek Roxy çağrısı", { st: conc.map((r) => [r.status, r.json.reused]), calls: roxyCalls - before });
    const chartA2 = String([...concIds][0]);

    // ── 19) BİRDEN FAZLA ANALİZ GEÇMİŞİ ─────────────────────────────────────────
    section("19. Birden fazla analiz geçmişi");
    ok((await count(`select count(*) n from public.human_design_charts where client_id=$1 and source='computed'`, [hdA])) === 2, "19 farklı doğum saatiyle ikinci analiz → iki ayrı kayıt; ilki korunur");
    ok((await su.query(`select birth_time from public.human_design_charts where id=$1`, [chartA])).rows[0].birth_time === "19:00:00", "19b ilk analizin verisi değişmedi");
    await su.query(`update public.human_design_clients set birth_time='19:00' where id=$1`, [hdA]);
    const back = await compute(U.A, hdA, "client");
    ok(back.json.reused === true && back.json.id === chartA && roxyCalls === before + 1, "19c ilk doğum bilgisine dönüş → eski analiz açılır, Roxy 0");

    // ── 15) FARKLI DANIŞAN İZOLASYONU ───────────────────────────────────────────
    section("15. Farklı danışan izolasyonu");
    const other = await call(routes.journey.POST, "POST", U.A, {
      action: "create_new", ad: "İkiz", soyad: "Kardeş", dogum: "2018-07-20", birth_time: "19:00", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID(),
    });
    const hdOther = String(other.json.hd_client_id);
    const cOther = await compute(U.A, hdOther, "client");
    ok(cOther.status === 200 && cOther.json.reused === false && cOther.json.id !== chartA, "15 aynı doğum verili FARKLI danışan → kendi analizi (başkasının analizi açılmaz)", cOther.json);
    const chartOther = String(cOther.json.id);
    const listA = await call(routes.charts.GET, "GET", U.A, undefined, `?client_id=${hdA}`);
    ok(!(listA.json.data as Json[]).some((r) => r.id === chartOther), "15b danışan listesi yalnız kendi analizlerini gösterir");

    // ── 8–13) WORD (PR #359 v2): görünürlük verisi, indirme, içerik, BodyGraph, bilgi bankası, yetki ──
    section("8–13. Word v2 — hazır rapor, oluşturma, indirme, içerik");
    const codes = buildExpertKnowledgeCodes(toAppChartCodes(row));
    ok(codes.length > 0, "Bilgi Bankası eşleşme kodları üretildi", codes);
    await su.query(
      `insert into public.human_design_knowledge_records(tenant_id, category, title, code, content, is_active) values ($1,'tip','ZZ Uzman Tip Notu',$2,'ZZ uzman bilgi bankası metni — tip yorumu',true),($3,'tip','ZZ B Tenant Notu',$2,'ZZ B gizli metin',true)`,
      [TA, codes[0], TB],
    );
    const brief0 = await call(routes.reports.GET, "GET", U.A, undefined, `?brief=1&chartId=${chartA}`);
    ok(brief0.status === 200 && (brief0.json.rows as Json[]).length === 0 && latestWordReportId(brief0.json.rows as never, chartA) === null, "8 yeni analizde hazır Word yok → Word İndir ilk tıklamada oluşturur");
    ok((await call(routes.reports.GET, "GET", U.A, undefined, `?brief=1&chartId=not-a-uuid`)).status === 400, "8b bozuk analiz kimliği reddedilir");
    const reqId = randomUUID();
    const rocBefore = roxyCalls;
    const w1 = await call(routes.professional.POST, "POST", U.A, { chartId: chartA, requestId: reqId, commentary: "both", bodygraphPng: BODYGRAPH });
    ok(w1.status === 200 && w1.json.ok === true && w1.json.bodygraph === "roxy_render" && w1.json.systemReading === "included" && Number(w1.json.expertEntries) >= 1, "9a Word v2 raporu oluşturuldu (BodyGraph + Sistem Yorumu + uzman bilgisi)", w1.json);
    const rep1 = String(w1.json.id);
    const w1b = await call(routes.professional.POST, "POST", U.A, { chartId: chartA, requestId: reqId, commentary: "both", bodygraphPng: BODYGRAPH });
    ok(w1b.json.id === rep1 && (await count(`select count(*) n from public.human_design_reports where chart_id=$1`, [chartA])) === 1, "20b Word çift tıklama / ağ tekrarı → tek rapor satırı");
    ok(roxyCalls === rocBefore, "9b Word üretimi Roxy çağırmaz");
    const brief1 = await call(routes.reports.GET, "GET", U.A, undefined, `?brief=1&chartId=${chartA}`);
    const b1 = brief1.json.rows as Json[];
    ok(b1.length === 1 && b1[0].schema_version === HD_REPORT_V2_SCHEMA_VERSION && !("snapshot" in b1[0]) && latestWordReportId(b1 as never, chartA) === rep1, "8c analizin hazır Word v2 raporu bulunur (içerik/snapshot dönmez)", b1);
    ok(WORD_V2_SCHEMA_VERSION === HD_REPORT_V2_SCHEMA_VERSION, "8d istemci şema sabiti sunucu sabitiyle aynı");
    const dl = await call(routes.download.POST, "POST", U.A, { reportId: rep1 });
    ok(dl.status === 200 && !!dl.buf && dl.buf.length > 5000 && /\.docx/.test(dl.headers.get("content-disposition") ?? ""), "9c Word dosyası gerçekten iner (DOCX)", { status: dl.status, len: dl.buf?.length });
    const zip = await JSZip.loadAsync(dl.buf!);
    const xml = await zip.file("word/document.xml")!.async("string");
    const text = xml.replace(/<[^>]+>/g, " ");
    const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/"));
    ok(text.includes("Elif Şahin"), "10a Word: danışan bilgileri (ad)");
    ok(/Design/.test(text) && /Personality/.test(text) && /Merkez/i.test(text) && /Kanal/i.test(text) && /Kap[ıi]/i.test(text), "10b Word: Design/Personality + merkezler + kanallar + kapılar bölümleri");
    ok(/Enkarnasyon|Haç/i.test(text), "10c Word: enkarnasyon haçı");
    ok(media.length >= 1, "11 Word: BodyGraph görseli gömülü", media);
    ok(text.includes("ZZ uzman bilgi bankası metni") && !text.includes("ZZ B gizli metin"), "12 Word: uzmanın KENDİ bilgi bankası eşleşmesi var; başka tenant'ın içeriği yok");
    ok(/Sistem Yorumu/i.test(text), "13a Word: yetkili uzmanda Sistem Yorumu bölümü");
    const dlA2 = await call(routes.download.POST, "POST", U.A2, { reportId: rep1 });
    const textA2 = (await (await JSZip.loadAsync(dlA2.buf!)).file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, " ");
    ok(dlA2.status === 200 && dlA2.headers.get("x-hd-report-redacted") === "system-reading", "13b Sistem Yorumu yetkisi olmayan uzman indirince bölüm çıkarılır (yetki indirme anında)", { st: dlA2.status, h: dlA2.headers.get("x-hd-report-redacted") });
    ok(textA2.includes("ZZ uzman bilgi bankası metni"), "13c yetkisiz indirmede uzman bilgileri korunur");
    const wNo = await call(routes.professional.POST, "POST", U.A2, { chartId: chartA2, requestId: randomUUID(), commentary: "system", bodygraphPng: BODYGRAPH });
    ok(wNo.status === 200 && wNo.json.systemReading === "not_permitted", "13d yetkisiz uzman 'Sistem Yorumu' seçse de rapora girmez (sunucu kararı)", wNo.json);

    // ── 18) ESKİ RAPORLAR + 17) ESKİ MANUEL ANALİZ ────────────────────────────
    section("17–18. Eski manuel analizler ve eski raporlar");
    const allReports = await call(routes.reports.GET, "GET", U.A);
    const repIds = (allReports.json.rows as Json[]).map((r) => r.id);
    ok(repIds.includes(LEGACY_REPORT) && repIds.includes(LEGACY_V1_REPORT) && repIds.includes(rep1), "18 Kayıtlı Raporlar: eski (legacy + hd-report-1) ve yeni Word raporları birlikte listelenir");
    const briefAll = await call(routes.reports.GET, "GET", U.A, undefined, "?brief=1");
    ok(latestWordReportId(briefAll.json.rows as never, LEGACY_MANUAL_CHART) === null, "18b eski raporlar 'Word İndir' tarafından yeniden kullanılmaz (Word v2 değil) — Kayıtlı Raporlar'da kalır");
    const manual = await call(routes.charts.GET, "GET", U.A, undefined, "?scope=manual");
    ok(manual.status === 200 && JSON.stringify(manual.json).includes(LEGACY_MANUAL_CHART), "17 eski manuel analiz listelenir");
    const legacyNow = JSON.stringify((await su.query(`select * from public.human_design_reports where id in ($1,$2) order by id`, [LEGACY_REPORT, LEGACY_V1_REPORT])).rows);
    ok(legacyNow === JSON.stringify(JSON.parse(legacySnapshot).filter((r: Json) => r.id === LEGACY_REPORT || r.id === LEGACY_V1_REPORT)), "17b eski raporlar birebir değişmedi");
    ok(JSON.stringify((await su.query(`select * from public.human_design_charts where id=$1`, [LEGACY_MANUAL_CHART])).rows) === legacyChartSnapshot, "17c eski manuel analiz birebir değişmedi");

    // ── 14) DANIŞAN YOLCULUĞU ───────────────────────────────────────────────────
    section("14. Danışan Yolculuğu bağlantısı");
    const dy = await call(routes.journey.GET, "GET", U.A, undefined, `?journey_client_id=${journeyA}`);
    const dyIds = ((dy.json.analyses as Json[]) ?? []).map((a) => a.id);
    ok(dy.status === 200 && (dy.json.profile as Json)?.id === hdA && dyIds.includes(chartA) && dyIds.includes(chartA2) && !dyIds.includes(chartOther), "14 DY özeti AYNI kayıtlı analizlere bağlı (kopya yok); başka danışanın analizi yok", dy.json);
    const tab = src("app/dashboard/clients/[id]/components/HumanDesignTab.tsx");
    ok(/\/human-design\/danisanlar\/\$\{profile\.id\}\?chart=\$\{encodeURIComponent\(a\.id\)\}/.test(tab), "14b DY 'Analizi Aç' → aynı analiz kimliğiyle HD danışan sayfası (?chart=)");

    // ── 16) TENANT İZOLASYONU ───────────────────────────────────────────────────
    section("16. Tenant izolasyonu");
    ok((await call(routes.charts.GET, "GET", U.B, undefined, `?id=${chartA}`)).status === 404, "16a başka tenant analizi açamaz (404)");
    ok(((await call(routes.reports.GET, "GET", U.B, undefined, `?brief=1&chartId=${chartA}`)).json.rows as Json[]).length === 0, "16b başka tenant hazır Word raporunu göremez");
    ok((await call(routes.professional.POST, "POST", U.B, { chartId: chartA, requestId: randomUUID(), bodygraphPng: BODYGRAPH })).status === 404, "16c başka tenant'ın analizi için Word oluşturulamaz");
    const dlB = await call(routes.download.POST, "POST", U.B, { reportId: rep1 });
    ok(dlB.status === 404 || dlB.status === 403, "16d başka tenant raporu indiremez", dlB.status);
    ok((await compute(U.B, hdA, "client")).status === 404, "16e başka tenant'ın danışanı için hesap yapılamaz");
    const dyB = await call(routes.journey.GET, "GET", U.B, undefined, `?journey_client_id=${journeyA}`);
    ok(!((dyB.json.analyses as Json[]) ?? []).length, "16f başka tenant DY özetinde analiz göremez", dyB.json);

    // ── 21) AĞ HATASI VE KAYIT BAŞARISIZLIĞI ─────────────────────────────────────
    section("21. Ağ hatası ve kayıt başarısızlığı");
    const failClient = await call(routes.journey.POST, "POST", U.A, {
      action: "create_new", ad: "ZZ Kayıt", soyad: "Hatası", dogum: "1990-01-01", birth_time: "12:00", birth_location_ref: "tr-06-ankara", request_id: randomUUID(),
    });
    const hdFail = String(failClient.json.hd_client_id);
    await su.query(`update public.human_design_clients set name='ZZ Kayıt Hatası' where id=$1`, [hdFail]);
    const f1 = await compute(U.A, hdFail, "client");
    ok(f1.status >= 500 && f1.json.ok === false && typeof f1.json.error === "string" && !/zz simulated|exception|insert/i.test(String(f1.json.error)), "21a kayıt yazılamazsa başarı DÖNMEZ; anlaşılır hata (ham DB hatası yok)", f1.json);
    ok((await count(`select count(*) n from public.human_design_charts where client_id=$1`, [hdFail])) === 0, "21b yarım/bozuk kayıt yok");
    roxyFail = "network";
    await su.query(`update public.human_design_clients set name='ZZ Ağ', birth_time='13:00' where id=$1`, [hdFail]);
    const f2 = await compute(U.A, hdFail, "client");
    roxyFail = "none";
    ok(f2.status >= 500 && f2.json.ok === false && (await count(`select count(*) n from public.human_design_charts where client_id=$1`, [hdFail])) === 0, "21c hesaplama servisine ağ hatası → başarısız + kayıt yok", f2.json);
    const f3 = await compute(U.A, hdFail, "client");
    ok(f3.status === 200 && f3.json.ok === true && f3.json.reused === false, "21d ağ düzelince tekrar deneme kaydeder (veri kaybı yok)", f3.json);
    const f4 = await compute(U.A, hdFail, "client");
    ok(f4.json.reused === true && f4.json.id === f3.json.id, "21e yanıt kaybolup tekrar denenirse kayıtlı analiz döner (mükerrer kayıt yok)");

    // ── Analiz silinirse Word raporları korunur ────────────────────────────────
    section("Ek. Silme güvenliği");
    const delReq = new NextRequest(`http://localhost/api/test?id=${chartA2}`, { method: "DELETE", headers: { "x-user-id": U.A.id!, "x-session-token": U.A.token! } });
    const del = await (routes.charts.DELETE as unknown as Handler)(delReq, { params: Promise.resolve({}) });
    const repOfA2 = (await su.query(`select chart_id from public.human_design_reports where id=$1`, [String(wNo.json.id)])).rows[0];
    ok(del.status === 200 && !!repOfA2 && repOfA2.chart_id === null, "analiz silinince Word raporu silinmez (Kayıtlı Raporlar'da kalır)", { st: del.status, repOfA2 });

    ok(external.length === 0, "dış ağ: yalnız sahte Roxy; gerçek anahtar / başka servis YOK", external);
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }

  console.log(`\n${passed} PASS / ${failed} FAIL`);
  if (failed) {
    for (const f of fails) console.log(" -", f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
