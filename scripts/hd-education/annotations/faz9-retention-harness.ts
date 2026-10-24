/**
 * FAZ 9 — Üyelik / yetki kapatma sonrası VERİ KORUMA · yeniden aktivasyon · danışan izni ayrımı · owner gerçek BodyGraph ·
 * owner kalıcı silme · tenant devri yok · otomatik silme yok · ders hazırlığı yükü (talimat bölüm 17: TEST 1–6 + 15).
 * İzole embedded-postgres + GERÇEK migration'lar (20271110/12/13 → 20271125 → 20271126) + GERÇEK route'lar. SENTETİK veri.
 * Dış ağ 0 (yerel dışı fetch FAIL sayılır; Roxy çağrısı imkânsız).
 * Çalıştır: npx tsx scripts/hd-education/annotations/faz9-retention-harness.ts   (HD_EDU_F9_PORT, varsayılan 54961)
 */
import "../../hd-analysis-word-flow/env";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv } from "../../anamnez/testEnv";
import { PRIVATE_RPCS } from "../private/pgSchema";
import { syntheticEducationSnapshot } from "../syntheticSnapshot";
import { premiumStateFromChart } from "../../../lib/human-design/bodygraph/premiumChartState";
import type { HdComputedChart } from "../../../lib/human-design/chart/computedChart";
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

