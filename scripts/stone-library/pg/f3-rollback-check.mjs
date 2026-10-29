#!/usr/bin/env node
/**
 * Doğaltaş Kütüphanesi F3 — postflight + YALNIZ-F3 geri dönüş provası (gömülü PG; PROD'a temas YOK).
 *   A) F1 + F2 + F3 → F3 postflight PASS.
 *   B) Onaysız / F3'e özgü veri varken (yayına hazır taş, owner sağlık kararı, owner_decision modu) F3 ROLLBACK durur.
 *   C) Yayında bir taş varken F3 TEK ADIMDA kaldırılır (özgün F1 / F2 gövdeleri aynı işlemde geri kurulur) → doğrudan F2 postflight
 *      PASS; mevcut uygulama tabloları birebir; yayındaki taş yayında kalır; F1 + F2 yeniden uygulaması da zararsız; F3 yeniden
 *      uygulanabilir → F3 postflight PASS.
 * Çalıştır: node scripts/stone-library/pg/f3-rollback-check.mjs
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const FIXTURE = read("scripts/stone-library/pg/fixture.sql");
const F1 = read("supabase/migrations/20271201000000_stone_library_core.sql");
const F2 = read("supabase/migrations/20271201000100_stone_library_f2.sql");
const F3 = read("supabase/migrations/20271201000200_stone_library_f3.sql");
const F2_POST = read("scripts/stone-library/sql/f2_postflight_readonly.sql");
const F3_POST = read("scripts/stone-library/sql/f3_postflight_readonly.sql");
const F3_RB = read("scripts/stone-library/sql/ROLLBACK_20271201000200.sql");
const OWNER = "00000000-0000-4000-8000-0000000000f1";
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);`;

let pass = 0;
let fail = 0;
const ok = (c, l, x) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x)}` : ""}`); } };
const last = (r) => (Array.isArray(r) ? r[r.length - 1].rows : r.rows);
const errMsg = async (c, sql) => { try { await c.query(sql); return null; } catch (e) { await c.query("ROLLBACK").catch(() => {}); return String(e.message); } };

async function withDb(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-f3rb-"));
  const port = 58560 + Math.floor(Math.random() * 600);
  const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
  await server.initialise();
  await server.start();
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  await c.connect();
  try {
    await c.query(BOOT); await c.query(FIXTURE); await c.query(F1); await c.query(F2); await c.query(F3);
    await c.query(`INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ('20271201000000','core'),('20271201000100','f2'),('20271201000200','f3') ON CONFLICT DO NOTHING`);
    await fn(c);
  } finally {
    await c.end().catch(() => {}); await server.stop().catch(() => {});
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
  }
}
const legacy = async (c) => (await c.query(`SELECT md5(coalesce((SELECT string_agg(to_jsonb(s)::text, ',' ORDER BY s.id) FROM public.stones s),'') ||
  coalesce((SELECT string_agg(to_jsonb(s)::text, ',' ORDER BY s.id) FROM public.client_stones s),'') || coalesce((SELECT string_agg(to_jsonb(s)::text, ',' ORDER BY s.id) FROM public.users s),'')) h`)).rows[0].h;

/** Owner kaynağında (sağlayıcı DEĞİL) yayınlanmış tek bir taş kurar. */
async function publishedOwnerStone(c) {
  const src = (await c.query(`SELECT public.stone_library_source_save($1, NULL, '{"source_key":"zz-owner","kind":"owner","real_name":"ZZ Owner"}') id`, [OWNER])).rows[0].id;
  await c.query(`SELECT public.stone_library_source_save($1, $2, '{"license_type":"owner_content","license_ref":"owner","status":"active"}')`, [OWNER, src]);
  const st = (await c.query(`SELECT public.stone_library_stone_save($1, NULL, '{"slug":"zz-rb-tas","name_tr":"ZZ RB Taş"}') id`, [OWNER])).rows[0].id;
  await c.query(`SELECT public.stone_library_record_add($1, $2)`, [OWNER, JSON.stringify({ stone_id: st, source_id: src, field_key: "description", lang: "tr", content: "ZZ owner metni.", origin: "owner_authored" })]);
  await c.query(`SELECT public.stone_library_stone_set_status($1, $2, 'ready')`, [OWNER, st]);
  await c.query(`SELECT public.stone_library_stone_set_status($1, $2, 'published')`, [OWNER, st]);
  return st;
}

