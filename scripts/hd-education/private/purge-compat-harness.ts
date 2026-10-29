/**
 * FAZ 6 — Özel eğitim arşivi × OWNER PURGE (admin_purge_archived_expert) × Danışan Yolculuğu silme zinciri uyumluluğu.
 * İzole embedded-postgres; GERÇEK migration'lar (üye yönetimi test şeması + KVKK onam + HD + purge + FAZ 6). Prod'a SIFIR temas.
 * Kanıtlar: (1) arşivdeki uzmanın kalıcı silinmesi özel arşiv tablolarındaki TÜM satırlarını (denetim izi dahil) temizler ve
 * işlem fail-closed kalır; (2) başka uzmanın satırları DEĞİŞMEZ; (3) Danışan Yolculuğu kaydı silinince HD danışanı → izin →
 * kanıt → eğitim kaydı zinciri temizlenir, bağlı danışanın haritası MEVCUT tetikleyiciyle silinir (davranış değişmez).
 * Çalıştır: npx tsx scripts/hd-education/private/purge-compat-harness.ts   (HD_EDU_PRIV_PURGE_PORT, varsayılan 54751)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { startTestDb } from "../../uye-yonetimi-faz2/testDb";
import { CENTRAL_MIGRATIONS, HD_BASE_MIGRATIONS, PRIVATE_MIGRATION } from "./pgSchema";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
}
const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const PRIV_TABLES = ["hd_education_access_grants", "hd_edu_private_consents", "hd_edu_private_consent_evidence", "hd_edu_private_items", "hd_edu_private_audit"];
const pdf = (tag: string) => Buffer.concat([Buffer.from(`%PDF-1.4\n% ZZ_SENTETIK ${tag}\n`), Buffer.alloc(200, 0x20)]).toString("base64");

async function main() {
  const db = await startTestDb(Number(process.env.HD_EDU_PRIV_PURGE_PORT ?? 54751), `hd-edu-priv-purge-${Date.now()}-${randomUUID().slice(0, 6)}`);
  const { su } = db;
  try {
    await su.query(readMig("20270129000900_client_consents.sql"));
    for (const f of HD_BASE_MIGRATIONS) await su.query(readMig(f));
    await su.query(readMig("20271009100000_admin_purge_archived_expert.sql"));
    for (const f of CENTRAL_MIGRATIONS) await su.query(readMig(f)); // FAZ 8: TEK yetki önkoşulu
    await su.query(readMig(PRIVATE_MIGRATION));
    console.log("\n[şema] KVKK onam + HD + purge + FAZ 6 migration'ları uygulandı");

    const mkTenant = async (n: string) => { const id = randomUUID(); await su.query(`insert into public.tenants(id, name, slug) values ($1,$2,$3)`, [id, n, n.toLowerCase()]); return id; };
    const mkUser = async (label: string, tenant: string, o: { role?: string; superAdmin?: boolean } = {}) => {
      const id = randomUUID();
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin)
                      values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7)`,
        [id, `ZZ_${label}`, `zz.purge.${label.toLowerCase()}@example.test`, o.role ?? "expert", JSON.stringify({ human_design: true }), tenant, o.superAdmin === true]);
      return id;
    };
    const OT = await mkTenant("ZZ_OWNER_T"), T1 = await mkTenant("ZZ_T1"), T2 = await mkTenant("ZZ_T2");
    const OWNER = await mkUser("OWNER", OT, { role: "admin", superAdmin: true });
    const E1 = await mkUser("E1", T1), E2 = await mkUser("E2", T2);
    const q1 = async (sql: string, p: unknown[] = []) => (await su.query(sql, p)).rows[0];
    await su.query(`select public.hd_edu_priv_owner_approve_text($1, 'hd-egitim-izin-v1', 'ZZ-SENTETIK')`, [OWNER]);
    await su.query(`select public.hd_edu_priv_owner_set_open($1, true, null)`, [OWNER]);
    const sha = (await q1(`select body_sha256 from public.hd_edu_private_consent_texts where version='hd-egitim-izin-v1'`)).body_sha256 as string;

    const seed = async (user: string, tenant: string, n: number, journeyClient?: string) => {
      await su.query(`select public.hd_education_grant_access($1, $2, null)`, [OWNER, user]);
      const items: string[] = [];
      for (let i = 0; i < n; i++) {
        const c = (await q1(`insert into public.human_design_clients(tenant_id, user_id, name, journey_client_id) values ($1,$2,$3,$4) returning id`,
          [tenant, user, `ZZ_DANISAN_${i}`, i === 0 ? journeyClient ?? null : null])).id as string;
        const ch = (await q1(`insert into public.human_design_charts(tenant_id, user_id, client_id, source, birth_date, birth_time, timezone, computed_result)
                              values ($1,$2,$3,'computed','1991-02-02','09:30','Europe/Istanbul','{"zz":true}') returning id`, [tenant, user, c])).id as string;
        const k = (await q1(`select public.hd_edu_priv_consent_record($1,$2,'ZZ İzin','danisan','anonim',false,false,'hd-egitim-izin-v1',$3,current_date,'islak_imza_tarama',$4,'application/pdf') v`,
          [user, c, sha, pdf(`${user.slice(0, 4)}-${i}`)])).v as string;
        items.push((await q1(`select public.hd_edu_priv_item_add($1,$2,$3,'ZZ Başlık','ZZ Takma','alias','genel',null,'ZZ not') v`, [user, ch, k])).v as string);
      }
      return items;
    };
    // E2 için Danışan Yolculuğu kaydı (clients) + bağlı HD danışanı.
    const journey = (await q1(`insert into public.clients(tenant_id, full_name) values ($1,'ZZ Yolculuk') returning id`, [T2])).id as string;
    const i1 = await seed(E1, T1, 3);
    const i2 = await seed(E2, T2, 4, journey);
    ok(i1.length === 3 && i2.length === 4, "tohum: E1 3 kayıt, E2 4 kayıt (biri Danışan Yolculuğu bağlı danışanda)");

    const countBy = async (tenant: string) => {
      const out: Record<string, number> = {};
      for (const t of PRIV_TABLES) {
        const col = t === "hd_education_access_grants" ? "granted_tenant_id" : "tenant_id";
        out[t] = (await q1(`select count(*)::int n from public.${t} where ${col} = $1`, [tenant])).n as number;
      }
      return out;
    };
    const e2Before = await countBy(T2);
    const ownerAuditBefore = (await q1(`select count(*)::int n from public.hd_edu_private_audit where tenant_id is null`)).n as number;

    // ── Kalıcı silme (owner purge) ───────────────────────────────────────────────────────────
    console.log("\n[1 · owner purge]");
    await su.query(`update public.users set active = false where id = $1`, [E1]);
    let purgeErr = "";
    let res: Record<string, unknown> | null = null;
    try {
      res = (await q1(`select public.admin_purge_archived_expert($1, $2, $3) v`, [E1, OWNER, "zz.purge.e1@example.test"])).v as Record<string, unknown>;
    } catch (e) { purgeErr = String((e as Error).message); }
    ok(purgeErr === "" && res?.ok === true, "arşivdeki uzman purge'ü özel arşiv tablolarına rağmen BAŞARILI (fail-closed kilitlenmedi)", purgeErr || res);
    const e1After = await countBy(T1);
    ok(Object.values(e1After).every((n) => n === 0), "E1'in özel arşiv satırları (izin, kanıt, kayıt, denetim) + TEK eğitim yetkisi TAMAMEN silindi", e1After);
    ok((await q1(`select count(*)::int n from public.hd_education_access_grants where user_id = $1`, [E1])).n === 0, "E1'in yetki satırı user_id üzerinden de yok");
    const e2After = await countBy(T2);
    ok(JSON.stringify(e2After) === JSON.stringify(e2Before), "E2'nin özel arşiv satırları DEĞİŞMEDİ", { e2Before, e2After });
    ok((await q1(`select count(*)::int n from public.hd_edu_private_audit where tenant_id is null`)).n === ownerAuditBefore, "owner platform denetim satırları (tenant'sız) korundu");
    const tables = (res?.tables ?? {}) as Record<string, number>;
    ok((tables.hd_edu_private_items ?? 0) + (tables.hd_edu_private_consents ?? 0) >= 3, "purge sonucu özel arşiv tablolarını raporluyor", tables);
    let audDel = "";
    try { await su.query(`delete from public.hd_edu_private_audit where tenant_id = $1`, [T2]); } catch (e) { audDel = (e as { code?: string }).code ?? "?"; }
    ok(audDel === "23514", "purge DIŞINDA denetim izi silinemez (istisna yalnız purge tx'inde)");

    // ── Danışan Yolculuğu kaydı silme zinciri ────────────────────────────────────────────────
    console.log("\n[2 · Danışan Yolculuğu silme zinciri]");
    const hdc = (await q1(`select id from public.human_design_clients where journey_client_id = $1`, [journey])).id as string;
    const chartOf = (await q1(`select id from public.human_design_charts where client_id = $1`, [hdc])).id as string;
    await su.query(`delete from public.clients where id = $1`, [journey]);
    ok((await q1(`select count(*)::int n from public.human_design_clients where id = $1`, [hdc])).n === 0, "Yolculuk kaydı silinince HD danışanı mevcut FK ile CASCADE silindi");
    ok((await q1(`select count(*)::int n from public.hd_edu_private_consents where hd_client_id = $1`, [hdc])).n === 0
      && (await q1(`select count(*)::int n from public.hd_edu_private_items where hd_client_id = $1`, [hdc])).n === 0, "bağlı izin + eğitim kaydı temizlendi");
    ok((await q1(`select count(*)::int n from public.hd_edu_private_consent_evidence where tenant_id = $1`, [T2])).n === 3, "kalan 3 iznin kanıtı duruyor (yalnız silinen danışanınki gitti)");
    // Mevcut (değiştirilmeyen) tasarım: Yolculuk'a BAĞLI HD danışanı silinirken hd_client_purge_children haritaları da siler.
    ok((await q1(`select count(*)::int n from public.human_design_charts where id = $1`, [chartOf])).n === 0, "bağlı danışanın haritası MEVCUT tetikleyiciyle silindi (FAZ 6 bu davranışı değiştirmez)");
    ok((await q1(`select count(*)::int n from public.human_design_charts where tenant_id = $1`, [T2])).n === 3, "E2'nin diğer 3 haritası duruyor");
  } finally {
    await db.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error("HATA", e); process.exit(1); });
