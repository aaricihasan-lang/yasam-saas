/**
 * HD VARIABLES — SERVİS + ROUTE testi (gerçek route handler + izole Postgres; sağlayıcı SAHTE, ücretli çağrı YOK).
 *   Yetki (oturum / modül / hd_system_reading / demo) · tenant izolasyonu · girdi doğrulama · uygunluk (manuel / mean node /
 *   eksik girdi / doğum değişmiş / hiç yaşanmamış / iki kez yaşanmış saat) · sağlayıcı hata sınıfları · şema ihlali ·
 *   bağımsız çapraz denetim ihlali · önbellek / tekrar / eşzamanlılık · kota sayaçları · veri değişmezliği · anahtar ve
 *   doğum verisi sızıntısı.
 * Çalıştır: npx tsx scripts/hd-variables/service-harness.ts   (HD_VAR_PG_PORT, varsayılan 54521; HD_VAR_PG_DIR)
 */
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mkUser, type Auth, type Json } from "../hd-analysis-word-flow/env";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { resolveBirthLocalTime } from "../../lib/human-design/api/birthTimeResolution";
import { localVariableBands } from "../../lib/human-design/variables/localVariablesCheck";
import { ARROW_SPECS, COGNITION_BY_TONE, substructureOf, toneDirection } from "../../lib/human-design/variables/variablesMath";
import { __resetVariablesCache, __variablesFailureCount, computeChartVariables } from "../../lib/human-design/variables/variablesService";
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

