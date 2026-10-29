/**
 * Klasik Numeroloji — MIGRATION harness'i (yalnız 127.0.0.1 geçici embedded-postgres; PROD/STAGING'E SIFIR TEMAS).
 *
 * Şema tabanı: scripts/anamnez/testEnv.ts (sentetik users/clients + GERÇEK client_consents migration'ı →
 * clients_tenant_id_id_key). Üzerine mevcut Numeroloji tablolarının minimal tanımı + repodaki numerology
 * migration'ları (uygulanabilenler) + 20271205000000_numerology_classic_core.sql.
 *
 * NOT: Repo migration zinciri tek başına boş bir PG'ye uygulanamaz (numerology_records / clients vb. temel
 * tablolar migration'larda CREATE edilmez; Supabase panelinden gelmiştir). Bu yüzden "tüm zincir" yerine
 * numerology ile ilgili tüm migration'lar sırayla denenir; hangilerinin uygulandığı raporlanır.
 *
 * Doğrulananlar: tablolar; RLS açık; sıfır policy; anon/authenticated/PUBLIC yetkisiz (Supabase varsayılan
 * yetkileri öykünülerek); bileşik FK (çapraz tenant reddi, danışan silinince SET NULL); CHECK'ler (kind,
 * boyut, anahtar sızıntısı, katalog sayı aralığı, lucky payload); trigger (row_version/updated_at);
 * idempotentlik (ikinci uygulama); mevcut numerology_* + clients katalog dökümü migration öncesi/sonrası BİREBİR.
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/pg/migration.harness.ts
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";

const ROOT = path.resolve(__dirname, "../../..");
const MIG_DIR = path.join(ROOT, "supabase/migrations");
const NEW_MIG = "20271205000000_numerology_classic_core.sql";
const NEW_TABLES = [
  "numerology_classic_analyses",
  "numerology_classic_response_cache",
  "numerology_classic_catalog",
  "numerology_comparative_notes",
  "numerology_classic_provider_calls",
  "numerology_classic_purge_log",
];

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
  }
}
const section = (s: string) => console.log(`\n[${s}]`);

const LEGACY_DDL = `
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create table if not exists public.numerology_records (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text, surname text, birth_date text,
  analysis_data jsonb, created_at timestamptz default now()
);
create table if not exists public.numerology_knowledge_records (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, number integer, title text, content text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.numerology_stone_assignments (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, number integer, stone_id uuid, created_at timestamptz default now()
);
`;

/** Mevcut (legacy) numerology_* + demo_numerology_* + clients tablolarının katalog dökümü. */
async function legacyDump(su: pg.Client): Promise<string> {
  const rel = `c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    and (c.relname like 'numerology\\_%' or c.relname like 'demo\\_numerology\\_%' or c.relname = 'clients')
    and c.relname <> all($1::text[])`;
  const q = async (sql: string) => (await su.query(sql, [NEW_TABLES])).rows;
  const parts = {
    tables: await q(`select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c where ${rel} order by 1`),
    columns: await q(`select c.relname, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) t, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) def
      from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum where ${rel} order by 1, 2`),
    constraints: await q(`select c.relname, k.conname, pg_get_constraintdef(k.oid) def from pg_constraint k join pg_class c on c.oid = k.conrelid where ${rel} order by 1, 2`),
    indexes: await q(`select c.relname, i.relname idx, pg_get_indexdef(i.oid) def from pg_index x join pg_class c on c.oid = x.indrelid join pg_class i on i.oid = x.indexrelid where ${rel} order by 1, 2`),
    triggers: await q(`select c.relname, t.tgname, pg_get_triggerdef(t.oid) def from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and ${rel} order by 1, 2`),
    policies: await q(`select c.relname, p.polname from pg_policy p join pg_class c on c.oid = p.polrelid where ${rel} order by 1, 2`),
    acl: await q(`select c.relname, c.relacl::text acl from pg_class c where ${rel} order by 1`),
  };
  return JSON.stringify(parts);
}

async function expectSqlError(su: pg.Client, sql: string, params: unknown[], code: string | null, label: string): Promise<void> {
  await su.query("savepoint sp");
  try {
    await su.query(sql, params);
    await su.query("release savepoint sp");
    ok(false, label, "hata bekleniyordu, sorgu başarılı");
  } catch (e) {
    await su.query("rollback to savepoint sp");
    const c = (e as { code?: string }).code ?? null;
    ok(code === null || c === code, label, { code: c, msg: (e as Error).message.slice(0, 160) });
  }
}

