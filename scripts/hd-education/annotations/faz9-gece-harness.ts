/**
 * FAZ 9 GECE — kapsamlı arka uç doğrulaması (talimat §8–11, §13, §17, §28–30, §37).
 *  A) Mahremiyet (P0): çizim + owner uçlarının TÜM yanıtları işaretli kişisel verilere ve yasak iç alanlara karşı taranır
 *     (iç içe bilinmeyen alan zehirlemesi dahil); izin geri çekme sonrası owner yanıtı.
 *  B) 100 sentetik eğitmen izolasyonu (merkezî + özel katman; kayıt varlığı bile sızmaz; normal admin 404).
 *  C) 20 merkezî harita + 3 özel kayıt: yetki kapat → erişim 0 / veri aynı; iki cihaz; yeniden aç → birebir; izin ayrımı.
 *  D) Uzun süreli / yoğun / kötü niyetli: 100 harita × kayıt + 100 yükleme, 400 öğe sınırı, 150 baloncuk, 5000 karakter not,
 *     derin iç içe JSON, büyük gövde, geçersiz renk / koordinat / HTML, art arda 50 kayıt, iki sekme CAS + bilinçli üzerine yazma,
 *     kayıt silinirken ikinci sekme, ders hazırlığı (30 belge, 40 harita, 50 not) olağan sayılır.
 *  E) İstemci paketi: sunucu sırrı (service role anahtarı) `.next/static` içinde YOK.
 * İzole embedded-postgres + GERÇEK migration'lar + GERÇEK route'lar; SENTETİK veri; dış ağ 0.
 * Çalıştır: npx tsx scripts/hd-education/annotations/faz9-gece-harness.ts   (HD_EDU_GECE_PORT, varsayılan 55101)
 */
import "../../hd-analysis-word-flow/env";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv } from "../../anamnez/testEnv";
import { PRIVATE_RPCS } from "../private/pgSchema";
import { syntheticEducationSnapshot } from "../syntheticSnapshot";
import { ANN_RPCS, annotationSql, sampleDoc, seedCentralSubject } from "./annSeed";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Who = { id: string; token: string; tenant: string; label: string };
type Res = { status: number; body: string; json: Record<string, unknown> };
const md5 = (v: unknown) => createHash("md5").update(JSON.stringify(v)).digest("hex");

