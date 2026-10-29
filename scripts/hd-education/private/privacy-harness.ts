/**
 * FAZ 7 — Özel eğitim haritası API MAHREMİYET testi (P0).
 * Gerçek biçimli SENTETİK harita (repo fixture → gerçek doğrulama/normalizasyon zinciri) + her kişisel alana gömülü benzersiz
 * işaretler (doğum tarihi/saati/yeri, saat dilimi, koordinat, UTC/Design anı, boylam, uyarı, açıklama, sağlayıcı yorum metni,
 * bilinmeyen iç içe alan, gerçek ad, izin verenin adı, kaynak kimlikleri). 4 izin kapsamı × eğitmen/owner × liste/ayrıntı.
 * Ölçüt: izin dışı hiçbir işaret API gövdesinde YOK; izinli alanlar VAR; BodyGraph çizim durumu tam veriyle BİREBİR aynı.
 * Çalıştır: npx tsx scripts/hd-education/private/privacy-harness.ts   (HD_EDU_PRIV_PRIVACY_PORT, varsayılan 54761)
 */
import "../../hd-analysis-word-flow/env";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv } from "../../anamnez/testEnv";
import { privateArchiveSql, PRIVATE_RPCS } from "./pgSchema";
import { syntheticEducationSnapshot } from "../syntheticSnapshot";
import { syntheticEducationSnapshotGDefined } from "./gCenterFixture";
import { CENTERS } from "../../../lib/human-design/engine/channels";
import { premiumStateFromChart } from "../../../lib/human-design/bodygraph/premiumChartState";
import { buildEduChartView } from "../../../lib/human-design/education/private/privateChartView";
import type { HdComputedChart } from "../../../lib/human-design/chart/computedChart";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

// İşaretler — her biri tek bir kaynağa ait; yanıtta görünmesi o kaynağın sızdığını kanıtlar.
const M = {
  date: "1937-11-23", dateTr: "23.11.1937", time: "04:51", place: "ZZYERMARK", tz: "ZZ/Marker_Zone", lat: "41.01234", lon: "28.98765",
  birthUtc: "1937-11-23T02:51", design: "1937-08-2", longitude: "123.456789", warn: "ZZWARNMARK", disc: "ZZDISCMARK", nested: "zzNestedSecret",
  roxyText: "ZZROXYTEXTMARK", realName: "ZZGERCEKADMARK", consenter: "ZZIZINVERENMARK", engine: "ZZENGINEMARK", endpoint: "/zz-endpoint-mark",
};

