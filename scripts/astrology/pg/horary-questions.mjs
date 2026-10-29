// GÖKYÜZÜ ATLASI — astro_horary_questions (20271210000000) GERÇEK PostgreSQL doğrulaması. YALNIZ yerel geçici embedded-postgres;
// production / staging / uzak DB YOK. Sentetik kayıtlar; çalışma sonunda geçici veritabanı dizini silinir.
// Kapsam: idempotency (2×), RLS + rol yetkileri, kolon düzeyi UPDATE, değişmezlik tetikleyicisi, CHECK'ler, danışan FK (başka
// tenant reddi + ON DELETE SET NULL (client_id)), save_request_id tekilliği, 3000 tavanı (40 eşzamanlı bağlantı), başka uzman,
// hesap temizleme (admin_purge_archived_expert) tablo keşfi + tenant silme döngüsü sentetik provası.
// Çalıştırma: node scripts/astrology/pg/horary-questions.mjs
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIG = (f) => path.join(REPO, "supabase/migrations", f);
const BASE = [
  path.join(REPO, "scripts/astrology/pg/astrology-fixture.sql"),
  path.join(REPO, "scripts/astrology/pg/astrology-7b-fixture.sql"),
  ...["000000_astrology_foundation", "000100_astrology_kb_analyses", "000200_astrology_timing_relationship", "000300_astrology_owner_isolation", "000400_astrology_client_list", "000500_astrology_profile_delete", "000600_astrology_record_caps"].map((f) => MIG(`20271101${f}.sql`)),
];
const HORARY = MIG("20271210000000_astro_horary_questions.sql");
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`;
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U = "c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7";
const U2 = "c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6";
const CLIENT_A = "11111111-1111-4111-8111-111111111111"; // tenant A
const CLIENT_A2 = "22222222-2222-4222-8222-222222222222"; // tenant A
const CLIENT_B = "33333333-3333-4333-8333-333333333333"; // tenant B
const N = 40;

const watchdog = setTimeout(() => {
  console.error("FAIL horary-questions: 5 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
  process.exit(1);
}, 5 * 60_000);
watchdog.unref();
const opened = new Set();
async function freePort() {
  for (let i = 0; i < 50; i++) {
    const p = 59000 + Math.floor(Math.random() * 3000);
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once("error", () => res(false));
      s.listen(p, "127.0.0.1", () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error("boş port yok");
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "astro-horary-pg-"));
fs.rmSync(dataDir, { recursive: true, force: true });
const port = await freePort();
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", `max_connections=${N + 20}`], onLog: () => {}, onError: () => {} });
const client = () => {
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  c.on("error", () => {});
  opened.add(c);
  return c;
};
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
/** Beklenen hata: SQLSTATE (ve isteğe bağlı mesaj deseni). */
async function expectErr(c, sql, params, code, re) {
  await c.query("SAVEPOINT x");
  try {
    await c.query(sql, params);
    await c.query("RELEASE SAVEPOINT x");
    return { ok: false, got: "hata yok" };
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT x");
    return { ok: e.code === code && (!re || re.test(String(e.message))), got: `${e.code} ${String(e.message).slice(0, 90)}` };
  }
}
const COLS = "(tenant_id, owner_user_id, client_id, title, question_text, question_local_date, question_local_time, timezone, utc_offset_seconds, dst_choice, question_utc, location_id, location_label, latitude, longitude, quesited_house, school, methodology_version, orb_variant, snapshot_schema, result_snapshot, is_demo, save_request_id)";
const INS = `INSERT INTO public.astro_horary_questions ${COLS} VALUES ($1,$2,$3,$4,$5,'2026-10-29','14:30','Europe/Istanbul',10800,'auto','2026-10-29T11:30:00Z','tr-34-istanbul','İstanbul, Türkiye',41.0082,28.9784,$6,$7,'horary-western@1','lilly_ca107_primary',1,$8::jsonb,false,$9) RETURNING id, updated_at`;
const row = (o = {}) => [o.tenant ?? TA, o.owner ?? U, o.client ?? null, o.title ?? "Ortaklık sorusu", o.question ?? null, o.house ?? 7, o.school ?? "lilly_1647", o.snapshot ?? '{"chart":{"cusps":[1,2,3]}}', o.req ?? crypto.randomUUID()];

await server.initialise();
await server.start();
try {
  const admin = client();
  await admin.connect();
  await admin.query(BOOT);
  for (const f of BASE) await admin.query(fs.readFileSync(f, "utf8"));
  const sqlH = fs.readFileSync(HORARY, "utf8");
  await admin.query(sqlH);
  let second = true;
  try {
    await admin.query(sqlH);
  } catch {
    second = false;
  }
  check("H1 migration iki kez çalışır (idempotent)", second);

  // ── Yetkiler ──
  const priv = (await admin.query(`SELECT
      has_table_privilege('anon','public.astro_horary_questions','SELECT') a_s, has_table_privilege('authenticated','public.astro_horary_questions','SELECT') u_s,
      has_table_privilege('authenticated','public.astro_horary_questions','INSERT') u_i, has_table_privilege('service_role','public.astro_horary_questions','SELECT') s_s,
      has_table_privilege('service_role','public.astro_horary_questions','INSERT') s_i, has_table_privilege('service_role','public.astro_horary_questions','DELETE') s_d,
      has_table_privilege('service_role','public.astro_horary_questions','TRUNCATE') s_t,
      has_column_privilege('service_role','public.astro_horary_questions','title','UPDATE') s_u_title, has_column_privilege('service_role','public.astro_horary_questions','client_id','UPDATE') s_u_client,
      has_column_privilege('service_role','public.astro_horary_questions','result_snapshot','UPDATE') s_u_snap, has_column_privilege('service_role','public.astro_horary_questions','question_text','UPDATE') s_u_q,
      has_column_privilege('service_role','public.astro_horary_questions','owner_user_id','UPDATE') s_u_owner, has_column_privilege('service_role','public.astro_horary_questions','tenant_id','UPDATE') s_u_tenant,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.astro_horary_questions'::regclass) rls,
      (SELECT count(*) FROM pg_policies WHERE tablename='astro_horary_questions')::int pol`)).rows[0];
  check("H2 anon / authenticated hiçbir yetki yok", !priv.a_s && !priv.u_s && !priv.u_i, JSON.stringify({ a_s: priv.a_s, u_s: priv.u_s, u_i: priv.u_i }));
  check("H3 service_role: SELECT + INSERT var; DELETE / TRUNCATE YOK", priv.s_s && priv.s_i && !priv.s_d && !priv.s_t);
  check("H4 service_role UPDATE yalnız title + client_id (sonuç, soru metni, sahip, tenant güncellenemez)", priv.s_u_title && priv.s_u_client && !priv.s_u_snap && !priv.s_u_q && !priv.s_u_owner && !priv.s_u_tenant);
  check("H5 RLS etkin, politika yok (doğrudan istemci erişimi kapalı)", priv.rls === true && priv.pol === 0);

  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE anon");
  const anonSel = await expectErr(admin, "SELECT 1 FROM public.astro_horary_questions", [], "42501");
  await admin.query("ROLLBACK");
  check("H6 anon rolüyle okuma → yetki reddi (42501)", anonSel.ok, anonSel.got);

  // ── service_role ile kayıt akışı ──
  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE service_role");
  const r1 = await admin.query(INS, row());
  check("H7 danışansız kayıt", r1.rowCount === 1);
  const r2 = await admin.query(INS, row({ client: CLIENT_A, question: "Ortaklık teklifi gerçekleşir mi?" }));
  check("H8 aynı tenant'ın danışanıyla kayıt + açık izinle soru metni", r2.rowCount === 1);
  const cross = await expectErr(admin, INS, row({ client: CLIENT_B }), "23503");
  check("H9 başka tenant'ın danışanı bağlanamaz (FK 23503)", cross.ok, cross.got);
  const q501 = await expectErr(admin, INS, row({ question: "x".repeat(501) }), "23514", /astro_hq_question_chk/);
  check("H10 soru metni > 500 → CHECK", q501.ok, q501.got);
  const h13 = await expectErr(admin, INS, row({ house: 13 }), "23514", /astro_hq_house_chk/);
  check("H11 sorulan ev 13 → CHECK", h13.ok, h13.got);
  const sch = await expectErr(admin, INS, row({ school: "bonatti" }), "23514", /astro_hq_school_chk/);
  check("H12 tanımsız ekol → CHECK", sch.ok, sch.got);
  const arr = await expectErr(admin, INS, row({ snapshot: "[1,2]" }), "23514", /astro_hq_snapshot_chk/);
  check("H13 anlık görüntü nesne değilse → CHECK", arr.ok, arr.got);
  const big = await expectErr(admin, INS, row({ snapshot: JSON.stringify({ x: "a".repeat(800_000) + crypto.randomUUID() }).replace(/a{5}/g, () => Math.random().toString(36).slice(2, 7)) }), "23514", /astro_hq_snapshot_chk/);
  check("H14 anlık görüntü > 512 KB → CHECK", big.ok, big.got);
  const emptyT = await expectErr(admin, INS, row({ title: "   " }), "23514", /astro_hq_title_chk/);
  check("H15 boş başlık → CHECK", emptyT.ok, emptyT.got);
  const req = crypto.randomUUID();
  await admin.query(INS, row({ req }));
  const dup = await expectErr(admin, INS, row({ req }), "23505", /astro_hq_save_request_uq/);
  check("H16 aynı save_request_id ikinci kez → 23505 (idempotency anahtarı)", dup.ok, dup.got);
  const id2 = r2.rows[0].id;
  const upSnap = await expectErr(admin, "UPDATE public.astro_horary_questions SET result_snapshot = '{}'::jsonb WHERE id = $1", [id2], "42501");
  check("H17 service_role sonuç görüntüsünü değiştiremez (kolon yetkisi 42501)", upSnap.ok, upSnap.got);
  const del = await expectErr(admin, "DELETE FROM public.astro_horary_questions WHERE id = $1", [id2], "42501");
  check("H18 service_role silemez (42501)", del.ok, del.got);
  const before = r2.rows[0].updated_at;
  const upT = await admin.query("UPDATE public.astro_horary_questions SET title = 'Yeni başlık', client_id = $2 WHERE id = $1 RETURNING updated_at, title, client_id", [id2, CLIENT_A2]);
  check("H19 başlık + danışan güncellenebilir, updated_at ilerler", upT.rows[0].title === "Yeni başlık" && upT.rows[0].client_id === CLIENT_A2 && upT.rows[0].updated_at >= before);
  const upCross = await expectErr(admin, "UPDATE public.astro_horary_questions SET client_id = $2 WHERE id = $1", [id2, CLIENT_B], "23503");
  check("H20 güncellemede de başka tenant danışanı → FK", upCross.ok, upCross.got);
  await admin.query("COMMIT");

  // Süper kullanıcı bile sonucu değiştiremez (tetikleyici).
  await admin.query("BEGIN");
  const supSnap = await expectErr(admin, "UPDATE public.astro_horary_questions SET result_snapshot = '{\"x\":1}'::jsonb WHERE id = $1", [id2], "P0001", /ASTRO_HORARY_IMMUTABLE/);
  const supQ = await expectErr(admin, "UPDATE public.astro_horary_questions SET question_text = 'değişti' WHERE id = $1", [id2], "P0001", /ASTRO_HORARY_IMMUTABLE/);
  const supOwner = await expectErr(admin, "UPDATE public.astro_horary_questions SET owner_user_id = $2 WHERE id = $1", [id2, U2], "P0001", /ASTRO_HORARY_IMMUTABLE/);
  await admin.query("COMMIT");
  check("H21 değişmezlik tetikleyicisi: süper kullanıcı da sonuç / soru metni / sahip değiştiremez", supSnap.ok && supQ.ok && supOwner.ok, [supSnap.got, supQ.got, supOwner.got].join(" | "));

  // Danışan silinir → kayıt kalır, client_id NULL.
  await admin.query("DELETE FROM public.clients WHERE id = $1", [CLIENT_A2]);
  const afterDel = (await admin.query("SELECT client_id, title FROM public.astro_horary_questions WHERE id = $1", [id2])).rows[0];
  check("H22 danışan silindi → Horary kaydı korunur, yalnız client_id NULL (ON DELETE SET NULL (client_id))", afterDel && afterDel.client_id === null && afterDel.title === "Yeni başlık");

  // ── Tavan: 3000, 40 eşzamanlı bağlantı ──
  const have = Number((await admin.query("SELECT count(*) n FROM public.astro_horary_questions WHERE tenant_id=$1 AND owner_user_id=$2", [TA, U])).rows[0].n);
  await admin.query(
    `INSERT INTO public.astro_horary_questions ${COLS} SELECT $1,$2,NULL,'T'||g,NULL,'2026-10-29','14:30','Europe/Istanbul',10800,'auto','2026-10-29T11:30:00Z','tr-34-istanbul','İstanbul',41,29,7,'lilly_1647','horary-western@1','lilly_ca107_primary',1,'{}'::jsonb,false,gen_random_uuid() FROM generate_series(1, $3::int) g`,
    [TA, U, 2999 - have],
  );
  const conns = [];
  for (let i = 0; i < N; i++) {
    const c = client();
    await c.connect();
    await c.query("SET ROLE service_role; SET statement_timeout = '30s'; SET lock_timeout = '30s'");
    conns.push(c);
  }
  await Promise.all(conns.map((c) => c.query("BEGIN")));
  const res = await Promise.allSettled(conns.map((c) => c.query(INS, row()).then(() => c.query("COMMIT")).catch(async (e) => {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  })));
  await Promise.all(conns.map((c) => c.end().catch(() => {})));
  conns.forEach((c) => opened.delete(c));
  const okN = res.filter((r) => r.status === "fulfilled").length;
  const capN = res.filter((r) => r.status === "rejected" && /ASTRO_RECORD_CAP:astro_horary_questions:3000/.test(String(r.reason?.message))).length;
  const total = Number((await admin.query("SELECT count(*) n FROM public.astro_horary_questions WHERE tenant_id=$1 AND owner_user_id=$2", [TA, U])).rows[0].n);
  check(`H23 tavan−1'de ${N} eşzamanlı bağlantı → tam 1 başarı, tavan aşılmaz`, okN === 1 && capN === N - 1 && total === 3000, `başarılı ${okN}, tavan reddi ${capN}, son sayı ${total}`);
  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE service_role");
  const o2 = await admin.query(INS, row({ owner: U2 }));
  await admin.query("COMMIT");
  check("H24 başka uzman tavandan etkilenmez", o2.rowCount === 1);

  // ── Hesap temizleme provası (admin_purge_archived_expert ile AYNI keşif kuralı: public, tenant_id uuid) ──
  const disc = await admin.query(`SELECT cl.relname FROM pg_class cl JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
     WHERE ns.nspname = 'public' AND cl.relkind IN ('r','p') AND NOT cl.relispartition AND a.atttypid = 'uuid'::regtype AND cl.relname = 'astro_horary_questions'`);
  check("H25 hesap/tenant temizleme keşfi tabloyu kapsar (tenant_id uuid)", disc.rowCount === 1);
  await admin.query("BEGIN");
  await admin.query(`INSERT INTO public.astro_horary_questions ${COLS} VALUES ($1,$2,NULL,'B tenant','x','2026-10-29','14:30','Europe/Istanbul',10800,'auto','2026-10-29T11:30:00Z','tr-34-istanbul','İstanbul',41,29,7,'lilly_1647','horary-western@1','lilly_ca107_primary',1,'{}'::jsonb,false,gen_random_uuid())`, [TB, U2]);
  const otherBefore = Number((await admin.query("SELECT count(*) n FROM public.astro_horary_questions WHERE tenant_id <> $1", [TA])).rows[0].n);
  // Temizleme fonksiyonunun döngüsüyle aynı ifade (SECURITY DEFINER sahibi = postgres): danışanlar + Horary kayıtları.
  await admin.query("DELETE FROM public.astro_horary_questions WHERE tenant_id = $1", [TA]);
  await admin.query("DELETE FROM public.clients WHERE tenant_id = $1", [TA]);
  const leftA = Number((await admin.query("SELECT count(*) n FROM public.astro_horary_questions WHERE tenant_id = $1", [TA])).rows[0].n);
  const otherAfter = Number((await admin.query("SELECT count(*) n FROM public.astro_horary_questions WHERE tenant_id <> $1", [TA])).rows[0].n);
  await admin.query("ROLLBACK");
  check("H26 tenant silme döngüsü: A tenant'ında yetim Horary kaydı kalmaz, B tenant'ı etkilenmez (sentetik, geri alındı)", leftA === 0 && otherAfter === otherBefore && otherBefore >= 1, `A kalan ${leftA}, B önce ${otherBefore} sonra ${otherAfter}`);
  await admin.end();
} catch (e) {
  fail++;
  console.log(`FAIL horary-questions: beklenmeyen hata — ${String(e?.message ?? e).slice(0, 300)}`);
} finally {
  await Promise.all([...opened].map((c) => Promise.race([c.end().catch(() => {}), new Promise((r) => setTimeout(r, 3000))])));
  await server.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(`\nastrology horary-questions (PostgreSQL) harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
