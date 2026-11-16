/**
 * ÜYE YÖNETİMİ FAZ 2 — ortak ephemeral test veritabanı (embedded-postgres, 127.0.0.1).
 * Production'a SIFIR temas; tüm kullanıcılar sentetik (ZZ_MEMBER_PHASE2_*).
 *
 * Şema: sentetik users/tenants/user_sessions/... + GERÇEK repo migration zinciri:
 *   20260903 admin_audit_log → 20260910 provisioning (provision_expert) → 20261221 yh_grade →
 *   20270107 Aşama 1 RPC'leri → 20270129 FAZ 1 → 20270130 FAZ 2 → 20270129000200 oturum touch RPC →
 *   20271001000300 M4 (üye ticari takip) → 360° zinciri (Usage360 + 20271006000000).
 * Yaşam Hafızası için yalnız test-stub: yasam_hafizasi_index (minimal) + yh_search_candidates
 * (tsquery'yi yok sayar; tenant satırlarını döner) — gerçek route kapsam mantığını sınamak için.
 */
import type { ChildProcess } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, writeSync } from "node:fs";
import path from "node:path";
import { applyMember360Chain } from "../uye-yonetimi-360/migrationChain";
import {
  createRunDir, killOwnChildSync, killStampedSync, ownChildAlive, ownChildStampsSync, pgCtlStopSync, removeOwnRunDir,
  sameDataDir,
} from "./testDbRun";

process.env.LC_ALL = "C";
process.env.LANG = "C";

const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

