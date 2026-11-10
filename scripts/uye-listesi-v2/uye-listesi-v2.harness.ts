/**
 * ÜYE LİSTESİ V2 (Admin Üye Yönetimi V2 · Aşama 2) — DB + ROUTE harness'ı.
 * Gerçek PostgreSQL (embedded) + gerçek migration zinciri (trial7 → H2 → owner zili → liste V2) + gerçek RPC'ler +
 * gerçek Next route handler'ları (test-only PostgREST shim). Production'a / ağa SIFIR temas; tüm hesaplar sentetik.
 *
 *   M  migration 2×: mevcut satırlar / fonksiyonlar değişmez; yetkiler (yalnız service_role)
 *   A  aşama: 500 sentetik üye için SQL aşaması = bağımsız TS kuralı (oracle) — başlamamış deneme ≠ deneme, Pro ≠ deneme
 *   S  sayaçlar + 15 hazır filtrenin her biri oracle ile birebir; demo ticari sayılara girmez ama listede görünür
 *   Q  arama (Türkçe katlama) + modül + ödeme + rol + sıralama + sayfalama tutarlılığı (sayfalar birleşimi = toplam)
 *   K  karar bekleyen = Owner zili açık karar sayısı (tür bazında); liste çağrısı zil kaydı ÇOĞALTMAZ
 *   Y  yetki: uzman / pasif admin / boş aktör → UY401; route: kimliksiz 401, uzman token 401/403, sahte owner 401/403
 *   R  route: şekil, geçersiz parametre 400, DB hatası 500 (sıfır sayaç dönmez)
 *   E  eski admin_list_users ve Deneme Üyeleri (admin_trial_list + /api/admin/trials) aynen çalışır
 *   U  URL: klasik parametrelerle gelen bağlantı klasik listeye; detaydan dönüş V2 filtresini korur
 *   P  500 üyede süre
 *
 * Çalıştır: npx tsx scripts/uye-listesi-v2/uye-listesi-v2.harness.ts
 */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";
import { foldTr, memberListReturnHref } from "../../lib/admin/memberListQuery";
import { legacyMemberListRedirect, parseMemberV2Query, memberV2QueryToSearch, DEFAULT_MEMBER_V2_QUERY } from "../../lib/admin/memberListV2";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 600)}`}`);
  }
}

const OWNER = "00000000-0000-4000-8000-0000000018a1";
const ADMIN2 = "00000000-0000-4000-8000-0000000018a2";
const ADMIN_OFF = "00000000-0000-4000-8000-0000000018a3";
const TOK = { owner: "zz-l2-owner-token-0001", admin2: "zz-l2-admin2-token-0001" };
const H = 3_600_000;
const D = 86_400_000;

type Seed = {
  id: string; name: string; email: string; role: "expert" | "admin"; approval: string; active: boolean; demo: boolean;
  pkg: string | null; plan: string; tk: string | null; ts: string | null; t0: number | null; te: number | null;
  pay: string | null; npd: string | null; created: number; mods: Record<string, boolean>; login: number | null; proReq: boolean;
};

// ── Bağımsız oracle (SQL'e bakmadan, ürün kuralından) ───────────────────────────
function oracleStage(u: Seed, now: number): string {
  if (u.role === "admin") return "yonetici";
  if (u.demo) return "demo";
  const a = u.approval.toLowerCase();
  if (a === "" || a === "pending") return "basvuru";
  if (a === "rejected") return "red";
  if (!u.active) return "arsiv";
  const pkg = (u.pkg && u.pkg.trim() ? u.pkg : u.plan || "").trim().toLowerCase();
  if (u.tk) {
    const premiumPkg = (u.pkg ?? "").toLowerCase() === "premium";
    if (!(u.ts === "converted" || premiumPkg)) {
      if (u.ts === "review") return "inceleme";
      if (u.ts === "suspended") return "deneme_durdu";
      if (u.ts === "not_started") return "deneme_baslamadi";
      if (u.ts === "active") return u.te !== null && u.te > now ? "deneme" : "deneme_bitti";
    }
  }
  return pkg === "premium" ? "pro" : "eski_kayit";
}
function istDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(ms));
}

