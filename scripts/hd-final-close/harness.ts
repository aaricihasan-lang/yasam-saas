/**
 * HD SATIŞ ÖNCESİ NİHAİ KAPANIŞ — tek danışan listesi, iki ayrı silme, kayıtlı haritayı açma, ilk analiz tarihi.
 *
 * GERÇEK yerel gömülü Postgres + GERÇEK route handler'ları + sahte Roxy (çağrılar SAYILIR; gerçek anahtar/ağ
 * YOK). Tüm veri SENTETİK (ZZ_). Owner test grupları A (liste), B (silme), C (kayıtlı analiz), D (ilk tarih).
 *
 * Çalıştırma: npx tsx scripts/hd-final-close/harness.ts
 */
import { randomUUID } from "node:crypto";
import { TA, TB, BODYGRAPH, FIXTURE, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";
import { boundBodygraphDataUrl } from "../hd-roxy/consistentFixture";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const L1 = "trd-42-selcuklu";

async function main() {
  const env = await startHdFlowEnv({ port: 54431, dirName: "hd-final-close-pgdata" });
  const su = env.su;
  const roxy = installFakeRoxy();
  try {
    const PERMS = { human_design: true, clients: true, hd_system_reading: true };
    const UA: Auth = await mkUser(su, "FCA", TA, PERMS);
    const UB: Auth = await mkUser(su, "FCB", TB, PERMS);
    const R = {
      journey: await import("../../app/api/hd/clients/journey/route"),
      clients: await import("../../app/api/hd/clients/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
      charts: await import("../../app/api/hd/charts/route"),
      analyses: await import("../../app/api/hd/analyses/route"),
      professional: await import("../../app/api/hd/reports/professional/route"),
      reports: await import("../../app/api/hd/reports/route"),
    };
    const journey = (u: Auth, b: Json) => callRoute(R.journey.POST, "POST", u, b);
    const compute = (u: Auth, hd: string) => callRoute(R.roxy.POST, "POST", u, { client_id: hd, location_id: "client" });
    const list = (u: Auth, q = "", offset = 0, limit = 50) => callRoute(R.analyses.GET, "GET", u, undefined, `?${new URLSearchParams({ q, offset: String(offset), limit: String(limit) })}`);
    const delAnalysis = (u: Auth, id: string, expect?: number) => callRoute(R.charts.DELETE, "DELETE", u, undefined, `?id=${id}${expect !== undefined ? `&expect_reports=${expect}` : ""}`);
    const previewAnalysis = (u: Auth, id: string) => callRoute(R.charts.GET, "GET", u, undefined, `?delete_preview=${id}`);
    const getChart = (u: Auth, id: string) => callRoute(R.charts.GET, "GET", u, undefined, `?id=${id}`);
    const previewFull = (u: Auth, id: string) => callRoute(R.clients.GET, "GET", u, undefined, `?id=${id}&delete_preview=1`);
    const delFull = (u: Auth, id: string, a: number, r: number) => callRoute(R.clients.DELETE, "DELETE", u, undefined, `?id=${id}&expect_analyses=${a}&expect_reports=${r}`);
    const word = async (u: Auth, chartId: string) => callRoute(R.professional.POST, "POST", u, { chartId, requestId: randomUUID(), commentary: "none", bodygraphPng: boundBodygraphDataUrl(BODYGRAPH, chartId, FIXTURE) });
    const n = async (sql: string, args: unknown[] = []) => Number((await su.query(sql, args)).rows[0].n);
    const newClient = (o: Json = {}) => ({ action: "create_new", ad: "Aylin", soyad: "Kara", dogum: "1988-08-08", birth_time: "08:30", birth_location_ref: L1, request_id: randomUUID(), ...o });

    // ── Tohum ──────────────────────────────────────────────────────────────────
    const c1 = await journey(UA, newClient());
    const P = String(c1.json.hd_client_id);
    const J = String(c1.json.journey_client_id);
    const a1 = await compute(UA, P);
    await su.query(`update public.human_design_clients set birth_time='09:45' where id=$1`, [P]);
    const a2 = await compute(UA, P);
    const A1 = String(a1.json.id);
    const A2 = String(a2.json.id);
    const w1 = await word(UA, A1);
    const w2 = await word(UA, A2);
    ok(c1.status === 200 && a1.json.ok === true && a2.json.ok === true && A1 !== A2 && w1.json.ok === true && w2.json.ok === true, "tohum: profil + 2 tarihli analiz + her birine Word raporu", { a1: a1.json, a2: a2.json, w1: w1.json });
    const empty = await journey(UA, newClient({ ad: "Analizsiz", soyad: "Profil", dogum: "1970-01-01" }));
    const EMPTY = String(empty.json.hd_client_id);
    const jOnly = randomUUID();
    await su.query(`insert into public.clients(id, tenant_id, ad, soyad, dogum) values ($1,$2,'Yolculuk','Yalnız','1975-05-05')`, [jOnly, TA]);
    const tb = await journey(UB, newClient());
    const TBP = String(tb.json.hd_client_id);
    await compute(UB, TBP);

    // ══ A — Tek danışan listesi ═════════════════════════════════════════════════
    section("A — Tek danışan listesi (sunucu)");
    const all = ((await list(UA)).json.rows ?? []) as Json[];
    const rowP = all.find((r) => r.hdClientId === P);
    ok(rowP?.analysisCount === 2 && rowP.kind === "hd" && rowP.latestChartId === A2 && rowP.linkedToJourney === true, "A06 aynı danışanın iki analizi TEK satırda; son analiz doğru", rowP);
    const rowE = all.find((r) => r.hdClientId === EMPTY);
    ok(rowE?.analysisCount === 0 && rowE.latestChartId === null, "analizsiz HD profili aynı listede ('analiz yok' durumu, otomatik hesap tetiklemez)", rowE);
    ok(!all.some((r) => r.journeyClientId === jOnly), "aramasız listede HD kaydı olmayan Danışan Yolculuğu danışanları listeyi doldurmaz");
    const sj = ((await list(UA, "yolculuk yalnız")).json.rows ?? []) as Json[];
    ok(sj.length === 1 && sj[0]!.kind === "journey" && sj[0]!.journeyClientId === jOnly, "A05 aramada HD kaydı olmayan Danışan Yolculuğu danışanı ('Human Design Başlat') AYNI listede", sj);
    const LB = ((await list(UB)).json.rows ?? []) as Json[];
    ok(LB.length === 1 && LB[0]!.hdClientId === TBP && !all.some((r) => r.hdClientId === TBP), "A08 farklı uzmanların (tenant) kayıtları karışmaz");
    await su.query(`insert into public.human_design_clients(tenant_id, name, birth_date) select $1, 'ZZ Çok Kişi ' || lpad(g::text,4,'0'), date '1950-01-01' + g from generate_series(1, 1100) g`, [TA]);
    const seen = new Set<string>();
    let total = 0;
    for (let off = 0; ; off += 50) {
      const pg = await list(UA, "çok kişi", off, 50);
      total = Number(pg.json.total);
      const rows = (pg.json.rows ?? []) as Json[];
      for (const r of rows) seen.add(String(r.key));
      if (rows.length < 50) break;
    }
    ok(total === 1100 && seen.size === 1100, "A07 1100 kayıt: sayfa sınırlarında eksik/mükerrer yok (500 kesmesi yok)", { total, seen: seen.size });

    // ══ C — Kayıtlı analizi açma ════════════════════════════════════════════════
    section("C — Kayıtlı analizi açma (Roxy yok)");
    const callsC = roxy.state.calls;
    const g1 = await getChart(UA, A1);
    const g2 = await getChart(UA, A2);
    ok(g1.status === 200 && (g1.json.data as Json).id === A1 && String((g1.json.data as Json).birth_time).startsWith("08:30"), "C06 seçilen analiz kimliği birebir açılır (eski analiz 08:30)");
    ok(g2.status === 200 && String((g2.json.data as Json).birth_time).startsWith("09:45"), "C06 diğer analiz kendi verisiyle açılır (09:45)");
    await list(UA);
    await getChart(UA, A1);
    ok(roxy.state.calls === callsC, "C04/C05 kayıtlı analizi açmak / listede gezinmek / yeniden açmak Roxy çağrısı ÜRETMEZ", roxy.state.calls - callsC);
    ok((await getChart(UB, A1)).status === 404, "başka tenant kayıtlı analizi açamaz (404)");

    // ══ D — İlk analiz tarihi ═══════════════════════════════════════════════════
    section("D — İlk analiz tarihi");
    const created = (await su.query(`select min(created_at) mn, max(created_at) mx from public.human_design_charts where client_id=$1`, [P])).rows[0] as { mn: Date; mx: Date };
    ok(new Date(String(rowP?.firstAnalysisAt)).getTime() === new Date(created.mn).getTime() && new Date(String(rowP?.lastAnalysisAt)).getTime() === new Date(created.mx).getTime(), "D01/D02 ilk analiz = en eski kayıt, son analiz = en yeni (sunucu verisi)", { rowP, created });
    ok(rowE?.firstAnalysisAt === null, "analizi olmayan profilde ilk analiz tarihi uydurulmaz (null)");

    // ══ B — Analizi Sil ═════════════════════════════════════════════════════════
    section("B — Analizi Sil (yalnız seçilen analiz)");
    const pv = await previewAnalysis(UA, A1);
    ok(pv.status === 200 && (pv.json.scope as Json).reports === 1 && (pv.json.scope as Json).hdClientId === P, "onay kapsamı: analiz + 1 Word raporu (kesin sayı)", pv.json);
    const stale = await delAnalysis(UA, A1, 0);
    ok(stale.status === 409 && (await n(`select count(*)::int n from public.human_design_charts where id=$1`, [A1])) === 1, "onaydaki rapor sayısı aşıldıysa (eski onay) HİÇBİR şey silinmez (409)", stale.json);
    const bad = await delAnalysis(UA, "not-a-uuid");
    const ghost = await delAnalysis(UA, randomUUID());
    ok(bad.status === 400 && ghost.status !== 200 && ghost.json.ok !== true, "B10 geçersiz / olmayan kimlik yanlış başarı göstermez", { bad: bad.status, ghost: ghost.status });
    ok((await delAnalysis(UB, A1)).status !== 200 && (await n(`select count(*)::int n from public.human_design_charts where id=$1`, [A1])) === 1, "B08 başka uzman (tenant) bu analizi silemez");
    // B11 — rapor silme hatası → analiz yerinde kalır, tekrar deneme tamamlar
    await su.query(`revoke delete on public.human_design_reports from service_role`);
    const partial = await delAnalysis(UA, A1, 1);
    const stillA1 = await n(`select count(*)::int n from public.human_design_charts where id=$1`, [A1]);
    await su.query(`grant delete on public.human_design_reports to service_role`);
    ok(partial.status === 500 && partial.json.ok !== true && stillA1 === 1, "B11 yarım kalan silme başarı göstermez; analiz yerinde kalır", partial.json);
    const [d1, d2] = await Promise.all([delAnalysis(UA, A1, 1), delAnalysis(UA, A1, 1)]);
    const okCount = [d1, d2].filter((d) => d.status === 200).length;
    ok(okCount === 1, "B12 çift tıklama / eşzamanlı silme: yalnız biri başarı, diğeri başarı GÖSTERMEZ", [d1.status, d2.status]);
    ok((await n(`select count(*)::int n from public.human_design_charts where id=$1`, [A1])) === 0 && (await n(`select count(*)::int n from public.human_design_reports where id=$1`, [String(w1.json.id)])) === 0, "seçilen analiz ve ona ait Word raporu silindi");
    ok((await n(`select count(*)::int n from public.human_design_charts where id=$1`, [A2])) === 1 && (await n(`select count(*)::int n from public.human_design_reports where id=$1`, [String(w2.json.id)])) === 1, "B01 diğer tarihli analiz ve onun Word raporu KORUNDU");
    ok((await n(`select count(*)::int n from public.human_design_clients where id=$1`, [P])) === 1, "B02 HD profili korundu");
    const afterOne = ((await list(UA, "aylin kara")).json.rows ?? []) as Json[];
    ok(afterOne.find((r) => r.hdClientId === P)?.analysisCount === 1, "liste güncel (analiz sayısı 1)");

    // ══ B — Human Design Kaydını Tamamen Sil ═══════════════════════════════════
    section("B — Human Design kaydını tamamen sil");
    const tables = (await su.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name not like 'human_design_%' order by 1`)).rows.map((r) => String(r.table_name));
    const snapshot = async () => {
      const out: Record<string, number> = {};
      for (const t of tables) out[t] = await n(`select count(*)::int n from public."${t}"`);
      return out;
    };
    const tbBefore = await n(`select count(*)::int n from public.human_design_charts where tenant_id=$1`, [TB]);
    const otherBefore = await snapshot();
    const fp = await previewFull(UA, P);
    ok(fp.status === 200 && fp.json.analyses === 1 && fp.json.reports === 1 && fp.json.journeyLinked === true, "silme önizlemesi kesin sayılar (1 analiz, 1 rapor, Danışan Yolculuğu bağlı)", fp.json);
    const stale2 = await delFull(UA, P, 0, 0);
    ok(stale2.status === 409 && (await n(`select count(*)::int n from public.human_design_clients where id=$1`, [P])) === 1, "onaydan sonra kapsam büyüdüyse hiçbir şey silinmez (409)", stale2.json);
    ok((await delFull(UB, P, 1, 1)).status !== 200 && (await n(`select count(*)::int n from public.human_design_clients where id=$1`, [P])) === 1, "B08 başka uzman tüm HD kaydını silemez");
    const [f1, f2] = await Promise.all([delFull(UA, P, 1, 1), delFull(UA, P, 1, 1)]);
    ok([f1, f2].filter((f) => f.status === 200).length === 1, "B12 eşzamanlı tam silme: yalnız biri başarı", [f1.status, f2.status, f1.json, f2.json]);
    ok((await n(`select count(*)::int n from public.human_design_clients where id=$1`, [P])) === 0 && (await n(`select count(*)::int n from public.human_design_charts where client_id=$1 or id=$2`, [P, A2])) === 0 && (await n(`select count(*)::int n from public.human_design_reports where client_id=$1 or id=$2`, [P, String(w2.json.id)])) === 0, "B03/B04/B05 HD profili, tüm analizleri ve raporları silindi");
    ok((await n(`select count(*)::int n from public.clients where id=$1`, [J])) === 1, "B06 Danışan Yolculuğu (merkezî) danışan kaydı KORUNDU");
    const otherAfter = await snapshot();
    const changedTables = tables.filter((t) => otherAfter[t] !== otherBefore[t] && !/rate_limit|usage|audit|session/i.test(t));
    ok(changedTables.length === 0, "B07 HD dışındaki tüm tabloların satır sayıları aynı (diğer modüller korunur)", changedTables);
    ok((await n(`select count(*)::int n from public.human_design_charts where tenant_id=$1`, [TB])) === tbBefore, "B08 başka tenant'ın HD kayıtları korunur");
    ok((await n(`select count(*)::int n from public.human_design_clients where id=$1`, [EMPTY])) === 1, "başka danışanın (aynı uzman) profili korunur");
    // B09 — silinen HD kaydı geri gelmez
    const callsB9 = roxy.state.calls;
    const listAfter = ((await list(UA, "aylin kara")).json.rows ?? []) as Json[];
    ok(listAfter.length === 1 && listAfter[0]!.kind === "journey" && listAfter[0]!.journeyClientId === J, "silme sonrası kişi yalnız Danışan Yolculuğu kaydı olarak görünür ('Human Design Başlat')", listAfter);
    const re = await journey(UA, { action: "create_for_existing", journey_client_id: J, birth_time: "12:00", birth_location_ref: L1 });
    const P2 = String(re.json.hd_client_id);
    const p2row = (await su.query(`select birth_time, birth_date from public.human_design_clients where id=$1`, [P2])).rows[0] as { birth_time: string; birth_date: string };
    ok(re.status === 200 && P2 !== P && p2row.birth_time.startsWith("12:00"), "B09 yeniden başlatma YENİ profil oluşturur; eski HD doğum saati (08:30/09:45) geri gelmez", { re: re.json, p2row });
    ok((await n(`select count(*)::int n from public.human_design_charts where client_id=$1`, [P2])) === 0 && (await n(`select count(*)::int n from public.human_design_reports where client_id=$1`, [P2])) === 0, "B09 silinmiş analiz/rapor yeni profilde görünmez");
    const rec = await compute(UA, P2);
    ok(rec.status === 200 && rec.json.reused === false && rec.json.id !== A1 && rec.json.id !== A2 && roxy.state.calls === callsB9 + 1, "B09 yeni analiz yeni kayıt yaşam döngüsüyle (eski analiz önbellekten geri gelmez)", rec.json);
    const legacy = randomUUID();
    await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date) values ($1,$2,'ZZ Bağsız Eski','1960-06-06')`, [legacy, TA]);
    await su.query(`insert into public.human_design_charts(tenant_id, client_id, client_name, source, type_code) values ($1,$2,'ZZ Bağsız Eski','manual','generator')`, [TA, legacy]);
    const lp = await previewFull(UA, legacy);
    const ld = await delFull(UA, legacy, Number(lp.json.analyses), Number(lp.json.reports));
    ok(ld.status === 200 && (await n(`select count(*)::int n from public.human_design_charts where client_id=$1`, [legacy])) === 0, "B14 Danışan Yolculuğu'na bağlı olmayan eski profil + manuel analiz güvenle silinir", ld.json);

    ok(roxy.state.external.length === 0, "harici ağ isteği yok", roxy.state.external.slice(0, 3));
  } finally {
    roxy.restore();
    await env.stop();
  }
  console.log(`\nHD NİHAİ KAPANIŞ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { for (const f of fails) console.log(" -", f); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
