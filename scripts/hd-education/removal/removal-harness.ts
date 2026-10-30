/**
 * HD Eğitim Merkezi — yaşayan 5 kişinin kontrollü kaldırılması (remove-living-5.sql) İZOLE provası.
 * Gömülü PostgreSQL + gerçek migration'lar (20271110/12/13 + 20271206000200 biyografi) + GERÇEK 50 kişilik paket
 * (içe aktarım SQL + SHA doğrulamalı snapshot'lar + 50 biyografi gerçek bioImport aracıyla). Production'a bağlantı YOK.
 *  1) Uygulama rolü (service_role) eğitim tablolarında DELETE yapamaz.
 *  2) Kuru çalıştırma (BEGIN … ROLLBACK): hiçbir satır değişmez, korumalar etkin kalır.
 *  3) Ön koşul bozuksa (ikinci owner) işlem reddedilir, hiçbir satır değişmez.
 *  4) Uygulama (BEGIN … COMMIT): 45 kişi kalır; kalan 45 kişinin TÜM satırları birebir aynı; aile üyeleri korunur;
 *     5 kalıcı kaldırma kaydı (içerik yok); eğitim dışı tablolar değişmez; append-only korumaları yeniden etkin.
 *  5) İkinci çalıştırma reddedilir (0 kişi) ve hiçbir şey değişmez.
 * Çalıştır: npx tsx scripts/hd-education/removal/removal-harness.ts --import <sql> --local-key <sql> --owner <uuid> --pkg <paket>
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { restoreSnapshotFile } from "../real/snapshot-io";
import { bioImportSql, loadBioDir } from "../biography/bioImport";
import { EDU_FAMILIES } from "../../../lib/human-design/education/educationFamilies";

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
const IMPORT = arg("--import"), LOCALKEY = arg("--local-key"), OWNER = arg("--owner"), PKG = arg("--pkg");
if (!IMPORT || !LOCALKEY || !OWNER || !PKG) throw new Error("--import --local-key --owner --pkg zorunlu");
let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; fails.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 500)}` : ""}`); } };
const section = (s: string) => console.log(`\n[${s}]`);

const SQL_FILE = path.join(process.cwd(), "scripts/hd-education/removal/remove-living-5.sql");
const BODY = readFileSync(SQL_FILE, "utf8");
const KEYS = ["angelina-jolie-1975-06-04", "aras-oren-1939-11-01", "barack-obama-1961-08-04", "donald-j-trump-1946-06-14", "tarkan-1972-10-17"];
const EDU = ["hd_education_subjects", "hd_education_sources", "hd_education_charts", "hd_education_publications", "hd_education_biographies", "hd_education_biography_revisions", "hd_education_audit_events"];

async function main() {
  let env: TestEnv | null = null;
  try {
    console.log(`kaldırma betiği SHA-256: ${createHash("sha256").update(BODY).digest("hex")}`);
    const mig = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql", "20271113000000_hd_education_chart_provider_body.sql", "20271206000200_hd_education_biographies.sql"]
      .map((f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));
    env = await startAnamnezTestEnv({ port: Number(process.env.HD_EDU_REMOVAL_PG_PORT ?? 54733), httpPort: Number(process.env.HD_EDU_TEST_HTTP_PORT ?? 54398), dirName: `hd-edu-removal-${Date.now()}-${randomUUID().slice(0, 8)}`,
      rpcAllow: ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible"],
      extraSql: [`create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid, target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`, ...mig] });
    const su = env.su;
    const q = (sql: string, a: unknown[] = []) => su.query(sql, a);
    const tenant = randomUUID();
    await q(`insert into public.tenants(id, name) values ($1,'ZZ')`, [tenant]);
    await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, package_type, plan, admin_level) values ($1,'Yerel Owner (test)','owner.local@example.test','admin',true,'approved',true,$2,'premium','premium','owner')`, [OWNER, tenant]);
    await q(readFileSync(LOCALKEY, "utf8"));
    await q(readFileSync(IMPORT, "utf8"));
    for (const m of readFileSync(path.join(PKG, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { file: string; sha256: string; natural_key: string })) {
      const r = await restoreSnapshotFile(su, path.join(PKG, "snapshots", m.file), m.sha256);
      if (r !== "RESTORED") ok(false, `snapshot geri yükleme: ${m.natural_key}`, r);
    }
    const bios = loadBioDir(path.join(PKG, "biyografiler"));
    ok(bios.errors.length === 0 && bios.files.length === 50, `paket biyografileri okundu (${bios.files.length})`, bios.errors.slice(0, 3));
    await q(bioImportSql(bios.files));
    // Uzman yetkisi (kaldırmanın dokunmaması gereken ilişkisiz kayıt örneği).
    const expert = randomUUID();
    await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, module_permissions, package_type, plan) values ($1,'ZZ Uzman','zz.rm@example.test','expert',true,'approved',false,$2,'{"human_design":true}','premium','premium')`, [expert, tenant]);
    await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER, expert]);

    const counts = async () => Object.fromEntries(await Promise.all(EDU.map(async (t) => [t, Number((await q(`select count(*)::int n from public.${t}`)).rows[0].n)]))) as Record<string, number>;
    const allTables = async () => new Map(((await q(`select c.relname as t, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int as n
        from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r'`)).rows as Array<{ t: string; n: number }>).map((r) => [r.t, r.n]));
    // Kalan (yaşamayan) kişilerin TÜM satırlarının özeti — betikten bağımsız hesap.
    const remainingDigest = async () => (await q(`with keep as (select id from public.hd_education_subjects where natural_key <> all($1::text[])),
        kb as (select id from public.hd_education_biographies where subject_id in (select id from keep))
      select md5(concat_ws('#',
        (select string_agg(md5(to_jsonb(s)::text), ',' order by s.id) from public.hd_education_subjects s where s.id in (select id from keep)),
        (select string_agg(md5(to_jsonb(x)::text), ',' order by x.id) from public.hd_education_sources x where x.subject_id in (select id from keep)),
        (select string_agg(md5(to_jsonb(c)::text), ',' order by c.id) from public.hd_education_charts c where c.subject_id in (select id from keep)),
        (select string_agg(md5(to_jsonb(p)::text), ',' order by p.subject_id) from public.hd_education_publications p where p.subject_id in (select id from keep)),
        (select string_agg(md5(to_jsonb(b)::text), ',' order by b.id) from public.hd_education_biographies b where b.id in (select id from kb)),
        (select string_agg(md5(to_jsonb(v)::text), ',' order by v.id) from public.hd_education_biography_revisions v where v.biography_id in (select id from kb)),
        (select string_agg(md5(to_jsonb(a)::text), ',' order by a.id) from public.hd_education_audit_events a where a.subject_id in (select id from keep) or (a.subject_id is null and a.action <> 'takedown_handled')),
        (select string_agg(md5(to_jsonb(g)::text), ',' order by g.id) from public.hd_education_access_grants g))) d`, [KEYS])).rows[0].d as string;
    const guardsOn = async () => Number((await q(`select count(*)::int n from pg_trigger where tgname in ('trg_hd_edu_audit_guard','hd_edu_bio_rev_append_only') and tgenabled = 'O'`)).rows[0].n) === 2;
    const run = async (end: "COMMIT" | "ROLLBACK", pre = "") => {
      try { await q(`BEGIN;\n${pre}\n${BODY}\n${end};`); return null; } catch (e) { await q("ROLLBACK").catch(() => undefined); return String((e as Error).message); }
    };

    section("0. Başlangıç");
    const c0 = await counts(); const t0 = await allTables(); const d0 = await remainingDigest();
    ok(c0.hd_education_subjects === 50 && c0.hd_education_charts === 50 && c0.hd_education_biographies === 50 && c0.hd_education_biography_revisions === 50 && c0.hd_education_sources === 298,
      "50 kişi / 50 snapshot / 50 biyografi / 50 revizyon / 298 kaynak", c0);
    const living = (await q(`select natural_key from public.hd_education_subjects where is_living order by 1`)).rows.map((r: { natural_key: string }) => r.natural_key);
    ok(JSON.stringify(living) === JSON.stringify(KEYS), "yaşayan kişi kümesi = kaldırılacak 5 kişi", living);
    const rmAudit = Number((await q(`select count(*)::int n from public.hd_education_audit_events a join public.hd_education_subjects s on s.id=a.subject_id where s.natural_key = any($1)`, [KEYS])).rows[0].n);
    const rmSources = Number((await q(`select count(*)::int n from public.hd_education_sources x join public.hd_education_subjects s on s.id=x.subject_id where s.natural_key = any($1)`, [KEYS])).rows[0].n);

    section("1. Uygulama rolü silemez");
    for (const t of EDU) {
      let msg = "";
      try { await q(`BEGIN; SET LOCAL ROLE service_role; DELETE FROM public.${t} WHERE false; COMMIT;`); } catch (e) { msg = String((e as Error).message); await q("ROLLBACK").catch(() => undefined); }
      ok(/permission denied/i.test(msg), `service_role DELETE ${t} → yetki yok`, msg);
    }

    section("2. Kuru çalıştırma (ROLLBACK)");
    const e2 = await run("ROLLBACK");
    ok(e2 === null, "kuru çalıştırma hatasız tamamlandı", e2);
    ok(JSON.stringify(await counts()) === JSON.stringify(c0) && await remainingDigest() === d0 && await guardsOn(), "kuru çalıştırma sonrası: satır sayıları + özet aynı, korumalar etkin");

    section("3. Ön koşul bozuk → red");
    const e3 = await run("COMMIT", `INSERT INTO public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id) VALUES ('${randomUUID()}','ZZ İkinci Owner','zz.o2@example.test','admin',true,'approved',true,'${tenant}');`);
    ok(!!e3 && /tam 1 platform owner/.test(e3), "ikinci owner varken işlem reddedildi", e3);
    ok(JSON.stringify(await counts()) === JSON.stringify(c0) && await remainingDigest() === d0 && await guardsOn(), "red sonrası hiçbir satır değişmedi");

    section("4. Uygulama (COMMIT)");
    const e4 = await run("COMMIT");
    ok(e4 === null, "kaldırma işlemi tamamlandı", e4);
    const c4 = await counts();
    ok(c4.hd_education_subjects === 45 && c4.hd_education_charts === 45 && c4.hd_education_publications === 45 && c4.hd_education_biographies === 45 && c4.hd_education_biography_revisions === 45,
      "45 kişi / 45 snapshot / 45 yayın kaydı / 45 biyografi / 45 revizyon", c4);
    ok(c4.hd_education_sources === c0.hd_education_sources - rmSources && c4.hd_education_audit_events === c0.hd_education_audit_events - rmAudit + 5,
      `kaynak ${c0.hd_education_sources}→${c4.hd_education_sources}; denetim ${c0.hd_education_audit_events} − ${rmAudit} + 5 kaldırma kaydı`, c4);
    ok(await remainingDigest() === d0, "kalan 45 kişinin TÜM satırları (kişi, kaynak, snapshot, yayın, biyografi, revizyon, denetim) + yetkiler BİREBİR aynı");
    ok(Number((await q(`select count(*)::int n from public.hd_education_subjects where is_living or natural_key = any($1)`, [KEYS])).rows[0].n) === 0, "yaşayan kişi kalmadı");
    const orphans = (await q(`select
        (select count(*) from public.hd_education_sources x where not exists (select 1 from public.hd_education_subjects s where s.id=x.subject_id))::int +
        (select count(*) from public.hd_education_charts x where not exists (select 1 from public.hd_education_subjects s where s.id=x.subject_id))::int +
        (select count(*) from public.hd_education_biography_revisions v where not exists (select 1 from public.hd_education_biographies b where b.id=v.biography_id))::int n`)).rows[0].n;
    ok(Number(orphans) === 0, "sahipsiz satır yok");
    const rm = (await q(`select actor_kind, actor_user_id, subject_id, detail from public.hd_education_audit_events where action='takedown_handled' order by detail->>'natural_key'`)).rows as Array<{ actor_kind: string; actor_user_id: string; subject_id: string | null; detail: Record<string, unknown> }>;
    ok(rm.length === 5 && JSON.stringify(rm.map((r) => r.detail.natural_key)) === JSON.stringify(KEYS) && rm.every((r) => r.actor_kind === "owner" && r.actor_user_id === OWNER && r.subject_id === null),
      "5 kalıcı kaldırma kaydı (owner, kişi kimliği, subject_id NULL)", rm.map((r) => r.detail.natural_key));
    ok(rm.every((r) => !/birth_date|document_quote|documented_local_time|birth_place|short_intro|sections/.test(JSON.stringify(r.detail)) && /^[0-9a-f]{64}$/.test(String((r.detail.sha256 as Record<string, string>).kisi))),
      "kaldırma kaydında kişi içeriği YOK; yalnız satır sayıları + SHA-256");
    const keyIds = new Set((await q(`select natural_key from public.hd_education_subjects`)).rows.map((r: { natural_key: string }) => r.natural_key));
    for (const f of EDU_FAMILIES) ok(f.members.every((m) => keyIds.has(m.naturalKey)), `aile '${f.title}' tüm üyeleriyle duruyor`);
    const t4 = await allTables();
    const changed = [...t4.entries()].filter(([t, n]) => t0.get(t) !== n).map(([t]) => t);
    ok(changed.every((t) => EDU.includes(t)), "eğitim dışı HİÇBİR tablonun satır sayısı değişmedi", changed);
    ok(await guardsOn(), "append-only korumaları yeniden etkin");
    let del = ""; try { await q(`delete from public.hd_education_audit_events where action='takedown_handled'`); } catch (e) { del = String((e as Error).message); }
    ok(/silinemez/.test(del), "kaldırma kayıtları dahil denetim satırları silinemez (koruma çalışıyor)", del);
    let upd = ""; try { await q(`update public.hd_education_biography_revisions set action='status' where true`); } catch (e) { upd = String((e as Error).message); }
    ok(upd.length > 0, "biyografi revizyonları değiştirilemez (koruma çalışıyor)", upd.slice(0, 120));
    ok(Number((await q(`select count(*)::int n from public.hd_education_access_grants where revoked_at is null`)).rows[0].n) === 1, "uzman yetkisi (ilişkisiz kayıt) korunuyor");

    section("5. İkinci çalıştırma → red");
    const d5 = await remainingDigest(); const c5 = await counts();
    const e5 = await run("COMMIT");
    ok(!!e5 && /5 kişi beklenir, bulunan 0/.test(e5), "ikinci çalıştırma reddedildi (zaten kaldırılmış)", e5);
    ok(JSON.stringify(await counts()) === JSON.stringify(c5) && await remainingDigest() === d5 && await guardsOn(), "ikinci çalıştırma hiçbir şeyi değiştirmedi");
  } finally {
    await env?.stop().catch(() => undefined);
  }
  console.log(`\nhd-education KALDIRMA provası: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error("BAŞARISIZ:\n - " + fails.join("\n - ")); process.exit(1); }
}

main().catch((e) => { console.error("prova çöktü:", e); process.exit(1); });