export const BASE_DDL = `
create table public.tenants (
  id uuid primary key, name text, slug text, status text, created_at timestamptz default now(),
  constraint tenants_slug_key unique (slug)
);
create table public.users (
  id uuid primary key,
  full_name text, name text, email text, password_hash text, role text,
  active boolean default false,
  approval_status text default 'pending',
  approved_at timestamptz,
  module_permissions jsonb default '{}'::jsonb,
  package_type text default 'trial', membership_status text default 'trial', subscription_status text default 'trial',
  trial_started_at timestamptz, trial_ends_at timestamptz,
  membership_started_at timestamptz, membership_ends_at timestamptz,
  plan text default 'trial', admin_level text, tenant_id uuid references public.tenants(id), status text,
  created_at timestamptz default now(),
  is_super_admin boolean not null default false,
  is_demo_account boolean not null default false,
  -- TRIAL7 (20280101000000, canlıda): 7 günlük deneme rejimi; mevcut hesaplarda NULL.
  trial_kind text, trial_status text,
  payment_status text, last_payment_date date, next_payment_date date, paid_amount numeric, payment_note text,
  license_type text default 'single', allowed_active_sessions int default -1, allowed_locations int default 1,
  security_mode text default 'normal', security_exempt boolean default false, license_note text,
  allowed_desktop_sessions int default -1, allowed_mobile_sessions int default -1,
  allowed_tablet_sessions int default -1, allowed_unknown_sessions int default -1,
  constraint users_email_key unique (email)
);
create unique index users_email_normalized_uidx on public.users (lower(btrim(email)));
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  session_token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz, end_reason text,
  platform text default 'desktop', city text, country text, ip_address text, user_agent text
);
-- Production (Frankfurt) ile birebir — 4b düzeltmesi (20280101000690) ÖNCESİ (14.11.2026 salt-okunur katalog):
-- payment_date NOT NULL DEFAULT CURRENT_DATE; düzeltme migration'ı zincirde uygulanır.
create table public.user_payment_history (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
  payment_status text default 'paid', payment_date date not null default current_date, next_payment_date date,
  paid_amount numeric default 0, payment_note text, created_at timestamptz default now()
);
create table public.yasam_hafizasi_flags (
  tenant_id uuid primary key, yh_enabled boolean default false, yh_hizli boolean default false,
  yh_derin boolean default false, yh_semantic boolean default false, yh_client_pii boolean default false,
  yh_shared boolean default false
);
create table public.security_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id),
  event_type text not null, severity text not null, message text, ip_address text, country text, city text,
  user_agent text, metadata jsonb, created_at timestamptz not null default now(),
  reviewed_by_admin boolean not null default false
);
create table public.support_messages (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id),
  tenant_id uuid not null, subject text not null, message text not null, priority text not null default 'normal',
  status text not null default 'open', admin_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Prod bulgusunu simüle et: anon/authenticated'a gereksiz tablo grant'i (MEM-021 öncesi).
grant select, insert, update, delete on public.security_events, public.support_messages to anon, authenticated;
alter table public.security_events enable row level security;
alter table public.support_messages enable row level security;

-- Yaşam Hafızası test-stub (gerçek arama RPC'sinin DÖNÜŞ şekli; sıralama/tsquery yok).
create table public.yasam_hafizasi_index (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, source_module text not null,
  source_table text not null, source_id uuid not null default gen_random_uuid(), unit_type text not null default 'record',
  section_ref text, group_key text, title text, snippet text, evidence_fields jsonb default '[]'::jsonb,
  topic_tags text[] default '{}', expert_relations jsonb default '[]'::jsonb, is_client_pii boolean default false,
  source_updated_at timestamptz default now()
);
create function public.yh_search_candidates(p_tsquery text, p_session_tenant uuid, p_allow_shared boolean, p_weights float4[], p_limit integer)
returns table (id uuid, tenant_id uuid, source_module text, source_table text, source_id uuid, unit_type text,
  section_ref text, group_key text, title text, snippet text, evidence_fields jsonb, topic_tags text[],
  expert_relations jsonb, is_client_pii boolean, source_updated_at timestamptz, rank real)
language sql stable as $$
  select i.id, i.tenant_id, i.source_module, i.source_table, i.source_id, i.unit_type, i.section_ref, i.group_key,
         i.title, i.snippet, i.evidence_fields, i.topic_tags, i.expert_relations, i.is_client_pii, i.source_updated_at,
         0.5::real
    from public.yasam_hafizasi_index i where i.tenant_id = p_session_tenant
   order by i.title limit p_limit
$$;

-- Danışan + teslim snapshot'ları (gerçek DDL: 20260923000000_yasam_hafizasi_client_memory_core,
-- yasam_hafizasi_report_snapshots birebir kolon/CHECK + UPDATE-engel trigger'ı).
create table public.clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, full_name text);
create table public.yasam_hafizasi_report_snapshots (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid not null,
  target_kind text not null, target_ref uuid, selection_group uuid not null, source_module text not null,
  source_table text not null, source_id uuid not null, section_ref text, unit_type text not null default 'record',
  title text, selected_text text, evidence jsonb not null default '[]'::jsonb, provenance jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz, content_hash text not null, ordering integer not null default 0, expert_note text,
  selected_by uuid not null, source_available_at_snapshot boolean not null default true,
  created_at timestamptz not null default now(),
  constraint yhrs_target_kind_chk check (target_kind in ('report', 'protocol', 'guide'))
);
create function public.yh_report_snapshot_prevent_update() returns trigger language plpgsql as $$
begin raise exception 'yasam_hafizasi_report_snapshots immutable: UPDATE engellendi' using errcode = 'check_violation'; end; $$;
create trigger trg_yhrs_no_update before update on public.yasam_hafizasi_report_snapshots
  for each row execute function public.yh_report_snapshot_prevent_update();

-- Doğaltaş görünürlük savunması (retrieval stone-exclusion portu) için minimal tablo.
create table public.stone_exclusions (tenant_id uuid not null, stone_id uuid not null, primary key (tenant_id, stone_id));

-- Test-stub'lar: bcrypt yerine deterministik (yalnız test).
create function public.hash_password(p_plain text) returns text language sql immutable as $$ select 'zz-test-hash:' || md5(p_plain) $$;
create function public.verify_admin_login(p_email text, p_password text) returns boolean
  language sql security definer set search_path = public as
  $$ select p_password = 'zz-owner-pass' and exists (select 1 from public.users where lower(email) = lower(p_email) and role = 'admin') $$;
`;