async function main(): Promise<void> {
  const env: TestEnv = await startAnamnezTestEnv({ port: Number(process.env.NUMK_PG_PORT ?? 54592), dirName: `num-klasik-mig-${Date.now()}` });
  const su = env.su;
  try {
    section("taban şema + mevcut Numeroloji migration'ları");
    // Supabase'in public şemadaki varsayılan yetkileri (yeni tablolar anon/authenticated'a açık doğar) öykünülür →
    // migration'daki REVOKE'un gerçekten işe yaradığı kanıtlanır.
    await su.query(`alter default privileges in schema public grant all on tables to anon, authenticated;
                    alter default privileges in schema public grant all on sequences to anon, authenticated;
                    alter default privileges in schema public grant all on functions to anon, authenticated;`);
    await su.query(LEGACY_DDL);
    const numMigs = readdirSync(MIG_DIR).filter((f) => /numerolog|numeroloji/i.test(f) && f !== NEW_MIG && !/numerology_classic_/.test(f)).sort();
    const applied: string[] = [];
    const skipped: string[] = [];
    for (const f of numMigs) {
      try {
        // Migration kendi BEGIN/COMMIT'ini taşıyabilir → işlem dışında, olduğu gibi çalıştırılır.
        await su.query(readFileSync(path.join(MIG_DIR, f), "utf8"));
        applied.push(f);
      } catch (e) {
        try { await su.query("rollback"); } catch { /* işlem yok */ }
        skipped.push(`${f} (${(e as Error).message.slice(0, 90)})`);
      }
    }
    console.log(`  uygulanan: ${applied.join(", ") || "-"}`);
    console.log(`  atlanan (önkoşul tabloları/fonksiyonları test şemasında yok): ${skipped.join(" | ") || "-"}`);
    ok(applied.includes("20270121000000_numerology_core_rls_lock.sql") && applied.includes("20271120000300_numerology_records_client_link.sql"),
      "mevcut çekirdek RLS kilidi + numerology_records danışan bağı migration'ları uygulandı");

    const before = await legacyDump(su);
    const sql = readFileSync(path.join(MIG_DIR, NEW_MIG), "utf8");
    await su.query(sql);
    ok(true, "yeni migration uygulandı");
    await su.query(sql);
    ok(true, "yeni migration İKİNCİ kez hatasız uygulandı (idempotent)");
    const after = await legacyDump(su);
    ok(before === after, "mevcut numerology_* / demo_numerology_* / clients katalog dökümü BİREBİR aynı", before === after ? undefined : { beforeLen: before.length, afterLen: after.length });

    section("tablolar, RLS, policy, yetkiler");
    for (const t of NEW_TABLES) {
      const r = (await su.query(`select relrowsecurity from pg_class where oid = to_regclass($1)`, [`public.${t}`])).rows[0];
      ok(!!r, `${t} var`);
      ok(r?.relrowsecurity === true, `${t} RLS açık`);
      const pol = (await su.query(`select count(*)::int n from pg_policies where schemaname='public' and tablename=$1`, [t])).rows[0].n;
      ok(pol === 0, `${t} sıfır policy`);
      for (const role of ["anon", "authenticated"]) {
        const priv = (await su.query(
          `select bool_or(has_table_privilege($1, $2, p)) any from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`,
          [role, `public.${t}`],
        )).rows[0].any;
        ok(priv === false, `${t}: ${role} hiçbir tablo yetkisi yok`);
      }
      const pub = (await su.query(`select coalesce(bool_or(grantee = 'PUBLIC'), false) p from information_schema.role_table_grants where table_schema='public' and table_name=$1`, [t])).rows[0].p;
      ok(pub === false, `${t}: PUBLIC yetkisi yok`);
      const svc = (await su.query(`select has_table_privilege('service_role', $1, 'SELECT') s, has_table_privilege('service_role', $1, 'INSERT') i`, [`public.${t}`])).rows[0];
      ok(svc.s === true && svc.i === true, `${t}: service_role SELECT+INSERT`);
    }
    const seq = (await su.query(`select has_sequence_privilege('anon','public.numerology_classic_provider_calls_id_seq','USAGE') a,
                                        has_sequence_privilege('service_role','public.numerology_classic_provider_calls_id_seq','USAGE') s`)).rows[0];
    ok(seq.a === false && seq.s === true, "defter sequence: anon yok, service_role var");
    const fn = (await su.query(`select has_function_privilege('anon','public.numerology_classic_touch()','EXECUTE') a`)).rows[0];
    ok(fn.a === false, "touch fonksiyonu anon'a kapalı");
    ok(!/numerology_records|numerology_knowledge_records|numerology_stone_assignments/.test(sql.replace(/--.*$/gm, "")),
      "yeni migration (yorumlar hariç) mevcut numerology tablolarına HİÇ atıf yapmıyor");

    section("bileşik FK + CHECK + trigger");
    await su.query("begin");
    const TA = randomUUID();
    const TB = randomUUID();
    const cA = randomUUID();
    const cB = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_NUMK_A'),($2,'ZZ_NUMK_B')`, [TA, TB]);
    await su.query(`insert into public.clients(id, tenant_id, ad) values ($1,$2,'ZZ A'),($3,$4,'ZZ B')`, [cA, TA, cB, TB]);
    const ins = `insert into public.numerology_classic_analyses (tenant_id, client_id, kind, input, methodology_version, api_schema_version, status)
                 values ($1, $2, $3, $4::jsonb, 'm1', 's1', $5) returning id, row_version, updated_at`;
    const a1 = (await su.query(ins, [TA, cA, "person", JSON.stringify({ fullName: "Ayşe" }), "complete"])).rows[0];
    ok(!!a1?.id && a1.row_version === 1, "aynı tenant danışan bağıyla analiz eklenir (row_version=1)");
    await expectSqlError(su, ins, [TA, cB, "person", "{}", "complete"], "23503", "başka tenant'ın danışanı → FK reddi (23503)");
    await expectSqlError(su, ins, [TA, null, "horoscope", "{}", "complete"], "23514", "geçersiz kind → CHECK reddi");
    await expectSqlError(su, ins, [TA, null, "person", "{}", "draft"], "23514", "geçersiz status → CHECK reddi");
    await expectSqlError(su, ins, [TA, null, "person", JSON.stringify({ s: "x".repeat(17000) }), "complete"], "23514", "16 KB üstü input → CHECK reddi");
    await expectSqlError(su, ins, [TA, null, "person", "[]", "complete"], "23514", "nesne olmayan input → CHECK reddi");
    await expectSqlError(su,
      `insert into public.numerology_classic_analyses (tenant_id, kind, input, methodology_version, api_schema_version, status, provider_meta) values ($1,'person','{}','m','s','complete',$2::jsonb)`,
      [TA, JSON.stringify({ headers: { "X-API-Key": "zz" } })], "23514", "provider_meta içinde anahtar izi → CHECK reddi");
    await expectSqlError(su,
      `insert into public.numerology_classic_analyses (tenant_id, kind, input, methodology_version, api_schema_version, status, title) values ($1,'person','{}','m','s','complete',$2)`,
      [TA, "x".repeat(161)], "23514", "161 karakter başlık → CHECK reddi");

    await su.query(`update public.numerology_classic_analyses set title = 'yeni' where id = $1`, [a1.id]);
    const a1b = (await su.query(`select row_version, updated_at from public.numerology_classic_analyses where id = $1`, [a1.id])).rows[0];
    ok(a1b.row_version === 2, "UPDATE trigger row_version'ı +1 yapar");

    await su.query(`insert into public.numerology_comparative_notes (tenant_id, client_id, legacy_record_id, classic_analysis_id, body) values ($1,$2,$3,$4,'not')`,
      [TA, cA, randomUUID(), a1.id]);
    await expectSqlError(su, `insert into public.numerology_comparative_notes (tenant_id, classic_analysis_id) values ($1,$2)`, [TB, a1.id], "23503",
      "not: başka tenant'ın analizi → FK reddi");
    await expectSqlError(su, `insert into public.numerology_comparative_notes (tenant_id, body) values ($1,$2)`, [TA, "x".repeat(20001)], "23514", "not gövdesi 20000 üstü → CHECK reddi");
    await expectSqlError(su, `insert into public.numerology_comparative_notes (tenant_id, legacy_record_id) values ($1,$2)`, [TA, "x'; drop table"], "23514", "legacy_record_id biçim dışı → CHECK reddi");

    await su.query(`delete from public.clients where id = $1`, [cA]);
    const a1c = (await su.query(`select client_id, tenant_id from public.numerology_classic_analyses where id = $1`, [a1.id])).rows[0];
    ok(!!a1c && a1c.client_id === null && a1c.tenant_id === TA, "danışan silinince analiz KALIR, client_id NULL, tenant_id korunur");
    const n1 = (await su.query(`select client_id, classic_analysis_id from public.numerology_comparative_notes where tenant_id = $1`, [TA])).rows[0];
    ok(n1.client_id === null && n1.classic_analysis_id === a1.id, "danışan silinince not KALIR, yalnız client_id NULL");
    await su.query(`delete from public.numerology_classic_analyses where id = $1`, [a1.id]);
    const n2 = (await su.query(`select classic_analysis_id, tenant_id from public.numerology_comparative_notes where tenant_id = $1`, [TA])).rows[0];
    ok(n2.classic_analysis_id === null && n2.tenant_id === TA, "analiz (hard) silinince not KALIR, classic_analysis_id NULL");

    const cache = `insert into public.numerology_classic_response_cache (tenant_id, cache_key, endpoint_id, lang, spec_version, adapter_version, normalized) values ($1,$2,'chart','tr','s','a','{}')`;
    await su.query(cache, [TA, "a".repeat(64)]);
    await su.query(cache, [TB, "a".repeat(64)]);
    ok(true, "aynı önbellek anahtarı farklı tenant'ta ayrı satır (PK tenant_id, cache_key)");
    await expectSqlError(su, cache, [TA, "a".repeat(64)], "23505", "aynı tenant + anahtar → PK reddi");
    await expectSqlError(su, cache, [TA, "XYZ"], "23514", "hex64 olmayan önbellek anahtarı → CHECK reddi");

    const cat = `insert into public.numerology_classic_catalog (kind, number, lang, payload, spec_version) values ($1,$2,$3,$4::jsonb,'s')`;
    await su.query(cat, ["pythagorean_meaning", 11, "tr", "{}"]);
    await su.query(cat, ["chaldean_compound", 52, "tr", "{}"]);
    const lucky = { gemstones: ["Ruby"], colors: ["red"], day: "Sunday", element: "Fire", rulingPlanet: "Sun", compatibleNumbers: [3], incompatibleNumbers: [6] };
    await su.query(cat, ["lucky_association", 1, "en", JSON.stringify(lucky)]);
    ok(true, "katalog: pythagorean 11, chaldean 52, lucky_association 1/en eklenir");
    await expectSqlError(su, cat, ["pythagorean_meaning", 10, "tr", "{}"], "23514", "katalog: pythagorean 10 → CHECK reddi");
    await expectSqlError(su, cat, ["chaldean_compound", 53, "tr", "{}"], "23514", "katalog: chaldean 53 → CHECK reddi");
    await expectSqlError(su, cat, ["lucky_association", 12, "en", JSON.stringify(lucky)], "23514", "katalog: lucky 12 (Life Path değil) → CHECK reddi");
    await expectSqlError(su, cat, ["lucky_association", 2, "de", JSON.stringify(lucky)], "23514", "katalog: lucky lang de → CHECK reddi");
    await expectSqlError(su, cat, ["lucky_association", 2, "en", JSON.stringify({ gemstones: [] })], "23514", "katalog: lucky eksik payload anahtarı → CHECK reddi");
    await expectSqlError(su, cat, ["horoscope", 1, "tr", "{}"], "23514", "katalog: bilinmeyen kind → CHECK reddi");

    const led = `insert into public.numerology_classic_provider_calls (tenant_id, endpoint_id, http, outcome) values ($1,$2,$3,$4)`;
    await su.query(led, [TA, "chart", 200, "ok"]);
    await expectSqlError(su, led, [TA, "chart", 999, "ok"], "23514", "defter: http 999 → CHECK reddi");
    await expectSqlError(su, led, [TA, "chart", 200, "OK; drop"], "23514", "defter: outcome biçim dışı → CHECK reddi");

    section("rol bazlı erişim (gerçek SET ROLE)");
    for (const role of ["anon", "authenticated"]) {
      await su.query("savepoint r");
      try {
        await su.query(`set local role ${role}`);
        await su.query(`select 1 from public.numerology_classic_analyses limit 1`);
        await su.query("rollback to savepoint r");
        ok(false, `${role} SELECT reddedilmeli`);
      } catch (e) {
        await su.query("rollback to savepoint r");
        ok((e as { code?: string }).code === "42501", `${role}: numerology_classic_analyses SELECT → 42501 yetki reddi`);
      }
    }
    await su.query("rollback");
  } finally {
    await env.stop();
  }
  console.log(`\n${pass} ✓ / ${fail} ✗`);
  if (fail) console.log(`BAŞARISIZ:\n  - ${failures.join("\n  - ")}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("harness hatası:", e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
