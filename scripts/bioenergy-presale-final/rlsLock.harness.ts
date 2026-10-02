/**
 * BIO-17 + BIO-19 — gerçek Postgres (embedded) üzerinde migration zinciri harness'ı.
 * Çalıştır: npx tsx scripts/bioenergy-presale-final/rlsLock.harness.ts
 *
 * BIO-17:
 *   - Gerçek zincir (0623 → 20261001 → 20261203 → 20271002000100) sonrası anon ve
 *     authenticated rolleri 7 Biyoenerji tablosunda SELECT/INSERT/UPDATE/DELETE yapamaz;
 *     service_role (bypassrls) yapabilir.
 *   - MAYIN KANITI: eski 0623 tek başına tekrar çalıştırılırsa erişim GERÇEKTEN açılır.
 *   - `db push` senaryosu: eksik 0623 yeniden uygulanıp ardından final-lock uygulanınca
 *     nihai durum yine KİLİTLİ. Final-lock idempotent (2× güvenli).
 * BIO-19:
 *   - tenant_id ile başlayan indeks yoksa (tenant_id, orderCol) kurulur; tekrar çalıştırmada
 *     kopya oluşmaz; zaten tenant indeksi olan tabloya DOKUNULMAZ.
 */
import { randomUUID } from "node:crypto";
import { BASE_DDL, BIO_TABLES, readMig, startEmbeddedPg } from "./bioTestEnv";
import { harness } from "./fakePostgrest";

const H = harness("bioenergy-presale-final/rlsLock");
const ALL = [...BIO_TABLES, "bioenergy_chakra_blocks"] as const;

type Pg = Awaited<ReturnType<typeof startEmbeddedPg>>["su"];

async function tryAs(su: Pg, role: string, sql: string, params: unknown[] = []): Promise<"ok" | string> {
  await su.query("BEGIN");
  try {
    await su.query(`SET LOCAL ROLE ${role}`);
    await su.query(sql, params);
    await su.query("ROLLBACK");
    return "ok";
  } catch (e) {
    await su.query("ROLLBACK");
    return String((e as { code?: string }).code ?? "ERR");
  }
}

async function probe(su: Pg, role: string, table: string, tenant: string, rowId: string) {
  const col = table === "bioenergy_chakra_blocks" ? "section_key" : "tenant_id";
  const ins = table === "bioenergy_chakra_blocks"
    ? `insert into public.${table}(tenant_id, chakra_id, section_key) select $1, id, 'genel-bakis' from public.bioenergy_chakras limit 1`
    : `insert into public.${table}(tenant_id) values ($1)`;
  return {
    select: await tryAs(su, role, `select * from public.${table} limit 1`),
    insert: await tryAs(su, role, ins, [tenant]),
    update: await tryAs(su, role, `update public.${table} set ${col} = ${col} where id = $1`, [rowId]),
    delete: await tryAs(su, role, `delete from public.${table} where id = $1`, [rowId]),
  };
}

