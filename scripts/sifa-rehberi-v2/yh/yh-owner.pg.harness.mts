/**
 * Şifa V2 — YH UZMAN SAHİPLİĞİ SQL harness'ı (yerel GEÇİCİ PostgreSQL; ağ / sır / production YOK).
 * Kurulum: GERÇEK YH çekirdek migration'ları (index, lexical, arama v1, outbox, reconcile, aktivasyon) +
 * Şifa V2 çekirdeği + supabase/migrations/20280110000100_yh_owner_scope_sifa_v2.sql (İKİ KEZ: idempotentlik).
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/yh/yh-owner.pg.harness.mts
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { addOwnerFilter, extractFn, OWNER_LINE, V1_FILE, V2_FILE } from "./gen-migration.mjs";

const ROOT = process.cwd();
const M = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");
export const YH_CORE = [
  "20260710000000_yasam_hafizasi_index.sql",
  "20260712000000_yasam_hafizasi_lexical_infra.sql",
  "20260724000000_yh_search_candidates_rpc.sql",
  "20260815000000_yasam_hafizasi_outbox.sql",
  "20260901000000_yasam_hafizasi_reconcile_enqueue.sql",
  "20260927000000_yh_source_activation_control.sql",
];
const OWNER_SQL = readFileSync(path.join(ROOT, "supabase/migrations/20280110000100_yh_owner_scope_sifa_v2.sql"), "utf8");
const V2_CORE = readFileSync(path.join(ROOT, "supabase/migrations/20280110000000_sifa_rehberi_v2_core.sql"), "utf8");

let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${!c && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

const port = await new Promise<number>((res) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => {
    const p = (s.address() as net.AddressInfo).port;
    s.close(() => res(p));
  });
});
const dir = path.join(os.tmpdir(), `yh-owner-${process.pid}`);
const epg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "x", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
await epg.initialise();
await epg.start();
const c = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password: "x", database: "postgres" });
await c.connect();
const q = (s: string, p?: unknown[]) => c.query(s, p);
const asRole = async <T,>(role: string, fn: () => Promise<T>): Promise<T | "denied"> => {
  await q("BEGIN");
  await q(`SET LOCAL ROLE ${role}`);
  try {
    const r = await fn();
    await q("COMMIT");
    return r;
  } catch (e) {
    await q("ROLLBACK");
    if (/permission denied/.test((e as Error).message)) return "denied";
    throw e;
  }
};

try {
  console.log("0) Kurulum (gerçek YH çekirdek migration'ları + V2 çekirdeği + sahiplik migration'ı ×2)");
  await q(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
           create schema extensions; create extension unaccent with schema extensions; create extension pgcrypto;
           grant usage on schema public to anon, authenticated, service_role;
           -- Supabase public şeması VARSAYILAN yetkileri (test projesinde pg_default_acl ile doğrulandı):
           alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
           alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
           alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
           create table public.tenants (id uuid primary key, name text);
           create table public.users (id uuid primary key, tenant_id uuid, role text, active boolean default true, full_name text);
           create table public.stone_exclusions (tenant_id text, stone_id uuid);
           grant select on public.users, public.stone_exclusions to service_role;`);
  for (const f of YH_CORE) await q(M(f));
  await q(V2_CORE);
  // Mevcut modüllerin genel yh_cdc_enqueue() bağlantısının temsilcisi (production'da 22 tetikleyici):
  // V2 migration'ı bu fonksiyona ve bağlantılarına DOKUNMAMALI.
  await q(`create table public.zz_mevcut_modul (id uuid primary key, tenant_id uuid not null);
           create trigger zz_mevcut_modul_cdc after insert or update or delete on public.zz_mevcut_modul
             for each row execute function public.yh_cdc_enqueue('zz:mevcut', 'zz_mevcut_modul');`);
  const genericState = async () =>
    (await q(`select md5(p.prosrc) md5, p.prosecdef, p.proconfig::text cfg,
                     (select string_agg(t.tgrelid::regclass::text || '.' || t.tgname || ':' || t.tgenabled::text || ':' || encode(t.tgargs, 'hex'), ',' order by 1)
                        from pg_trigger t where not t.tgisinternal and t.tgfoid = p.oid) trig
                from pg_proc p where p.oid = 'public.yh_cdc_enqueue()'::regprocedure`)).rows[0];
  const genericBefore = await genericState();
  let migErr = "";
  try {
    await q(OWNER_SQL);
    await q(OWNER_SQL);
  } catch (e) {
    migErr = (e as Error).message;
  }
  ok(migErr === "", "sahiplik migration'ı uygulandı ve İKİNCİ kez hatasız (idempotent)", migErr);

  console.log("1) Migration birebirliği (v1/v2 = özgün + yalnız sahiplik satırı)");
  for (const [file, fn] of [[V1_FILE, "yh_search_candidates"], [V2_FILE, "yh_search_candidates_v2"]] as const) {
    const orig = extractFn(M(file).replace(/\r\n/g, "\n"), fn);
    const gen = extractFn(OWNER_SQL, fn);
    ok(gen === addOwnerFilter(orig) && gen.replace(`${OWNER_LINE}\n`, "") === orig, `${fn}: özgünden TEK fark sahiplik satırı`);
  }
  ok(!/^\s*(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)/im.test(OWNER_SQL.replace(/^\s*--.*$/gm, "")), "migration: DROP TABLE / TRUNCATE / DELETE yok (yorum dışı)");

  console.log("2) Şema");
  const col = (await q(`select data_type, is_nullable from information_schema.columns where table_name='yasam_hafizasi_index' and column_name='owner_user_id'`)).rows[0];
  ok(col?.data_type === "uuid" && col?.is_nullable === "YES", "owner_user_id uuid NULL eklendi");
  let chk = "";
  try {
    await q(`insert into public.yasam_hafizasi_index (tenant_id, source_module, source_table, source_id, owner_user_id) values (null,'sifa_rehberi','sifa_topic_blocks',gen_random_uuid(),gen_random_uuid())`);
  } catch (e) {
    chk = (e as { code?: string }).code ?? "";
  }
  ok(chk === "23514", "CHECK: sahipli satır tenant'sız (shared) olamaz", chk);

  console.log("3) Arama matrisi (gerçek v1/v2/v3, SET ROLE service_role)");
  const TA = randomUUID(), TB = randomUUID(), U1 = randomUUID(), U2 = randomUUID(), U3 = randomUUID(), UX = randomUUID();
  await q("insert into public.tenants values ($1,'A'),($2,'B')", [TA, TB]);
  await q("insert into public.users (id, tenant_id, role, active) values ($1,$3,'expert',true),($2,$3,'expert',true),($4,$5,'expert',true),($6,$3,'expert',false)", [U1, U2, TA, U3, TB, UX]);
  const ins = async (tenant: string | null, owner: string | null, title: string, table = "sifa_topic_blocks", module = "sifa_rehberi") =>
    q(`insert into public.yasam_hafizasi_index (tenant_id, source_module, source_table, source_id, title, search_text, owner_user_id)
       values ($1,$2,$3,gen_random_uuid(),$4,$4,$5)`, [tenant, module, table, title, owner]);
  await ins(TA, null, "zzkelime V1 kurum A", "healing_guides");
  await ins(TA, U1, "zzkelime U1 kisisel");
  await ins(TA, U2, "zzkelime U2 kisisel");
  await ins(TB, null, "zzkelime V1 kurum B", "healing_guides");
  await ins(TB, U3, "zzkelime U3 kisisel");
  await ins(TA, UX, "zzkelime pasif kullanici");
  const W = "{1,0.6,0.35,0.15}";
  const v1 = (t: string) => q(`select title from public.yh_search_candidates('zzkelime', $1::uuid, false, $2::float4[], 50)`, [t, W]);
  const v2 = (t: string) => q(`select title from public.yh_search_candidates_v2('zzkelime', $1::uuid, $2::float4[], 50, null)`, [t, W]);
  const v3 = (t: string, u: string | null) => q(`select title, owner_user_id from public.yh_search_candidates_v3('zzkelime', $1::uuid, $2::uuid, $3::float4[], 50, null)`, [t, u, W]);
  const titles = (r: unknown) => (r === "denied" ? ["DENIED"] : (r as pg.QueryResult).rows.map((x) => x.title).sort());
  const s = async <T,>(fn: () => Promise<T>) => asRole("service_role", fn);
  ok(JSON.stringify(titles(await s(() => v3(TA, U1)))) === JSON.stringify(["zzkelime U1 kisisel", "zzkelime V1 kurum A"]), "A/U1 (v3): kendi kişisel + A kurum; U2 YOK", titles(await s(() => v3(TA, U1))));
  ok(JSON.stringify(titles(await s(() => v3(TA, U2)))) === JSON.stringify(["zzkelime U2 kisisel", "zzkelime V1 kurum A"]), "A/U2 (v3): kendi kişisel + A kurum; U1 YOK");
  ok(JSON.stringify(titles(await s(() => v3(TB, U3)))) === JSON.stringify(["zzkelime U3 kisisel", "zzkelime V1 kurum B"]), "B/U3 (v3): yalnız B; A'nın hiçbir kaydı YOK");
  ok(JSON.stringify(titles(await s(() => v3(TB, U1)))) === JSON.stringify(["zzkelime V1 kurum B"]), "sahtecilik: B tenant'ı + A kullanıcısı → U1 kişisel YOK (üyelik doğrulaması)");
  ok(JSON.stringify(titles(await s(() => v3(TA, U3)))) === JSON.stringify(["zzkelime V1 kurum A"]), "sahtecilik: A tenant'ı + B kullanıcısı → yalnız A kurum");
  ok(JSON.stringify(titles(await s(() => v3(TA, null)))) === JSON.stringify(["zzkelime V1 kurum A"]), "kullanıcısız v3 → yalnız tenant geneli");
  ok(JSON.stringify(titles(await s(() => v3(TA, UX)))) === JSON.stringify(["zzkelime V1 kurum A"]), "pasif kullanıcı kendi kişisel satırını da göremez (aktif üyelik şartı)");
  ok(JSON.stringify(titles(await s(() => v2(TA)))) === JSON.stringify(["zzkelime V1 kurum A"]), "v2: sahipli satır HİÇ dönmez (eski çağıran fail-closed)");
  ok(JSON.stringify(titles(await s(() => v1(TA)))) === JSON.stringify(["zzkelime V1 kurum A"]), "v1: sahipli satır HİÇ dönmez");
  for (const role of ["anon", "authenticated"]) {
    ok(titles(await asRole(role, () => v3(TA, U1)))[0] === "DENIED" && titles(await asRole(role, () => v2(TA)))[0] === "DENIED", `${role}: v3/v2 EXECUTE yok`);
  }
  ok(titles(await asRole("authenticated", () => q("select * from public.yasam_hafizasi_index")))[0] === "DENIED", "authenticated: indeks tablosu okunamaz");

  console.log("4) CDC tetikleyicileri (aktivasyon kapılı; yalnız KİŞİSEL)");
  const ob = async () => (await q("select source_id, operation, tenant_id from public.yasam_hafizasi_outbox where source_key = 'sifa_rehberi_v2:notes'")).rows;
  const apply = (t: string, u: string, ch: object) => q("select public.sifa_v2_apply_changeset($1::uuid,$2::uuid,$3::jsonb)", [t, u, JSON.stringify(ch)]);
  const doc = (x: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: x }] }] });
  const P = randomUUID(), C1 = randomUUID(), B1 = randomUUID(), B2 = randomUUID();
  const topic = (id: string, parent: string | null, title: string) => ({ id, parent_id: parent, title, sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null });
  const blk = (id: string, t: string, x: string) => ({ id, topic_id: t, title: "Not", content_json: doc(x), content_text: x, classification: null, sort_key: "a1", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] });
  await apply(TA, U1, { topics: [topic(P, null, "Kök")], blocks: [blk(B1, P, "ilk")] });
  ok((await ob()).length === 0, "aktivasyon KAPALI: kişisel kayıt olay ÜRETMEZ (kullanıcı işlemi bozulmaz)");
  await q("insert into public.yh_source_activation (source_key, is_active) values ('sifa_rehberi_v2:notes', true) on conflict (source_key) do update set is_active = true");
  await apply(TA, U1, { topics: [topic(C1, P, "Alt")], blocks: [blk(B2, C1, "ikinci")] });
  let rows = await ob();
  ok(rows.length === 1 && rows[0].source_id === B2 && rows[0].operation === "upsert" && rows[0].tenant_id === TA, "aktif: yeni kişisel kutu → 1 upsert olayı (tenant doğru)", rows);
  const v = Number((await q("select version from public.sifa_topic_blocks where id=$1", [B2])).rows[0].version);
  await apply(TA, U1, { blocks: [{ ...blk(B2, C1, "ikinci v2"), base_version: v }] });
  await apply(TA, U1, { blocks: [{ ...blk(B2, C1, "ikinci v3"), base_version: v + 1 }] });
  ok((await ob()).filter((r) => r.source_id === B2).length === 1, "aynı kutunun art arda güncellemeleri TEK olaya birleşir (mükerrer yok)");
  const K = randomUUID();
  await q("select public.sifa_v2_import_legacy($1::uuid, $2::jsonb, '[]'::jsonb)", [TA, JSON.stringify({ topics: [topic(K, null, "Kurum")], blocks: [blk(randomUUID(), K, "kurum notu")], assets: [] })]);
  ok((await ob()).length === 1, "KURUM ortak kaydı (V1 türevi) kuyruğa GİRMEZ");
  await q("delete from public.yasam_hafizasi_outbox where source_key = 'sifa_rehberi_v2:notes'"); // yalnız yerel geçici DB
  const tv = Number((await q("select version from public.sifa_topics where id=$1", [P])).rows[0].version);
  await apply(TA, U1, { topics: [{ ...topic(P, null, "Kök"), deleted_at: new Date().toISOString(), delete_batch_id: randomUUID(), base_version: tv }] });
  rows = await ob();
  ok(rows.length === 2 && new Set(rows.map((r) => r.source_id)).has(B1) && new Set(rows.map((r) => r.source_id)).has(B2), "kök konu çöpe → alt ağaçtaki TÜM kişisel kutular kuyruğa (B1 + alt konudaki B2)", rows);
  await q("delete from public.yasam_hafizasi_outbox where source_key = 'sifa_rehberi_v2:notes'");
  await q("delete from public.sifa_topic_blocks where id = $1", [B1]);
  rows = await ob();
  ok(rows.length === 1 && rows[0].source_id === B1 && rows[0].operation === "delete", "kalıcı silme → delete olayı (deindex)", rows);
  await q("delete from public.yasam_hafizasi_outbox where source_key = 'sifa_rehberi_v2:notes'");
  const n1 = (await q("select public.yh_sifa_v2_replay_enqueue($1) n", [TA])).rows[0].n;
  const n2 = (await q("select public.yh_sifa_v2_replay_enqueue($1) n", [TA])).rows[0].n;
  ok(n1 === 1 && n2 === 1 && (await ob()).length === 1, "tarihsel kuyruğa alma: yalnız kişisel kutular, tekrar çalıştırma çoğaltmaz", { n1, n2 });
  ok((await asRole("authenticated", () => q("select public.yh_sifa_v2_replay_enqueue($1)", [TA]))) === "denied", "replay fonksiyonu tarayıcı rollerine kapalı");
  await q("update public.yh_source_activation set is_active = false where source_key = 'sifa_rehberi_v2:notes'");
  ok((await q("select public.yh_sifa_v2_replay_enqueue($1) n", [TA])).rows[0].n === 0, "aktivasyon kapalıyken replay 0 (no-op)");

  console.log("5) İzole CDC: yh_cdc_enqueue_sifa_v2() (genel yh_cdc_enqueue'ya dokunulmaz)");
  const genericAfter = await genericState();
  ok(JSON.stringify(genericAfter) === JSON.stringify(genericBefore), "genel yh_cdc_enqueue(): gövde md5 + ayar + bağlı tetikleyiciler (argümanlarıyla) migration ÖNCESİ = SONRASI", { genericBefore, genericAfter });
  const bind = (await q(`select t.tgname, t.tgfoid::regproc::text fn from pg_trigger t where t.tgrelid = 'public.sifa_topic_blocks'::regclass and not t.tgisinternal order by 1`)).rows;
  ok(bind.length === 2 && bind.every((r) => r.fn === "yh_cdc_enqueue_sifa_v2"), "V2 kutu tetikleyicilerinin İKİSİ de yeni fonksiyona bağlı; genel fonksiyona bağlı V2 tetikleyicisi YOK", bind);
  const priv = (await q(`select has_function_privilege('anon','public.yh_cdc_enqueue_sifa_v2()','EXECUTE') a, has_function_privilege('authenticated','public.yh_cdc_enqueue_sifa_v2()','EXECUTE') b,
                                p.prosecdef, p.proconfig::text cfg from pg_proc p where p.oid = 'public.yh_cdc_enqueue_sifa_v2()'::regprocedure`)).rows[0];
  ok(!priv.a && !priv.b && priv.prosecdef && priv.cfg === "{\"search_path=public, pg_catalog\"}", "yeni fonksiyon: anon/authenticated EXECUTE yok, SECURITY DEFINER + sabit search_path", priv);
  await q("insert into public.yh_source_activation (source_key, is_active) values ('sifa_rehberi_v2:notes', true) on conflict (source_key) do update set is_active = true");
  await q("delete from public.yasam_hafizasi_outbox where source_key = 'sifa_rehberi_v2:notes'"); // yalnız yerel geçici DB
  const obRow = async (id: string) => (await q("select tenant_id, operation, status, attempts, locked_by, event_version::text ev from public.yasam_hafizasi_outbox where source_key = 'sifa_rehberi_v2:notes' and source_id = $1", [id])).rows;
  // Tenant izolasyonu: olayın tenant'ı yalnız satırdan gelir
  const PA = randomUUID(), BA = randomUUID(), PB = randomUUID(), BB = randomUUID();
  await apply(TA, U1, { topics: [topic(PA, null, "A izole")], blocks: [blk(BA, PA, "A notu")] });
  await apply(TB, U3, { topics: [topic(PB, null, "B izole")], blocks: [blk(BB, PB, "B notu")] });
  const ra = await obRow(BA), rb = await obRow(BB);
  ok(ra.length === 1 && ra[0].tenant_id === TA && rb.length === 1 && rb[0].tenant_id === TB, "tenant izolasyonu: A kutusu → A olayı, B kutusu → B olayı (çapraz yok)", { ra, rb });
  // Birleştirme + event_version artışı
  const ev1 = BigInt(ra[0].ev);
  const vA = Number((await q("select version from public.sifa_topic_blocks where id=$1", [BA])).rows[0].version);
  await apply(TA, U1, { blocks: [{ ...blk(BA, PA, "A notu 2"), base_version: vA }] });
  const ra2 = await obRow(BA);
  ok(ra2.length === 1 && BigInt(ra2[0].ev) > ev1 && ra2[0].status === "pending", "birleştirme: güncelleme yeni satır açmaz, event_version artar, pending", ra2);
  // processing korunur
  await q("update public.yasam_hafizasi_outbox set status='processing', attempts=1, locked_by='zz-worker', locked_at=now() where source_key='sifa_rehberi_v2:notes' and source_id=$1", [BA]);
  await apply(TA, U1, { blocks: [{ ...blk(BA, PA, "A notu 3"), base_version: vA + 1 }] });
  const ra3 = await obRow(BA);
  ok(ra3[0].status === "processing" && ra3[0].attempts === 1 && ra3[0].locked_by === "zz-worker" && BigInt(ra3[0].ev) > BigInt(ra2[0].ev), "processing: işlemdeki olayın kilidi/denemesi KORUNUR, yalnız event_version artar", ra3);
  // Aktivasyon kapalı: yeni olay yok, kullanıcı işlemi başarılı
  await q("update public.yh_source_activation set is_active = false where source_key = 'sifa_rehberi_v2:notes'");
  const BC = randomUUID();
  const offRes = await apply(TA, U1, { blocks: [blk(BC, PA, "kapalıyken")] });
  ok((await obRow(BC)).length === 0 && (await q("select 1 from public.sifa_topic_blocks where id=$1", [BC])).rowCount === 1, "aktivasyon kapalı: kayıt YAZILDI, olay ÜRETİLMEDİ", offRes.rows[0]);
  await q("update public.yh_source_activation set is_active = true where source_key = 'sifa_rehberi_v2:notes'");
  // Delete tombstone (OLD tenant)
  await q("delete from public.sifa_topic_blocks where id = $1", [BB]);
  const rbd = await obRow(BB);
  ok(rbd.length === 1 && rbd[0].operation === "delete" && rbd[0].tenant_id === TB, "kalıcı silme: delete olayı, tenant OLD satırdan (B)", rbd);
  // Hata geri alma: outbox yazımı başarısız → V2 kaydının TAMAMI geri alınır
  await q("alter table public.yasam_hafizasi_outbox add constraint zz_test_red check (source_key <> 'sifa_rehberi_v2:notes') not valid");
  const BE = randomUUID(), PE = randomUUID();
  let rbErr = "";
  try {
    await apply(TA, U1, { topics: [topic(PE, null, "hata")], blocks: [blk(BE, PE, "geri alinmali")] });
  } catch (e) {
    rbErr = (e as { code?: string }).code ?? "hata";
  }
  await q("alter table public.yasam_hafizasi_outbox drop constraint zz_test_red");
  const leftover = (await q("select (select count(*)::int from public.sifa_topic_blocks where id=$1) b, (select count(*)::int from public.sifa_topics where id=$2) t", [BE, PE])).rows[0];
  ok(rbErr === "23514" && leftover.b === 0 && leftover.t === 0, "hata geri alma: CDC hatası → kutu + konu YAZILMADI (atomik)", { rbErr, leftover });
  // Yanlış tabloya bağlanırsa fail-closed
  await q("create table public.zz_yanlis (id uuid primary key, tenant_id uuid, scope text)");
  await q("create trigger zz_yanlis_trg after insert on public.zz_yanlis for each row execute function public.yh_cdc_enqueue_sifa_v2()");
  let wrongErr = "";
  try {
    await q("insert into public.zz_yanlis values (gen_random_uuid(), $1, 'kisisel')", [TA]);
  } catch (e) {
    wrongErr = (e as Error).message;
  }
  ok(/yalniz public\.sifa_topic_blocks/.test(wrongErr) && (await q("select count(*)::int n from public.zz_yanlis")).rows[0].n === 0, "yanlış tabloya bağlanırsa RAISE + satır geri alınır (fail-closed)", wrongErr);
  // Mevcut modül (genel fonksiyon) hâlâ kendi davranışıyla çalışır
  await q("insert into public.yh_source_activation (source_key, is_active) values ('zz:mevcut', true) on conflict (source_key) do update set is_active = true");
  const ZM = randomUUID();
  await q("insert into public.zz_mevcut_modul values ($1, $2)", [ZM, TA]);
  ok((await q("select count(*)::int n from public.yasam_hafizasi_outbox where source_key='zz:mevcut' and source_id=$1", [ZM])).rows[0].n === 1, "mevcut modül tetikleyicisi genel yh_cdc_enqueue ile AYNEN olay üretiyor (regresyon yok)");
} catch (e) {
  fail++;
  console.log(`  ✗ ${String((e as Error).stack ?? e).slice(0, 600)}`);
} finally {
  await c.end().catch(() => {});
  await epg.stop().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
