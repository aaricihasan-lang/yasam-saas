/**
 * GİRİŞ GÜVENLİĞİ — F2 test veritabanı DÜZEY korumasının testi (yalnız test altyapısı; production'a SIFIR temas).
 *
 * Kanıtlananlar:
 *   A) Statik: depodaki migration klasörü = F2_STAGES = testDb.ts (bugünkü depo PASS).
 *   B) Mutasyon: yeni bir F2 migration'ı (sahte 001300) eklenip testDb.ts / F2_STAGES güncellenmezse koruma FAIL verir;
 *      testDb.ts bir aşamayı (001200) uygulamayı bırakırsa FAIL; en güncel zincir eşlemesi silinirse FAIL.
 *   C) Dinamik: F2_TEST_DB_LATEST=1 ile kurulan GERÇEK PostgreSQL'in düzeyi kayıt = katalog = en güncel; düzey satırı yazılır.
 *      Negatif kontrol kurulumu ({ withF2j }) F2-K öncesi düzeyde (1000) kalır.
 *   D) İzolasyon: F2_TEST_DB_LATEST=1 + F2L_NEGATIF=1 birlikte REDDEDİLİR (negatif kontrol sessizce "düzeltilemez").
 *   E) Koşucu yargısı: günlükte düzey satırı yoksa / eski düzeydeyse / kayıt-katalog çelişiyorsa FAIL.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2-test-db-duzey.harness.ts
 */