export type TestDb = {
  su: pg.Client;
  pool: pg.Pool;
  stop: () => Promise<void>;
  /** Bu koşuya özgü dizin (`<tmpdir>/<dirName>-<rastgele>`) ve içindeki veri dizini. */
  runDir: string;
  dataDir: string;
};

/**
 * Ephemeral test DB. YALITIM (testDbRun.ts): her koşu kendine özgü dizin açar — `dirName` yalnız önektir; önceden
 * var olan hiçbir klasör SİLİNMEZ. Bağlanılan sunucu bu koşunun veri dizinini kullanmıyorsa (port başka bir
 * koşuda) hiçbir DDL çalıştırılmadan hata verilir. stop() ve süreç çıkışı yalnız KENDİ canlı postmaster'ımızı ve
 * onun PID + oluşturulma zamanıyla doğrulanan çocuklarını kapatır; yalnız sahiplik işareti eşleşen kendi dizinimizi siler.
 */
export async function startTestDb(port: number, dirName: string): Promise<TestDb> {
  const run = createRunDir(dirName, port);
  const epg = new EmbeddedPostgres({
    databaseDir: run.dataDir, user: "postgres", password: "testpw", port, persistent: false,
    initdbFlags: ["--locale=C", "--encoding=UTF8"],
  });
  const child = () => (epg as unknown as { process?: ChildProcess }).process;
  let su: pg.Client | null = null;
  let pool: pg.Pool | null = null;
  let stopped = false;
  // Beklenmeyen çıkış (yakalanmamış hata / process.exit): yalnız kendi canlı postmaster'ımız + kendi dizinimiz.
  const exitHook = () => {
    if (stopped) return;
    const c = child();
    const kanca: Record<string, unknown> = {
      sira: process.listeners("exit").indexOf(exitHook),
      cocukCanli: ownChildAlive(c),
      cocuk: { killed: c?.killed ?? null, exitCode: c?.exitCode ?? null, signalCode: c?.signalCode ?? null },
    };
    const stamps = ownChildStampsSync(c);
    // Önce postgres'in kendi kapanışı; olmazsa kendi canlı postmaster ağacımız. (pg_ctl başarılıysa postmaster
    // bitmiştir → PID'e ayrıca sinyal gönderilmez.)
    kanca.pgCtl = pgCtlStopSync(c, run.dataDir);
    if (!kanca.pgCtl) kanca.kill = killOwnChildSync(c);
    killStampedSync(stamps);
    try {
      const r = removeOwnRunDir(run);
      kanca.dizin = r.removed ? "silindi" : r.reason;
    } catch (e) {
      kanca.dizin = `hata: ${String((e as Error)?.message ?? e)}`; // son çare; başka hiçbir şeye dokunulmaz
    }
    // Postmaster bu kancada kapatıldı (ya da zaten bitmişti): kütüphanenin sonradan çalışan exit kancası artık bu
    // PID'e taskkill / SIGINT göndermesin ve silinmiş dizini yeniden silmeye çalışmasın.
    (epg as unknown as { process?: ChildProcess }).process = undefined;
    // Sessiz yutma yok: kancanın kararı stderr'e (çıkış anında eşzamanlı yazım).
    try { writeSync(2, `TESTDB CIKIS KANCASI ${JSON.stringify(kanca)}\n`); } catch { /* stderr kapalı */ }
  };
  // ÖNE eklenir: embedded-postgres modül yüklenirken (async-exit-hook) kendi `exit` dinleyicisini kaydeder ve orada
  // postmaster'a eşzamansız SIGINT (Linux; `child.killed` = true olur) ya da taskkill (Windows) gönderir. Bizim kanca
  // ondan sonra çalışırsa postmaster'ı kapanış ortasında bulur: pg_ctl atlanır / başarısız olur ve dizin silme
  // postgres'in kapanış yazımlarıyla yarışır (Linux'ta koşu dizini kalıyordu). Önce bizim eşzamanlı kapanışımız.
  process.prependListener("exit", exitHook);
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    process.off("exit", exitHook);
    await pool?.end().catch(() => undefined);
    await su?.end().catch(() => undefined);
    if (ownChildAlive(child())) {
      // Windows: postmaster'ın çocukları (io_worker…) dinleme soketini miras alır ve yetim kalabilir → önce PID +
      // oluşturulma zamanıyla kaydedilir; kapanış postgres'in kendi yoluyla (pg_ctl -m fast) yapılır, gerekmedikçe
      // taskkill'e başvurulmaz; en sonda yalnız kayıtla birebir eşleşen kalan çocuklar sonlandırılır.
      const stamps = ownChildStampsSync(child());
      pgCtlStopSync(child(), run.dataDir);
      for (let i = 0; i < 50 && ownChildAlive(child()); i++) await new Promise((r) => setTimeout(r, 100));
      if (ownChildAlive(child())) await epg.stop().catch(() => undefined);
      else (epg as unknown as { process?: ChildProcess }).process = undefined;
      killStampedSync(stamps);
    } else {
      // Postmaster zaten bitmiş: PID başka bir sürece verilmiş olabilir → taskkill / sinyal GÖNDERİLMEZ.
      (epg as unknown as { process?: ChildProcess }).process = undefined;
    }
    removeOwnRunDir(run);
  };

  try {
    await epg.initialise();
    await epg.start();
    su = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password: "testpw", database: "postgres" });
    await su.connect();
    const dd = String((await su.query(`select current_setting('data_directory') d`)).rows[0].d);
    if (!sameDataDir(dd, run.dataDir)) {
      throw new Error(`test DB sahiplik hatası: ${port} portundaki sunucu bu koşunun değil (${dd}); DDL çalıştırılmadı`);
    }
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
                  grant usage on schema public to anon, authenticated, service_role;`);
    await su.query(BASE_DDL);
    for (const f of [
      "20260903000000_admin_audit_log.sql",
      "20260910000000_provisioning_integrity.sql",
      "20261221000000_yh_grade_expert_premium_rpc.sql",
      "20270107000000_admin_membership_atomic_rpcs.sql",
      "20270129235900_admin_member_phase1_hardening.sql",
      "20270130000000_admin_member_phase2.sql",
      // Oturum süresi RPC'si — süre zorlaması varsayılan AÇIK (P1-3); guard'lar touch_active_session kullanır.
      "20270129000200_user_sessions_expiry_touch.sql",
      // AŞAMA 2 · M4 — agreed_fee/billing_period + admin_list_users(p_due, p_sort).
      "20271001000300_admin_member_commercial.sql",
    ]) {
      await su.query(readMig(f));
    }
    // ÜYE YÖNETİMİ 360° — Usage360 rollup + audit v2 + 20271006000000 (liste RPC 15 arg, fiyat dönemleri).
    await applyMember360Chain(su);
    // AŞAMA 4b — ödeme geçmişinde tarih isteğe bağlı (prod NOT NULL düzeltmesi) + ödeme kaydı tek işlem
    // (ödeme route'u bu RPC'yi kullanır; 4a / TRIAL7'ye bağımlı değil).
    await su.query(readMig("20280101000690_user_payment_history_payment_date_optional_4b.sql"));
    await su.query(readMig("20280101000700_admin_payment_atomic_4b.sql"));
    await su.query(`grant select, insert, update on public.users, public.tenants, public.user_sessions, public.user_payment_history,
                    public.yasam_hafizasi_flags, public.yasam_hafizasi_index, public.stone_exclusions,
                    public.clients to service_role;
                  grant select, insert, delete on public.yasam_hafizasi_report_snapshots to service_role;
                  grant execute on function public.verify_admin_login(text,text), public.hash_password(text),
                    public.yh_search_candidates(text,uuid,boolean,float4[],integer) to service_role;`);
    pool = new pg.Pool({ host: "127.0.0.1", port, user: "postgres", password: "testpw", database: "postgres", max: 24 });
  } catch (e) {
    await stop();
    throw e;
  }
  return { su, pool, stop, runDir: run.runDir, dataDir: run.dataDir };
}
