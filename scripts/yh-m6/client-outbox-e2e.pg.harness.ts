/**
 * M6 — Danışan Yaşam Hafızası: webhook tetikleyicisi UÇTAN UCA (izole embedded-postgres; PRODUCTION'A SIFIR TEMAS).
 *
 *   npx tsx scripts/yh-m6/client-outbox-e2e.pg.harness.ts
 *
 * Gerçek YH migration zinciri (+ 20271010 bildirim fonksiyonu + 20271231000100 M6 tetikleyicisi) üzerinde:
 *   kaynak yazımı → CDC outbox (gerçek) → [M6] yh_client_outbox_webhook → yh_outbox_webhook_notify() (gerçek)
 *   → net.http_post (sahte; yalnız kaydeder, ağ YOK) → decideWebhookAction (route'un gerçek kararı)
 *   → worker koşusu = runClientOutboxBatch (gerçek işleyici + gerçek claim/complete RPC'leri + gerçek indeks yazıcı)
 *   → yasam_hafizasi_client_index → yh_search_client_candidates_v2 (gerçek arama).
 *
 * Kanıtlanan: (1) ANLIK indeksleme — olay yolu tek worker koşusuyla, cron beklemeden aranabilir;
 * (2) 15 dk SAFETY CRON kurtarması — pg_net hatası / kaybolan olay sonrası satır pending kalır, cron koşusu indeksler;
 * (3) döngü yok — worker geçişleri route'ta noop; (4) tekrar koşu idempotent; (5) danışan/tenant izolasyonu;
 * (6) tetikleyici yokken (canlıdaki durum) çağrı yok → yalnız cron; migration 2. kez uygulanınca tek tetikleyici.
 */
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) { return req === "server-only" ? stub : orig.call(this, req, ...rest); };
}

