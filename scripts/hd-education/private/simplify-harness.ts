/**
 * HD Eğitmene Özel Eğitim Haritaları — FAZ 14 İZİN SADELEŞTİRME testi (kurgusal eğitim haritası + gerçek danışan eğitmen beyanı).
 * İzole embedded-postgres + PostgREST shim + GERÇEK migration'lar + GERÇEK route'lar. Prod / Preview'a SIFIR temas; veri SENTETİK (ZZ_*).
 * Roxy: süreç içi SAHTE (repo fixture'ı; ücretli çağrı YOK). Dış ağ kilidi: başka her dış istek reddedilir ve sayılır.
 * Çalıştır: npx tsx scripts/hd-education/private/simplify-harness.ts   (HD_EDU_SIMPLIFY_PG_PORT, varsayılan 54761)
 */
import "../../hd-analysis-word-flow/env";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { consistentRoxyResponse } from "../../hd-roxy/consistentFixture";
import { privateArchiveSql, PRIVATE_RPCS } from "./pgSchema";
import { syntheticEducationSnapshot } from "../syntheticSnapshot";
import { computeFictionalChart } from "../../../lib/human-design/education/private/fictionalCompute";
import { PRIV_FICTIONAL_DECLARATION_VERSION } from "../../../lib/human-design/education/private/privateContract";

