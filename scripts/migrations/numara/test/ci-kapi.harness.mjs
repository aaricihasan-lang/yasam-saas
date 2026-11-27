// DB-03 CI KAPISI senaryo testleri — gerçek git (geçici bare depo + PR dalları) + sentetik GitHub olay dosyası
// (GITHUB_EVENT_NAME / GITHUB_EVENT_PATH: GitHub'ın CI'a verdiği güvenilir bağlam). Ağ / GitHub / DB YOK.
// Çalıştırma: node scripts/migrations/numara/test/ci-kapi.harness.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ayir, blobIcerik, git, okuUzak, olayEkle, DEFAULTS } from "../defter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "cli.mjs");
const KAPI = path.resolve(HERE, "..", "..", "..", "ci", "migration-reservation-check.mjs");
const KOK = fs.mkdtempSync(path.join(os.tmpdir(), "mig-numara-ci-"));
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); };
const sh = (cwd, ...a) => git(cwd, a);
const yaz = (d, f, t) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
const DEPO = "sahip/yasam-test";
const UZAK = path.join(KOK, "sahip", "yasam-test.git"); // URL'den depo kimliği "sahip/yasam-test"
fs.mkdirSync(path.dirname(UZAK), { recursive: true });
spawnSync("git", ["init", "--quiet", "--bare", "-b", "main", UZAK]);
const K = path.join(KOK, "ana");
spawnSync("git", ["clone", "--quiet", UZAK, K]);
sh(K, "config", "user.name", "ana"); sh(K, "config", "user.email", "a@t");
yaz(K, "README.md", "x\n");
for (const f of ["20280126000000_member_access_restriction.sql", "20280127000000_member_access_message.sql", "20280128000000_astro_analysis_result_parts.sql"]) yaz(K, `supabase/migrations/${f}`, `-- ${f}\nBEGIN;\nSELECT 1;\nCOMMIT;\n`);
sh(K, "add", "-A"); sh(K, "commit", "-q", "-m", "ana"); sh(K, "push", "-q", "origin", "main");
fs.writeFileSync(path.join(KOK, "prod.txt"), "20280126000000|member_access_restriction\n20280127000000|member_access_message\n20280128000000|astro_analysis_result_parts\n20280129000000|prodda_var\n");
spawnSync(process.execPath, [CLI, "tohumla", "--prod-gecmis", path.join(KOK, "prod.txt")], { cwd: K });

let n = 0;
/** PR dalı: klon, dal, değişiklik, commit. `ayirAd` verilirse dalda numara AYIRIR (gerçek akış) ve dosyayı yazar. */
const pr = (dal, degistir) => {
  const d = path.join(KOK, `pr${++n}`);
  spawnSync("git", ["clone", "--quiet", UZAK, d]);
  sh(d, "config", "user.name", dal); sh(d, "config", "user.email", "p@t");
  sh(d, "checkout", "-q", "-b", dal);
  const ek = degistir(d) ?? {};
  sh(d, "add", "-A"); sh(d, "commit", "-q", "-m", dal);
  return { d, ...ek };
};
const yeniMigration = (d, dal, ad, govde = `SELECT 2; -- ${ad}`) => {
  const r = ayir(d, { modul: "test", ad, dal, refs: ["origin/main"] });
  yaz(d, `supabase/migrations/${r.dosya}`, `BEGIN;\n${govde}\nCOMMIT;\n`);
  return r;
};
const bagla = (d, surum, prNo, { dal, depo = DEPO, sha } = {}) => {
  const st = [...(okuUzak(d).text.split("\n").filter(Boolean).map((l) => JSON.parse(l)))].find((o) => o.surum === surum && o.olay === "ayir");
  olayEkle(d, { olay: "bagla", surum, pr: prNo, dal: dal ?? sh(d, "rev-parse", "--abbrev-ref", "HEAD").out.trim(), depo, sha256: sha ?? blobIcerik(d, "HEAD", st.dosya).sha256, commit: sh(d, "rev-parse", "HEAD").out.trim() });
};
const olay = (prNo, dal, { headDepo = DEPO, baseDepo = DEPO } = {}) => {
  const p = path.join(KOK, `olay-${crypto.randomUUID()}.json`);
  fs.writeFileSync(p, JSON.stringify({ pull_request: { number: prNo, head: { ref: dal, repo: { full_name: headDepo } }, base: { repo: { full_name: baseDepo } } } }));
  return { GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: p };
};
const kapi = (d, env = {}, ...ek) => {
  const r = spawnSync(process.execPath, [KAPI, "--base", "origin/main", "--zorunlu", ...ek], { cwd: d, encoding: "utf8", env: { ...process.env, GITHUB_EVENT_NAME: "", GITHUB_EVENT_PATH: "", MIGRATION_NUMARA_ROOT: d, MIGRATION_NUMARA_OKUMA_DENEME: "2", ...env } });
  return { kod: r.status, out: r.stdout + r.stderr };
};
const sql = "BEGIN;\nSELECT 2;\nCOMMIT;\n";