async function main() {
  const external: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    external.push(u);
    throw new Error(`harness: dış ağ yasak ${u}`);
  }) as typeof fetch;
  const env = await startAnamnezTestEnv({
    port: Number(process.env.HD_EDU_PRIV_PRIVACY_PORT ?? 54761), dirName: `hd-edu-priv-privacy-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: PRIVATE_RPCS, extraSql: privateArchiveSql(),
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.HD_PRIVATE_EDUCATION_ENABLED = "true";
  const su = env.su;
  await su.query(`grant select, insert, update, delete on public.human_design_clients, public.human_design_charts to service_role`);
  try {
    const R = (p: string) => import(`../../../app/api/${p}/route`) as Promise<Record<string, Handler>>;
    const tItems = await R("hd/education/private/items");
    const tItem = (await R("hd/education/private/items/[id]")).GET;
    const tConsents = await R("hd/education/private/consents");
    const oItems = (await R("admin/hd/education/private/items")).GET;
    const oItem = (await R("admin/hd/education/private/items/[id]")).GET;
    const call = async (h: Handler, kind: "user" | "admin", w: { id: string; token: string }, o: { method?: string; body?: unknown; params?: Record<string, string>; query?: string } = {}) => {
      const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130", [kind === "admin" ? "x-admin-id" : "x-user-id"]: w.id, "x-session-token": w.token };
      if (o.body !== undefined) headers["content-type"] = "application/json";
      const res = await h(new NextRequest(`http://localhost/api/t${o.query ?? ""}`, { method: o.method ?? "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }), { params: Promise.resolve(o.params ?? {}) });
      const body = await res.text();
      return { status: res.status, body, json: (() => { try { return JSON.parse(body) as Record<string, unknown>; } catch { return {}; } })() };
    };

    // ── Tohum ───────────────────────────────────────────────────────────────────────────
    const mk = async (label: string, role: string, superAdmin = false) => {
      const id = randomUUID(), tenant = randomUUID(), token = `zz-priv-p-${label}-${id.slice(0, 6)}`;
      await su.query(`insert into public.tenants(id, name) values ($1,$2)`, [tenant, `ZZ_P_${label}`]);
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin)
                      values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7)`,
        [id, `ZZ_P_${label}`, `zz.p.${label.toLowerCase()}@example.test`, role, JSON.stringify(role === "expert" ? { human_design: true } : {}), tenant, superAdmin]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, tenant };
    };
    const OWNER = await mk("OWNER", "admin", true);
    const T = await mk("EGITMEN", "expert");
    await su.query(`select public.hd_edu_priv_owner_approve_text($1,'hd-egitim-izin-v1','ZZ-SENTETIK')`, [OWNER.id]);
    await su.query(`select public.hd_edu_priv_owner_set_open($1,true,null)`, [OWNER.id]);
    await su.query(`select public.hd_education_grant_access($1,$2,null)`, [OWNER.id, T.id]);
    const sha = (await su.query(`select body_sha256 from public.hd_edu_private_consent_texts where version='hd-egitim-izin-v1'`)).rows[0].body_sha256 as string;

    // İki sentetik harita: G merkezi TANIMSIZ (mevcut fixture) ve G merkezi TANIMLI (FAZ 12 bulgusu; tek harfli "G" düşmemeli).
    const prep = (snap: ReturnType<typeof syntheticEducationSnapshot>) => {
    const fullChart = snap.computed_result as unknown as Record<string, unknown>;
    // Gerçek biçimli sentetik haritaya kişisel işaretler göm (her kaynak ayrı).
    const poisoned: Record<string, unknown> = JSON.parse(JSON.stringify(fullChart));
    poisoned.input = { date: M.date, time: M.time, timezone: M.tz, latitude: Number(M.lat), longitude: Number(M.lon) };
    poisoned.timing = { birthUtcIso: `${M.birthUtc}:00Z`, designUtcIso: `${M.design}0T01:00:00Z`, daysBeforeBirth: 88 };
    poisoned.meta = { ...(fullChart.meta as object), engine: M.engine, disclaimer: M.disc };
    poisoned.warnings = [M.warn];
    poisoned.validation = { status: "x", reasons: [M.warn] };
    poisoned.provider = { ...(fullChart.provider as object), endpoint: M.endpoint, designInstantUtc: `${M.design}0T01:00:00Z` };
    poisoned.activations = (fullChart.activations as Record<string, unknown>[]).map((a, i) => ({ ...a, longitude: i === 0 ? Number(M.longitude) : 1.5, boundaryFlag: true }));
    poisoned[M.nested] = { birth: M.date, place: M.place };
    poisoned.typeDescription = M.roxyText;
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(snap.provider_raw));
    raw.designInstantUtc = `${M.design}0T01:00:00Z`;
    raw.typeDescription = M.roxyText;
    (raw.centers as Record<string, unknown>[])[0].description = M.roxyText;
    return { fullChart, poisoned, raw };
    };
    const P0 = prep(syntheticEducationSnapshot("2018-07-20T16:00:00Z", 37.87, 32.48, 1));
    const PG = prep(syntheticEducationSnapshotGDefined("2018-07-20T16:00:00Z", 37.87, 32.48, 1));
    ok(!((P0.fullChart.centers as { defined: string[] }).defined).includes("G") && ((PG.fullChart.centers as { defined: string[] }).defined).includes("G"),
      "sentetik haritalar: biri G tanımsız, biri G TANIMLI (gerçek doğrulama + normalizasyon zinciri)");
    const { poisoned } = P0;

    const scenarios = [
      { key: "anonim_dogumsuz", scope: "anonim", birth: false, mode: "alias" },
      { key: "anonim_dogumlu", scope: "anonim", birth: true, mode: "alias" },
      { key: "isimli_dogumsuz", scope: "acik_isim", birth: false, mode: "named" },
      { key: "isimli_dogumlu", scope: "acik_isim", birth: true, mode: "named" },
      { key: "anonim_dogumsuz_G", scope: "anonim", birth: false, mode: "alias", g: true },
      { key: "isimli_dogumlu_G", scope: "acik_isim", birth: true, mode: "named", g: true },
    ] as const;
    const dataOf = (sc: (typeof scenarios)[number]) => ("g" in sc && sc.g ? PG : P0);
    const items: Record<string, string> = {};
    for (const [i, sc] of scenarios.entries()) {
      const client = (await su.query(`insert into public.human_design_clients(tenant_id, user_id, name, birth_date, birth_time, birth_place) values ($1,$2,$3,$4,$5,$6) returning id`,
        [T.tenant, T.id, `${M.realName} ${i}`, M.date, M.time, M.place])).rows[0].id as string;
      const chart = (await su.query(
        `insert into public.human_design_charts(tenant_id, user_id, client_id, client_name, source, birth_date, birth_time, birth_place, timezone, location_id, input, computed_result,
           type_code, profile_code, authority_code, definition_code, provider, provider_raw, input_hash)
         values ($1,$2,$3,$4,'computed',$5,$6,$7,$8,'zz-loc',$9,$10,'generator','1/3','sacral','single','roxyapi',$11,$12) returning id`,
        [T.tenant, T.id, client, `${M.realName} ${i}`, M.date, M.time, M.place, M.tz, JSON.stringify(dataOf(sc).poisoned.input), JSON.stringify(dataOf(sc).poisoned), JSON.stringify(dataOf(sc).raw), String(i).repeat(64)])).rows[0].id as string;
      const cr = await call(tConsents.POST, "user", T, { method: "POST", body: {
        hdClientId: client, consenterName: `${M.consenter} ${i}`, relation: "danisan", displayScope: sc.scope, includeBirthData: sc.birth,
        namedConfirmed: sc.scope === "acik_isim", textVersion: "hd-egitim-izin-v1", textSha256: sha, givenOn: "2026-10-01", method: "islak_imza_tarama",
        evidenceMime: "application/pdf", evidenceBase64: Buffer.concat([Buffer.from("%PDF-1.4\n% ZZ\n"), Buffer.alloc(200, 32)]).toString("base64") } });
      const add = await call(tItems.POST, "user", T, { method: "POST", body: { chartId: chart, consentId: cr.json.id, title: `Örnek ${sc.key}`, aliasLabel: `Takma ${i}`, displayMode: sc.mode } });
      ok(cr.status === 201 && add.status === 201, `tohum: ${sc.key} (izin + kayıt)`, [cr.json, add.json]);
      items[sc.key] = String(add.json.id);
      (items as Record<string, string>)[`${sc.key}:client`] = client;
      (items as Record<string, string>)[`${sc.key}:chart`] = chart;
    }

    const ALWAYS_FORBIDDEN = [M.lat, M.lon, M.birthUtc, M.design, M.longitude, M.warn, M.disc, M.nested, M.roxyText, M.consenter, M.engine, M.endpoint,
      "provider_raw", "computed_result", "designInstantUtc", "designUtcIso", "birthUtcIso", "boundaryFlag", "longitude", "latitude", "zz-loc", "input_hash", T.tenant, OWNER.tenant];
    // Saat dilimi doğum yeri bilgisinin parçası: yalnız doğum bilgisi izniyle (künyede) görünebilir.
    const BIRTH = [M.date, M.dateTr, M.time, M.place, M.tz];

    for (const sc of scenarios) {
      section(`Ayrıntı · ${sc.key}`);
      const id = items[sc.key];
      const idsForbidden = [(items as Record<string, string>)[`${sc.key}:client`], (items as Record<string, string>)[`${sc.key}:chart`]];
      for (const [who, h, kind, w] of [["eğitmen", tItem, "user", T], ["owner", oItem, "admin", OWNER]] as const) {
        const r = await call(h, kind, w, { params: { id } });
        ok(r.status === 200, `${who}: 200`);
        const leaks = [...ALWAYS_FORBIDDEN, ...idsForbidden].filter((x) => r.body.includes(x));
        ok(leaks.length === 0, `${who}: izin dışı / iç alan sızıntısı 0`, leaks);
        const birthLeaks = BIRTH.filter((x) => r.body.includes(x));
        if (sc.birth) ok(r.body.includes(M.dateTr) && r.body.includes(M.time) && r.body.includes(M.place) && r.body.includes(M.tz) && !r.body.includes(M.date), `${who}: doğum bilgisi YALNIZ künye biçiminde var (ISO ham değer yok)`, birthLeaks);
        else ok(birthLeaks.length === 0, `${who}: izin yok → doğum tarihi/saati/yeri API'de YOK`, birthLeaks);
        if (sc.mode === "named") ok(r.body.includes(M.realName), `${who}: açık isim izni → gerçek ad var`);
        else ok(!r.body.includes(M.realName), `${who}: anonim → gerçek ad API'de YOK`);
        const item = r.json.item as { chart?: { view: HdComputedChart; render: Record<string, unknown> | null; birthShown: boolean } };
        const view = item?.chart?.view;
        ok(!!view && view.activations.length === 26, `${who}: BodyGraph görünümü 26 aktivasyon`);
        const full = dataOf(sc).fullChart;
        const fullState = premiumStateFromChart(full as unknown as HdComputedChart);
        const viewState = view ? premiumStateFromChart(view) : null;
        ok(!!fullState && JSON.stringify(fullState) === JSON.stringify(viewState), `${who}: BodyGraph çizim durumu tam veriyle BİREBİR aynı (kapı/kanal/yarım kanal/merkez)`);
        const sortJ = (x: unknown) => JSON.stringify([...((x as string[]) ?? [])].sort());
        const fc = full.centers as { defined: string[]; open: string[] };
        const fd = full.definition as { definedCenters: string[] };
        ok(!!view && sortJ(view.centers?.defined) === sortJ(fc.defined) && sortJ(view.centers?.open) === sortJ(fc.open) && sortJ(view.definition?.definedCenters) === sortJ(fd.definedCenters),
          `${who}: merkez listeleri (tanımlı / açık / tanım) tam veriyle aynı${"g" in sc && sc.g ? " — G TANIMLI" : ""}`, view ? [view.centers, view.definition] : null);
        if ("g" in sc && sc.g) ok(!!view && view.centers.defined.includes("G") && !!viewState && viewState.definedCenters.has("G"), `${who}: G merkezi görünümde ve BodyGraph durumunda TANIMLI`);
        ok(!!item?.chart?.render && Array.isArray((item.chart.render as { centers?: unknown[] }).centers), `${who}: yedek renderer yükü var (yorum metni yok)`);
        ok(item?.chart?.birthShown === sc.birth, `${who}: birthShown = ${sc.birth}`);
      }
    }

    section("Liste uçları");
    const lt = await call(tItems.GET, "user", T);
    const lo = await call(oItems, "admin", OWNER);
    for (const [who, r] of [["eğitmen", lt], ["owner", lo]] as const) {
      const leaks = [...ALWAYS_FORBIDDEN, ...BIRTH, M.realName].filter((x) => r.body.includes(x));
      ok(r.status === 200 && leaks.length === 0, `${who} listesi: kişisel / iç alan sızıntısı 0`, leaks);
    }

    section("Merkez adları — dokuz kanonik merkez + geçersiz adlar");
    {
      const base = P0.fullChart;
      for (const c of CENTERS) {
        const v1 = buildEduChartView({ ...base, centers: { defined: [c], open: [] }, definition: { ...(base.definition as object), definedCenters: [c] } });
        ok(!!v1 && JSON.stringify(v1.centers.defined) === JSON.stringify([c]) && JSON.stringify(v1.definition.definedCenters) === JSON.stringify([c]), `merkez korunur: ${c}`);
      }
      const bad = ["", "g", "G Center", "<G>", "G;", "Solar Plexus", "Throat ", " Head", "A".repeat(40), "__proto__", "Sacral<script>", "SOLARPLEXUS"];
      const v2 = buildEduChartView({ ...base, centers: { defined: [...bad, 7, null, { x: 1 }], open: bad }, definition: { ...(base.definition as object), definedCenters: bad } });
      ok(!!v2 && v2.centers.defined.length === 0 && v2.centers.open.length === 0 && v2.definition.definedCenters.length === 0, "geçersiz / zararlı / varyant merkez adları reddedilir (yalnız 9 kanonik ad)", v2?.centers);
      const v3 = buildEduChartView(PG.fullChart);
      ok(!!v3 && v3.centers.defined.includes("G") && v3.definition.definedCenters.includes("G") && !!premiumStateFromChart(v3 as unknown as HdComputedChart), "G TANIMLI harita: görünümde G korunur ve BodyGraph durumu üretilir");
    }

    section("Saf allowlist birimi");
    const v = buildEduChartView(poisoned);
    const vs = JSON.stringify(v);
    ok(!!v && [...ALWAYS_FORBIDDEN, ...BIRTH].every((x) => !vs.includes(x)), "buildEduChartView: zehirli girdiden hiçbir işaret geçmedi");
    ok(buildEduChartView({ ...poisoned, type: { evil: M.date } }) === null, "tanınmayan yapı → null (tahmin yok)");
    ok(buildEduChartView(null) === null && buildEduChartView([]) === null, "geçersiz girdi → null");
    const longName = { ...poisoned, strategy: "x".repeat(500) };
    ok(!JSON.stringify(buildEduChartView(longName)).includes("x".repeat(200)), "aşırı uzun metin alanı taşınmaz");

    section("Geri çekme sonrası");
    const cid = (await su.query(`select consent_id from public.hd_edu_private_items where id = $1`, [items.isimli_dogumlu])).rows[0].consent_id as string;
    await su.query(`select public.hd_edu_priv_consent_withdraw($1,$2,'danisan_talebi')`, [T.id, cid]);
    const ow = await call(oItem, "admin", OWNER, { params: { id: items.isimli_dogumlu } });
    ok(ow.status === 200 && !ow.body.includes(M.realName) && BIRTH.every((x) => !ow.body.includes(x)) && (ow.json.item as { chart: unknown }).chart === null,
      "izin geri çekildi → owner yanıtında ad / doğum / harita YOK");
    ok((await call(tItem, "user", T, { params: { id: items.isimli_dogumlu } })).status === 404, "eğitmen → 404");
    ok(external.length === 0, "dış ağ / Roxy çağrısı 0", external);
  } finally {
    await env.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error("HATA", e); process.exit(1); });
