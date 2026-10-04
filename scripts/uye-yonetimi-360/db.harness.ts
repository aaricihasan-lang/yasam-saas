/**
 * ÜYE YÖNETİMİ 360° — GERÇEK PostgreSQL migration/RPC harness'i (20271006000000).
 * Ephemeral embedded-postgres; sentetik veri; production'a SIFIR temas.
 *
 * Çalıştır: npx tsx scripts/uye-yonetimi-360/db.harness.ts
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { startTestDb360, readMig, M360_MIGRATION } from "./testDb360";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}`); }
}

const PORT = 54391;
const TODAY = "2026-10-04";

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const db = await startTestDb360(PORT, "uye-yonetimi-360-db");
  const { su, pool } = db;
  const asRole = async <T extends pg.QueryResultRow = Record<string, unknown>>(role: string, sql: string, params: unknown[] = []) => {
    const c = await pool.connect();
    try {
      await c.query(`set role ${role}`);
      return await c.query<T>(sql, params);
    } finally {
      await c.query("reset role").catch(() => undefined);
      c.release();
    }
  };
  const errCode = async (fn: () => Promise<unknown>): Promise<string | null> => {
    try { await fn(); return null; } catch (e) { return (e as { code?: string }).code ?? "ERR"; }
  };

  try {
    // ── 0) Migration: idempotent + tekrar uygulanabilir ──────────────────────────
    console.log("\n[0] Migration idempotency + şema");
    ok((await errCode(() => su.query(readMig(M360_MIGRATION)))) === null, "migration ikinci kez hatasız uygulanır (idempotent)");
    const overloads = await su.query(`select p.oid::regprocedure::text sig from pg_proc p where p.proname = 'admin_list_users'`);
    ok(overloads.rowCount === 1 && /date\)$/.test(overloads.rows[0].sig), `admin_list_users tek imza (15 arg): ${overloads.rows.map((r) => r.sig).join(" | ")}`);
    const rls = await su.query(`select relrowsecurity from pg_class where oid = 'public.member_pricing_phases'::regclass`);
    ok(rls.rows[0]?.relrowsecurity === true, "member_pricing_phases RLS açık");
    for (const role of ["anon", "authenticated", "service_role"]) {
      const t = await su.query(`select has_table_privilege($1, 'public.member_pricing_phases', 'SELECT') s,
                                       has_table_privilege($1, 'public.member_pricing_phases', 'INSERT') i,
                                       has_table_privilege($1, 'public.member_pricing_phases', 'UPDATE') u,
                                       has_table_privilege($1, 'public.member_pricing_phases', 'DELETE') d`, [role]);
      const r = t.rows[0];
      ok(!r.s && !r.i && !r.u && !r.d, `${role}: member_pricing_phases doğrudan tablo erişimi YOK`);
    }
    const FNS = [
      "public.admin_list_users(text,text,text,text,text,text,text,integer,integer,text,text,text,text[],text,date)",
      "public.admin_member_overview(date)",
      "public.admin_pricing_phase_list(uuid)",
      "public.admin_pricing_phase_save(uuid,uuid,uuid,date,date,numeric,text,text,text,timestamptz)",
      "public.admin_pricing_phase_delete(uuid,uuid,uuid,timestamptz)",
      "public.admin_member_activity_state(date,date,date,date)",
    ];
    for (const fn of FNS) {
      const g = await su.query(`select has_function_privilege('anon', $1, 'EXECUTE') a, has_function_privilege('authenticated', $1, 'EXECUTE') au,
                                       has_function_privilege('service_role', $1, 'EXECUTE') sr`, [fn]);
      ok(!g.rows[0].a && !g.rows[0].au && g.rows[0].sr, `EXECUTE yalnız service_role: ${fn.split("(")[0]}`);
    }
    const secdef = await su.query(`select proname, prosecdef, proconfig from pg_proc where proname in
      ('admin_list_users','admin_member_overview','admin_pricing_phase_list','admin_pricing_phase_save','admin_pricing_phase_delete')`);
    ok(secdef.rows.every((r) => r.prosecdef === true && Array.isArray(r.proconfig) && r.proconfig.some((c: string) => c.startsWith("search_path="))),
      "5 RPC SECURITY DEFINER + sabit search_path");
    const chk = await su.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'admin_audit_action_chk'`);
    ok(/pricing_phase_changed/.test(chk.rows[0].d) && /own_session_terminated/.test(chk.rows[0].d) && /user_approved/.test(chk.rows[0].d),
      "audit CHECK süperset: pricing_phase_changed + eski action'lar korunur");
    const anonList = await errCode(() => asRole("anon", `select public.admin_list_users(p_q=>'', p_role_match=>null, p_view=>'members', p_approval=>'all', p_active=>'all', p_role=>'all', p_payment=>'all', p_limit=>10, p_offset=>0)`));
    ok(anonList === "42501", `anon admin_list_users çağıramaz (${anonList})`);
    const authOv = await errCode(() => asRole("authenticated", `select public.admin_member_overview()`));
    ok(authOv === "42501", `authenticated admin_member_overview çağıramaz (${authOv})`);
    const anonSel = await errCode(() => asRole("anon", `select * from public.member_pricing_phases`));
    ok(anonSel === "42501", `anon member_pricing_phases SELECT reddedilir (${anonSel})`);
    const srSel = await errCode(() => asRole("service_role", `select * from public.member_pricing_phases`));
    ok(srSel === "42501", `service_role bile tabloyu doğrudan okuyamaz — yalnız RPC (${srSel})`);

    // ── Sentetik veri ────────────────────────────────────────────────────────────
    const tenant = async () => {
      const id = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]);
      return id;
    };
    type U = { id: string; tenant: string };
    const mk = async (o: {
      name: string; email?: string; role?: string; approval?: string; active?: boolean; demo?: boolean;
      created?: string; approved?: string | null; payment?: string | null; npd?: string | null; perms?: Record<string, unknown>;
    }): Promise<U> => {
      const id = randomUUID();
      const t = await tenant();
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_demo_account, created_at, approved_at,
                                  payment_status, next_payment_date, module_permissions, tenant_id, admin_level)
         values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10,$11::date,$12::jsonb,$13,$14)`,
        [id, o.name, o.email ?? `${id.slice(0, 8)}@zz-m360.example.test`, o.role ?? "expert", o.active ?? true,
          o.approval ?? "approved", o.demo ?? false, `${o.created ?? "2026-01-01"}T09:00:00+03:00`,
          o.approved === null ? null : `${o.approved ?? o.created ?? "2026-01-01"}T10:00:00+03:00`,
          o.payment ?? null, o.npd ?? null, JSON.stringify(o.perms ?? {}), t, (o.role ?? "expert") === "admin" ? "admin" : null],
      );
      return { id, tenant: t };
    };
    const usage = async (u: U, day: string, channel = "desktop_web") => {
      await su.query(
        `insert into public.usage_daily(user_id, tenant_id, day_tr, channel, visits, active_seconds, first_at, last_at)
         values ($1,$2,$3::date,$4,1,60,($3::date + time '10:00') at time zone 'Europe/Istanbul',($3::date + time '11:00') at time zone 'Europe/Istanbul')
         on conflict do nothing`,
        [u.id, u.tenant, day, channel],
      );
    };
    type ListArgs = { q?: string; view?: string; approval?: string; active?: string; role?: string; payment?: string;
      limit?: number; offset?: number; due?: string; sort?: string; activity?: string; mods?: string[] | null; security?: string; today?: string };
    const list = async (a: ListArgs = {}) => {
      const r = await asRole<{ j: Record<string, unknown> }>("service_role",
        `select public.admin_list_users(p_q=>$1, p_role_match=>null, p_view=>$2, p_approval=>$3, p_active=>$4, p_role=>$5,
           p_payment=>$6, p_limit=>$7, p_offset=>$8, p_due=>$9, p_sort=>$10, p_activity=>$11, p_module_keys=>$12::text[],
           p_security=>$13, p_today=>$14::date) j`,
        [a.q ?? "", a.view ?? "members", a.approval ?? "all", a.active ?? "all", a.role ?? "all", a.payment ?? "all",
          a.limit ?? 100, a.offset ?? 0, a.due ?? "all", a.sort ?? "default", a.activity ?? "all", a.mods ?? null,
          a.security ?? "all", a.today ?? TODAY]);
      const j = r.rows[0].j;
      return { total: Number(j.total), rows: j.rows as Record<string, unknown>[], counts: j.counts as Record<string, number>, measurement: j.measurement as Record<string, unknown> };
    };
    const names = (rows: Record<string, unknown>[]) => rows.map((r) => String(r.full_name)).sort();
    const overview = async (today = TODAY) =>
      (await asRole<{ j: Record<string, unknown> }>("service_role", `select public.admin_member_overview($1::date) j`, [today])).rows[0].j;

    const ADMIN = await mk({ name: "ZZ_M360 Owner Admin", role: "admin", email: "zz.m360.owner@example.test" });
    await su.query(`update public.users set is_super_admin = true where id = $1`, [ADMIN.id]);
    const ADMIN2 = await mk({ name: "ZZ_M360 Normal Admin", role: "admin", email: "zz.m360.admin2@example.test" });
    const INACTIVE_ADMIN = await mk({ name: "ZZ_M360 Pasif Admin", role: "admin", active: false, email: "zz.m360.inactive@example.test" });

    // ── 1) Eski 11 argümanlı çağrı (migration FIRST / code SECOND) ────────────────
    console.log("\n[1] Geriye uyumluluk");
    const legacy = await asRole<{ j: Record<string, unknown> }>("service_role",
      `select public.admin_list_users(p_q=>'', p_role_match=>null, p_view=>'members', p_approval=>'all', p_active=>'all', p_role=>'all',
         p_payment=>'all', p_limit=>20, p_offset=>0, p_due=>'due30', p_sort=>'next_payment_asc') j`);
    ok(legacy.rows[0].j.total !== undefined && Array.isArray(legacy.rows[0].j.rows), "eski kod (11 adlı arg, p_due/p_sort) yeni fonksiyonu çağırabilir");
    const legacy9 = await asRole<{ j: Record<string, unknown> }>("service_role",
      `select public.admin_list_users(p_q=>'', p_role_match=>null, p_view=>'members', p_approval=>'all', p_active=>'all', p_role=>'all',
         p_payment=>'all', p_limit=>20, p_offset=>0) j`);
    ok(Number(legacy9.rows[0].j.total) >= 3, "FAZ 2 9-arg adlı çağrı da çalışır");
    for (const [label, args] of [
      ["bilinmeyen p_activity", { activity: "x" }], ["bilinmeyen p_due", { due: "d1_2" }], ["bilinmeyen p_sort", { sort: "random" }],
      ["bilinmeyen p_security", { security: "maybe" }], ["kötü modül anahtarı", { mods: ["refl'; drop table users;--"] }],
      ["çok fazla modül anahtarı", { mods: ["a_a", "b_b", "c_c", "d_d", "e_e", "f_f", "g_g", "h_h", "i_i"] }],
    ] as [string, ListArgs][]) {
      const c = await errCode(() => list(args));
      ok(c === "UY003", `${label} → UY003 (${c})`);
    }

    // ── 2) Arama: Alperen + Türkçe İ/I/ı/i ─────────────────────────────────────────
    console.log("\n[2] Arama (Türkçe katlama) + sayfalama");
    const alp: U[] = [];
    const alpNames = ["Alperen Işık", "ALPEREN İLHAN", "alperen ılgaz", "Alperen Yıldız", "Ahmet ALPEREN", "Mehmet Alperenoğlu"];
    for (const n of alpNames) alp.push(await mk({ name: `ZZ_M360 ${n}` }));
    for (let i = 0; i < 19; i++) alp.push(await mk({ name: `ZZ_M360 Alperen Sayfa ${String(i).padStart(2, "0")}` }));
    await mk({ name: "ZZ_M360 Alper En" });
    await mk({ name: "ZZ_M360 Eren Alp" });
    await mk({ name: "ZZ_M360 E-posta Eşleşmesi", email: "zz.alperen.mail@example.test" });
    const expectAlp = alpNames.length + 19 + 1; // + e-posta eşleşmesi
    for (const q of ["alperen", "ALPEREN", "Alperen", "aLpErEn", "ALPEREN ", "alpERen"]) {
      const r = await list({ q, limit: 100 });
      ok(r.total === expectAlp, `"${q}" → ${r.total} / beklenen ${expectAlp}`);
    }
    const isik = await list({ q: "ışık" });
    ok(names(isik.rows).join("|") === "ZZ_M360 Alperen Işık", `"ışık" → Işık eşleşir (${names(isik.rows).join(",")})`);
    for (const q of ["IŞIK", "isik", "İŞIK", "Işık"]) {
      const r = await list({ q });
      ok(r.total === 1, `"${q}" → 1 (Türkçe katlama)`);
    }
    const ilhan = await list({ q: "ilhan" });
    ok(ilhan.total === 1, `"ilhan" → "İLHAN" eşleşir`);
    const ilgaz = await list({ q: "ILGAZ" });
    ok(ilgaz.total === 1, `"ILGAZ" → "ılgaz" eşleşir`);
    const pct = await list({ q: "%" });
    ok(pct.total === 0, `"%" LIKE joker olarak yorumlanmaz (${pct.total})`);
    const under = await list({ q: "Alp_ren" });
    ok(under.total === 0, `"_" LIKE joker olarak yorumlanmaz — "Alp_ren" Alperen'i bulmaz (${under.total})`);
    // Sayfalama: 10'arlık 3 sayfa, kesişimsiz, birleşim = tüm eşleşenler
    const seen = new Set<string>();
    const sizes: number[] = [];
    for (let p = 0; p < 4; p++) {
      const r = await list({ q: "alperen", limit: 10, offset: p * 10 });
      sizes.push(r.rows.length);
      for (const row of r.rows) seen.add(String(row.id));
      ok(r.total === expectAlp, `sayfa ${p + 1}: toplam sabit ${r.total}`);
    }
    ok(sizes.join(",") === "10,10,6,0" && seen.size === expectAlp, `sayfalama 10/10/6/0, tekil birleşim ${seen.size}`);
    const az = await list({ q: "alperen", sort: "name_asc", limit: 3 });
    ok(String(az.rows[0].full_name) <= String(az.rows[1].full_name), "A–Z sıralaması (katlamalı) çalışır");

    // ── 3) Ölçüm yok (usage_daily boş) ─────────────────────────────────────────────
    console.log("\n[3] Ölçüm başlamadı (measurementStart NULL)");
    const ov0 = await overview();
    ok((ov0.measurement as Record<string, unknown>).start === null, "overview measurement.start NULL");
    ok(ov0.active7 === null && ov0.active30 === null && ov0.coverage7 === "none", "7/30 gün sayısı NULL (sahte 0 yok), kapsam none");
    ok(ov0.idle30 === null && ov0.idle60 === null && ov0.idle90 === null, "30/60/90 sayacı NULL");
    const l0 = await list({ role: "expert", q: "alperen", limit: 1 });
    ok(l0.rows[0].activity_state === "unmeasured" && l0.rows[0].idle_days_lower_bound === null, "satır: unmeasured, alt sınır yok");
    ok(l0.measurement.start === null && l0.measurement.measured_days === null, "liste measurement.start NULL");
    const unm0 = await list({ activity: "unmeasured", limit: 100 });
    const idle0 = await list({ activity: "idle30" });
    ok(unm0.total > 0 && idle0.total === 0, `ölçüm yokken idle30 boş, unmeasured dolu (${unm0.total})`);

    // ── 4) Kısmi ölçüm (5 gün) ────────────────────────────────────────────────────
    console.log("\n[4] Kısmi ölçüm (5 gündür açık)");
    const P1 = await mk({ name: "ZZ_M360 Kismi Aktif", created: "2025-01-01" });
    await mk({ name: "ZZ_M360 Kismi Hic", created: "2025-01-01" });
    await usage(P1, addDays(TODAY, -4));
    await usage(P1, TODAY);
    const ov1 = await overview();
    const m1 = ov1.measurement as Record<string, unknown>;
    ok(m1.start === addDays(TODAY, -4) && m1.measured_days === 5, `measurement 5 gün (${m1.start}, ${m1.measured_days})`);
    ok(ov1.coverage7 === "partial" && ov1.coverage30 === "partial", "7/30 kapsam partial");
    ok(ov1.idle30 === null && ov1.idle60 === null && ov1.idle90 === null, "5 günlük ölçümde 30/60/90 NULL (tahmin yok)");
    const p2row = (await list({ q: "Kismi Hic" })).rows[0];
    ok(p2row.activity_state === "unmeasured" && Number(p2row.idle_days_lower_bound) === 5, `hiç aktif olmayan: unmeasured, alt sınır 5 (${p2row.idle_days_lower_bound})`);
    const p1row = (await list({ q: "Kismi Aktif" })).rows[0];
    ok(p1row.activity_state === "today" && Number(p1row.d7_active_days) === 2 && Number(p1row.d30_active_days) === 2, "aktif: today, d7=2, d30=2");

    // ── 5) Tam ölçüm senaryoları (100 gün) ─────────────────────────────────────────
    console.log("\n[5] Aktivite durumları (ölçüm 100 gün)");
    await su.query(`delete from public.usage_daily`);
    await su.query(`delete from public.users where full_name like 'ZZ_M360 Kismi%'`);
    const anchor = await mk({ name: "ZZ_M360 Olcum Capasi", created: "2025-01-01" });
    await usage(anchor, addDays(TODAY, -99));
    const S: Record<string, U> = {};
    S.today = await mk({ name: "ZZ_M360 Act Today", created: "2025-01-01" });
    S.d3 = await mk({ name: "ZZ_M360 Act D3", created: "2025-01-01" });
    S.d6 = await mk({ name: "ZZ_M360 Act D6", created: "2025-01-01" });
    S.d7 = await mk({ name: "ZZ_M360 Act D7", created: "2025-01-01" });
    S.d29 = await mk({ name: "ZZ_M360 Act D29", created: "2025-01-01" });
    S.d30 = await mk({ name: "ZZ_M360 Act D30", created: "2025-01-01" });
    S.d65 = await mk({ name: "ZZ_M360 Act D65", created: "2025-01-01" });
    S.d95 = await mk({ name: "ZZ_M360 Act D95", created: "2025-01-01" });
    S.neverOld = await mk({ name: "ZZ_M360 Never Old", created: "2025-01-01" });
    S.neverNew = await mk({ name: "ZZ_M360 Never New", created: addDays(TODAY, -10) });
    S.approved40 = await mk({ name: "ZZ_M360 Never Approved40", created: "2025-01-01", approved: addDays(TODAY, -40) });
    S.demo = await mk({ name: "ZZ_M360 Demo Vitrin", demo: true, created: "2025-01-01" });
    S.passive = await mk({ name: "ZZ_M360 Pasif Uzman", active: false, created: "2025-01-01" });
    await usage(S.today, TODAY); await usage(S.today, TODAY, "android_app");
    await usage(S.today, addDays(TODAY, -1)); await usage(S.today, addDays(TODAY, -8));
    await usage(S.d3, addDays(TODAY, -3)); await usage(S.d6, addDays(TODAY, -6)); await usage(S.d7, addDays(TODAY, -7));
    await usage(S.d29, addDays(TODAY, -29)); await usage(S.d30, addDays(TODAY, -30)); await usage(S.d65, addDays(TODAY, -65));
    await usage(S.d95, addDays(TODAY, -95)); await usage(S.demo, TODAY); await usage(S.passive, addDays(TODAY, -2));
    // Gelecek günlü satır (p_today'den sonra) sayılmaz
    await usage(S.d95, addDays(TODAY, 3));
    const row = async (u: U) => (await list({ view: "all", q: "", limit: 100, role: "expert" })).rows.find((r) => r.id === u.id)!;
    const expectState: [string, string, number | null][] = [
      ["today", "today", 0], ["d3", "d7", 3], ["d6", "d7", 6], ["d7", "d30", 7], ["d29", "d30", 29], ["d30", "idle30", 30],
      ["d65", "idle60", 65], ["d95", "idle90", 95], ["neverOld", "idle90", null], ["neverNew", "unmeasured", null], ["approved40", "idle30", null],
    ];
    for (const [k, st, days] of expectState) {
      const r = await row(S[k]);
      ok(r.activity_state === st && (days === null ? r.days_since_activity === null : Number(r.days_since_activity) === days),
        `${k}: ${r.activity_state}/${r.days_since_activity} (beklenen ${st}/${days})`);
    }
    const nn = await row(S.neverNew);
    ok(Number(nn.idle_days_lower_bound) === 11, `yeni kayıt (10 gün önce): alt sınır kayıt gününden = 11 (${nn.idle_days_lower_bound})`);
    const a40 = await row(S.approved40);
    ok(Number(a40.idle_days_lower_bound) === 41, `40 gün önce onaylı: pencere onay gününden = 41 (${a40.idle_days_lower_bound})`);
    const tr = await row(S.today);
    ok(Number(tr.d7_active_days) === 2 && Number(tr.d30_active_days) === 3, `today: d7=2 (iki kanal aynı gün tek sayılır), d30=3 (${tr.d7_active_days}/${tr.d30_active_days})`);
    const dm = await row(S.demo);
    ok(dm.activity_state === null && dm.d7_active_days === null && dm.is_demo_account === true, "demo: izlenmez (activity_state NULL)");
    const adminRow = (await list({ role: "admin", limit: 100 })).rows[0];
    ok(adminRow.activity_state === null && adminRow.last_activity === null, "yönetici: aktivite alanları NULL");

    const ids = async (a: ListArgs) => new Set((await list({ limit: 100, view: "all", ...a })).rows.map((r) => String(r.id)));
    const has = (set: Set<string>, keys: string[]) => keys.every((k) => set.has(S[k].id));
    const lacks = (set: Set<string>, keys: string[]) => keys.every((k) => !set.has(S[k].id));
    const fToday = await ids({ activity: "today" });
    ok(has(fToday, ["today"]) && lacks(fToday, ["d3", "demo"]), "filtre Bugün");
    const f7 = await ids({ activity: "d7" });
    ok(has(f7, ["today", "d3", "d6"]) && lacks(f7, ["d7", "demo", "neverNew"]) && f7.has(S.passive.id), "filtre Son 7 gün (6 gün önce dahil, 7 hariç; demo yok)");
    const f30 = await ids({ activity: "d30" });
    ok(has(f30, ["today", "d3", "d6", "d7", "d29"]) && lacks(f30, ["d30", "d65"]), "filtre Son 30 gün (29 dahil, 30 hariç)");
    const fi30 = await ids({ activity: "idle30" });
    ok(has(fi30, ["d30", "d65", "d95", "neverOld", "approved40"]) && lacks(fi30, ["d29", "neverNew", "demo"]), "filtre 30+ gün (alt sınır dahil)");
    const fi60 = await ids({ activity: "idle60" });
    ok(has(fi60, ["d65", "d95", "neverOld"]) && lacks(fi60, ["d30", "approved40"]), "filtre 60+ gün");
    const fi90 = await ids({ activity: "idle90" });
    ok(has(fi90, ["d95", "neverOld"]) && lacks(fi90, ["d65"]), "filtre 90+ gün");
    const fun = await ids({ activity: "unmeasured" });
    ok(has(fun, ["neverNew"]) && lacks(fun, ["neverOld", "today", "demo"]), "filtre Ölçülemiyor = penceresi yetersiz");
    const fadm = await list({ activity: "d7", role: "admin" });
    ok(fadm.total === 0, "aktivite filtresi yöneticileri içermez");

    const sDesc = (await list({ sort: "activity_desc", role: "expert", limit: 100, view: "all" })).rows;
    ok(sDesc[0].id === S.today.id || String(sDesc[0].last_activity) >= String(sDesc[1].last_activity), "sıralama Son aktivite: en yeni");
    const sAsc = (await list({ sort: "activity_asc", role: "expert", limit: 100, view: "all" })).rows;
    const firstWithAct = sAsc.findIndex((r) => r.last_activity !== null);
    ok(sAsc.slice(0, firstWithAct).every((r) => r.last_activity === null && r.is_demo_account !== true)
      && sAsc[sAsc.length - 1].is_demo_account === true, "En eski: hiç aktivitesi olmayanlar önce, demo en sonda");
    const sD7 = (await list({ sort: "d7_desc", role: "expert", limit: 5, view: "all" })).rows;
    ok(Number(sD7[0].d7_active_days) >= Number(sD7[1].d7_active_days ?? -1), "sıralama 7g aktif gün");

    const ov2 = await overview();
    const denomQ = await su.query(`select count(*)::int n from public.users where role='expert' and approval_status='approved' and active and not is_demo_account`);
    ok(Number(ov2.denominator) === denomQ.rows[0].n, `payda = demo olmayan onaylı aktif uzman (${ov2.denominator})`);
    ok(ov2.coverage7 === "full" && ov2.coverage30 === "full", "100 gün ölçüm: kapsam full");
    ok(Number(ov2.active7) === 3, `aktif 7g = today+d3+d6 = 3 (${ov2.active7}; demo + pasif hariç)`);
    ok(Number(ov2.active30) === 5, `aktif 30g = today+d3+d6+d7+d29 = 5 (${ov2.active30}; d30/çapa/pasif/demo hariç)`);
    // idle30 = d30,d65,d95,neverOld,approved40 + çapa(99g) + arama/sayfa seed'leri (hepsi 2026-01-01 kayıtlı, hiç aktif değil)
    const seedNever = await su.query(`select count(*)::int n from public.users u where role='expert' and approval_status='approved' and active
       and not is_demo_account and not exists (select 1 from public.usage_daily d where d.user_id=u.id and d.day_tr <= $1::date)
       and greatest((created_at at time zone 'Europe/Istanbul')::date, (coalesce(approved_at,created_at) at time zone 'Europe/Istanbul')::date) <= $1::date - 89`, [TODAY]);
    ok(Number(ov2.idle90) === 2 + seedNever.rows[0].n, `idle90 = d95 + çapa + eski hiç-aktif (${ov2.idle90})`);
    ok(Number(ov2.idle30) >= Number(ov2.idle60) && Number(ov2.idle60) >= Number(ov2.idle90), "idle30 ≥ idle60 ≥ idle90 (kümülatif)");
    // 60 günlük ölçüm: idle90 NULL, idle60 sayı
    const ov60 = await overview(addDays(addDays(TODAY, -99), 64)); // ölçüm 65 gün
    ok(ov60.idle90 === null && ov60.idle60 !== null && ov60.idle30 !== null, "65 günlük ölçüm: 90+ NULL, 60+/30+ sayı");

    // ── 6) Ödeme kovaları (sınırlar) ─────────────────────────────────────────────
    console.log("\n[6] Ödeme / yenileme kovaları");
    const offs = [0, 7, 8, 30, 31, 60, 61, 90, 91, -1];
    const D: Record<string, U> = {};
    for (const o of offs) D[o] = await mk({ name: `ZZ_M360 Due ${o}`, payment: "pending", npd: addDays(TODAY, o) });
    D.none = await mk({ name: "ZZ_M360 Due None", payment: "pending", npd: null });
    D.exempt = await mk({ name: "ZZ_M360 Due Exempt", payment: "exempt", npd: addDays(TODAY, 3) });
    D.passive = await mk({ name: "ZZ_M360 Due Passive", active: false, payment: "pending", npd: addDays(TODAY, 3) });
    const dueSet = async (due: string) => new Set((await list({ due, q: "Due", limit: 100, view: "all" })).rows.map((r) => String(r.full_name).replace("ZZ_M360 Due ", "")));
    const expectDue: [string, string[]][] = [
      ["overdue", ["-1"]], ["d0_7", ["0", "7"]], ["d8_30", ["8", "30"]], ["d31_60", ["31", "60"]],
      ["d61_90", ["61", "90"]], ["d90p", ["91"]], ["no_date", ["None"]], ["due30", ["0", "7", "8", "30"]],
    ];
    for (const [due, exp] of expectDue) {
      const got = [...(await dueSet(due))].sort();
      ok(got.join(",") === [...exp].sort().join(","), `p_due=${due} → [${got.join(",")}] (beklenen ${exp.join(",")}) — muaf/pasif hariç`);
    }
    const ov3 = await overview();
    const payQ = await su.query(`select
        count(*) filter (where next_payment_date < $1::date)::int o,
        count(*) filter (where next_payment_date between $1::date and $1::date + 7)::int d7,
        count(*) filter (where next_payment_date between $1::date and $1::date + 30)::int d30
       from public.users where role='expert' and approval_status='approved' and active and coalesce(payment_status,'') <> 'exempt'`, [TODAY]);
    ok(Number(ov3.payment_overdue) === payQ.rows[0].o && Number(ov3.payment_due7) === payQ.rows[0].d7 && Number(ov3.payment_due30) === payQ.rows[0].d30,
      `overview ödeme sayaçları liste kümesiyle aynı (${ov3.payment_overdue}/${ov3.payment_due7}/${ov3.payment_due30})`);
    const sortNp = (await list({ due: "all", q: "Due", sort: "next_payment_asc", limit: 100, view: "all" })).rows;
    ok(String(sortNp[0].full_name).endsWith("Due -1") && sortNp[sortNp.length - 1].next_payment_date === null, "Sonraki ödeme: en yakın (NULL sonda)");

    // ── 7) Modül + güvenlik filtresi ─────────────────────────────────────────────
    console.log("\n[7] Modül + güvenlik filtresi");
    const M1 = await mk({ name: "ZZ_M360 Mod Canon", perms: { reflexology: true } });
    const M2 = await mk({ name: "ZZ_M360 Mod Alias", perms: { refleksoloji: true } });
    const M3 = await mk({ name: "ZZ_M360 Mod AliasOverride", perms: { reflexology: false, refleksoloji: true } });
    const M4 = await mk({ name: "ZZ_M360 Mod Off", perms: { reflexology: false, numerology: true } });
    await mk({ name: "ZZ_M360 Mod String", perms: { reflexology: "true" } });
    const modSet = new Set((await list({ q: "Mod", mods: ["reflexology", "refleksoloji"], limit: 100 })).rows.map((r) => String(r.id)));
    ok(modSet.size === 3 && modSet.has(M1.id) && modSet.has(M2.id) && modSet.has(M3.id) && !modSet.has(M4.id),
      `modül filtresi = canonical VEYA alias true (parseAdminModulePermissions ile aynı) (${modSet.size})`);
    const numSet = await list({ q: "Mod", mods: ["numerology", "numeroloji"] });
    ok(numSet.total === 1, "numeroloji filtresi");
    await su.query(`insert into public.security_events(user_id, event_type, severity) values ($1,'x','high'),($2,'x','low'),($3,'x','medium')`,
      [M1.id, M2.id, D.passive.id]);
    const sec = await list({ security: "alert", q: "ZZ_M360", limit: 100 });
    ok(sec.total === 1 && sec.rows[0].id === M1.id, `güvenlik filtresi: yalnız orta/yüksek (low hariç; arşiv görünüm dışı) (${sec.total})`);
    const ov4 = await overview();
    ok(Number(ov4.security_alerts) === 1, `overview güvenlik sayacı = arşiv dışı orta/yüksek (${ov4.security_alerts})`);
    // Kombinasyon: aktivite + ödeme + modül + arama + sayfalama birlikte
    const combo = await list({ activity: "idle90", due: "all", mods: ["reflexology", "refleksoloji"], q: "Mod", limit: 2 });
    ok(combo.total === 3 && combo.rows.length === 2, `kombinasyon (90+ · modül · arama · sayfa) toplam ${combo.total}`);
    const counts = combo.counts;
    ok(typeof counts.experts_total === "number" && counts.experts_total === counts.pending + counts.approved_active + counts.archived + counts.rejected,
      "global sayaçlar korunur (bölümleme)");

    // ── 8) Fiyat dönemleri ────────────────────────────────────────────────────────
    console.log("\n[8] Fiyat dönemleri");
    const E = await mk({ name: "ZZ_M360 Fiyat Uzman", payment: "pending" });
    const save = (actor: string, user: string, phase: string | null, s: string, e: string | null, amt: number | string, per: string,
      label: string | null = null, note: string | null = null, expected: string | null = null) =>
      asRole<{ j: Record<string, unknown> }>("service_role",
        `select public.admin_pricing_phase_save($1,$2,$3,$4::date,$5::date,$6::numeric,$7,$8,$9,$10::timestamptz) j`,
        [actor, user, phase, s, e, amt, per, label, note, expected]).then((r) => r.rows[0].j);
    const auditCount = async () => Number((await su.query(`select count(*) n from public.admin_audit_log where action='pricing_phase_changed' and target_user_id=$1`, [E.id])).rows[0].n);
    const p1 = await save(ADMIN2.id, E.id, null, "2026-10-01", "2027-02-28", 200, "monthly", "Tanışma fiyatı", "İlk 5 ay");
    const phase1 = p1.phase as Record<string, unknown>;
    ok(p1.ok === true && p1.op === "created" && !("user_id" in phase1), "normal admin dönem ekler (200/Ay, 01.10.2026–28.02.2027)");
    const p2 = await save(ADMIN.id, E.id, null, "2027-03-01", null, 600, "monthly");
    ok(p2.ok === true, "bitişik açık uçlu dönem (01.03.2027 →) kabul");
    const ov = await errCode(() => save(ADMIN.id, E.id, null, "2027-02-15", "2027-03-15", 400, "monthly"));
    ok(ov === "UY004", `çakışan aralık reddedilir (${ov})`);
    const ovOpen = await errCode(() => save(ADMIN.id, E.id, null, "2030-01-01", null, 700, "yearly"));
    ok(ovOpen === "UY004", `açık uçlu dönemden sonrasına yeni dönem çakışır (${ovOpen})`);
    const ovSame = await errCode(() => save(ADMIN.id, E.id, null, "2027-02-28", "2027-02-28", 1, "monthly"));
    ok(ovSame === "UY004", "uç gün (bitiş dahil) çakışması reddedilir");
    const before = await errCode(() => save(ADMIN.id, E.id, null, "2026-01-01", "2026-09-30", 0, "yearly", "Ücretsiz deneme"));
    ok(before === null, "öncesine bitişik dönem kabul (0 TL)");
    const badIn = [
      ["negatif tutar", () => save(ADMIN.id, E.id, null, "2031-01-01", null, -1, "monthly")],
      ["3 ondalık", () => save(ADMIN.id, E.id, null, "2031-01-01", null, "1.005", "monthly")],
      ["bilinmeyen dönem", () => save(ADMIN.id, E.id, null, "2031-01-01", null, 1, "weekly")],
      ["bitiş < başlangıç", () => save(ADMIN.id, E.id, null, "2031-02-01", "2031-01-01", 1, "monthly")],
      ["uzun etiket", () => save(ADMIN.id, E.id, null, "2031-01-01", null, 1, "monthly", "x".repeat(81))],
      ["uzun not", () => save(ADMIN.id, E.id, null, "2031-01-01", null, 1, "monthly", null, "x".repeat(501))],
    ] as [string, () => Promise<unknown>][];
    for (const [label, fn] of badIn) {
      const c = await errCode(fn);
      ok(c === "UY003", `${label} → UY003 (${c})`);
    }
    const nonExpert = await errCode(() => save(ADMIN.id, ADMIN2.id, null, "2026-01-01", null, 1, "monthly"));
    ok(nonExpert === "UY002", `yönetici hedefinde dönem yok → UY002 (${nonExpert})`);
    const inactive = await errCode(() => save(INACTIVE_ADMIN.id, E.id, null, "2032-01-01", null, 1, "monthly"));
    ok(inactive !== null && inactive !== "UY004", `pasif admin aktör reddedilir (${inactive})`);
    const expertActor = await errCode(() => save(E.id, E.id, null, "2032-01-01", null, 1, "monthly"));
    ok(expertActor !== null, "uzman aktör olamaz");
    const nAudit = await auditCount();
    ok(nAudit === 3, `audit: yalnız başarılı 3 yazım (${nAudit})`);
    const aud = await su.query(`select context, old_value, new_value, actor_is_main_admin from public.admin_audit_log
      where action='pricing_phase_changed' and target_user_id=$1 order by created_at`, [E.id]);
    const ctxJson = JSON.stringify(aud.rows.map((r) => r.context));
    ok(!/200|600|Tanışma|İlk 5 ay|amount":\s*\d/.test(ctxJson) && aud.rows.every((r) => r.old_value === null && r.new_value === null),
      "audit context'inde tutar/etiket/not DEĞERİ yok");
    ok(aud.rows[0].actor_is_main_admin === false && aud.rows[1].actor_is_main_admin === true, "actor_is_main_admin DB'den türetilir");
    // Güncelleme: no-op / bayat / gerçek
    const ph1 = phase1.id as string;
    const upd0 = await save(ADMIN.id, E.id, ph1, "2026-10-01", "2027-02-28", 200, "monthly", "Tanışma fiyatı", "İlk 5 ay", String(phase1.updated_at));
    ok(upd0.changed === false && (await auditCount()) === 3, "değişiklik yok → changed:false, audit YOK");
    const stale = await errCode(() => save(ADMIN.id, E.id, ph1, "2026-10-01", "2027-02-28", 250, "monthly", null, null, "2020-01-01T00:00:00Z"));
    ok(stale === "UY001", `bayat expected_updated_at → UY001 (${stale})`);
    const upd = await save(ADMIN.id, E.id, ph1, "2026-10-01", "2027-02-28", 250, "monthly", "Tanışma fiyatı", null, String(phase1.updated_at));
    ok(upd.changed === true && JSON.stringify(upd.fields) === JSON.stringify(["amount", "terms_note"]), `güncelleme alan adları ${JSON.stringify(upd.fields)}`);
    const updOv = await errCode(() => save(ADMIN.id, E.id, ph1, "2026-10-01", "2027-03-05", 250, "monthly"));
    ok(updOv === "UY004", "güncellemede çakışma da reddedilir");
    const otherUser = await errCode(() => save(ADMIN.id, M1.id, ph1, "2026-10-01", null, 1, "monthly"));
    ok(otherUser === "UY003", "başka uzmanın dönem id'si ile güncelleme → bulunamadı");
    const listed = await asRole<{ j: unknown[] }>("service_role", `select public.admin_pricing_phase_list($1) j`, [E.id]);
    const lp = listed.rows[0].j as Record<string, unknown>[];
    ok(lp.length === 3 && lp[0].starts_on === "2026-01-01" && lp[2].ends_on === null, "liste başlangıca göre sıralı, açık uçlu son");
    // Eşzamanlı çakışan iki ekleme → biri başarısız
    const F = await mk({ name: "ZZ_M360 Fiyat Yaris" });
    const results = await Promise.allSettled([
      save(ADMIN.id, F.id, null, "2027-01-01", "2027-06-30", 100, "monthly"),
      save(ADMIN2.id, F.id, null, "2027-03-01", "2027-12-31", 200, "monthly"),
      save(ADMIN.id, F.id, null, "2027-05-01", null, 300, "monthly"),
    ]);
    const okN = results.filter((r) => r.status === "fulfilled").length;
    const rejCodes = results.filter((r) => r.status === "rejected").map((r) => ((r as PromiseRejectedResult).reason as { code?: string }).code);
    ok(okN === 1 && rejCodes.every((c) => c === "UY004"), `eşzamanlı 3 çakışan yazımdan yalnız 1'i kabul (${okN}; ${rejCodes.join(",")})`);
    const direct = await errCode(() => su.query(`insert into public.member_pricing_phases(user_id, starts_on, amount, billing_period) values ($1,'2027-02-01',1,'monthly')`, [F.id]));
    ok(direct === "UY004", "doğrudan (RPC dışı) yazımda da tetikleyici çakışmayı engeller");
    // Silme
    const del = await asRole<{ j: Record<string, unknown> }>("service_role", `select public.admin_pricing_phase_delete($1,$2,$3,null) j`, [ADMIN.id, E.id, ph1]);
    ok(del.rows[0].j.deleted === true && (await auditCount()) === 5, "silme + audit (op=deleted)");
    const delAgain = await errCode(() => asRole("service_role", `select public.admin_pricing_phase_delete($1,$2,$3,null)`, [ADMIN.id, E.id, ph1]));
    ok(delAgain === "UY003", "olmayan dönemi silme → UY003");

    // ── 9) Ölçek: 5000 sentetik uzman ───────────────────────────────────────────
    console.log("\n[9] Ölçek (5000 uzman + 100 günlük rollup)");
    await su.query(`
      with t as (
        insert into public.tenants(id, name, slug, status)
        select gen_random_uuid(), 'ZZ', 'zz-bulk-' || g, 'active' from generate_series(1, 5000) g returning id, slug
      )
      insert into public.users(id, full_name, email, role, active, approval_status, created_at, approved_at, payment_status,
                               next_payment_date, module_permissions, tenant_id)
      select gen_random_uuid(), 'ZZ_M360 Bulk ' || substr(t.slug, 9), 'zz.bulk.' || substr(t.slug, 9) || '@example.test', 'expert',
             (substr(t.slug, 9)::int % 10) <> 0, 'approved', timestamptz '2025-06-01', timestamptz '2025-06-02',
             'pending', date '${TODAY}' + ((substr(t.slug, 9)::int % 200) - 50),
             jsonb_build_object('reflexology', (substr(t.slug, 9)::int % 3) = 0), t.id
        from t`);
    await su.query(`
      insert into public.usage_daily(user_id, tenant_id, day_tr, channel, visits, active_seconds, first_at, last_at)
      select u.id, u.tenant_id, d::date, 'desktop_web', 1, 60, d + time '10:00', d + time '11:00'
        from public.users u
        join lateral generate_series(date '${TODAY}' - 99, date '${TODAY}', interval '1 day') d
          on (abs(hashtext(u.id::text || d::text)) % 100) < 35
       where u.full_name like 'ZZ_M360 Bulk %' and (abs(hashtext(u.id::text)) % 4) <> 0`);
    await su.query("analyze");
    const nDaily = Number((await su.query(`select count(*) n from public.usage_daily`)).rows[0].n);
    const timed = async (label: string, a: ListArgs, maxMs: number) => {
      const t0 = Date.now();
      const r = await list(a);
      const ms = Date.now() - t0;
      ok(ms < maxMs && r.rows.length <= (a.limit ?? 100), `${label}: ${ms} ms (< ${maxMs}), toplam ${r.total}, sayfa ${r.rows.length}`);
      return r;
    };
    console.log(`    usage_daily satırı: ${nDaily}`);
    await timed("varsayılan liste (sayfa 1)", { limit: 20 }, 2500);
    await timed("aktivite filtresi 30+ gün", { activity: "idle30", limit: 20 }, 2500);
    await timed("sıralama son aktivite (en eski)", { sort: "activity_asc", limit: 20, offset: 1000 }, 2500);
    await timed("ödeme kovası 8–30 + modül + 7g sıralama", { due: "d8_30", mods: ["reflexology", "refleksoloji"], sort: "d7_desc", limit: 50 }, 2500);
    await timed("arama + son sayfa", { q: "bulk 49", limit: 50, offset: 100 }, 2500);
    const t0 = Date.now();
    const ovBig = await overview();
    const ovMs = Date.now() - t0;
    ok(ovMs < 2500 && Number(ovBig.denominator) > 4000, `overview 5000+ uzman: ${ovMs} ms, payda ${ovBig.denominator}`);
    // Sayfa gezinme tutarlılığı: 20'lik sayfalarla ilk 200 satır tekil
    const seenBulk = new Set<string>();
    for (let p = 0; p < 10; p++) for (const r of (await list({ sort: "activity_desc", limit: 20, offset: p * 20 })).rows) seenBulk.add(String(r.id));
    ok(seenBulk.size === 200, `aktivite sıralamasında 10 sayfa × 20 = 200 tekil satır (${seenBulk.size}; deterministik tiebreak)`);
    const someUser = (await su.query(`select user_id from public.usage_daily limit 1`)).rows[0].user_id;
    const plan = await su.query(`explain (format text) select d.day_tr, d.last_at from public.usage_daily d
       where d.user_id = $1 and d.day_tr <= $2::date order by d.day_tr desc, d.last_at desc limit 1`, [someUser, TODAY]);
    const planText = plan.rows.map((r) => String(r["QUERY PLAN"])).join(" | ");
    ok(/Index/.test(planText) && !/Seq Scan on usage_daily/.test(planText), "son-aktivite LATERAL'i rollup PK indeksini kullanır (Seq Scan yok)");
    const evRead = await su.query(`select prosrc from pg_proc where proname in ('admin_list_users','admin_member_overview')`);
    ok(evRead.rows.every((r) => !/expert_usage_events|usage_visits|clients|client_|anamnes|notes/.test(r.prosrc)),
      "liste/özet RPC'leri ham olay / danışan / not tablolarına dokunmaz");
  } finally {
    await db.stop();
  }

  console.log(`\nÜYE YÖNETİMİ 360 · DB: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.error("Başarısız:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
