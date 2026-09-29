// USAGE360 NİHAİ KAPANIŞ — IP HARDENING: security_ip_retention_purge GERÇEK PostgreSQL testi.
// Ephemeral embedded-postgres (production'a SIFIR temas), sentetik veri, gerçek tablo migration'ı.
// Kapsam: dry-run yalnız sayar (yazmaz) · yalnız >90 gün eski IP NULL · 90 günden yeni IP'ler
// ve satırların diğer alanları korunur · idempotent · grant (yalnız service_role) · süre sabit.
// Çalıştır: node scripts/usage360/ip-retention-pg.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

process.env.LC_ALL = "C";
process.env.LANG = "C";

const DATA_DIR = path.join(os.tmpdir(), "usage360-ip-retention-pgdata");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const PORT = 54351, PW = "testpw";
const readMig = (f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); } };
const conn = () => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });
const U = "11111111-1111-1111-1111-111111111101";

async function main() {
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise(); await epg.start();
  const su = conn(); await su.connect();
  const callAs = async (role, sql) => { const c = conn(); await c.connect(); try { await c.query(`set role ${role}`); return await c.query(sql); } finally { await c.end(); } };
  const errCode = async (fn) => { try { await fn(); return null; } catch (e) { return e.code ?? "ERR"; } };
  try {
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin; grant usage on schema public to anon, authenticated, service_role;
                    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
                    create table public.users (id uuid primary key);`);
    await su.query(`insert into public.users(id) values ($1)`, [U]);
    await su.query(readMig("20260622100000_account_security.sql"));
    await su.query(readMig("20270207000000_security_ip_retention.sql"));

    // Sentetik: 3 eski (>90g) + sınıra yakın yeni (89g) + bugün + zaten NULL eski satır.
    await su.query(`insert into public.user_sessions(user_id, ip_address, country, city, session_token, created_at, is_active) values
      ($1,'198.51.100.7','TR','Konya','s-old-1', now()-interval '200 days', false),
      ($1,'2001:db8::1','TR','İzmir','s-old-2', now()-interval '91 days', true),
      ($1,'203.0.113.9','TR','Ankara','s-new-89', now()-interval '89 days', true),
      ($1,'203.0.113.10','TR','Ankara','s-today', now(), true),
      ($1,null,'TR','Bursa','s-old-null', now()-interval '300 days', false)`, [U]);
    await su.query(`insert into public.security_events(user_id, event_type, severity, message, ip_address, country, city, created_at) values
      ($1,'suspicious_login','medium','m1','198.51.100.8','TR','Konya', now()-interval '120 days'),
      ($1,'high_risk_login','high','m2','203.0.113.11','DE','Berlin', now()-interval '10 days')`, [U]);

    console.log("\n[dry-run]");
    const dry = (await su.query(`select public.security_ip_retention_purge() r`)).rows[0].r;
    ok(dry.dry_run === true && Number(dry.sessions) === 2 && Number(dry.security_events) === 1 && dry.retention_days === 90, "varsayılan dry-run: 2 oturum + 1 olay uygun (NULL olan sayılmaz)");
    const stillRaw = (await su.query(`select count(*)::int n from public.user_sessions where ip_address is not null`)).rows[0].n;
    ok(stillRaw === 4, "dry-run HİÇBİR satırı değiştirmez");

    console.log("\n[purge]");
    const real = (await su.query(`select public.security_ip_retention_purge(false) r`)).rows[0].r;
    ok(real.dry_run === false && Number(real.sessions) === 2 && Number(real.security_events) === 1, "gerçek çalıştırma: dry-run ile aynı sayılar");
    const rows = Object.fromEntries((await su.query(`select session_token, ip_address, city, country, is_active from public.user_sessions`)).rows.map((r) => [r.session_token, r]));
    ok(rows["s-old-1"].ip_address === null && rows["s-old-2"].ip_address === null, ">90 gün eski oturum IP'leri NULL");
    ok(rows["s-new-89"].ip_address === "203.0.113.9" && rows["s-today"].ip_address === "203.0.113.10", "90 günden YENİ IP'ler korunur (89 gün + bugün)");
    ok(rows["s-old-2"].city === "İzmir" && rows["s-old-2"].is_active === true && rows["s-old-1"].country === "TR", "satırın diğer güvenlik alanları korunur (şehir/ülke/aktiflik)");
    const ev = (await su.query(`select event_type, ip_address, country, message from public.security_events order by created_at`)).rows;
    ok(ev[0].ip_address === null && ev[0].event_type === "suspicious_login" && ev[0].message === "m1", "eski güvenlik olayı: IP NULL, olay kaydı korunur");
    ok(ev[1].ip_address === "203.0.113.11", "yeni güvenlik olayı IP'si korunur");
    ok((await su.query(`select count(*)::int n from public.user_sessions`)).rows[0].n === 5 && (await su.query(`select count(*)::int n from public.security_events`)).rows[0].n === 2, "hiçbir satır SİLİNMEZ");
    const again = (await su.query(`select public.security_ip_retention_purge(false) r`)).rows[0].r;
    ok(Number(again.sessions) === 0 && Number(again.security_events) === 0, "idempotent: ikinci çalıştırma 0");

    console.log("\n[sözleşme]");
    const argc = (await su.query(`select pronargs from pg_proc where proname='security_ip_retention_purge'`)).rows;
    ok(argc.length === 1 && argc[0].pronargs === 1, "tek imza (yalnız p_dry_run) → süre parametreyle kısaltılamaz");
    const def = (await su.query(`select prosecdef, proconfig from pg_proc where proname='security_ip_retention_purge'`)).rows[0];
    ok(def.prosecdef === true && JSON.stringify(def.proconfig).includes("search_path="), "SECURITY DEFINER + sabit search_path");
    ok(await errCode(() => callAs("anon", `select public.security_ip_retention_purge()`)) === "42501", "anon EXECUTE → 42501");
    ok(await errCode(() => callAs("authenticated", `select public.security_ip_retention_purge()`)) === "42501", "authenticated EXECUTE → 42501");
    ok(await errCode(() => callAs("service_role", `select public.security_ip_retention_purge()`)) === null, "service_role EXECUTE izinli");
  } finally {
    await su.end().catch(() => {});
    await epg.stop().catch(() => {});
    try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
    console.log("embedded-postgres durduruldu.");
  }
  console.log(`\n──────────\nIP RETENTION PG: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