try {
  // ── Meşru akış: ayır → yaz → commit → PR (#101) → bağla → CI PASS.
  const A = pr("work/kp-a", (d) => ({ r: yeniMigration(d, "work/kp-a", "kp_meşru".replace("ş", "s")) }));
  bagla(A.d, A.r.surum, 101);
  let r = kapi(A.d, olay(101, "work/kp-a"));
  ok("meşru PR: ayrıldı + PR #101'e bağlı + dal/depo + SHA eşleşti → PASS", r.kod === 0 && /OK .*PR #101/.test(r.out), r.out.split("\n").find((l) => /OK|FAIL/.test(l)));

  // ── Güvenilir iş akışı kipi: çalışma kopyası BASE commit'te (PR kodu yok), PR ucu yalnız --head ile veri olarak.
  {
    sh(A.d, "checkout", "-q", "--detach", "origin/main");
    const g = kapi(A.d, olay(101, "work/kp-a"), "--head", "work/kp-a");
    const g2 = kapi(A.d, olay(999, "work/kp-a"), "--head", "work/kp-a");
    sh(A.d, "checkout", "-q", "work/kp-a");
    ok("--head kipi (base checkout + PR ucu veri): meşru PR PASS, yanlış PR no FAIL", g.kod === 0 && /OK .*PR #101/.test(g.out) && g2.kod === 1, g.out.split("\n").find((l) => /OK|FAIL/.test(l)));
    sh(A.d, "checkout", "-q", "--detach", "origin/main");
    const pt = kapi(A.d, { ...olay(101, "work/kp-a"), GITHUB_EVENT_NAME: "pull_request_target" }, "--head", "work/kp-a");
    sh(A.d, "checkout", "-q", "work/kp-a");
    ok("güvenilir iş akışı olayı (pull_request_target) + --head: meşru PR PASS (canlı CI'da bulunan hata)", pt.kod === 0 && /OK .*PR #101/.test(pt.out), pt.out.split("\n").find((l) => /OK|FAIL/.test(l)));
  }
  // ── SHA-256 bütünlüğü
  {
    const B = pr("work/sadece-ayrildi", (d) => ({ r: yeniMigration(d, "work/sadece-ayrildi", "baglanmamis_is") }));
    r = kapi(B.d, olay(102, "work/sadece-ayrildi"));
    ok("yalnız 'ayrildi' (içerik PR'a bağlanmamış) → ZORUNLU kipte FAIL", r.kod === 1 && /BAĞLANMAMIŞ/.test(r.out));
    bagla(B.d, B.r.surum, 102);
    fs.appendFileSync(path.join(B.d, "supabase/migrations", B.r.dosya), "-- sonradan\n");
    sh(B.d, "commit", "-qam", "sql degisti");
    r = kapi(B.d, olay(102, "work/sadece-ayrildi"));
    ok("bağladıktan SONRA SQL değişti → FAIL (yeniden bağlama yönergesiyle)", r.kod === 1 && /AYNI DEĞİL/.test(r.out) && /bagla --surum/.test(r.out));
    bagla(B.d, B.r.surum, 102);
    r = kapi(B.d, olay(102, "work/sadece-ayrildi"));
    ok("yeni içerik onaylı akışla yeniden bağlandı → PASS", r.kod === 0, r.out.split("\n").find((l) => /OK|FAIL/.test(l)));
    yaz(B.d, "README.md", "PR yeni commit (migration dışı)\n");
    sh(B.d, "commit", "-qam", "baska degisiklik");
    ok("PR migration dışı yeni commit aldı → SHA aynı, PASS", kapi(B.d, olay(102, "work/sadece-ayrildi")).kod === 0);
  }
  // ── Windows CRLF çalışma kopyası ↔ LF blob: özet BLOB'dan alınır → aynı.
  {
    const C = pr("work/crlf", (d) => {
      sh(d, "config", "core.autocrlf", "true");
      return { r: yeniMigration(d, "work/crlf", "crlf_testi", "SELECT 3;\nSELECT 4;") };
    });
    const dosya = path.join(C.d, "supabase/migrations", C.r.dosya);
    sh(C.d, "rm", "-q", "--cached", `supabase/migrations/${C.r.dosya}`); sh(C.d, "commit", "-q", "-m", "x");
    fs.writeFileSync(dosya, fs.readFileSync(dosya, "utf8").replace(/\n/g, "\r\n"));
    sh(C.d, "add", "-A"); sh(C.d, "commit", "-q", "-m", "crlf calisma kopyasi");
    const blob = blobIcerik(C.d, "HEAD", C.r.dosya);
    const calisma = crypto.createHash("sha256").update(fs.readFileSync(dosya)).digest("hex");
    bagla(C.d, C.r.surum, 103);
    r = kapi(C.d, olay(103, "work/crlf"));
    ok("CRLF çalışma kopyası: blob LF (CR yok), çalışma kopyası özeti FARKLI ama bağlama + CI blob'u kullanır → PASS", !blob.buf.includes(13) && calisma !== blob.sha256 && r.kod === 0, `blob ${blob.sha256.slice(0, 8)} / çalışma ${calisma.slice(0, 8)}`);
  }
  // ── Sahiplik
  {
    // Aynı dosya adıyla ikinci PR (A'nın dosyasını kopyalayan başka dal/PR).
    const D = pr("work/kopya-pr", (d) => yaz(d, `supabase/migrations/${A.r.dosya}`, fs.readFileSync(path.join(A.d, "supabase/migrations", A.r.dosya))));
    r = kapi(D.d, olay(201, "work/kopya-pr"));
    ok("aynı dosya adıyla İKİNCİ PR (#201) → FAIL (defterde PR #101'e bağlı)", r.kod === 1 && /PR #101'ye bağlı; bu PR #201/.test(r.out) && /dalına bağlı/.test(r.out));
    const E = pr("work/ayni-numara", (d) => yaz(d, `supabase/migrations/${A.r.surum}_baska_dosya.sql`, sql));
    r = kapi(E.d, olay(202, "work/ayni-numara"));
    ok("aynı numarayla FARKLI dosya → FAIL", r.kod === 1 && /başka bir migration için ayrılmış/.test(r.out));
    r = kapi(A.d, olay(999, "work/kp-a"));
    ok("başka PR numarası (olay #999, defter #101) → FAIL", r.kod === 1 && /bu PR #999/.test(r.out));
    r = kapi(A.d, olay(101, "work/kp-a", { headDepo: "saldirgan/yasam-test" }));
    ok("fork'tan PR → FAIL", r.kod === 1 && /Fork'tan gelen PR/.test(r.out));
    r = kapi(A.d, { GITHUB_EVENT_NAME: "push", GITHUB_EVENT_PATH: "" });
    ok("yanlış olay türü (pull_request değil) + migration → FAIL (güvenilir bağlam yok)", r.kod === 1 && /Güvenilir PR bağlamı yok/.test(r.out));
    r = kapi(A.d, { GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: path.join(KOK, "yok.json") });
    ok("olay dosyası eksik / sahte bağlam → FAIL", r.kod === 1 && /Güvenilir PR bağlamı yok/.test(r.out));
    const F = pr("work/yanlis-dal-bagla", (d) => ({ r: yeniMigration(d, "work/yanlis-dal-bagla", "yanlis_dal") }));
    bagla(F.d, F.r.surum, 104, { dal: "work/baskasinin-dali" });
    r = kapi(F.d, olay(104, "work/yanlis-dal-bagla"));
    ok("defterde başka dala bağlanmış (sahiplenme girişimi) → FAIL", r.kod === 1 && /dalına bağlı/.test(r.out));
    // Ana dal ilerledi (başka PR merge oldu) → meşru PR hâlâ PASS.
    yaz(K, "README.md", "ana ilerledi\n"); sh(K, "commit", "-qam", "ileri"); sh(K, "push", "-q", "origin", "main");
    sh(A.d, "fetch", "-q", "origin"); sh(A.d, "merge", "-q", "--no-edit", "origin/main");
    { const q = kapi(A.d, olay(101, "work/kp-a")); ok("ana dal ilerledi + PR eşitlendi → meşru PR hâlâ PASS", q.kod === 0, q.kod ? q.out.slice(-600) : ""); }
  }
  // ── Kötü niyetli değişiklikler
  {
    let x = pr("work/yeniden-adlandir", (d) => sh(d, "mv", "supabase/migrations/20280127000000_member_access_message.sql", "supabase/migrations/20290101000000_member_access_message.sql"));
    ok("eski migration yeniden adlandırma → FAIL", kapi(x.d, olay(301, "work/yeniden-adlandir")).out.includes("yeniden adlandırılamaz"));
    x = pr("work/sil-yeniden-olustur", (d) => { fs.rmSync(path.join(d, "supabase/migrations/20280126000000_member_access_restriction.sql")); yaz(d, "supabase/migrations/20280126000000_member_access_restriction.sql", "BEGIN;\nSELECT 99;\nCOMMIT;\n"); });
    r = kapi(x.d, olay(302, "work/sil-yeniden-olustur"));
    ok("eski migration'ı silip aynı adla yeniden oluşturma (içerik değişti) → FAIL", r.kod === 1 && /içeriği değiştirilemez/.test(r.out));
    x = pr("work/sil", (d) => sh(d, "rm", "-q", "supabase/migrations/20280128000000_astro_analysis_result_parts.sql"));
    ok("eski migration silme → FAIL", kapi(x.d, olay(303, "work/sil")).out.includes("silinemez"));
    x = pr("work/eskiyi-yeni-adla", (d) => ({ r: (() => { const rr = ayir(d, { modul: "test", ad: "kopya_icerik", dal: "work/eskiyi-yeni-adla", refs: ["origin/main"] }); fs.copyFileSync(path.join(d, "supabase/migrations/20280128000000_astro_analysis_result_parts.sql"), path.join(d, "supabase/migrations", rr.dosya)); return rr; })() }));
    bagla(x.d, x.r.surum, 304);
    r = kapi(x.d, olay(304, "work/eskiyi-yeni-adla"));
    ok("eski migration'ın içeriğini yeni numarayla (meşru ayırma + bağlama ile bile) yayımlama → FAIL", r.kod === 1 && /BİREBİR aynı/.test(r.out));
    x = pr("work/iki-numara-ayni-sql", (d) => {
      const r1 = ayir(d, { modul: "test", ad: "ikiz_bir", dal: "work/iki-numara-ayni-sql", refs: ["origin/main"] });
      const r2 = ayir(d, { modul: "test", ad: "ikiz_iki", dal: "work/iki-numara-ayni-sql", refs: ["origin/main"] });
      yaz(d, `supabase/migrations/${r1.dosya}`, "BEGIN;\nSELECT 777;\nCOMMIT;\n"); yaz(d, `supabase/migrations/${r2.dosya}`, "BEGIN;\nSELECT 777;\nCOMMIT;\n");
      return { r1, r2 };
    });
    bagla(x.d, x.r1.surum, 305); bagla(x.d, x.r2.surum, 305);
    ok("aynı SQL iki farklı numaraya bağlı → FAIL", /aynı içerik \(SHA-256\)/.test(kapi(x.d, olay(305, "work/iki-numara-ayni-sql")).out));
    x = pr("work/prod-numara", (d) => yaz(d, "supabase/migrations/20280129000000_prodda_var.sql", sql));
    ok("production'da kullanılmış numara → FAIL", /daha önce kullanılmış/.test(kapi(x.d, olay(306, "work/prod-numara")).out));
    x = pr("work/ayrilmamis", (d) => yaz(d, "supabase/migrations/20300101000000_kendi_numaram.sql", sql));
    r = kapi(x.d, olay(307, "work/ayrilmamis"));
    ok("rezervasyon olmadan migration dosyası → FAIL + yönerge", r.kod === 1 && /ayrılmamış\. Numara almak için/.test(r.out));
    x = pr("work/iptal", (d) => ({ r: yeniMigration(d, "work/iptal", "iptal_edilecek") }));
    olayEkle(x.d, { olay: "iptal", surum: x.r.surum, neden: "vazgeçildi" });
    ok("iptal edilmiş numara → FAIL", /iptal edilmiş/.test(kapi(x.d, olay(308, "work/iptal")).out));
  }
  // ── Uygulanmış içerik değiştirilemez (meşru bağlama + uygula sonrası PR'da değişiklik).
  {
    const U = pr("work/uygulanan", (d) => ({ r: yeniMigration(d, "work/uygulanan", "uygulanan_is") }));
    bagla(U.d, U.r.surum, 401);
    olayEkle(U.d, { olay: "uygula", surum: U.r.surum, sha256: blobIcerik(U.d, "HEAD", U.r.dosya).sha256, proje: "test" });
    { const q = kapi(U.d, olay(401, "work/uygulanan")); ok("uygulanmış + içerik aynı → PASS", q.kod === 0, q.kod ? q.out.slice(-600) : ""); }
    fs.appendFileSync(path.join(U.d, "supabase/migrations", U.r.dosya), "SELECT 5;\n");
    sh(U.d, "commit", "-qam", "uygulanmisi-degistir");
    r = kapi(U.d, olay(401, "work/uygulanan"));
    ok("production'a uygulanmış içerik değişti → FAIL ('DEĞİŞTİRİLEMEZ')", r.kod === 1 && /DEĞİŞTİRİLEMEZ/.test(r.out));
    ok("uygulanmış numara yeniden bağlanamaz (defter RED)", (() => { try { bagla(U.d, U.r.surum, 401); return false; } catch (e) { return e.kod === "UYGULANMIS"; } })());
  }
  // ── Sembolik bağlantı migration (içerik git'te değil, dışarıdaki dosyayı gösterir) → RED.
  {
    const L = pr("work/sembolik", (d) => {
      const r = ayir(d, { modul: "test", ad: "sembolik_baglanti", dal: "work/sembolik", refs: ["origin/main"] });
      yaz(d, "disarida.sql", "BEGIN;\nSELECT 1;\nCOMMIT;\n");
      return { r };
    });
    const hedef = git(L.d, ["hash-object", "-w", "--stdin"], { input: "../../disarida.sql" }).out.trim();
    sh(L.d, "update-index", "--add", "--cacheinfo", `120000,${hedef},supabase/migrations/${L.r.dosya}`);
    sh(L.d, "commit", "-q", "-m", "sembolik baglanti");
    olayEkle(L.d, { olay: "bagla", surum: L.r.surum, pr: 601, dal: "work/sembolik", depo: DEPO, sha256: "a".repeat(64) });
    r = kapi(L.d, olay(601, "work/sembolik"));
    ok("sembolik bağlantı olarak eklenen migration → FAIL ('normal dosya değil')", r.kod === 1 && /normal dosya değil/.test(r.out));
  }
  // ── PR kendi yapilandirma.json'unda kipi kapatıyor: güvenilir yapılandırma base'den okunur → yine ZORUNLU.
  {
    yaz(K, "scripts/migrations/numara/yapilandirma.json", JSON.stringify({ ...DEFAULTS, zorunlu: true }));
    sh(K, "add", "-A"); sh(K, "commit", "-q", "-m", "zorunlu kip"); sh(K, "pull", "-q", "--rebase", "origin", "main"); sh(K, "push", "-q", "origin", "HEAD:main");
    const Z = pr("work/kip-kapat", (d) => { yaz(d, "scripts/migrations/numara/yapilandirma.json", JSON.stringify({ ...DEFAULTS, zorunlu: false })); yaz(d, "supabase/migrations/20300202000000_kipsiz.sql", sql); });
    const calis = (...ek) => spawnSync(process.execPath, [KAPI, "--base", "origin/main", ...ek], { cwd: Z.d, encoding: "utf8", env: { ...process.env, ...olay(701, "work/kip-kapat"), MIGRATION_NUMARA_ROOT: Z.d } });
    const korumasiz = calis(), korumali = calis("--yapilandirma-rev", "origin/main");
    ok("PR yapilandirma.json'da zorunlu:false yaptı → korumasız okumada UYARI (saldırı gösterimi), base'den okumada ZORUNLU FAIL", korumasiz.status === 0 && korumali.status === 1 && /kaynağı: origin\/main/.test(korumali.stdout));
  }
  // ── Defter erişimi / bütünlüğü
  {
    const G = pr("work/defter-yok", (d) => ({ r: yeniMigration(d, "work/defter-yok", "defter_yok") }));
    bagla(G.d, G.r.surum, 501);
    sh(G.d, "remote", "set-url", "origin", path.join(KOK, "yok.git"));
    r = kapi(G.d, olay(501, "work/defter-yok"));
    ok("defter erişilemiyor + migration → ZORUNLU FAIL (sessiz PASS yok)", r.kod === 1 && /doğrulanamadı/.test(r.out));
    r = spawnSync(process.execPath, [KAPI, "--base", "origin/main"], { cwd: G.d, encoding: "utf8", env: { ...process.env, ...olay(501, "work/defter-yok"), MIGRATION_NUMARA_ROOT: G.d, MIGRATION_NUMARA_OKUMA_DENEME: "2" } });
    yaz(G.d, "scripts/migrations/numara/yapilandirma.json", JSON.stringify({ ...DEFAULTS, zorunlu: true }));
    r = spawnSync(process.execPath, [KAPI, "--base", "origin/main"], { cwd: G.d, encoding: "utf8", env: { ...process.env, ...olay(501, "work/defter-yok"), MIGRATION_NUMARA_ROOT: G.d, MIGRATION_NUMARA_OKUMA_DENEME: "2" } });
    ok("yapilandirma.json \"zorunlu\": true (bayraksız) → ZORUNLU kip devrede, FAIL", r.status === 1 && /kip ZORUNLU/.test(r.stdout + r.stderr));
    fs.rmSync(path.join(G.d, "scripts"), { recursive: true, force: true });
    r = spawnSync(process.execPath, [KAPI, "--base", "origin/main"], { cwd: G.d, encoding: "utf8", env: { ...process.env, ...olay(501, "work/defter-yok"), MIGRATION_NUMARA_ROOT: G.d, MIGRATION_NUMARA_OKUMA_DENEME: "2" } });
    ok("aynı durum UYARI kipinde: çıkış 0 ama bulgu yazılır", r.status === 0 && /UYARI .*doğrulanamadı/.test(r.stdout + r.stderr));
    const H = pr("work/belge", (d) => yaz(d, "README.md", "yalnız belge\n"));
    sh(H.d, "remote", "set-url", "origin", path.join(KOK, "yok.git"));
    ok("migration içermeyen PR: defter + bağlam yokken bile PASS", kapi(H.d, {}).kod === 0);
    // Kurcalanmış defter: satır silen ileri-sarma commit.
    const t = path.join(KOK, "kurcala");
    spawnSync("git", ["clone", "--quiet", UZAK, t]);
    const { tip, text } = okuUzak(t);
    const blob = git(t, ["hash-object", "-w", "--stdin"], { input: text.split("\n").slice(2).join("\n") }).out.trim();
    const tree = git(t, ["mktree"], { input: `100644 blob ${blob}\t${DEFAULTS.file}\n` }).out.trim();
    git(t, ["push", "-q", "origin", `${git(t, ["-c", "user.name=k", "-c", "user.email=k@t", "commit-tree", tree, "-p", tip, "-m", "kurcala"]).out.trim()}:${DEFAULTS.ref}`]);
    r = kapi(A.d, olay(101, "work/kp-a"));
    ok("satır silinmiş (kurcalanmış) defter → meşru PR bile FAIL (defter güvenilmez)", r.kod === 1 && /satır silinmiş/.test(r.out));
  }
  // ── push (main) kipi: ayırmasız migration main'e girmişse yakalanır.
  {
    const M = path.join(KOK, "main-push");
    spawnSync("git", ["clone", "--quiet", path.join(KOK, "ana"), M]); // yerel kopya (kurcalanmamış defter ayrı uzakta değil) — yalnız ayrıştırma
    const temiz = path.join(KOK, "temiz.git");
    spawnSync("git", ["init", "--quiet", "--bare", "-b", "main", temiz]);
    const T = path.join(KOK, "temiz-k");
    spawnSync("git", ["clone", "--quiet", temiz, T]);
    sh(T, "config", "user.name", "t"); sh(T, "config", "user.email", "t@t");
    yaz(T, "supabase/migrations/20280128000000_astro_analysis_result_parts.sql", sql);
    sh(T, "add", "-A"); sh(T, "commit", "-q", "-m", "a"); sh(T, "push", "-q", "origin", "main");
    spawnSync(process.execPath, [CLI, "tohumla", "--prod-gecmis", path.join(KOK, "prod.txt")], { cwd: T });
    yaz(T, "supabase/migrations/20300101000000_kacak.sql", sql);
    sh(T, "add", "-A"); sh(T, "commit", "-q", "-m", "kacak"); sh(T, "push", "-q", "origin", "main");
    const p = spawnSync(process.execPath, [KAPI, "--zorunlu"], { cwd: T, encoding: "utf8", env: { ...process.env, GITHUB_EVENT_NAME: "push", MIGRATION_NUMARA_ROOT: T } });
    ok("main push kipi: ayırmasız main'e girmiş migration → FAIL", p.status === 1 && /kacak\.sql merkezi defterde yok/.test(p.stdout + p.stderr));
  }
  // ── Merge sonrası yeniden bağlama → RED (main'deki içerik donmuştur).
  {
    sh(A.d, "fetch", "-q", "origin"); sh(A.d, "merge", "-q", "--no-edit", "origin/main"); sh(A.d, "push", "-q", "origin", "HEAD:main");
    const b = spawnSync(process.execPath, [CLI, "bagla", "--surum", A.r.surum, "--pr", "101"], { cwd: A.d, encoding: "utf8" });
    ok("ana dala merge edilmiş migration yeniden bağlanamaz → [MAINDE]", b.status === 2 && /MAINDE/.test(b.stderr), b.stderr.trim().slice(0, 120));
  }
} catch (e) {
  fail++;
  console.log(`FAIL beklenmeyen hata: ${e.stack?.split("\n").slice(0, 4).join(" | ")}`);
} finally {
  fs.rmSync(KOK, { recursive: true, force: true });
}
console.log(`\nmigration-numara CI kapısı harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
