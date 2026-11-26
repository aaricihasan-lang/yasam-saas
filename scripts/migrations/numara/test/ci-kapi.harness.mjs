// DB-03 CI KAPISI senaryo testleri — gerçek git (geçici bare depo + PR dalları), ağ / GitHub / DB YOK.
// Çalıştırma: node scripts/migrations/numara/test/ci-kapi.harness.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ayir, blobIcerik, git, okuUzak, olayEkle, DEFAULTS } from "../defter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "cli.mjs");
const KAPI = path.resolve(HERE, "..", "..", "..", "ci", "migration-reservation-check.mjs");
const KOK = fs.mkdtempSync(path.join(os.tmpdir(), "mig-numara-ci-"));
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); };
const UZAK = path.join(KOK, "uzak.git");
spawnSync("git", ["init", "--quiet", "--bare", "-b", "main", UZAK]);
const K = path.join(KOK, "ana");
spawnSync("git", ["clone", "--quiet", UZAK, K]);
const sh = (cwd, ...a) => git(cwd, a);
const yaz = (d, f, t) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
for (const c of [["config", "user.name", "ana"], ["config", "user.email", "a@t"]]) sh(K, ...c);
yaz(K, "README.md", "x\n");
for (const f of ["20280126000000_member_access_restriction.sql", "20280127000000_member_access_message.sql", "20280128000000_astro_analysis_result_parts.sql"]) yaz(K, `supabase/migrations/${f}`, `-- ${f}\nBEGIN;\nSELECT 1;\nCOMMIT;\n`);
sh(K, "add", "-A");
sh(K, "commit", "-q", "-m", "ana");
sh(K, "push", "-q", "origin", "main");
fs.writeFileSync(path.join(KOK, "prod.txt"), "20280129000000\n");
spawnSync(process.execPath, [CLI, "tohumla", "--prod-gecmis", path.join(KOK, "prod.txt")], { cwd: K });
const A1 = ayir(K, { modul: "atlas", ad: "kp_yeni", dal: "work/kp", refs: ["origin/main"] }); // ayrıldı
const A2 = ayir(K, { modul: "uye", ad: "uye_yeni", dal: "work/uye", refs: ["origin/main"] });
const A3 = ayir(K, { modul: "iptal", ad: "iptal_edilen", dal: "work/i", refs: ["origin/main"] });
olayEkle(K, { olay: "iptal", surum: A3.surum, neden: "test" });
const A4 = ayir(K, { modul: "uyg", ad: "uygulanan", dal: "work/u", refs: ["origin/main"] });

let n = 0;
const pr = (ad, degistir) => {
  const d = path.join(KOK, `pr${++n}`);
  spawnSync("git", ["clone", "--quiet", UZAK, d]);
  sh(d, "config", "user.name", ad);
  sh(d, "config", "user.email", "p@t");
  sh(d, "checkout", "-q", "-b", `work/${ad}`);
  degistir(d);
  sh(d, "add", "-A");
  sh(d, "commit", "-q", "-m", ad);
  return d;
};
const kapi = (d, ...ek) => {
  const r = spawnSync(process.execPath, [KAPI, "--base", "origin/main", ...ek], { cwd: d, encoding: "utf8", env: { ...process.env, MIGRATION_NUMARA_ROOT: d, MIGRATION_NUMARA_OKUMA_DENEME: "2" } });
  return { kod: r.status, out: r.stdout + r.stderr };
};
const M = (v, ad) => `supabase/migrations/${v}_${ad}.sql`;
const sql = "BEGIN;\nSELECT 2;\nCOMMIT;\n";

