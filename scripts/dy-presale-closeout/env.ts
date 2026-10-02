/**
 * DY SATIŞ ÖNCESİ KAPANIŞ — test ortamı (yalnız 127.0.0.1; PRODUCTION'A SIFIR TEMAS).
 *
 * Anamnez test ortamını (embedded-postgres + PostgREST shim + Storage emülatörü) DY tablolarıyla
 * genişletir: appointments + CDC'li 5 danışan tablosu + GERÇEK YH outbox migration zinciri
 * (20260927000000 → 20261218000200 → 20261220000000). DY-02 (Genel randevu) ve DY-01 (notlar RPC)
 * migration'ları harness içinde ayrıca uygulanır → düzeltme ÖNCESİ/SONRASI aynı DB'de karşılaştırılır.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { startAnamnezTestEnv, seedAnamnez, type Seed, type TestEnv } from "../anamnez/testEnv";

export const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

export const MIG_GENERAL_APPT = "20271001000100_yh_client_outbox_appointments_null_client.sql";
export const MIG_NOTES_RPC = "20271002000000_client_notes_cas_update_rpc.sql";
export const MIG_ALLERGEN_RPC = "20270129000600_nutrition_replace_client_allergens.sql";

const DY_DDL = `
create table public.appointments (
  id uuid primary key default gen_random_uuid(), tenant_id uuid,
  client_id uuid references public.clients(id) on delete cascade, user_id uuid,
  title text, appointment_date timestamptz, notes text, created_at timestamptz default now(), status text
);
create table public.client_sessions (id uuid primary key default gen_random_uuid(), tenant_id uuid,
  client_id uuid references public.clients(id) on delete cascade, session_date text, session_type text,
  session_note text, created_at timestamptz default now());
create table public.client_homeworks (id uuid primary key default gen_random_uuid(), tenant_id uuid,
  client_id uuid references public.clients(id) on delete cascade, title text, status text, end_date text,
  alert_dismissed_at timestamptz, created_at timestamptz default now());
create table public.client_stones (id uuid primary key default gen_random_uuid(), tenant_id uuid,
  client_id uuid references public.clients(id) on delete cascade, stone_name text, created_at timestamptz default now());
create table public.client_combinations (id uuid primary key default gen_random_uuid(), tenant_id uuid,
  client_id uuid references public.clients(id) on delete cascade, name text, created_at timestamptz default now());
create table public.nutrition_client_food_preferences (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade, stance text, food_id uuid, food_label text,
  note text, created_at timestamptz not null default now());
create table public.nutrition_plan_clients (tenant_id uuid not null, plan_family_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade, assigned_at timestamptz default now(),
  primary key (tenant_id, plan_family_id));
grant select, insert, update, delete on public.appointments, public.client_sessions, public.client_homeworks,
  public.client_stones, public.client_combinations, public.nutrition_client_food_preferences,
  public.nutrition_plan_clients to service_role;
`;

export async function startDyEnv(opts: { port: number; dirName: string; httpPort?: number }): Promise<{ env: TestEnv; seed: Seed }> {
  const env = await startAnamnezTestEnv({
    ...opts,
    rpcAllow: ["client_notes_cas_update", "nutrition_replace_client_allergens"],
    extraSql: [
      DY_DDL,
      readMig("20260927000000_yh_source_activation_control.sql"),
      readMig("20261218000200_yh_client_cdc_outbox.sql"),
      readMig("20261220000000_yh_client_outbox_activation_boundary.sql"),
      `grant select, insert, update, delete on public.yasam_hafizasi_client_outbox to service_role;
       grant usage, select on sequence public.yasam_hafizasi_client_outbox_event_version_seq to service_role;`,
    ],
  });
  const seed = await seedAnamnez(env.su);
  return { env, seed };
}