const FIXTURE = readFileSync(path.join(process.cwd(), "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8");
const SNAP = syntheticEducationSnapshot("2018-07-20T16:00:00Z", 37.87, 32.48, 1);

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type Who = { id: string; token: string; tenant: string };
type Res = { status: number; json: Record<string, unknown> };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Auth = { kind: "user" | "admin"; id: string; token: string };

async function call(h: Handler, auth: Auth, o: { method?: string; body?: unknown; query?: string; params?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" };
  headers[auth.kind === "admin" ? "x-admin-id" : "x-user-id"] = auth.id;
  headers["x-session-token"] = auth.token;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest(`http://localhost/api/test${o.query ?? ""}`, { method: o.method ?? "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const res = await h(req, { params: Promise.resolve(o.params ?? {}) });
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(await res.text()) as Record<string, unknown>; } catch { /* */ }
  return { status: res.status, json };
}

async function main() {
  // ── Süreç içi sahte Roxy + dış ağ kilidi ───────────────────────────────────────────────────────
  const external: string[] = [];
  let roxyCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    if (/roxyapi\.com\/.*human-design\/bodygraph/.test(u)) {
      roxyCalls++;
      return new Response(consistentRoxyResponse(FIXTURE, init?.body), { status: 200, headers: { "content-type": "application/json" } });
    }
    external.push(u);
    throw new Error(`harness: dış ağ yasak ${u}`);
  }) as typeof fetch;

  const env: TestEnv = await startAnamnezTestEnv({
    port: Number(process.env.HD_EDU_SIMPLIFY_PG_PORT ?? 54761),
    dirName: `hd-edu-simplify-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: PRIVATE_RPCS,
    extraSql: privateArchiveSql(),
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.HD_PRIVATE_EDUCATION_ENABLED = "true";
  const su = env.su;
  const q = (s: string, a: unknown[] = []) => su.query(s, a);
  const n = async (s: string, a: unknown[] = []) => Number((await q(s, a)).rows[0].n);
  await q(`grant select, insert, update, delete on public.human_design_clients, public.human_design_charts, public.human_design_reports to service_role`);
  try {
    const R = (p: string) => import(`../../../app/api/${p}/route`) as Promise<Record<string, Handler>>;
    const tFic = (await R("hd/education/private/fictional")).POST;
    const tDecl = (await R("hd/education/private/declaration-text")).GET;
    const tConsents = await R("hd/education/private/consents");
    const tConsentWd = (await R("hd/education/private/consents/[id]/withdraw")).POST;
    const tItems = await R("hd/education/private/items");
    const tItem = await R("hd/education/private/items/[id]");
    const oItems = (await R("admin/hd/education/private/items")).GET;
    const oItem = await R("admin/hd/education/private/items/[id]");

    let seq = 0;
    const mk = async (label: string, o: { role?: string; superAdmin?: boolean; tenant?: string } = {}): Promise<Who> => {
      const id = randomUUID(), tenant = o.tenant ?? randomUUID(), token = `zz-simp-${++seq}-${id.slice(0, 8)}`;
      const role = o.role ?? "expert";
      await q(`insert into public.tenants(id, name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_SIMP_${label}`]);
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account, is_super_admin, admin_level)
               values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,false,$7,$8)`,
        [id, `ZZ_SIMP_${label}`, `zz.simp.${label.toLowerCase()}@example.test`, role, JSON.stringify(role === "expert" ? { human_design: true, clients: true } : {}),
          tenant, o.superAdmin === true, role === "admin" ? "owner" : null]);
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, tenant };
    };
    const OWNER = await mk("OWNER", { role: "admin", superAdmin: true });
    const A = await mk("EGITMEN_A");
    const B = await mk("EGITMEN_B");
    const C = await mk("EGITMEN_C_AYNI_TENANT", { tenant: A.tenant });
    const asU = (w: Who): Auth => ({ kind: "user", id: w.id, token: w.token });
    const asO: Auth = { kind: "admin", id: OWNER.id, token: OWNER.token };
    await q(`select public.hd_edu_priv_owner_set_open($1,true,null)`, [OWNER.id]);
    for (const w of [A, B, C]) await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, w.id]);
    const cnt = async () => ({
      clients: await n(`select count(*) n from public.clients`), hdClients: await n(`select count(*) n from public.human_design_clients`),
      charts: await n(`select count(*) n from public.human_design_charts`), consents: await n(`select count(*) n from public.hd_edu_private_consents`),
    });

    // ── 1) Kurgusal eğitim haritası ────────────────────────────────────────────────────────────────
    section("1 · Kurgusal eğitim haritası: izin YOK, gerçek kişi kaydı YOK, mevcut motor");
    const body = { title: "ZZ Kurgusal sakral örnek", aliasLabel: "Kurgusal Deniz", category: "tip", birthDate: "2018-07-20", birthTime: "19:00", locationRef: "trd-42-selcuklu",
      declarationAccepted: true, declarationVersion: PRIV_FICTIONAL_DECLARATION_VERSION, teachingNotes: "ZZ ders notu" };
    const before = await cnt();
    const noDecl = await call(tFic, asU(A), { method: "POST", body: { ...body, declarationAccepted: false } });
    const badVer = await call(tFic, asU(A), { method: "POST", body: { ...body, declarationVersion: "hd-egitim-kurgusal-beyan-v0" } });
    ok(noDecl.status === 400 && noDecl.json.code === "DECLARATION_REQUIRED" && badVer.status === 400 && roxyCalls === 0,
      "kurgusal beyan onaylanmadan / yanlış sürümle kayıt OLUŞMAZ ve ücretli çağrı YAPILMAZ", { noDecl, badVer, roxyCalls });
    const created = await call(tFic, asU(A), { method: "POST", body });
    const ficId = String(created.json.id ?? "");
    ok(created.status === 201 && /^[0-9a-f-]{36}$/.test(ficId) && roxyCalls === 1, "kurgusal harita mevcut motorla hesaplandı ve arşive eklendi (sahte Roxy 1 çağrı)", { s: created.status, j: created.json, roxyCalls });
    const after = await cnt();
    ok(JSON.stringify(after) === JSON.stringify(before), "Danışan Yolculuğu / HD danışan / normal HD harita / izin kaydı OLUŞMADI", { before, after });
    const row = (await q(`select item_kind, consent_id, hd_client_id, source_chart_id, display_mode, fic_declaration, fic_declared_at, fic_input ->> 'place' as place,
                                 fic_chart #>> '{appCodes,type_code}' as type_code from public.hd_edu_private_items where id=$1`, [ficId])).rows[0];
    ok(row?.item_kind === "kurgusal" && row.consent_id === null && row.hd_client_id === null && row.source_chart_id === null && row.display_mode === "alias"
      && row.fic_declaration === PRIV_FICTIONAL_DECLARATION_VERSION && !!row.fic_declared_at && !!row.type_code,
      "DB: tür kurgusal, izin / danışan / kaynak harita bağı yok, kurgusal beyan sürümü + tarihi kayıtlı", row);
    const audit = (await q(`select action, detail from public.hd_edu_private_audit where item_id=$1`, [ficId])).rows;
    ok(audit.length === 1 && audit[0].action === "fictional_added" && !JSON.stringify(audit).includes("ZZ Kurgusal"), "denetim izi: fictional_added (başlık / not yazılmaz)", audit);
    const g = await call(tItem.GET, asU(A), { params: { id: ficId } });
    const gi = g.json.item as Record<string, unknown> | undefined;
    const gc = (gi?.chart ?? null) as Record<string, unknown> | null;
    const gs = (gc?.subject ?? {}) as Record<string, unknown>;
    ok(g.status === 200 && gi?.kind === "kurgusal" && gi?.state === "ok" && gi?.consent === null && !!gc?.view && gc?.birthShown === true && /Selçuklu/.test(String(gs.place ?? "")),
      "eğitmen ayrıntı: kurgusal etiketli, harita görünür, kurgusal doğum bilgisi künyede (izin bloğu yok)", { s: g.status, kind: gi?.kind, place: gs.place });
    ok(!JSON.stringify(g.json).includes("provider_raw") && !JSON.stringify(g.json).includes("designInstantUtc"), "ayrıntı yanıtında ham sağlayıcı yanıtı / Design UTC anı YOK");
    const lst = await call(tItems.GET, asU(A));
    const card = ((lst.json.items as Array<Record<string, unknown>>) ?? []).find((x) => x.id === ficId);
    ok(card?.kind === "kurgusal" && card?.state === "ok" && !!card?.typeCode, "liste kartı: kurgusal + tip kodu", card);
    const again = await call(tFic, asU(A), { method: "POST", body });
    ok(again.status === 409 && again.json.code === "DUPLICATE" && again.json.itemId === ficId && roxyCalls === 1, "aynı kurgusal girdi ikinci kez: çoğaltma YOK, ücretli çağrı YOK (mevcut kayıt döner)", { again, roxyCalls });
    const bSame = await call(tFic, asU(B), { method: "POST", body });
    ok(bSame.status === 201 && roxyCalls === 2, "başka eğitmen aynı kurgusal girdiyle KENDİ kaydını oluşturur (kayıtlar karışmaz)", bSame.status);
    ok((await call(tItem.GET, asU(B), { params: { id: ficId } })).status === 404 && (await call(tItem.GET, asU(C), { params: { id: ficId } })).status === 404,
      "kurgusal kayıt başka eğitmene (farklı tenant + AYNI tenant) görünmez → 404");
    const bList = await call(tItems.GET, asU(B));
    ok(!((bList.json.items as Array<Record<string, unknown>>) ?? []).some((x) => x.id === ficId), "başka eğitmenin listesinde görünmez");
    const og = await call(oItem.GET, asO, { params: { id: ficId } });
    const ol = await call(oItems, asO);
    ok(og.status === 200 && ((og.json.item as Record<string, unknown>)?.kind === "kurgusal") && ((ol.json.items as Array<Record<string, unknown>>) ?? []).some((x) => x.id === ficId && x.kind === "kurgusal"),
      "owner denetimi: kurgusal kayıt görünür ve etiketli");
    ok(await n(`select count(*) n from public.hd_education_subjects where display_name ilike '%Kurgusal%'`).catch(() => 0) === 0, "kurgusal harita merkezî ünlü kataloğuna EKLENMEDİ");

    // ── 2) Tür değiştirerek izin kontrolünü atlatma denemeleri (DB ikinci kilit) ─────────────────────
    section("2 · Tür değiştirme / etiketle kurgusala çevirme / izinsiz gerçek kayıt → RED");
    const tryq = async (sql: string, a: unknown[] = []) => { try { await q(sql, a); return "kabul"; } catch (e) { return (e as Error).message.slice(0, 90); } };
    ok((await tryq(`update public.hd_edu_private_items set item_kind='gercek' where id=$1`, [ficId])) !== "kabul", "kurgusal → gerçek tür değişimi REDDEDİLİR");
    ok((await tryq(`update public.hd_edu_private_items set fic_chart = fic_chart || '{"zz":1}' where id=$1`, [ficId])) !== "kabul", "kurgusal hesap sonucu sonradan değiştirilemez");
    ok((await tryq(`update public.hd_edu_private_items set display_mode='named' where id=$1`, [ficId])) !== "kabul", "kurgusal kayıtta açık isim modu YOK");
    // Gerçek danışan haritası (sentetik) — etiketle kurgusal yapılamaz.
    const client = (await q(`insert into public.human_design_clients(tenant_id, user_id, name, birth_date, birth_time) values ($1,$2,'ZZ Gerçek Danışan','1990-01-01','10:00') returning id`, [A.tenant, A.id])).rows[0].id as string;
    const chart = (await q(`insert into public.human_design_charts(tenant_id, user_id, client_id, client_name, source, birth_date, birth_time, timezone, computed_result, provider, provider_raw, input_hash)
        values ($1,$2,$3,'ZZ Gerçek Danışan','computed','1990-01-01','10:00','Europe/Istanbul',$4,'roxyapi',$5,$6) returning id`,
      [A.tenant, A.id, client, JSON.stringify(SNAP.computed_result), JSON.stringify(SNAP.provider_raw), "a".repeat(64)])).rows[0].id as string;
    ok((await tryq(`insert into public.hd_edu_private_items(tenant_id, trainer_user_id, item_kind, source_chart_id, title, alias_label, fic_input, fic_chart, fic_input_hash, fic_declared_at, fic_declaration)
         values ($1,$2,'kurgusal',$3,'x','x','{}'::jsonb,'{}'::jsonb,$4,now(),$5)`, [A.tenant, A.id, chart, "b".repeat(64), PRIV_FICTIONAL_DECLARATION_VERSION])) !== "kabul",
      "gerçek haritaya bağlı kayıt 'kurgusal' etiketiyle eklenemez (CHECK)");
    ok((await tryq(`insert into public.hd_edu_private_items(tenant_id, trainer_user_id, item_kind, title, alias_label) values ($1,$2,'gercek','x','x')`, [A.tenant, A.id])) !== "kabul",
      "izin / danışan / harita olmadan 'gerçek' kayıt eklenemez");
    const viaApiReal = await call(tItems.POST, asU(A), { method: "POST", body: { chartId: chart, consentId: randomUUID(), title: "x", aliasLabel: "x" } });
    ok(viaApiReal.status === 404 || viaApiReal.status === 400, "gerçek danışan haritası izinsiz eklenemez (API)", viaApiReal.status);

    // ── 3) Gerçek danışan: eğitmen beyanı (hukuk onayı olmadan KAPALI) ──────────────────────────────
    section("3 · Gerçek danışan: sade eğitmen beyanı (ıslak imza / dosya YOK) — hukuk onayına bağlı");
    const d0 = await call(tDecl, asU(A));
    ok(d0.status === 409 && d0.json.code === "DECLARATION_NOT_APPROVED", "beyan metni hukuk + owner onaylı değil → beyan yolu KAPALI (kurgusal açık)", d0.json);
    const declText = (await q(`select version, body_sha256 from public.hd_edu_private_consent_texts where version='hd-egitim-beyan-v1'`)).rows[0];
    const declBody = (scope: "anonim" | "acik_isim", o: Record<string, unknown> = {}) => ({ hdClientId: client, consenterName: "ZZ Gerçek Danışan", relation: "danisan",
      displayScope: scope, includeBirthData: false, namedConfirmed: false, textVersion: declText.version, textSha256: declText.body_sha256,
      givenOn: new Date().toISOString().slice(0, 10), method: "egitmen_beyani", ...o });
    const pre = await call(tConsents.POST, asU(A), { method: "POST", body: declBody("anonim") });
    ok(pre.status === 400 && pre.json.code === "CONSENT_TEXT_INVALID", "onaysız beyan metniyle beyan KAYDEDİLEMEZ", pre.json);
    await q(`select public.hd_edu_priv_owner_approve_text($1,'hd-egitim-beyan-v1','ZZ-SENTETIK-HUKUK-REF (yalnız test)')`, [OWNER.id]);
    const d1 = await call(tDecl, asU(A));
    ok(d1.status === 200 && (d1.json.text as Record<string, unknown>)?.version === "hd-egitim-beyan-v1", "owner + hukuk onayından sonra beyan metni sunulur");
    const withFile = await call(tConsents.POST, asU(A), { method: "POST", body: declBody("anonim", { evidenceBase64: Buffer.alloc(80, 1).toString("base64"), evidenceMime: "application/pdf" }) });
    ok(withFile.status === 400, "beyan yolunda dosya gönderilirse REDDEDİLİR (sessizce yok sayılmaz)", withFile.json);
    const mixed = await call(tConsents.POST, asU(A), { method: "POST", body: declBody("anonim", { method: "islak_imza_tarama" }) });
    ok(mixed.status === 400, "beyan metniyle belgeli yöntem karıştırılamaz", mixed.json);
    const namedNoConfirm = await call(tConsents.POST, asU(A), { method: "POST", body: declBody("acik_isim") });
    ok(namedNoConfirm.status === 400, "açık isim ayrı teyit olmadan REDDEDİLİR", namedNoConfirm.json);
    const bForA = await call(tConsents.POST, asU(B), { method: "POST", body: declBody("anonim") });
    ok(bForA.status === 404, "başka tenant'ın danışanı için beyan verilemez (404)", bForA.status);
    const decl = await call(tConsents.POST, asU(A), { method: "POST", body: declBody("anonim") });
    const consentId = String(decl.json.id ?? "");
    ok(decl.status === 201 && await n(`select count(*) n from public.hd_edu_private_consent_evidence where consent_id=$1`, [consentId]) === 0,
      "eğitmen beyanı kaydedildi — dosya / ıslak imza / tarama YOK", decl.json);
    const k = (await q(`select method, text_version, text_sha256, display_scope, include_birth_data, recorded_by, recorded_at, given_on from public.hd_edu_private_consents where id=$1`, [consentId])).rows[0];
    ok(k.method === "egitmen_beyani" && k.text_version === "hd-egitim-beyan-v1" && k.text_sha256 === declText.body_sha256 && k.recorded_by === A.id && !!k.recorded_at
      && k.display_scope === "anonim" && k.include_birth_data === false, "beyan kaydı: tarih, eğitmen, beyan sürümü + SHA, kapsam (takma ad, doğum bilgisi kapalı)", k);
    const add = await call(tItems.POST, asU(A), { method: "POST", body: { chartId: chart, consentId, title: "ZZ Gerçek örnek", aliasLabel: "Örnek Danışan G." } });
    const realId = String(add.json.id ?? "");
    ok(add.status === 201 && roxyCalls === 2, "gerçek danışan haritası beyanla arşive eklendi (yeni Roxy çağrısı YOK)", add.json);
    const rg = await call(tItem.GET, asU(A), { params: { id: realId } });
    const ri = rg.json.item as Record<string, unknown>;
    const rch = (ri?.chart ?? null) as Record<string, unknown> | null;
    ok(ri?.kind === "gercek" && ri?.state === "ok" && (ri?.consent as Record<string, unknown>)?.method === "egitmen_beyani" && rch?.birthShown === false
      && !JSON.stringify(rg.json).includes("ZZ Gerçek Danışan") && !JSON.stringify(rg.json).includes("1990-01-01"),
      "gerçek kayıt: takma ad + doğum bilgisi GİZLİ (ayrı yetki yok), danışan adı yanıtta YOK");
    const named = await call(tItems.POST, asU(A), { method: "POST", body: { chartId: chart, consentId, title: "x", aliasLabel: "x", displayMode: "named" } });
    ok(named.status >= 400, "anonim beyanla açık isim gösterimi seçilemez", named.status);
    ok((await call(tItem.GET, asU(B), { params: { id: realId } })).status === 404 && (await call(tItem.GET, asU(C), { params: { id: realId } })).status === 404,
      "gerçek kayıt başka eğitmen / tenant'a görünmez");
    const wd = await call(tConsentWd, asU(A), { method: "POST", params: { id: consentId }, body: { channel: "danisan_talebi", confirm: true } });
    const rg2 = await call(tItem.GET, asU(A), { params: { id: realId } });
    const ri2 = (rg2.json.item ?? {}) as Record<string, unknown>;
    ok(wd.status === 200 && (rg2.status === 404 || (ri2.state === "consent_withdrawn" && ri2.chart === null)), "izin geri çekildi → erişim ANINDA kapandı", { wd: wd.status, s: rg2.status, st: ri2.state });
    ok((await call(tItem.GET, asU(A), { params: { id: ficId } })).status === 200, "kurgusal kayıt izin geri çekmesinden etkilenmez");

    // ── 4) Hesap modülü: aynı kota anahtarları, demo, kayıtlı sonuç (birim) ─────────────────────────
    section("4 · Kurgusal hesap: ücret / kota / yetki kuralları normal analizle AYNI");
    const scopes: string[] = [];
    let calls = 0;
    const deps = {
      config: { apiKey: "zz", baseUrl: "https://zz.invalid/api/v2" },
      callRoxy: async () => { calls++; return { ok: true as const, raw: JSON.parse(consistentRoxyResponse(FIXTURE, JSON.stringify({ date: "2018-07-20", time: "16:00:00", timezone: "UTC", latitude: 37.87, longitude: 32.48, nodeType: "true" }))) }; },
      rateLimit: async (scope: string) => { scopes.push(scope); return { allowed: true, retryAfterSec: 0 }; },
      findExisting: async () => null,
    };
    const base = { trainerId: A.id, tenantId: A.tenant, isDemo: false, birthDate: "2018-07-20", birthTime: "19:00", locationRef: "trd-42-selcuklu" };
    await computeFictionalChart(base, deps);
    ok(JSON.stringify(scopes) === JSON.stringify(["hd-roxy-inflight", "hd-roxy-user", "hd-roxy-tenant"]), "kota anahtarları normal analizle aynı (eşzamanlı kilit + kullanıcı + tenant)", scopes);
    calls = 0;
    const demo = await computeFictionalChart({ ...base, isDemo: true }, deps);
    ok(!demo.ok && demo.status === 403 && calls === 0, "demo hesap: 403, ücretli çağrı yok");
    const limited = await computeFictionalChart(base, { ...deps, rateLimit: async (s: string) => ({ allowed: s !== "hd-roxy-user", retryAfterSec: 30 }) });
    ok(!limited.ok && limited.status === 429 && calls === 0, "kullanıcı kotası doluysa 429, ücretli çağrı yok");
    const exist = await computeFictionalChart(base, { ...deps, findExisting: async () => "zz-mevcut" });
    ok(exist.ok && exist.existingItemId === "zz-mevcut" && calls === 0, "aynı girdi kayıtlıysa Roxy ÇAĞRILMAZ");
    const noLoc = await computeFictionalChart({ ...base, locationRef: "olmayan-yer-xyz" }, deps);
    ok(!noLoc.ok && noLoc.status === 422 && calls === 0, "listeden seçilmemiş yer → 422 (saat dilimi tahmin edilmez)");
    const notCfg = await computeFictionalChart(base, { ...deps, config: null });
    ok(!notCfg.ok && notCfg.status === 503 && calls === 0, "hesap yapılandırılmamışsa 503");

    section("Genel");
    ok(external.length === 0, "dış ağ isteği 0", external.slice(0, 5));
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error("HATA", e); process.exit(1); });