(async () => {
  const { epg, su } = await startEmbeddedPg(54471, "bio-presale-rls-pgdata");
  try {
    await su.query(BASE_DDL);
    await su.query(readMig("20260623200000_bioenergy_rls_tenant_isolation.sql"));
    await su.query(readMig("20261001000000_bioenergy_lock_anon_authenticated.sql"));
    await su.query(readMig("20261203000000_bioenergy_chakra_rich_foundation.sql"));
    await su.query(readMig("20271002000100_bioenergy_rls_final_lock.sql"));
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role;`);

    const T = randomUUID();
    const ids: Record<string, string> = {};
    for (const t of BIO_TABLES) {
      ids[t] = (await su.query(`insert into public.${t}(tenant_id) values ($1) returning id`, [T])).rows[0].id;
    }
    ids.bioenergy_chakra_blocks = (await su.query(
      `insert into public.bioenergy_chakra_blocks(tenant_id, chakra_id, section_key) values ($1,$2,'genel-bakis') returning id`,
      [T, ids.bioenergy_chakras],
    )).rows[0].id;

    const checkLocked = async (label: string) => {
      for (const t of ALL) {
        for (const role of ["anon", "authenticated"]) {
          const r = await probe(su, role, t, T, ids[t]!);
          H.ok(r.select !== "ok" && r.insert !== "ok" && r.update !== "ok" && r.delete !== "ok",
            `${label}: ${role} @ ${t} → SELECT/INSERT/UPDATE/DELETE reddedildi (${r.select}/${r.insert}/${r.update}/${r.delete})`);
        }
      }
    };
    await checkLocked("zincir sonu");
    for (const t of ALL) {
      const r = await probe(su, "service_role", t, T, ids[t]!);
      H.ok(r.select === "ok" && r.insert === "ok" && r.update === "ok" && r.delete === "ok", `service_role @ ${t} → CRUD çalışır (${JSON.stringify(r)})`);
    }
    const pol = (await su.query(`select count(*)::int n from pg_policies where tablename like 'bioenergy%'`)).rows[0].n;
    const gr = (await su.query(`select count(*)::int n from information_schema.role_table_grants where table_name like 'bioenergy%' and grantee in ('anon','authenticated','PUBLIC')`)).rows[0].n;
    H.ok(pol === 0 && gr === 0, `policy=${pol}, anon/authenticated grant=${gr}`);

    // MAYIN KANITI: eski 0623 tek başına tekrar çalıştırılırsa erişim açılır
    await su.query(readMig("20260623200000_bioenergy_rls_tenant_isolation.sql"));
    const reopened = await tryAs(su, "anon", `select * from public.bioenergy_sessions where tenant_id = $1`, [T]);
    H.ok(reopened === "ok", "kanıt: 0623 replay → anon SELECT açılır (mayın gerçek)");
    // db push senaryosu: eksik 0623 + final-lock birlikte uygulanır → kilitli
    await su.query(readMig("20271002000100_bioenergy_rls_final_lock.sql"));
    await checkLocked("0623 replay + final-lock");
    await su.query(readMig("20271002000100_bioenergy_rls_final_lock.sql"));
    await checkLocked("final-lock 2× (idempotent)");

    // BIO-19 indeksler
    const idxCount = async (t: string) => (await su.query(
      `select count(*)::int n from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
       where i.indrelid = ('public.'||$1)::regclass and a.attname='tenant_id'`, [t])).rows[0].n as number;
    await su.query(`create index zz_existing_symbols_tenant on public.bioenergy_symbols(tenant_id)`);
    await su.query(readMig("20271002000200_bioenergy_tenant_indexes.sql"));
    for (const t of BIO_TABLES) H.ok((await idxCount(t)) === 1, `BIO-19: ${t} tenant_id ile başlayan tam 1 indeks`);
    const symIdx = (await su.query(`select indexname from pg_indexes where tablename='bioenergy_symbols' and indexname like '%tenant%'`)).rows.map((r) => r.indexname);
    H.ok(symIdx.length === 1 && symIdx[0] === "zz_existing_symbols_tenant", "BIO-19: mevcut tenant indeksi olan tabloya yeni indeks EKLENMEDİ");
    await su.query(readMig("20271002000200_bioenergy_tenant_indexes.sql"));
    let stable = true;
    for (const t of BIO_TABLES) if ((await idxCount(t)) !== 1) stable = false;
    H.ok(stable, "BIO-19: 2. çalıştırma kopya indeks oluşturmaz (idempotent)");
    const plan = (await su.query(`explain select * from public.bioenergy_chakras where tenant_id = '${T}' order by name limit 30`)).rows.map((r) => r["QUERY PLAN"]).join(" ");
    H.ok(/bioenergy_chakras_tenant_name_idx|Index|Seq Scan/.test(plan), `plan üretilebilir (${plan.slice(0, 80)})`);
  } finally {
    await su.end().catch(() => undefined);
    await epg.stop().catch(() => undefined);
  }
  H.done();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
