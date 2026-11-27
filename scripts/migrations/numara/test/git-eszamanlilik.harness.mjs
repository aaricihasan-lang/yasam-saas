// MERKEZİ MIGRATION NUMARASI — GERÇEK GIT eşzamanlılık / bütünlük testleri (mock YOK). Geçici bare depolar + klonlar +
// ayrı node süreçleri (= ayrı oturumlar, aynı engel zamanında). Ağ / GitHub / DB YOK.
// Çalıştırma: node scripts/migrations/numara/test/git-eszamanlilik.harness.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ayir, ayristir, durum, ekle, aralikDogrula, git, okuUzak, olayEkle, onbellekRef, DEFAULTS } from "../defter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "cli.mjs");
const ISCI = path.join(HERE, "isci.mjs");
const KOK = fs.mkdtempSync(path.join(os.tmpdir(), "mig-numara-git-"));
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); };
const sh = (cwd, ...a) => git(cwd, a);
const kod = (fn) => { try { fn(); return null; } catch (e) { return e.kod ?? String(e.message).slice(0, 60); } };
const cli = (cwd, args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
const PROD = path.join(KOK, "prod.txt");
fs.writeFileSync(PROD, ["20270101000000|a", "20280126000000|member_access_restriction", "20280127000000|member_access_message", "20280128000000|astro_analysis_result_parts", "20280129000000|sadece_prodda"].join("\n") + "\n");

// Ana depo: aynı önekli eski dosyalar dahil.
const yeniUzak = (ad) => {
  const u = path.join(KOK, `${ad}.git`);
  spawnSync("git", ["init", "--quiet", "--bare", "-b", "main", u]);
  const k = path.join(KOK, `${ad}-kurulum`);
  spawnSync("git", ["clone", "--quiet", u, k]);
  sh(k, "config", "user.name", "kurulum"); sh(k, "config", "user.email", "k@t");
  fs.mkdirSync(path.join(k, "supabase", "migrations"), { recursive: true });
  for (const f of ["20270101000000_a.sql", "20270101000000_b.sql", "20280126000000_member_access_restriction.sql", "20280127000000_member_access_message.sql", "20280128000000_astro_analysis_result_parts.sql"]) fs.writeFileSync(path.join(k, "supabase", "migrations", f), `-- ${f}\nBEGIN;\nCOMMIT;\n`);
  sh(k, "add", "-A"); sh(k, "commit", "-q", "-m", "ana"); sh(k, "push", "-q", "origin", "main");
  return { u, k };
};
const klonla = (uzak, ad) => {
  const d = path.join(KOK, ad);
  spawnSync("git", ["clone", "--quiet", uzak, d]);
  sh(d, "config", "user.name", `oturum-${ad}`); sh(d, "config", "user.email", `${ad}@t`);
  return d;
};
const defter = (cwd) => durum(ayristir(okuUzak(cwd).text));
const isciler = (liste) => {
  const basla = Date.now() + 2500;
  return Promise.all(liste.map((a) => new Promise((res) => {
    const p = spawn(process.execPath, [ISCI, ...a.slice(0, 4), String(basla), ...a.slice(4)], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (b) => (out += b));
    p.on("close", () => { try { res(JSON.parse(out)); } catch { res({ ok: false, hata: out.slice(0, 200) }); } });
  })));
};

try {
  const { u: U, k: K0 } = yeniUzak("ana");

  // ── Tohumsuz defterde tahsis YOK; tohum zorunlu ve raporlu.
  ok("tohumlanmamış defter: 'yeni' numara VERMEZ (TOHUMSUZ), dosya yazılmaz", /TOHUMSUZ/.test(cli(K0, ["yeni", "--modul", "xx", "--ad", "tohumsuz"]).stderr) && !fs.readdirSync(path.join(K0, "supabase", "migrations")).some((f) => f.includes("tohumsuz")));
  ok("tohumla: --prod-gecmis zorunlu", /prod-gecmis/.test(cli(K0, ["tohumla"]).stderr));
  const t1 = cli(K0, ["tohumla", "--prod-gecmis", PROD, "--rapor", path.join(KOK, "rapor.json")]);
  const rap = JSON.parse(fs.readFileSync(path.join(KOK, "rapor.json"), "utf8"));
  const st0 = defter(K0);
  ok("tohum: main'deki sürümler (aynı önekli iki dosya tek kayıtta, GİZLENMEDİ) + yalnız production'da olan sürüm; ilk yeni numara doğru", t1.status === 0 && st0.size === 5 && st0.get("20270101000000").dosyalar.length === 2 && st0.get("20280129000000").prod && rap.ayni_surum_birden_cok_dosya.length === 1 && rap.prodda_var_mainde_yok.includes("20280129000000|sadece_prodda") && rap.ilk_yeni_numara === "20280129000100", t1.stdout.trim().split("\n")[0]);
  ok("tohum tekrar: yeni satır yok", /güncel/.test(cli(K0, ["tohumla", "--prod-gecmis", PROD]).stdout));

  // ── (1) Ham CAS: aynı uçtan iki commit → ikincisi sunucuda RED (ayrı test uzak deposu).
  {
    const { u } = yeniUzak("cas");
    const a = klonla(u, "cas-a"), b = klonla(u, "cas-b");
    const tohum = (d) => { const blob = git(d, ["hash-object", "-w", "--stdin"], { input: "x\n" }).out.trim(); const tr = git(d, ["mktree"], { input: `100644 blob ${blob}\t${DEFAULTS.file}\n` }).out.trim(); return git(d, ["commit-tree", tr, "-m", "k"]).out.trim(); };
    const c0 = tohum(a); sh(a, "push", "-q", "origin", `${c0}:${DEFAULTS.ref}`);
    sh(b, "fetch", "-q", "origin", `+${DEFAULTS.ref}:refs/x`);
    const yap = (d, m) => { const blob = git(d, ["hash-object", "-w", "--stdin"], { input: `x\n${m}\n` }).out.trim(); const tr = git(d, ["mktree"], { input: `100644 blob ${blob}\t${DEFAULTS.file}\n` }).out.trim(); return git(d, ["commit-tree", tr, "-p", c0, "-m", m]).out.trim(); };
    const pa = git(a, ["push", "origin", `${yap(a, "a")}:${DEFAULTS.ref}`], { allowFail: true });
    const pb = git(b, ["push", "origin", `${yap(b, "b")}:${DEFAULTS.ref}`], { allowFail: true });
    ok("CAS: aynı ebeveynli ikinci commit SUNUCU tarafından reddedildi (force yok)", pa.ok && !pb.ok && /rejected|fetch first|non-fast-forward/i.test(pb.err));
  }

  // ── Eşzamanlı ayırmalar (ayrı klonlar = farklı bilgisayarlar; ortak klon = aynı çalışma klasörü)
  const k = Array.from({ length: 64 }, (_, i) => klonla(U, `o${i}`));
  let r = await isciler([[k[0], "ayir", "atlas", "kp_bir"], [k[1], "ayir", "uye-yonetimi", "uye_bir"]]);
  ok("(2a) iki oturum, farklı modüller, aynı anda → iki farklı numara", r.every((x) => x.ok) && new Set(r.map((x) => x.surum)).size === 2, r.map((x) => `${x.surum}(d${x.deneme})`).join(" "));
  ok("numaralar main + production'ın en büyüğünden (20280129000000) büyük, geçerli ızgara", r.every((x) => x.surum > "20280129000000" && /00$/.test(x.surum)));
  r = await isciler(k.slice(2, 7).map((d) => [d, "ayir", "ayni-modul", "ayni_is", "work/ayni"]));
  ok("(2b) AYNI modül + ad + dal, 5 oturum aynı anda → TEK numara, defterde TEK ayırma (idempotent)", r.every((x) => x.ok) && new Set(r.map((x) => x.surum)).size === 1 && [...defter(K0).values()].filter((x) => x.modul === "ayni-modul").length === 1, `${r.filter((x) => x.mevcut).length} oturum mevcut ayırmayı aldı`);
  const ortak = k[63];
  r = await isciler([...k.slice(7, 47).map((d, i) => [d, "ayir", "toplu", `toplu_${i}`]), ...Array.from({ length: 10 }, (_, i) => [ortak, "ayir", "ortak", `ortak_${i}`])]);
  const basarili = r.filter((x) => x.ok);
  ok("(3)(4)(5) 50 eşzamanlı talep (40 ayrı klon + 10 aynı klasör) → hepsi başarılı, hepsi benzersiz", basarili.length === 50 && new Set(basarili.map((x) => x.surum)).size === 50, `başarısız ${r.length - basarili.length}: ${r.filter((x) => !x.ok).map((x) => x.kod).join(",")}; en çok deneme ${Math.max(...basarili.map((x) => x.deneme))}`);
  ok("rekabet gerçekten oluştu ve çözüldü (yeniden deneme > 1)", basarili.some((x) => x.deneme > 1));
  const tumAyir = [...defter(K0).values()].filter((x) => !x.gecmis);
  ok("defterde 53 ayırma, hiçbir sürüm iki kez yok", tumAyir.length === 53 && new Set(tumAyir.map((x) => x.surum)).size === 53, String(tumAyir.length));
  sh(K0, "fetch", "-q", "origin", `+${DEFAULTS.ref}:refs/dd`);
  const g = aralikDogrula(K0, null, "refs/dd");
  ok("defter geçmişi: doğrusal, yalnız ekleme, her ara durum geçerli", g.commit >= 54, `${g.commit} commit / ${g.olay} olay`);

  // ── (6) Push SUNUCUDA kabul edildi ama istemci hata gördü (bağlantı koptu) → işlem kimliğiyle çözüm, çift kayıt YOK.
  {
    const d = klonla(U, "kopma");
    const once = [...defter(d).values()].length;
    const out = spawnSync(process.execPath, ["-e", `import("file:///${path.resolve(HERE, "..", "defter.mjs").replace(/\\/g, "/")}").then(({ayir})=>{const r=ayir(${JSON.stringify(d)},{modul:"kopma",ad:"kopma_testi",dal:"work/kopma",refs:["origin/main"]});process.stdout.write(JSON.stringify(r))})`], { encoding: "utf8", env: { ...process.env, MIGRATION_NUMARA_TEST_KOPMA: "1" } });
    const rr = JSON.parse(out.stdout || "{}");
    const satir = [...defter(d).values()].filter((x) => x.modul === "kopma");
    ok("(6) push kabul + bağlantı koptu → ikinci tur işlem kimliğini defterde bulur; TEK satır, aynı numara", rr.surum && satir.length === 1 && satir[0].surum === rr.surum && [...defter(d).values()].length === once + 1, `${rr.surum} deneme ${rr.deneme}`);
  }
  // ── (7) Sunucu geçici hata (pre-receive ilk 3 push'u reddeder) → sonra başarı.
  {
    const { u } = yeniUzak("gecici");
    const d = klonla(u, "gecici-k"); cli(d, ["tohumla", "--prod-gecmis", PROD]);
    const sayac = path.join(KOK, "sayac.txt"); fs.writeFileSync(sayac, "0");
    fs.writeFileSync(path.join(u, "hooks", "pre-receive"), `#!/bin/sh\nn=$(cat "${sayac.replace(/\\/g, "/")}")\nn=$((n+1))\necho $n > "${sayac.replace(/\\/g, "/")}"\nif [ $n -le 3 ]; then echo 'gecici hata' >&2; exit 1; fi\nexit 0\n`, { mode: 0o755 });
    const y = cli(d, ["yeni", "--modul", "gecici", "--ad", "gecici_hata"]);
    ok("(7) sunucu 3 kez geçici hata → 4. denemede ayrıldı, dosya oluştu", y.status === 0 && /AYRILDI/.test(y.stdout) && fs.existsSync(path.join(d, "supabase", "migrations", (/→ (\S+\.sql)/.exec(y.stdout) ?? [])[1] ?? "yok")), y.stdout.trim().split("\n")[0]);
  }
  // ── (8) Sunucuya hiç bağlanılamıyor → hata, dosya yok.
  {
    const d = klonla(U, "ag");
    const once = fs.readdirSync(path.join(d, "supabase", "migrations")).length;
    const y = cli(d, ["yeni", "--modul", "ag", "--ad", "ag_testi", "--uzak", "yok-boyle-uzak"], { MIGRATION_NUMARA_OKUMA_DENEME: "2" });
    ok("(8) uzak erişilemez → Türkçe hata [AG], migration dosyası OLUŞMAZ", y.status !== 0 && /HATA \[AG\]/.test(y.stderr) && fs.readdirSync(path.join(d, "supabase", "migrations")).length === once);
  }
  // ── (9) Push sürekli reddediliyor → CEKISME, dosya yok, defter değişmez.
  {
    const u3 = path.join(KOK, "red.git");
    spawnSync("git", ["clone", "--quiet", "--bare", U, u3]);
    fs.writeFileSync(path.join(u3, "hooks", "pre-receive"), "#!/bin/sh\necho 'politika: reddedildi' >&2\nexit 1\n", { mode: 0o755 });
    const d = klonla(u3, "red-k");
    const once = okuUzak(d).text;
    const y = cli(d, ["yeni", "--modul", "red", "--ad", "red_testi"], { MIGRATION_NUMARA_DENEME: "3" });
    ok("(9) push sürekli RED → [CEKISME], dosya OLUŞMAZ, defter değişmez", y.status !== 0 && /CEKISME/.test(y.stderr) && !fs.readdirSync(path.join(d, "supabase", "migrations")).some((f) => f.includes("red_testi")) && okuUzak(d).text === once);
  }
  // ── (10)(11) Yarıda kesilme + yeniden başlatma / aynı işlemin tekrarı → aynı numara, dosya bir kez.
  {
    const d = klonla(U, "yarida");
    sh(d, "checkout", "-q", "-b", "work/yarida");
    const a1 = ayir(d, { modul: "yarida", ad: "yarida_kalan", dal: "work/yarida", refs: ["origin/main"] }); // dosya yazılmadan "kesildi"
    const y = cli(d, ["yeni", "--modul", "yarida", "--ad", "yarida_kalan"]);
    const y2 = cli(d, ["yeni", "--modul", "yarida", "--ad", "yarida_kalan"]);
    ok("(10)(11) ayırma sonrası kesinti → 'yeni' aynı numarayı döndürür ve dosyayı oluşturur; tekrar → değişiklik yok", /MEVCUT AYIRMA/.test(y.stdout) && y.stdout.includes(a1.surum) && /OLUŞTURULDU/.test(y.stdout) && /zaten var/.test(y2.stdout) && [...defter(d).values()].filter((x) => x.modul === "yarida").length === 1);
  }
  // ── (13) Eski dal: main'e sonradan giren migration da hesaba katılır.
  {
    const eski = klonla(U, "eski");
    const z = klonla(U, "ileri");
    fs.writeFileSync(path.join(z, "supabase", "migrations", "20290101000000_ileri.sql"), "BEGIN;\nCOMMIT;\n");
    sh(z, "add", "-A"); sh(z, "commit", "-q", "-m", "ileri"); sh(z, "push", "-q", "origin", "main");
    sh(eski, "fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main");
    const re = ayir(eski, { modul: "eski", ad: "eski_dal", dal: "work/eski", refs: ["origin/main"] });
    ok("(13) eski dal → numara GÜNCEL main'den (20290101000000) büyük", re.surum > "20290101000000", re.surum);
  }
  // ── (19) Aynı anda numara alma + iptal.
  {
    const hedef = tumAyir[0].surum;
    r = await isciler([[k[47], "iptal", hedef, "eşzamanlı iptal testi"], ...k.slice(48, 53).map((d, i) => [d, "ayir", "iptal-yarisi", `yaris_${i}`])]);
    const st = defter(K0);
    ok("(19) iptal + 5 ayırma aynı anda → iptal kalıcı, iptal edilen numara hiçbir yeni ayırmaya verilmedi", r.every((x) => x.ok) && st.get(hedef).durum === "iptal" && !r.filter((x) => x.surum).some((x) => x.surum === hedef));
    ok("iptal edilmiş numara elle istenince RED (IPTAL)", kod(() => ayir(k[0], { modul: "xx", ad: "elle_iptal", dal: "w", surum: hedef, refs: ["origin/main"] })) === "IPTAL");
  }
  // ── (20) Aynı anda numara alma + production geçmişi ilerliyor (prod listesi işçiye ek sürüm olarak verilir).
  {
    r = await isciler([[k[53], "ayir", "prod-ilerledi", "p_bir", "w1", "20300101000000"], [k[54], "ayir", "prod-ilerledi", "p_iki", "w2"]]);
    const p1 = r[0], p2 = r[1];
    ok("(20) production ileri sürüm görünen oturum numarayı onun da ötesinden alır; diğeriyle çakışma yok", p1.ok && p2.ok && p1.surum > "20300101000000" && p1.surum !== p2.surum, `${p1.surum} / ${p2.surum}`);
  }
  // ── (15)(16) Yanlış SHA / PR / sahiplik → durum makinesi RED.
  {
    const d = klonla(U, "bagla");
    const a = ayir(d, { modul: "bagla", ad: "bagla_testi", dal: "work/bagla", refs: ["origin/main"] });
    ok("(15) biçimsiz SHA-256 ile bağlama → RED (GECIS)", kod(() => olayEkle(d, { olay: "bagla", surum: a.surum, pr: 5, dal: "work/bagla", depo: "o/r", sha256: "abc" })) === "GECIS");
    ok("(16) geçersiz PR numarası ile bağlama → RED", kod(() => olayEkle(d, { olay: "bagla", surum: a.surum, pr: -1, dal: "work/bagla", depo: "o/r", sha256: "a".repeat(64) })) === "GECIS");
    olayEkle(d, { olay: "bagla", surum: a.surum, pr: 5, dal: "work/bagla", depo: "o/r", sha256: "a".repeat(64) });
    ok("aynı PR yeniden bağlama (SQL değişti) → kabul", kod(() => olayEkle(d, { olay: "bagla", surum: a.surum, pr: 5, dal: "work/bagla", depo: "o/r", sha256: "b".repeat(64) })) === null);
    ok("başka PR / dal sahiplenmesi (devirsiz) → RED", kod(() => olayEkle(d, { olay: "bagla", surum: a.surum, pr: 9, dal: "work/baska", depo: "o/r", sha256: "b".repeat(64) })) === "GECIS");
    ok("açık devir (devir + neden) → kabul ve geçmişte görünür", kod(() => olayEkle(d, { olay: "bagla", surum: a.surum, pr: 9, dal: "work/baska", depo: "o/r", sha256: "b".repeat(64), devir: true, neden: "PR #5 kapatıldı, iş #9'a taşındı" })) === null && defter(d).get(a.surum).pr === 9);
    ok("bağlanmadan / farklı içerikle 'uygula' → RED", kod(() => olayEkle(d, { olay: "uygula", surum: a.surum, sha256: "c".repeat(64), proje: "p" })) === "GECIS");
    olayEkle(d, { olay: "uygula", surum: a.surum, sha256: "b".repeat(64), proje: "p" });
    ok("uygulanmış numaraya yeni olay (bağla / iptal) → RED; numara yeniden tahsis edilemez", kod(() => olayEkle(d, { olay: "iptal", surum: a.surum, neden: "deneme" })) === "UYGULANMIS" && kod(() => ayir(d, { modul: "xx", ad: "uyg", dal: "w", surum: a.surum, refs: ["origin/main"] })) === "DOLU");
  }
  // ── (17)(18) Dosyasız ayırma 'liste'de işaretli; ayırmasız dosya CI kapısında (ci-kapi harness).
  ok("(17) dosyası henüz olmayan ayırma 'liste'de işaretli", /\[dosya bu kopyada yok\]/.test(cli(k[1], ["liste"]).stdout));
  // ── Belirsiz sonuç: aynı işlem kimliğiyle tekrar → çift kayıt yok.
  {
    const islem = "11111111-2222-4333-8444-555555555555";
    const uret = () => [{ v: 2, olay: "ayir", surum: "20991231000000", dosya: "20991231000000_belirsiz.sql", modul: "belirsiz", dal: "w", zaman: "t" }];
    ekle(K0, uret, { islem });
    const e2 = ekle(K0, uret, { islem });
    ok("aynı işlem kimliğiyle ikinci gönderim → 'yeniden' başarı, ikinci satır YOK", e2.yeniden === true && [...defter(K0).values()].filter((x) => x.surum === "20991231000000").length === 1);
  }
  // ── (14) Defter dalının silinmesi / geçmişin yeniden yazılması → yeni tahsis DURUR.
  {
    const d = klonla(U, "koruma");
    ayir(d, { modul: "koruma", ad: "koruma_once", dal: "w", refs: ["origin/main"] }); // bu makine ucu doğruladı
    const { tip, text } = okuUzak(d);
    // (a) yeniden yazma: son satırı silip FORCE push (yerel test deposu; gerçek GitHub'da kural seti bunu engeller)
    const kirp = text.split("\n").filter(Boolean).slice(0, -1).join("\n") + "\n";
    const blob = git(d, ["hash-object", "-w", "--stdin"], { input: kirp }).out.trim();
    const tr = git(d, ["mktree"], { input: `100644 blob ${blob}\t${DEFAULTS.file}\n` }).out.trim();
    const ebeveyn = git(d, ["rev-parse", `${tip}^`]).out.trim();
    const yeniden = git(d, ["commit-tree", tr, "-p", ebeveyn, "-m", "kurcala"]).out.trim();
    sh(d, "push", "-q", "--force", "origin", `${yeniden}:${DEFAULTS.ref}`);
    ok("(14a) geçmiş force ile yeniden yazıldı → bu makinede tahsis DURUR (YENIDEN_YAZILDI)", kod(() => ayir(d, { modul: "koruma", ad: "koruma_sonra", dal: "w", refs: ["origin/main"] })) === "YENIDEN_YAZILDI");
    ok("ilk kez gören makine, satır silen commit'i aralık doğrulamasında yakalar? (ileri-sarmalı silme)", (() => { const t2 = klonla(U, "koruma2"); const { tip: tp } = okuUzak(t2); const bl = git(t2, ["hash-object", "-w", "--stdin"], { input: okuUzak(t2).text.split("\n").slice(1).join("\n") }).out.trim(); const trr = git(t2, ["mktree"], { input: `100644 blob ${bl}\t${DEFAULTS.file}\n` }).out.trim(); const c = git(t2, ["commit-tree", trr, "-p", tp, "-m", "sil"]).out.trim(); sh(t2, "push", "-q", "origin", `${c}:${DEFAULTS.ref}`); return kod(() => ayir(klonla(U, "koruma3"), { modul: "xx", ad: "silme_sonrasi", dal: "w", refs: ["origin/main"] })) === "SILME"; })());
    // (b) dal silindi
    sh(d, "push", "-q", "origin", `:${DEFAULTS.ref}`);
    git(d, ["update-ref", onbellekRef(DEFAULTS), tip]);
    ok("(14b) defter dalı silindi → bu makinede tahsis DURUR (DEFTER_SILINDI), boş defterle yeniden başlamaz", kod(() => ayir(d, { modul: "koruma", ad: "koruma_silindi", dal: "w", refs: ["origin/main"] })) === "DEFTER_SILINDI");
    ok("(14c) dal silindi + ilk kez gören makine → TOHUMSUZ (yeni numara verilmez)", kod(() => ayir(klonla(U, "koruma4"), { modul: "xx", ad: "ilk_kez", dal: "w", refs: ["origin/main"] })) === "TOHUMSUZ");
  }
  // ── (14d) Çapa: depoda (main'de) sabitlenmiş güvenilir defter commit'i yeni uçta yoksa → CAPA (ilk kez gören makine de durur).
  {
    const { u } = yeniUzak("capa");
    const d = klonla(u, "capa-k");
    cli(d, ["tohumla", "--prod-gecmis", PROD]);
    const capa = okuUzak(d).tip;
    ok("(14d) çapa uçta var → tahsis normal", kod(() => ayir(klonla(u, "capa-k2"), { modul: "capa", ad: "capa_var", dal: "w", refs: ["origin/main"], capa })) === null);
    const yabanci = git(d, ["rev-parse", "origin/main"]).out.trim(); // defter geçmişinde olmayan bir commit
    ok("(14d) çapa yeni uçta YOK (geçmiş başka kökten yeniden kurulmuş) → ilk kez gören makinede bile CAPA", kod(() => ayir(klonla(u, "capa-k3"), { modul: "capa", ad: "capa_yok", dal: "w", refs: ["origin/main"], capa: yabanci })) === "CAPA");
  }
  // ── Kurcalanmış durum: aynı sürüm iki 'ayir' / iptal sonrası olay → tutarsız (geçmiş doğrulamasında yakalanır).
  ok("aynı sürümün ikinci 'ayir'ı → CIFT", kod(() => durum(ayristir(`{"olay":"ayir","surum":"20300101000000","dosya":"20300101000000_a.sql","modul":"mm"}\n{"olay":"ayir","surum":"20300101000000","dosya":"20300101000000_b.sql","modul":"mm"}\n`))) === "CIFT");
  ok("iptal sonrası 'bagla' → IPTAL_SONRASI", kod(() => durum(ayristir(`{"olay":"ayir","surum":"20300101000000","dosya":"20300101000000_a.sql","modul":"mm"}\n{"olay":"iptal","surum":"20300101000000","neden":"yok"}\n{"olay":"bagla","surum":"20300101000000","dosya":"20300101000000_a.sql","pr":1,"dal":"d","depo":"o/r","sha256":"${"a".repeat(64)}"}\n`))) === "IPTAL_SONRASI");
  ok("dosya adı sürümle uyuşmayan 'ayir' → GECIS", kod(() => durum(ayristir(`{"olay":"ayir","surum":"20300101000000","dosya":"20300101000100_a.sql","modul":"mm"}\n`))) === "GECIS");
} catch (e) {
  fail++;
  console.log(`FAIL beklenmeyen hata: ${e.stack?.split("\n").slice(0, 4).join(" | ")}`);
} finally {
  fs.rmSync(KOK, { recursive: true, force: true });
}
console.log(`\nmigration-numara git-eşzamanlılık harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