async function call(h: Handler, kind: "user" | "admin", w: Pick<Who, "id" | "token"> | null, o: { method?: string; body?: unknown; params?: Record<string, string>; query?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130" };
  if (w) { headers[kind === "admin" ? "x-admin-id" : "x-user-id"] = w.id; headers["x-session-token"] = w.token; }
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const res = await h(new NextRequest(`http://localhost/api/t${o.query ?? ""}`, { method: o.method ?? "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }), { params: Promise.resolve(o.params ?? {}) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* json değil */ }
  return { status: res.status, body: text, json };
}
const md5 = (v: unknown) => createHash("md5").update(JSON.stringify(v)).digest("hex");

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
    port: Number(process.env.HD_EDU_F9_PORT ?? 54961), dirName: `hd-edu-f9-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: [...PRIVATE_RPCS, ...ANN_RPCS, "hd_edu_ann_owner_trainers", "hd_edu_ann_owner_purge_preview", "hd_edu_ann_owner_purge"],
    extraSql: annotationSql(),
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
    const tConsents = await R("hd/education/private/consents");
    const tItems = await R("hd/education/private/items");
    const tItem = (await R("hd/education/private/items/[id]")).GET;
    const cCatalog = (await R("hd/education/charts/[id]")).GET;

    const mk = async (label: string, role = "expert", o: { superAdmin?: boolean } = {}): Promise<Who> => {
      const id = randomUUID(), tenant = randomUUID(), token = `zz-f9-${label}-${id.slice(0, 6)}`;
      await q(`insert into public.tenants(id, name) values ($1,$2)`, [tenant, `ZZ_F9_${label}`]);
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin)
               values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7)`,
        [id, `ZZ_F9_${label}`, `zz.f9.${label.toLowerCase()}@example.test`, role, JSON.stringify(role === "expert" ? { human_design: true, clients: true } : {}), tenant, o.superAdmin === true]);
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, tenant, label };
    };
    const OWNER = await mk("OWNER", "admin", { superAdmin: true });
    const ADMIN = await mk("ADMIN", "admin");
    const A = await mk("EGITMEN_A"), B = await mk("EGITMEN_B"), C = await mk("EGITMEN_C");
    await q(`select public.hd_edu_priv_owner_approve_text($1,'hd-egitim-izin-v1','ZZ-SENTETIK')`, [OWNER.id]);
    await q(`select public.hd_edu_priv_owner_set_open($1,true,null)`, [OWNER.id]);
    const setAccess = (w: Who, enabled: boolean) => call(oAccess.POST, "admin", OWNER, { method: "POST", body: { userId: w.id, enabled } });
    for (const w of [A, B, C]) ok((await setAccess(w, true)).status === 200, `${w.label}: tek anahtar AÇIK`);

    // 10 yayımlı merkezî harita (sentetik; farklı tarih, belgeli yerel saat ile tutarlı UTC).
    const S: string[] = [];
    for (let i = 0; i < 10; i++) {
      const d = `18${70 + i}-0${(i % 9) + 1}-1${i % 9}`;
      S.push((await seedCentralSubject(q, OWNER.id, { name: `ZZ Sentetik Kişi ${i + 1}`, publish: true, date: d })).id);
    }
    const SNAP = syntheticEducationSnapshot("2018-07-20T16:00:00Z", 37.87, 32.48, 1);
    const sha = (await q(`select body_sha256 from public.hd_edu_private_consent_texts where version='hd-egitim-izin-v1'`)).rows[0].body_sha256 as string;
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n% ZZ\n"), Buffer.alloc(200, 32)]).toString("base64");
    let n = 0;
    const privItem = async (w: Who, title: string) => {
      const c = (await q(`insert into public.human_design_clients(tenant_id, user_id, name) values ($1,$2,$3) returning id`, [w.tenant, w.id, `ZZ_DANISAN_${++n}`])).rows[0].id as string;
      const ch = (await q(`insert into public.human_design_charts(tenant_id, user_id, client_id, source, birth_date, birth_time, timezone, computed_result, provider, provider_raw)
         values ($1,$2,$3,'computed','2018-07-20',$4,'UTC',$5,'roxyapi',$6) returning id`,
        [w.tenant, w.id, c, `16:${String(n % 60).padStart(2, "0")}`, JSON.stringify({ ...(SNAP.computed_result as object), zz: n }), JSON.stringify(SNAP.provider_raw)])).rows[0].id as string;
      const k = String((await call(tConsents.POST, "user", w, { method: "POST", body: { hdClientId: c, consenterName: "ZZ İzin Veren", relation: "danisan", displayScope: "anonim",
        includeBirthData: false, namedConfirmed: false, textVersion: "hd-egitim-izin-v1", textSha256: sha, givenOn: "2026-10-01", method: "islak_imza_tarama", evidenceMime: "application/pdf", evidenceBase64: pdf } })).json.id);
      const it = String((await call(tItems.POST, "user", w, { method: "POST", body: { chartId: ch, consentId: k, title, aliasLabel: "Örnek" } })).json.id);
      return { client: c, chart: ch, consent: k, item: it };
    };
    const cGet = (w: Who, id: string) => call(aCentral.GET, "user", w, { params: { id } });
    const cPut = (w: Who, id: string, doc: unknown, rev: number) => call(aCentral.PUT, "user", w, { method: "PUT", params: { id }, body: { doc, expectedRevision: rev } });
    const pGet = (w: Who, id: string) => call(aPrivate.GET, "user", w, { params: { id } });
    const pPut = (w: Who, id: string, doc: unknown, rev: number) => call(aPrivate.PUT, "user", w, { method: "PUT", params: { id }, body: { doc, expectedRevision: rev } });
    const layersOf = async (w: Who) => (await q(`select id, source_kind, coalesce(central_subject_id, private_item_id) src, doc, el_count, revision, tenant_id, updated_at from public.hd_edu_annotation_layers where trainer_user_id=$1 order by id`, [w.id])).rows;
    const itemsOf = async (w: Who) => (await q(`select id, title, consent_id, source_chart_id, updated_at from public.hd_edu_private_items where trainer_user_id=$1 order by id`, [w.id])).rows;
    const unrelated = async () => md5((await q(`select (select md5(coalesce(string_agg(t::text,'|' order by t.id),'')) from public.human_design_clients t) c,
        (select md5(coalesce(string_agg(row(t.id,t.computed_result,t.provider_raw,t.client_id)::text,'|' order by t.id),'')) from public.human_design_charts t) h,
        (select md5(coalesce(string_agg(t::text,'|' order by t.id),'')) from public.hd_education_subjects t) s,
        (select md5(coalesce(string_agg(t.id::text,'|' order by t.id),'')) from public.hd_education_charts t) ch`)).rows[0]);

    // ── TEST 1 · Üyelik / yetki kapatma ─────────────────────────────────────────────────────────
    section("TEST 1 · Üyelik kapatma: erişim 0, silinen çalışma 0");
    for (const [i, id] of S.entries()) ok((await cPut(A, id, { ...sampleDoc(`a${i}`), notes: `ZZ ders notu harita ${i + 1}` }, 0)).status === 200, `A merkezî harita ${i + 1}: çizim + baloncuk + metin + not kaydedildi`);
    const P = [await privItem(A, "Özel 1"), await privItem(A, "Özel 2"), await privItem(A, "Özel 3")];
    for (const [i, p] of P.entries()) ok((await pPut(A, p.item, { ...sampleDoc(`p${i}`), notes: `ZZ özel not ${i + 1}` }, 0)).status === 200, `A özel kayıt ${i + 1}: not kaydedildi`);
    const L0 = await layersOf(A), I0 = await itemsOf(A);
    ok(L0.length === 13 && I0.length === 3, "DB: 13 katman (10 merkezî + 3 özel) + 3 özel kayıt GERÇEKTEN saklandı", { L: L0.length, I: I0.length });
    ok(L0.every((l) => (l.doc as { els: unknown[] }).els.length === 5), "her katmanda 5 öğe (kalem, ok, daire, baloncuk, metin)");
    const fpBefore = md5([L0, I0]);
    const unrelatedBefore = await unrelated();
    ok((await setAccess(A, false)).status === 200, "owner A'nın eğitim yetkisini KAPATTI");
    let opened = 0;
    for (const id of S) { if ((await cGet(A, id)).status === 200) opened++; if ((await call(cCatalog, "user", A, { params: { id } })).status === 200) opened++; if ((await cPut(A, id, sampleDoc("x"), 1)).status === 200) opened++; }
    for (const p of P) { if ((await pGet(A, p.item)).status === 200) opened++; if ((await call(tItem, "user", A, { params: { id: p.item } })).status === 200) opened++; if ((await pPut(A, p.item, sampleDoc("x"), 1)).status === 200) opened++; }
    const newItem = await call(tItems.POST, "user", A, { method: "POST", body: { chartId: P[0].chart, consentId: P[0].consent, title: "yeni", aliasLabel: "x" } });
    if (newItem.status === 200 || newItem.status === 201) opened++;
    ok(opened === 0, "Eğitmen erişimi: 0 (merkezî katalog + katman okuma/yazma, özel kayıt + katman, yeni kayıt — hepsi reddedildi)", opened);
    ok(md5([await layersOf(A), await itemsOf(A)]) === fpBefore, "Silinen / değişen çalışma: 0 (katmanlar + özel kayıtlar BİREBİR aynı)");

    // Hesap pasife alma (arşivleme = active=false) da veri silmez.
    for (const id of S.slice(0, 2)) await cPut(B, id, { ...sampleDoc("b"), notes: "B notu" }, 0);
    const fpB = md5(await layersOf(B));
    await q(`update public.users set active=false where id=$1`, [B.id]);
    ok((await cGet(B, S[0])).status === 404, "hesap pasif (arşiv) → erişim kapalı");
    ok(md5(await layersOf(B)) === fpB, "hesap pasif → B'nin katmanları SİLİNMEDİ (CASCADE tetiklenmez; yalnız UPDATE)");
    await q(`update public.users set active=true where id=$1`, [B.id]);
    // Belirlenim: hesap arşivleme eğitim anahtarını DEĞİŞTİRMEZ (pasif hesap giriş yapamaz → erişim yok). Hesap yeniden aktif
    // olunca owner'ın eğitim anahtarı neyse o geçerlidir. Ödeme olmayan eğitmen için yol: owner eğitim anahtarını KAPATIR (TEST 1).
    ok(JSON.stringify((await cGet(B, S[0])).json).includes("B notu"), "hesap yeniden aktif + eğitim anahtarı hâlâ açık → aynı notlar geri (veri kaybı yok)");
    await setAccess(B, false);
    await q(`update public.users set active=false where id=$1`, [B.id]); await q(`update public.users set active=true where id=$1`, [B.id]);
    ok((await cGet(B, S[0])).status === 404, "eğitim anahtarı owner tarafından KAPALIYSA hesap yeniden aktifleşse de erişim AÇILMAZ");
    ok((await setAccess(B, true)).status === 200 && JSON.stringify((await cGet(B, S[0])).json).includes("B notu"), "owner anahtarı açınca B'nin notları geri");

    // ── TEST 3 · Oturum ─────────────────────────────────────────────────────────────────────────
    section("TEST 3 · Eski açık sekme ve başka cihaz");
    const A2 = { ...A, token: `zz-f9-a-cihaz2-${randomUUID().slice(0, 6)}` };
    await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [A.id, A2.token]);
    ok((await cGet(A, S[0])).status === 404 && (await cGet(A2, S[0])).status === 404, "yetki kapalı: eski sekme (aynı token) ve ikinci cihaz (ayrı token) → 404");

    // ── TEST 2 · Yeniden açma ───────────────────────────────────────────────────────────────────
    section("TEST 2 · Yeniden açma: aynı notlar, kopya yok, Roxy 0");
    const rowsBefore = Number((await q(`select (select count(*) from public.hd_edu_annotation_layers) + (select count(*) from public.hd_edu_private_items) n`)).rows[0].n);
    ok((await setAccess(A, true)).status === 200, "owner A'ya yetkiyi YENİDEN açtı");
    let same = 0;
    for (const [i, id] of S.entries()) {
      const g = await cGet(A, id);
      const L = g.json.layer as { doc: unknown; revision: number } | null;
      if (g.status === 200 && L && JSON.stringify(L.doc) === JSON.stringify({ ...sampleDoc(`a${i}`), notes: `ZZ ders notu harita ${i + 1}` }) && L.revision === 1) same++;
    }
    ok(same === 10, "10 merkezî haritada çizim + baloncuk + not BİREBİR aynı, revizyon değişmedi", same);
    let psame = 0;
    for (const [i, p] of P.entries()) { const g = await pGet(A, p.item); if (JSON.stringify((g.json.layer as { doc: unknown } | null)?.doc) === JSON.stringify({ ...sampleDoc(`p${i}`), notes: `ZZ özel not ${i + 1}` })) psame++; }
    ok(psame === 3, "3 izinli özel kayıtta not BİREBİR aynı", psame);
    ok(md5([await layersOf(A), await itemsOf(A)]) === fpBefore, "koordinatlar / kimlikler / tarihler değişmedi (parmak izi aynı)");
    ok(Number((await q(`select (select count(*) from public.hd_edu_annotation_layers) + (select count(*) from public.hd_edu_private_items) n`)).rows[0].n) === rowsBefore, "ikinci arşiv / kopya oluşmadı (satır sayısı aynı)");
    ok(external.length === 0, "yeni hesap / sağlayıcı (Roxy) çağrısı: 0");

    // ── TEST 4 · Danışan izni (üyelik iptalinden AYRI) ─────────────────────────────────────────
    section("TEST 4 · Danışan izni geri çekme ≠ üyelik kapatma");
    await call((await R("hd/education/private/consents/[id]/withdraw")).POST, "user", A, { method: "POST", params: { id: P[0].consent }, body: { channel: "danisan_talebi", confirm: true } });
    ok((await pGet(A, P[0].item)).status === 404 && (await call(tItem, "user", A, { params: { id: P[0].item } })).status === 404, "izin geri çekildi → harita + katman kapalı");
    await setAccess(A, false); await setAccess(A, true);
    ok((await pGet(A, P[0].item)).status === 404 && (await call(tItem, "user", A, { params: { id: P[0].item } })).status === 404, "yetki kapat → aç: izni geri çekilmiş kayıt KENDİLİĞİNDEN AÇILMADI");
    ok((await pGet(A, P[1].item)).status === 200 && (await pGet(A, P[2].item)).status === 200, "diğer 2 izinli özel kayıt açık");
    ok((await q(`select withdrawn_at is not null w from public.hd_edu_private_consents where id=$1`, [P[0].consent])).rows[0].w === true, "DB: izin geri çekme kaydı korunuyor (ayrı statü: consent.withdrawn_at; yetki: access_grants)");
    ok((await q(`select count(*)::int n from public.hd_edu_annotation_layers where private_item_id=$1`, [P[0].item])).rows[0].n === 1, "izni geri çekilen kaydın katmanı silinmedi (saklama/silme ayrı karar)");

    // ── TEST 5 · Owner ──────────────────────────────────────────────────────────────────────────
    section("TEST 5 · Owner: sayılar, gerçek BodyGraph verisi, kapalı içerik, normal admin");
    const tr = await call(oTrainers, "admin", OWNER);
    const aRow = (tr.json.trainers as Array<Record<string, unknown>>).find((x) => x.userId === A.id);
    ok(tr.status === 200 && !!aRow && aRow.centralLayers === 10 && aRow.privateLayers === 3 && aRow.privateItems === 3 && aRow.privateItemsClosed === 1 && aRow.grantActive === true,
      "owner eğitmen başına yetki + kayıt sayılarını görür (A: yetki AÇIK, 10 merkezî katman, 3 özel kayıt / 1 kapalı)", aRow);
    ok(!JSON.stringify(tr.json).includes("ZZ ders notu") && !JSON.stringify(tr.json).includes("Özel 1"), "eğitmen veri durumu yanıtında not / başlık içeriği YOK (yalnız sayılar)");
    const list = (await call(oList, "admin", OWNER)).json.layers as Array<Record<string, unknown>>;
    const cRow = list.find((x) => x.trainerUserId === A.id && x.sourceKind === "central")!;
    const og = await call(oLayer.GET, "admin", OWNER, { params: { layerId: String(cRow.id) } });
    const cv = (og.json.layer as { chartView: unknown }).chartView;
    const st = cv ? premiumStateFromChart(cv as HdComputedChart) : null;
    ok(og.status === 200 && !!st && Object.values(st.gates).filter(Boolean).length > 10 && st.definedCenters.size > 0, "owner: merkezî katman incelemesinde KAYITLI snapshot'tan gerçek BodyGraph verisi (aktif kapılar + tanımlı merkezler)",
      st && { gates: Object.values(st.gates).filter(Boolean).length, centers: st.definedCenters.size });
    ok(!/provider_raw|request_body|"input"|designInstantUtc/.test(JSON.stringify(cv)), "owner'a giden harita görünümü izin listeli (ham sağlayıcı / istek gövdesi yok)");
    const wRow = list.find((x) => x.sourceKind === "private" && x.sourceId === P[0].item)!;
    ok(wRow.contentClosed === true && wRow.sourceTitle === null, "listede izni geri çekilmiş kayıt: içerik kapalı, başlık gönderilmez");
    const ow = await call(oLayer.GET, "admin", OWNER, { params: { layerId: String(wRow.id) } });
    ok(ow.status === 200 && (ow.json.layer as Record<string, unknown>).contentClosed === true && !("doc" in (ow.json.layer as object)) && !ow.body.includes("ZZ özel not 1") && !ow.body.includes("p0-bub-1"),
      "izni geri çekilmiş kaydın owner incelemesinde çizim / not içeriği SUNUCUDAN GÖNDERİLMEDİ");
    for (const [w, l] of [[ADMIN, "normal admin"], [A, "eğitmen"]] as const) {
      ok((await call(oTrainers, "admin", w)).status === 404, `${l}: eğitmen veri durumu 404`);
      ok((await call(oPurge.GET, "admin", w, { params: { userId: A.id } })).status === 404, `${l}: kalıcı silme önizleme 404`);
      ok((await call(oPurge.POST, "admin", w, { method: "POST", params: { userId: A.id }, body: { expectedLayers: 13, expectedItems: 3, phrase: "16 KAYDI SİL" } })).status === 404, `${l}: kalıcı silme 404`);
    }

    // ── Tenant devri yok ────────────────────────────────────────────────────────────────────────
    section("Tenant: katman başka tenant'a taşınmaz / devredilmez");
    await cPut(C, S[0], { ...sampleDoc("c"), notes: "C eski tenant notu" }, 0);
    const newTenant = randomUUID();
    await q(`insert into public.tenants(id, name) values ($1,'ZZ_F9_YENI')`, [newTenant]);
    await q(`update public.users set tenant_id=$2 where id=$1`, [C.id, newTenant]);
    ok((await cGet(C, S[0])).status === 404, "tenant değişince eski yetki kalıcı kapandı (merkezî RPC)");
    await setAccess(C, true);
    const cAfter = await cGet(C, S[0]);
    ok(cAfter.status === 200 && cAfter.json.layer === null, "yeni tenant'ta yetki açılınca ESKİ tenant'ın katmanı görünmez (devir yok)");
    ok((await cPut(C, S[0], { ...sampleDoc("c2"), notes: "yeni" }, 0)).status === 200, "yeni tenant'ta ayrı çalışma başlatılabilir (çakışma yok)");
    ok((await q(`select count(*)::int n from public.hd_edu_annotation_layers where trainer_user_id=$1`, [C.id])).rows[0].n === 2, "eski tenant katmanı korunuyor ve yeni tenant'a TAŞINMADI (2 ayrı satır)");

    // ── TEST 6 · Owner kalıcı silme ─────────────────────────────────────────────────────────────
    section("TEST 6 · Owner kalıcı silme (yalnız sentetik)");
    const pv0 = await call(oPurge.GET, "admin", OWNER, { params: { userId: A.id } });
    ok(pv0.status === 200 && (pv0.json.preview as Record<string, unknown>).grantActive === true, "önizleme: yetki açık görünür");
    const blocked = await call(oPurge.POST, "admin", OWNER, { method: "POST", params: { userId: A.id }, body: { expectedLayers: 13, expectedItems: 3, phrase: "16 KAYDI SİL" } });
    ok(blocked.status === 409 && blocked.json.code === "GRANT_ACTIVE", "yetki AÇIKKEN kalıcı silme reddedilir (önce yetki kapatılmalı)", blocked.json);
    await setAccess(A, false);
    const pv = (await call(oPurge.GET, "admin", OWNER, { params: { userId: A.id } })).json;
    const prev = pv.preview as { layers: number; items: number; keptConsents: number; keptAudit: number };
    ok(prev.layers === 13 && prev.items === 3 && prev.keptConsents === 3 && prev.keptAudit > 0 && pv.phrase === "16 KAYDI SİL", "önizleme: 13 katman + 3 özel kayıt silinecek; 3 izin + denetim korunacak; ifade '16 KAYDI SİL'", pv);
    const consentsBefore = (await q(`select count(*)::int n from public.hd_edu_private_consents where recorded_by=$1`, [A.id])).rows[0].n;
    const evidenceBefore = (await q(`select count(*)::int n from public.hd_edu_private_consent_evidence`)).rows[0].n;
    const auditBefore = (await q(`select (select count(*) from public.hd_edu_private_audit)+(select count(*) from public.hd_edu_annotation_audit) n`)).rows[0].n;
    const fpBC = md5([await layersOf(B), await layersOf(C)]);
    ok((await call(oPurge.POST, "admin", OWNER, { method: "POST", params: { userId: A.id }, body: { expectedLayers: 13, expectedItems: 3, phrase: "16 kaydı" } })).status === 422, "yanlış onay ifadesi → 422 (silinmedi)");
    ok((await call(oPurge.POST, "admin", OWNER, { method: "POST", params: { userId: A.id }, body: { expectedLayers: 12, expectedItems: 3, phrase: "15 KAYDI SİL" } })).status === 409, "önizlemeden farklı sayı → 409 (bayat onayla silme yok)");
    ok((await call(oPurge.POST, "admin", OWNER, { method: "POST", params: { userId: randomUUID() }, body: { expectedLayers: 0, expectedItems: 0, phrase: "0 KAYDI SİL" } })).status === 404, "var olmayan eğitmen → 404");
    ok((await call(oPurge.POST, "admin", OWNER, { method: "POST", params: { userId: OWNER.id }, body: { expectedLayers: 0, expectedItems: 0, phrase: "0 KAYDI SİL" } })).status === 404, "owner kendi kaydını hedefleyemez → 404");
    ok((await layersOf(A)).length === 13, "reddedilen denemelerden sonra hiçbir şey silinmedi");
    const done = await call(oPurge.POST, "admin", OWNER, { method: "POST", params: { userId: A.id }, body: { expectedLayers: 13, expectedItems: 3, phrase: "16 kaydi sil" } });
    ok(done.status === 200 && JSON.stringify(done.json.deleted) === JSON.stringify({ layers: 13, items: 3 }), "3 aşamanın son adımı: 13 katman + 3 özel kayıt kalıcı silindi", done.json);
    ok((await layersOf(A)).length === 0 && (await itemsOf(A)).length === 0, "A'nın eğitim katmanları ve özel kayıtları yok");
    ok(md5([await layersOf(B), await layersOf(C)]) === fpBC, "yanlış eğitmen / yanlış tenant silinmedi (B ve C BİREBİR aynı)");
    ok((await q(`select count(*)::int n from public.hd_edu_private_consents where recorded_by=$1`, [A.id])).rows[0].n === consentsBefore
      && (await q(`select count(*)::int n from public.hd_edu_private_consent_evidence`)).rows[0].n === evidenceBefore, "izin kayıtları ve izin kanıtları KORUNDU (otomatik imha yok)");
    ok(Number((await q(`select (select count(*) from public.hd_edu_private_audit)+(select count(*) from public.hd_edu_annotation_audit) n`)).rows[0].n) > Number(auditBefore), "denetim izi korundu + silme denetime yazıldı (owner_purged / item_deleted)");
    ok(await unrelated() === unrelatedBefore, "danışan + HD harita (Danışan Yolculuğu bağlı kayıtlar) + merkezî kayıtlar BİREBİR aynı");
    ok((await q(`select count(*)::int n from public.users where id=$1`, [A.id])).rows[0].n === 1, "kullanıcı hesabı silinmedi");
    await setAccess(A, true);
    ok((await cGet(A, S[0])).json.layer === null && (await pGet(A, P[1].item)).status === 404, "kalıcı silinen içerik yetki yeniden açılınca GERİ GELMEZ");

    // ── Otomatik silme yok (statik denetim) ─────────────────────────────────────────────────────
    section("Süreye bağlı otomatik silme YOK");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) { if (!/node_modules|\.next|\.git/.test(f)) walk(p); continue; }
        if (!/\.(ts|tsx|sql|json|mjs)$/.test(f)) continue;
        const t = readFileSync(p, "utf8");
        if (/hd_edu_ann_owner_purge|hd_edu_annotation_layers|hd_edu_private_items/.test(t) && /(cron|schedule|inngest\.createFunction|pg_cron)/i.test(t)) hits.push(p);
      }
    };
    for (const d of ["app", "lib", "supabase", "inngest"].map((x) => path.join(process.cwd(), x))) { try { walk(d); } catch { /* yok */ } }
    let vercelCron = "";
    try { vercelCron = readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"); } catch { /* yok */ }
    ok(hits.length === 0 && !/annotation|egitim|education/i.test(vercelCron), "eğitim verisine dokunan cron / zamanlanmış görev / Inngest işi YOK", hits);
    const callers = (await q(`select count(*)::int n from pg_proc where prosrc like '%hd_edu_ann_owner_purge(%' and proname <> 'hd_edu_ann_owner_purge'`)).rows[0].n;
    ok(callers === 0, "kalıcı silme RPC'sini çağıran başka DB fonksiyonu / tetikleyici YOK", callers);

    // ── Ders hazırlığı yükü (hız sınırı olağan kullanımı engellemiyor mu?) ─────────────────────
    section("Ders hazırlığı: olağan yoğun kullanım engellenmiyor");
    const D = await mk("EGITMEN_D");
    await setAccess(D, true);
    let up = 0;
    for (let i = 0; i < 25; i++) {
      const c = (await q(`insert into public.human_design_clients(tenant_id, user_id, name) values ($1,$2,$3) returning id`, [D.tenant, D.id, `ZZ_D_${i}`])).rows[0].id as string;
      const r = await call(tConsents.POST, "user", D, { method: "POST", body: { hdClientId: c, consenterName: "ZZ", relation: "danisan", displayScope: "anonim", includeBirthData: false, namedConfirmed: false,
        textVersion: "hd-egitim-izin-v1", textSha256: sha, givenOn: "2026-10-01", method: "islak_imza_tarama", evidenceMime: "application/pdf", evidenceBase64: pdf } });
      if (r.status === 201 || r.status === 200) up++;
    }
    ok(up === 25, "1 saatte 25 izin belgesi yükleme → hepsi kabul (sınır 30)", up);
    let saves = 0, rev = 0;
    for (let i = 0; i < 120; i++) { const r = await cPut(D, S[1], { ...sampleDoc("d"), notes: `taslak ${i}` }, rev); if (r.status === 200) { saves++; rev = (r.json.layer as { revision: number }).revision; } }
    ok(saves === 120, "10 dakikada 120 not kaydı → hepsi kabul (sınır 600)", saves);
    let views = 0;
    for (let i = 0; i < 150; i++) if ((await cGet(D, S[i % 10])).status === 200) views++;
    ok(views === 150, "150 harita / katman açma → hepsi 200 (görüntüleme sınırı yok)", views);

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
