/**
 * HD — 24 saatlik geçici sınırsız izin: Dört Ok/Variables, Kişisel Transit ve Eğitim Merkezi kurgusal harita akışları.
 * GERÇEK route handler + GERÇEK migration'lar (izole Postgres) + SAHTE sağlayıcı (ücretli çağrı 0, dış ağ = hata).
 * Çalıştırma: npx tsx scripts/hd-unlimited-grant/flows-harness.ts   (UGF_PG_PORT varsayılan rastgele 54600–54689)
 * Her akış için: normal 20/saat (21. → 429) · izin aktif (25 çağrı 429'suz) · aynı tenant'taki başka uzman normal · eşzamanlı
 * aynı istek tek sağlayıcı çağrısı (kilit korunur) · süre dolunca normal (izinli çağrılar sayacı DOLDURMAMIŞ: 20 + 21. → 429)
 * · yeniden izin · DB hatasında izin yok (fail-closed) · tenant 100/gün doluyken izinli uzman geçer, izinsiz uzman 429
 * · başka tenant'a ait izin bu tenant'ta geçersiz.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { mkUser, callRoute, FIXTURE, type Auth, type Json } from "../hd-analysis-word-flow/env";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { privateArchiveSql, PRIVATE_RPCS } from "../hd-education/private/pgSchema";
import { consistentRoxyResponse } from "../hd-roxy/consistentFixture";
import { engineChart, type Moment } from "../hd-relations/fakeRelationRoxy";
import { fakePlanetsResponse, fakeTransitResponse } from "../hd-transit/fakeRoxyTransit";
import { resolveBirthLocalTime } from "../../lib/human-design/api/birthTimeResolution";
import { localVariableBands } from "../../lib/human-design/variables/localVariablesCheck";
import { ARROW_SPECS, COGNITION_BY_TONE, substructureOf, toneDirection } from "../../lib/human-design/variables/variablesMath";
import { PRIV_FICTIONAL_DECLARATION_VERSION } from "../../lib/human-design/education/private/privateContract";
import { hitDbRateLimit, rateLimitBucket } from "../../lib/security/dbRateLimit";
import { __resetRateLimitForTest } from "../../lib/security/rateLimit";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const TA = "0f0f0f0f-0000-4000-8000-00000000000a";
const TB = "0f0f0f0f-0000-4000-8000-00000000000b";

/** Sözleşmeye uygun sahte Variables yanıtı (yerel motor boylamından; çapraz denetimden geçer) — hd-variables/persist-harness ile aynı. */
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

