/**
 * Gökyüzü Atlası teknik izinleri — ONAY / YENİ UZMAN sarmalayıcıları (migration 20271230000000 · 2b) GERÇEK üye yönetimi
 * migration zinciri üzerinde (geçici gömülü PostgreSQL; prod'a temas YOK; SENTETİK kişiler).
 *
 *  • admin_approve_expert_with_astrology: onay + modüller + teknik izinleri TEK işlemde; geçersiz / boş teknik → onay dahil
 *    HİÇBİR şey yazılmaz; Astroloji seçili değilse reddeder; mevcut admin_approve_expert_with_modules aynen çalışır.
 *  • admin_create_user_with_modules_astrology: yeni uzman + teknik izinleri TEK işlemde; geçersiz teknik → hesap oluşmaz.
 *  • Yetki: yalnız service_role.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-technique-grants-approve-pg.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

const MEMBERSHIP = { package_type: "premium", membership_status: "active", membership_started_at: new Date().toISOString(), membership_ends_at: null, trial_started_at: null, trial_ends_at: null, plan: "premium", subscription_status: "active" };
const FULL = (sel: string[]) => Object.fromEntries(["clients", "numerology", "stones", "human_design", "astrology", "astrology_provider_interp"].map((k) => [k, sel.includes(k)]));
const NATAL = { mode: "list", techniques: ["western.natal"] };

async function main() {
  const db = await startTestDb(55100 + Math.floor(Math.random() * 800), `astro-tg-approve-${Date.now()}-${randomUUID().slice(0, 8)}`);
  const su = db.su;
  try {
    const mig = readFileSync(path.join(process.cwd(), "supabase/migrations/20271230000000_astrology_technique_grants.sql"), "utf8");
    await su.query(mig);
    await su.query(mig); // idempotent
    const tenant = async () => {
      const id = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 13)}`]);
      return id;
    };
    const ACTOR = randomUUID();
    await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id) values ($1,'ZZ Owner','zz.tg.owner@example.test','admin',true,'approved',true,$2)`, [ACTOR, await tenant()]);
    const pending = async (perms: Record<string, unknown> = {}) => {
      const id = randomUUID();
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, tenant_id) values ($1,'ZZ Bekleyen',$2,'expert',false,'pending',$3,$4)`,
        [id, `zz.tg.${id.slice(0, 8)}@example.test`, JSON.stringify(perms), await tenant()]);
      return id;
    };
    const row = async (id: string) => (await su.query(`select approval_status, active, package_type, module_permissions, astrology_technique_grants from public.users where id=$1`, [id])).rows[0];
    const audits = async (id: string) => (await su.query(`select action, context from public.admin_audit_log where target_user_id=$1 order by created_at`, [id])).rows as { action: string; context: Record<string, unknown> }[];
    const code = async (sql: string, args: unknown[]) => { try { await su.query(sql, args); return "OK"; } catch (e) { return (e as { code?: string }).code ?? "ERR"; } };
    const APPROVE = `select public.admin_approve_expert_with_astrology($1,$2,$3,$4,$5,$6,$7) r`;

    // 1) Onay + Astroloji + teknikler → tek işlem
    const P1 = await pending();
    const r1 = (await su.query(APPROVE, [P1, MEMBERSHIP, ACTOR, FULL(["clients", "astrology"]), [], "pending", NATAL])).rows[0].r;
    const s1 = await row(P1);
    ok(s1.approval_status === "approved" && s1.active === true && s1.package_type === "premium", "onay: uzman onaylı + aktif + Premium", s1);
    ok(s1.module_permissions.astrology === true && s1.module_permissions.clients === true && s1.module_permissions.numerology === false, "onay: yalnız seçilen modüller açık", s1.module_permissions);
    ok(JSON.stringify(s1.astrology_technique_grants) === JSON.stringify(NATAL), "onay: teknik izinleri aynı işlemde yazıldı", s1.astrology_technique_grants);
    ok(JSON.stringify(r1.astrology_grants) === JSON.stringify(NATAL), "onay yanıtı teknik izinlerini taşır");
    const a1 = await audits(P1);
    ok(a1.some((a) => a.action === "user_approved") && a1.some((a) => a.action === "module_enabled" && a.context.scope === "astrology_techniques"), "denetim: onay + teknik farkı", a1.map((a) => a.action));

    // 2) Geçersiz / boş teknik → onay DAHİL hiçbir şey yazılmaz
    const P2 = await pending({ numerology: true });
    const before2 = JSON.stringify(await row(P2));
    ok(await code(APPROVE, [P2, MEMBERSHIP, ACTOR, FULL(["astrology"]), [], "pending", { mode: "list", techniques: [] }]) === "UY003", "boş teknik seçimi → UY003");
    ok(await code(APPROVE, [P2, MEMBERSHIP, ACTOR, FULL(["astrology"]), [], "pending", null]) === "UY003", "teknik yok (NULL) → UY003");
    ok(await code(APPROVE, [P2, MEMBERSHIP, ACTOR, FULL(["clients"]), [], "pending", NATAL]) === "UY003", "Astroloji seçili değil → UY003 (sarmalayıcı yalnız Astroloji'li onay için)");
    ok(JSON.stringify(await row(P2)) === before2 && (await audits(P2)).length === 0, "reddedilen onay hiçbir şey yazmadı (onay durumu, modüller, denetim)");

    // 3) Teknik yazımı başarısız olursa onay da geri alınır (atomik)
    await su.query(`create function public._tg_boom() returns trigger language plpgsql as $$ begin if new.context->>'scope' = 'astrology_techniques' then raise exception 'boom'; end if; return new; end $$;
                    create trigger _tg_boom_t before insert on public.admin_audit_log for each row execute function public._tg_boom();`);
    ok(await code(APPROVE, [P2, MEMBERSHIP, ACTOR, FULL(["astrology"]), [], "pending", NATAL]) !== "OK", "teknik adımı hata → çağrı başarısız");
    ok(JSON.stringify(await row(P2)) === before2, "ATOMİK: onay da geri alındı (uzman hâlâ bekliyor, Astroloji kapalı)");
    await su.query(`drop trigger _tg_boom_t on public.admin_audit_log; drop function public._tg_boom();`);

    // 4) Mevcut onay fonksiyonu (Astroloji'siz) aynen çalışır
    const P3 = await pending();
    await su.query(`select public.admin_approve_expert_with_modules($1,$2,$3,$4,$5,$6)`, [P3, MEMBERSHIP, ACTOR, FULL(["clients"]), [], "pending"]);
    const s3 = await row(P3);
    ok(s3.approval_status === "approved" && s3.module_permissions.clients === true && s3.astrology_technique_grants === null, "mevcut onay akışı (Astroloji'siz) değişmedi", s3);

    // 5) Yeni Uzman + Astroloji + teknikler
    const payload = (email: string) => ({ email, password_hash: "$2a$10$zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", full_name: "ZZ Yeni Uzman", tenant_name: "ZZ", tenant_slug_base: `zz-${randomUUID().slice(0, 8)}`, actor_admin_id: ACTOR, role: "expert" });
    const CREATE = `select public.admin_create_user_with_modules_astrology($1,$2,$3,$4,$5) r`;
    const c1 = (await su.query(CREATE, [payload("zz.tg.yeni1@example.test"), MEMBERSHIP, FULL(["astrology"]), [], { mode: "all" }])).rows[0].r;
    ok(c1.outcome === "provisioned" && !!c1.user_id, "yeni uzman oluşturuldu", c1);
    const n1 = await row(c1.user_id);
    ok(n1?.module_permissions?.astrology === true && JSON.stringify(n1.astrology_technique_grants) === JSON.stringify({ mode: "all" }), "yeni uzman: Astroloji + teknikler aynı işlemde", n1);
    const users0 = Number((await su.query(`select count(*) from public.users`)).rows[0].count);
    ok(await code(CREATE, [payload("zz.tg.yeni2@example.test"), MEMBERSHIP, FULL(["astrology"]), [], { mode: "list", techniques: ["WRONG"] }]) === "UY003", "yeni uzman: geçersiz teknik → UY003");
    ok(Number((await su.query(`select count(*) from public.users`)).rows[0].count) === users0, "geçersiz teknikle hesap oluşmadı");

    // 6) Yetkiler
    for (const sig of ["public.admin_approve_expert_with_astrology(uuid,jsonb,uuid,jsonb,text[],text,jsonb)", "public.admin_create_user_with_modules_astrology(jsonb,jsonb,jsonb,text[],jsonb)"]) {
      const g = (await su.query(`select has_function_privilege('service_role',$1,'EXECUTE') s, has_function_privilege('anon',$1,'EXECUTE') a, has_function_privilege('authenticated',$1,'EXECUTE') u`, [sig])).rows[0];
      ok(g.s === true && g.a === false && g.u === false, `EXECUTE yalnız service_role: ${sig.split("(")[0]}`, g);
    }
  } finally {
    await db.stop().catch(() => undefined);
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  console.log("FAIL beklenmeyen hata");
  process.exit(1);
});
