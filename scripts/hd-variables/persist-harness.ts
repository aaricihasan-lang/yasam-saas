/**
 * HD VARIABLES — KALICI DEPO testi (migration 20271104000000 uygulanmış izole Postgres + gerçek route; sağlayıcı SAHTE,
 * ücretli çağrı YOK). Süreç içi önbellek / sunucu yeniden başlatma / ikinci sunucu örneği (servis modülünün AYRI kopyası) /
 * eşzamanlılık + kilit sonrası yeniden denetim / tenant izolasyonu (servis + DB tetikleyicisi) / yetkisiz kullanıcı /
 * değişen doğum girdisi / değişen adapter / bozuk kayıt / belirsiz ok / tarihsel ofset / zaman aşımı / DB okuma-yazma
 * hatası / CASCADE / yetki kilidi (anon, authenticated) / natal kayıtların değişmezliği.
 * Çalıştır: npx tsx scripts/hd-variables/persist-harness.ts   (HD_VAR_PERSIST_PG_PORT, varsayılan 54531)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mkUser, type Auth, type Json } from "../hd-analysis-word-flow/env";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { resolveBirthLocalTime } from "../../lib/human-design/api/birthTimeResolution";
import { localVariableBands } from "../../lib/human-design/variables/localVariablesCheck";
import { ARROW_SPECS, COGNITION_BY_TONE, substructureOf, toneDirection } from "../../lib/human-design/variables/variablesMath";
import { __resetVariablesCache, computeChartVariables, type VariablesDeps } from "../../lib/human-design/variables/variablesService";
import { ROXY_VARIABLES_ADAPTER_VERSION } from "../../lib/human-design/variables/roxyVariablesClient";
import { __resetRateLimitForTest } from "../../lib/security/rateLimit";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TA = "0e2e2e2e-0000-4000-8000-0000000000a1";
const TB = "0e2e2e2e-0000-4000-8000-0000000000b1";
const cid = (n: number) => `eeeeeeee-4444-4000-8000-0000000c00${String(n).padStart(2, "0")}`;
const hid = (n: number) => `eeeeeeee-4444-4000-8000-0000000d00${String(n).padStart(2, "0")}`;
const KEY = "zz-harness-fake-variables-key-not-real";
const TABLE = "public.human_design_chart_variables";
const MIGRATION = readFileSync(path.join(process.cwd(), "supabase/migrations/20271104000000_hd_chart_variables.sql"), "utf8");
const HD_DDL = `
create table public.human_design_clients (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, name text not null,
  birth_date date, birth_time text, birth_place text, chart_image_url text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.human_design_charts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid,
  client_id uuid references public.human_design_clients(id) on delete set null, client_name text,
  birth_date date, birth_time text, birth_place text, source text default 'manual', input jsonb, computed_result jsonb,
  provider text, provider_raw jsonb, input_hash text, timezone text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.tenants(id, name) values ('${TA}', 'ZZ_VARP_A'), ('${TB}', 'ZZ_VARP_B');
grant select, insert, update, delete on public.human_design_clients, public.human_design_charts to service_role;
`;

/** Sözleşmeye uygun sahte yanıt: değerler yerel motor boylamından (çapraz denetimden geçer). */
function fakeVariables(utcIso: string) {
  const bands = localVariableBands(new Date(utcIso));
  const arrows = ARROW_SPECS.map((spec) => {
    const lon = bands.find((b) => b.key === spec.key)!.longitude;
    const s = substructureOf(lon);
    const a: Json = {
      key: spec.key, name: spec.key, nameLocalized: `TR ${spec.key}`, layer: spec.layer, layerLocalized: "Katman", position: spec.position, positionLocalized: "Konum",
      activation: { planet: spec.planet, side: spec.side, planetLocalized: "Gezegen" }, color: s.color, tone: s.tone, base: s.base, direction: toneDirection(s.tone),
      colorLabel: "C", colorLabelLocalized: "Renk", directionLabel: "D", directionLabelLocalized: "Yön", description: "Açıklama.",
      layerDescription: "Katman.", colorMeaning: "Color anlamı.", toneMeaning: "Tone anlamı.", directionMeaning: "Yön anlamı.", baseName: "B", baseNameLocalized: "Taban",
      confident: s.toneBoundaryArcsec > 9.86,
    };
    if (spec.key === "determination") a.cognition = { label: COGNITION_BY_TONE[s.tone - 1], labelLocalized: "Biliş", description: "Biliş açıklaması." };
    return a;
  });
  return { arrows, confident: arrows.every((a) => a.confident === true), confidenceMarginDeg: 0.002737909255830788, baseDescription: "Base katmanı." };
}