async function main(): Promise<void> {
  const port = 59000 + Math.floor(Math.random() * 900);
  const db = await startTestDb(port, `uye-listesi-v2-${port}`);
  const { su } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    for (const f of [
      "20271230000000_astrology_technique_grants.sql",
      "20280101000000_trial7_self_trial.sql",
      "20280101000100_trial7_claims_retention.sql",
      "20280101000200_trial7_admin_trial_approval.sql",
      "20280101000300_admin_legacy_package_repair.sql",
      "20280101000400_admin_owner_notifications.sql",
    ]) await su.query(readMig(f));

    const tenant = async () => {
      const id = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]);
      return id;
    };
    for (const [id, sup, act] of [[OWNER, true, true], [ADMIN2, false, true], [ADMIN_OFF, false, false]] as [string, boolean, boolean][]) {
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id, created_at)
         values ($1,$2,$3,'admin',$4,'approved',$5,$6,$7, now() - interval '400 days')`,
        [id, `ZZ_L2 Yönetici ${id.slice(-2)}`, `zz.l2.admin.${id.slice(-2)}@example.test`, act, sup, sup ? "owner" : "admin", await tenant()],
      );
    }
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4)`, [OWNER, TOK.owner, ADMIN2, TOK.admin2]);

    // ── 500 sentetik üye (deterministik) ─────────────────────────────────────
    const NOW = Date.now();
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pickOf = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
    const MODKEYS = ["clients", "numerology", "human_design", "stones", "reflexology", "appointments"];
    const NAMES = ["Şule Çınar", "İsmail Öztürk", "Ayşe Yılmaz", "Gülşen Ünal", "Ömer Işık", "Çağla Doğan", "Ilgaz Şahin", "Ümran Güneş"];
    const kinds = ["pending", "pending_blank", "rejected", "archived", "trial_ns", "trial_act", "trial_soon", "trial_exp", "trial_review",
      "trial_susp", "trial_conv", "pro_paid", "pro_past", "pro_next7", "pro_nodate", "pro_exempt", "pro_overdue", "legacy", "demo"] as const;
    const seeds: Seed[] = [];
    for (let i = 0; i < 500; i++) {
      const k = kinds[i % kinds.length];
      const id = randomUUID();
      const name = `${pickOf(NAMES)} ZZL2-${String(i).padStart(3, "0")}`;
      const createdAgo = i % 23 === 0 ? rnd() * 2 * H : i % 5 === 0 ? rnd() * 6 * D : 10 * D + rnd() * 300 * D;
      const s: Seed = {
        id, name, email: `zz.l2.${i}.${id.slice(0, 6)}@example.test`, role: "expert", approval: "approved", active: true, demo: false,
        pkg: null, plan: "trial", tk: null, ts: null, t0: null, te: null, pay: null, npd: null,
        created: NOW - createdAgo, mods: Object.fromEntries(MODKEYS.map((m) => [m, rnd() < 0.4])),
        login: rnd() < 0.7 ? NOW - rnd() * 40 * D : null, proReq: false,
      };
      const trial = (ts: string, t0: number | null, te: number | null) => { s.tk = "self_7d"; s.ts = ts; s.t0 = t0; s.te = te; s.pkg = "trial"; };
      const pro = (pay: string, npd: string | null) => { s.pkg = "premium"; s.plan = "premium"; s.pay = pay; s.npd = npd; };
      switch (k) {
        case "pending": s.approval = "pending"; s.active = false; break;
        case "pending_blank": s.approval = ""; s.active = false; break;
        case "rejected": s.approval = "rejected"; s.active = false; break;
        case "archived": s.active = false; pro("paid", istDay(NOW + 20 * D)); break;
        case "trial_ns": trial("not_started", null, null); break;
        case "trial_act": trial("active", NOW - 2 * D, NOW + 5 * D); s.proReq = i % 3 === 0; break;
        case "trial_soon": trial("active", NOW - 6 * D, NOW + (6 + rnd() * 40) * H); break;
        case "trial_exp": trial("active", NOW - 9 * D, NOW - 2 * D); s.proReq = i % 2 === 0; break;
        case "trial_review": trial("review", NOW - D, NOW + 6 * D); break;
        case "trial_susp": trial("suspended", NOW - D, NOW + 6 * D); break;
        case "trial_conv": trial("converted", NOW - 10 * D, NOW - 3 * D); pro("paid", istDay(NOW + 25 * D)); break;
        case "pro_paid": pro("paid", istDay(NOW + 20 * D)); break;
        case "pro_past": pro("pending", istDay(NOW - 3 * D)); break;
        case "pro_next7": pro("paid", istDay(NOW + 4 * D)); break;
        case "pro_nodate": pro("paid", null); break;
        case "pro_exempt": pro("exempt", null); break;
        case "pro_overdue": pro("overdue", istDay(NOW - 10 * D)); break;
        case "legacy": s.pkg = null; s.plan = "trial"; break;
        case "demo": s.demo = true; trial("active", NOW - D, NOW + 6 * D); break;
      }
      seeds.push(s);
    }
    const t0 = Date.now();
    for (const s of seeds) {
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_demo_account, package_type, plan, trial_kind, trial_status,
                                  trial_started_at, trial_ends_at, payment_status, next_payment_date, module_permissions, tenant_id, created_at)
         values ($1,$2,$3,'expert',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::date,$15,$16,$17)`,
        [s.id, s.name, s.email, s.active, s.approval, s.demo, s.pkg, s.plan, s.tk, s.ts,
          s.t0 === null ? null : new Date(s.t0), s.te === null ? null : new Date(s.te), s.pay, s.npd, JSON.stringify(s.mods), await tenant(), new Date(s.created)],
      );
      if (s.login !== null) await su.query(`insert into public.user_sessions(user_id, session_token, created_at) values ($1,$2,$3)`, [s.id, `zz-l2-${s.id}`, new Date(s.login)]);
      if (s.proReq) await su.query(`insert into public.pro_upgrade_requests(user_id, note) values ($1,'zz')`, [s.id]);
    }
    console.log(`  · 500 üye tohumlandı (${Date.now() - t0} ms)`);
    // Trial modül temizliği tetikleyicisi deneme üyelerinin modüllerini değiştirebilir → oracle için DB'den geri oku.
    const modRows = (await su.query(`select id, module_permissions from public.users`)).rows as { id: string; module_permissions: Record<string, boolean> }[];
    const modById = new Map(modRows.map((r) => [r.id, r.module_permissions ?? {}]));
    for (const s of seeds) s.mods = modById.get(s.id) as Record<string, boolean>;

    console.log("[M] Migration");
    const fp = `select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''), ',' order by p.oid::regprocedure::text)) h
                  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname not in ('admin_member_stage_of','admin_list_members_v2')`;
    const usersSql = `select md5(string_agg(u::text, E'\\n' order by u.id)) h from public.users u`;
    const before = { f: (await su.query(fp)).rows[0].h, u: (await su.query(usersSql)).rows[0].h };
    await su.query(readMig("20280101000500_admin_list_members_v2.sql"));
    await su.query(readMig("20280101000500_admin_list_members_v2.sql"));
    ok((await su.query(fp)).rows[0].h === before.f, "M1 migration 2× uygulandı; mevcut hiçbir fonksiyon (gövde / yetki) değişmedi");
    ok((await su.query(usersSql)).rows[0].h === before.u, "M2 hiçbir kullanıcı satırı değişmedi (yalnız görüntüleme)");
    const acl = (await su.query(`select p.proname, has_function_privilege('anon', p.oid,'EXECUTE') a, has_function_privilege('authenticated', p.oid,'EXECUTE') au,
        has_function_privilege('service_role', p.oid,'EXECUTE') s, p.prosecdef d, array_to_string(p.proconfig, ',') cfg
      from pg_proc p where p.proname in ('admin_member_stage_of','admin_list_members_v2')`)).rows as Record<string, unknown>[];
    ok(acl.length === 2 && acl.every((r) => r.a === false && r.au === false && r.s === true && String(r.cfg).includes("search_path")),
      "M3 iki fonksiyon: sabit search_path; anon/authenticated çalıştıramaz, yalnız service_role", acl);
    ok(acl.find((r) => r.proname === "admin_list_members_v2")?.d === true, "M4 liste fonksiyonu SECURITY DEFINER; aktörü DB'de doğrular");

    const list = async (args: Record<string, unknown>, actor = OWNER) =>
      (await su.query(`select public.admin_list_members_v2($1,$2,$3,$4,$5,$6,$7,$8,$9) r`, [actor, args.f ?? "all", args.q ?? "", args.rol ?? "expert",
        args.mods ?? null, args.pay ?? "all", args.sort ?? "attn", args.limit ?? 100, args.offset ?? 0])).rows[0].r;
    const all = async (args: Record<string, unknown>) => {
      const out: Record<string, unknown>[] = [];
      for (let off = 0; ; off += 100) {
        const r = await list({ ...args, offset: off });
        out.push(...r.rows);
        if (out.length >= r.total || r.rows.length === 0) return { rows: out, res: r };
      }
    };

    console.log("\n[A] Aşama (SQL = bağımsız kural)");
    const NOW2 = Date.now();
    const stageRows = (await su.query(`select id, public.admin_member_stage_of(role, approval_status, active, is_demo_account, package_type, plan,
        trial_kind, trial_status, trial_ends_at, now()) st from public.users where full_name like '%ZZL2-%'`)).rows as { id: string; st: string }[];
    const sqlStage = new Map(stageRows.map((r) => [r.id, r.st]));
    const mism = seeds.filter((s) => sqlStage.get(s.id) !== oracleStage(s, NOW2));
    ok(mism.length === 0, `A1 500 üyenin aşaması bağımsız kuralla birebir (uyuşmayan ${mism.length})`, mism.slice(0, 3).map((s) => [s.ts, s.pkg, sqlStage.get(s.id), oracleStage(s, NOW2)]));
    const ns = seeds.filter((s) => s.ts === "not_started");
    ok(ns.every((s) => sqlStage.get(s.id) === "deneme_baslamadi"), `A2 başlamamış deneme (${ns.length}) “Denemede” sayılmaz`);
    const conv = seeds.filter((s) => s.ts === "converted");
    ok(conv.every((s) => sqlStage.get(s.id) === "pro"), `A3 Pro'ya geçmiş deneme (${conv.length}) Pro aşamasında; deneme sayılmaz`);
    ok(seeds.filter((s) => s.pkg === "premium" && s.active && s.approval === "approved" && !s.demo).every((s) => sqlStage.get(s.id) === "pro"),
      "A4 aktif Premium üye hiçbir zaman deneme aşamasında görünmez");
    // trial_phase_of ile uyum (tek kaynak)
    const phaseMismatch = (await su.query(`select count(*)::int n from public.users u
       where trial_kind is not null and approval_status='approved' and active and not coalesce(is_demo_account,false)
         and (public.trial_phase_of(trial_kind, trial_status, package_type, trial_ends_at) = 'active') <> (public.admin_member_stage_of(role, approval_status, active, is_demo_account, package_type, plan, trial_kind, trial_status, trial_ends_at, now()) = 'deneme')`)).rows[0].n;
    ok(phaseMismatch === 0, "A5 “Denemede” = mevcut trial_phase_of 'active' (erişim kuralıyla aynı kaynak)");

    console.log("\n[S] Sayaçlar + 15 hazır filtre");
    const r0 = await list({});
    const commercial = seeds.filter((s) => !s.demo);
    const today = istDay(NOW2);
    const st = (s: Seed) => oracleStage(s, NOW2);
    const payCheck = (s: Seed) => st(s) === "pro" && s.pay !== "exempt" && (s.pay === "overdue" || (s.npd !== null && s.npd < today));
    const payNext = (s: Seed) => st(s) === "pro" && s.pay !== "exempt" && s.pay !== "overdue" && s.npd !== null && s.npd >= today && s.npd <= istDay(NOW2 + 7 * D);
    const soon = (s: Seed) => st(s) === "deneme" && (s.te as number) <= NOW2 + 48 * H;
    const exp = {
      today: commercial.filter((s) => istDay(s.created) === today).length,
      trial: commercial.filter((s) => st(s) === "deneme").length,
      not_started: commercial.filter((s) => st(s) === "deneme_baslamadi").length,
      pro: commercial.filter((s) => st(s) === "pro").length,
      pro_exempt: commercial.filter((s) => st(s) === "pro" && s.pay === "exempt").length,
      ended: commercial.filter((s) => st(s) === "deneme_bitti").length,
      soon: commercial.filter(soon).length,
      pay_check: commercial.filter(payCheck).length,
      pay_next: commercial.filter(payNext).length,
      demo: seeds.filter((s) => s.demo).length,
    };
    ok(Object.keys(exp).every((k) => r0.counts[k] === exp[k as keyof typeof exp]) && Object.keys(r0.counts).length === Object.keys(exp).length, "S1 beş gösterge + ek sayaçlar bağımsız hesapla birebir", { got: r0.counts, exp });
    ok(r0.counts.demo > 0 && r0.counts.trial === commercial.filter((s) => st(s) === "deneme").length,
      `S2 demo hesaplar (${exp.demo}) ticari sayılara girmez (Denemede yalnız gerçek uzmanlar)`);
    const presetOracle: Record<string, (s: Seed) => boolean> = {
      all: (s) => st(s) !== "arsiv",
      basvuru: (s) => st(s) === "basvuru",
      trial: (s) => st(s) === "deneme",
      bitti: (s) => st(s) === "deneme_bitti",
      pro: (s) => st(s) === "pro",
      prores: (s) => s.proReq && st(s) !== "pro",
      yeni: (s) => !s.demo && s.created >= NOW2 - 7 * D,
      notstarted: (s) => st(s) === "deneme_baslamadi",
      inceleme: (s) => st(s) === "inceleme",
      pay: payCheck,
      paynext: payNext,
      soon,
      eski: (s) => st(s) === "eski_kayit",
      askida: (s) => st(s) === "deneme_durdu",
      arsiv: (s) => st(s) === "arsiv",
    };
    for (const [f, pred] of Object.entries(presetOracle)) {
      const want = new Set(seeds.filter(pred).map((s) => s.id));
      const { rows, res } = await all({ f });
      const got = new Set(rows.map((r) => String(r.id)));
      const same = got.size === want.size && [...want].every((id) => got.has(id));
      ok(same && res.total === want.size && r0.presets[f] === want.size, `S3 filtre “${f}”: ${want.size} üye — satırlar, toplam ve çip sayısı birebir`,
        { got: got.size, want: want.size, total: res.total, chip: r0.presets[f] });
    }
    const demoInAll = (await all({ f: "all" })).rows.filter((r) => r.is_demo === true).length;
    ok(demoInAll === exp.demo, `S4 demo hesaplar listeden kaybolmaz (“Tüm üyeler”de ${demoInAll} demo, “Demo hesap” etiketiyle)`);
    const rejInAll = (await all({ f: "all" })).rows.filter((r) => r.stage === "red").length;
    ok(rejInAll === seeds.filter((s) => s.approval === "rejected" && !s.demo).length, "S5 reddedilen başvurular da listede kalır (kaybolan hesap yok)");
    const askida = await list({ f: "askida" });
    ok(askida.rows.every((r: { stage: string }) => r.stage === "deneme_durdu"), "S6 “Askıya alınanlar” yalnız gerçekten tutulan durum (deneme durduruldu); hesap askısı uydurulmaz");
    const arsivRows = (await all({ f: "arsiv" })).rows;
    ok(arsivRows.length === seeds.filter((s) => s.approval === "approved" && !s.active && !s.demo).length && arsivRows.every((r) => r.stage === "arsiv"),
      "S7 “Arşiv” = mevcut tanım (onaylı + pasif uzman), mevcut arşiv listesiyle aynı küme");
    const oldArch = (await su.query(`select public.admin_list_users('', null, 'archive', 'all','all','all','all', 100, 0) r`)).rows[0].r;
    ok(oldArch.total === arsivRows.length + seeds.filter((s) => s.demo && s.approval === "approved" && !s.active).length,
      `S8 klasik arşiv sayısı ile V2 arşiv tutarlı (${oldArch.total})`);

    console.log("\n[Q] Arama / gelişmiş filtre / sıralama / sayfalama");
    const target = seeds[42];
    const qr = await all({ q: "ŞULE çınar" });
    const wantQ = seeds.filter((s) => st(s) !== "arsiv" && foldTr(s.name).includes(foldTr("ŞULE çınar")));
    ok(qr.rows.length === wantQ.length && wantQ.length > 0, `Q1 Türkçe katlamalı arama “ŞULE çınar” → ${qr.rows.length} (beklenen ${wantQ.length})`);
    const qi = await all({ q: "ISMAIL" });
    ok(qi.rows.length === seeds.filter((s) => st(s) !== "arsiv" && foldTr(s.name).includes("ismail")).length && qi.rows.length > 0, "Q2 “ISMAIL” → İsmail (İ/ı katlaması)");
    const qe = await list({ q: target.email });
    ok(qe.total === (st(target) === "arsiv" ? 0 : 1), "Q3 e-posta ile arama tek üyeyi bulur");
    const qp = await list({ q: "100%_" });
    ok(qp.total === 0, "Q4 LIKE joker karakterleri (% _) desen olarak yorumlanmaz");
    const mod = await all({ mods: ["human_design"] });
    ok(mod.rows.length === seeds.filter((s) => st(s) !== "arsiv" && s.mods.human_design === true).length, `Q5 modül filtresi (Human Design açık): ${mod.rows.length}`);
    const payEx = await all({ pay: "exempt" });
    ok(payEx.rows.length === seeds.filter((s) => st(s) !== "arsiv" && s.pay === "exempt").length, "Q6 ödeme filtresi (muaf)");
    const payChk = await all({ pay: "check" });
    ok(payChk.rows.length === seeds.filter((s) => st(s) !== "arsiv" && payCheck(s)).length, "Q7 ödeme filtresi (kontrol edilecek) = Ödeme kontrolü kümesi");
    const adm = await list({ rol: "admin" });
    ok(adm.total === 3 && adm.rows.every((r: { stage: string }) => r.stage === "yonetici"), "Q8 rol: yöneticiler ayrı listelenir (“Tüm üyeler”e karışmaz)");
    const attn = (await all({})).rows as { stage: string; pro_request_at: string | null }[];
    const prio: Record<string, number> = { basvuru: 0, inceleme: 1, eski_kayit: 2, deneme_bitti: 3, deneme: 4, deneme_baslamadi: 5, pro: 6, deneme_durdu: 7, demo: 8, arsiv: 9, red: 10 };
    ok(attn.every((r, i) => i === 0 || prio[attn[i - 1].stage] <= prio[r.stage]), "Q9 “Önce ilgilenmem gerekenler”: başvuru → inceleme → eski kayıt → biten deneme → …");
    const pages: string[] = [];
    for (let p = 0; p < 30; p++) {
      const r = await list({ limit: 20, offset: p * 20 });
      pages.push(...r.rows.map((x: { id: string }) => x.id));
      if (r.rows.length < 20) break;
    }
    ok(pages.length === r0.total && new Set(pages).size === pages.length, `Q10 20'lik sayfaların birleşimi = toplam (${pages.length}), tekrar/kayıp yok`);
    const byName = (await all({ sort: "name" })).rows.map((r) => foldTr(String(r.full_name)));
    ok(byName.every((n, i) => i === 0 || byName[i - 1] <= n), "Q11 A–Z sıralaması");
    const byLogin = (await all({ sort: "login" })).rows.map((r) => (r.last_login_at ? Date.parse(String(r.last_login_at)) : -1));
    ok(byLogin.every((t, i) => i === 0 || byLogin[i - 1] >= t || byLogin[i - 1] === -1 && t === -1), "Q12 son giriş sıralaması (hiç girmeyenler sonda)");

    console.log("\n[K] Karar bekleyen = Owner zili");
    await su.query(`update public.admin_notification_settings set last_reconciled_at = null`);
    const lr = await list({});
    const feed = (await su.query(`select public.admin_notification_feed($1, 30) f`, [OWNER])).rows[0].f;
    ok(lr.decisions.total === feed.counts.action && lr.decisions.total > 0, `K1 karar bekleyen (${lr.decisions.total}) = zildeki turuncu sayı (${feed.counts.action})`);
    const byType = (await su.query(`select type, count(*)::int n from public.admin_notifications where kind='action' and resolved_at is null group by 1`)).rows as { type: string; n: number }[];
    const tmap = Object.fromEntries(byType.map((r) => [r.type, r.n]));
    ok(["basvuru", "pro_talebi", "inceleme", "eski_kayit", "odeme"].every((t) => (lr.decisions[t] ?? 0) === (tmap[t] ?? 0)), "K2 tür bazında (başvuru / Pro talebi / inceleme / eski kayıt / ödeme) zil ile aynı", { lr: lr.decisions, tmap });
    ok(lr.decisions.basvuru === r0.presets.basvuru && lr.decisions.inceleme === r0.presets.inceleme && lr.decisions.eski_kayit === r0.presets.eski,
      "K3 karar satırları liste filtreleriyle aynı sayıyı gösterir (başvuru / inceleme / eski kayıt)");
    ok(lr.decisions.odeme === seeds.filter((s) => !s.demo && st(s) === "pro" && s.pay === "overdue").length,
      "K4 ödeme kararı yalnız “Gecikti” işaretli; tarihi geçen ama işaretsiz ödeme karar sayılmaz");
    const cnt0 = (await su.query(`select count(*)::int n from public.admin_notifications`)).rows[0].n;
    await Promise.all(Array.from({ length: 12 }, () => db.pool.query(`select public.admin_list_members_v2($1) r`, [OWNER])));
    await su.query(`update public.admin_notification_settings set last_reconciled_at = null`);
    await Promise.all(Array.from({ length: 12 }, () => db.pool.query(`select public.admin_list_members_v2($1) r`, [OWNER])));
    ok((await su.query(`select count(*)::int n from public.admin_notifications`)).rows[0].n === cnt0, "K5 24 paralel liste çağrısı zil kaydı çoğaltmaz");

    console.log("\n[Y] Yetki");
    const code = async (actor: string | null) => {
      try { await su.query(`select public.admin_list_members_v2($1)`, [actor]); return "ok"; } catch (e) { return String((e as { code?: string }).code); }
    };
    ok((await code(seeds[3].id)) === "UY401" && (await code(ADMIN_OFF)) === "UY401" && (await code(null)) === "UY401" && (await code(randomUUID())) === "UY401",
      "Y1 uzman / pasif admin / boş / bilinmeyen aktör → UY401");
    ok((await code(ADMIN2)) === "ok", "Y2 normal (owner olmayan) aktif admin listeyi görür — mevcut üye listesi yetkisiyle aynı");
    let badOk = 0;
    for (const a of [{ f: "yok" }, { rol: "x" }, { pay: "borc" }, { sort: "x" }, { mods: ["Bad-Key"] }]) {
      try { await list(a); } catch (e) { if ((e as { code?: string }).code === "UY003") badOk++; }
    }
    ok(badOk === 5, "Y3 geçersiz filtre / rol / ödeme / sıralama / modül → UY003");

    console.log("\n[P] Süre");
    const tp = Date.now();
    for (let i = 0; i < 5; i++) await list({ limit: 20 });
    const avg = (Date.now() - tp) / 5;
    ok(avg < 1500, `P1 500 üyede liste + sayaç + filtre sayıları tek çağrı ort. ${avg.toFixed(0)} ms`);

    console.log("\n[E] Mevcut özellikler");
    const old = (await su.query(`select public.admin_list_users('', null, 'members', 'all','all','expert','all', 20, 0) r`)).rows[0].r;
    ok(old.total > 0 && old.counts.experts_total === 500 && Array.isArray(old.rows), `E1 eski admin_list_users aynen çalışır (uzman ${old.counts.experts_total})`);
    const tl = (await su.query(`select public.admin_trial_list($1,'all',null,50,0) r`, [OWNER])).rows[0].r;
    ok(Number(tl.total ?? (tl.rows ?? []).length) > 0, "E2 Deneme Üyeleri listesi (admin_trial_list) aynen çalışır");

    // ── ROUTE ───────────────────────────────────────────────────────────────
    console.log("\n[R] Route'lar (gerçek handler)");
    shim = await startPgrestShim(db.pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    const membersRoute = await import("../../app/api/admin/members/route");
    const usersRoute = await import("../../app/api/admin/users/route");
    const trialsRoute = await import("../../app/api/admin/trials/route");
    const call = async (h: unknown, url: string, auth: { adminId?: string; token?: string }) => {
      const headers: Record<string, string> = {};
      if (auth.adminId) headers["x-admin-id"] = auth.adminId;
      if (auth.token) headers["x-session-token"] = auth.token;
      const res = await (h as (r: NextRequest) => Promise<Response>)(new NextRequest(`http://localhost${url}`, { method: "GET", headers }));
      let json: Record<string, unknown> = {};
      try { json = await res.json(); } catch { /* boş */ }
      return { status: res.status, json };
    };
    const asOwner = { adminId: OWNER, token: TOK.owner };
    const g = await call(membersRoute.GET, "/api/admin/members", asOwner);
    ok(g.status === 200 && Array.isArray(g.json.rows) && (g.json.rows as unknown[]).length === 20 && g.json.total === r0.total
       && (g.json.counts as { trial: number }).trial === exp.trial && (g.json.decisions as { total: number }).total === feed.counts.action,
      "R1 owner: 200 · 20 satır · toplam · sayaçlar · karar sayısı RPC ile aynı");
    const g2 = await call(membersRoute.GET, "/api/admin/members?f=trial&q=%C5%9Fule&sort=name&page=1", { adminId: ADMIN2, token: TOK.admin2 });
    ok(g2.status === 200 && (g2.json.rows as { stage: string }[]).every((r) => r.stage === "deneme"), "R2 normal admin: filtre + arama + sıralama ile 200");
    const expTok = `zz-l2-expert-${randomUUID()}`;
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [seeds[11].id, expTok]);
    let neg = 0;
    const negCases = [{}, { adminId: OWNER }, { adminId: OWNER, token: "zz-sahte" }, { adminId: seeds[11].id, token: expTok }, { adminId: OWNER, token: expTok }];
    for (const a of negCases) { const r = await call(membersRoute.GET, "/api/admin/members", a); if (r.status === 401 || r.status === 403) neg++; }
    ok(neg === negCases.length, `R3 kimliksiz / tokensız / sahte / uzman token'ı / başka hesabın token'ıyla owner taklidi → 401/403 (${neg}/${negCases.length})`);
    let bad = 0;
    for (const qs of ["f=yok", "sort=x", "pay=borc", "rol=x", "mod=yok", "page=0", `q=${"a".repeat(121)}`]) if ((await call(membersRoute.GET, `/api/admin/members?${qs}`, asOwner)).status === 400) bad++;
    ok(bad === 7, "R4 geçersiz parametreler → 400");
    await su.query(`alter function public.admin_list_members_v2(uuid, text, text, text, text[], text, text, integer, integer, timestamptz) rename to admin_list_members_v2_zz`);
    const down = await call(membersRoute.GET, "/api/admin/members", asOwner);
    await su.query(`alter function public.admin_list_members_v2_zz(uuid, text, text, text, text[], text, text, integer, integer, timestamptz) rename to admin_list_members_v2`);
    ok(down.status === 500 && down.json.counts === undefined, "R5 DB hatası → 500, sıfır sayaç dönmez");
    const ou = await call(usersRoute.GET, "/api/admin/users?approval=pending", asOwner);
    ok(ou.status === 200 && Number(ou.json.total) === seeds.filter((s) => s.approval !== "approved" && s.approval !== "rejected").length,
      "R6 eski /api/admin/users (klasik liste) aynen çalışır");
    const tr = await call(trialsRoute.GET, "/api/admin/trials", asOwner);
    ok(tr.status === 200, `R7 Deneme Üyeleri API'si (/api/admin/trials) aynen çalışır (${tr.status})`);

    console.log("\n[U] URL sözleşmesi");
    const sp = (s: string) => new URLSearchParams(s);
    ok(legacyMemberListRedirect(sp("due=overdue")) === "/admin/users/klasik?due=overdue"
       && legacyMemberListRedirect(sp("approval=pending")) === "/admin/users/klasik?approval=pending"
       && legacyMemberListRedirect(sp("view=archive")) === "/admin/users/klasik?view=archive"
       && legacyMemberListRedirect(sp("due=due30&sort=next_payment_asc")) === "/admin/users/klasik?due=due30&sort=next_payment_asc",
      "U1 ana panel / sistem sağlığı bağlantıları (klasik parametreler) klasik listeye gider — aynı sonuç");
    ok(legacyMemberListRedirect(sp("f=trial&sort=name")) === null && legacyMemberListRedirect(sp("")) === null, "U2 V2 parametreleri yönlendirilmez");
    const v2 = parseMemberV2Query(sp("f=pay&q=ali&sort=login&mod=human_design&pay=check&page=2"));
    ok(v2.ok && memberV2QueryToSearch(v2.value) === "f=pay&q=ali&sort=login&mod=human_design&pay=check&page=2", "U3 V2 sorgu ↔ URL gidiş-dönüş");
    ok(memberV2QueryToSearch(DEFAULT_MEMBER_V2_QUERY) === "", "U4 varsayılanlar URL'ye yazılmaz");
    ok(memberListReturnHref("v2:f=trial&q=ali&page=2") === "/admin/users?f=trial&q=ali&page=2"
       && memberListReturnHref("v2:f=trial&evil=https://x") === "/admin/users?f=trial"
       && memberListReturnHref("approval=pending") === "/admin/users?approval=pending",
      "U5 detaydan dönüş: V2 filtresi korunur, bilinmeyen anahtar atılır, adres sabit (/admin/users)");
  } finally {
    if (shim) await shim.close().catch(() => undefined);
    await db.stop();
  }
  console.log(`\nÜYE LİSTESİ V2: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.error(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