try {
  let d = pr("belge", (x) => yaz(x, "README.md", "değişti\n"));
  sh(d, "remote", "set-url", "origin", path.join(KOK, "yok.git"));
  sh(d, "fetch", "-q", UZAK, "+refs/heads/main:refs/remotes/origin/main");
  let r = kapi(d, "--zorunlu");
  ok("migration içermeyen PR: defter erişilemese bile PASS (gereksiz engel yok)", r.kod === 0 && /migration içermiyor/.test(r.out));

  d = pr("kp", (x) => yaz(x, M(A1.surum, "kp_yeni"), sql));
  r = kapi(d, "--zorunlu");
  ok("ayrılmış numara + birebir dosya adı → PASS", r.kod === 0 && /OK .*ayrılmış/.test(r.out), r.out.split("\n").find((l) => l.startsWith("OK")));

  d = pr("ikinci-pr", (x) => yaz(x, M(A1.surum, "baska_is"), sql));
  r = kapi(d, "--zorunlu");
  ok("iki farklı PR aynı numara: ikinci (farklı ad) → FAIL", r.kod === 1 && /başka bir migration için ayrılmış/.test(r.out));

  d = pr("ayrilmamis", (x) => yaz(x, M("20300101000000", "kendi_numaram"), sql));
  r = kapi(d, "--zorunlu");
  ok("ayrılmamış (elle seçilmiş) numara → FAIL + Türkçe yönlendirme", r.kod === 1 && /ayrılmamış\. Numara almak için: npm run migration:numara/.test(r.out));

  d = pr("yeniden-adlandir", (x) => sh(x, "mv", M("20280127000000", "member_access_message"), M("20290101000000", "member_access_message")));
  r = kapi(d, "--zorunlu");
  ok("eski migration yeniden adlandırma → FAIL", r.kod === 1 && /yeniden adlandırılamaz/.test(r.out));

  d = pr("icerik", (x) => fs.appendFileSync(path.join(x, M("20280126000000", "member_access_restriction")), "-- değişti\n"));
  r = kapi(d, "--zorunlu");
  ok("uygulanmış (base'deki) migration içeriği değişikliği → FAIL", r.kod === 1 && /içeriği değiştirilemez/.test(r.out));

  d = pr("sil", (x) => sh(x, "rm", "-q", M("20280128000000", "astro_analysis_result_parts")));
  r = kapi(d, "--zorunlu");
  ok("uygulanmış migration silme → FAIL", r.kod === 1 && /silinemez/.test(r.out));

  d = pr("prod-numara", (x) => yaz(x, M("20280129000000", "prodda_var"), sql));
  r = kapi(d, "--zorunlu");
  ok("production'da başka iş için kullanılmış numara → FAIL", r.kod === 1 && /daha önce kullanılmış/.test(r.out));

  d = pr("iptal", (x) => yaz(x, M(A3.surum, "iptal_edilen"), sql));
  r = kapi(d, "--zorunlu");
  ok("iptal edilmiş numara → FAIL", r.kod === 1 && /iptal edilmiş/.test(r.out));

  // Uygulanmış kayıt: önce PR'da bağla (SHA), uygula; sonra içerik değişirse FAIL.
  d = pr("uygulanan", (x) => yaz(x, M(A4.surum, "uygulanan"), sql));
  olayEkle(d, { olay: "bagla", surum: A4.surum, dosya: `${A4.surum}_uygulanan.sql`, sha256: blobIcerik(d, "HEAD", `${A4.surum}_uygulanan.sql`).sha256 });
  olayEkle(d, { olay: "uygula", surum: A4.surum, sha256: blobIcerik(d, "HEAD", `${A4.surum}_uygulanan.sql`).sha256 });
  r = kapi(d, "--zorunlu");
  ok("uygulanmış kayıt içeriği aynı → PASS", r.kod === 0, r.out.split("\n").filter((l) => /FAIL|OK/.test(l)).join(" | "));
  fs.appendFileSync(path.join(d, M(A4.surum, "uygulanan")), "SELECT 3;\n");
  sh(d, "commit", "-qam", "degisti");
  r = kapi(d, "--zorunlu");
  ok("uygulanmış kaydın içeriği PR'da değişti → FAIL", r.kod === 1 && /uygulanmış içerik/.test(r.out));

  d = pr("defter-yok", (x) => yaz(x, M(A2.surum, "uye_yeni"), sql));
  sh(d, "remote", "set-url", "origin", path.join(KOK, "yok.git"));
  sh(d, "fetch", "-q", UZAK, "+refs/heads/main:refs/remotes/origin/main");
  r = kapi(d, "--zorunlu");
  ok("migration var + defter okunamıyor → ZORUNLU kipte FAIL (sessiz PASS yok)", r.kod === 1 && /doğrulanamadı/.test(r.out));
  r = kapi(d);
  ok("aynı durum UYARI kipinde (etkinleştirme öncesi): çıkış 0 ama bulgu yazılır", r.kod === 0 && /UYARI .*doğrulanamadı/.test(r.out) && /UYARI kipi/.test(r.out));

  // Kurcalanmış defter (satır silen ileri-sarma commit uzağa itilmiş) → FAIL.
  {
    const t = path.join(KOK, "kurcala");
    spawnSync("git", ["clone", "--quiet", UZAK, t]);
    const { tip, text } = okuUzak(t);
    const blob = git(t, ["hash-object", "-w", "--stdin"], { input: text.split("\n").slice(2).join("\n") }).out.trim();
    const tree = git(t, ["mktree"], { input: `100644 blob ${blob}\t${DEFAULTS.file}\n` }).out.trim();
    const c = git(t, ["-c", "user.name=k", "-c", "user.email=k@t", "commit-tree", tree, "-p", tip, "-m", "kurcala"]).out.trim();
    git(t, ["push", "-q", "origin", `${c}:${DEFAULTS.ref}`]);
    d = pr("kurcali", (x) => yaz(x, M(A2.surum, "uye_yeni"), sql));
    r = kapi(d, "--zorunlu");
    ok("satır silinmiş (kurcalanmış) defter → FAIL", r.kod === 1 && /satır silinmiş/.test(r.out));
  }
} catch (e) {
  fail++;
  console.log(`FAIL beklenmeyen hata: ${e.stack?.split("\n").slice(0, 4).join(" | ")}`);
} finally {
  fs.rmSync(KOK, { recursive: true, force: true });
}
console.log(`\nmigration-numara CI kapısı harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