const TA = "0e2e2e2e-0000-4000-8000-00000000000a";
const TB = "0e2e2e2e-0000-4000-8000-00000000000b";
const cid = (n: number) => `eeeeeeee-3333-4000-8000-0000000c00${String(n).padStart(2, "0")}`;
const hid = (n: number) => `eeeeeeee-3333-4000-8000-0000000d00${String(n).padStart(2, "0")}`;
const KEY = "zz-harness-fake-variables-key-not-real";
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
insert into public.tenants(id, name) values ('${TA}', 'ZZ_VAR_A'), ('${TB}', 'ZZ_VAR_B');
grant select, insert, update, delete on public.human_design_clients, public.human_design_charts to service_role;
`;

/** Sözleşmeye uygun sahte yanıt: değerler yerel motor boylamından (çapraz denetimden geçer). */
function fakeVariables(utcIso: string, opts: { tamper?: "tone" | "schema" | "html" } = {}) {
  const bands = localVariableBands(new Date(utcIso));
  const arrows = ARROW_SPECS.map((spec) => {
    const lon = bands.find((b) => b.key === spec.key)!.longitude;
    const s = substructureOf(lon);
    let tone = s.tone;
    if (opts.tamper === "tone" && spec.key === "motivation") tone = tone <= 3 ? tone + 3 : tone - 3;
    const a: Json = {
      key: spec.key, name: spec.key, nameLocalized: `TR ${spec.key}`, layer: spec.layer, layerLocalized: "Katman", position: spec.position, positionLocalized: "Konum",
      activation: { planet: spec.planet, side: spec.side, planetLocalized: "Gezegen" }, color: s.color, tone, base: s.base, direction: toneDirection(tone),
      colorLabel: "C", colorLabelLocalized: "Renk", directionLabel: "D", directionLabelLocalized: "Yön", description: opts.tamper === "html" ? "<b>kalın</b> metin" : "Açıklama.",
      layerDescription: "Katman.", colorMeaning: "Color anlamı.", toneMeaning: "Tone anlamı.", directionMeaning: "Yön anlamı.", baseName: "B", baseNameLocalized: "Taban",
      confident: s.toneBoundaryArcsec > 9.86,
    };
    if (spec.key === "determination") a.cognition = { label: COGNITION_BY_TONE[tone - 1], labelLocalized: "Biliş", description: "Biliş açıklaması." };
    return a;
  });
  return { arrows: opts.tamper === "schema" ? arrows.slice(0, 3) : arrows, confident: arrows.every((a) => a.confident === true), confidenceMarginDeg: 0.002737909255830788, baseDescription: "Base katmanı." };
}

type Mode = "ok" | "slow" | "timeout" | "network" | "401" | "429" | "500" | "400" | "malformed" | "schema" | "tamper" | "html";

async function main() {
  const roxy = { calls: 0, keyOk: true, bodies: [] as Json[], mode: "ok" as Mode, external: [] as string[] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return realFetch(input, init);
    if (!/^https:\/\/roxyapi\.com\/api\/v2\/human-design\/variables\?lang=tr$/.test(u)) { roxy.external.push(u); throw new Error(`harness: dış ağ yasak ${u}`); }
    roxy.calls++;
    if (new Headers(init?.headers).get("x-api-key") !== KEY) roxy.keyOk = false;
    const body = JSON.parse(String(init?.body ?? "{}")) as Json;
    roxy.bodies.push(body);
    const r = resolveBirthLocalTime(String(body.date), String(body.time), String(body.timezone));
    // Gerçek sağlayıcı davranışı (20.10.2026 ölçüldü): UTC ofsetinin saniye kısmı sıfıra doğru atılır.
    const utc = r.kind === "ok" ? new Date(Date.parse(r.utcIso) + (r.offsetSeconds % 60) * 1000).toISOString() : "2000-01-01T00:00:00.000Z";
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    switch (roxy.mode) {
      case "timeout": { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
      case "network": throw new TypeError("fetch failed");
      case "401": return json({ error: `invalid key ${KEY}`, code: "unauthorized" }, 401);
      case "429": return json({ error: "x" }, 429);
      case "500": return json({ error: "x" }, 500);
      case "400": return json({ error: "x", code: "validation_error" }, 400);
      case "malformed": return new Response("<html>", { status: 200, headers: { "content-type": "application/json" } });
      case "schema": return json(fakeVariables(utc, { tamper: "schema" }));
      case "tamper": return json(fakeVariables(utc, { tamper: "tone" }));
      case "html": return json(fakeVariables(utc, { tamper: "html" }));
      case "slow": await sleep(1500); return json(fakeVariables(utc));
      default: return json(fakeVariables(utc));
    }
  }) as typeof fetch;
  process.env.ROXY_API_KEY = KEY;
  delete process.env.ROXY_API_BASE_URL;

  const env: TestEnv = await startAnamnezTestEnv({ port: Number(process.env.HD_VAR_PG_PORT ?? 54521), dirName: process.env.HD_VAR_PG_DIR ?? "hd-variables-service-pgdata", extraSql: [HD_DDL] });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    // Tohum (TA): 0 geçerli · 1 geçerli (eşzamanlılık) · 2 manuel · 3 mean node · 4 doğum değişmiş · 5 eksik girdi
    //             6 boşluk saati (Londra 29.03.2026 01:30) · 7 çakışma saati (Londra 25.10.2026 01:30) · 8 danışansız geçerli
    // TB: 9 geçerli (başka tenant)
    type Seed = { n: number; tenant: string; name: string; date: string; time: string; tz: string; source?: string; nodeType?: string; clientDate?: string; noInput?: boolean; noClient?: boolean };
    const seeds: Seed[] = [
      { n: 0, tenant: TA, name: "Ayşe Gizli", date: "1985-03-12", time: "06:45:00", tz: "Europe/Istanbul" },
      { n: 1, tenant: TA, name: "Mehmet Gizli", date: "1992-11-03", time: "23:10:00", tz: "Europe/Istanbul" },
      { n: 2, tenant: TA, name: "Manuel Kişi", date: "1990-01-01", time: "10:00:00", tz: "Europe/Istanbul", source: "manual" },
      { n: 3, tenant: TA, name: "Ortalama Düğüm", date: "1990-01-01", time: "10:00:00", tz: "Europe/Istanbul", nodeType: "mean" },
      { n: 4, tenant: TA, name: "Değişen Doğum", date: "1990-01-01", time: "10:00:00", tz: "Europe/Istanbul", clientDate: "1977-01-01" },
      { n: 5, tenant: TA, name: "Eksik Girdi", date: "1990-01-01", time: "10:00:00", tz: "Europe/Istanbul", noInput: true },
      { n: 6, tenant: TA, name: "Boşluk Saati", date: "2026-03-29", time: "01:30:00", tz: "Europe/London" },
      { n: 7, tenant: TA, name: "Çakışma Saati", date: "2026-10-25", time: "01:30:00", tz: "Europe/London" },
      { n: 8, tenant: TA, name: "Danışansız", date: "2001-06-21", time: "14:30:00", tz: "Europe/London", noClient: true },
      { n: 9, tenant: TB, name: "Başka Tenant", date: "1979-12-01", time: "08:15:00", tz: "America/New_York" },
      { n: 10, tenant: TA, name: "Metin Testi", date: "2010-08-15", time: "19:40:00", tz: "Asia/Tokyo" },
      { n: 11, tenant: TA, name: "Tarihsel LMT", date: "1905-03-15", time: "22:57:00", tz: "Europe/Istanbul" },
    ];
    for (const s of seeds) {
      if (!s.noClient) await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ($1,$2,$3,$4,$5)`, [cid(s.n), s.tenant, s.name, s.clientDate ?? s.date, s.time.slice(0, 5)]);
      const input = s.noInput ? { date: s.date } : { date: s.date, time: s.time, timezone: s.tz, latitude: 41, longitude: 29, nodeType: s.nodeType ?? "true", lang: "tr" };
      await su.query(
        `insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, provider, input, input_hash, computed_result) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [hid(s.n), s.tenant, s.noClient ? null : cid(s.n), s.name, s.source ?? "computed", (s.source ?? "computed") === "computed" ? "roxyapi" : null, JSON.stringify(input), `ih-${s.n}`, JSON.stringify({ activations: [] })],
      );
    }
    const P = { human_design: true, hd_system_reading: true };
    const UA: Auth = await mkUser(su, "VARA", TA, P);
    const UB: Auth = await mkUser(su, "VARB", TB, P);
    const NOSR: Auth = await mkUser(su, "VARN", TA, { human_design: true });
    const NOHD: Auth = await mkUser(su, "VARX", TA, { clients: true });
    const DEMO: Auth = await mkUser(su, "VARD", TA, P);
    await su.query(`update public.users set is_demo_account=true where id=$1`, [DEMO.id]);
    const route = await import("../../app/api/hd/charts/variables/route");
    const post = async (a: Auth | null, body: unknown, raw = false) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (a) { headers["x-user-id"] = a.id!; headers["x-session-token"] = a.token!; }
      const res = await route.POST(new NextRequest("http://localhost/api/hd/charts/variables", { method: "POST", headers, body: raw ? String(body) : JSON.stringify(body) }));
      const text = await res.text();
      return { status: res.status, j: JSON.parse(text) as Json, text, cache: res.headers.get("cache-control") ?? "" };
    };
    const snap = async () => (await su.query(`select md5(string_agg(row_to_json(c)::text, '|' order by id)) h from (select * from public.human_design_charts union all select null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null) c`)).rows[0].h as string;
    const charts0 = (await su.query(`select md5(string_agg(row_to_json(c)::text, '|' order by id)) h from public.human_design_charts c`)).rows[0].h as string;
    const clients0 = (await su.query(`select md5(string_agg(row_to_json(c)::text, '|' order by id)) h from public.human_design_clients c`)).rows[0].h as string;
    void snap;

    section("1. Geçerli hesap");
    const r1 = await post(UA, { chart_id: hid(0) });
    const d1 = (r1.j.data ?? {}) as Json;
    const arrows = (d1.arrows ?? []) as Json[];
    ok(r1.status === 200 && r1.j.reused === false && roxy.calls === 1 && roxy.keyOk && r1.cache.includes("no-store"), "1a 200, yeni hesap, tek sahte çağrı, anahtar yalnız başlıkta, no-store", { s: r1.status, j: r1.text.slice(0, 300) });
    ok(arrows.map((a) => a.key).join() === "determination,environment,motivation,perspective" && arrows.every((a) => ARROW_SPECS.find((s) => s.key === a.key)!.position === a.position), "1b dört ok sabit sırada ve doğru konumda");
    const sent = roxy.bodies[0];
    ok(JSON.stringify(Object.keys(sent).sort()) === JSON.stringify(["date", "latitude", "longitude", "nodeType", "time", "timezone"]) && sent.date === "1985-03-12" && sent.time === "06:45:00" && sent.timezone === "Europe/Istanbul" && sent.nodeType === "true", "1c sağlayıcıya YALNIZ doğum anı alanları (kayıtlı analizle birebir); ad / danışan / not YOK", sent);
    ok(!r1.text.includes(KEY) && !r1.text.includes("Ayşe") && !r1.text.includes("1985-03-12") && !r1.text.includes("06:45"), "1d yanıtta anahtar, danışan adı, doğum tarihi / saati YOK");
    ok(d1.historicalOffset === false && arrows.every((a) => a.baseCertain === true), "1e modern doğum (saniyesiz ofset): kesinlik düşürülmez, Base kesin");
    const callsL = roxy.calls;
    const rL = await post(UA, { chart_id: hid(11) });
    const dL = (rL.j.data ?? {}) as Json;
    const aL = (dL.arrows ?? []) as Json[];
    const rawL = fakeVariables(new Date(Date.parse("1905-03-15T21:00:04Z") + 56_000).toISOString());
    const bandsL = localVariableBands(new Date("1905-03-15T21:00:04Z"));
    const sunDowngradeOk = aL.filter((a) => a.key === "determination" || a.key === "motivation").every((a) => {
      const prov = rawL.arrows.find((x) => x.key === a.key)!;
      const local = substructureOf(bandsL.find((b) => b.key === a.key)!.longitude).toneBoundaryArcsec;
      return a.confident === (prov.confident === true && local >= 0.002737909255830788 * 3600 + 56 * 0.0425 + bandsL.find((b) => b.key === a.key)!.bandArcsec);
    });
    ok(rL.status === 200 && roxy.calls === callsL + 1 && roxy.bodies[roxy.bodies.length - 1].time === "22:57:00" && dL.historicalOffset === true && aL.every((a) => a.baseCertain === false),
      "1f tarihsel saniyeli ofset (İstanbul 1905, +1:56:56): sağlayıcıya giden saat DEĞİŞMEZ; dört okun Base'i kesinleştirilemedi", { s: rL.status, j: rL.text.slice(0, 200) });
    ok(sunDowngradeOk && aL.every((a) => a.confident === false || rawL.arrows.find((x) => x.key === a.key)!.confident === true) && dL.confident === aL.every((a) => a.confident === true),
      "1g tarihsel ofsette kesinlik yalnız DÜŞER (Güneş okları yerel Tone payı < eşik + sapma + bant ise), asla yükselmez; genel bayrak yeniden hesaplanır", aL.map((a) => [a.key, a.confident]));

    section("2. Önbellek / tekrar / eşzamanlılık");
    const calls2a = roxy.calls;
    const r2 = await post(UA, { chart_id: hid(0) });
    ok(r2.status === 200 && r2.j.reused === true && roxy.calls === calls2a && JSON.stringify(r2.j.data) === JSON.stringify(r1.j.data), "2a aynı analiz tekrar → süreç önbelleği, ücretli çağrı YOK");
    roxy.mode = "slow";
    const callsC = roxy.calls;
    const [p1, p2, p3] = await Promise.all([post(UA, { chart_id: hid(1) }), post(UA, { chart_id: hid(1) }), post(UA, { chart_id: hid(1) })]);
    roxy.mode = "ok";
    ok(roxy.calls === callsC + 1 && [p1, p2, p3].every((p) => p.status === 200) && [p1, p2, p3].filter((p) => p.j.reused === true).length === 2, "2b eşzamanlı 3 aynı istek (çift tık) → tek ücretli çağrı", { calls: roxy.calls - callsC, s: [p1.status, p2.status, p3.status] });
    const r8 = await post(UA, { chart_id: hid(8) });
    ok(r8.status === 200, "2c danışana bağlı olmayan geçerli analiz de hesaplanır", r8.j);

    section("3. Yetki / tenant izolasyonu (ücretli çağrı YOK)");
    const before3 = roxy.calls;
    ok((await post(null, { chart_id: hid(0) })).status === 401, "3a oturumsuz → 401");
    const fake = await route.POST(new NextRequest("http://localhost/api/hd/charts/variables", { method: "POST", headers: { "content-type": "application/json", "x-user-id": UA.id!, "x-session-token": "sahte-token" }, body: JSON.stringify({ chart_id: hid(0) }) }));
    ok(fake.status === 401, "3b sahte oturum anahtarı → 401", fake.status);
    const fakeUser = await route.POST(new NextRequest("http://localhost/api/hd/charts/variables", { method: "POST", headers: { "content-type": "application/json", "x-user-id": UB.id!, "x-session-token": UA.token! }, body: JSON.stringify({ chart_id: hid(0) }) }));
    const fakeUserJ = (await fakeUser.json()) as Json;
    ok(fakeUser.status === 403 && fakeUserJ.error === "Oturum kimliği uyuşmuyor." && !fakeUserJ.data, "3c sahte x-user-id (başka kullanıcının kimliği + kendi oturumu) → 403 \"Oturum kimliği uyuşmuyor\" (mevcut bağlama kuralı, userGuard)", { s: fakeUser.status, j: fakeUserJ });
    const REJ: Auth = await mkUser(su, "VARR", TA, P);
    await su.query(`update public.users set approval_status='rejected' where id=$1`, [REJ.id]);
    const rej = await post(REJ, { chart_id: hid(0) });
    ok(rej.status === 403 && !rej.j.data, "3c2 reddedilmiş / askıdaki kullanıcı → 403", { s: rej.status, j: rej.j });
    ok((await post(NOHD, { chart_id: hid(0) })).status === 403, "3d Human Design modülü yok → 403");
    const nosr = await post(NOSR, { chart_id: hid(0) });
    ok(nosr.status === 403 && nosr.j.code === "VARIABLES_DENIED", "3e hd_system_reading alt yetkisi yok → 403");
    const demo = await post(DEMO, { chart_id: hid(0) });
    ok(demo.status === 403 && demo.j.code === "DEMO_READONLY", "3f demo hesap → 403 (ücretli çağrı yapamaz)");
    const xb = await post(UB, { chart_id: hid(0) });
    const xa = await post(UA, { chart_id: hid(9) });
    ok(xb.status === 404 && xa.status === 404 && xb.j.code === "CHART_NOT_FOUND", "3g başka tenant'ın analizi → 404 (önbellekteki sonuç da dönmez; varlık sızmaz)");
    ok(roxy.calls === before3, "3h yetkisiz / başka tenant isteklerinde ücretli çağrı YOK");

    section("4. Girdi doğrulama ve uygunluk (ücretli çağrı YOK)");
    const before4 = roxy.calls;
    ok((await post(UA, { chart_id: "x" })).status === 400 && (await post(UA, { chart_id: "../../etc" })).status === 400 && (await post(UA, [])).status === 400, "4a geçersiz kimlik / dizi gövde → 400");
    ok((await post(UA, "{bozuk", true)).status === 400, "4b bozuk JSON → 400");
    ok((await route.GET()).status === 405, "4c GET → 405");
    const e2 = await post(UA, { chart_id: hid(2) });
    const e3 = await post(UA, { chart_id: hid(3) });
    const e4 = await post(UA, { chart_id: hid(4) });
    const e5 = await post(UA, { chart_id: hid(5) });
    const e6 = await post(UA, { chart_id: hid(6) });
    const e7 = await post(UA, { chart_id: hid(7) });
    ok(e2.status === 422 && e2.j.code === "CHART_NOT_ELIGIBLE", "4d manuel analiz → 422");
    ok(e3.status === 422 && e3.j.code === "CHART_POLICY_MISMATCH", "4e mean node analizi → 422");
    ok(e4.status === 409 && e4.j.code === "BIRTH_DATA_CHANGED", "4f danışanın doğum bilgisi analizden sonra değişmiş → 409 (eski veriden sessiz hesap yok)");
    ok(e5.status === 422 && e5.j.code === "CHART_INCOMPLETE", "4g eksik doğum girdisi (saat / saat dilimi yok) → 422");
    ok(e6.status === 422 && e6.j.code === "BIRTH_TIME_GAP", "4h hiç yaşanmamış yerel saat → 422 (sağlayıcının sessiz ileri kaydırması engellendi)");
    ok(e7.status === 422 && e7.j.code === "BIRTH_TIME_AMBIGUOUS", "4i iki kez yaşanmış yerel saat → 422 (sağlayıcının sessiz ilk-geçiş seçimi engellendi)");
    ok(roxy.calls === before4, "4j uygunsuz kayıtlarda ücretli çağrı YOK");

    section("5. Sağlayıcı hataları — sonuç gösterilmez / önbelleğe girmez");
    const errs: Array<[Mode, number, string]> = [
      ["timeout", 504, "PROVIDER_TIMEOUT"], ["network", 502, "PROVIDER_UNAVAILABLE"], ["401", 502, "PROVIDER_CONFIG"], ["429", 503, "PROVIDER_BUSY"],
      ["500", 502, "PROVIDER_UNAVAILABLE"], ["400", 422, "PROVIDER_REJECTED"], ["malformed", 502, "PROVIDER_INVALID_RESPONSE"], ["schema", 502, "PROVIDER_INVALID_RESPONSE"],
      ["tamper", 502, "PROVIDER_INCONSISTENT"],
    ];
    for (const [mode, status, code] of errs) {
      __resetVariablesCache();
      __resetRateLimitForTest();
      roxy.mode = mode;
      const r = await post(UA, { chart_id: hid(0) });
      roxy.mode = "ok";
      const again = await post(UA, { chart_id: hid(0) });
      ok(r.status === status && r.j.code === code && !r.j.data && !r.text.includes(KEY) && again.status === 200 && again.j.reused === false,
        `5 ${mode} → ${status} ${code}; anahtar sızmaz; hata önbelleğe girmez (sonraki istek yeniden hesaplar)`, { s: r.status, c: r.j.code, again: again.status, reused: again.j.reused });
    }
    // Not: aynı analiz için 20 sn'lik DB eşzamanlılık kilidi hâlâ dolu (yukarıdaki son hesap) → ayrı analiz kullanılır.
    roxy.mode = "html";
    const h = await post(UA, { chart_id: hid(10) });
    roxy.mode = "ok";
    const hText = h.status === 200 ? ((((h.j.data as Json).arrows as Json[])[0].text as Json).description as string) : "";
    ok(h.status === 200 && hText === "<b>kalın</b> metin", "5b sağlayıcı metnindeki HTML düz metin olarak taşınır (arayüz yorumlamaz)", { s: h.status, code: h.j.code, hText });

    section("6. Yapılandırma / kota");
    delete process.env.ROXY_API_KEY;
    __resetVariablesCache();
    const nc = await post(UA, { chart_id: hid(0) });
    process.env.ROXY_API_KEY = KEY;
    ok(nc.status === 503 && nc.j.code === "NOT_CONFIGURED", "6a anahtar yok → 503, çağrı yok");
    const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
    __resetVariablesCache();
    let qCalls = 0;
    const q = await computeChartVariables({ db, tenantId: TA, userId: UA.id!, isDemo: false }, { chart_id: hid(0) }, {
      config: { apiKey: "k", baseUrl: "https://example.invalid" },
      callVariables: async () => { qCalls++; return { ok: false, kind: "server_error", status: 500 }; },
      rateLimit: async (scope) => ({ allowed: scope !== "hd-roxy-user", retryAfterSec: 60 }),
    });
    ok(q.status === 429 && !q.body.ok && q.body.code === "RATE_LIMITED" && qCalls === 0, "6b ortak kullanıcı kotası dolu → 429, ücretli çağrı YOK");
    const scopes: string[] = [];
    await computeChartVariables({ db, tenantId: TA, userId: UA.id!, isDemo: false }, { chart_id: hid(1) }, {
      config: { apiKey: "k", baseUrl: "https://example.invalid" },
      callVariables: async () => ({ ok: false, kind: "server_error", status: 500 }),
      rateLimit: async (scope) => { scopes.push(scope); return { allowed: true, retryAfterSec: 0 }; },
    });
    ok(JSON.stringify(scopes) === JSON.stringify(["hd-roxy-variables-inflight", "hd-roxy-user", "hd-roxy-tenant"]), "6c kilit + BodyGraph / İlişki ile ORTAK kota sayaçları", scopes);
    __resetVariablesCache();
    let lockCalls = 0;
    const locked = await computeChartVariables({ db, tenantId: TA, userId: UA.id!, isDemo: false }, { chart_id: hid(0) }, {
      config: { apiKey: "k", baseUrl: "https://example.invalid" },
      callVariables: async () => { lockCalls++; return { ok: false, kind: "server_error", status: 500 }; },
      rateLimit: async (scope) => ({ allowed: scope !== "hd-roxy-variables-inflight", retryAfterSec: 10 }),
      sleep: async () => undefined,
    });
    ok(locked.status === 409 && !locked.body.ok && locked.body.code === "IN_PROGRESS" && lockCalls === 0, "6d başka sunucu örneği aynı analizi hesaplıyor (DB kilidi dolu) → 409, ikinci ücretli çağrı YOK");
    __resetVariablesCache();
    const failDeps = (t: number) => ({
      config: { apiKey: "k", baseUrl: "https://example.invalid" },
      callVariables: async () => ({ ok: false as const, kind: "server_error" as const, status: 500 }),
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
      now: () => t,
    });
    const T0 = Date.now();
    await computeChartVariables({ db, tenantId: TA, userId: UA.id!, isDemo: false }, { chart_id: hid(0) }, failDeps(T0));
    await computeChartVariables({ db, tenantId: TA, userId: UA.id!, isDemo: false }, { chart_id: hid(1) }, failDeps(T0 + 1000));
    const before = __variablesFailureCount();
    await computeChartVariables({ db, tenantId: TA, userId: UA.id!, isDemo: false }, { chart_id: hid(8) }, failDeps(T0 + 30_500));
    ok(before === 2 && __variablesFailureCount() === 2, "6e süresi geçen hata kayıtları ayıklanır (süreç belleği sınırsız büyümez)", { before, after: __variablesFailureCount() });

    section("7. Kayıtlar korunur");
    const charts1 = (await su.query(`select md5(string_agg(row_to_json(c)::text, '|' order by id)) h from public.human_design_charts c`)).rows[0].h as string;
    const clients1 = (await su.query(`select md5(string_agg(row_to_json(c)::text, '|' order by id)) h from public.human_design_clients c`)).rows[0].h as string;
    ok(charts1 === charts0 && clients1 === clients0, "7a natal analizler ve danışanlar BİREBİR aynı (yazma / değiştirme / silme yok)");
    const tables = (await su.query(`select tablename from pg_tables where schemaname='public' and tablename like 'human_design%'`)).rows.map((r) => r.tablename);
    ok(tables.length === 2, "7b yeni tablo yok", tables);
    const msgs = JSON.stringify([e2.j, e3.j, e4.j, e5.j, e6.j, e7.j, nc.j, demo.j, nosr.j]);
    ok(!/roxy|kredi|kota|maliyet/i.test(msgs), "7c kullanıcı mesajlarında sağlayıcı / kredi / kota ifadesi yok");
    ok(roxy.external.length === 0, "7d dış ağ çağrısı yok (yalnız sahte sağlayıcı)", roxy.external);
  } finally {
    await env.stop();
    globalThis.fetch = realFetch;
  }
  console.log(`\nHD VARIABLES SERVİS/ROUTE: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
