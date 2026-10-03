/**
 * DD-P2 Beslenme — test ortamı (yalnız 127.0.0.1; PRODUCTION'A SIFIR TEMAS).
 *
 * MEVCUT altyapı yeniden kullanılır: scripts/anamnez/testEnv.ts (embedded-postgres + sentetik
 * users/user_sessions/clients + GERÇEK touch_active_session + seedAnamnez kullanıcı/oturumları).
 * Anamnez ortamının asgari nutrition_* tabloları düşürülür ve GERÇEK repo nutrition migration
 * zinciri (supabase/migrations/*_nutrition_*.sql, sıralı) uygulanır. İstenirse yeni
 * 20271003100100 migration'ı DIŞARIDA bırakılır ("migration henüz uygulanmamış DB" senaryosu).
 *
 * Route'lar embed (`nutrient:nutrition_nutrients(code)`) ve skaler RPC destekli shim'e
 * (pgrestEmbedShim.ts) yönlendirilir; anamnez shim'i bu iki özelliği desteklemez.
 */
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { startAnamnezTestEnv, SERVICE_KEY, ANON_KEY, type TestEnv } from "../../anamnez/testEnv";

export const NEW_MIGRATION = "20271003100100_nutrition_plan_delete_challenge.sql";
const MIG_DIR = path.join(process.cwd(), "supabase", "migrations");
export const readMig = (f: string) => readFileSync(path.join(MIG_DIR, f), "utf8");
export const nutritionMigrations = () => readdirSync(MIG_DIR).filter((f) => /_nutrition_.*\.sql$/.test(f)).sort();

const PRE_SQL = `
drop table if exists public.nutrition_client_allergens, public.nutrition_client_measurements,
  public.nutrition_client_profiles, public.nutrition_allergens cascade;
alter table public.clients add constraint zz_clients_tenant_id_id_key unique (tenant_id, id);
create or replace function public.set_updated_at() returns trigger language plpgsql as $f$
  begin new.updated_at = now(); return new; end; $f$;
-- unaccent sözlüğü gerekmez: arama semantiği bu harness'in konusu değil (pgBootstrap ile aynı stub).
create or replace function public.yh_immutable_unaccent(text) returns text
  language sql immutable parallel safe as $f$ select $1 $f$;
`;

export type BesUser = { id: string; token: string };
export type BesSeed = {
  TA: string;
  TB: string;
  users: Record<"A" | "A2" | "B" | "DEMO" | "NOMOD", BesUser>;
  clients: { a1: string; a2: string; b1: string };
};

/**
 * Sentetik kullanıcı/oturum/danışan tohumu — seedAnamnez ile AYNI kolon şekli (guard zinciri
 * birebir), ancak anamnez'in asgari nutrition_* satırlarını EKLEMEZ (gerçek nutrition şemasında
 * 'peanut' alerjeni sınıf-A seed'inde zaten var → unique çakışma).
 */
async function seedBes(su: pg.Client): Promise<BesSeed> {
  const TA = randomUUID();
  const TB = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_DDP2_BES_A'),($2,'ZZ_DDP2_BES_B')`, [TA, TB]);
  const mk = async (label: string, o: { tenant: string; perms: Record<string, boolean>; demo?: boolean }): Promise<BesUser> => {
    const id = randomUUID();
    const token = `zz-ddp2-bes-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
       values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium',$5,$6)`,
      [id, `ZZ_DDP2_${label}`, `zz.ddp2.${label.toLowerCase()}@example.test`, JSON.stringify(o.perms), o.tenant, o.demo === true],
    );
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
    return { id, token };
  };
  const full = { clients: true, beslenme: true };
  const users = {
    A: await mk("A", { tenant: TA, perms: full }),
    A2: await mk("A2", { tenant: TA, perms: full }),
    B: await mk("B", { tenant: TB, perms: full }),
    DEMO: await mk("DEMO", { tenant: TA, perms: full, demo: true }),
    NOMOD: await mk("NOMOD", { tenant: TA, perms: { clients: false, beslenme: false } }),
  };
  const a1 = randomUUID();
  const a2 = randomUUID();
  const b1 = randomUUID();
  await su.query(
    `insert into public.clients(id, tenant_id, ad, soyad) values ($1,$4,'ZZ Ayşe','YILMAZ'),($2,$4,'ZZ Mehmet','KAYA'),($3,$5,'ZZ Bora','DEMİR')`,
    [a1, a2, b1, TA, TB],
  );
  return { TA, TB, users, clients: { a1, a2, b1 } };
}

export type BesDb = {
  env: TestEnv;
  seed: BesSeed;
  pool: pg.Pool;
  applied: string[];
  stop: () => Promise<void>;
};

export async function startBesDb(opts: { port: number; dirName: string; includeNewMigration: boolean }): Promise<BesDb> {
  const migs = nutritionMigrations().filter((f) => opts.includeNewMigration || f !== NEW_MIGRATION);
  const env = await startAnamnezTestEnv({
    port: opts.port,
    dirName: opts.dirName,
    extraSql: [PRE_SQL, ...migs.map(readMig)],
  });
  const seed = await seedBes(env.su);
  const pool = new pg.Pool({ host: "127.0.0.1", port: opts.port, user: "postgres", password: "testpw", database: "postgres", max: 16 });
  return {
    env,
    seed,
    pool,
    applied: migs,
    stop: async () => {
      await pool.end().catch(() => undefined);
      await env.stop();
    },
  };
}

/** Route'ların service-role client'ını shim'e yönlendir (getServerDb ilk çağrıda okur). */
export function pointRoutesTo(url: string): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
}
