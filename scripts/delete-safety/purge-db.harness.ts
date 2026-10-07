/**
 * SİLME GÜVENLİĞİ — owner-only arşiv uzman KALICI silme: GERÇEK PostgreSQL entegrasyon harness'i.
 *
 * Ephemeral embedded-postgres (127.0.0.1) + gerçek repo migration zinciri (Üye Yönetimi FAZ 2 tabanı:
 * admin_audit_log, provisioning_events, expert_usage_events, oturum RPC'leri …) + KVKK onam migration'ı +
 * 20271009100000_admin_purge_archived_expert. Production'a SIFIR temas; tüm veri sentetik (ZZ_DEL_*).
 *
 * Kapsam: yetki (owner / normal admin / uzman / pasif admin), owner kendini silemez, hedef kapsamı
 * (admin, aktif, pending, demo, sistem tenant'ı, paylaşımlı tenant), e-posta doğrulaması, başarılı
 * purge (tüm tenant tabloları + oturumlar + onamlar + immutable revizyonlar; diğer tenant BİREBİR;
 * append-only denetim satırları korunur), çapraz-tenant emniyet ağı (cascade tuzağı → tam rollback),
 * yabancı RESTRICT FK → tam rollback, eşzamanlı çift purge, guard'ların purge DIŞINDA aynen çalışması,
 * grant/ACL.
 *
 * Çalıştır: npx tsx scripts/delete-safety/purge-db.harness.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}

const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const PURGE_MIGRATION = "20271009100000_admin_purge_archived_expert.sql";
const SYSTEM_TENANT = "00000000-0000-4000-8000-000000000001";

const EXTRA_DDL = `
create table public.zz_client_notes (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  client_id uuid not null references public.clients(id) on delete restrict, body text
);
create table public.aromatherapy_preparation_method_series (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  constraint zz_series_tenant_id_unique unique (tenant_id, id)
);
create table public.aromatherapy_preparation_method_revisions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, series_id uuid not null,
  revision int not null default 1, plant_part_used text, material_state text, method_text text, equipment text,
  amount_ratio text, solvent_carrier text, duration_text text, temperature_text text, steps jsonb, filtration text,
  resting text, storage text, quality_notes text, safety_notes text, note_hash text, status text default 'draft',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint zz_rev_series_fk foreign key (tenant_id, series_id)
    references public.aromatherapy_preparation_method_series (tenant_id, id) on delete restrict
);
create table public.aromatherapy_content_audit_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, operation text, occurred_at timestamptz default now()
);
create function public.zz_aroma_audit_prevent() returns trigger language plpgsql as $$
begin raise exception 'aromatherapy_content_audit_events append-only' using errcode = 'check_violation'; end; $$;
create trigger trg_zz_aroma_audit_no_delete before update or delete on public.aromatherapy_content_audit_events
  for each row execute function public.zz_aroma_audit_prevent();
`;

type Ids = { user: string; tenant: string; email: string };

async function main(): Promise<void> {
  const db = await startTestDb(54417, "delete-safety-purge-db");
  const { su, pool } = db;
  try {
    await su.query(EXTRA_DDL);
    await su.query(readMig("20270129000900_client_consents.sql"));
    await su.query(readMig(PURGE_MIGRATION));
    // İkinci uygulama (idempotent olmalı).
    await su.query(readMig(PURGE_MIGRATION));
    await su.query(`create trigger trg_aromatherapy_prep_method_rev_guard
      before update or delete on public.aromatherapy_preparation_method_revisions
      for each row execute function public.aromatherapy_method_revision_guard();`);
    console.log("Test DB hazır (migration 2× uygulandı).\n");

    const mkTenant = async (id = randomUUID()) => {
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 13)}`]);
      return id;
    };
    const mkUser = async (o: {
      role: "admin" | "expert"; active?: boolean; approval?: string; superAdmin?: boolean; demo?: boolean; tenant?: string;
    }): Promise<Ids> => {
      const id = randomUUID();
      const tenant = o.tenant ?? (await mkTenant());
      const email = `zz.del.${id.slice(0, 8)}@example.test`;
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, is_demo_account, tenant_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, `ZZ_DEL ${o.role} ${id.slice(0, 4)}`, email, o.role, o.active ?? true, o.approval ?? "approved",
          o.superAdmin ?? false, o.demo ?? false, tenant],
      );
      return { user: id, tenant, email };
    };

    /** Bir uzmanın tenant'ına gerçekçi veri tohumlar; danışan id'lerini döner. */
    const seed = async (u: Ids, actor: string) => {
      const clients: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await su.query(`insert into public.clients(tenant_id, full_name) values ($1,$2) returning id`, [u.tenant, `ZZ_DEL Danışan ${i}`]);
        clients.push(r.rows[0].id);
      }
      for (const c of clients) {
        await su.query(`insert into public.zz_client_notes(tenant_id, client_id, body) values ($1,$2,'not')`, [u.tenant, c]);
        await su.query(
          `insert into public.client_consents(tenant_id, client_id, consent_type, status, text_version, method, recorded_by_user_id)
           values ($1,$2,'aydinlatma_bildirildi','granted','v1','uygulama_onay',$3)`, [u.tenant, c, u.user]);
      }
      const s = await su.query(`insert into public.aromatherapy_preparation_method_series(tenant_id) values ($1) returning id`, [u.tenant]);
      await su.query(`insert into public.aromatherapy_preparation_method_revisions(tenant_id, series_id, method_text, note_hash)
                      values ($1,$2,'yöntem',repeat('a',64))`, [u.tenant, s.rows[0].id]);
      await su.query(`insert into public.stone_exclusions(tenant_id, stone_id) values ($1,$2)`, [u.tenant, randomUUID()]);
      await su.query(`insert into public.yasam_hafizasi_flags(tenant_id, yh_enabled) values ($1,true)`, [u.tenant]);
      await su.query(`insert into public.yasam_hafizasi_index(tenant_id, source_module, source_table, title) values ($1,'dy','clients','ZZ')`, [u.tenant]);
      await su.query(`insert into public.user_sessions(user_id, session_token, is_active) values ($1,$2,false)`, [u.user, `zz-del-${randomUUID()}`]);
      await su.query(`insert into public.security_events(user_id, event_type, severity) values ($1,'login','info')`, [u.user]);
      await su.query(`insert into public.support_messages(user_id, tenant_id, subject, message) values ($1,$2,'ZZ','ZZ')`, [u.user, u.tenant]);
      await su.query(`insert into public.aromatherapy_content_audit_events(tenant_id, operation) values ($1,'create')`, [u.tenant]);
      await su.query(`insert into public.expert_usage_events(tenant_id, user_id, module_key, event_type)
                      values ($1,$2,'clients','record_created')`, [u.tenant, u.user]);
      await su.query(`insert into public.admin_audit_log(actor_admin_id, actor_is_main_admin, target_user_id, action)
                      values ($1,true,$2,'user_archived')`, [actor, u.user]);
      await su.query(`insert into public.provisioning_events(request_id, origin, outcome, target_user_id, target_tenant_id)
                      values ($1,'admin_create','provisioned',$2,$3)`, [randomUUID(), u.user, u.tenant]);
      return clients;
    };

    /** service_role bağlantısında (PostgREST ile aynı rol) purge çağrısı. */
    const purgeAs = async (client: pg.PoolClient | null, actor: string, target: string, email: string) => {
      const c = client ?? (await pool.connect());
      try {
        if (!client) await c.query("SET ROLE service_role");
        const r = await c.query(`select public.admin_purge_archived_expert($1,$2,$3) as r`, [target, actor, email]);
        return { ok: true as const, result: r.rows[0].r as Record<string, unknown>, code: "" };
      } catch (e) {
        return { ok: false as const, result: null, code: String((e as { code?: string }).code ?? ""), message: String((e as Error).message) };
      } finally {
        if (!client) { await c.query("RESET ROLE").catch(() => undefined); c.release(); }
      }
    };

    const tenantTables = [
      "clients", "zz_client_notes", "client_consents", "aromatherapy_preparation_method_series",
      "aromatherapy_preparation_method_revisions", "stone_exclusions", "yasam_hafizasi_flags", "yasam_hafizasi_index",
      "support_messages",
    ];
    const tenantCounts = async (tenant: string) => {
      const out: Record<string, number> = {};
      for (const t of tenantTables) out[t] = (await su.query(`select count(*)::int n from public.${t} where tenant_id = $1`, [tenant])).rows[0].n;
      return out;
    };
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

    const OWNER = await mkUser({ role: "admin", superAdmin: true });
    const ADMIN2 = await mkUser({ role: "admin" });
    const INACTIVE_ADMIN = await mkUser({ role: "admin", active: false });
    const OTHER = await mkUser({ role: "expert" });            // başka (aktif) uzman — dokunulmamalı
    await seed(OTHER, OWNER.user);
    const otherBefore = await tenantCounts(OTHER.tenant);

    // ── A) Yetki ───────────────────────────────────────────────────────────────
    console.log("[A] Yetki — yalnız owner");
    const T1 = await mkUser({ role: "expert", active: false });
    await seed(T1, OWNER.user);
    const t1Before = await tenantCounts(T1.tenant);
    let r = await purgeAs(null, ADMIN2.user, T1.user, T1.email);
    ok(!r.ok && r.code === "UP003", `normal admin → UP003 (${r.code})`);
    r = await purgeAs(null, OTHER.user, T1.user, T1.email);
    ok(!r.ok && r.code === "UP003", `uzman aktör → UP003 (${r.code})`);
    r = await purgeAs(null, INACTIVE_ADMIN.user, T1.user, T1.email);
    ok(!r.ok && r.code === "UP003", `pasif admin → UP003 (${r.code})`);
    r = await purgeAs(null, OWNER.user, OWNER.user, OWNER.email);
    ok(!r.ok && r.code === "UP002", `owner kendini silemez → UP002 (${r.code})`);
    ok(sum(await tenantCounts(T1.tenant)) === sum(t1Before), "yetkisiz denemeler hiçbir veri silmedi");

    // ── B) Hedef kapsamı ───────────────────────────────────────────────────────
    console.log("\n[B] Hedef kapsamı");
    r = await purgeAs(null, OWNER.user, ADMIN2.user, ADMIN2.email);
    ok(!r.ok && r.code === "UP005", `admin hedef → UP005 (${r.code})`);
    r = await purgeAs(null, OWNER.user, OTHER.user, OTHER.email);
    ok(!r.ok && r.code === "UP006", `aktif uzman (arşivde değil) → UP006 (${r.code})`);
    const PENDING = await mkUser({ role: "expert", active: false, approval: "pending" });
    r = await purgeAs(null, OWNER.user, PENDING.user, PENDING.email);
    ok(!r.ok && r.code === "UP006", `onay bekleyen → UP006 (${r.code})`);
    const DEMO = await mkUser({ role: "expert", active: false, demo: true });
    r = await purgeAs(null, OWNER.user, DEMO.user, DEMO.email);
    ok(!r.ok && r.code === "UP007", `demo hesabı → UP007 (${r.code})`);
    r = await purgeAs(null, OWNER.user, T1.user, "yanlis@example.test");
    ok(!r.ok && r.code === "UP008", `yanlış e-posta → UP008 (${r.code})`);
    r = await purgeAs(null, OWNER.user, randomUUID(), "x@example.test");
    ok(!r.ok && r.code === "UP004", `olmayan kullanıcı → UP004 (${r.code})`);
    await mkTenant(SYSTEM_TENANT);
    const SYS = await mkUser({ role: "expert", active: false, tenant: SYSTEM_TENANT });
    r = await purgeAs(null, OWNER.user, SYS.user, SYS.email);
    ok(!r.ok && r.code === "UP009", `sistem tenant'ı → UP009 (${r.code})`);
    const SHARED = await mkUser({ role: "expert", active: false });
    await mkUser({ role: "expert", tenant: SHARED.tenant });
    r = await purgeAs(null, OWNER.user, SHARED.user, SHARED.email);
    ok(!r.ok && r.code === "UP010", `paylaşımlı tenant → UP010 (${r.code})`);
    ok(sum(await tenantCounts(T1.tenant)) === sum(t1Before), "reddedilen denemeler hiçbir veri silmedi");

    // ── C) Çapraz-tenant emniyet ağı ───────────────────────────────────────────
    console.log("\n[C] Çapraz-tenant emniyet ağı + yabancı RESTRICT");
    const t1Clients = (await su.query(`select id from public.clients where tenant_id = $1`, [T1.tenant])).rows.map((x) => x.id as string);
    await su.query(`create table public.zz_cross_ref (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
                      client_id uuid not null references public.clients(id) on delete cascade)`);
    await su.query(`insert into public.zz_cross_ref(tenant_id, client_id) values ($1,$2)`, [OTHER.tenant, t1Clients[0]]);
    r = await purgeAs(null, OWNER.user, T1.user, T1.email);
    ok(!r.ok && r.code === "UP023", `başka tenant satırını silecek cascade → UP023 (${r.code})`);
    ok(sum(await tenantCounts(T1.tenant)) === sum(t1Before), "UP023 → tam rollback (hedef verisi yerinde)");
    ok((await su.query(`select count(*)::int n from public.zz_cross_ref`)).rows[0].n === 1, "UP023 → diğer tenant satırı yerinde");
    ok((await su.query(`select count(*)::int n from public.users where id = $1`, [T1.user])).rows[0].n === 1, "UP023 → hesap yerinde");
    await su.query(`drop table public.zz_cross_ref`);

    await su.query(`create table public.zz_foreign_restrict (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
                      client_id uuid not null references public.clients(id) on delete restrict)`);
    await su.query(`insert into public.zz_foreign_restrict(tenant_id, client_id) values ($1,$2)`, [OTHER.tenant, t1Clients[1]]);
    r = await purgeAs(null, OWNER.user, T1.user, T1.email);
    ok(!r.ok && r.code === "UP020", `yabancı RESTRICT FK → UP020 fail-closed (${r.code})`);
    ok(sum(await tenantCounts(T1.tenant)) === sum(t1Before), "UP020 → tam rollback");
    await su.query(`drop table public.zz_foreign_restrict`);

    // ── D) Başarılı purge ──────────────────────────────────────────────────────
    console.log("\n[D] Başarılı purge (owner)");
    const auditBefore = (await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id = $1`, [T1.user])).rows[0].n;
    r = await purgeAs(null, OWNER.user, T1.user, `  ${T1.email.toUpperCase()}  `);
    ok(r.ok, `owner purge başarılı (e-posta büyük harf + boşluk toleransı) ${r.ok ? "" : r.code}`);
    const after = await tenantCounts(T1.tenant);
    ok(sum(after) === 0, `hedef tenant tablolarında 0 satır (${JSON.stringify(after)})`);
    ok((await su.query(`select count(*)::int n from public.users where id = $1`, [T1.user])).rows[0].n === 0, "users satırı silindi");
    ok((await su.query(`select count(*)::int n from public.tenants where id = $1`, [T1.tenant])).rows[0].n === 0, "tenants satırı silindi");
    ok((await su.query(`select count(*)::int n from public.user_sessions where user_id = $1`, [T1.user])).rows[0].n === 0, "oturumlar silindi");
    ok((await su.query(`select count(*)::int n from public.security_events where user_id = $1`, [T1.user])).rows[0].n === 0, "güvenlik olayları silindi");
    const otherAfter = await tenantCounts(OTHER.tenant);
    ok(JSON.stringify(otherAfter) === JSON.stringify(otherBefore), "diğer uzmanın verisi BİREBİR aynı");
    ok((await su.query(`select count(*)::int n from public.users where id = $1`, [OTHER.user])).rows[0].n === 1, "diğer uzman hesabı yerinde");
    ok((await su.query(`select count(*)::int n from public.aromatherapy_content_audit_events where tenant_id = $1`, [T1.tenant])).rows[0].n === 1,
      "append-only aroma denetim satırı KORUNDU");
    ok((await su.query(`select count(*)::int n from public.expert_usage_events where user_id = $1`, [T1.user])).rows[0].n >= 1,
      "append-only kullanım olayı KORUNDU");
    ok(auditBefore === 1 && (await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id = $1`, [T1.user])).rows[0].n === 0,
      "eski audit satırının hedef referansı NULL'a düştü (satır korunur)");
    ok((await su.query(`select count(*)::int n from public.admin_audit_log where action='user_archived' and target_user_id is null`)).rows[0].n === 1,
      "user_archived audit satırı korundu");
    const prov = (await su.query(`select target_user_id, target_tenant_id from public.provisioning_events where request_id is not null and target_user_id is null and target_tenant_id is null`)).rows;
    ok(prov.length === 1, "provisioning olayı korundu, user/tenant referansı NULL");
    const purgeAudit = (await su.query(`select * from public.admin_audit_log where action='user_deleted' order by created_at desc limit 1`)).rows[0];
    ok(!!purgeAudit && purgeAudit.actor_admin_id === OWNER.user && purgeAudit.actor_is_main_admin === true &&
      purgeAudit.context?.purged_user_id === T1.user && purgeAudit.context?.purged_tenant_id === T1.tenant,
      "purge audit: user_deleted, aktör owner, silinen kimlik context'te");
    ok(!JSON.stringify(purgeAudit ?? {}).includes(T1.email), "purge audit e-posta (PII) içermiyor");
    ok(Number((r.result as { total_rows?: number } | null)?.total_rows ?? 0) === 14, `sonuç toplam satır (doğrudan silinen; onamlar cascade) ${(r.result as { total_rows?: number } | null)?.total_rows}`);
    ok((await su.query(`select count(*)::int n from public.admin_purge_context`)).rows[0].n === 0, "işaret tablosu boş (tx sonunda temizlendi)");
    r = await purgeAs(null, OWNER.user, T1.user, T1.email);
    ok(!r.ok && r.code === "UP004", `ikinci purge → UP004 (${r.code})`);

    // ── E) Eşzamanlı çift purge ────────────────────────────────────────────────
    console.log("\n[E] Eşzamanlı çift purge");
    const T2 = await mkUser({ role: "expert", active: false });
    await seed(T2, OWNER.user);
    const cA = await pool.connect();
    await cA.query("SET ROLE service_role");
    await cA.query("BEGIN");
    const rA = await purgeAs(cA, OWNER.user, T2.user, T2.email);
    const pB = purgeAs(null, OWNER.user, T2.user, T2.email);
    await new Promise((res) => setTimeout(res, 400));
    await cA.query("COMMIT");
    await cA.query("RESET ROLE");
    cA.release();
    const rB = await pB;
    ok(rA.ok && !rB.ok && rB.code === "UP004", `ilk purge başarılı, eşzamanlı ikinci → UP004 (A=${rA.ok} B=${rB.code})`);

    // Purge sırasında eşzamanlı yeniden aktifleştirme: önce aktifleştirilen kazanır → purge UP006.
    const T3 = await mkUser({ role: "expert", active: false });
    await seed(T3, OWNER.user);
    await su.query(`update public.users set active = true where id = $1`, [T3.user]);
    r = await purgeAs(null, OWNER.user, T3.user, T3.email);
    ok(!r.ok && r.code === "UP006", `yeniden aktifleştirilmiş uzman → UP006 (${r.code})`);

    // ── F) Guard'lar purge DIŞINDA aynen çalışır ───────────────────────────────
    console.log("\n[F] Append-only guard'lar purge dışında");
    const expectErr = async (sql: string, params: unknown[], code: string, label: string) => {
      try { await su.query(sql, params); ok(false, `${label} (hata bekleniyordu)`); }
      catch (e) { ok(String((e as { code?: string }).code) === code, `${label} → ${String((e as { code?: string }).code)}`); }
    };
    await expectErr(`update public.admin_audit_log set target_user_id = null where target_user_id is not null`, [], "23514",
      "audit target_user_id → NULL (purge yok) reddedilir");
    await expectErr(`delete from public.admin_audit_log`, [], "23514", "audit DELETE reddedilir");
    await expectErr(`update public.provisioning_events set target_user_id = null where target_user_id is not null`, [], "23514",
      "provisioning user → NULL (purge yok) reddedilir");
    await expectErr(`delete from public.aromatherapy_preparation_method_revisions`, [], "P0001", "yöntem revizyonu DELETE reddedilir");
    await expectErr(`update public.aromatherapy_preparation_method_revisions set method_text = 'x'`, [], "P0001", "yöntem revizyonu içerik UPDATE reddedilir");
    await su.query(`update public.aromatherapy_preparation_method_revisions set status = 'archived' where tenant_id = $1`, [OTHER.tenant]);
    ok(true, "yöntem revizyonu status UPDATE hâlâ serbest");
    // Başka bir tx'in işareti işe yaramaz (txid bağlı).
    await su.query(`insert into public.admin_purge_context(txid, user_id, tenant_id) values (1, $1, $2)`, [OTHER.user, OTHER.tenant]);
    await expectErr(`delete from public.aromatherapy_preparation_method_revisions where tenant_id = $1`, [OTHER.tenant], "P0001",
      "yabancı txid işareti istisna AÇMAZ");
    await su.query(`delete from public.admin_purge_context`);

    // ── G) Grant / ACL ─────────────────────────────────────────────────────────
    console.log("\n[G] Grant / ACL");
    const priv = async (role: string, obj: string, p: string, fn = true) =>
      (await su.query(fn ? `select has_function_privilege($1,$2,$3) v` : `select has_table_privilege($1,$2,$3) v`, [role, obj, p])).rows[0].v as boolean;
    const fnSig = "public.admin_purge_archived_expert(uuid,uuid,text)";
    ok(!(await priv("anon", fnSig, "EXECUTE")) && !(await priv("authenticated", fnSig, "EXECUTE")), "anon/authenticated purge EXECUTE yok");
    ok(await priv("service_role", fnSig, "EXECUTE"), "service_role purge EXECUTE var");
    ok(!(await priv("service_role", "public.admin_purge_context", "SELECT", false)) &&
       !(await priv("service_role", "public.admin_purge_context", "INSERT", false)), "service_role işaret tablosuna erişemez");
    ok(!(await priv("anon", "public.admin_purge_in_progress(uuid,uuid)", "EXECUTE")), "anon admin_purge_in_progress EXECUTE yok");
  } finally {
    await db.stop();
  }

  console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`);
  if (fail > 0) {
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
