/**
 * M6 — client outbox webhook tetikleyicisi migration'ı: İZOLE yerel embedded-postgres doğrulaması.
 * PRODUCTION'A SIFIR TEMAS (pg_net/Vault yerine yerel sahte şemalar; hiçbir HTTP isteği atılmaz).
 *
 *   npx tsx scripts/dy-canli-denetim/m6-trigger.harness.ts
 *
 * Zincir: kaynak tablo yazımı → yh_client_outbox_enqueue (mevcut) → client outbox satırı →
 *   [YENİ] yh_client_outbox_webhook → yh_outbox_webhook_notify() (mevcut) → net.http_post(payload)
 *   → decideWebhookAction (route'un saf kararı) → YH_CLIENT_OUTBOX_ENQUEUED_EVENT → worker.
 */
import Module from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import { startDyEnv } from "../dy-presale-closeout/env";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) { return req === "server-only" ? stub : orig.call(this, req, ...rest); };
}

let pass = 0;
let fail = 0;
function ok(cond: unknown, msg: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}${detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 400)}`); }
}
const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const NEW_MIG = "20271231000100_yh_client_outbox_webhook_trigger.sql";
const FN_MIG = "20271010000000_yh_outbox_webhook_vault_secret.sql";
const SECRET = "zz-m6-yerel-test-secret-not-real";

async function main() {
  const { decideWebhookAction, YH_CLIENT_OUTBOX_TABLE } = await import("../../lib/yasam-hafizasi/outbox/webhookBridge");
  const { YH_CLIENT_OUTBOX_ENQUEUED_EVENT } = await import("../../lib/inngest/events");
  const W = await import("../../lib/inngest/functions/yhClientOutboxWorker");

  const { env, seed } = await startDyEnv({ port: 54498, dirName: "dy-m6-trigger-pgdata", httpPort: 54522 });
  const q = (sql: string, args: unknown[] = []) => env.su.query(sql, args);
  try {
    // ── Sahte Vault + pg_net (yalnız çağrıyı kaydeder; ağ YOK) ─────────────────
    await q(`create schema vault; create table vault.decrypted_secrets(name text primary key, decrypted_secret text);
             create table vault.secrets(id uuid default gen_random_uuid(), name text);
             create schema net; create table net.calls(id bigserial primary key, url text, body jsonb, headers jsonb);
             create function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) returns bigint
             language plpgsql as $f$ begin
               if current_setting('m6.fail', true) = 'on' then raise exception 'pg_net kapalı (test)'; end if;
               insert into net.calls(url, body, headers) values (url, body, headers); return 1; end $f$;`);
    await q(mig(FN_MIG)); // mevcut fonksiyon (profesyonel outbox tablosu yok → onun tetikleyici adımı atlanır)
    const trig = async () => (await q(`select tg.tgname, tg.tgfoid::regprocedure::text fn from pg_trigger tg
      where tg.tgrelid = 'public.yasam_hafizasi_client_outbox'::regclass and not tg.tgisinternal and tg.tgfoid::regprocedure::text like 'yh_outbox_webhook_notify%'`)).rows;
    ok((await trig()).length === 0, "ÖNCE: client outbox'ta webhook tetikleyicisi yok (canlıdaki durum)");

    // ── Migration: iki kez uygula (idempotent) ─────────────────────────────────
    await q(mig(NEW_MIG));
    await q(mig(NEW_MIG));
    const t = await trig();
    ok(t.length === 1 && t[0].tgname === "yh_client_outbox_webhook", "SONRA: tam 1 tetikleyici (2 kez uygulama → tekrarlı tetikleyici YOK)", t);
    ok(!/secret|http/i.test(mig(NEW_MIG).replace(/--.*$/gm, "").replace(/yh_outbox_webhook_notify|webhook/g, "")), "migration gövdesinde secret/URL yok (yalnız mevcut fonksiyon bağlanır)");

    const calls = async () => (await q(`select id, url, body, (headers ? 'x-yh-webhook-secret') has_secret, headers->>'x-yh-webhook-secret' = $1 secret_ok from net.calls order by id`, [SECRET])).rows as Array<{ id: number; url: string; body: Record<string, unknown>; has_secret: boolean; secret_ok: boolean }>;
    const TA = seed.TA;
    const C2 = seed.clients.a2;

    // ── Vault yapılandırılmamış → çağrı yok, kaynak yazımı başarılı ────────────
    await q(`insert into public.client_notes(tenant_id, client_id, saglik_notu) values ($1,$2,'ZZ migren notu')`, [TA, C2]);
    ok((await calls()).length === 0, "Vault yok → uyandırma atlanır, kaynak yazımı BAŞARILI (fail-safe)");
    const ob0 = (await q(`select status, event_version from public.yasam_hafizasi_client_outbox where source_key='danisan:notes' and client_id=$1`, [C2])).rows[0];
    ok(ob0?.status === "pending", "… outbox satırı pending (safety cron kurtarır)", ob0);

    await q(`insert into vault.decrypted_secrets values ('yh_outbox_webhook_secret',$1),('yh_outbox_webhook_url','http://127.0.0.1:9/api/internal/yh/outbox-webhook')`, [SECRET]);

    // ── Pozitif: kaynak UPDATE → coalesce bump → UPDATE çağrısı → route "send" ──
    await q(`update public.client_notes set saglik_notu='ZZ migren + baş ağrısı' where client_id=$1`, [C2]);
    let c = await calls();
    ok(c.length === 1, "kaynak güncelleme → TEK webhook çağrısı", c.length);
    const p1 = c[0]?.body as { type: string; table: string; schema: string; record: Record<string, unknown>; old_record: Record<string, unknown> };
    ok(p1?.table === YH_CLIENT_OUTBOX_TABLE && p1.schema === "public" && p1.type === "UPDATE", "payload: client outbox tablosu + UPDATE", { table: p1?.table, type: p1?.type });
    ok(c[0]?.has_secret && c[0]?.secret_ok && c[0]?.url.endsWith("/api/internal/yh/outbox-webhook"), "secret + URL Vault'tan çalışma anında (başlıkta), hedef bridge route");
    ok(p1.record.client_id === C2 && p1.record.tenant_id === TA && p1.record.source_key === "danisan:notes", "payload doğru tenant + danışan + kaynak");
    ok(Number(p1.record.event_version) > Number(p1.old_record.event_version), "event_version arttı (coalesce)");
    const d1 = decideWebhookAction(p1);
    ok(d1.kind === "send" && d1.event === YH_CLIENT_OUTBOX_ENQUEUED_EVENT, "route kararı: send → client outbox olayı", d1);
    ok(W.YH_CLIENT_OUTBOX_EVENT_NAME === YH_CLIENT_OUTBOX_ENQUEUED_EVENT, "worker bu olayı dinliyor (HEMEN uyanır)");

    // ── Pozitif: yeni kaynak satırı → INSERT çağrısı → send ──────────────────
    await q(`insert into public.client_sessions(tenant_id, client_id, session_type) values ($1,$2,'ZZ Refleksoloji')`, [TA, C2]);
    c = await calls();
    const p2 = c[c.length - 1]?.body as { type: string; record: Record<string, unknown> };
    ok(c.length === 2 && p2.type === "INSERT" && p2.record.source_key === "danisan:sessions" && decideWebhookAction(p2).kind === "send", "yeni seans → INSERT çağrısı → send", { n: c.length, type: p2?.type });

    // ── Negatif: worker geçişi (sürüm artmaz) → çağrı olur ama route NOOP (loop yok) ──
    await q(`update public.yasam_hafizasi_client_outbox set status='processing', locked_by='w', locked_at=now() where source_key='danisan:sessions' and client_id=$1`, [C2]);
    c = await calls();
    const p3 = c[c.length - 1]?.body as Record<string, unknown>;
    const d3 = decideWebhookAction(p3);
    ok(d3.kind === "noop", "worker geçişi (event_version aynı) → route NOOP (sonsuz döngü yok)", d3);

    // ── Kurtarma: pg_net hatası → kaynak yazımı BLOKLANMAZ, satır pending kalır ──
    const before = (await calls()).length;
    await env.su.query("begin");
    await env.su.query("set local m6.fail = 'on'");
    await env.su.query(`update public.client_notes set oneriler='ZZ öneri' where client_id=$1`, [C2]);
    await env.su.query("commit");
    const after = await calls();
    const ob = (await q(`select status, event_version from public.yasam_hafizasi_client_outbox where source_key='danisan:notes' and client_id=$1`, [C2])).rows[0];
    const note = (await q(`select oneriler from public.client_notes where client_id=$1`, [C2])).rows[0];
    ok(after.length === before && note?.oneriler === "ZZ öneri" && ob?.status === "pending", "pg_net hatası → kaynak kaydı yazıldı, outbox pending (safety cron toparlar)", { calls: after.length - before, ob, note });
    ok(W.YH_CLIENT_OUTBOX_SAFETY_CRON === "*/15 * * * *", "safety cron yedek mekanizma olarak AYNEN duruyor (*/15)");

    // ── Veri dokunulmazlığı: migration satır değiştirmez ──────────────────────
    const snap = async () => (await q(`select md5(string_agg(row_to_json(o)::text, '|' order by o.id)) h from public.yasam_hafizasi_client_outbox o`)).rows[0].h as string;
    const h0 = await snap();
    await q(mig(NEW_MIG));
    ok((await snap()) === h0 && (await trig()).length === 1, "3. uygulama: outbox verisi aynı (md5), hâlâ tek tetikleyici");

    // ── Ön koşul yoksa atlanır (fonksiyon yok) ─────────────────────────────────
    await q(`drop trigger yh_client_outbox_webhook on public.yasam_hafizasi_client_outbox; alter function public.yh_outbox_webhook_notify() rename to yh_outbox_webhook_notify_gizli`);
    await q(mig(NEW_MIG));
    ok((await q(`select count(*)::int n from pg_trigger where tgname='yh_client_outbox_webhook'`)).rows[0].n === 0, "bildirim fonksiyonu yoksa migration hata vermeden atlar");
    await q(`alter function public.yh_outbox_webhook_notify_gizli() rename to yh_outbox_webhook_notify`);
  } finally {
    await env.stop();
  }
  console.log(`\nM6 TETİKLEYİCİ HARNESS: ${pass}/${pass + fail} PASS`);
  console.log(fail === 0 ? "RESULT: PASS" : "RESULT: FAIL");
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