const PORT = Number(process.env.YH_M6_PG_PORT ?? 54766);
let pass = 0;
let fail = 0;
function ok(cond: unknown, msg: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}${detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 400)}`); }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const M = (f: string) => `supabase/migrations/${f}`;
const F = (f: string) => `scripts/yh-presale-final/fixtures/${f}`;
const M6 = M("20271231000100_yh_client_outbox_webhook_trigger.sql");
const CHAIN = [
  "20260710000000_yasam_hafizasi_index.sql", "20260712000000_yasam_hafizasi_lexical_infra.sql",
  "20260724000000_yh_search_candidates_rpc.sql", "20260815000000_yasam_hafizasi_outbox.sql",
  "20260825000000_yasam_hafizasi_dogaltas_outbox_trigger.sql", "20260901000000_yasam_hafizasi_reconcile_enqueue.sql",
  "20260923000000_yasam_hafizasi_client_memory_core.sql", "20260925000000_yh_deferred_sources_foundation.sql",
  "20260927000000_yh_source_activation_control.sql", "20261210000000_yh_worker_v2_shared_section_sources.sql",
].map(M).concat([F("mid-prod-activation.sql")]).concat([
  "20261212000000_yh_worker_v2_null_sentinel_fix.sql", "20261218000000_yh_client_index_private_reclassify.sql",
  "20261218000100_yh_search_tenant_client_candidates.sql", "20261218000200_yh_client_cdc_outbox.sql",
  "20261218000300_yh_client_outbox_state_machine.sql", "20261220000000_yh_client_outbox_activation_boundary.sql",
  "20271001000100_yh_client_outbox_appointments_null_client.sql", "20271004000000_yh_presale_final_infra.sql",
  "20271004000100_yh_beslenme_professional_cdc.sql", "20271004000200_yh_presale_final_activation.sql",
  "20271010000000_yh_outbox_webhook_vault_secret.sql",
].map(M)).concat([M6]);

const TA = "a6a6a6a6-0000-4000-8000-00000000000a";
const TB = "b6b6b6b6-0000-4000-8000-00000000000b";
const CA = "c6c6c6c6-0000-4000-8000-0000000000a1";
const CA2 = "c6c6c6c6-0000-4000-8000-0000000000a2";
const CB = "c6c6c6c6-0000-4000-8000-0000000000b1";
const SECRET = "zz-m6-e2e-yerel-test-secret-not-real";

async function main() {
  const { decideWebhookAction } = await import("../../lib/yasam-hafizasi/outbox/webhookBridge");
  const { YH_CLIENT_OUTBOX_ENQUEUED_EVENT } = await import("../../lib/inngest/events");
  const W = await import("../../lib/inngest/functions/yhClientOutboxWorker");
  const { YH_CLIENT_INDEX_SOURCES } = await import("../../lib/yasam-hafizasi/client/clientSources");
  const { createClientIndexAdapters, clientSourceSelectColumns } = await import("../../lib/yasam-hafizasi/client/clientIndexServerAdapters");
  const { runClientOutboxBatch } = await import("../../lib/yasam-hafizasi/client/clientEventProcessor");
  const RPC = await import("../../lib/yasam-hafizasi/outbox/clientOutboxRpcClient");
  const ST = await import("../../lib/yasam-hafizasi/outbox/outboxState");
  const { isSourceProcessingActive } = await import("../../lib/yasam-hafizasi/activation/activationRuntimeGate");
  const { buildRetrievalDescriptor } = await import("../../lib/yasam-hafizasi/search/queryPipeline");

  const dir = mkdtempSync(path.join(os.tmpdir(), "yh-m6-e2e-"));
  const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
  await server.initialise();
  await server.start();
  // PostgREST bigint'i JSON sayı olarak döndürür; pg sürücüsü metin döndürür → eşdeğerlik için sayıya çevir.
  pg.types.setTypeParser(20, (v: string) => Number(v));
  const db = new pg.Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "postgres" });
  await db.connect();
  db.on("notice", () => {});
  const q = (sql: string, args: unknown[] = []) => db.query(sql, args);
  try {
    // ── Kurulum: sahte Vault + pg_net (ağ YOK), temel şema + gerçek zincir ─────────────────────
    // pg-migration-check.mjs ile AYNI Supabase önyüklemesi (roller + extensions + storage).
    await q(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
      END $$;
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false,
        file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
      CREATE TABLE IF NOT EXISTS storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text,
        owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
    await q(`create schema vault; create table vault.decrypted_secrets(name text primary key, decrypted_secret text);
      create table vault.secrets(id uuid default gen_random_uuid(), name text);
      create function vault.create_secret(new_secret text, new_name text, new_description text default '') returns uuid
      language plpgsql as $v$ begin insert into vault.secrets(name) values (new_name);
        insert into vault.decrypted_secrets values (new_name, new_secret) on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;
        return gen_random_uuid(); end $v$;
      create schema net; create table net.calls(id bigserial primary key, url text, body jsonb, headers jsonb);
      create function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) returns bigint
      language plpgsql as $f$ begin
        if current_setting('m6.fail', true) = 'on' then raise exception 'pg_net kapalı (test)'; end if;
        insert into net.calls(url, body, headers) values (url, body, headers); return 1; end $f$;`);
    await q(read(F("base.sql")));
    // Kaynak kolonları (temel şema yalnız kimlik kolonlarını içerir): her danışan kaynağının OKUNAN kolonları.
    for (const cfg of YH_CLIENT_INDEX_SOURCES.filter((c) => c.enabled)) {
      for (const col of clientSourceSelectColumns(cfg)) {
        if ([cfg.primaryKey, cfg.tenantColumn, cfg.clientColumn].includes(col)) continue;
        const type = /_at$/.test(col) ? "timestamptz default now()" : "text";
        await q(`alter table public.${cfg.tableName} add column if not exists ${col} ${type}`);
      }
    }
    for (const f of CHAIN) await q(read(f));
    const clientKeys = YH_CLIENT_INDEX_SOURCES.filter((c) => c.enabled).map((c) => c.sourceKey);
    await q(`insert into public.yh_source_activation(source_key, is_active, backfill_allowed, note)
             select k, true, false, 'M6 e2e: canlıdaki gibi aktif' from unnest($1::text[]) k
             on conflict (source_key) do update set is_active = true`, [clientKeys]);
    const act = (await q(`select count(*)::int n from public.yh_source_activation where source_key = any($1) and is_active`, [clientKeys])).rows[0].n;
    ok(act === clientKeys.length, `danışan kaynakları aktif (canlıdaki gibi): ${act}/${clientKeys.length}`, { act, clientKeys });
    await q(`insert into public.tenants(id) values ($1),($2) on conflict do nothing`, [TA, TB]);
    await q(`insert into public.clients(id, tenant_id, ad, soyad) values ($1,$4,'ZZ','A'),($2,$4,'ZZ','A2'),($3,$5,'ZZ','B') on conflict do nothing`, [CA, CA2, CB, TA, TB]);
    await q(`insert into vault.decrypted_secrets values ('yh_outbox_webhook_secret',$1),('yh_outbox_webhook_url','http://127.0.0.1:9/api/internal/yh/outbox-webhook')
             on conflict (name) do update set decrypted_secret = excluded.decrypted_secret`, [SECRET]);

    const trig = async () => (await q(`select count(*)::int n from pg_trigger where tgrelid='public.yasam_hafizasi_client_outbox'::regclass and tgname='yh_client_outbox_webhook'`)).rows[0].n as number;
    ok((await trig()) === 1, "zincir sonunda M6 tetikleyicisi kurulu (tek)");

    // ── Worker bağımlılıkları: gerçek RPC'ler + gerçek indeks yazıcı, pg üzerinden (PostgREST eşdeğeri) ──
    const toJson = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]));
    const rpcDb = {
      async rpc(name: string, params?: Record<string, unknown>) {
        const keys = Object.keys(params ?? {});
        const vals = keys.map((k) => { const v = (params ?? {})[k]; return v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v; });
        const call = `public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
        try {
          const meta = (await q(`select p.proretset, t.typtype from pg_proc p join pg_type t on t.oid = p.prorettype where p.proname=$1 and p.pronamespace='public'::regnamespace limit 1`, [name])).rows[0];
          if (meta?.proretset) return { data: (await q(`select * from ${call}`, vals)).rows.map(toJson), error: null, status: 200 };
          if (meta?.typtype === "c") return { data: toJson((await q(`select * from ${call}`, vals)).rows[0] ?? {}), error: null, status: 200 };
          return { data: (await q(`select ${call} as v`, vals)).rows[0]?.v ?? null, error: null, status: 200 };
        } catch (e) { const err = e as { message: string; code?: string }; return { data: null, error: { message: err.message, code: err.code }, status: 400 }; }
      },
    };
    const indexDb = {
      select(table: string, columns: string) {
        const filters: Array<[string, unknown]> = []; let lim = 1000;
        const builder = {
          eq(c: string, v: unknown) { filters.push([c, v]); return builder; },
          limit(n: number) { lim = n; return builder; },
          then<T1, T2 = never>(onf?: ((v: { data: Record<string, unknown>[] | null; error: { message: string } | null }) => T1 | PromiseLike<T1>) | null, onr?: ((r: unknown) => T2 | PromiseLike<T2>) | null) {
            const sql = `select ${columns} from public.${table} where ${filters.map(([c], i) => `${c} = $${i + 1}`).join(" and ") || "true"} limit ${lim}`;
            return q(sql, filters.map(([, v]) => v))
              .then((r) => ({ data: r.rows.map(toJson), error: null }), (e: Error) => ({ data: null, error: { message: e.message } }))
              .then(onf, onr);
          },
        };
        return builder;
      },
      async upsert(table: string, rows: unknown[], onConflict: string) {
        try {
          for (const row of rows as Record<string, unknown>[]) {
            const cols = Object.keys(row); const conflict = onConflict.split(",").map((s) => s.trim());
            await q(`insert into public.${table} (${cols.join(",")}) select ${cols.join(",")} from jsonb_populate_record(null::public.${table}, $1::jsonb)
                     on conflict (${conflict.join(",")}) do update set ${cols.filter((c) => !conflict.includes(c)).map((c) => `${c} = excluded.${c}`).join(", ")}`, [JSON.stringify(row)]);
          }
          return { error: false };
        } catch (e) { console.log("    upsert hata:", (e as Error).message); return { error: true }; }
      },
      async deleteExact(table: string, filters: ReadonlyArray<readonly [string, unknown]>) {
        try { const r = await q(`delete from public.${table} where ${filters.map(([c], i) => `${c} = $${i + 1}`).join(" and ")}`, filters.map(([, v]) => v)); return { error: false, count: r.rowCount ?? 0 }; }
        catch { return { error: true, count: null }; }
      },
    };
    const activationDb = {
      from(t: string) { return { select(c: string) { return { eq(k: string, v: unknown) { return { async maybeSingle() { try { const r = await q(`select ${c} from public.${t} where ${k} = $1 limit 1`, [v]); return { data: r.rows[0] ?? null, error: null }; } catch (e) { return { data: null, error: e }; } } }; } }; } }; },
    };
    const adapters = createClientIndexAdapters(indexDb as never);
    let runN = 0;
    const loop = { calls: 0, send: 0 };
    const workerRun = async (triggerSource: "event" | "safety-cron") => {
      const res = await workerRunRaw(triggerSource);
      // Worker'ın claim/complete geçişleri de webhook çağrısı üretir → route'tan geçir; hiçbiri olay üretmemeli.
      const t = await route(); loop.calls += t.calls; loop.send += t.send;
      return res;
    };
    const workerRunRaw = async (triggerSource: "event" | "safety-cron") => {
      runN++;
      const worker = `yh-client-outbox@m6-e2e-${runN}-${triggerSource}`;
      return runClientOutboxBatch({
        resolveConfig: W.resolveClientSourceConfig,
        isSourceProcessingActive: (k) => isSourceProcessingActive(k, activationDb as never),
        fetchSourceRow: adapters.fetchSourceRow, upsertUnit: adapters.upsertUnit, deindex: adapters.deindex,
        worker, claimBatch: W.YH_CLIENT_OUTBOX_CLAIM_BATCH, leaseSeconds: W.YH_CLIENT_OUTBOX_LEASE_SECONDS,
        permanentMaxAttempts: W.YH_CLIENT_OUTBOX_PERMANENT_MAX_ATTEMPTS, transientMaxAttempts: W.YH_CLIENT_OUTBOX_TRANSIENT_MAX_ATTEMPTS,
        baseDelaySeconds: ST.DEFAULT_BASE_DELAY_SECONDS, maxDelaySeconds: ST.DEFAULT_MAX_DELAY_SECONDS,
        sweep: (l, b) => RPC.sweepExpiredClient(rpcDb as never, l, b),
        claim: (w, b) => RPC.claimClientEvents(rpcDb as never, w, b),
        complete: (id, w, v, o) => RPC.completeClientEvent(rpcDb as never, id, w, v, o),
        fail: (id, w, v, c, m, bd, md) => RPC.failClientEvent(rpcDb as never, id, w, v, c, m, bd, md),
      });
    };
    // Route: yeni webhook çağrılarını gerçek karar fonksiyonundan geçir; "send" → Inngest olayı.
    let seen = 0;
    const route = async () => {
      const calls = (await q(`select id, body, headers->>'x-yh-webhook-secret' = $2 as secret_ok from net.calls where id > $1 order by id`, [seen, SECRET])).rows as Array<{ id: number; body: Record<string, unknown>; secret_ok: boolean }>;
      if (calls.length) seen = calls[calls.length - 1].id;
      const decisions = calls.map((c) => ({ ...decideWebhookAction(c.body), secretOk: c.secret_ok }));
      return { calls: calls.length, send: decisions.filter((d) => d.kind === "send" && "event" in d && d.event === YH_CLIENT_OUTBOX_ENQUEUED_EVENT).length, noop: decisions.filter((d) => d.kind === "noop").length, secretOk: decisions.every((d) => d.secretOk) };
    };
    const search = async (text: string, tenant: string, client: string) => {
      const { descriptor } = buildRetrievalDescriptor({ rawQuery: text, sessionTenantId: tenant, allowShared: false });
      if (descriptor.kind !== "query") throw new Error("boş sorgu");
      const w = descriptor.ranking.weights;
      const r = await q(`select r.source_table, r.source_id::text, i.client_id::text from public.yh_search_client_candidates_v2($1, $2::uuid, $3::uuid, ARRAY[$4,$5,$6,$7]::float4[], 50, null, null, null) r
                         join public.yasam_hafizasi_client_index i on i.id = r.id`, [descriptor.tsquery, tenant, client, w.A, w.B, w.C, w.D]);
      return r.rows as Array<{ source_table: string; source_id: string; client_id: string }>;
    };
    const outbox = async (sourceId: string) => (await q(`select status from public.yasam_hafizasi_client_outbox where source_id = $1`, [sourceId])).rows[0]?.status as string | undefined;

    // ── 1) ANLIK indeksleme (olay yolu) ────────────────────────────────────────────────────────
    console.log("\n[1] Anlık indeksleme — olay yolu");
    const n1 = (await q(`insert into public.client_notes(tenant_id, client_id, saglik_notu, oneriler) values ($1,$2,'ZZ migrenatak takibi','ZZ akşam yürüyüşü') returning id`, [TA, CA])).rows[0].id as string;
    let rt = await route();
    ok(rt.calls >= 1 && rt.send === 1 && rt.secretOk, "not eklenince webhook çağrısı → route 'send' (Inngest olayı), secret doğru", rt);
    ok((await search("migrenatak", TA, CA)).length === 0, "olaydan ÖNCE henüz aranamaz (worker koşmadı)");
    const r1 = await workerRun("event");
    ok(r1.claimed >= 1 && r1.completed >= 1, "olayın tetiklediği TEK worker koşusu satırı işledi", r1);
    const s1 = await search("migrenatak", TA, CA);
    ok(s1.length === 1 && s1[0].source_table === "client_notes" && s1[0].source_id === n1 && s1[0].client_id === CA, "H1: sağlık notu kelimesi HEMEN aranabilir — doğru danışan + doğru kayıt (cron beklenmedi)", s1);
    ok((await search("yürüyüşü", TA, CA)).length === 1, "öneri metni de aranabilir");
    ok((await outbox(n1)) === "succeeded", "outbox satırı succeeded");
    ok(loop.calls >= 1 && loop.send === 0, "worker geçişleri (claim/complete) webhook çağırır ama route'ta NOOP — sonsuz döngü yok", loop);

    // ── 2) Güncelleme: sürüm artışı → send → indeks yenilenir ─────────────────────────────────
    console.log("\n[2] Güncelleme");
    await q(`update public.client_notes set saglik_notu = 'ZZ bel fıtığı kontrolü' where id = $1`, [n1]);
    rt = await route();
    ok(rt.send === 1, "güncelleme → sürüm artışı → 'send'", rt);
    await workerRun("event");
    ok((await search("fıtığı", TA, CA)).length === 1 && (await search("migrenatak", TA, CA)).length === 0, "indeks yeni metni gösterir, eski kelime artık bulunmaz");

    // ── 3) SAFETY CRON kurtarması: pg_net hatası ──────────────────────────────────────────────
    console.log("\n[3] 15 dk safety cron kurtarması");
    await q("begin"); await q("set local m6.fail = 'on'");
    const s2 = (await q(`insert into public.client_sessions(tenant_id, client_id, session_type, session_note) values ($1,$2,'ZZ Refleksoloji kürü','ZZ seans') returning id`, [TA, CA])).rows[0].id as string;
    await q("commit");
    rt = await route();
    ok(rt.calls === 0 && (await outbox(s2)) === "pending", "pg_net hatası → kaynak yazıldı, çağrı yok, outbox PENDING (yazım bloklanmadı)", { rt, st: await outbox(s2) });
    ok((await search("kürü", TA, CA)).length === 0, "cron'dan önce aranamaz");
    const rc = await workerRun("safety-cron");
    ok(rc.claimed >= 1 && (await search("kürü", TA, CA)).length === 1 && (await outbox(s2)) === "succeeded", "SAFETY CRON koşusu kaçan satırı indeksledi (kurtarma çalışıyor)", rc);
    // Olay webhook'a ulaştı ama Inngest'e iletilemedi (olay kayboldu) → yine cron kurtarır.
    const h1 = (await q(`insert into public.client_homeworks(tenant_id, client_id, title) values ($1,$2,'ZZ nefesegzersizi') returning id`, [TA, CA])).rows[0].id as string;
    rt = await route();
    ok(rt.send === 1 && (await outbox(h1)) === "pending", "olay üretildi ama iletilemedi (worker koşmadı) → satır pending", rt);
    await workerRun("safety-cron");
    ok((await search("nefesegzersizi", TA, CA)).length === 1, "kaybolan olay → safety cron indeksledi");

    // ── 4) İdempotent tekrar koşu + 5) izolasyon ──────────────────────────────────────────────
    console.log("\n[4-5] İdempotentlik + izolasyon");
    const again = await workerRun("safety-cron");
    ok(again.claimed === 0, "işlenecek satır yokken tekrar koşu hiçbir şey almaz (idempotent)", again);
    await q(`insert into public.client_notes(tenant_id, client_id, saglik_notu) values ($1,$2,'ZZ migrenatak başka danışan')`, [TB, CB]);
    await route(); await workerRun("event");
    ok((await search("fıtığı", TA, CA2)).length === 0 && (await search("fıtığı", TB, CA)).length === 0, "başka danışan / başka tenant kapsamında A'nın kaydı görünmez");
    const sb = await search("migrenatak", TB, CB);
    ok(sb.length === 1 && sb[0].client_id === CB, "B tenant'ının kaydı yalnız kendi danışanında");

    // ── 6) Tetikleyici yokken (canlıdaki durum) + migration idempotentliği ───────────────────
    console.log("\n[6] Tetikleyici yok (canlı) → yalnız cron; migration tekrar uygulanır");
    await q(`drop trigger yh_client_outbox_webhook on public.yasam_hafizasi_client_outbox`);
    const a1 = (await q(`insert into public.appointments(tenant_id, client_id, title) values ($1,$2,'ZZ randevu kontrolü') returning id`, [TA, CA])).rows[0].id as string;
    rt = await route();
    ok(rt.calls === 0 && (await outbox(a1)) === "pending", "TETİKLEYİCİSİZ (canlıdaki durum): çağrı yok, kayıt cron'a kadar bekler", rt);
    await q(read(M6)); await q(read(M6));
    ok((await trig()) === 1, "migration 2 kez uygulandı → tek tetikleyici");
    await workerRun("safety-cron");
    ok((await outbox(a1)) === "succeeded", "bekleyen satır cron ile toparlandı (geçiş anında kayıp yok)");
    const before = (await q(`select md5(string_agg(row_to_json(o)::text, '|' order by o.id)) h from public.yasam_hafizasi_client_outbox o`)).rows[0].h;
    await q(read(M6));
    ok((await q(`select md5(string_agg(row_to_json(o)::text, '|' order by o.id)) h from public.yasam_hafizasi_client_outbox o`)).rows[0].h === before, "migration veri değiştirmez (outbox md5 aynı)");
    ok(loop.send === 0 && loop.calls >= 1, `TÜM worker koşularında (${runN}) geçiş çağrıları olay üretmedi (${loop.calls} çağrı, 0 send)`, loop);
    ok(W.YH_CLIENT_OUTBOX_SAFETY_CRON === "*/15 * * * *" && W.YH_CLIENT_OUTBOX_EVENT_NAME === YH_CLIENT_OUTBOX_ENQUEUED_EVENT, "worker: olay + */15 cron tetikleyicileri birlikte (kurtarma korunur)");
  } finally {
    await db.end().catch(() => {});
    await server.stop().catch(() => {});
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM — geçici klasör */ }
  }
  console.log(`\nM6 UÇTAN UCA: ${pass} PASS / ${fail} FAIL`);
  console.log(fail === 0 ? "RESULT: PASS" : "RESULT: FAIL");
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