try {
  console.log("\n[A: F3 postflight]");
  await withDb(async (c) => { ok(last(await c.query(F3_POST))[0]?.sonuc === "F3 POSTFLIGHT PASS", "F1 + F2 + F3 → F3 POSTFLIGHT PASS"); });

  console.log("\n[B: koruma — F3'e özgü veri varken durur]");
  await withDb(async (c) => {
    ok(/onay ayarı yok/.test((await errMsg(c, F3_RB)) ?? ""), "onaysız F3 ROLLBACK durdu");
    const st = (await c.query(`SELECT public.stone_library_stone_save($1, NULL, '{"slug":"zz-hazir","name_tr":"ZZ Hazır"}') id`, [OWNER])).rows[0].id;
    await c.query(`UPDATE public.stone_library_stones SET status='review' WHERE id=$1`, [st]);
    await c.query(`SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F3'`);
    ok(/incelemede/.test((await errMsg(c, F3_RB)) ?? ""), "'incelemede' taş varken F3 ROLLBACK durdu");
    await c.query(`SET stone_library.rollback_confirm = ''`);
    await c.query(`UPDATE public.stone_library_stones SET status='draft' WHERE id=$1`, [st]);
    await c.query(`SELECT public.stone_library_health_decision($1, $2, 'allow', 'ZZ karar')`, [OWNER, st]);
    await c.query(`SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F3'`);
    ok(/sağlık yayın kararı/.test((await errMsg(c, F3_RB)) ?? ""), "owner sağlık kararı kayıtlıyken F3 ROLLBACK durdu");
    await c.query(`SET stone_library.rollback_confirm = ''`);
    await c.query(`SELECT public.stone_library_health_decision($1, $2, 'revoke', NULL)`, [OWNER, st]);
    await c.query(`SELECT public.stone_library_settings_save($1, '{"health_publication_mode":"owner_decision"}')`, [OWNER]);
    await c.query(`SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F3'`);
    ok(/owner_decision/.test((await errMsg(c, F3_RB)) ?? ""), "owner_decision modundayken F3 ROLLBACK durdu");
    await c.query(`SET stone_library.rollback_confirm = ''`);
    await c.query(`SELECT public.stone_library_settings_save($1, '{"health_publication_mode":"legal_review","medical_notice_tr":"ZZ owner tarafından değiştirilmiş tıbbi bilgilendirme metni."}')`, [OWNER]);
    await c.query(`SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F3'`);
    ok(/tıbbi bilgilendirme/.test((await errMsg(c, F3_RB)) ?? ""), "owner tıbbi bilgilendirme metnini değiştirmişse F3 ROLLBACK durdu (metin kaybı yok)");
    ok((await c.query(`SELECT to_regprocedure('public.stone_library_readiness(uuid)') IS NOT NULL v`)).rows[0].v, "duran geri dönüş hiçbir şey kaldırmadı");
  });

  console.log("\n[C: yalnız F3 geri dönüşü — TEK ADIM (yayında taş varken)]");
  await withDb(async (c) => {
    const before = await legacy(c);
    const st = await publishedOwnerStone(c);
    ok((await c.query(`SELECT count(*)::int n FROM public.stone_library_published WHERE stone_id=$1 AND doc ? 'medical_notice'`, [st])).rows[0].n === 1, "F3 yayın belgesi (tıbbi bilgilendirme alanıyla) üretildi");
    await c.query(`SET stone_library.rollback_confirm = 'DROP_STONE_LIBRARY_F3'`);
    ok((await errMsg(c, F3_RB)) === null, "F3 ROLLBACK çalıştı");
    ok((await c.query(`SELECT count(*)::int n FROM pg_proc WHERE proname IN ('stone_library_readiness','stone_library_owner_integrity','stone_library_expert_facets','stone_library_health_ok','stone_library_integrity','stone_library_source_kind_guard','stone_library_external_link_guard')`)).rows[0].n === 0, "F3 fonksiyonları kaldırıldı");
    ok((await c.query(`SELECT count(*)::int n FROM pg_trigger WHERE tgname IN ('trg_stone_library_records_source_integrity','trg_stone_library_stones_source_name','trg_stone_library_images_binding','trg_stone_library_records_field_path')`)).rows[0].n === 0, "F3 tetikleyicileri kaldırıldı");
    ok((await c.query(`SELECT count(*)::int n FROM information_schema.columns WHERE column_name IN ('health_publish_decided_at','medical_notice_tr','health_publication_mode') AND table_name LIKE 'stone_library_%'`)).rows[0].n === 0, "F3 kolonları kaldırıldı");
    ok((await c.query(`SELECT count(*)::int n FROM pg_trigger WHERE tgname IN ('trg_stone_library_records_verbatim','trg_stone_library_facets_verbatim')`)).rows[0].n === 2, "F2 birebir kuralı yerinde (F3 geri dönüşü F2'ye dokunmadı)");
    ok(last(await c.query(F2_POST))[0]?.sonuc === "F2 POSTFLIGHT PASS", "TEK ADIM: geri dönüşün hemen ardından F2 POSTFLIGHT PASS (19 tablo, 44 RPC; ek adım yok)");
    ok((await c.query(`SELECT count(*)::int n FROM public.stone_library_published WHERE stone_id=$1 AND NOT (doc ? 'medical_notice')`, [st])).rows[0].n === 1, "yayındaki taş yayında kaldı; belge F2 biçimine döndü");
    ok((await errMsg(c, `SELECT public.stone_library_stone_set_status('${OWNER}', '${st}', 'hidden')`)) === null
       && (await errMsg(c, `SELECT public.stone_library_stone_set_status('${OWNER}', '${st}', 'published')`)) === null, "özgün F1 durum fonksiyonu çalışıyor (yazma yolları hata vermiyor)");
    ok((await errMsg(c, F1)) === null && (await errMsg(c, F2)) === null && last(await c.query(F2_POST))[0]?.sonuc === "F2 POSTFLIGHT PASS", "F1 + F2'nin ayrıca yeniden uygulanması da zararsız");
    ok((await errMsg(c, `UPDATE public.stone_library_stones SET status='ready' WHERE id='${st}'`)) !== null, "F2 durum kısıtı geri geldi ('ready' artık geçersiz)");
    ok((await legacy(c)) === before, "mevcut uygulama tabloları birebir");
    ok((await c.query(`SELECT count(*)::int n FROM supabase_migrations.schema_migrations WHERE version='20271201000200'`)).rows[0].n === 0, "F3 defter kaydı silindi");
    ok((await errMsg(c, F3)) === null && last(await c.query(F3_POST))[0]?.sonuc === "F3 POSTFLIGHT PASS", "F3 yeniden uygulanabilir → F3 POSTFLIGHT PASS");
    ok((await c.query(`SELECT count(*)::int n FROM public.stone_library_published WHERE stone_id=$1 AND doc ? 'medical_notice'`, [st])).rows[0].n === 1, "F3 yeniden uygulanınca yayın belgesi yeni biçimle yenilendi");
  });
} catch (e) { fail++; console.error("çöktü:", e); }
console.log(`\nstone-library F3 rollback-check: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
