#!/usr/bin/env node
/**
 * TRIAL7 — 7 günlük deneme üyeliği DB harness'ı (GEÇİCİ embedded-postgres; prod'a / ağa temas YOK).
 *
 * Gerçek migration'lar uygulanır: provision_expert (20260910000000), yh_grade_expert_premium (20261221000000),
 * TRIAL7 (20280101000000 — İKİ KEZ: idempotency). Doğrulananlar:
 *   K  kayıt: aktif + onaylı + deneme paketi + pencere BAŞLAMAMIŞ; Dijital İçerik ailesi kapalı; tek deneme hakkı
 *      (kanonik e-posta), aynı e-posta, eşzamanlı aynı hak; izinsiz modül payload'ı RED
 *   G  ilk giriş: tam 168 saat; tekrar giriş sıfırlamaz; 12 eşzamanlı giriş → tek başlatma
 *   S  süre sınırı: bitiş anında 'expired', 1 µs önce 'active'; uzatma yolu yok (review/suspend bitişe dokunmaz)
 *   C  kredi: günlük 50 ortak; 80 eşzamanlı rezervasyon → tam 50; iade (429/5xx) sayılmaz; modül limiti; TR 00:00
 *   A  admin: limit (modül ≤ ortak), inceleme/durdurma geçişleri, yetkisiz aktör, liste/sayaç/arama
 *   P  Pro talebi tekil (eşzamanlı dahil); Pro'ya geçiş: user_id + tenant + danışan kayıtları korunur, audit
 *   M  modül tetikleyicisi: denemede Dijital İçerik açılamaz; Premium/özel hesapta değişmez
 *   E  MEVCUT hesaplar (admin, Premium ödeme kaydı yok, özel, demo, eski deneme, bekleyen) BİREBİR korunur
 *   Y  yetkiler: anon/authenticated RPC çalıştıramaz; service_role tablolara yazamaz, trial_claims'i okuyamaz
 *
 * Kullanım: node scripts/trial7/trial7-db.harness.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const nm = path.join(root, "node_modules");
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.join(nm, "embedded-postgres", "dist", "index.js")).href);
const pg = (await import(pathToFileURL(path.join(nm, "pg", "lib", "index.js")).href)).default;

const BOOT = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
`;
const MIGRATIONS = [
  "supabase/migrations/20260910000000_provisioning_integrity.sql",
  "supabase/migrations/20261221000000_yh_grade_expert_premium_rpc.sql",
];
const TRIAL_MIGRATION = "supabase/migrations/20280101000000_trial7_self_trial.sql";
const RETENTION_MIGRATION = "supabase/migrations/20280101000100_trial7_claims_retention.sql";

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const PREMIUM = "00000000-0000-0000-0000-0000000000b1";
const OZEL = "00000000-0000-0000-0000-0000000000c1";
const DEMO = "00000000-0000-0000-0000-0000000000d1";
const LEGACY = "00000000-0000-0000-0000-0000000000e1";
const PENDING = "00000000-0000-0000-0000-0000000000f1";
const EXISTING = [ADMIN, PREMIUM, OZEL, DEMO, LEGACY, PENDING];

const TRIAL_PERMS = {
  clients: true, appointments: true, numerology: true, stones: true, stok: true, sifa_rehberi: true,
  reflexology: true, energy_body: true, aromatherapy: true, cosmic_calendar: true, human_design: true,
  cupping: true, beslenme: true, astrology: true,
  digital_content: false, personal_archive: false, belge_ceviri: false, video_ceviri: false, ders_notu: false,
  yasam_hafizasi: false, hd_system_reading: false, numerology_future_years: false, astrology_provider_interp: false,
};

let pass = 0;
let fail = 0;
function ok(cond, label, detail) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}
async function rejects(fn, label, codeRe) {
  try {
    await fn();
    ok(false, label, "hata bekleniyordu");
  } catch (e) {
    ok(!codeRe || codeRe.test(String(e.code ?? "") + " " + String(e.message ?? "")), label, e.message);
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trial7-pg-"));
const port = 51000 + Math.floor(Math.random() * 4000);
const server = new EmbeddedPostgres({
  databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
  initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {},
});
const clients = [];
async function connect() {
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  await c.connect();
  clients.push(c);
  return c;
}

try {
  await server.initialise();
  await server.start();
  const c = await connect();
  const q = async (sql, params) => (await c.query(sql, params)).rows;
  const rpc = async (fn, args) => (await c.query(`SELECT public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) AS r`, args)).rows[0].r;
  const user = async (id) => (await q("SELECT * FROM public.users WHERE id=$1", [id]))[0];

  await c.query(BOOT);
  await c.query(fs.readFileSync(path.join(here, "fixtures", "trial7-fixture.sql"), "utf8"));
  for (const m of MIGRATIONS) await c.query(fs.readFileSync(path.join(root, m), "utf8"));
  const snapshotSql = `SELECT id, active, approval_status, package_type, plan, subscription_status, membership_status,
      trial_started_at, trial_ends_at, module_permissions, tenant_id, is_demo_account, approved_at
      FROM public.users WHERE id = ANY($1::uuid[]) ORDER BY id`;
  const before = JSON.stringify(await q(snapshotSql, [EXISTING]));

  console.log("— Migration (iki kez: idempotency)");
  const trialSql = fs.readFileSync(path.join(root, TRIAL_MIGRATION), "utf8");
  const applyTrial = async () => {
    try {
      await c.query(trialSql);
    } catch (e) {
      const p = Number(e.position) || 0;
      throw new Error(`${e.message} @${p}: ${JSON.stringify(trialSql.slice(Math.max(0, p - 160), p + 60))}`);
    }
  };
  await applyTrial();
  await applyTrial();
  const retentionSql = fs.readFileSync(path.join(root, RETENTION_MIGRATION), "utf8");
  await c.query(retentionSql);
  await c.query(retentionSql);
  const approvalSql = fs.readFileSync(path.join(root, "supabase/migrations/20280101000200_trial7_admin_trial_approval.sql"), "utf8");
  await c.query(approvalSql);
  await c.query(approvalSql);
  ok(true, "TRIAL7 migration iki kez hatasız uygulandı");
  ok(JSON.stringify(await q(snapshotSql, [EXISTING])) === before, "E: migration mevcut hiçbir hesabı değiştirmedi (backfill YOK)");
  const kinds = await q("SELECT count(*)::int n FROM public.users WHERE trial_kind IS NOT NULL OR trial_status IS NOT NULL");
  ok(kinds[0].n === 0, "E: mevcut hesapların hiçbiri deneme rejiminde değil (trial_kind NULL)");
  for (const id of EXISTING) {
    const u = await user(id);
    const ph = (await q("SELECT public.trial_phase_of($1,$2,$3,$4) p", [u.trial_kind, u.trial_status, u.package_type, u.trial_ends_at]))[0].p;
    if (ph !== "none") ok(false, `E: ${u.email} fazı 'none' olmalı`, ph);
  }
  ok(true, "E: mevcut 6 hesabın deneme fazı 'none' (tarih alanları erişime girmez)");

  const reg = (email, extra = {}) => rpc("trial_register_expert", [{
    email, password_hash: "$2a$04$abcdefghijklmnopqrstuv", full_name: "Deneme Uzman", tenant_name: "Deneme",
    tenant_slug_base: "deneme-" + email.replace(/[^a-z0-9]/g, "").slice(0, 20), module_permissions: TRIAL_PERMS,
    claim_hash: "trial-claim:" + (extra.claim ?? email.replace(/[^a-z0-9]/g, "")).padEnd(12, "x"), ip_bucket: "trial-ip:aaaaaaaaaaaa",
    risk_score: extra.risk ?? 0, risk_flags: extra.flags ?? [], review: extra.review ?? false,
  }]);

  console.log("— K: kayıt");
  const r1 = await reg("ayse@example.com", { claim: "aysegmail" });
  ok(r1.ok === true && r1.outcome === "provisioned" && r1.trial_status === "not_started", "K1 kayıt provisioned + not_started", r1);
  const T1 = r1.user_id;
  let u1 = await user(T1);
  ok(u1.active === true && u1.approval_status === "approved", "K2 yönetici onayı beklemeden aktif + onaylı");
  ok(u1.package_type === "trial" && u1.plan === "trial" && u1.trial_kind === "self_7d", "K3 deneme paketi + self_7d");
  ok(u1.trial_started_at === null && u1.trial_ends_at === null, "K4 süre kayıt anında BAŞLAMADI");
  ok(u1.module_permissions.digital_content === false && u1.module_permissions.belge_ceviri === false &&
     u1.module_permissions.personal_archive === false && u1.module_permissions.yasam_hafizasi === false, "K5 Dijital İçerik ailesi + YH kapalı");
  ok(u1.module_permissions.astrology === true && JSON.stringify(u1.astrology_technique_grants) === JSON.stringify({ mode: "all" }), "K6 Atlas açık + teknik izni");
  const ev = await q("SELECT origin, outcome FROM public.provisioning_events WHERE target_user_id=$1", [T1]);
  ok(ev.length === 1 && ev[0].origin === "public_register" && ev[0].outcome === "provisioned", "K7 provisioning_events public_register kaydı");
  const prof = (await q("SELECT * FROM public.trial_profiles WHERE user_id=$1", [T1]))[0];
  ok(prof && prof.daily_credit_limit === 50 && JSON.stringify(prof.module_credit_limits) === "{}", "K8 varsayılan günlük 50 kredi, modül limiti yok");
  const r1b = await reg("a.y.s.e+promo@example.com", { claim: "aysegmail" });
  ok(r1b.ok === false && r1b.outcome === "trial_already_used", "K9 aynı kanonik e-posta → ikinci deneme YOK", r1b);
  ok((await q("SELECT count(*)::int n FROM public.users WHERE email='a.y.s.e+promo@example.com'"))[0].n === 0, "K10 ikinci deneme için hesap/tenant oluşmadı");
  const r1c = await reg("ayse@example.com", { claim: "baskahak01" });
  ok(r1c.ok === false && r1c.outcome === "already_exists", "K11 aynı e-posta → already_exists (hak harcanmaz)");
  ok((await q("SELECT count(*)::int n FROM public.trial_claims WHERE claim_hash='trial-claim:baskahak01xx'"))[0].n === 0, "K12 başarısız kayıtta hak kaydı geri alındı");
  await rejects(() => rpc("trial_register_expert", [{ email: "kotu@example.com", password_hash: "x", full_name: "K", tenant_name: "K",
    tenant_slug_base: "k", module_permissions: { ...TRIAL_PERMS, digital_content: true }, claim_hash: "trial-claim:kotukotukotu" }]),
    "K13 Dijital İçerik açık payload RED (fail-closed)", /izinsiz modul/);
  // Eşzamanlı aynı hak (farklı e-postalar, aynı kanonik hak)
  const conns = await Promise.all(Array.from({ length: 6 }, () => connect()));
  const race = await Promise.all(conns.map((cc, i) => cc.query("SELECT public.trial_register_expert($1) r", [{
    email: `yaris${i}@example.com`, password_hash: "x", full_name: "Y", tenant_name: "Y", tenant_slug_base: `yaris-${i}`,
    module_permissions: TRIAL_PERMS, claim_hash: "trial-claim:yarisyarisyaris" }]).then((r) => r.rows[0].r).catch((e) => ({ err: e.message }))));
  ok(race.filter((r) => r.outcome === "provisioned").length === 1 && race.filter((r) => r.outcome === "trial_already_used").length === 5,
    "K14 6 eşzamanlı kayıt, aynı hak → tam 1 hesap", race);
  const rRev = await reg("supheli@mailinator.com", { review: true, risk: 60, flags: ["tek_kullanimlik_eposta"] });
  ok(rRev.trial_status === "review", "K15 yüksek risk → otomatik inceleme durumu");

  console.log("— G: ilk giriş + 168 saat");
  const g1 = await rpc("trial_activate_on_login", [T1]);
  u1 = await user(T1);
  ok(g1.activated === true && g1.phase === "active", "G1 ilk giriş pencereyi başlattı");
  const hours = (new Date(u1.trial_ends_at) - new Date(u1.trial_started_at)) / 3_600_000;
  ok(hours === 168, "G2 pencere tam 168 saat", hours);
  const g2 = await rpc("trial_activate_on_login", [T1]);
  const u1b = await user(T1);
  ok(g2.activated === false && u1b.trial_ends_at.getTime() === u1.trial_ends_at.getTime(), "G3 tekrar giriş süreyi sıfırlamadı");
  const rC = await reg("eszaman@example.com");
  const conc = await Promise.all(conns.concat(await Promise.all(Array.from({ length: 6 }, () => connect())))
    .map((cc) => cc.query("SELECT public.trial_activate_on_login($1) r", [rC.user_id]).then((r) => r.rows[0].r)));
  const uc = await user(rC.user_id);
  ok(conc.filter((r) => r.activated).length === 1 && conc.every((r) => r.trial_ends_at === conc[0].trial_ends_at || new Date(r.trial_ends_at).getTime() === uc.trial_ends_at.getTime()),
    "G4 12 eşzamanlı ilk giriş → tek başlatma, tek bitiş zamanı", conc.map((r) => r.activated));
  const gRev = await rpc("trial_activate_on_login", [rRev.user_id]);
  ok(gRev.activated === false && gRev.phase === "review", "G5 incelemedeki hesapta giriş süreyi başlatmaz");
  const gPrem = await rpc("trial_activate_on_login", [PREMIUM]);
  ok(gPrem.activated === false && gPrem.phase === "none", "G6 Premium girişinde deneme RPC'si hiçbir şey yazmaz");

  console.log("— S: süre sınırı + uzatma yok");
  const ends = (await user(T1)).trial_ends_at;
  const at = async (ts) => (await q("SELECT public.trial_phase_of('self_7d','active','trial',$1,$2) p", [ends, ts]))[0].p;
  ok((await at(new Date(ends.getTime() - 1))) === "active", "S1 bitişten 1 ms önce 'active'");
  ok((await at(ends)) === "expired", "S2 bitiş anında 'expired' (tam 168. saat)");
  const fns = (await q("SELECT proname FROM pg_proc WHERE proname ILIKE '%trial%extend%' OR proname ILIKE '%uzat%'"));
  ok(fns.length === 0, "S3 süre uzatma fonksiyonu YOK");
  await rpc("admin_trial_set_state", [ADMIN, T1, "review", "test"]);
  await rpc("admin_trial_set_state", [ADMIN, T1, "clear_review", null]);
  await rpc("admin_trial_set_state", [ADMIN, T1, "suspend", null]);
  await rpc("admin_trial_set_state", [ADMIN, T1, "resume", null]);
  const u1c = await user(T1);
  ok(u1c.trial_status === "active" && u1c.trial_ends_at.getTime() === ends.getTime() && u1c.trial_started_at.getTime() === u1.trial_started_at.getTime(),
    "S4 inceleme/durdurma/sürdürme bitiş zamanını DEĞİŞTİRMEDİ (uzatma yok)");

  console.log("— C: Roxy kredileri");
  const reserve = (uid, mod, cc = c) => cc.query("SELECT public.trial_credit_reserve($1,$2,$3) r", [uid, mod, "test/x"]).then((r) => r.rows[0].r);
  const settle = (id, charged, st) => rpc("trial_credit_settle", [id, charged, st]);
  const rK = await reg("kredi@example.com");
  const K = rK.user_id;
  await rpc("trial_activate_on_login", [K]);
  const mods = ["astrology", "human_design", "numerology"];
  const first = [];
  for (let i = 0; i < 50; i++) first.push(await reserve(K, mods[i % 3]));
  ok(first.every((r) => r.ok && r.metered) && first[49].remaining === 0, "C1 50 rezervasyon 3 modülde ortak havuzdan", first[49]);
  const r51 = await reserve(K, "astrology");
  ok(r51.ok === false && r51.reason === "daily_limit", "C2 51. kredi reddedildi (günlük 50)", r51);
  await settle(first[0].reservation_id, false, 429);
  const afterRefund = await reserve(K, "numerology");
  ok(afterRefund.ok === true, "C3 429 iadesi krediyi geri verdi (sağlayıcı işlemedi)");
  await settle(first[1].reservation_id, true, 200);
  ok((await settle(first[1].reservation_id, false, 500)) === false, "C4 çift kapanış etkisiz (ücret geri alınamaz)");
  const usage = await rpc("trial_credit_usage", [K]);
  ok(usage.used_total === 50 && usage.daily_limit === 50, "C5 kullanım özeti 50/50", usage);
  // Eşzamanlı: yeni uzman, 80 paralel istek → tam 50
  const rP = await reg("paralel@example.com");
  await rpc("trial_activate_on_login", [rP.user_id]);
  const pconns = await Promise.all(Array.from({ length: 16 }, () => connect()));
  const par = await Promise.all(Array.from({ length: 80 }, (_, i) => reserve(rP.user_id, mods[i % 3], pconns[i % 16])));
  ok(par.filter((r) => r.ok).length === 50 && par.filter((r) => !r.ok && r.reason === "daily_limit").length === 30,
    "C6 80 eşzamanlı istek → tam 50 kredi (limit aşılamaz)", par.filter((r) => r.ok).length);
  // Modül limiti
  const rM = await reg("modul@example.com");
  await rpc("trial_activate_on_login", [rM.user_id]);
  await rpc("admin_trial_set_limits", [ADMIN, rM.user_id, 10, { numerology: 2 }]);
  const n1 = await reserve(rM.user_id, "numerology");
  const n2 = await reserve(rM.user_id, "numerology");
  const n3 = await reserve(rM.user_id, "numerology");
  const a1 = await reserve(rM.user_id, "astrology");
  ok(n1.ok && n2.ok && n3.ok === false && n3.reason === "module_limit" && a1.ok, "C7 modül limiti 2: 3. numeroloji red, Atlas devam");
  for (let i = 0; i < 7; i++) await reserve(rM.user_id, "human_design");
  const over = await reserve(rM.user_id, "astrology");
  ok(over.ok === false && over.reason === "daily_limit", "C8 modül limitleri ortak günlük limiti aşma hakkı vermez (10)");
  await rejects(() => rpc("admin_trial_set_limits", [ADMIN, rM.user_id, 10, { astrology: 11 }]), "C9 modül limiti > ortak limit RED", /TR400|gecersiz/);
  // TR günü sıfırlama
  ok((await q("SELECT public.trial_usage_day('2026-11-06T20:59:59Z')::text d"))[0].d === "2026-11-06" &&
     (await q("SELECT public.trial_usage_day('2026-11-06T21:00:00Z')::text d"))[0].d === "2026-11-07", "C10 gün sınırı Türkiye saatiyle 00.00");
  await q("UPDATE public.trial_credit_ledger SET usage_day = usage_day - 1 WHERE user_id=$1", [K]);
  const nextDay = await reserve(K, "astrology");
  ok(nextDay.ok === true && nextDay.remaining === 49, "C11 ertesi gün sıfırlandı; dünkü kalan AKTARILMADI", nextDay);
  // Faz kontrolleri
  const exp = await reg("biten@example.com");
  await rpc("trial_activate_on_login", [exp.user_id]);
  await q("UPDATE public.users SET trial_started_at = now() - interval '169 hours', trial_ends_at = now() - interval '1 hour' WHERE id=$1", [exp.user_id]);
  ok((await reserve(exp.user_id, "astrology")).reason === "trial_expired", "C12 süresi dolmuş deneme → Roxy reddi");
  ok((await reserve(rRev.user_id, "astrology")).reason === "trial_review", "C13 incelemedeki hesap → Roxy reddi");
  const prem = await reserve(PREMIUM, "astrology");
  ok(prem.ok === true && prem.metered === false, "C14 Premium ölçülmez (sistem geneli bütçe YOK)");
  ok((await q("SELECT count(*)::int n FROM public.trial_credit_ledger WHERE user_id=$1", [PREMIUM]))[0].n === 0, "C15 Premium için kredi defterine satır yazılmadı");
  await rejects(() => reserve(K, "digital_content"), "C16 kredi modülü allowlist dışı RED", /gecersiz modul/);

  console.log("— M: modül tetikleyicisi");
  await q(`UPDATE public.users SET module_permissions = module_permissions || '{"digital_content":true,"belge_ceviri":true,"video_ceviri":true,"yeni_dijital_alt_modul":true}'::jsonb WHERE id=$1`, [T1]);
  const mp = (await user(T1)).module_permissions;
  ok(mp.digital_content === false && mp.belge_ceviri === false && mp.video_ceviri === false && mp.yeni_dijital_alt_modul === false && mp.clients === true,
    "M1 denemede Dijital İçerik + ileride eklenecek alt modül AÇILAMAZ (fail-closed)", mp);
  await q(`UPDATE public.users SET module_permissions = module_permissions || '{"stones":false}'::jsonb WHERE id=$1`, [PREMIUM]);
  const pp = (await user(PREMIUM)).module_permissions;
  ok(pp.digital_content === true && pp.belge_ceviri === true && pp.personal_archive === true, "M2 Premium'da Dijital İçerik izinleri DEĞİŞMEDİ");
  await q(`UPDATE public.users SET module_permissions = module_permissions - 'stones' WHERE id=$1`, [PREMIUM]);

  console.log("— A: admin işlemleri");
  await rejects(() => rpc("admin_trial_set_state", [PREMIUM, T1, "suspend", null]), "A1 admin olmayan aktör reddedildi", /TR401|yetkisiz/);
  await rejects(() => rpc("admin_trial_set_state", [ADMIN, T1, "resume", null]), "A2 geçersiz geçiş (aktifken sürdür) TR409", /TR409/);
  await rejects(() => rpc("admin_trial_set_limits", [ADMIN, PREMIUM, 20, {}]), "A3 Premium hesaba deneme limiti yazılamaz", /TR404/);
  const list = await rpc("admin_trial_list", [ADMIN, "all", null, 50, 0]);
  ok(list.counts.review >= 1 && list.counts.expired >= 1 && list.counts.active >= 1, "A4 liste sayaçları (aktif/inceleme/süresi dolmuş)", list.counts);
  ok(!list.rows.some((r) => EXISTING.includes(r.id)), "A5 Premium/özel/demo/eski hesaplar Deneme Üyeleri listesinde YOK");
  const srch = await rpc("admin_trial_list", [ADMIN, "all", "kredi@", 50, 0]);
  ok(srch.rows.length === 1 && srch.rows[0].used_total === 1 && srch.rows[0].daily_limit === 50, "A6 arama + günlük tüketim satırda", srch.rows[0]);
  const lExp = await rpc("admin_trial_list", [ADMIN, "expired", "%", 50, 0]);
  ok(lExp.rows.length === 0, "A7 arama joker karakteri kaçışlı ('%' tümünü getirmez)");
  await rejects(() => rpc("admin_trial_list", [PREMIUM, "all", null, 50, 0]), "A8 admin olmayan liste RED", /TR401|yetkisiz/);

  console.log("— P: Pro talebi + Pro'ya geçiş");
  const pr1 = await rpc("trial_pro_request_create", [exp.user_id, "Ödeme yapacağım"]);
  const pr2 = await rpc("trial_pro_request_create", [exp.user_id, null]);
  ok(pr1.created === true && pr2.created === false && pr2.request_id === pr1.request_id, "P1 mükerrer açık talep oluşmaz");
  const rq = await reg("talep@example.com");
  const rqc = await Promise.all(pconns.slice(0, 8).map((cc) => cc.query("SELECT public.trial_pro_request_create($1,null) r", [rq.user_id]).then((r) => r.rows[0].r)));
  ok(rqc.filter((r) => r.created).length === 1 && (await q("SELECT count(*)::int n FROM public.pro_upgrade_requests WHERE user_id=$1", [rq.user_id]))[0].n === 1,
    "P2 8 eşzamanlı talep → tek kayıt");
  ok((await rpc("trial_pro_request_create", [PREMIUM, null])).reason === "not_trial", "P3 Premium üye deneme talebi oluşturamaz");
  const plist = await rpc("admin_trial_list", [ADMIN, "pro_request", null, 50, 0]);
  ok(plist.rows.some((r) => r.id === exp.user_id && r.pro_request_at), "P4 talep admin listesinde görünüyor");
  const ex = await user(exp.user_id);
  await q("INSERT INTO public.clients (tenant_id, full_name) VALUES ($1,'Danışan 1'),($1,'Danışan 2')", [ex.tenant_id]);
  await rejects(() => rpc("admin_trial_convert_to_pro", [ADMIN, exp.user_id, { clients: false }, []]), "P5 modül seçilmeden Pro'ya geçiş RED", /TR400|en az bir/);
  const conv = await rpc("admin_trial_convert_to_pro", [ADMIN, exp.user_id, { clients: true, numerology: true, digital_content: false }, []]);
  const exAfter = await user(exp.user_id);
  ok(conv.ok === true && exAfter.package_type === "premium" && exAfter.plan === "premium" && exAfter.trial_status === "converted", "P6 Pro'ya geçti (mevcut ücretli paket)");
  ok(exAfter.id === ex.id && exAfter.tenant_id === ex.tenant_id, "P7 user_id + tenant AYNI");
  ok((await q("SELECT count(*)::int n FROM public.clients WHERE tenant_id=$1", [ex.tenant_id]))[0].n === 2, "P8 danışan kayıtları korundu");
  ok(exAfter.module_permissions.digital_content === false && exAfter.module_permissions.clients === true, "P9 Dijital İçerik Pro'da otomatik AÇILMADI (admin seçimi uygulandı)");
  ok(exAfter.trial_started_at !== null && exAfter.trial_ends_at !== null, "P10 deneme tarihçesi korundu");
  const aud = await q("SELECT action, context FROM public.admin_audit_log WHERE target_user_id=$1", [exp.user_id]);
  ok(aud.length === 1 && aud[0].action === "user_approved" && aud[0].context.source === "trial_convert_to_pro", "P11 yönetici denetim kaydı yazıldı");
  ok((await q("SELECT status, close_reason FROM public.pro_upgrade_requests WHERE user_id=$1", [exp.user_id]))[0].close_reason === "converted", "P12 açık talep 'converted' kapandı");
  const evs = await q("SELECT action FROM public.trial_admin_events WHERE target_user_id=$1", [exp.user_id]);
  ok(evs.some((e) => e.action === "converted_to_pro"), "P13 deneme yönetim kaydı");
  await rejects(() => rpc("admin_trial_convert_to_pro", [ADMIN, exp.user_id, { clients: true }, []]), "P14 ikinci geçiş TR409", /TR409/);
  const pc = await reserve(exp.user_id, "astrology");
  ok(pc.ok === true && pc.metered === false, "P15 Pro üye artık kredi limitine tabi değil");
  await q(`UPDATE public.users SET module_permissions = module_permissions || '{"digital_content":true}'::jsonb WHERE id=$1`, [exp.user_id]);
  ok((await user(exp.user_id)).module_permissions.digital_content === true, "P16 Pro'da admin Dijital İçerik'i bilinçli açabilir (normal paket kuralı)");

  console.log("— O: yönetici onaylı 7 günlük deneme");
  {
    const provisionPending = async (email) => (await rpc("provision_expert", [{
      mode: "public", email, password_hash: "$2a$04$abcdefghijklmnopqrstuv", full_name: "Başvuru " + email,
      tenant_name: "B", tenant_slug_base: "basvuru-" + email.replace(/[^a-z0-9]/g, "").slice(0, 20),
      module_permissions: { clients: false, digital_content: false } }])).user_id;
    const approveTrial = (actor, uid, expected, claim, mods = TRIAL_PERMS, cc = c) =>
      cc.query("SELECT public.admin_approve_expert_trial($1,$2,$3,$4,$5) r", [actor, uid, expected, claim, mods]).then((x) => x.rows[0].r);
    const counts = async () => (await q("SELECT (SELECT count(*) FROM public.clients)::int c, (SELECT count(*) FROM public.tenants)::int t"))[0];

    const P1 = await provisionPending("basvuru1@example.com");
    let p1 = await user(P1);
    ok(p1.active === false && p1.approval_status === "pending" && p1.trial_kind === null, "O1 yeni başvuru pending + pasif (otomatik kabul YOK)");
    await q("INSERT INTO public.user_sessions (user_id, session_token) VALUES ($1, 'eski-oturum-o1')", [P1]);
    const before = await counts();
    const r1 = await approveTrial(ADMIN, P1, "pending", "trial-claim:onayonayonay01");
    p1 = await user(P1);
    ok(r1.ok === true && p1.active === true && p1.approval_status === "approved", "O2 admin 7 günlük denemeyi onayladı → aktif + onaylı");
    ok(p1.package_type === "trial" && p1.plan === "trial" && p1.trial_kind === "self_7d" && p1.trial_status === "not_started",
      "O3 hesap deneme paketi (self_7d, not_started) — Premium DEĞİL", { pkg: p1.package_type, plan: p1.plan });
    ok(p1.trial_started_at === null && p1.trial_ends_at === null, "O4 onay anında süre BAŞLAMADI (eski kayıt tarihleri temizlendi)");
    ok(p1.module_permissions.digital_content === false && p1.module_permissions.belge_ceviri === false &&
       p1.module_permissions.yasam_hafizasi === false && p1.module_permissions.astrology === true &&
       JSON.stringify(p1.astrology_technique_grants) === JSON.stringify({ mode: "all" }), "O5 deneme modülleri açık, Dijital İçerik + YH kapalı");
    ok((await q("SELECT count(*)::int n FROM public.trial_claims WHERE claim_hash='trial-claim:onayonayonay01'"))[0].n === 1, "O6 tek deneme hakkı onayla aynı işlemde kaydedildi");
    ok((await q("SELECT is_active FROM public.user_sessions WHERE session_token='eski-oturum-o1'"))[0].is_active === false, "O7 onay öncesi oturum kapatıldı");
    const aud = await q("SELECT action, context FROM public.admin_audit_log WHERE target_user_id=$1", [P1]);
    ok(aud.some((a) => a.action === "user_approved" && a.context.source === "trial_approval"), "O8 yönetici denetim kaydı (source: trial_approval)");
    ok((await q("SELECT count(*)::int n FROM public.trial_admin_events WHERE target_user_id=$1 AND action='trial_approved'", [P1]))[0].n === 1, "O9 deneme yönetim kaydı");
    const act = await rpc("trial_activate_on_login", [P1]);
    p1 = await user(P1);
    ok(act.activated === true && (p1.trial_ends_at - p1.trial_started_at) === 168 * 3_600_000, "O10 ilk başarılı giriş tam 168 saati başlattı");
    const act2 = await rpc("trial_activate_on_login", [P1]);
    ok(act2.activated === false && (await user(P1)).trial_ends_at.getTime() === p1.trial_ends_at.getTime(), "O11 tekrar giriş süreyi sıfırlamadı");
    const cr = await rpc("trial_credit_reserve", [P1, "human_design", "test/o"]);
    ok(cr.ok === true && cr.metered === true && cr.remaining === 49, "O12 günlük 50 ortak Roxy kredisi uygulanıyor", cr);
    const lst = await rpc("admin_trial_list", [ADMIN, "active", "basvuru1@", 50, 0]);
    ok(lst.rows.length === 1 && lst.rows[0].id === P1, "O13 onaylanan uzman Deneme Üyeleri listesinde");
    ok(JSON.stringify(await counts()) === JSON.stringify(before), "O14 danışan / tenant sayıları değişmedi");

    const P2 = await provisionPending("b.a.s.v.u.r.u.1+ikinci@example.com");
    let err = null;
    try { await approveTrial(ADMIN, P2, "pending", "trial-claim:onayonayonay01"); } catch (e) { err = e; }
    const p2 = await user(P2);
    ok(err && err.code === "TR410" && p2.approval_status === "pending" && p2.active === false && p2.trial_kind === null,
      "O15 aynı kanonik e-posta → ikinci deneme REDDEDİLDİ, başvuru pending kaldı", err?.message);

    const P3 = await provisionPending("reddedilen@example.com");
    await q("UPDATE public.users SET approval_status='rejected', active=false WHERE id=$1", [P3]);
    ok((await q("SELECT count(*)::int n FROM public.trial_claims WHERE claim_hash='trial-claim:reddedilen0001'"))[0].n === 0, "O16 ret hakkı TÜKETMEDİ");
    const r3 = await approveTrial(ADMIN, P3, "rejected", "trial-claim:reddedilen0001");
    ok(r3.ok === true && (await user(P3)).trial_status === "not_started", "O17 reddedilmiş başvuru sonradan denemeye onaylanabilir");

    const P4 = await provisionPending("bayat@example.com");
    await rejects(() => approveTrial(ADMIN, P4, "rejected", "trial-claim:bayatbayat0001"), "O18 bayat ekran (beklenen durum farklı) → UY001", /UY001|degismis/);
    ok((await q("SELECT count(*)::int n FROM public.trial_claims WHERE claim_hash='trial-claim:bayatbayat0001'"))[0].n === 0, "O19 başarısız onay hakkı tüketmedi");
    await rejects(() => approveTrial(PREMIUM, P4, "pending", "trial-claim:bayatbayat0001"), "O20 admin olmayan deneme onaylayamaz", /TR401|yetkisiz/);
    await rejects(() => approveTrial(ADMIN, P4, "pending", "trial-claim:bayatbayat0001", { ...TRIAL_PERMS, digital_content: true }),
      "O21 Dijital İçerik açık deneme paketi REDDEDİLDİ", /TR400|gecersiz/);
    await rejects(() => approveTrial(ADMIN, PREMIUM, "pending", "trial-claim:premiumpremium"), "O22 Premium hesap denemeye çevrilemez", /TR409/);
    await rejects(() => approveTrial(ADMIN, DEMO, "pending", "trial-claim:demodemodemo1"), "O23 demo hesap denemeye çevrilemez", /TR409/);
    await rejects(() => approveTrial(ADMIN, P1, "pending", "trial-claim:yeniyeniyeni01"), "O24 deneme hesabı ikinci kez onaylanamaz", /TR409/);
    await rejects(() => approveTrial(ADMIN, PENDING, "pending", "gecersiz anahtar!"), "O25 geçersiz hak anahtarı reddedildi", /TR400|gecersiz/);
    ok((await user(PENDING)).approval_status === "pending" && (await user(PENDING)).trial_kind === null, "O26 eski onay bekleyen hesap otomatik dönüştürülmedi");

    await q("INSERT INTO public.trial_claims (claim_hash, first_user_id, claimed_at) VALUES ('trial-claim:suresidolmus01', gen_random_uuid(), now() - interval '25 months')");
    const P5 = await provisionPending("yirmidortay@example.com");
    const r5 = await approveTrial(ADMIN, P5, "pending", "trial-claim:suresidolmus01");
    ok(r5.ok === true, "O27 24 ayı geçmiş hak (imha işi henüz silmemiş olsa da) yeni denemeyi engellemez");

    const P6 = await provisionPending("eszamanli1@example.com");
    const P7 = await provisionPending("eszamanli2@example.com");
    const oc = await Promise.all([connect(), connect()]);
    const race = await Promise.all([
      approveTrial(ADMIN, P6, "pending", "trial-claim:yarisonay0001", TRIAL_PERMS, oc[0]).then(() => "ok").catch((e) => e.code),
      approveTrial(ADMIN, P7, "pending", "trial-claim:yarisonay0001", TRIAL_PERMS, oc[1]).then(() => "ok").catch((e) => e.code),
    ]);
    ok(race.filter((x) => x === "ok").length === 1 && race.filter((x) => x === "TR410").length === 1, "O28 eşzamanlı iki onay aynı hak → tek deneme", race);

    const fnPriv = (await q("SELECT has_function_privilege('anon','public.admin_approve_expert_trial(uuid,uuid,text,text,jsonb)','EXECUTE') a, has_function_privilege('authenticated','public.admin_approve_expert_trial(uuid,uuid,text,text,jsonb)','EXECUTE') u, has_function_privilege('service_role','public.admin_approve_expert_trial(uuid,uuid,text,text,jsonb)','EXECUTE') s"))[0];
    ok(!fnPriv.a && !fnPriv.u && fnPriv.s, "O29 deneme onay RPC'si yalnız service_role", fnPriv);
  }

  console.log("— E: mevcut hesaplar + arşiv");
  // M2'de geçici dokunulan Premium satırı geri alındı; diğer alanlar karşılaştırılır.
  const after = JSON.parse(JSON.stringify(await q(snapshotSql, [EXISTING])));
  const beforeObj = JSON.parse(before);
  ok(JSON.stringify(after) === JSON.stringify(beforeObj), "E1 tüm testlerden sonra mevcut 6 hesap BİREBİR aynı", { before: beforeObj.length, after: after.length });
  const archive = await q("SELECT id FROM public.users WHERE role='expert' AND approval_status='approved' AND active=false");
  ok(!archive.some((r) => r.id === exp.user_id || r.id === T1), "E2 süresi dolan/durdurulan deneme arşive (kalıcı silme kapsamına) DÜŞMEDİ");
  await rpc("admin_trial_set_state", [ADMIN, T1, "suspend", null]);
  ok((await user(T1)).active === true, "E3 durdurulan deneme hesabı aktif kalır (giriş + görüntüleme)");

  console.log("— D: tek deneme hakkı saklama (24 ay, aylık imha)");
  {
    const counts = async () => (await q("SELECT (SELECT count(*) FROM public.users)::int u, (SELECT count(*) FROM public.clients)::int c, (SELECT count(*) FROM public.tenants)::int t, (SELECT count(*) FROM public.trial_profiles)::int p"))[0];
    const before = await counts();
    const claimsBefore = (await q("SELECT count(*)::int n FROM public.trial_claims"))[0].n;
    await q(`INSERT INTO public.trial_claims (claim_hash, first_user_id, claimed_at) VALUES
      ('trial-claim:eskieskieski01', gen_random_uuid(), now() - interval '25 months'),
      ('trial-claim:eskieskieski02', gen_random_uuid(), now() - interval '24 months' - interval '1 minute'),
      ('trial-claim:sinirsinir0001', gen_random_uuid(), now() - interval '24 months' + interval '1 day')`);
    const dry = await rpc("trial_claims_retention_purge", [true]);
    ok(dry.dry_run === true && Number(dry.claims) === 2 && dry.retention_months === 24, "D1 kuru çalıştırma: 24 ayı geçen 2 kayıt sayıldı", dry);
    ok((await q("SELECT count(*)::int n FROM public.trial_claims"))[0].n === claimsBefore + 3, "D2 kuru çalıştırma hiçbir şey silmedi");
    const run = await rpc("trial_claims_retention_purge", [false]);
    const left = (await q("SELECT claim_hash FROM public.trial_claims WHERE claim_hash LIKE 'trial-claim:eski%' OR claim_hash LIKE 'trial-claim:sinir%'")).map((r) => r.claim_hash);
    ok(Number(run.claims) === 2 && left.length === 1 && left[0] === "trial-claim:sinirsinir0001", "D3 imha: yalnız 24 ayı geçenler silindi, sınırdaki kayıt kaldı", { run, left });
    ok((await q("SELECT count(*)::int n FROM public.trial_claims"))[0].n === claimsBefore + 1, "D4 son 24 aydaki tüm tek hak kayıtları korundu");
    ok(JSON.stringify(await counts()) === JSON.stringify(before), "D5 kullanıcı / danışan / tenant / deneme profili kayıtlarına DOKUNULMADI", { before, after: await counts() });
    const again = await reg("yeniden@example.com", { claim: "eskieskieski01" });
    ok(again.ok === true && again.outcome === "provisioned", "D7 süresi dolan hak silindikten sonra aynı kanonik e-postayla yeniden deneme alınabilir", again);
    const still = await reg("tekrar@example.com", { claim: "sinirsinir0001" });
    ok(still.ok === false && still.outcome === "trial_already_used", "D8 24 ay dolmadan ikinci deneme YOK", still);
    const pr = (await q("SELECT has_function_privilege('anon','public.trial_claims_retention_purge(boolean)','EXECUTE') a, has_function_privilege('authenticated','public.trial_claims_retention_purge(boolean)','EXECUTE') u, has_function_privilege('service_role','public.trial_claims_retention_purge(boolean)','EXECUTE') s"))[0];
    ok(!pr.a && !pr.u && pr.s, "D9 imha fonksiyonu yalnız service_role", pr);
  }

  console.log("— Y: yetkiler");
  const fnsAll = ["trial_register_expert(jsonb)", "trial_activate_on_login(uuid)", "trial_credit_reserve(uuid,text,text)",
    "trial_credit_settle(bigint,boolean,integer)", "admin_trial_list(uuid,text,text,integer,integer)",
    "admin_trial_convert_to_pro(uuid,uuid,jsonb,text[])", "trial_pro_request_create(uuid,text)"];
  const priv = await q(`SELECT f, has_function_privilege('anon', 'public.'||f, 'EXECUTE') a, has_function_privilege('authenticated', 'public.'||f, 'EXECUTE') u,
     has_function_privilege('service_role', 'public.'||f, 'EXECUTE') s FROM unnest($1::text[]) f`, [fnsAll]);
  ok(priv.every((p) => !p.a && !p.u && p.s), "Y1 RPC'ler yalnız service_role (anon/authenticated YOK)", priv);
  const tp = await q(`SELECT t, has_table_privilege('service_role','public.'||t,'INSERT') i, has_table_privilege('service_role','public.'||t,'SELECT') s,
     has_table_privilege('anon','public.'||t,'SELECT') a FROM unnest(ARRAY['trial_profiles','trial_claims','trial_credit_ledger','pro_upgrade_requests','trial_admin_events']) t`);
  ok(tp.every((r) => !r.i && !r.a) && tp.find((r) => r.t === "trial_claims").s === false, "Y2 tablolara doğrudan yazma yok; trial_claims okunamaz", tp);
} catch (e) {
  fail++;
  console.error("HARNESS HATASI:", e.message, e.where ?? "");
} finally {
  for (const cl of clients) await cl.end().catch(() => {});
  await server.stop().catch(() => {});
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows EPERM — geçici dizin */
  }
}
console.log(`\ntrial7 db harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
