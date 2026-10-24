/**
 * FAZ 8 — Eğitim çalışma alanı ÇİZİM KATMANI · arka uç güvenlik + işlev testleri (bölüm 22).
 * İzole embedded-postgres + GERÇEK migration'lar (20271110/12/13 → 20271125 → 20271126) + GERÇEK route'lar.
 * Veri SENTETİK (ZZ_*). Dış ağ 0 (fetch yalnız yerel; aksi sayılır ve başarısız sayılır).
 * Çalıştır: npx tsx scripts/hd-education/annotations/annotation-harness.ts   (HD_EDU_ANN_PORT, varsayılan 54821)
 */
import "../../hd-analysis-word-flow/env";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv } from "../../anamnez/testEnv";
import { PRIVATE_RPCS } from "../private/pgSchema";
import { syntheticEducationSnapshot } from "../syntheticSnapshot";
import { ANN_RPCS, annotationSql, sampleDoc, seedCentralSubject } from "./annSeed";
import { ANN_BOX, ANN_BUBBLE_R, ANN_CANVAS, ANN_MAX_NOTE, ANN_MAX_NOTES, parseAnnDoc } from "../../../lib/human-design/education/annotations/annotationContract";

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

async function call(h: Handler, kind: "user" | "admin", w: Pick<Who, "id" | "token"> | null, o: { method?: string; body?: unknown; raw?: string; params?: Record<string, string>; query?: string; headers?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130", ...(o.headers ?? {}) };
  if (w) { headers[kind === "admin" ? "x-admin-id" : "x-user-id"] = w.id; headers["x-session-token"] = w.token; }
  const body = o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined);
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await h(new NextRequest(`http://localhost/api/t${o.query ?? ""}`, { method: o.method ?? "GET", headers, body }), { params: Promise.resolve(o.params ?? {}) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* json değil */ }
  return { status: res.status, body: text, json };
}

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
    port: Number(process.env.HD_EDU_ANN_PORT ?? 54821),
    dirName: `hd-edu-ann-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: [...PRIVATE_RPCS, ...ANN_RPCS],
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
    const oAccess = await R("admin/hd/education/training-access");
    const tConsents = await R("hd/education/private/consents");
    const tItems = await R("hd/education/private/items");
    const tWd = (await R("hd/education/private/consents/[id]/withdraw")).POST;
    const tDelete = (await R("hd/education/private/items/delete")).POST;

    const mk = async (label: string, role = "expert", o: { superAdmin?: boolean; tenant?: string } = {}): Promise<Who> => {
      const id = randomUUID(), tenant = o.tenant ?? randomUUID(), token = `zz-ann-${label}-${id.slice(0, 6)}`;
      if (!o.tenant) await q(`insert into public.tenants(id, name) values ($1,$2)`, [tenant, `ZZ_ANN_${label}`]);
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin)
               values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7)`,
        [id, `ZZ_ANN_${label}`, `zz.ann.${label.toLowerCase()}@example.test`, role, JSON.stringify(role === "expert" ? { human_design: true, clients: true } : {}), tenant, o.superAdmin === true]);
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, tenant, label };
    };
    const OWNER = await mk("OWNER", "admin", { superAdmin: true });
    const ADMIN = await mk("ADMIN", "admin");
    const A = await mk("EGITMEN_A"), B = await mk("EGITMEN_B"), X = await mk("YETKISIZ_X");
    await q(`select public.hd_edu_priv_owner_approve_text($1,'hd-egitim-izin-v1','ZZ-SENTETIK')`, [OWNER.id]);
    await q(`select public.hd_edu_priv_owner_set_open($1,true,null)`, [OWNER.id]);
    for (const w of [A, B]) await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, w.id]);
    const S1 = await seedCentralSubject(q, OWNER.id, { name: "ZZ Sentetik Bilimci", publish: true });
    const S2 = await seedCentralSubject(q, OWNER.id, { name: "ZZ Sentetik Taslak", publish: false, date: "1902-01-01", utc: "1902-01-01T09:00:00Z" });

    // Özel kayıt (A): gerçek route'larla izin + kayıt.
    const SNAP = syntheticEducationSnapshot("2018-07-20T16:00:00Z", 37.87, 32.48, 1);
    const sha = (await q(`select body_sha256 from public.hd_edu_private_consent_texts where version='hd-egitim-izin-v1'`)).rows[0].body_sha256 as string;
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n% ZZ\n"), Buffer.alloc(200, 32)]).toString("base64");
    let n = 0;
    const privItem = async (w: Who, title: string) => {
      const c = (await q(`insert into public.human_design_clients(tenant_id, user_id, name) values ($1,$2,$3) returning id`, [w.tenant, w.id, `ZZ_DANISAN_${++n}`])).rows[0].id as string;
      const ch = (await q(`insert into public.human_design_charts(tenant_id, user_id, client_id, source, birth_date, birth_time, timezone, computed_result, provider, provider_raw)
         values ($1,$2,$3,'computed','2018-07-20',$4,'UTC',$5,'roxyapi',$6) returning id`,
        [w.tenant, w.id, c, `16:${String(n).padStart(2, "0")}`, JSON.stringify({ ...(SNAP.computed_result as object), zz: n }), JSON.stringify(SNAP.provider_raw)])).rows[0].id as string;
      const k = String((await call(tConsents.POST, "user", w, { method: "POST", body: { hdClientId: c, consenterName: "ZZ İzin Veren", relation: "danisan", displayScope: "anonim",
        includeBirthData: false, namedConfirmed: false, textVersion: "hd-egitim-izin-v1", textSha256: sha, givenOn: "2026-10-01", method: "islak_imza_tarama", evidenceMime: "application/pdf", evidenceBase64: pdf } })).json.id);
      const it = String((await call(tItems.POST, "user", w, { method: "POST", body: { chartId: ch, consentId: k, title, aliasLabel: "Örnek" } })).json.id);
      return { client: c, chart: ch, consent: k, item: it };
    };
    const PA = await privItem(A, "A özel kaydı");
    const PA2 = await privItem(A, "A ikinci kayıt");
    const PB = await privItem(B, "B özel kaydı");
    ok(/^[0-9a-f-]{36}$/.test(PA.item) && /^[0-9a-f-]{36}$/.test(PB.item), "sentetik özel kayıtlar hazır (A, B)");

    const unrelated = async () => JSON.stringify((await q(`select
        (select coalesce(md5(string_agg(t::text, '|' order by t.id)), '') from public.human_design_clients t) c,
        (select coalesce(md5(string_agg(row(t.id, t.computed_result, t.provider_raw, t.birth_date, t.birth_time, t.client_id)::text, '|' order by t.id)), '') from public.human_design_charts t) h,
        (select coalesce(md5(string_agg(t::text, '|' order by t.id)), '') from public.hd_education_subjects t) s,
        (select coalesce(md5(string_agg(t::text, '|' order by t.id)), '') from public.hd_education_charts t) ch`)).rows[0]);
    const unrelatedBefore = await unrelated();
    const cGet = (w: Who | null, id: string) => call(aCentral.GET, "user", w, { params: { id } });
    const cPut = (w: Who | null, id: string, doc: unknown, rev: number) => call(aCentral.PUT, "user", w, { method: "PUT", params: { id }, body: { doc, expectedRevision: rev } });
    const pGet = (w: Who | null, id: string) => call(aPrivate.GET, "user", w, { params: { id } });
    const pPut = (w: Who | null, id: string, doc: unknown, rev: number) => call(aPrivate.PUT, "user", w, { method: "PUT", params: { id }, body: { doc, expectedRevision: rev } });
    const rows = async () => Number((await q(`select count(*)::int n from public.hd_edu_annotation_layers`)).rows[0].n);

    // ── 1) Merkezî: oluştur / oku / CAS ────────────────────────────────────────────────────────────
    section("1 · Merkezî harita: kaydet / yeniden aç / CAS");
    const g0 = await cGet(A, S1.id);
    ok(g0.status === 200 && g0.json.layer === null, "ilk açılış: katman yok (null)");
    const s1 = await cPut(A, S1.id, sampleDoc("a"), 0);
    const L1 = s1.json.layer as { id: string; revision: number; elCount: number };
    ok(s1.status === 200 && L1.revision === 1 && L1.elCount === 5, "5 öğe (kalem/ok/daire/baloncuk/metin) kaydedildi — revizyon 1", s1.json);
    const g1 = await cGet(A, S1.id);
    const d1 = (g1.json.layer as { doc: { els: Array<{ id: string; t: string }> } }).doc;
    ok(JSON.stringify(d1) === JSON.stringify(sampleDoc("a")), "yeniden açılış: belge BİREBİR aynı (koordinat + çapa + kanal/merkez hedefi + baloncuk notu + eğitim notları)");
    const stale = await cPut(A, S1.id, { v: 1, els: [] }, 0);
    ok(stale.status === 409 && stale.json.code === "REVISION_CONFLICT" && stale.json.currentRevision === 1, "eski revizyonla kayıt → 409 (sessiz üzerine yazma YOK) + güncel revizyon", stale.json);
    const s2 = await cPut(A, S1.id, { v: 1, els: sampleDoc("a").els.slice(0, 2) }, 1);
    ok(s2.status === 200 && (s2.json.layer as { revision: number }).revision === 2, "doğru revizyonla güncelleme → revizyon 2");
    const race = await Promise.all([cPut(A, S1.id, sampleDoc("a"), 2), cPut(A, S1.id, sampleDoc("a"), 2)]);
    ok(race.filter((r) => r.status === 200).length === 1 && race.filter((r) => r.status === 409).length === 1, "aynı revizyonla iki eşzamanlı kayıt → biri 200, diğeri 409 (iki cihaz)", race.map((r) => r.status));
    ok((await q(`select count(*)::int n from public.hd_edu_annotation_audit where layer_id=$1 and action in ('layer_created','layer_updated')`, [L1.id])).rows[0].n === 3, "denetim: 1 oluşturma + 2 güncelleme (içerik yazılmadan)");
    const auditCols = (await q(`select * from public.hd_edu_annotation_audit limit 1`)).rows[0];
    ok(!JSON.stringify(auditCols).includes("ZZ ders notu"), "denetim satırında not / çizim içeriği YOK");

    // ── 2) İzolasyon ──────────────────────────────────────────────────────────────────────────────
    section("2 · Eğitmenler arası izolasyon");
    const gb = await cGet(B, S1.id);
    ok(gb.status === 200 && gb.json.layer === null, "B aynı merkezî haritada A'nın katmanını GÖRMEZ (kendi katmanı yok)");
    const sb = await cPut(B, S1.id, sampleDoc("b"), 0);
    ok(sb.status === 200, "B kendi ayrı katmanını oluşturur");
    const ga = await cGet(A, S1.id);
    ok(!JSON.stringify(ga.json).includes("b-pen-1") && JSON.stringify(ga.json).includes("a-pen-1"), "A yalnız kendi öğelerini görür (B'ninki yok)");
    const bOnA = await pGet(B, PA.item);
    const bFake = await pGet(B, randomUUID());
    ok(bOnA.status === 404 && bFake.status === 404 && bOnA.body === bFake.body, "B, A'nın özel kaydının katmanı → var olmayanla AYNI 404");
    ok((await pPut(B, PA.item, sampleDoc("b"), 0)).status === 404, "B, A'nın özel kaydına katman YAZAMAZ (404)");
    ok((await q(`select count(*)::int n from public.hd_edu_annotation_layers where private_item_id=$1`, [PA.item])).rows[0].n === 0, "DB: A'nın özel kaydında B'ye ait satır YOK");
    ok((await cGet(X, S1.id)).status === 404 && (await cPut(X, S1.id, sampleDoc("x"), 0)).status === 404, "yetkisiz uzman (tek yetki yok) → 404");

    // ── 3) Özel kayıt + izin geri çekme ───────────────────────────────────────────────────────────
    section("3 · Özel kayıt: katman, izin geri çekme, silme");
    ok((await pPut(A, PA.item, sampleDoc("p"), 0)).status === 200, "A kendi özel kaydına katman kaydeder");
    ok((await pPut(A, PA2.item, sampleDoc("q"), 0)).status === 200, "A ikinci kayda ayrı katman");
    ok(JSON.stringify((await pGet(A, PA.item)).json).includes("p-bub-1"), "özel kayıt katmanı yeniden açılır");
    const clientBefore = (await q(`select count(*)::int n from public.human_design_charts where id=$1`, [PA.chart])).rows[0].n;
    await call(tWd, "user", A, { method: "POST", params: { id: PA.consent }, body: { channel: "danisan_talebi", confirm: true } });
    ok((await pGet(A, PA.item)).status === 404 && (await pPut(A, PA.item, sampleDoc("p"), 1)).status === 404, "izin geri çekilince katman ANINDA kapanır (okuma + yazma 404)");
    ok((await q(`select count(*)::int n from public.hd_edu_annotation_layers where private_item_id=$1`, [PA.item])).rows[0].n === 1, "katman SİLİNMEDİ (owner inceleyebilir / kaldırabilir)");
    await call(tDelete, "user", A, { method: "POST", body: { ids: [PA2.item], confirmCount: 1 } });
    ok((await q(`select count(*)::int n from public.hd_edu_annotation_layers where private_item_id=$1`, [PA2.item])).rows[0].n === 0, "eğitim kaydı silinince katmanı da silinir (CASCADE)");
    ok((await q(`select count(*)::int n from public.human_design_charts where id in ($1,$2)`, [PA.chart, PA2.chart])).rows[0].n === 2 && clientBefore === 1,
      "asıl danışan haritaları KORUNDU");

    // ── 4) Owner ──────────────────────────────────────────────────────────────────────────────────
    section("4 · Owner listeleme / inceleme / kaldırma; normal admin");
    const ol = await call(oList, "admin", OWNER);
    const layers = ol.json.layers as Array<{ id: string; trainerName: string; sourceKind: string; sourceState: string; doc?: unknown; sourceId: string }>;
    ok(ol.status === 200 && layers.length === 3 && layers.every((l) => l.doc === undefined), "owner tüm katmanları listeler (3) — içerik listede YOK", layers?.length);
    ok(layers.some((l) => l.sourceKind === "private" && l.sourceState === "consent_withdrawn"), "owner izni geri çekilmiş kaydın katmanını durumuyla görür");
    const perChart = await call(oList, "admin", OWNER, { query: `?kind=central&ref=${S1.id}` });
    ok((perChart.json.layers as unknown[]).length === 2, "owner harita bazında filtre: S1 üzerinde 2 eğitmen katmanı");
    const bLayer = layers.find((l) => l.trainerName === "ZZ_ANN_EGITMEN_B")!;
    const og = await call(oLayer.GET, "admin", OWNER, { params: { layerId: bLayer.id } });
    ok(og.status === 200 && JSON.stringify(og.json).includes("b-pen-1"), "owner tek katmanı içeriğiyle inceler");
    ok((await q(`select count(*)::int n from public.hd_edu_annotation_audit where layer_id=$1 and action='owner_viewed'`, [bLayer.id])).rows[0].n === 1, "owner incelemesi denetime yazıldı");
    for (const [w, l] of [[ADMIN, "normal admin"], [A, "eğitmen (admin başlığıyla)"]] as const) {
      ok((await call(oList, "admin", w)).status === 404, `${l}: katman listesi 404`);
      ok((await call(oLayer.GET, "admin", w, { params: { layerId: bLayer.id } })).status === 404, `${l}: katman inceleme 404`);
      ok((await call(oLayer.DELETE, "admin", w, { method: "DELETE", params: { layerId: bLayer.id }, body: { confirm: true } })).status === 404, `${l}: katman kaldırma 404`);
    }
    ok((await cGet(ADMIN, S1.id)).status === 404, "normal admin eğitmen yüzünden katman okuyamaz");
    const noConfirm = await call(oLayer.DELETE, "admin", OWNER, { method: "DELETE", params: { layerId: bLayer.id }, body: {} });
    ok(noConfirm.status === 422, "owner kaldırma: açık onay olmadan 422");
    const subjBefore = (await q(`select (select count(*) from public.hd_education_subjects)::int s, (select count(*) from public.hd_education_charts)::int c`)).rows[0];
    ok((await call(oLayer.DELETE, "admin", OWNER, { method: "DELETE", params: { layerId: bLayer.id }, body: { confirm: true } })).status === 200, "owner B'nin katmanını kaldırdı");
    const subjAfter = (await q(`select (select count(*) from public.hd_education_subjects)::int s, (select count(*) from public.hd_education_charts)::int c`)).rows[0];
    ok(JSON.stringify(subjBefore) === JSON.stringify(subjAfter), "merkezî kayıt + harita KORUNDU");
    ok((await cGet(B, S1.id)).json.layer === null && (await cGet(A, S1.id)).json.layer !== null, "B'nin katmanı gitti; A'nınki etkilenmedi");
    ok((await q(`select count(*)::int n from public.hd_edu_annotation_audit where layer_id=$1 and action='owner_deleted'`, [bLayer.id])).rows[0].n === 1, "owner kaldırması denetime yazıldı");

    // ── 5) Tek yetki kapalı / eski oturum / yayından kaldırma ───────────────────────────────────────
    section("5 · Yetki kapalı, eski oturum, yayımlanmamış / yayından kaldırılmış kayıt");
    await call(oAccess.POST, "admin", OWNER, { method: "POST", body: { userId: A.id, enabled: false } });
    ok((await cGet(A, S1.id)).status === 404 && (await cPut(A, S1.id, sampleDoc("a"), 3)).status === 404, "tek yetki KAPALI → merkezî katman 404 (açık oturum dahil)");
    ok((await rows()) >= 2, "yetki kapatma katmanları SİLMEDİ");
    await call(oAccess.POST, "admin", OWNER, { method: "POST", body: { userId: A.id, enabled: true } });
    ok(JSON.stringify((await cGet(A, S1.id)).json).includes("a-pen-1"), "yeniden açınca A'nın katmanı geri görünür");
    await q(`delete from public.user_sessions where user_id=$1`, [A.id]);
    ok((await cGet(A, S1.id)).status !== 200, "oturum kapatılınca (token silindi) erişim yok");
    await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [A.id, A.token]);
    ok((await cGet(A, S2.id)).status === 404 && (await cPut(A, S2.id, sampleDoc("a"), 0)).status === 404, "yayımlanmamış (taslak) merkezî kayıt → 404");
    const S3 = await seedCentralSubject(q, OWNER.id, { name: "ZZ Sentetik Kaldırılacak", publish: true, date: "1870-01-05", utc: "1870-01-05T02:50:39Z" });
    const s3put = await cPut(A, S3.id, sampleDoc("w"), 0);
    ok(s3put.status === 200, "yayımlı S3 üzerinde katman", s3put.json);
    await q(`update public.hd_education_publications set status='withdrawn', withdrawn_at=now(), withdraw_reason='ZZ', updated_by=$2 where subject_id=$1`, [S3.id, OWNER.id]);
    const wd = await cGet(A, S3.id);
    ok(wd.status === 404 && (await cPut(A, S3.id, sampleDoc("w"), 1)).status === 404, "yayından kaldırılan merkezî kayıt → katman da kapanır (okuma + yazma 404)", wd.status);
    ok((await q(`select count(*)::int n from public.hd_edu_annotation_layers where central_subject_id=$1`, [S3.id])).rows[0].n === 1, "yayından kaldırma katmanı silmez (owner görür)");

    // ── 6) Girdi doğrulama / enjeksiyon / boyut ────────────────────────────────────────────────────
    section("6 · Girdi doğrulama, script/HTML enjeksiyonu, boyut");
    const cur = (await cGet(A, S1.id)).json.layer as { revision: number } | null;
    const rev = cur?.revision ?? 0;
    const bad = async (doc: unknown, label: string) => {
      const r = await cPut(A, S1.id, doc, rev);
      ok(r.status === 400 && r.json.code === "INVALID_DOC", label, { s: r.status, c: r.json.code });
    };
    await bad({ v: 1, els: [{ id: "x-1-a", t: "text", c: "ink", x: 0, y: 0, a: null, s: "<script>alert(1)</script>", z: 18 }] }, "metinde <script> → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "bubble", c: "ink", x: 0, y: 0, a: null, n: "<img src=x onerror=alert(1)>" }] }, "baloncuk notunda HTML → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "text", c: "ink", x: 0, y: 0, a: null, s: "a\u0000b", z: 18 }] }, "kontrol karakteri → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "pen", c: "ink", w: 4, p: [0, 0, 1, 1], onclick: "x" }] }, "bilinmeyen alan (onclick) → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "script", c: "ink" }] }, "bilinmeyen öğe türü → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "pen", c: "javascript:alert(1)", w: 4, p: [0, 0, 1, 1] }] }, "renk alanına betik → 400 (yalnız sabit palet)");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "arrow", c: "ink", w: 4, x1: 0, y1: 0, x2: 99999, y2: 0 }] }, "koordinat tuval dışında → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "pen", c: "ink", w: 4, p: Array.from({ length: 2002 }, () => 10) }] }, "kalem izi > 1000 nokta → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "bubble", c: "ink", x: 0, y: 0, a: { k: "g", id: 99 }, n: "x" }] }, "geçersiz kapı çapası (99) → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "bubble", c: "ink", x: 0, y: 0, a: null, n: "x".repeat(ANN_MAX_NOTE + 1) }] }, `baloncuk notu > ${ANN_MAX_NOTE} karakter → 400`);
    await bad({ v: 1, els: [{ id: "x-1-a", t: "bubble", c: "ink", x: 0, y: 0, a: null, n: "x", r: ANN_BUBBLE_R.max + 1 }] }, "baloncuk yarıçapı sınır dışında → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "bubble", c: "ink", x: 0, y: 0, a: null, n: "x", m: "html" }] }, "baloncuk gösterim türü bilinmeyen → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "bubble", c: "ink", x: 0, y: 0, a: null, n: "x", m: "in", bw: ANN_BOX.maxW + 1, bh: 100 }] }, "baloncuk kutusu genişliği sınır dışında → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "pen", c: "ink", w: 4, p: [ANN_CANVAS.x - 1, 0, 0, 0] }] }, "genişletilmiş tuvalin dışı (sol) → 400");
    await bad({ v: 1, els: Array.from({ length: 401 }, (_, i) => ({ id: `e-${i}-zz`, t: "circle", c: "ink", w: 2, x: 0, y: 0, r: 10, f: false })) }, "401 öğe → 400 (sınır 400)");
    await bad({ v: 1, els: [{ id: "dup-1", t: "circle", c: "ink", w: 2, x: 0, y: 0, r: 10, f: false }, { id: "dup-1", t: "circle", c: "ink", w: 2, x: 0, y: 0, r: 10, f: false }] }, "yinelenen öğe kimliği → 400");
    await bad({ v: 1, els: [], tenant_id: B.tenant }, "belgede tenant_id alanı → 400");
    await bad({ v: 1, els: [], notes: "<b>kalın</b>" }, "eğitim notlarında HTML → 400");
    await bad({ v: 1, els: [], notes: "x".repeat(ANN_MAX_NOTES + 1) }, `eğitim notları > ${ANN_MAX_NOTES} karakter → 400`);
    // FAZ 13: genişletilmiş tuval + baloncuk boyutu / kutu gösterimi + uzun not — saf doğrulama (kayıt yapılmaz → revizyon değişmez).
    {
      const L = ANN_CANVAS.x, R = ANN_CANVAS.x + ANN_CANVAS.width;
      const okDoc = parseAnnDoc({ v: 1, notes: "n".repeat(ANN_MAX_NOTES), els: [
        { id: "side-pen-1", t: "pen", c: "red", w: 4, p: [L + 2, 100, L + 40, 120, R - 2, 300] },
        { id: "side-arr-1", t: "arrow", c: "blue", w: 4, x1: L + 10, y1: 50, x2: 100, y2: 200, a1: null, a2: null },
        { id: "side-cir-1", t: "circle", c: "amber", w: 2, x: R - 60, y: 400, r: 40, f: true, a: null },
        { id: "side-bub-1", t: "bubble", c: "violet", x: L + 30, y: 600, a: null, n: "u".repeat(ANN_MAX_NOTE), r: 30, m: "in", bw: 400, bh: 300 },
        { id: "side-bub-2", t: "bubble", c: "green", x: R - 20, y: -60, a: null, n: "kısa", r: ANN_BUBBLE_R.min },
      ] });
      ok(okDoc.ok && okDoc.doc.els.length === 5, "tuvalin iki yan çalışma alanında kalem / ok / daire / baloncuk geçerli; baloncuk boyutu + kutu gösterimi + azami uzun not kabul", okDoc.ok ? null : okDoc.field);
      const old = parseAnnDoc(sampleDoc("eski"));
      ok(old.ok && JSON.stringify(old.doc.els) === JSON.stringify(sampleDoc("eski").els) && old.doc.notes === sampleDoc("eski").notes,
        "eski biçimli belge (boyutsuz baloncuk) aynen geçerli; yeni alan eklenmez");
    }
    await bad({ v: 1, els: [{ id: "x-1-a", t: "circle", c: "ink", w: 2, x: 0, y: 0, r: 10, f: false, a: { k: "h", id: "99-98" } }] }, "geçersiz kanal hedefi → 400");
    await bad({ v: 1, els: [{ id: "x-1-a", t: "arrow", c: "ink", w: 2, x1: 0, y1: 0, x2: 9, y2: 9, a1: { k: "x", id: 1 }, a2: null }] }, "bilinmeyen hedef türü → 400");
    const big = await call(aCentral.PUT, "user", A, { method: "PUT", params: { id: S1.id }, raw: JSON.stringify({ doc: { v: 1, els: [] }, expectedRevision: rev, pad: "x".repeat(300 * 1024) }) });
    ok(big.status === 413, "gövde > 256 KB → 413");
    ok((await call(aCentral.PUT, "user", A, { method: "PUT", params: { id: S1.id }, raw: "{bozuk" })).status === 400, "bozuk JSON → 400");
    const spoof = await call(aCentral.PUT, "user", A, { method: "PUT", params: { id: S1.id }, body: { doc: sampleDoc("a"), expectedRevision: rev, tenantId: B.tenant, trainerUserId: B.id } });
    ok(spoof.status === 200, "gövdeye tenant/eğitmen kimliği eklemek etkisiz (yok sayılır)");
    const own = (await q(`select tenant_id, trainer_user_id from public.hd_edu_annotation_layers where central_subject_id=$1 and trainer_user_id=$2`, [S1.id, A.id])).rows[0];
    ok(own.tenant_id === A.tenant && own.trainer_user_id === A.id && (await q(`select count(*)::int n from public.hd_edu_annotation_layers where trainer_user_id=$1`, [B.id])).rows[0].n === 0,
      "tenant spoof: satır A'nın tenant'ında kaldı; B'ye satır yazılmadı");
    const crossHeader = await call(aCentral.GET, "user", { id: B.id, token: A.token }, { params: { id: S1.id } });
    ok(crossHeader.status !== 200, "B kimliği + A token'ı (başlık sahteciliği) → reddedildi");
    const stored = JSON.stringify((await q(`select doc from public.hd_edu_annotation_layers`)).rows);
    ok(!/<|>|birth|provider_raw|computed_result|1869-11-22/.test(stored), "saklanan katmanlarda '<' '>' / doğum verisi / sağlayıcı ham verisi YOK");

    // ── 7) Tümünü temizle ─────────────────────────────────────────────────────────────────────────
    section("7 · Tüm katmanı temizleme (açık onay + CAS)");
    const curRev = ((await cGet(A, S1.id)).json.layer as { revision: number }).revision;
    const beforeClear = (await q(`select (select count(*) from public.hd_education_subjects)::int s, (select count(*) from public.hd_education_charts)::int c`)).rows[0];
    ok((await call(aCentral.DELETE, "user", A, { method: "DELETE", params: { id: S1.id }, body: { expectedRevision: curRev } })).status === 422, "onaysız temizleme → 422");
    ok((await call(aCentral.DELETE, "user", A, { method: "DELETE", params: { id: S1.id }, body: { confirm: true, expectedRevision: curRev - 1 } })).status === 409, "eski revizyonla temizleme → 409");
    ok((await call(aCentral.DELETE, "user", B, { method: "DELETE", params: { id: S1.id }, body: { confirm: true, expectedRevision: curRev } })).json.deleted === 0, "B temizlemesi A'nın katmanına DOKUNMAZ (B'nin katmanı yok → 0)");
    const cl = await call(aCentral.DELETE, "user", A, { method: "DELETE", params: { id: S1.id }, body: { confirm: true, expectedRevision: curRev } });
    ok(cl.status === 200 && cl.json.deleted === 1 && (await cGet(A, S1.id)).json.layer === null, "A tüm katmanı temizledi");
    ok(JSON.stringify(beforeClear) === JSON.stringify((await q(`select (select count(*) from public.hd_education_subjects)::int s, (select count(*) from public.hd_education_charts)::int c`)).rows[0]),
      "temizleme merkezî kayıt / haritaya DOKUNMADI");

    // ── 8) Özellik bayrakları ─────────────────────────────────────────────────────────────────────
    section("8 · Özellik bayrakları kapalıyken");
    delete process.env.HD_EDUCATION_CATALOG_ENABLED;
    ok((await cGet(A, S1.id)).status === 404, "katalog bayrağı kapalı → merkezî katman 404");
    delete process.env.HD_PRIVATE_EDUCATION_ENABLED;
    ok((await pGet(B, PB.item)).status === 404, "özel arşiv bayrağı kapalı → özel katman 404");
    ok((await call(oList, "admin", OWNER)).status === 404, "iki bayrak kapalı → owner katman uçları 404");
    process.env.HD_EDUCATION_CATALOG_ENABLED = "true";
    process.env.HD_PRIVATE_EDUCATION_ENABLED = "true";

    // ── 9) Olağan dışı kullanım sınırları ───────────────────────────────────────────────────────────
    section("9 · Hız sınırı: görüntüleme serbest, kimlik tahmini / aşırı silme sınırlı");
    await cPut(A, S1.id, sampleDoc("a"), 0);
    const views: Res[] = [];
    for (let w = 0; w < 15; w++) views.push(...await Promise.all(Array.from({ length: 10 }, () => cGet(A, S1.id))));
    ok(views.every((v) => v.status === 200), "150 katman açma → hepsi 200 (ders kullanımı sınırlanmaz)", [...new Set(views.map((v) => v.status))]);
    let missAt = -1;
    const D = await mk("TAHMINCI_D");
    await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, D.id]);
    for (let i = 0; i < 310; i++) { const r = await pGet(D, randomUUID()); if (r.status === 429) { missAt = i; break; } }
    ok(missAt === 300, "kimlik tahmini: 300 'bulunamadı' / 10 dk sonrası 429", missAt);
    const C = await mk("EGITMEN_C");
    await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, C.id]);
    let delAt = -1;
    for (let i = 0; i < 62; i++) {
      const r = await call(aCentral.DELETE, "user", C, { method: "DELETE", params: { id: S1.id }, body: { confirm: true, expectedRevision: 0 } });
      if (r.status === 429) { delAt = i; break; }
    }
    ok(delAt === 60, "aşırı silme: 60 istek / 10 dk sonrası 429", delAt);
    ok((await cGet(A, S1.id)).status === 200, "bir eğitmenin sınırı diğerini etkilemez");

    // Not: bu testte merkezî S3 tohumlandı ve yayın durumu değiştirildi (hd_education_publications) — karşılaştırma onu kapsamaz.
    const ua = JSON.parse(await unrelated()), ub = JSON.parse(unrelatedBefore);
    ok(ua.c === ub.c && ua.h === ub.h, "tüm katman işlemleri sonrası danışan ve Human Design harita kayıtları BİREBİR aynı (md5 parmak izi)", { ua, ub });
    ok(external.length === 0, "dış ağ / sağlayıcı çağrısı 0", external);
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error("HATA", e); process.exit(1); });