import fs from "node:fs";
import path from "node:path";
import { F2_STAGES } from "./f2-migration-guard.mjs";
import { checkCoverage, readRepo, latestStage, stageBefore, judgeLevels, parseLevelLines } from "./f2-test-db-duzey.mjs";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n── ${s} ──`);

async function main() {
  const root = process.cwd();
  const repo = readRepo(root);
  const latest = latestStage();

  section("A) Statik kapsam (bugünkü depo)");
  const now = checkCoverage(repo);
  ok(now.length === 0, `migration klasörü = F2_STAGES = testDb.ts (en güncel ${latest.level} / ${latest.file})`, now);
  ok(latest.level === Math.max(...F2_STAGES.map((s) => s.level)), "F2_STAGES son öğesi en yüksek düzey");
  ok(stageBefore(1100).level === 1000, "negatif kontrol düzeyi = F2-K'dan önceki aşama (1000)");

  section("B) Mutasyon: koruma sessiz eski düzeyi yakalar");
  // Sahte "bir sonraki" aşama en güncel aşamadan türetilir (sabit sürüm yazılmaz; yeni aşama eklendikçe test bayatlamaz).
  const nextFile = String(Number(latest.file) + 100);
  const fake = `${nextFile}_auth_sahte_yeni_asama.sql`;
  const m1 = checkCoverage({ ...repo, dirFiles: [...repo.dirFiles, fake] });
  ok(m1.some((p) => /F2_STAGES güncel değil/.test(p)) && m1.some((p) => p.includes(nextFile)),
    "yeni migration dosyası + F2_STAGES/testDb güncellenmedi → FAIL", m1);
  const m2 = checkCoverage({ ...repo, dirFiles: [...repo.dirFiles, fake],
    stages: [...F2_STAGES, { level: latest.level + 100, file: nextFile, fp: "true" }] });
  ok(m2.some((p) => p.includes(`UYGULAMIYOR: ${nextFile}`)) && m2.every((p) => !/F2_STAGES güncel değil/.test(p)),
    "F2_STAGES güncellendi ama testDb.ts uygulamıyor → FAIL", m2);
  const m3 = checkCoverage({ ...repo, testDbSource: repo.testDbSource.split(`"supabase/migrations/${latest.file}_`).join(`"supabase/migrations/KALDIRILDI_`) });
  ok(m3.some((p) => p.includes(`UYGULAMIYOR: ${latest.file}`)), `testDb.ts en güncel aşamayı (${latest.file}) bırakırsa → FAIL`, m3);
  const m4 = checkCoverage({ ...repo, testDbSource: repo.testDbSource.replace(/process\.env\.F2_TEST_DB_LATEST === "1"/g, "false") });
  ok(m4.some((p) => /F2_TEST_DB_LATEST=1/.test(p)), "en güncel zincir eşlemesi silinirse → FAIL", m4);
  const m6 = checkCoverage({ ...repo, runAllSource: (repo.runAllSource ?? "").split(`"${latest.file}_`).join(`"KALDIRILDI_`) });
  ok(m6.some((p) => p.includes("run-all.mjs") && p.includes(latest.file)), "run-all.mjs (deploy-order / postflight) en son aşamayı içermezse → FAIL", m6);
  const m5 = checkCoverage({ ...repo, dirFiles: repo.dirFiles.filter((f) => !f.startsWith(latest.file)) });
  ok(m5.some((p) => /F2_STAGES güncel değil/.test(p)), "F2_STAGES klasörden ileride (dosya yok) → FAIL", m5);

  section("C) Dinamik: gerçek PostgreSQL düzeyi");
  const { startF2cDb } = await import("./testDb");
  const logs: string[] = [];
  const origLog = console.log;
  const keep = (fn: () => Promise<void>) => async () => {
    console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); origLog(...a); };
    try { await fn(); } finally { console.log = origLog; }
  };
  const saved = { latest: process.env.F2_TEST_DB_LATEST, neg: process.env.F2L_NEGATIF, log: process.env.F2_TEST_DB_LEVEL_LOG };
  for (const k of Object.keys(process.env)) if (/^F2_TEST_DB_|^F2L_NEGATIF$/.test(k)) delete process.env[k];
  try {
    process.env.F2_TEST_DB_LATEST = "1";
    await keep(async () => {
      const db = await startF2cDb();
      try {
        ok(db.level.registry === latest.level && db.level.catalog === latest.level && db.level.latest === latest.level,
          `F2_TEST_DB_LATEST=1 → kayıt=${db.level.registry} katalog=${db.level.catalog} (en güncel ${latest.level})`, db.level);
        const ver = (await db.admin.query(`SELECT current_setting('server_version') AS v`)).rows[0].v as string;
        console.log(`  bilgi: PostgreSQL ${ver}`);
        ok(/^\d+\.\d+/.test(ver), `PostgreSQL sürümü okundu (${ver})`);
        const smtp = (await db.admin.query(`SELECT public.auth_email_provider_allowed('smtp') AS x`)).rows[0].x;
        ok(smtp === true, "001200 nesnesi gerçekten kurulu: 'smtp' sağlayıcısı izinli");
        const fpOk = (await db.admin.query(`SELECT (${latest.fp}) AS x`)).rows[0].x;
        ok(fpOk === true, `en güncel aşamanın (${latest.level}) parmak izi nesnesi kurulu`);
      } finally { await db.close(); }
    })();
    ok(parseLevelLines(logs.join("\n")).some((l) => l.registry === latest.level && l.catalog === latest.level),
      "düzey satırı günlüğe yazıldı ([f2-test-db] düzey ...)");

    delete process.env.F2_TEST_DB_LATEST;
    process.env.F2L_NEGATIF = "1";
    process.env.F2_TEST_DB_LEVEL_LOG = "1";
    logs.length = 0;
    await keep(async () => {
      const db = await startF2cDb({ withF2j: true });   // f2k-ui negatif kontrolüyle aynı kurulum
      try {
        ok(db.level.registry === 1000 && db.level.catalog === 1000, `negatif kontrol kurulumu F2-K öncesi: kayıt=${db.level.registry} katalog=${db.level.catalog}`, db.level);
        const k = (await db.admin.query(`SELECT to_regprocedure('public.users_admin_grant_guard()') IS NOT NULL AS x`)).rows[0].x;
        ok(k === false, "negatif kontrol DB'sinde F2-K nesnesi YOK");
      } finally { await db.close(); }
    })();
    ok(judgeLevels(logs.join("\n"), 1000).ok, "koşucu yargısı negatif kurulumu 1000 olarak kabul eder");

    section("D) İzolasyon");
    process.env.F2_TEST_DB_LATEST = "1";
    process.env.F2L_NEGATIF = "1";
    let err = "";
    try { const db = await startF2cDb({ withF2j: true }); await db.close(); } catch (e) { err = String((e as Error).message); }
    ok(/birlikte verilemez/.test(err), "F2_TEST_DB_LATEST=1 + F2L_NEGATIF=1 → kurulum REDDEDİLİR", err);
  } finally {
    for (const k of ["F2_TEST_DB_LATEST", "F2L_NEGATIF", "F2_TEST_DB_LEVEL_LOG"]) delete process.env[k];
    if (saved.latest !== undefined) process.env.F2_TEST_DB_LATEST = saved.latest;
    if (saved.neg !== undefined) process.env.F2L_NEGATIF = saved.neg;
    if (saved.log !== undefined) process.env.F2_TEST_DB_LEVEL_LOG = saved.log;
  }

  section("E) Koşucu yargısı (günlük → düzey)");
  const L = latest.level;
  ok(!judgeLevels("f2k-ui: 80 PASS / 0 FAIL", L).ok, "düzey satırı yok → FAIL");
  ok(!judgeLevels(`[f2-test-db] düzey kayıt=1100 katalog=1100 en-güncel=${L}`, L).ok, "eski düzey (1100; 23.11 hatası) → FAIL");
  ok(!judgeLevels(`[f2-test-db] düzey kayıt=${L} katalog=1100 en-güncel=${L}`, L).ok, "kayıt ile katalog çelişkisi → FAIL");
  ok(!judgeLevels(`[f2-test-db] düzey kayıt=${L} katalog=${L} en-güncel=${L}\n[f2-test-db] düzey kayıt=1100 katalog=1100 en-güncel=${L}`, L).ok,
    "tek bir eski kurulum bile → FAIL");
  ok(judgeLevels(`[f2-test-db] düzey kayıt=${L} katalog=${L} en-güncel=${L}`, L).ok, "doğru düzey → PASS");

  section("F) Koşucu ve iş akışı sabit F2-K düzeyi içermiyor");
  const runner = fs.readFileSync(path.join(root, "scripts", "giris-guvenligi", "ci-f2-tarayici.mjs"), "utf8");
  ok(!/F2_TEST_DB_WITH_F2[A-Z]/.test(runner) && /F2_TEST_DB_LATEST: "1"/.test(runner), "ci-f2-tarayici.mjs en güncel zinciri kullanıyor (sabit F2_TEST_DB_WITH_F2x yok)");
  ok(/judgeLevels\(text, EXPECTED_LEVEL\)/.test(runner) && /checkCoverage\(readRepo/.test(runner), "koşucu statik + dinamik düzey korumasını çağırıyor");

  console.log(`\nf2-test-db-duzey: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