async function main() {
  const prov = { variables: 0, transit: 0, planets: 0, bodygraph: 0, external: [] as string[] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    const json = (o: unknown) => new Response(typeof o === "string" ? o : JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
    const body = JSON.parse(String(init?.body ?? "{}")) as Json;
    if (/roxyapi\.com\/api\/v2\/human-design\/variables\?lang=tr$/.test(u)) {
      prov.variables++;
      await new Promise((r) => setTimeout(r, 20));
      const r = resolveBirthLocalTime(String(body.date), String(body.time), String(body.timezone));
      const utc = r.kind === "ok" ? new Date(Date.parse(r.utcIso) + (r.offsetSeconds % 60) * 1000).toISOString() : "2000-01-01T00:00:00.000Z";
      return json(fakeVariables(utc));
    }
    if (/roxyapi\.com\/api\/v2\/human-design\/transit\?lang=tr$/.test(u)) {
      prov.transit++;
      await new Promise((r) => setTimeout(r, 20));
      const b = body as unknown as { birthData: Moment; date: string; time: string };
      return json(fakeTransitResponse(b.birthData, b.date, b.time));
    }
    if (/roxyapi\.com\/api\/v2\/astrology\/planets\?lang=en$/.test(u)) {
      prov.planets++;
      return json(fakePlanetsResponse(`${String(body.date)}T${String(body.time)}Z`));
    }
    if (/roxyapi\.com\/.*human-design\/bodygraph/.test(u)) {
      prov.bodygraph++;
      await new Promise((r) => setTimeout(r, 20));
      return json(consistentRoxyResponse(FIXTURE, init?.body));
    }
    prov.external.push(u);
    throw new Error(`harness: dış ağ yasak ${u}`);
  }) as typeof fetch;
  process.env.ROXY_API_KEY = "zz-harness-fake-roxy-key";
  delete process.env.ROXY_API_BASE_URL;
  delete process.env.TEST_QUOTA_EXEMPT_USER_IDS;
  delete process.env.TEST_QUOTA_EXEMPT_TENANT_IDS;
  delete process.env.TEST_QUOTA_EXEMPT_WINDOW;
  process.env.HD_TRANSIT_PLANET_STORE = "off";
  process.env.HD_PRIVATE_EDUCATION_ENABLED = "true";

  const env: TestEnv = await startAnamnezTestEnv({
    port: Number(process.env.UGF_PG_PORT ?? 54600 + Math.floor(Math.random() * 90)),
    dirName: `hd-ug-flows-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: PRIVATE_RPCS,
    extraSql: [
      ...privateArchiveSql(),
      mig("20271105000000_hd_chart_variables.sql"),
      `insert into public.tenants(id, name) values ('${TA}', 'ZZ_UGF_A'), ('${TB}', 'ZZ_UGF_B') on conflict do nothing`,
      mig("20271231000200_hd_unlimited_24h_grants.sql"),
    ],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  await su.query(`grant select, insert, update, delete on public.human_design_clients, public.human_design_charts, public.human_design_reports to service_role`);
  const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
  try {
    const P = { human_design: true, clients: true, hd_system_reading: true };
    const OWNER: Auth = await mkUser(su, "UGFOWNER", TA, P);
    await su.query(`update public.users set role='admin', is_super_admin=true, admin_level='owner' where id=$1`, [OWNER.id]);
    const E1: Auth = await mkUser(su, "UGFE1", TA, P); // izin verilecek uzman
    const E2: Auth = await mkUser(su, "UGFE2", TA, P); // aynı tenant, izinsiz (normal sınır)
    const E3: Auth = await mkUser(su, "UGFE3", TA, P); // aynı tenant, izinsiz (tenant sınırı kanıtı)
    // Eğitim Merkezi özel arşiv: kapı açık + üç uzmana eğitmen yetkisi
    await su.query(`select public.hd_edu_priv_owner_set_open($1,true,null)`, [OWNER.id]);
    for (const e of [E1, E2, E3]) await su.query(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, e.id]);

    // Kayıtlı bireysel analizler (Dört Ok ve Kişisel Transit için) — her çağrı farklı harita → önbellek/yeniden kullanım yok
    const charts: Array<{ c: string; h: string }> = [];
    for (let i = 0; i < 90; i++) {
      const m: Moment = {
        date: new Date(Date.UTC(1950, 0, 1) + i * 97 * 86_400_000).toISOString().slice(0, 10),
        time: `${String(5 + (i % 14)).padStart(2, "0")}:${String((i * 11) % 60).padStart(2, "0")}:00`,
        timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784,
      };
      const c = randomUUID(); const h = randomUUID();
      await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ($1,$2,$3,$4,$5)`, [c, TA, `UgfKişi${i}`, m.date, m.time.slice(0, 5)]);
      await su.query(`insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, provider, input, input_hash, computed_result) values ($1,$2,$3,$4,'computed','roxyapi',$5,$6,$7)`,
        [h, TA, c, `UgfKişi${i}`, JSON.stringify({ ...m, nodeType: "true", lang: "tr" }), `ihugf-${i}`, JSON.stringify(engineChart(m))]);
      charts.push({ c, h });
    }

    const routes = {
      variables: await import("../../app/api/hd/charts/variables/route"),
      transit: await import("../../app/api/hd/transit/personal/route"),
      fictional: await import("../../app/api/hd/education/private/fictional/route"),
    };
    type Flow = { key: "variables" | "transit" | "fictional"; title: string; ok: number; call: (a: Auth, i: number) => Promise<{ status: number; json: Json }> };
    const flows: Flow[] = [
      { key: "variables", title: "Dört Ok / Variables", ok: 200, call: (a, i) => callRoute(routes.variables.POST, "POST", a, { chart_id: charts[i].h }) },
      { key: "transit", title: "Kişisel Transit", ok: 200, call: (a, i) => callRoute(routes.transit.POST, "POST", a, { client_id: charts[i].c, chart_id: charts[i].h, date: "2026-10-19", time: "09:00" }) },
      {
        key: "fictional", title: "Eğitim Merkezi kurgusal harita", ok: 201,
        call: (a, i) => callRoute(routes.fictional.POST, "POST", a, {
          title: `ZZ Kurgusal ${i}`, aliasLabel: `Kurgusal ${i}`, category: "tip", birthDate: new Date(Date.UTC(1960, 0, 1) + i * 131 * 86_400_000).toISOString().slice(0, 10),
          birthTime: `${String(4 + (i % 16)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`, locationRef: i % 2 ? "tr-06-ankara" : "trd-42-selcuklu",
          declarationAccepted: true, declarationVersion: PRIV_FICTIONAL_DECLARATION_VERSION,
        }),
      },
    ];
    const grant = async (uid: string) => (await su.query(`select out_status from public.hd_unlimited_grant_24h($1,$2)`, [uid, OWNER.id])).rows[0]?.out_status as string;
    const expire = (uid: string) => su.query(`update public.hd_unlimited_grants set granted_at = granted_at - interval '25 hours', expires_at = expires_at - interval '25 hours' where user_id=$1`, [uid]);

    for (const f of flows) {
      section(`${f.title}`);
      __resetRateLimitForTest();
      await su.query(`delete from public.hd_unlimited_grants`);
      let idx = 0;
      const provCalls = () => (f.key === "variables" ? prov.variables : f.key === "transit" ? prov.transit : prov.bodygraph);
      /** n yeni hesap; 200/201 sayısı ve ilk 429'un sırası. */
      const run = async (a: Auth, n: number) => {
        let okN = 0; let first429 = -1; const other: string[] = [];
        for (let k = 0; k < n; k++) {
          const r = await f.call(a, idx++);
          if (r.status === f.ok) okN++;
          else if (r.status === 429) { if (first429 < 0) first429 = k + 1; }
          else other.push(`${r.status}:${String(r.json.code ?? r.json.error ?? "")}`);
        }
        return { okN, first429, other };
      };

      // 1) Akış gerçekten aynı 20/saat sınırına tabi
      const p0 = provCalls();
      const n1 = await run(E2, 21);
      ok(n1.okN === 20 && n1.first429 === 21 && n1.other.length === 0 && provCalls() - p0 === 20,
        `${f.key}: izinsiz uzman 20 hesap → 21. istek 429 (hd-roxy-user 20/saat bu akışa uygulanıyor)`, { n1, prov: provCalls() - p0 });

      // 2) İzin aktif → 20'nin üstünde 429 yok
      ok((await grant(E1.id!)) === "granted", `${f.key}: owner izni tanımlandı (DB fonksiyonu)`);
      const p1 = provCalls();
      const n2 = await run(E1, 25);
      ok(n2.okN === 25 && n2.first429 < 0 && n2.other.length === 0 && provCalls() - p1 === 25, `${f.key}: izin aktif → 25 hesap 429'suz (her biri gerçek sahte sağlayıcı çağrısı)`, { n2, prov: provCalls() - p1 });

      // 3) Aynı tenant'taki başka uzman normal sınırda kalır
      const e2 = await f.call(E2, idx++);
      ok(e2.status === 429, `${f.key}: izin aktifken aynı tenant'taki izinsiz uzman hâlâ 429`, e2.status);

      // 4) Eşzamanlılık kilidi korunur (aynı girdi, iki eşzamanlı istek → tek sağlayıcı çağrısı)
      const pc = provCalls(); const same = idx++;
      const [c1, c2] = await Promise.all([f.call(E1, same), f.call(E1, same)]);
      ok(provCalls() - pc === 1 && [c1.status, c2.status].includes(f.ok), `${f.key}: izinli uzmanda eşzamanlı aynı istek → tek sağlayıcı çağrısı (kilit/yeniden kullanım değişmedi)`,
        { s: [c1.status, c2.status], calls: provCalls() - pc });

      // 5) Süre dolunca normal sınır; izinli çağrılar sayacı DOLDURMAMIŞ (sıfırlama yok)
      await expire(E1.id!);
      const n5 = await run(E1, 21);
      ok(n5.okN === 20 && n5.first429 === 21, `${f.key}: süre dolunca normal → 20 hesap + 21. istek 429 (izinli 26+ çağrı sayaca yazılmamış)`, n5);

      // 6) Yeniden izin → sayaç dolu olsa da geçer
      ok((await grant(E1.id!)) === "granted", `${f.key}: süre dolduktan sonra yeni 24 saatlik izin`);
      const r6 = await f.call(E1, idx++);
      ok(r6.status === f.ok, `${f.key}: yeni izinle saatlik sayaç dolu uzman yine hesaplar`, r6.status);

      // 7) DB hatası → izin YOK (fail-closed: normal sınır)
      await su.query(`alter table public.hd_unlimited_grants rename to hd_unlimited_grants_zz`);
      const p7 = provCalls();
      const r7 = await f.call(E1, idx++);
      await su.query(`alter table public.hd_unlimited_grants_zz rename to hd_unlimited_grants`);
      ok(r7.status === 429 && provCalls() === p7, `${f.key}: izin tablosu okunamazsa izin yok sayılır → 429, sağlayıcı çağrılmaz`, r7.status);
      const r7b = await f.call(E1, idx++);
      ok(r7b.status === f.ok, `${f.key}: tablo geri gelince izin yeniden geçerli`, r7b.status);

      // 8) Tenant 100/gün: doluyken izinli uzman geçer, izinsiz uzman 429
      const tb = rateLimitBucket("hd-roxy-tenant", TA);
      for (let k = 0; k < 120; k++) { const r = await hitDbRateLimit(db, tb, 100, 86_400); if (!r.allowed) break; }
      const r8a = await f.call(E3, idx++);
      ok(r8a.status === 429 && /günlük|gün/i.test(JSON.stringify(r8a.json)), `${f.key}: tenant günlük 100 dolu → izinsiz uzman 429 (günlük sınır)`, r8a);
      const r8b = await f.call(E1, idx++);
      ok(r8b.status === f.ok, `${f.key}: tenant günlük sınırı doluyken izinli uzman hesaplar (hd-roxy-tenant istisnası)`, r8b.status);

      // 9) İzin yalnız uzmanın KENDİ tenant'ında geçerli (tenant sunucuda oturum / kullanıcı kaydından okunur):
      //    izin kaydı başka tenant'a aitse → normal sınır. (Eğitim kapısı tenant değişen uzmanı zaten 404 ile durdurur.)
      await su.query(`update public.hd_unlimited_grants set tenant_id=$2 where user_id=$1`, [E1.id, TB]);
      const r9 = await f.call(E1, idx++);
      await su.query(`update public.hd_unlimited_grants set tenant_id=$2 where user_id=$1`, [E1.id, TA]);
      ok(r9.status === 429, `${f.key}: başka tenant'a ait izin bu tenant'ta geçersiz → normal sınır (429)`, r9.status);
    }

    section("Genel");
    const cnt = (await su.query(`select count(*)::int n from public.hd_unlimited_grants where expires_at <> granted_at + interval '24 hours'`)).rows[0].n;
    ok(cnt === 0, "tüm izin kayıtları tam 24 saat (CHECK)");
    ok(prov.external.length === 0, "dış ağ çağrısı 0 (gerçek ücretli sağlayıcı çağrısı YOK)", prov.external);
    console.log(`  sahte sağlayıcı çağrıları: variables=${prov.variables} transit=${prov.transit} bodygraph=${prov.bodygraph} planets=${prov.planets}`);
  } finally {
    await env.stop();
  }
  console.log(`\nHD 24S İZİN — EK AKIŞLAR: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.map((s) => ` - ${s}`).join("\n")); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