type Mode = "ok" | "slow" | "timeout";
type ServiceModule = typeof import("../../lib/human-design/variables/variablesService");

async function main() {
  const roxy = { calls: 0, mode: "ok" as Mode, external: [] as string[] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return realFetch(input, init);
    if (!/^https:\/\/roxyapi\.com\/api\/v2\/human-design\/variables\?lang=tr$/.test(u)) { roxy.external.push(u); throw new Error(`harness: dış ağ yasak ${u}`); }
    roxy.calls++;
    const body = JSON.parse(String(init?.body ?? "{}")) as Json;
    const r = resolveBirthLocalTime(String(body.date), String(body.time), String(body.timezone));
    // Ölçülmüş sağlayıcı davranışı: UTC ofsetinin saniye kısmı sıfıra doğru atılır.
    const utc = r.kind === "ok" ? new Date(Date.parse(r.utcIso) + (r.offsetSeconds % 60) * 1000).toISOString() : "2000-01-01T00:00:00.000Z";
    if (roxy.mode === "timeout") { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
    if (roxy.mode === "slow") await sleep(1500);
    return new Response(JSON.stringify(fakeVariables(utc)), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  process.env.ROXY_API_KEY = KEY;
  delete process.env.ROXY_API_BASE_URL;

  const env: TestEnv = await startAnamnezTestEnv({ port: Number(process.env.HD_VAR_PERSIST_PG_PORT ?? 54531), dirName: process.env.HD_VAR_PERSIST_PG_DIR ?? "hd-variables-persist-pgdata", extraSql: [HD_DDL, MIGRATION] });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  const rows = async (chart?: string) =>
    (await su.query(`select tenant_id, chart_id, cache_key, adapter_version, node_type, lang, chart_input_hash, utc_offset_seconds, result, created_by, updated_at from ${TABLE}${chart ? " where chart_id=$1" : ""} order by chart_id, cache_key`, chart ? [chart] : [])).rows as Array<Record<string, unknown>>;
  try {
    type Seed = { n: number; tenant: string; name: string; date: string; time: string; tz: string };
    const seeds: Seed[] = [
      { n: 0, tenant: TA, name: "Ayşe Gizli", date: "1985-03-12", time: "06:45:00", tz: "Europe/Istanbul" },
      { n: 1, tenant: TA, name: "Mehmet Gizli", date: "1992-11-03", time: "23:10:00", tz: "Europe/Istanbul" },
      { n: 2, tenant: TA, name: "Değişecek Kişi", date: "1990-01-01", time: "10:00:00", tz: "Europe/Istanbul" },
      { n: 3, tenant: TA, name: "Tarihsel LMT", date: "1905-03-15", time: "22:57:00", tz: "Europe/Istanbul" },
      { n: 4, tenant: TA, name: "Zaman Aşımı", date: "1977-07-07", time: "07:07:00", tz: "Europe/Berlin" },
      { n: 5, tenant: TA, name: "İkinci Örnek", date: "1969-07-20", time: "20:17:00", tz: "America/New_York" },
      { n: 6, tenant: TA, name: "Kilit Sonrası", date: "2003-02-01", time: "16:00:00", tz: "Asia/Tokyo" },
      { n: 7, tenant: TA, name: "DB Hata", date: "1999-12-31", time: "23:59:00", tz: "Europe/London" },
      { n: 8, tenant: TA, name: "Silinecek", date: "1988-08-08", time: "08:08:00", tz: "Europe/Istanbul" },
      { n: 9, tenant: TB, name: "Başka Tenant", date: "1979-12-01", time: "08:15:00", tz: "America/New_York" },
    ];
    for (const s of seeds) {
      await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ($1,$2,$3,$4,$5)`, [cid(s.n), s.tenant, s.name, s.date, s.time.slice(0, 5)]);
      const input = { date: s.date, time: s.time, timezone: s.tz, latitude: 41, longitude: 29, nodeType: "true", lang: "tr" };
      await su.query(
        `insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, provider, input, input_hash, computed_result) values ($1,$2,$3,$4,'computed','roxyapi',$5,$6,$7)`,
        [hid(s.n), s.tenant, cid(s.n), s.name, JSON.stringify(input), `ih-${s.n}`, JSON.stringify({ activations: [] })],
      );
    }
    const P = { human_design: true, hd_system_reading: true };
    const UA: Auth = await mkUser(su, "VPA", TA, P);
    const UB: Auth = await mkUser(su, "VPB", TB, P);
    const NOSR: Auth = await mkUser(su, "VPN", TA, { human_design: true });
    const DEMO: Auth = await mkUser(su, "VPD", TA, P);
    await su.query(`update public.users set is_demo_account=true where id=$1`, [DEMO.id]);
    const route = await import("../../app/api/hd/charts/variables/route");
    const post = async (a: Auth | null, body: unknown) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (a) { headers["x-user-id"] = a.id!; headers["x-session-token"] = a.token!; }
      const res = await route.POST(new NextRequest("http://localhost/api/hd/charts/variables", { method: "POST", headers, body: JSON.stringify(body) }));
      const text = await res.text();
      return { status: res.status, j: JSON.parse(text) as Json, text };
    };
    const md5 = async (t: string) => (await su.query(`select md5(string_agg(row_to_json(c)::text, '|' order by c::text)) h from public.${t} c`)).rows[0].h as string;
    // Natal analiz içeriği (zaman damgaları hariç: 9b'de silinip aynı içerikle yeniden eklenen analiz için)
    const chartsMd5 = async () => (await su.query(`select md5(string_agg(row_to_json(c)::text, '|' order by id)) h from (select id, tenant_id, client_id, client_name, source, provider, input, input_hash, computed_result, provider_raw from public.human_design_charts) c`)).rows[0].h as string;
    /** Sunucu yeniden başlatma: süreç önbelleği + süreç içi sayaçlar boşalır (kalıcı depo kalır). */
    const restart = () => { __resetVariablesCache(); __resetRateLimitForTest(); };
    const charts0 = await chartsMd5();
    const clients0 = await md5("human_design_clients");
    const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
    const logs: string[] = [];
    const baseDeps = (over: Partial<VariablesDeps> = {}): VariablesDeps => ({
      config: { apiKey: KEY, baseUrl: "https://roxyapi.com/api/v2" },
      callVariables: async (c, b, o) => (await import("../../lib/human-design/variables/roxyVariablesClient")).callRoxyVariables(c, b, o),
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
      log: (m) => { logs.push(m); },
      ...over,
    });
    const ctxA = { db, tenantId: TA, userId: UA.id!, isDemo: false };

    section("1. İlk başarılı hesap → kalıcı kayıt");
    const r1 = await post(UA, { chart_id: hid(0) });
    const row1 = (await rows(hid(0)))[0];
    ok(r1.status === 200 && r1.j.reused === false && roxy.calls === 1, "1a ilk hesap: 200, tek ücretli (sahte) çağrı", { s: r1.status, calls: roxy.calls });
    ok(!!row1 && row1.tenant_id === TA && row1.adapter_version === ROXY_VARIABLES_ADAPTER_VERSION && row1.node_type === "true" && row1.lang === "tr" && row1.chart_input_hash === "ih-0" && row1.created_by === UA.id && /^[0-9a-f]{64}$/.test(String(row1.cache_key)),
      "1b kalıcı satır: tenant oturumdan, adapter / politika / girdi kimliği / yazan kullanıcı doğru", row1);
    // Rastlantısal eşleşmeyi önlemek için zaman damgası / özet / kimlik sütunları hariç içerik denetlenir
    const rowText = JSON.stringify({ ...row1, cache_key: undefined, updated_at: undefined, created_by: undefined, tenant_id: undefined, chart_id: undefined });
    ok(!rowText.includes("Ayşe") && !rowText.includes("1985") && !rowText.includes("06:45") && !rowText.includes("04:45") && !rowText.includes("Istanbul") && !rowText.includes(KEY), "1c satırda danışan adı, doğum tarihi / saati (yerel veya UTC), yer, API anahtarı YOK (doğum anı yalnız anahtar özetinde)", rowText.slice(0, 300));
    ok(row1.utc_offset_seconds === 7200, "1d satırdaki UTC ofseti sunucu çözümüyle aynı", { o: row1.utc_offset_seconds });

    section("2. Tekrar açma / tarayıcı yenileme / sunucu yeniden başlatma");
    const c2 = roxy.calls;
    const r2 = await post(UA, { chart_id: hid(0) });
    ok(r2.status === 200 && r2.j.reused === true && roxy.calls === c2 && JSON.stringify(r2.j.data) === JSON.stringify(r1.j.data), "2a aynı analiz tekrar (süreç önbelleği) → ücretli çağrı YOK, aynı sonuç");
    restart();
    const r3 = await post(UA, { chart_id: hid(0) });
    ok(r3.status === 200 && r3.j.reused === true && roxy.calls === c2 && JSON.stringify(r3.j.data) === JSON.stringify(r1.j.data), "2b sunucu yeniden başlatma (süreç belleği boş) → KALICI kayıttan, ücretli çağrı YOK, birebir aynı sonuç", { s: r3.status, calls: roxy.calls - c2 });
    const r3b = await post(UA, { chart_id: hid(0) });
    ok(r3b.status === 200 && roxy.calls === c2, "2c tarayıcı yenileme sonrası tekrar istek → ücretli çağrı YOK");

    section("3. Farklı sunucu örneği (servis modülünün AYRI kopyası) + eşzamanlılık");
    const href = pathToFileURL(path.join(process.cwd(), "lib/human-design/variables/variablesService.ts")).href;
    const instB = (await import(`${href}?instance=b`)) as ServiceModule;
    ok(instB.computeChartVariables !== computeChartVariables, "3a ikinci örnek gerçekten ayrı modül kopyası (ayrı süreç belleği)");
    let bCalls = 0;
    const depsB = baseDeps({ callVariables: async () => { bCalls++; return { ok: false, kind: "server_error", status: 500 }; } });
    const rb = await instB.computeChartVariables(ctxA, { chart_id: hid(0) }, depsB);
    ok(rb.status === 200 && rb.body.ok && rb.body.reused === true && bCalls === 0 && JSON.stringify(rb.body.ok ? rb.body.data : null) === JSON.stringify(r1.j.data), "3b ikinci örnek, birincinin kalıcı sonucunu kullanır → ücretli çağrı YOK");
    // Eşzamanlı: A örneği (yavaş sağlayıcı) kilidi tutar; B örneği aynı anda gelir → kilidi alamaz → kalıcı depoyu yoklar.
    const lock = new Set<string>();
    const sharedLock: VariablesDeps["rateLimit"] = async (scope, value) => {
      if (scope !== "hd-roxy-variables-inflight") return { allowed: true, retryAfterSec: 0 };
      if (lock.has(value)) return { allowed: false, retryAfterSec: 20 };
      lock.add(value);
      return { allowed: true, retryAfterSec: 0 };
    };
    roxy.mode = "slow";
    const cC = roxy.calls;
    let bSlowCalls = 0;
    const [ca, cb] = await Promise.all([
      computeChartVariables(ctxA, { chart_id: hid(5) }, baseDeps({ rateLimit: sharedLock })),
      sleep(100).then(() => instB.computeChartVariables(ctxA, { chart_id: hid(5) }, baseDeps({ rateLimit: sharedLock, callVariables: async () => { bSlowCalls++; return { ok: false, kind: "server_error", status: 500 }; } }))),
    ]);
    roxy.mode = "ok";
    ok(ca.status === 200 && cb.status === 200 && roxy.calls === cC + 1 && bSlowCalls === 0 && cb.body.ok && cb.body.reused === true && JSON.stringify(ca.body.ok ? ca.body.data : 0) === JSON.stringify(cb.body.ok ? cb.body.data : 1),
      "3c iki örnek aynı analizi aynı anda ister → TEK ücretli çağrı; kilidi bekleyen örnek sonucu kalıcı depodan alır", { a: ca.status, b: cb.status, calls: roxy.calls - cC, bSlowCalls });
    ok((await rows(hid(5))).length === 1, "3d eşzamanlı istekte tek kalıcı satır");
    // Kilit sonrası yeniden denetim: B'nin ilk okumasından SONRA, kilidi almadan hemen önce A sonucu yazar.
    let aDone = false;
    let lateCalls = 0;
    const cL = roxy.calls;
    const lateLock: VariablesDeps["rateLimit"] = async (scope) => {
      if (scope === "hd-roxy-variables-inflight" && !aDone) {
        aDone = true;
        const a = await computeChartVariables(ctxA, { chart_id: hid(6) }, baseDeps());
        if (a.status !== 200) throw new Error("A örneği başarısız");
      }
      return { allowed: true, retryAfterSec: 0 };
    };
    const late = await instB.computeChartVariables(ctxA, { chart_id: hid(6) }, baseDeps({ rateLimit: lateLock, callVariables: async () => { lateCalls++; return { ok: false, kind: "server_error", status: 500 }; } }));
    ok(late.status === 200 && late.body.ok && late.body.reused === true && lateCalls === 0 && roxy.calls === cL + 1, "3e kilit alındıktan sonra kalıcı depo YENİDEN denetlenir → arada yazılan sonuç kullanılır, ikinci ücretli çağrı YOK", { s: late.status, lateCalls, calls: roxy.calls - cL });
    // Kilit hiç boşalmazsa: bekleyen örnek kısa süre sonra 409 döner, ücretli çağrı yapmaz.
    let heldCalls = 0;
    const held = await instB.computeChartVariables(ctxA, { chart_id: hid(1) }, baseDeps({ rateLimit: async (s) => ({ allowed: s !== "hd-roxy-variables-inflight", retryAfterSec: 10 }), sleep: async () => undefined, callVariables: async () => { heldCalls++; return { ok: false, kind: "server_error", status: 500 }; } }));
    ok(held.status === 409 && !held.body.ok && held.body.code === "IN_PROGRESS" && heldCalls === 0, "3f kilit başka örnekte ve sonuç henüz yok → 409, ücretli çağrı YOK");

    section("4. Tenant izolasyonu / yetkisiz kullanıcı");
    const c4 = roxy.calls;
    const rows4 = await md5("human_design_chart_variables");
    const xb = await post(UB, { chart_id: hid(0) });
    ok(xb.status === 404 && xb.j.code === "CHART_NOT_FOUND" && !xb.text.includes("arrows"), "4a başka tenant kullanıcısı, kalıcı sonucu olan analizi isteyemez → 404 (sonuç sızmaz)");
    const xs = await computeChartVariables({ db, tenantId: TB, userId: UB.id!, isDemo: false }, { chart_id: hid(0) }, baseDeps());
    ok(xs.status === 404, "4b servis düzeyinde de başka tenant bağlamı → 404");
    ok((await post(null, { chart_id: hid(0) })).status === 401 && (await post(NOSR, { chart_id: hid(0) })).status === 403 && (await post(DEMO, { chart_id: hid(0) })).status === 403, "4c oturumsuz 401 · alt yetkisiz 403 · demo 403");
    ok(roxy.calls === c4 && (await md5("human_design_chart_variables")) === rows4, "4d yetkisiz / başka tenant isteklerinde ücretli çağrı ve kalıcı yazım YOK");
    const k0 = String(row1.cache_key);
    let trig = "";
    try { await su.query(`insert into ${TABLE}(tenant_id, chart_id, cache_key, endpoint, adapter_version, node_type, lang, utc_offset_seconds, result) values ($1,$2,$3,'/human-design/variables','x','true','tr',0,'{}')`, [TB, hid(0), "a".repeat(64)]); } catch (e) { trig = (e as { code?: string }).code ?? "?"; }
    ok(trig === "23514", "4e DB tetikleyicisi: başka tenant'ın analizine sonuç satırı yazılamaz (service_role dahil)", trig);
    let fk = "";
    try { await su.query(`insert into ${TABLE}(tenant_id, chart_id, cache_key, endpoint, adapter_version, node_type, lang, utc_offset_seconds, result) values ($1,$2,$3,'/human-design/variables','x','true','tr',0,'{}')`, [TA, "eeeeeeee-4444-4000-8000-0000000fffff", "b".repeat(64)]); } catch (e) { fk = (e as { code?: string }).code ?? "?"; }
    ok(fk === "23503", "4f var olmayan analize sonuç satırı yazılamaz", fk);
    let dup = "";
    try { await su.query(`insert into ${TABLE}(tenant_id, chart_id, cache_key, endpoint, adapter_version, node_type, lang, utc_offset_seconds, result) values ($1,$2,$3,'/human-design/variables','x','true','tr',0,'{}')`, [TA, hid(0), k0]); } catch (e) { dup = (e as { code?: string }).code ?? "?"; }
    ok(dup === "23505", "4g aynı (tenant, analiz, anahtar) ikinci kez yazılamaz (benzersizlik)", dup);
    const priv = (await su.query(`select has_table_privilege('anon', '${TABLE}', 'SELECT') a_s, has_table_privilege('anon', '${TABLE}', 'INSERT') a_i, has_table_privilege('authenticated', '${TABLE}', 'SELECT') u_s, has_table_privilege('authenticated', '${TABLE}', 'UPDATE') u_u, (select relrowsecurity from pg_class where oid='${TABLE}'::regclass) rls, (select relforcerowsecurity from pg_class where oid='${TABLE}'::regclass) force, (select count(*)::int from pg_policies where schemaname='public' and tablename='human_design_chart_variables') pol`)).rows[0];
    ok(!priv.a_s && !priv.a_i && !priv.u_s && !priv.u_u && priv.rls === true && priv.force === false && priv.pol === 0, "4h anon / authenticated yetkisi YOK; RLS etkin, policy yok (deny-by-default), FORCE yok", priv);

    section("5. Değişen doğum girdisi / değişen adapter");
    const r5 = await post(UA, { chart_id: hid(2) });
    const oldKey = String((await rows(hid(2)))[0]?.cache_key);
    // Analizin kaydı yeniden oluşturulmuş gibi: doğum saati + girdi kimliği değişir (danışan da güncel → 409 değil)
    await su.query(`update public.human_design_charts set input = jsonb_set(input, '{time}', '"11:30:00"'), input_hash='ih-2b' where id=$1`, [hid(2)]);
    await su.query(`update public.human_design_clients set birth_time='11:30' where id=$1`, [cid(2)]);
    restart();
    const c5 = roxy.calls;
    const r5b = await post(UA, { chart_id: hid(2) });
    const rows5 = await rows(hid(2));
    ok(r5.status === 200 && r5b.status === 200 && r5b.j.reused === false && roxy.calls === c5 + 1 && rows5.length === 1 && rows5[0].cache_key !== oldKey && rows5[0].chart_input_hash === "ih-2b",
      "5a doğum girdisi değişti → eski kayıt KULLANILMAZ, yeni hesap; eski anahtarlı satır temizlenir (tek güncel satır)", { calls: roxy.calls - c5, n: rows5.length });
    // Danışanın doğum bilgisi analizden sonra değişirse kalıcı sonuç da dönmez (mevcut 409 kuralı depodan ÖNCE)
    await su.query(`update public.human_design_clients set birth_date='1970-01-01' where id=$1`, [cid(2)]);
    const r5c = await post(UA, { chart_id: hid(2) });
    ok(r5c.status === 409 && r5c.j.code === "BIRTH_DATA_CHANGED" && !r5c.text.includes("arrows"), "5b danışan doğum bilgisi değişti → 409; kalıcı sonuç gösterilmez");
    await su.query(`update public.human_design_clients set birth_date='1990-01-01' where id=$1`, [cid(2)]);
    // Adapter sürümü farklı satır (eski sürümle yazılmış) → kullanılmaz, yeniden hesaplanıp üzerine yazılır
    await su.query(`update ${TABLE} set adapter_version='roxy-variables-1' where chart_id=$1`, [hid(0)]);
    restart();
    const c5d = roxy.calls;
    const r5d = await post(UA, { chart_id: hid(0) });
    const row5d = (await rows(hid(0)))[0];
    ok(r5d.status === 200 && r5d.j.reused === false && roxy.calls === c5d + 1 && row5d.adapter_version === ROXY_VARIABLES_ADAPTER_VERSION && (await rows(hid(0))).length === 1,
      "5c farklı adapter sürümlü kayıt KULLANILMAZ → yeni hesap, aynı satır güncel sürümle yenilenir", { calls: roxy.calls - c5d, a: row5d.adapter_version });

    section("6. Bozuk kayıtlı sonuç (fail-closed)");
    const corrupt = async (label: string, sql: string) => {
      await su.query(sql, [hid(0)]);
      restart();
      const c = roxy.calls;
      const r = await post(UA, { chart_id: hid(0) });
      const after = (await rows(hid(0)))[0];
      ok(r.status === 200 && r.j.reused === false && roxy.calls === c + 1 && JSON.stringify(r.j.data) === JSON.stringify(r1.j.data) && (after.result as Json).arrows !== undefined && ((after.result as Json).arrows as Json[]).length === 4,
        `6 ${label} → kayıt KULLANILMAZ, yeniden hesaplanır, doğru sonuç kayda yeniden yazılır`, { s: r.status, calls: roxy.calls - c });
    };
    await corrupt("şema bozuk (3 ok)", `update ${TABLE} set result = jsonb_set(result, '{arrows}', (result->'arrows') - 3) where chart_id=$1`);
    await corrupt("Tone değeri oynanmış (yerel çapraz denetim)", `update ${TABLE} set result = jsonb_set(jsonb_set(result, '{arrows,2,tone}', to_jsonb(case when (result->'arrows'->2->>'tone')::int <= 3 then (result->'arrows'->2->>'tone')::int + 3 else (result->'arrows'->2->>'tone')::int - 3 end)), '{arrows,2,direction}', to_jsonb(case when (result->'arrows'->2->>'tone')::int <= 3 then 'right' else 'left' end)) where chart_id=$1`);
    await corrupt("girdi kimliği meta verisi tutarsız", `update ${TABLE} set chart_input_hash = 'ih-baska' where chart_id=$1`);
    await corrupt("ofset meta verisi tutarsız", `update ${TABLE} set utc_offset_seconds = 0 where chart_id=$1`);

    section("7. Belirsiz ok / tarihsel ofset — kalıcı kayıttan okunurken korunur");
    // Kayıtta bir ok sağlayıcı tarafından kesin DEĞİL işaretli (genel bayrak tutarlı)
    await su.query(`update ${TABLE} set result = jsonb_set(jsonb_set(result, '{arrows,1,confident}', 'false'), '{confident}', 'false') where chart_id=$1`, [hid(0)]);
    restart();
    const c7 = roxy.calls;
    const r7 = await post(UA, { chart_id: hid(0) });
    const a7 = ((r7.j.data as Json)?.arrows ?? []) as Json[];
    ok(r7.status === 200 && r7.j.reused === true && roxy.calls === c7 && a7[1]?.confident === false && (r7.j.data as Json).confident === false, "7a belirsiz (confident=false) ok kalıcı kayıttan aynen belirsiz döner; genel bayrak kesin değil", a7.map((a) => a.confident));
    const r7h = await post(UA, { chart_id: hid(3) });
    restart();
    const c7h = roxy.calls;
    const r7h2 = await post(UA, { chart_id: hid(3) });
    const stored3 = (await rows(hid(3)))[0];
    const d7 = r7h2.j.data as Json;
    ok(r7h.status === 200 && r7h2.status === 200 && r7h2.j.reused === true && roxy.calls === c7h && d7.historicalOffset === true && (d7.arrows as Json[]).every((a) => a.baseCertain === false) && JSON.stringify(r7h2.j.data) === JSON.stringify(r7h.j.data),
      "7b tarihsel saniyeli ofset: kalıcı kayıttan okunurken kesinlik düşürmesi YENİDEN uygulanır (Base \"?\"), ilk hesapla birebir aynı", { s: r7h2.status, calls: roxy.calls - c7h });
    ok(stored3.utc_offset_seconds === 6960 + 56 && !("historicalOffset" in (stored3.result as Json)), "7c kayıtta yalnız sağlayıcının denetlenmiş yanıtı + saniyeli ofset; türetilmiş kesinlik kayda yazılmaz", { o: stored3.utc_offset_seconds });

    section("8. Sağlayıcı zaman aşımı / DB hataları");
    roxy.mode = "timeout";
    const t8 = await post(UA, { chart_id: hid(4) });
    roxy.mode = "ok";
    ok(t8.status === 504 && t8.j.code === "PROVIDER_TIMEOUT" && (await rows(hid(4))).length === 0, "8a zaman aşımı → 504, kalıcı kayıt YAZILMAZ");
    __resetRateLimitForTest();
    const t8b = await post(UA, { chart_id: hid(4) });
    ok(t8b.status === 200 && t8b.j.reused === false && (await rows(hid(4))).length === 1, "8b sonraki istek hesaplar ve kaydeder");
    // DB okuma hatası → ücretli çağrı YOK (kontrolsüz çağrıya düşülmez)
    await su.query(`revoke select on ${TABLE} from service_role`);
    restart();
    const c8 = roxy.calls;
    const e8 = await post(UA, { chart_id: hid(7) });
    await su.query(`grant select on ${TABLE} to service_role`);
    ok(e8.status === 500 && e8.j.code === "DB_ERROR" && roxy.calls === c8 && !e8.text.includes("permission") && !e8.text.includes("human_design_chart_variables"), "8c kalıcı depo okunamıyor → 500 genel hata, ücretli çağrı YOK, iç hata sızmaz", { s: e8.status, calls: roxy.calls - c8, t: e8.text.slice(0, 200) });
    // DB yazma hatası → sonuç gösterilir (çağrı yapıldı), satır yok, loglanır
    await su.query(`revoke insert on ${TABLE} from service_role`);
    logs.length = 0;
    const w8 = await computeChartVariables(ctxA, { chart_id: hid(7) }, baseDeps());
    await su.query(`grant insert on ${TABLE} to service_role`);
    ok(w8.status === 200 && w8.body.ok && w8.body.reused === false && (await rows(hid(7))).length === 0 && logs.includes("[hd-variables] store write failed"), "8d kalıcı yazım başarısız → sonuç yine gösterilir, bozuk / yarım kayıt YOK, loglanır", { s: w8.status, logs });

    section("9. Kayıt ↔ hesap tutarlılığı / CASCADE / natal kayıtlar");
    const all = await rows();
    const consistent = all.every((r) => {
      const ch = seeds.find((s) => hid(s.n) === r.chart_id)!;
      return r.tenant_id === ch.tenant;
    });
    ok(consistent && all.every((r) => r.adapter_version === ROXY_VARIABLES_ADAPTER_VERSION), "9a her kalıcı satır, kendi analizinin tenant'ında ve güncel adapter sürümünde");
    await post(UA, { chart_id: hid(8) });
    const before9 = (await rows(hid(8))).length;
    await su.query(`delete from public.human_design_charts where id=$1`, [hid(8)]);
    ok(before9 === 1 && (await rows(hid(8))).length === 0 && (await su.query(`select count(*)::int n from public.human_design_clients where id=$1`, [cid(8)])).rows[0].n === 1, "9b analiz silinince Dört Ok sonucu da silinir (CASCADE); danışan profili korunur");
    await su.query(`insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, provider, input, input_hash, computed_result) select $1, $2, $3, 'Silinecek', 'computed', 'roxyapi', $4, 'ih-8', $5`, [hid(8), TA, cid(8), JSON.stringify({ date: "1988-08-08", time: "08:08:00", timezone: "Europe/Istanbul", latitude: 41, longitude: 29, nodeType: "true", lang: "tr" }), JSON.stringify({ activations: [] })]);
    // 5a'da değiştirilen analiz/danışan hariç natal kayıtlar birebir aynı; computed_result hiçbir analizde değişmedi
    const cr = (await su.query(`select count(*)::int n from public.human_design_charts where computed_result::text <> '{"activations": []}'`)).rows[0].n;
    await su.query(`update public.human_design_charts set input = jsonb_set(input, '{time}', '"10:00:00"'), input_hash='ih-2' where id=$1`, [hid(2)]);
    await su.query(`update public.human_design_clients set birth_time='10:00' where id=$1`, [cid(2)]);
    ok(cr === 0 && (await chartsMd5()) === charts0 && (await md5("human_design_clients")) === clients0, "9c natal analizler / danışanlar servis tarafından DEĞİŞTİRİLMEDİ (computed_result'a Variables yazılmaz)");
    ok(roxy.external.length === 0, "9d dış ağ çağrısı yok (yalnız sahte sağlayıcı)", roxy.external);
    console.log(`\n  toplam sahte sağlayıcı çağrısı: ${roxy.calls} (gerçek ücretli çağrı: 0)`);
  } finally {
    await env.stop();
    globalThis.fetch = realFetch;
  }
  console.log(`\nHD VARIABLES KALICI DEPO: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
