/**
 * WT7 — Danışan Yolculuğu GERÇEK route + GERÇEK Postgres test ortamı (yalnız 127.0.0.1; PROD'A SIFIR TEMAS).
 *
 *  - bioTestEnv (embedded-postgres + PostgREST shim + gerçek touch_active_session) yeniden kullanılır.
 *  - DY tabloları prod kolonlarının alt kümesiyle kurulur; client_charges GERÇEK repo migration'ı ile,
 *    ardından WT7 ödeme durumu migration'ı uygulanır (önce eski satır eklenip NULL kaldığı doğrulanabilsin
 *    diye ayrı adım: applyPaymentMigration).
 *  - DATE kolonları PostgREST gibi 'YYYY-MM-DD' METİN döner.
 */
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readMig, startBioTestEnv, type BioTestEnv } from "../bioenergy-presale-final/bioTestEnv";

pg.types.setTypeParser(1082, (v: string) => v);

export { SERVICE_KEY, ANON_KEY } from "../bioenergy-presale-final/bioTestEnv";

export const PAYMENT_MIGRATION = "20271011000000_client_charges_payment_status.sql";

const DY_DDL = `
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid,
  ad text, soyad text, telefon text, dogum text, gorusme text, burc text, kan text, mizac text,
  created_at timestamptz not null default now(), updated_at timestamptz default now()
);
create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  saglik_notu text, adres text, oneriler text, notlar text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid references public.clients(id) on delete cascade,
  title text, notes text, appointment_date timestamptz, status text, created_at timestamptz default now()
);
create table if not exists public.client_stones (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  stone_name text, stone_type text, stone_date date, created_at timestamptz default now()
);
create table if not exists public.client_sessions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  session_date date, session_type text, duration_minutes int, fee numeric, session_note text, created_at timestamptz default now()
);
create table if not exists public.client_homeworks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  title text, homework_type text, description text, start_date date, end_date date, status text,
  expert_note text, client_feedback text, alert_dismissed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.client_analyses (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null references public.clients(id) on delete cascade,
  analysis_type text, analysis_data jsonb, note text, image_url text, created_at timestamptz default now()
);
`;

export async function startDyTestEnv(opts: { port: number; dirName: string; withPaymentMigration?: boolean }): Promise<BioTestEnv> {
  const env = await startBioTestEnv({ port: opts.port, dirName: opts.dirName, maxRows: 1000, maxUrlBytes: 16384 });
  await env.su.query(DY_DDL);
  await env.su.query(readMig("20260924062228_client_charges.sql"));
  if (opts.withPaymentMigration !== false) await applyPaymentMigration(env.su);
  await env.su.query(`grant select, insert, update, delete on all tables in schema public to service_role;
                      grant usage, select on all sequences in schema public to service_role;
                      grant execute on all functions in schema public to service_role;`);
  return env;
}

export async function applyPaymentMigration(su: pg.Client): Promise<void> {
  await su.query(readMig(PAYMENT_MIGRATION));
}

export type DyUser = { id: string; token: string; tenant: string };

export async function seedDyUser(su: pg.Client, label: string, opts: { demo?: boolean } = {}): Promise<DyUser> {
  const tenant = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,$2) on conflict do nothing`, [tenant, `ZZ_WT7_TENANT_${label}`]);
  const id = randomUUID();
  const token = `zz-wt7-tok-${label.toLowerCase()}-${id.slice(0, 8)}`;
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, membership_status, tenant_id, is_demo_account)
     values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium','active',$5,$6)`,
    [id, `ZZ_WT7_${label}`, `zz.wt7.${label.toLowerCase()}@example.test`, JSON.stringify({ clients: true }), tenant, opts.demo === true],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
  return { id, token, tenant };
}

/** Bir danışanı tekli raporun TÜM bölümleriyle (sentetik ZZ_) doldurur; id döner. */
export async function seedRichClient(
  su: pg.Client,
  tenant: string,
  i: number,
  opts: { analyses?: number; withImages?: boolean; createdAt?: string; charges?: ("paid" | "unpaid" | null)[] } = {},
): Promise<string> {
  const createdAt = opts.createdAt ?? new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
  const long = `Danışan ${i} uzun sağlık notu — çğıöşü ÇĞİÖŞÜ "tırnak" & <açı>. `.repeat(30) + `SON_${i}_KESILMEDI`;
  const c = await su.query(
    `insert into public.clients(tenant_id, ad, soyad, telefon, dogum, gorusme, burc, kan, mizac, created_at)
     values ($1,$2,$3,$4,'1990-03-15','27.09.2026','Balık','A Rh+','sovdavi',$5) returning id`,
    [tenant, `ZZ_Ayşe${i}`, `Çiğdem-Işık${i}`, `0555 ${String(i).padStart(7, "0")}`, createdAt],
  );
  const id = c.rows[0].id as string;
  await su.query(`insert into public.client_notes(tenant_id, client_id, saglik_notu, adres, oneriler) values ($1,$2,$3,$4,$5)`,
    [tenant, id, long, `İzmir ${i}`, `Öneri ${i}`]);
  await su.query(`insert into public.appointments(tenant_id, client_id, title, notes, appointment_date, status) values
    ($1,$2,$3,'Not ğüş','2026-09-27T07:00:00Z','bekliyor'), ($1,$2,$4,null,'2026-09-26T22:30:00Z','tamamlandi')`,
    [tenant, id, `ZZ randevu ${i}`, `ZZ gece ${i}`]);
  await su.query(`insert into public.client_stones(tenant_id, client_id, stone_name, stone_type, stone_date) values ($1,$2,'iolit','Taşıma','2026-09-27')`, [tenant, id]);
  await su.query(`insert into public.client_sessions(tenant_id, client_id, session_date, session_type, duration_minutes) values ($1,$2,'2026-09-27',$3,45)`, [tenant, id, `Enerji Seansı ${i}`]);
  await su.query(`insert into public.client_homeworks(tenant_id, client_id, title, homework_type, description, start_date, end_date, status, expert_note, client_feedback)
    values ($1,$2,$3,'Günlük',$4,'2026-09-27','2026-10-04','devam',$5,'İyi geldi.')`,
    [tenant, id, `Nefes ${i}`, `Ödev açıklaması ${i} SON_ODEV_${i}`, `GIZLI_UZMAN_NOTU_${i}`]);
  for (let a = 0; a < (opts.analyses ?? 1); a++) {
    await su.query(`insert into public.client_analyses(tenant_id, client_id, analysis_type, note, image_url) values ($1,$2,'chakra',$3,$4)`,
      [tenant, id, `Analiz ${i}.${a}`, opts.withImages ? `${tenant}/${id}/x.png` : null]);
  }
  const charges = opts.charges ?? ["paid", "unpaid"];
  for (let k = 0; k < charges.length; k++) {
    await su.query(`insert into public.client_charges(tenant_id, client_id, charge_date, category, detail, amount${charges[k] === undefined ? "" : ", payment_status"})
      values ($1,$2,'2026-09-27','other',$3,$4${charges[k] === undefined ? "" : ",$5"})`,
      [tenant, id, `Ürün ${i}.${k}`, 100 + k, ...(charges[k] === undefined ? [] : [charges[k]])]);
  }
  return id;
}