async function call(h: Handler, kind: "user" | "admin", w: Pick<Who, "id" | "token"> | null, o: { method?: string; body?: unknown; raw?: string; params?: Record<string, string>; query?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130" };
  if (w) { headers[kind === "admin" ? "x-admin-id" : "x-user-id"] = w.id; headers["x-session-token"] = w.token; }
  const body = o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined);
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await h(new NextRequest(`http://localhost/api/t${o.query ?? ""}`, { method: o.method ?? "GET", headers, body }), { params: Promise.resolve(o.params ?? {}) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* json değil */ }
  return { status: res.status, body: text, json };
}

// Kişisel işaretler (yalnız SENTETİK özel kaynak kayda gömülür; hiçbir eğitim yanıtında görünmemeli).
const MARK = {
  date: "1937-11-23", time: "04:51", place: "ZZYERMARK-GECE", lat: "41.01234", lon: "28.98765", design: "1937-08-25T01:00",
  client: "ZZ GIZLI DANISAN GECE", consenter: "ZZ GIZLI IZINVEREN GECE", nested: "ZZNESTEDLEAK-GECE", longitude: "123.456789",
};
const FORBIDDEN_KEYS = ["provider_raw", "computed_result", "request_body", "birth_date", "birth_time", "\"input\"", "\"timing\"", "designInstantUtc", "consenter_name", "consenterName", "hd_client_id", "source_chart_id"];

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
    port: Number(process.env.HD_EDU_GECE_PORT ?? 55101), dirName: `hd-edu-gece-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: [...PRIVATE_RPCS, ...ANN_RPCS], extraSql: annotationSql(),
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.HD_EDUCATION_CATALOG_ENABLED = "true";
  process.env.HD_PRIVATE_EDUCATION_ENABLED = "true";
  const su = env.su;
  const q = (sql: string, args: unknown[] = []) => su.query(sql, args);
  await q(`grant select, insert, update, delete on public.human_design_clients, public.human_design_charts, public.human_design_reports to service_role`);
  try {
    const R = (p: string) => import(`../../../app/api/${p}/route`) as Promise<Record<string, Handler>>;
    const aCentral = await R("hd/education/annotations/central/[id]");
    const aPrivate = await R("hd/education/annotations/private/[id]");
    const oList = (await R("admin/hd/education/annotations")).GET;
    const oLayer = await R("admin/hd/education/annotations/[layerId]");
    const oTrainers = (await R("admin/hd/education/annotations/trainers")).GET;
    const oPurge = await R("admin/hd/education/annotations/trainers/[userId]/purge");
    const oAccess = await R("admin/hd/education/training-access");
    const tItems = await R("hd/education/private/items");
    const tItem = (await R("hd/education/private/items/[id]")).GET;
    const tDelete = (await R("hd/education/private/items/delete")).POST;
    const tConsents = await R("hd/education/private/consents");
    const oItem = (await R("admin/hd/education/private/items/[id]")).GET;
    const oItems = (await R("admin/hd/education/private/items")).GET;
    const cCatalog = (await R("hd/education/charts/[id]")).GET;

    const mk = async (label: string, role = "expert", o: { superAdmin?: boolean } = {}): Promise<Who> => {
      const id = randomUUID(), tenant = randomUUID(), token = `zz-gece-${label}-${id.slice(0, 6)}`;
      await q(`insert into public.tenants(id, name) values ($1,$2)`, [tenant, `ZZ_G_${label}`]);
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin)
               values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7)`,
        [id, `ZZ_G_${label}`, `zz.g.${label.toLowerCase()}@example.test`, role, JSON.stringify(role === "expert" ? { human_design: true, clients: true } : {}), tenant, o.superAdmin === true]);
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, tenant, label };
    };
    const OWNER = await mk("OWNER", "admin", { superAdmin: true });
    const ADMIN = await mk("ADMIN", "admin");
    await q(`select public.hd_edu_priv_owner_approve_text($1,'hd-egitim-izin-v1','ZZ-SENTETIK')`, [OWNER.id]);
    await q(`select public.hd_edu_priv_owner_set_open($1,true,null)`, [OWNER.id]);
    const grant = (w: Who) => q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, w.id]);
    const setAccess = (w: Who, enabled: boolean) => call(oAccess.POST, "admin", OWNER, { method: "POST", body: { userId: w.id, enabled } });
    const sha = (await q(`select body_sha256 from public.hd_edu_private_consent_texts`)).rows[0].body_sha256 as string;
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n% ZZ\n"), Buffer.alloc(200, 32)]).toString("base64");
    const SNAP = syntheticEducationSnapshot("2018-07-20T16:00:00Z", 37.87, 32.48, 1);
    let n = 0;
    /** Özel kayıt: işaretli doğum verisi + zehirli iç içe alan (SQL ile hızlı; RPC'ler gerçek). */
    const privItem = async (w: Who, title: string, poisoned = false) => {
      const client = (await q(`insert into public.human_design_clients(tenant_id, user_id, name, birth_date, birth_time, birth_place) values ($1,$2,$3,$4,$5,$6) returning id`,
        [w.tenant, w.id, poisoned ? MARK.client : `ZZ_D_${++n}`, MARK.date, MARK.time, MARK.place])).rows[0].id as string;
      const cr = JSON.parse(JSON.stringify(SNAP.computed_result)) as Record<string, unknown>;
      cr.zz = ++n;
      if (poisoned) {
        cr.input = { date: MARK.date, time: MARK.time, place: MARK.place, latitude: Number(MARK.lat), longitude: Number(MARK.lon) };
        cr.timing = { designUtcIso: MARK.design };
        cr.zz_unknown = { deep: { deeper: { secret: MARK.nested, longitude: Number(MARK.longitude) } } };
        const acts = cr.activations as Array<Record<string, unknown>>;
        if (Array.isArray(acts) && acts[0]) acts[0].zz_leak = MARK.nested;
      }
      const chart = (await q(`insert into public.human_design_charts(tenant_id, user_id, client_id, client_name, source, birth_date, birth_time, birth_place, timezone, computed_result, provider, provider_raw)
          values ($1,$2,$3,$4,'computed',$5,$6,$7,'Europe/Istanbul',$8,'roxyapi',$9) returning id`,
        [w.tenant, w.id, client, poisoned ? MARK.client : null, MARK.date, MARK.time, MARK.place, JSON.stringify(cr), JSON.stringify({ ...(SNAP.provider_raw as object), zz_raw: MARK.nested })])).rows[0].id as string;
      const consent = (await q(`select public.hd_edu_priv_consent_record($1,$2,$3,'danisan','anonim',false,false,'hd-egitim-izin-v1',$4,current_date,'islak_imza_tarama',$5,'application/pdf') v`,
        [w.id, client, poisoned ? MARK.consenter : "ZZ İzin", sha, pdf])).rows[0].v as string;
      const item = (await q(`select public.hd_edu_priv_item_add($1,$2,$3,$4,'Örnek','alias','tip',null,null) v`, [w.id, chart, consent, title])).rows[0].v as string;
      return { client, chart, consent, item };
    };
    const cGet = (w: Who, id: string) => call(aCentral.GET, "user", w, { params: { id } });
    const cPut = (w: Who, id: string, doc: unknown, rev: number) => call(aCentral.PUT, "user", w, { method: "PUT", params: { id }, body: { doc, expectedRevision: rev } });
    const pGet = (w: Who, id: string) => call(aPrivate.GET, "user", w, { params: { id } });
    const pPut = (w: Who, id: string, doc: unknown, rev: number) => call(aPrivate.PUT, "user", w, { method: "PUT", params: { id }, body: { doc, expectedRevision: rev } });
    const scan = (label: string, r: Res, extraForbidden: string[] = []) => {
      const markers = [MARK.date, MARK.time, MARK.place, MARK.lat, MARK.lon, MARK.design, MARK.client, MARK.consenter, MARK.nested, MARK.longitude, ...extraForbidden];
      const hitM = markers.filter((m) => r.body.includes(m));
      const hitK = FORBIDDEN_KEYS.filter((k) => r.body.includes(k));
      ok(hitM.length === 0 && hitK.length === 0, `${label}: kişisel işaret / yasak iç alan YOK`, { hitM, hitK });
    };

    // Merkezî kayıtlar (100) — sentetik, yayımlı.
    const S: string[] = [];
    for (let i = 0; i < 100; i++) {
      const y = 1850 + i, d = `${y}-0${(i % 9) + 1}-1${i % 9}`;
      S.push((await seedCentralSubject(q, OWNER.id, { name: `ZZ Gece Kişi ${i + 1}`, publish: true, date: d })).id);
    }
    ok(S.length === 100, "100 yayımlı sentetik merkezî kayıt hazır");

    // ── A) Mahremiyet ─────────────────────────────────────────────────────────────────────────────
    section("A · Mahremiyet: çizim + owner uçları (zehirli iç içe alan dahil)");
    const P = await mk("PRIVACY");
    await grant(P);
    const PZ = await privItem(P, "Zehirli kayıt", true);
    ok((await pPut(P, PZ.item, { ...sampleDoc("z"), notes: "eğitim notu" }, 0)).status === 200, "zehirli kaynaklı özel kayda katman kaydedildi");
    ok((await cPut(P, S[0], sampleDoc("pc"), 0)).status === 200, "merkezî katman kaydedildi");
    scan("eğitmen özel katman GET", await pGet(P, PZ.item), [PZ.client, PZ.chart, PZ.consent]);
    scan("eğitmen merkezî katman GET", await cGet(P, S[0]), [PZ.client, PZ.chart]);
    const ti = await call(tItem, "user", P, { params: { id: PZ.item } });
    scan("eğitmen özel kayıt ayrıntısı (izin: anonim, doğum yok)", ti, [PZ.client, PZ.chart]);
    scan("eğitmen özel kayıt listesi", await call(tItems.GET, "user", P), [PZ.client, PZ.chart]);
    const ol = await call(oList, "admin", OWNER);
    scan("owner katman listesi", ol, [PZ.client, PZ.chart, PZ.consent]);
    const pzLayer = (ol.json.layers as Array<Record<string, unknown>>).find((x) => x.sourceId === PZ.item)!;
    const cLayer = (ol.json.layers as Array<Record<string, unknown>>).find((x) => x.sourceId === S[0])!;
    scan("owner özel katman incelemesi (izin geçerli)", await call(oLayer.GET, "admin", OWNER, { params: { layerId: String(pzLayer.id) } }), [PZ.client, PZ.chart, PZ.consent]);
    const oc = await call(oLayer.GET, "admin", OWNER, { params: { layerId: String(cLayer.id) } });
    ok(!/"input"|"timing"|provider_raw|request_body|designInstant|zz_raw/.test(oc.body), "owner merkezî incelemesi chartView: ham girdi / zamanlama / sağlayıcı alanı YOK");
    scan("owner özel kayıt ayrıntısı (owner yüzü)", await call(oItem, "admin", OWNER, { params: { id: PZ.item } }), [PZ.client, PZ.chart]);
    scan("owner özel kayıt listesi", await call(oItems, "admin", OWNER), [PZ.client, PZ.chart]);
    scan("owner eğitmen veri durumu", await call(oTrainers, "admin", OWNER), [PZ.client, PZ.chart, "Zehirli kayıt"]);
    await q(`select public.hd_edu_priv_consent_withdraw($1,$2,'danisan_talebi')`, [P.id, PZ.consent]);
    const ow = await call(oLayer.GET, "admin", OWNER, { params: { layerId: String(pzLayer.id) } });
    ok((ow.json.layer as Record<string, unknown>).contentClosed === true && !ow.body.includes("z-bub-1") && !ow.body.includes("eğitim notu"), "izin geri çekildi → owner incelemesinde çizim / not içeriği YOK");
    scan("izin geri çekilmiş kayıt owner listesi", await call(oList, "admin", OWNER), [PZ.client, PZ.chart, "Zehirli kayıt"]);
    ok((await pGet(P, PZ.item)).status === 404, "izin geri çekildi → eğitmene katman 404");

    // ── B) 100 eğitmen izolasyonu ─────────────────────────────────────────────────────────────────
    section("B · 100 sentetik eğitmen: izolasyon");
    const T: Who[] = [];
    const TP: Array<{ item: string } | null> = [];
    for (let i = 0; i < 100; i++) {
      const w = await mk(`T${i}`);
      await grant(w);
      T.push(w);
      await cPut(w, S[i % 5], { ...sampleDoc(`t${i}`), notes: `T${i} gizli not` }, 0);
      if (i < 20) { const p = await privItem(w, `T${i} özel`); await pPut(w, p.item, sampleDoc(`tp${i}`), 0); TP.push(p); } else TP.push(null);
    }
    ok(Number((await q(`select count(*)::int n from public.hd_edu_annotation_layers where trainer_user_id = any($1)`, [T.map((t) => t.id)])).rows[0].n) === 120, "100 eğitmen: 100 merkezî + 20 özel katman DB'de");
    let ownOk = 0, leaks = 0, sameBody = 0, probes = 0;
    const fake = await pGet(T[0], randomUUID());
    for (let i = 0; i < 100; i++) {
      const g = await cGet(T[i], S[i % 5]);
      if (g.status === 200 && g.body.includes(`T${i} gizli not`) && !/T\d+ gizli not/.test(g.body.replace(`T${i} gizli not`, ""))) ownOk++;
      for (let k = 1; k <= 3; k++) {
        const j = (i * 7 + k * 13) % 20;
        if (j === i) continue;
        const r = await pGet(T[i], (TP[j] as { item: string }).item);
        probes++;
        if (r.status !== 404) leaks++;
        if (r.body === fake.body) sameBody++;
        const it = await call(tItem, "user", T[i], { params: { id: (TP[j] as { item: string }).item } });
        if (it.status !== 404) leaks++;
      }
    }
    ok(ownOk === 100, "her eğitmen aynı merkezî haritada YALNIZ kendi notunu görür (100/100)", ownOk);
    ok(leaks === 0 && sameBody === probes, `başka eğitmenin özel kaydı / katmanı: ${probes} deneme, sızıntı 0, yanıt var olmayanla AYNI (varlık bile öğrenilemez)`, { leaks, sameBody, probes });
    const lists = await Promise.all(T.slice(0, 20).map((w) => call(tItems.GET, "user", w)));
    ok(lists.every((l, i) => (l.json.items as unknown[]).length === 1 && l.body.includes(`T${i} özel`)), "20 eğitmenin kayıt listesi yalnız kendi kaydı (1)");
    for (const [h, l] of [[oList, "katman listesi"], [oTrainers, "eğitmen veri durumu"]] as const) ok((await call(h, "admin", ADMIN)).status === 404, `normal admin: ${l} 404`);
    ok((await call(oLayer.GET, "admin", ADMIN, { params: { layerId: String(cLayer.id) } })).status === 404, "normal admin: katman inceleme 404");
    ok((await cGet(ADMIN, S[0])).status === 404, "normal admin: eğitmen yüzü 404");

    // ── C) 20 harita + 3 özel: üyelik kapat / aç ──────────────────────────────────────────────────
    section("C · 20 merkezî harita + 3 özel kayıt: üyelik kapat → aç");
    const E = await mk("EGITMEN20");
    await grant(E);
    for (let i = 0; i < 20; i++) ok((await cPut(E, S[20 + i], { ...sampleDoc(`e${i}`), notes: `harita ${i + 1} notu` }, 0)).status === 200, `harita ${i + 1}: çizim + baloncuk + metin + not kaydı`);
    const EP = [await privItem(E, "E özel 1"), await privItem(E, "E özel 2"), await privItem(E, "E özel 3")];
    for (const [i, p] of EP.entries()) await pPut(E, p.item, { ...sampleDoc(`ep${i}`), notes: `özel ${i + 1}` }, 0);
    const snapE = async () => md5([(await q(`select id, doc, revision, created_at, updated_at, tenant_id, trainer_user_id, coalesce(central_subject_id, private_item_id) src from public.hd_edu_annotation_layers where trainer_user_id=$1 order by id`, [E.id])).rows,
      (await q(`select id, title, created_at, updated_at, consent_id from public.hd_edu_private_items where trainer_user_id=$1 order by id`, [E.id])).rows]);
    const fp0 = await snapE();
    ok(Number((await q(`select count(*)::int n from public.hd_edu_annotation_layers where trainer_user_id=$1`, [E.id])).rows[0].n) === 23, "DB: 23 katman (20 merkezî + 3 özel) saklandı");
    await setAccess(E, false);
    const E2 = { ...E, token: `zz-gece-e-cihaz2-${randomUUID().slice(0, 6)}` };
    await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [E.id, E2.token]);
    let open = 0;
    for (const id of S.slice(20, 40)) for (const w of [E, E2]) { if ((await cGet(w, id)).status === 200) open++; if ((await call(cCatalog, "user", w, { params: { id } })).status === 200) open++; }
    for (const p of EP) for (const w of [E, E2]) { if ((await pGet(w, p.item)).status === 200) open++; if ((await call(tItem, "user", w, { params: { id: p.item } })).status === 200) open++; }
    ok(open === 0, "yetki kapalı: 20 harita + 3 özel × (katman + kayıt) × 2 cihaz → erişim 0", open);
    ok(await snapE() === fp0, "yetki kapalı: silinen / değişen çalışma 0 (tarihler dahil parmak izi aynı)");
    await setAccess(E, true);
    let same = 0;
    for (const [i, id] of S.slice(20, 40).entries()) { const g = await cGet(E, id); if (JSON.stringify((g.json.layer as { doc: unknown }).doc) === JSON.stringify({ ...sampleDoc(`e${i}`), notes: `harita ${i + 1} notu` })) same++; }
    for (const [i, p] of EP.entries()) { const g = await pGet(E, p.item); if (JSON.stringify((g.json.layer as { doc: unknown } | null)?.doc) === JSON.stringify({ ...sampleDoc(`ep${i}`), notes: `özel ${i + 1}` })) same++; }
    ok(same === 23 && await snapE() === fp0, "yeniden açıldı: 23/23 katman BİREBİR (kopya yok, tarih / sahip / tenant aynı)", same);
    await q(`select public.hd_edu_priv_consent_withdraw($1,$2,'danisan_talebi')`, [E.id, EP[0].consent]);
    await setAccess(E, false); await setAccess(E, true);
    ok((await pGet(E, EP[0].item)).status === 404 && (await pGet(E, EP[1].item)).status === 200, "danışan izni geri çekilen kayıt yetki yeniden açılınca da kapalı; diğerleri açık");

    // ── D) Uzun süreli / yoğun / kötü niyetli ─────────────────────────────────────────────────────
    section("D · Uzun süreli, yoğun ve kötü niyetli kullanım");
    const L = await mk("YUK");
    await grant(L);
    let saved = 0, loaded = 0;
    for (const id of S) if ((await cPut(L, id, { ...sampleDoc("l"), notes: "x" }, 0)).status === 200) saved++;
    for (const id of S) if ((await cGet(L, id)).status === 200) loaded++;
    ok(saved === 100 && loaded === 100, "100 farklı haritaya kayıt + 100 farklı katman yükleme → hepsi başarılı", { saved, loaded });
    let opens = 0;
    for (let i = 0; i < 100; i++) if ((await call(cCatalog, "user", L, { params: { id: S[i % 40] } })).status === 200) opens++;
    ok(opens === 100, "100 kez harita sayfası verisi açma → 100/100 (sınır yok)", opens);
    const big = { v: 1, els: Array.from({ length: 400 }, (_, i) => ({ id: `m-${i}-zz`, t: "circle", c: "ink", w: 2, x: (i % 40) * 10, y: Math.floor(i / 40) * 50, r: 5, f: false, a: null })), notes: "n".repeat(5000) };
    const r400 = await cPut(L, S[0], big, 1);
    ok(r400.status === 200 && (r400.json.layer as { elCount: number }).elCount === 400, "en yüksek izinli öğe sayısı (400) + 5000 karakter not → kaydedildi");
    const reBig = await cGet(L, S[0]);
    ok(((reBig.json.layer as { doc: { els: unknown[]; notes: string } }).doc.els.length === 400) && (reBig.json.layer as { doc: { notes: string } }).doc.notes.length === 5000, "400 öğe + uzun not yeniden açıldı (kayıpsız)");
    const bubbles = { v: 1, els: Array.from({ length: 150 }, (_, i) => ({ id: `b-${i}-zz`, t: "bubble", c: "violet", x: (i % 15) * 30, y: Math.floor(i / 15) * 50, a: null, n: `baloncuk ${i + 1} — ${"ders notu ".repeat(10)}` })), notes: "" };
    ok((await cPut(L, S[1], bubbles, 1)).status === 200, "150 baloncuk (her biri uzun not) kaydedildi");
    let rev = (await cGet(L, S[2])).json.layer ? ((await cGet(L, S[2])).json.layer as { revision: number }).revision : 0, seq = 0;
    for (let i = 0; i < 50; i++) { const r = await cPut(L, S[2], { ...sampleDoc("s"), notes: `art arda ${i}` }, rev); if (r.status === 200) { seq++; rev = (r.json.layer as { revision: number }).revision; } }
    ok(seq === 50 && rev === 51, "art arda 50 kayıt → 50/50, revizyon 51 (tek adım artış)", { seq, rev });
    const bad = async (doc: unknown, label: string, expect = 400) => { const r = await cPut(L, S[3], doc, 1); ok(r.status === expect, label, { s: r.status }); };
    await bad({ v: 1, els: [{ id: "x-1-a", t: "pen", c: "#ff0000", w: 4, p: [0, 0, 1, 1] }] }, "geçersiz renk kodu (#ff0000) → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "arrow", c: "ink", w: 4, x1: "NaN", y1: 0, x2: 1, y2: 1, a1: null, a2: null }] }, "bozuk koordinat (\"NaN\") → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "circle", c: "ink", w: 3, x: 0, y: 0, r: 5, f: false, a: null }] }, "izin dışı kalınlık (3) → 400");
    await bad({ v: 1, els: [], notes: "<script>alert(1)</script>" }, "HTML/script içeren not → 400");
    let deep: unknown = 1; for (let i = 0; i < 3000; i++) deep = { a: deep };
    const dj = await call(aCentral.PUT, "user", L, { method: "PUT", params: { id: S[3] }, raw: JSON.stringify({ doc: { v: 1, els: [deep] }, expectedRevision: 1 }) });
    ok(dj.status === 400, "kötü amaçlı derin iç içe JSON (3000 seviye) → 400 (sunucu hatası yok)", dj.status);
    const hj = await call(aCentral.PUT, "user", L, { method: "PUT", params: { id: S[3] }, raw: JSON.stringify({ doc: { v: 1, els: [] }, expectedRevision: 1, pad: "x".repeat(400 * 1024) }) });
    ok(hj.status === 413, "büyük veri yükü (400 KB) → 413", hj.status);
    // İki sekme CAS + bilinçli üzerine yazma.
    const base = ((await cGet(L, S[4])).json.layer as { revision: number }).revision;
    const tabA = await cPut(L, S[4], { ...sampleDoc("taba"), notes: "A sekmesi" }, base);
    const tabB = await cPut(L, S[4], { ...sampleDoc("tabb"), notes: "B sekmesi" }, base);
    ok(tabA.status === 200 && tabB.status === 409 && tabB.json.currentRevision === base + 1, "iki sekme aynı revizyonla: ikincisi 409 + güncel revizyon (sessiz ezme yok)", { a: tabA.status, b: tabB.status, cur: tabB.json.currentRevision });
    ok(JSON.stringify((await cGet(L, S[4])).json).includes("A sekmesi"), "çakışma sonrası sunucuda A sekmesinin içeriği duruyor (veri kaybı yok)");
    const over = await cPut(L, S[4], { ...sampleDoc("tabb"), notes: "B sekmesi (bilinçli üzerine yazma)" }, tabB.json.currentRevision as number);
    ok(over.status === 200 && JSON.stringify((await cGet(L, S[4])).json).includes("bilinçli üzerine yazma"), "kullanıcının açık tercihiyle güncel revizyon kullanılarak üzerine yazma → 200");
    // Kayıt silinirken ikinci sekme.
    const LP = await privItem(L, "silinecek");
    await pPut(L, LP.item, sampleDoc("lp"), 0);
    ok((await call(tDelete, "user", L, { method: "POST", body: { ids: [LP.item], confirmCount: 1 } })).status === 200, "sekme 1: eğitim kaydı silindi");
    ok((await pGet(L, LP.item)).status === 404 && (await pPut(L, LP.item, sampleDoc("lp"), 1)).status === 404, "sekme 2 (açık çalışma alanı): okuma ve kayıt 404 — yetim katman yok");
    ok(Number((await q(`select count(*)::int n from public.hd_edu_annotation_layers where private_item_id=$1`, [LP.item])).rows[0].n) === 0, "silinen kaydın katmanı da yok (CASCADE)");
    // Ders hazırlığı olağan kullanım.
    const H = await mk("DERS");
    await grant(H);
    let docs = 0;
    for (let i = 0; i < 30; i++) {
      const c = (await q(`insert into public.human_design_clients(tenant_id, user_id, name) values ($1,$2,$3) returning id`, [H.tenant, H.id, `ZZ_H_${i}`])).rows[0].id as string;
      const r = await call(tConsents.POST, "user", H, { method: "POST", body: { hdClientId: c, consenterName: "ZZ", relation: "danisan", displayScope: "anonim", includeBirthData: false, namedConfirmed: false,
        textVersion: "hd-egitim-izin-v1", textSha256: sha, givenOn: "2026-10-01", method: "islak_imza_tarama", evidenceMime: "application/pdf", evidenceBase64: pdf } });
      if (r.status === 201 || r.status === 200) docs++;
    }
    let maps = 0, notesSaved = 0, hrev = 0;
    for (let i = 0; i < 40; i++) if ((await call(cCatalog, "user", H, { params: { id: S[i] } })).status === 200) maps++;
    for (let i = 0; i < 50; i++) { const r = await cPut(H, S[0], { ...sampleDoc("h"), notes: `ders notu ${i}` }, hrev); if (r.status === 200) { notesSaved++; hrev = (r.json.layer as { revision: number }).revision; } }
    ok(docs === 30 && maps === 40 && notesSaved === 50, "ders hazırlığı: 30 izin belgesi + 40 harita açma + 50 not kaydı → HİÇBİRİ engellenmedi", { docs, maps, notesSaved });
    const extra = await call(tConsents.POST, "user", H, { method: "POST", body: { hdClientId: (await q(`insert into public.human_design_clients(tenant_id, user_id, name) values ($1,$2,'ZZ_H_X') returning id`, [H.tenant, H.id])).rows[0].id, consenterName: "ZZ", relation: "danisan", displayScope: "anonim", includeBirthData: false, namedConfirmed: false,
      textVersion: "hd-egitim-izin-v1", textSha256: sha, givenOn: "2026-10-01", method: "islak_imza_tarama", evidenceMime: "application/pdf", evidenceBase64: pdf } });
    ok(extra.status === 429, "31. belge aynı saat içinde → 429 (otomatik toplu yükleme koruması çalışıyor)", extra.status);
    // Kalıcı silme: tekli (1 kayıt) da açık ifade ister.
    const Q = await mk("TEKLI");
    await grant(Q);
    await cPut(Q, S[5], sampleDoc("q"), 0);
    await setAccess(Q, false);
    ok((await call(oPurge.POST, "admin", OWNER, { method: "POST", params: { userId: Q.id }, body: { expectedLayers: 1, expectedItems: 0, phrase: "" } })).status === 422, "tekli kalıcı silme: açık onay olmadan 422");
    ok((await call(oPurge.POST, "admin", OWNER, { method: "POST", params: { userId: Q.id }, body: { expectedLayers: 1, expectedItems: 0, phrase: "1 KAYDI SİL" } })).status === 200, "tekli kalıcı silme: açık onayla 200");

    // ── E) İstemci paketi ──────────────────────────────────────────────────────────────────────────
    section("E · İstemci paketi (.next/static) sır taraması");
    const dir = path.join(process.cwd(), ".next", "static");
    if (!existsSync(dir)) ok(false, ".next/static yok — önce test build'i alın");
    else {
      let files = 0; const hits: string[] = [];
      const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|css|json|txt|html)$/.test(f)) { files++; const t = readFileSync(p, "utf8"); if (t.includes(SERVICE_KEY) || t.includes("SUPABASE_SERVICE_ROLE_KEY") || /ROXY_API_KEY/.test(t)) hits.push(p); } } };
      walk(dir);
      ok(files > 0 && hits.length === 0, `istemci paketinde (${files} dosya) service role anahtarı / sunucu sır adı YOK`, hits.slice(0, 5));
    }
    ok(external.length === 0, "dış ağ / Roxy çağrısı 0", external);
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error("HATA", e); process.exit(1); });
