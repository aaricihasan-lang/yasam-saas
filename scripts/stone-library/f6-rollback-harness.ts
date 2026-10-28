/**
 * Doğaltaş Kütüphanesi F6 — migration sırası + geri alma zinciri testi (izole embedded-postgres; prod'a SIFIR temas).
 *   • 0400, 0300 olmadan uygulanamaz · 0400 iki kez uygulanamaz
 *   • ROLLBACK_0400: owner verisi varken DURUR (veri silmez); boşken F3 gövdelerini geri getirir; 0400 yeniden uygulanabilir
 *   • ROLLBACK_0300: raw_put'u F2 hâline döndürür (service_role), ekleme kilidini kaldırır
 * Çalıştır: npx tsx scripts/stone-library/f6-rollback-harness.ts   (STONE_LIBRARY_F6RB_PG_PORT, varsayılan 54598)
 */
import "../hd-analysis-word-flow/env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { startAnamnezTestEnv } from "../anamnez/testEnv";

let pass = 0; let fail = 0; const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const M = (f: string) => read(`supabase/migrations/${f}`);

async function main() {
  const base = ["20271201000000_stone_library_core.sql", "20271201000100_stone_library_f2.sql", "20271201000200_stone_library_f3.sql"];
  const env = await startAnamnezTestEnv({ port: Number(process.env.STONE_LIBRARY_F6RB_PG_PORT ?? 54598), dirName: `stone-library-f6rb-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: [], extraSql: base.map(M) });
  const su = env.su;
  const err = async (sql: string) => { try { await su.query(sql); return null; } catch (e) { await su.query("rollback").catch(() => undefined); return String((e as Error).message); } };
  const one = async (sql: string) => Object.values((await su.query(sql)).rows[0] ?? {})[0];
  const svcHas = async (fn: string) => Boolean(await one(`select bool_or(has_function_privilege('service_role', oid, 'EXECUTE')) from pg_proc where proname='${fn}'`));
  try {
    console.log("\n[1. Sıra koruması]");
    const e1 = await err(M("20271201000400_stone_library_f6_layers.sql"));
    ok(!!e1 && /F6-A/.test(e1), "0400, 0300 olmadan uygulanamaz", e1);
    ok(await err(M("20271201000300_stone_library_f6_raw_guard.sql")) === null, "0300 uygulandı");
    ok(await err(M("20271201000400_stone_library_f6_layers.sql")) === null, "0400 uygulandı");
    const e2 = await err(M("20271201000400_stone_library_f6_layers.sql"));
    ok(!!e2 && /zaten uygulanmış/.test(e2), "0400 ikinci kez uygulanamaz", e2);

    console.log("\n[2. ROLLBACK_0400]");
    const owner = randomUUID();
    await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level) values ($1,'ZZ RB OWNER','zz.rb@example.test','admin',true,'approved',true,'owner')`, [owner]);
    await su.query(`select public.stone_library_owner_stone_create($1, '{"name_tr":"ZZ Geri Alma Taşı"}'::jsonb, '[]'::jsonb, false, null)`, [owner]);
    const e3 = await err(read("scripts/stone-library/sql/ROLLBACK_20271201000400.sql"));
    ok(!!e3 && /dışa aktarın/.test(e3) && Number(await one(`select count(*) from public.stone_library_owner_versions`)) === 1, "owner verisi varken geri alma DURUR, veri silinmez", e3);
    // Owner verisi boşaltılamaz (yalnız eklenir) → temiz kurulumda geri alma: yeni ortamda dene.
    console.log("\n[3. Temiz kurulumda geri alma + yeniden uygulama]");
    const env2 = await startAnamnezTestEnv({ port: Number(process.env.STONE_LIBRARY_F6RB_PG_PORT ?? 54598) + 1, dirName: `stone-library-f6rb2-${Date.now()}-${randomUUID().slice(0, 8)}`,
      rpcAllow: [], extraSql: [...base, "20271201000300_stone_library_f6_raw_guard.sql", "20271201000400_stone_library_f6_layers.sql"].map(M) });
    const s2 = env2.su;
    const err2 = async (sql: string) => { try { await s2.query(sql); return null; } catch (e) { await s2.query("rollback").catch(() => undefined); return String((e as Error).message); } };
    const one2 = async (sql: string) => Object.values((await s2.query(sql)).rows[0] ?? {})[0];
    try {
      ok(await err2(read("scripts/stone-library/sql/ROLLBACK_20271201000400.sql")) === null, "ROLLBACK_0400 boş katmanda çalıştı");
      ok(await one2(`select count(*)::int from pg_proc where proname in ('stone_library_refresh_stone_f3','stone_library_readiness_f3','stone_library_expert_image_f3','stone_library_owner_version_save')`) === 0
        && await one2(`select count(*)::int from pg_proc where proname in ('stone_library_refresh_stone','stone_library_readiness','stone_library_expert_image')`) === 3,
        "F3 gövdeleri özgün adlarına döndü, F6-B RPC'leri kaldırıldı");
      ok(await one2(`select count(*)::int from pg_class where relname in ('stone_library_translations','stone_library_owner_versions','stone_library_owner_notes','stone_library_owner_images','stone_library_bulk_tokens')`) === 0
        && await one2(`select count(*)::int from information_schema.columns where table_name='stone_library_stones' and column_name in ('origin','owner_version_current','image_choice','primary_owner_image_id')`) === 0,
        "F6-B tabloları ve taş kolonları kaldırıldı");
      ok(Boolean(await one2(`select has_function_privilege('service_role', 'public.stone_library_expert_image(uuid,text,text)', 'EXECUTE')`)), "uzman görsel RPC'si service_role'de kaldı");
      ok(await err2(M("20271201000400_stone_library_f6_layers.sql")) === null, "geri almadan sonra 0400 yeniden uygulanabilir");
      ok(await err2(read("scripts/stone-library/sql/ROLLBACK_20271201000400.sql")) === null, "ikinci geri alma da temiz");
      console.log("\n[4. ROLLBACK_0300]");
      ok(await err2(read("scripts/stone-library/sql/ROLLBACK_20271201000300.sql")) === null, "ROLLBACK_0300 çalıştı");
      ok(Boolean(await one2(`select has_function_privilege('service_role', 'public.stone_library_raw_put(uuid,uuid,text,text,text,integer,jsonb)', 'EXECUTE')`))
        && await one2(`select count(*)::int from pg_trigger where tgname like '%raw_insert_guard%'`) === 0 && await one2(`select count(*)::int from pg_class where relname='stone_library_call_reservations'`) === 0,
        "raw_put F2 hâline döndü (service_role), ekleme kilidi + boş rezervasyon tablosu kaldırıldı");
      ok(await err2(M("20271201000300_stone_library_f6_raw_guard.sql")) === null && !(await (async () => Boolean(await one2(`select has_function_privilege('service_role', 'public.stone_library_raw_put(uuid,uuid,text,text,text,integer,jsonb)', 'EXECUTE')`)))()),
        "0300 yeniden uygulanabilir ve raw_put yine service_role'e kapalı");
    } finally {
      await env2.stop().catch(() => undefined);
    }
    void svcHas;
  } finally {
    await env.stop().catch(() => undefined);
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(" - " + fails.join("\n - ")); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
