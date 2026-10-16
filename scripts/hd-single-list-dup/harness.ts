/**
 * HD — TEK ANALİZ LİSTESİ + MÜKERRER DANIŞAN / ROXY KREDİ KORUMASI harness'i.
 *
 * GERÇEK yerel gömülü Postgres + GERÇEK route handler'ları + sahte Roxy (çağrılar SAYILIR; gerçek
 * anahtar/ağ YOK). Tüm veri SENTETİK (ZZ_ önekli). Owner testleri UX-01…10, DUP-01…16 + 1500+ ölçüm.
 *
 * Çalıştırma: npx tsx scripts/hd-single-list-dup/harness.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TA, TB, LEGACY_CLIENT, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const L1 = "trd-42-selcuklu";
const L2 = "trd-06-altindag";

async function main() {
  const env = await startHdFlowEnv({ port: 54421, dirName: "hd-single-list-dup-pgdata" });
  const su = env.su;
  const roxy = installFakeRoxy();
  try {
    const PERMS = { human_design: true, clients: true, hd_system_reading: true };
    const UA: Auth = await mkUser(su, "SLA", TA, PERMS);
    const UB: Auth = await mkUser(su, "SLB", TB, PERMS);
    const H = await import("../../lib/human-design/api/hdIdentity");
    const routes = {
      journey: await import("../../app/api/hd/clients/journey/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
      analyses: await import("../../app/api/hd/analyses/route"),
    };
    const journey = (u: Auth, body: Json) => callRoute(routes.journey.POST, "POST", u, body);
    const compute = (u: Auth, body: Json) => callRoute(routes.roxy.POST, "POST", u, body);
    const list = (u: Auth, q = "", offset = 0, limit = 20) =>
      callRoute(routes.analyses.GET, "GET", u, undefined, `?${new URLSearchParams({ q, offset: String(offset), limit: String(limit) })}`);
    const count = async (t: string, tenant = TA) => Number((await su.query(`select count(*)::int n from public.${t} where tenant_id=$1`, [tenant])).rows[0].n);
    const newClient = (over: Json = {}) => ({ action: "create_new", ad: "Hasan", soyad: "Arıcı", dogum: "1990-05-01", birth_time: "10:00", birth_location_ref: L1, request_id: randomUUID(), ...over });

    // ══ Kimlik kuralları (saf) ════════════════════════════════════════════════
    section("Kimlik kuralları (saf)");
    const base = { name: "Hasan Arıcı", birthDate: "1990-05-01", birthTime: "10:00", locationId: L1 };
    ok(H.compareHdIdentity(base, { ...base }) === "exact", "DUP-01 birebir aynı → exact");
    ok(H.compareHdIdentity(base, { ...base, name: "  HASAN   ARICI " }) === "exact", "DUP-02 boşluk + büyük harf normalize (HASAN ARICI = Hasan Arıcı)");
    ok(H.compareHdIdentity(base, { ...base, name: "Hasan Arici" }) === null, "DUP-02b ı ≠ i (Türkçe harf gelişigüzel eşitlenmez)");
    ok(H.compareHdIdentity({ ...base, name: "İsmail Işık" }, { ...base, name: "ismail ışık" }) === "exact", "DUP-02c İ/I Türkçe küçük harf (İsmail Işık = ismail ışık)");
    ok(H.compareHdIdentity(base, { ...base, birthDate: "1990-05-02" }) === null, "DUP-03 farklı doğum tarihi → aday değil");
    ok(H.compareHdIdentity(base, { ...base, birthTime: "10:01" }) === null, "DUP-04 farklı doğum saati → aday değil");
    ok(H.compareHdIdentity(base, { ...base, locationId: L2 }) === null, "DUP-05 farklı teknik doğum yeri → aday değil");
    ok(H.compareHdIdentity(base, { ...base, birthTime: null }) === "possible" && H.compareHdIdentity(base, { ...base, locationId: null }) === "possible", "DUP-06 eksik saat/yer → yalnız 'possible' (kesin değil)");
    ok(H.compareHdIdentity(base, { ...base, birthTime: "10:00:59" }) === "exact", "saat HH:MM karşılaştırılır (saniye yok sayılır)");

    // ══ Yeni kayıt sırasında kontrol ════════════════════════════════════════════
    section("Yeni kayıt — mükerrer uyarısı (sunucu)");
    const c1 = await journey(UA, newClient());
    const P1 = String(c1.json.hd_client_id);
    ok(c1.status === 200 && !!P1, "ilk kayıt oluşturuldu (Hasan Arıcı)", c1.json);
    const before = { hd: await count("human_design_clients"), cl: await count("clients") };
    const d1 = await journey(UA, newClient());
    const cand = (d1.json.candidates ?? []) as Array<Json>;
    ok(d1.status === 409 && d1.json.code === "POSSIBLE_DUPLICATE_CLIENT" && cand.some((c) => c.hdClientId === P1 && c.match === "exact"), "DUP-01 birebir aynı bilgiler → 409 uyarı (exact, doğru profil)", d1.json);
    ok(cand.every((c) => c.linkedToJourney === true) && typeof cand[0]?.birthTime === "string" && typeof cand[0]?.birthPlace === "string", "uyarı alanları: ad, tarih, saat, yer + Danışan Yolculuğu bağlantısı", cand[0]);
    ok(!JSON.stringify(cand).match(/tenant|user_id|notes|phone|telefon/i), "aday yanıtı yalnız karşılaştırılan alanlar (tenant/not/telefon yok)");
    const d2 = await journey(UA, newClient({ ad: "  HASAN ", soyad: " ARICI  " }));
    ok(d2.status === 409 && (d2.json.candidates as Json[]).some((c) => c.hdClientId === P1), "DUP-02 '  HASAN  ARICI ' normalize ile aday bulunur", d2.json);
    ok((await count("human_design_clients")) === before.hd && (await count("clients")) === before.cl, "DUP-09 uyarı aşamasında HİÇBİR kayıt oluşmadı (Vazgeç = istek yok)");
    const c3 = await journey(UA, newClient({ dogum: "1990-05-02" }));
    ok(c3.status === 200, "DUP-03 farklı doğum tarihi → uyarısız kayıt", c3.json);
    const c4 = await journey(UA, newClient({ birth_time: "11:30" }));
    ok(c4.status === 200, "DUP-04 farklı doğum saati → uyarısız kayıt", c4.json);
    const c5 = await journey(UA, newClient({ birth_location_ref: L2 }));
    ok(c5.status === 200, "DUP-05 farklı teknik doğum yeri → uyarısız kayıt", c5.json);
    // Eksik bilgili eski kayıt (saat/yer yok, bağlantısız) + yalnız Danışan Yolculuğu'nda olan danışan.
    const legacyId = randomUUID();
    await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date) values ($1,$2,'Zeynep Kaya','1985-03-03')`, [legacyId, TA]);
    const jOnly = randomUUID();
    await su.query(`insert into public.clients(id, tenant_id, ad, soyad, dogum) values ($1,$2,'Zeynep','Kaya','1985-03-03')`, [jOnly, TA]);
    const d6 = await journey(UA, newClient({ ad: "Zeynep", soyad: "Kaya", dogum: "1985-03-03" }));
    const c6 = (d6.json.candidates ?? []) as Json[];
    const legacyC = c6.find((c) => c.hdClientId === legacyId);
    const jC = c6.find((c) => c.journeyClientId === jOnly && c.kind === "journey_client");
    ok(d6.status === 409 && legacyC?.match === "possible" && legacyC?.linkedToJourney === false, "DUP-06 eksik bilgili eski profil 'possible' (kesin değil) + bağlantısız gösterilir", c6);
    ok(jC?.match === "possible" && jC?.linkedToJourney === true, "Danışan Yolculuğu'ndaki aynı ad+tarihli danışan da aday (yalnız possible)", jC);
    ok(String(legacyC?.hdClientId) === legacyId, "DUP-07 'Mevcut Danışanı Aç' hedefi doğru profil kimliği");
    const hdBefore8 = await count("human_design_clients");
    const ack = c6.map((c) => String(c.key));
    const c8 = await journey(UA, newClient({ ad: "Zeynep", soyad: "Kaya", dogum: "1985-03-03", acknowledged_duplicate_keys: ack }));
    ok(c8.status === 200 && (await count("human_design_clients")) === hdBefore8 + 1, "DUP-08 bilinçli 'Farklı Kişi' onayıyla yeni kayıt oluşur", c8.json);
    const P_zeynep = String(c8.json.hd_client_id);
    const partial = await journey(UA, newClient({ ad: "Zeynep", soyad: "Kaya", dogum: "1985-03-03", acknowledged_duplicate_keys: ack }));
    ok(partial.status === 409 && (partial.json.candidates as Json[]).some((c) => c.hdClientId === P_zeynep), "DUP-08b eski onay YENİ çıkan adayı kapsamaz → yeniden uyarı", partial.json);
    const bogus = await journey(UA, newClient({ acknowledged_duplicate_keys: [`hd:${randomUUID()}`] }));
    ok(bogus.status === 409, "rastgele onay anahtarı uyarıyı geçemez (genel bypass anahtarı yok)");
    // Tekrar (aynı request_id) ve eşzamanlı aynı istek → uyarı değil, AYNI profil.
    const rid = randomUUID();
    const fresh = { ad: "Mert", soyad: "Demir", dogum: "1991-01-01", request_id: rid };
    const r1 = await journey(UA, newClient(fresh));
    const r2 = await journey(UA, newClient(fresh));
    ok(r1.status === 200 && r2.status === 200 && r1.json.hd_client_id === r2.json.hd_client_id, "aynı istek tekrarı (request_id) → aynı profil, uyarı yok", { r1: r1.json, r2: r2.json });
    const rid2 = randomUUID();
    const par = await Promise.all([0, 1, 2].map(() => journey(UA, newClient({ ad: "Ece", soyad: "Tan", dogum: "1992-02-02", request_id: rid2 }))));
    ok(par.every((p) => p.status === 200) && new Set(par.map((p) => p.json.hd_client_id)).size === 1, "eşzamanlı 3 aynı istek → tek profil", par.map((p) => p.json));
    // Mevcut merkezî danışana profil: kendisi aday değil, bağlantısız eski profil aday.
    const jNew = randomUUID();
    await su.query(`insert into public.clients(id, tenant_id, ad, soyad, dogum) values ($1,$2,'Ali','Veli','1970-07-07')`, [jNew, TA]);
    const legacy2 = randomUUID();
    await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ($1,$2,'Ali Veli','1970-07-07','08:00')`, [legacy2, TA]);
    const e1 = await journey(UA, { action: "create_for_existing", journey_client_id: jNew, birth_time: "08:00", birth_location_ref: L1 });
    const ec = (e1.json.candidates ?? []) as Json[];
    ok(e1.status === 409 && ec.some((c) => c.hdClientId === legacy2) && !ec.some((c) => c.journeyClientId === jNew), "mevcut danışana profil: bağlantısız eski profil uyarısı; seçilen danışanın kendisi aday değil", e1.json);
    const e2 = await journey(UA, { action: "create_for_existing", journey_client_id: jNew, birth_time: "08:00", birth_location_ref: L1, acknowledged_duplicate_keys: ec.map((c) => c.key) });
    ok(e2.status === 200, "onayla mevcut danışana profil oluşturulur", e2.json);
    // Tenant izolasyonu
    const tb1 = await journey(UB, newClient());
    ok(tb1.status === 200, "DUP-15 başka tenant aynı kişiyi uyarısız kaydeder (A'nın kayıtları B'de görünmez)", tb1.json);

    // ══ Roxy öncesi kontrol ═══════════════════════════════════════════════════
    section("Roxy kredisi harcanmadan önce (sunucu)");
    const calls0 = roxy.state.calls;
    const x1 = await compute(UA, { client_id: P1, location_id: "client" });
    ok(x1.status === 200 && x1.json.reused === false && roxy.state.calls === calls0 + 1, "ilk hesaplama → 1 ücretli çağrı", x1.json);
    const chart1 = String(x1.json.id);
    const x2 = await compute(UA, { client_id: P1, location_id: "client" });
    ok(x2.status === 200 && x2.json.reused === true && x2.json.id === chart1 && roxy.state.calls === calls0 + 1, "DUP-10 aynı profil + aynı girdi → kayıtlı analiz açılır, ÜCRETLİ ÇAĞRI YOK");
    // Aynı kişi ikinci profil (bilinçli farklı kişi onayıyla oluşturuldu)
    const dupNew = await journey(UA, newClient());
    const P2c = await journey(UA, newClient({ acknowledged_duplicate_keys: ((dupNew.json.candidates ?? []) as Json[]).map((c) => c.key) }));
    const P2 = String(P2c.json.hd_client_id);
    ok(P2c.status === 200 && P2 !== P1, "aynı bilgilerle ikinci profil (bilinçli onay)");
    const x3 = await compute(UA, { client_id: P2, location_id: "client" });
    const xc = (x3.json.candidates ?? []) as Json[];
    ok(x3.status === 409 && x3.json.code === "POSSIBLE_DUPLICATE_CHART" && xc.some((c) => c.chartId === chart1 && c.hdClientId === P1) && roxy.state.calls === calls0 + 1, "DUP-11 başka profildeki olası mükerrer analiz → Roxy öncesi uyarı, çağrı YOK", x3.json);
    const p2Charts = Number((await su.query(`select count(*)::int n from public.human_design_charts where client_id=$1`, [P2])).rows[0].n);
    const c1Owner = (await su.query(`select client_id from public.human_design_charts where id=$1`, [chart1])).rows[0].client_id;
    ok(p2Charts === 0 && c1Owner === P1, "DUP-12 başka profilin analizi otomatik sahiplenilmedi / bağlanmadı");
    const x4 = await compute(UA, { client_id: P2, location_id: "client", acknowledged_duplicate_keys: [`chart:${randomUUID()}`] });
    ok(x4.status === 409 && roxy.state.calls === calls0 + 1, "DUP-13 istemci atlatılsa / sahte onay → sunucu yine 409, çağrı YOK");
    const x5 = await compute(UA, { client_id: P2, location_id: "client", acknowledged_duplicate_keys: xc.map((c) => c.key) });
    ok(x5.status === 200 && x5.json.reused === false && roxy.state.calls === calls0 + 2, "bilinçli 'Farklı Kişi, Yeni Hesaplama' → 1 yeni çağrı (kredi bilerek harcanır)", x5.json);
    const x6 = await compute(UA, { client_id: P2, location_id: "client" });
    ok(x6.status === 200 && x6.json.reused === true && roxy.state.calls === calls0 + 2, "onay sonrası aynı profil tekrarında idempotency korunur (çağrı yok)");
    // Eşzamanlı: üçüncü profil, aynı ack ile 3 paralel istek → tek çağrı
    const dup3 = await journey(UA, newClient());
    const P3c = await journey(UA, newClient({ acknowledged_duplicate_keys: ((dup3.json.candidates ?? []) as Json[]).map((c) => c.key) }));
    const P3 = String(P3c.json.hd_client_id);
    const pre = await compute(UA, { client_id: P3, location_id: "client" });
    const ackP3 = ((pre.json.candidates ?? []) as Json[]).map((c) => c.key);
    const callsPar = roxy.state.calls;
    const parX = await Promise.all([0, 1, 2].map(() => compute(UA, { client_id: P3, location_id: "client", acknowledged_duplicate_keys: ackP3 })));
    ok(pre.status === 409 && roxy.state.calls === callsPar + 1 && new Set(parX.filter((p) => p.status === 200).map((p) => p.json.id)).size === 1, "DUP-14 eşzamanlı 3 onaylı istek → TEK ücretli çağrı", { calls: roxy.state.calls - callsPar, r: parX.map((p) => [p.status, p.json.code ?? p.json.id]) });
    // Başka tenant
    const tbCompute = await compute(UB, { client_id: String(tb1.json.hd_client_id), location_id: "client" });
    ok(tbCompute.status === 200 && !(tbCompute.json.candidates), "DUP-15 başka tenant'ın analizleri aday olarak görünmez", tbCompute.json);
    // Hata → fail-closed (sütun izni kaldırılarak kontrol sorgusu bozulur)
    const P4c = await journey(UA, newClient({ ad: "Deniz", soyad: "Ak", dogum: "1993-03-03" }));
    const P4 = String(P4c.json.hd_client_id);
    await su.query(`revoke select on public.human_design_charts from service_role`);
    const cols = (await su.query(`select string_agg(quote_ident(column_name), ',') c from information_schema.columns where table_schema='public' and table_name='human_design_charts' and column_name <> 'birth_place'`)).rows[0].c;
    await su.query(`grant select (${cols}) on public.human_design_charts to service_role`);
    await su.query(`notify pgrst, 'reload schema'`);
    const callsF = roxy.state.calls;
    const xf = await compute(UA, { client_id: P4, location_id: "client" });
    ok(xf.status === 503 && xf.json.code === "DUPLICATE_CHECK_FAILED" && roxy.state.calls === callsF, "DUP-16 mükerrer kontrolü hata verirse ücretli çağrı YAPILMAZ (503)", xf.json);
    const hdF = await count("human_design_clients");
    await su.query(`revoke select on public.clients from service_role`);
    const cf = await journey(UA, newClient({ ad: "Kaan", soyad: "Er", dogum: "1994-04-04" }));
    ok(cf.status !== 200 && (await count("human_design_clients")) === hdF, "DUP-16b kayıt öncesi kontrol hata verirse kayıt oluşmaz", cf.json);
    await su.query(`grant select on public.clients to service_role`);
    await su.query(`grant select on public.human_design_charts to service_role`);
    await su.query(`notify pgrst, 'reload schema'`);

    // ══ 500+ aday: eksik tarama "mükerrer yok" sayılmamalı ════════════════════
    section("500+ kayıtlı aynı doğum tarihi (sayfalı tam tarama)");
    const D = "1977-07-07";
    const ref = (await su.query(`select input, timezone from public.human_design_charts where id=$1`, [chart1])).rows[0] as { input: Json; timezone: string };
    await su.query(
      `insert into public.human_design_clients(tenant_id, name, birth_date, birth_time, birth_location_id)
       select $1, 'ZZ Dolgu Profil ' || g, $2::date, '09:00', 'trd-42-selcuklu' from generate_series(1, 620) g`, [TA, D]);
    await su.query(`insert into public.clients(tenant_id, ad, soyad, dogum) select $1, 'ZZ Dolgu', 'Danışan ' || g, $2::date from generate_series(1, 620) g`, [TA, D]);
    await su.query(
      `insert into public.human_design_charts(tenant_id, client_id, client_name, birth_date, birth_time, timezone, source, provider, input)
       select $1, null, 'ZZ Dolgu Analiz ' || g, $2::date, '09:00:00', $3, 'computed', 'roxyapi', $4::jsonb from generate_series(1, 620) g`,
      [TA, D, ref.timezone, JSON.stringify(ref.input)]);
    const LATE_PROFILE = "ffffffff-ffff-4fff-8fff-ffffffffff01";
    const LATE_JOURNEY = "ffffffff-ffff-4fff-8fff-ffffffffff02";
    const LATE_CHART = "ffffffff-ffff-4fff-8fff-ffffffffff03";
    const LATE_OWNER = "ffffffff-ffff-4fff-8fff-ffffffffff04";
    await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time, birth_location_id) values ($1,$2,'Büyük Tarih',$3,'09:00','trd-42-selcuklu')`, [LATE_PROFILE, TA, D]);
    await su.query(`insert into public.clients(id, tenant_id, ad, soyad, dogum) values ($1,$2,'Uzak','Danışan',$3)`, [LATE_JOURNEY, TA, D]);
    await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time, birth_location_id) values ($1,$2,'Roxy Uzak',$3,'09:00','trd-42-selcuklu')`, [LATE_OWNER, TA, D]);
    await su.query(
      `insert into public.human_design_charts(id, tenant_id, client_id, client_name, birth_date, birth_time, timezone, source, provider, input)
       values ($1,$2,$3,'Roxy Uzak',$4,'09:00:00',$5,'computed','roxyapi',$6::jsonb)`, [LATE_CHART, TA, LATE_OWNER, D, ref.timezone, JSON.stringify(ref.input)]);
    const sameDate = Number((await su.query(`select count(*)::int n from public.human_design_clients where tenant_id=$1 and birth_date=$2`, [TA, D])).rows[0].n);
    const lp = await journey(UA, newClient({ ad: "Büyük", soyad: "Tarih", dogum: D, birth_time: "09:00" }));
    ok(sameDate > 501 && lp.status === 409 && ((lp.json.candidates ?? []) as Json[]).some((c) => c.hdClientId === LATE_PROFILE), `profil oluşturma: aynı tarihte ${sameDate} profil; sıralamada SONDAKİ aday bulunur`, lp.json);
    const lj = await journey(UA, newClient({ ad: "Uzak", soyad: "Danışan", dogum: D, birth_time: "09:00" }));
    ok(lj.status === 409 && ((lj.json.candidates ?? []) as Json[]).some((c) => c.journeyClientId === LATE_JOURNEY), "profil oluşturma: 620+ merkezî danışan arasında sondaki aday bulunur", lj.json);
    const rxCreate = await journey(UA, newClient({ ad: "Roxy", soyad: "Uzak", dogum: D, birth_time: "09:00" }));
    const PX = String((await journey(UA, newClient({ ad: "Roxy", soyad: "Uzak", dogum: D, birth_time: "09:00", acknowledged_duplicate_keys: ((rxCreate.json.candidates ?? []) as Json[]).map((c) => c.key) }))).json.hd_client_id);
    const callsLate = roxy.state.calls;
    const lr = await compute(UA, { client_id: PX, location_id: "client" });
    ok(lr.status === 409 && ((lr.json.candidates ?? []) as Json[]).some((c) => c.chartId === LATE_CHART) && roxy.state.calls === callsLate, "Roxy öncesi: 620+ aynı girdili analiz arasında sondaki aday bulunur, çağrı YOK", { status: lr.status, n: ((lr.json.candidates ?? []) as Json[]).length });

    // ══ Farklı profillerde eşzamanlı aynı kişi ═════════════════════════════════
    section("Farklı HD profillerinde eşzamanlı aynı kişi + aynı girdi");
    const q1 = await journey(UA, newClient({ ad: "Eş", soyad: "Zaman", dogum: "1966-06-06", birth_time: "07:00" }));
    const q2pre = await journey(UA, newClient({ ad: "Eş", soyad: "Zaman", dogum: "1966-06-06", birth_time: "07:00" }));
    const q2 = await journey(UA, newClient({ ad: "Eş", soyad: "Zaman", dogum: "1966-06-06", birth_time: "07:00", acknowledged_duplicate_keys: ((q2pre.json.candidates ?? []) as Json[]).map((c) => c.key) }));
    const Q1 = String(q1.json.hd_client_id);
    const Q2 = String(q2.json.hd_client_id);
    const callsQ = roxy.state.calls;
    const [rq1, rq2] = await Promise.all([compute(UA, { client_id: Q1, location_id: "client" }), compute(UA, { client_id: Q2, location_id: "client" })]);
    const okOne = [rq1, rq2].filter((r) => r.status === 200 && r.json.reused === false);
    const warned = [rq1, rq2].filter((r) => r.status === 409 && (r.json.code === "POSSIBLE_DUPLICATE_CHART" || r.json.code === "IN_PROGRESS"));
    ok(roxy.state.calls === callsQ + 1 && okOne.length === 1 && warned.length === 1, "DUP-17 iki farklı profil eşzamanlı → TEK ücretli çağrı; diğeri uyarı alır (otomatik birleştirme yok)", { calls: roxy.state.calls - callsQ, r: [rq1, rq2].map((r) => [r.status, r.json.code ?? r.json.reused]) });
    const loser = rq1.status === 200 ? Q2 : Q1;
    const retry = await compute(UA, { client_id: loser, location_id: "client" });
    const rc = (retry.json.candidates ?? []) as Json[];
    ok(retry.status === 409 && retry.json.code === "POSSIBLE_DUPLICATE_CHART" && rc.length === 1, "uyarı alan profil tekrar denediğinde diğer profilin YENİ analizi aday olarak gösterilir", retry.json);
    const acked = await compute(UA, { client_id: loser, location_id: "client", acknowledged_duplicate_keys: rc.map((c) => c.key) });
    ok(acked.status === 200 && acked.json.reused === false && roxy.state.calls === callsQ + 2, "bilinçli 'Farklı Kişi' onayı (kilit penceresi içinde bile) hesaplamaya izin verir", acked.json);
    const loserCharts = Number((await su.query(`select count(*)::int n from public.human_design_charts where client_id=$1`, [loser])).rows[0].n);
    ok(loserCharts === 1, "her profilin analizi kendine ait (başka profilin analizi sahiplenilmedi)");
    // Tenant'lar arası kilit karışmaz
    const ta = await journey(UA, newClient({ ad: "Kiracı", soyad: "Ayrı", dogum: "1955-05-05", birth_time: "06:00" }));
    const tb = await journey(UB, newClient({ ad: "Kiracı", soyad: "Ayrı", dogum: "1955-05-05", birth_time: "06:00" }));
    const callsT = roxy.state.calls;
    const [cta, ctb] = await Promise.all([compute(UA, { client_id: String(ta.json.hd_client_id), location_id: "client" }), compute(UB, { client_id: String(tb.json.hd_client_id), location_id: "client" })]);
    ok(cta.status === 200 && ctb.status === 200 && roxy.state.calls === callsT + 2, "farklı tenant'larda aynı kimlik eşzamanlı → kilitler ayrı (iki tenant da hesaplar)", [cta.json, ctb.json]);

    // ══ Tek liste ════════════════════════════════════════════════════════════
    section("Tek analiz listesi (sunucu)");
    // P1'e ikinci analiz (manuel) + profilsiz eski analiz
    await su.query(`insert into public.human_design_charts(tenant_id, client_id, client_name, source, type_code, profile_code, created_at) values ($1,$2,'Hasan Arıcı','manual','projector','2/4', now() + interval '1 second')`, [TA, P1]);
    const orphan = randomUUID();
    await su.query(`insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, type_code, created_at) values ($1,$2,null,'ZZ Profilsiz Eski','manual','generator', now() - interval '400 days')`, [orphan, TA]);
    // Hedef kayıtlar sunucu aramasıyla bulunur (tenant'ta 600+ dolgu analizi var; ilk sayfaya güvenilmez).
    const byName = async (q: string) => ((await list(UA, q, 0, 50)).json.rows ?? []) as Json[];
    const L = await list(UA, "", 0, 50);
    const rows = (L.json.rows ?? []) as Json[];
    const hasanRows = await byName("hasan arıcı");
    const g1 = hasanRows.find((r) => r.hdClientId === P1);
    ok(L.status === 200 && g1?.analysisCount === 2, "UX-03 aynı profilin iki analizi tek satırda (analiz sayısı 2)", g1);
    const noAnalysis = String(c3.json.hd_client_id);
    const noRow = hasanRows.find((r) => r.hdClientId === noAnalysis);
    ok(!!noRow && noRow.analysisCount === 0 && noRow.latestChartId === null && (await byName("zeynep kaya")).some((r) => r.hdClientId === legacyId), "UX-02 (2026-10-16 kararı) analizsiz profiller AYNI tek listede, 'analiz yok' durumuyla", noRow);
    const sameName = hasanRows.filter((r) => r.name === "Hasan Arıcı");
    ok(sameName.length >= 3 && new Set(sameName.map((r) => r.hdClientId)).size === sameName.length, "UX-04 aynı ad-soyadlı farklı profiller AYRI satır (otomatik birleştirme yok)", sameName.map((r) => r.hdClientId));
    ok(g1?.linkedToJourney === true, "UX-06 Danışan Yolculuğu'na bağlı profil → bağlı");
    const legacyRow = (await byName("zz eski manuel")).find((r) => r.hdClientId === LEGACY_CLIENT);
    ok(!!legacyRow && legacyRow.linkedToJourney === false, "UX-07 bağlantısız eski profil bağlı gösterilmez (ve listede kalır)", legacyRow);
    const orphanRow = (await byName("profilsiz eski")).find((r) => r.latestChartId === orphan);
    ok(!!orphanRow && orphanRow.hdClientId === null && orphanRow.linkedToJourney === false, "profilsiz eski analiz kaybolmaz (kendi satırı)", orphanRow);
    ok(rows.every((r, i) => i === 0 || String(rows[i - 1]!.lastAnalysisAt) >= String(r.lastAnalysisAt)), "sıra: son analiz yeni → eski");
    ok(!JSON.stringify(rows).match(/birth_time|birthTime|birthPlace|notes|computed_result|provider_raw/), "liste yanıtında doğum saati/yeri/not/hesap verisi yok");
    const LB = await list(UB);
    const bNames = ((LB.json.rows ?? []) as Json[]).map((r) => String(r.name)).sort();
    ok(LB.status === 200 && JSON.stringify(bNames) === JSON.stringify(["Hasan Arıcı", "Kiracı Ayrı"]), "tenant izolasyonu: B yalnız kendi 2 analizini görür (A'nın 600+ kaydı yok)", bNames);
    const anon = await callRoute(routes.analyses.GET, "GET", {}, undefined, "?q=");
    ok(anon.status === 401 || anon.status === 403, "oturumsuz liste isteği reddedilir", anon.status);
    const qs1 = await list(UA, "ARICI hasan");
    ok(((qs1.json.rows ?? []) as Json[]).length >= 3 && ((qs1.json.rows ?? []) as Json[]).every((r) => String(r.name).includes("Arıcı")), "ad + soyad birlikte, büyük harf, ters sıra aranır", qs1.json.total);
    const qs2 = await list(UA, "arici");
    ok((qs2.json.total as number) === 0, "ı/i ayrımı korunur ('arici' ≠ 'Arıcı')");

    // ══ 1500+ ölçek ══════════════════════════════════════════════════════════
    section("1500+ danışan ölçeği");
    await su.query(`
      with p as (
        insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time, birth_location_id)
        select gen_random_uuid(), $1, 'ZZ Ölçek Kişi ' || lpad(g::text, 4, '0'), date '1960-01-01' + (g % 9000), '12:00', 'trd-42-selcuklu'
        from generate_series(1, 1600) g returning id, name, birth_date
      )
      insert into public.human_design_charts(tenant_id, client_id, client_name, birth_date, birth_time, source, provider, type_code, profile_code, timezone, created_at)
      select $1, p.id, p.name, p.birth_date, '12:00:00', 'computed', 'roxyapi', 'generator', '1/3', 'Europe/Istanbul', now() - (random() * interval '700 days')
      from p, generate_series(1, 2) k`, [TA]);
    const t0 = Date.now();
    const big = await list(UA, "", 0, 20);
    const tList = Date.now() - t0;
    const t1 = Date.now();
    const bigQ = await list(UA, "ölçek kişi 1599");
    const tSearch = Date.now() - t1;
    ok((big.json.total as number) >= 1600 && ((big.json.rows ?? []) as Json[]).length === 20, `UX-05 1600 profil / 3200+ analiz: ilk sayfa 20 satır, toplam ${big.json.total} (${tList} ms)`, big.json.total);
    const found = (bigQ.json.rows ?? []) as Json[];
    ok(found.length === 1 && found[0]!.name === "ZZ Ölçek Kişi 1599" && found[0]!.analysisCount === 2, `UX-05 ilk sayfada olmayan kişi sunucu aramasıyla bulunur (${tSearch} ms)`, found);
    const pages = await Promise.all([0, 20, 40].map((o) => list(UA, "ölçek", o, 20)));
    const ids = pages.flatMap((p) => ((p.json.rows ?? []) as Json[]).map((r) => r.key));
    ok(new Set(ids).size === 60, "sayfalama: ardışık sayfalar çakışmasız (kararlı sıra)");
    const t2 = Date.now();
    const dupBig = await journey(UA, newClient({ ad: "ZZ Ölçek", soyad: "Kişi 1599", dogum: String(found[0]!.birthDate), birth_time: "12:00" }));
    const tDup = Date.now() - t2;
    ok(dupBig.status === 409 && ((dupBig.json.candidates ?? []) as Json[]).some((c) => c.name === "ZZ Ölçek Kişi 1599"), `mükerrer kontrolü 1600 profil içinde tam tarar (ilk 10/50 ile sınırlı değil) (${tDup} ms)`, dupBig.json);
    console.log(`    ⏱ liste ${tList} ms · arama ${tSearch} ms · mükerrer kontrolü ${tDup} ms (yerel gömülü PG)`);
    ok(tList < 5000 && tSearch < 5000 && tDup < 5000, "yanıt süreleri makul (< 5 sn, yerel)");

    // ══ Arayüz sözleşmesi (statik) ═════════════════════════════════════════
    section("Arayüz sözleşmesi");
    const page = src("app/human-design/danisanlar/page.tsx");
    const groups = src("app/human-design/danisanlar/components/HdAnalysisGroupList.tsx");
    ok(/Human Design Analizlerim/.test(page) && /<HdAnalysisGroupList \/>/.test(page) && !/<HdAnalysisHistory|<HdClientListesi/.test(page), "UX-01 ana sayfada tek liste (eski analiz listesi + profil tablosu yok)");
    ok(!/HdJourneyClientPicker \/>\s*\}\s*<\/div>\s*<\/section>\s*\n\s*<HdAnalysisGroupList/.test(page) && /newOpen \?/.test(page), "UX-01 danışan seçimi yalnız 'Yeni Human Design Analizi' açılınca görünür");
    const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    ok(!/wordDownload|HdProfessionalReportButton|kayitli-raporlar|Danışan Raporunu|Word Oluştur|Word'ü İndir/.test(code(groups)) && !/Word|kayitli-raporlar/.test(code(page)), "UX-08 ana listede Word butonu / Word listesi yönlendirmesi yok (yorumlar hariç kod)");
    ok(/redirect\("\/human-design\/danisanlar"\)/.test(src("app/human-design/danisanlar/profiller/page.tsx")) && !/HdClientListesi|HdJourneyClientPicker/.test(code(page)), "eski profiller ekranı tek listeye yönlenir; ayrı profil/seçici listesi yok");
    const hist = src("app/human-design/danisanlar/components/HdAnalysisHistory.tsx");
    const btn = src("app/human-design/kayitli-haritalar/components/HdProfessionalReportButton.tsx");
    ok(/Danışan Raporunu İndir/.test(hist) && /Danışan Raporunu Hazırla/.test(hist) && /Danışan Raporunu İndir/.test(btn) && /Danışan Raporunu Hazırla/.test(btn) && /Yeni Rapor Hazırla/.test(btn), "UX-09 detayda 'Human Design Danışan Raporu' eylemleri");
    ok(/latestWordReportId\(reports, it\.id\)/.test(hist) && /setOpenId\(it\.id\)/.test(hist), "UX-10 hazır rapor / yeni rapor ilgili ANALİZ kimliğine bağlı");

    ok(roxy.state.external.length === 0, "harici ağ isteği yok", roxy.state.external.slice(0, 3));
  } finally {
    roxy.restore();
    await env.stop();
  }
  console.log(`\nHD TEK LİSTE + MÜKERRER: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    for (const f of fails) console.log(" -", f);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
