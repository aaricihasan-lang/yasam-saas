// MERKEZİ MIGRATION NUMARASI — GERÇEK GIT eşzamanlılık testleri (mock YOK). Geçici bare depo + klonlar; ağ / GitHub / DB YOK.
// Her işçi AYRI node süreci (= ayrı oturum); hepsi aynı anda (engel zamanı) numara ister.
// Çalıştırma: node scripts/migrations/numara/test/git-eszamanlilik.harness.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ayir, ayristir, durum, ekle, gecmisiDogrula, git, okuUzak, olayEkle, DEFAULTS } from "../defter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "cli.mjs");
const ISCI = path.join(HERE, "isci.mjs");
const KOK = fs.mkdtempSync(path.join(os.tmpdir(), "mig-numara-git-"));
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); };
const sh = (cwd, ...a) => git(cwd, a);
const UZAK = path.join(KOK, "uzak.git");
spawnSync("git", ["init", "--quiet", "--bare", "-b", "main", UZAK]);
const klon = (ad) => {
  const d = path.join(KOK, ad);
  spawnSync("git", ["clone", "--quiet", UZAK, d]);
  sh(d, "config", "user.name", `test-${ad}`);
  sh(d, "config", "user.email", `${ad}@test`);
  return d;
};
// Ana dal: gerçek depodakine benzer geçmiş (aynı önekli eski dosyalar dahil).
const K0 = path.join(KOK, "kurulum");
spawnSync("git", ["init", "--quiet", "-b", "main", K0]);
sh(K0, "config", "user.name", "kurulum");
sh(K0, "config", "user.email", "k@test");
fs.mkdirSync(path.join(K0, "supabase", "migrations"), { recursive: true });
for (const f of ["20270101000000_a.sql", "20270101000000_b.sql", "20280126000000_member_access_restriction.sql", "20280127000000_member_access_message.sql", "20280128000000_astro_analysis_result_parts.sql"]) fs.writeFileSync(path.join(K0, "supabase", "migrations", f), `-- ${f}\nBEGIN;\nCOMMIT;\n`);
sh(K0, "add", "-A");
sh(K0, "commit", "-q", "-m", "ana");
sh(K0, "remote", "add", "origin", UZAK);
sh(K0, "push", "-q", "origin", "main");
const cli = (cwd, ...a) => spawnSync(process.execPath, [CLI, ...a], { cwd, encoding: "utf8" });
const defter = (cwd) => durum(ayristir(okuUzak(cwd).text));
const isciler = (liste) => {
  const basla = Date.now() + 2500;
  return Promise.all(liste.map(([d, modul, ad, dal]) => new Promise((res) => {
    const p = spawn(process.execPath, [ISCI, d, modul, ad, String(basla), dal ?? ""], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (b) => (out += b));
    p.on("close", () => { try { res(JSON.parse(out)); } catch { res({ ok: false, hata: out.slice(0, 200) }); } });
  })));
};

try {
  // ── 0) Tohum: uzak defter dalı yok → CLI 'tohumla' oluşturur; ikinci tohum değişiklik yapmaz.
  const t1 = cli(K0, "tohumla", "--prod-gecmis", writeProd(["20280126000000", "20280127000000", "20280128000000", "20280129000000"]));
  const st0 = defter(K0);
  ok("tohumla: main'deki tüm sürümler (aynı önekli eski dosyalar tek kayıtta) + production'a özgü sürüm 'gecmis' olarak işlendi", t1.status === 0 && st0.size === 5 && st0.get("20270101000000").dosyalar.length === 2 && st0.get("20280129000000").prod === true, (t1.stdout + t1.stderr).trim().split("\n").at(-1));
  ok("tohumla tekrar: yeni satır yok (idempotent)", /güncel/.test(cli(K0, "tohumla").stdout));

  // ── 1) Ham CAS kanıtı: aynı uçtan türetilmiş iki commit → ilki kabul, ikincisi SUNUCUDA reddedilir (force yok).
  {
    const a = klon("cas-a"), b = klon("cas-b");
    sh(a, "fetch", "-q", "origin", `+${DEFAULTS.ref}:refs/x`);
    sh(b, "fetch", "-q", "origin", `+${DEFAULTS.ref}:refs/x`);
    const yap = (d, metin) => {
      const tip = sh(d, "rev-parse", "refs/x").out.trim();
      const blob = git(d, ["hash-object", "-w", "--stdin"], { input: sh(d, "show", `${tip}:${DEFAULTS.file}`).out + metin }).out.trim();
      const tree = git(d, ["mktree"], { input: `100644 blob ${blob}\t${DEFAULTS.file}\n` }).out.trim();
      return git(d, ["commit-tree", tree, "-p", tip, "-m", metin]).out.trim();
    };
    const ca = yap(a, "a\n"), cb = yap(b, "b\n");
    const pa = git(a, ["push", "origin", `${ca}:${DEFAULTS.ref}`], { allowFail: true });
    const pb = git(b, ["push", "origin", `${cb}:${DEFAULTS.ref}`], { allowFail: true });
    ok("CAS: aynı ebeveynli ikinci commit sunucu tarafından REDDEDİLDİ (non-fast-forward); defter yalnız birincisini içerir", pa.ok && !pb.ok && /rejected|fetch first|non-fast-forward/i.test(pb.err), pb.err.trim().split("\n").at(-1));
    // Test satırını geri almak için ileri-sarma commit (geçmiş korunur, silme YOK değil → bu test dalını ayrı ref'e taşı):
  }
  // CAS testi defteri bozdu (ham 'a' satırı) → ayrı, temiz bir uzak defter ref'i ile devam (gerçek akışta ham yazım yapılmaz).
  const CFG = { ...DEFAULTS, ref: "refs/heads/migration-rezervasyon-test" };
  ekle(K0, (o) => (o.length ? null : [...st0.values()].map((x) => ({ v: 1, olay: "gecmis", surum: x.surum, dosyalar: x.dosyalar, prod: x.prod, zaman: new Date().toISOString() }))), { cfg: CFG });
  ok("bozuk (JSON olmayan) defter satırı okunurken açık hata verir; üzerine yazılmaz", (() => { try { defter(K0); return false; } catch (e) { return e.kod === "BOZUK"; } })());

  // İşçiler varsayılan ref'i kullanır → test için varsayılan ref'i temiz defter olarak YENİDEN kur (yeni uzak depo).
  const UZAK2 = path.join(KOK, "uzak2.git");
  spawnSync("git", ["clone", "--quiet", "--bare", "--single-branch", "-b", "main", UZAK, UZAK2]);
  sh(K0, "remote", "set-url", "origin", UZAK2);
  cli(K0, "tohumla", "--prod-gecmis", path.join(KOK, "prod.txt"));

  const klon2 = (ad) => {
    const d = path.join(KOK, ad);
    spawnSync("git", ["clone", "--quiet", UZAK2, d]);
    sh(d, "config", "user.name", `oturum-${ad}`);
    return d;
  };

  // ── 2) İki oturum aynı anda.
  const k = Array.from({ length: 60 }, (_, i) => klon2(`o${i}`));
  let r = await isciler([[k[0], "atlas", "kp_bir"], [k[1], "uye-yonetimi", "uye_bir"]]);
  ok("2 eşzamanlı oturum → iki farklı numara, ikisi de başarılı", r.every((x) => x.ok) && new Set(r.map((x) => x.surum)).size === 2, r.map((x) => `${x.surum}(d${x.deneme})`).join(" "));
  ok("numaralar main + production'daki en büyük sürümden (20280129000000) büyük ve geçerli ızgarada", r.every((x) => x.surum > "20280129000000" && /00$/.test(x.surum)));

  // ── 3) Beş bağımsız işlem.
  r = await isciler(k.slice(2, 7).map((d, i) => [d, "modul-" + i, `bes_${i}`]));
  ok("5 eşzamanlı işlem → 5 benzersiz numara", r.every((x) => x.ok) && new Set(r.map((x) => x.surum)).size === 5, `yeniden deneme toplamı ${r.reduce((a, x) => a + (x.deneme - 1), 0)}`);

  // ── 4) Onlarca talep: 40 ayrı klon + 10 süreç AYNI klonu paylaşır (aynı depo/ref alanı = aynı makinedeki iki worktree).
  const ortak = k[59];
  const liste = [...k.slice(7, 47).map((d, i) => [d, "toplu", `toplu_${i}`]), ...Array.from({ length: 10 }, (_, i) => [ortak, "ortak", `ortak_${i}`])];
  r = await isciler(liste);
  const basarili = r.filter((x) => x.ok);
  const st = defter(K0);
  const ayrilan = [...st.values()].filter((x) => !x.gecmis);
  ok(`50 eşzamanlı talep (40 ayrı klon + 10 aynı klon) → hepsi başarılı, hepsi benzersiz`, basarili.length === 50 && new Set(basarili.map((x) => x.surum)).size === 50, `başarısız ${r.length - basarili.length}: ${r.filter((x) => !x.ok).map((x) => x.kod + " " + (x.hata ?? "")).join(" | ").slice(0, 400)}; en uzun ${Math.max(...r.map((x) => x.ms ?? 0))} ms`);
  ok("rekabet gerçekten oluştu (en az bir CAS reddi + yeniden deneme) ve çözüldü", r.some((x) => x.deneme > 1), `en çok deneme ${Math.max(...basarili.map((x) => x.deneme))}`);
  ok("defterdeki ayırma sayısı = başarılı talep sayısı (2+5+50); hiçbir sürüm iki kez yok", ayrilan.length === 57 && new Set(ayrilan.map((x) => x.surum)).size === 57);
  const g = gecmisiDogrula(K0, (sh(K0, "fetch", "-q", "origin", `+${DEFAULTS.ref}:refs/dd`), "refs/dd"));
  ok("defter geçmişi: doğrusal, yalnız ekleme, her ara durum tutarlı", g.commit >= 58, `${g.commit} commit / ${g.olay} olay`);

  // ── 5) Aynı migration ikinci kez (aynı modül + ad + dal) → yeni numara VERİLMEZ (idempotent).
  const once = defter(K0).size;
  const tek = ayir(k[0], { modul: "atlas", ad: "kp_bir", dal: "work/kp_bir", refs: ["origin/main"] });
  ok("aynı migration ikinci kez → mevcut ayırma döner, defter büyümez", tek.mevcut === true && defter(K0).size === once, tek.surum);

  // ── 6) Eski dal üzerinden: klon hiç fetch etmemiş + yerel main geride → numara yine GÜNCEL defterden.
  const eski = klon2("eski");
  sh(K0, "fetch", "-q", "origin");
  const yeniMain = path.join(K0, "supabase", "migrations", "20290101000000_ileri.sql");
  sh(K0, "checkout", "-q", "main");
  sh(K0, "pull", "-q", "origin", "main");
  fs.writeFileSync(yeniMain, "BEGIN;\nCOMMIT;\n");
  sh(K0, "add", "-A");
  sh(K0, "commit", "-q", "-m", "ileri");
  sh(K0, "push", "-q", "origin", "main");
  const rEski = ayir(eski, { modul: "eski", ad: "eski_dal", dal: "work/eski", refs: [(git(eski, ["fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main"]), "origin/main")] });
  ok("eski dal: main'e sonradan giren 20290101000000 dahil, numara GÜNCEL en büyükten büyük", rEski.surum > "20290101000000", rEski.surum);

  // ── 7) İptal edilmiş numara yeniden istenemez; otomatik tahsis de geri vermez.
  const iptalEdilecek = rEski.surum;
  olayEkle(eski, { olay: "iptal", surum: iptalEdilecek, neden: "test" });
  let red = null;
  try { ayir(eski, { modul: "eski", ad: "baska_is", dal: "work/x", surum: iptalEdilecek, refs: ["origin/main"] }); } catch (e) { red = e.kod; }
  const sonra = ayir(eski, { modul: "eski", ad: "baska_is", dal: "work/x", refs: ["origin/main"] });
  ok("iptal edilmiş numara elle istenince RED (IPTAL); otomatik tahsis daha büyük yeni numara verir", red === "IPTAL" && sonra.surum > iptalEdilecek, `${red} / ${sonra.surum}`);
  let red2 = null;
  try { ayir(eski, { modul: "eski", ad: "elle", dal: "work/y", surum: "20280126000000", refs: ["origin/main"] }); } catch (e) { red2 = e.kod; }
  ok("başka işe / production'a ait numara elle istenince RED", red2 === "DOLU", red2);
  let red3 = null;
  try { olayEkle(eski, { olay: "uygula", surum: iptalEdilecek }); } catch (e) { red3 = e.kod; }
  ok("iptal edilmiş numaraya sonradan 'uygula' olayı eklenemez", red3 === "IPTAL", red3);

  // ── 8) Bağlantı kopması / ağ hatası: CLI 'yeni' numara alamazsa HİÇBİR dosya yazmaz.
  const ag = klon2("ag");
  const once8 = fs.readdirSync(path.join(ag, "supabase", "migrations")).length;
  const y = cli(ag, "yeni", "--modul", "ag", "--ad", "ag_testi", "--uzak", "yok-boyle-uzak");
  ok("ağ yok / uzak erişilemez → Türkçe hata, çıkış≠0, migration dosyası OLUŞMAZ", y.status !== 0 && /HATA \[AG\]|okunamadı/.test(y.stderr) && fs.readdirSync(path.join(ag, "supabase", "migrations")).length === once8, y.stderr.trim().split("\n").at(-1));

  // ── 9) Sunucu push'u reddediyor (pre-receive kancası her zaman RED) → CEKISME, dosya yok, defter değişmez.
  const UZAK3 = path.join(KOK, "uzak3.git");
  spawnSync("git", ["clone", "--quiet", "--bare", UZAK2, UZAK3]);
  fs.writeFileSync(path.join(UZAK3, "hooks", "pre-receive"), "#!/bin/sh\necho 'politika: reddedildi' >&2\nexit 1\n", { mode: 0o755 });
  const rd = klon2("red");
  sh(rd, "remote", "set-url", "origin", UZAK3);
  const once9 = fs.readdirSync(path.join(rd, "supabase", "migrations")).length;
  const defterOnce9 = okuUzak(rd).text;
  const yr = spawnSync(process.execPath, [CLI, "yeni", "--modul", "red", "--ad", "red_testi"], { cwd: rd, encoding: "utf8", env: { ...process.env, MIGRATION_NUMARA_DENEME: "3" } });
  ok("push sürekli reddedilirse: açık hata (CEKISME), dosya OLUŞMAZ, uzak defter değişmez", yr.status !== 0 && /CEKISME/.test(yr.stderr) && fs.readdirSync(path.join(rd, "supabase", "migrations")).length === once9 && okuUzak(rd).text === defterOnce9, yr.stderr.trim().split("\n").at(-1));

  // ── 10) Belirsiz sonuç (bağlantı push'tan SONRA koptu): aynı işlem kimliğiyle tekrar → çift kayıt YOK.
  const islem = "11111111-2222-4333-8444-555555555555";
  const uret = () => [{ v: 1, olay: "ayir", surum: "20991231000000", dosya: "20991231000000_belirsiz.sql", modul: "belirsiz", dal: "w", zaman: new Date().toISOString() }];
  const e1 = ekle(K0, uret, { islem });
  const e2 = ekle(K0, uret, { islem });
  ok("belirsiz sonuçtan sonra yeniden deneme: işlem kimliği defterde → başarı, ikinci satır YAZILMAZ", e1.tamam && e2.yeniden === true && [...defter(K0).values()].filter((x) => x.surum === "20991231000000").length === 1);

  // ── 11) Rezervasyon var, dosya yok → 'liste' işaretler (CI'yı engellemez; yalnız PR'daki dosyalar denetlenir).
  const ls = cli(k[1], "liste");
  ok("dosyası henüz olmayan ayırma 'liste'de işaretli", /\[dosya bu kopyada yok\]/.test(ls.stdout) && ls.status === 0);

  // ── 12) Defter kurcalama: bir satırı silen (ileri-sarma) commit → geçmiş doğrulaması RED.
  {
    const d = klon2("kurcala");
    const { tip, text } = okuUzak(d);
    const kirpik = text.split("\n").slice(1).join("\n");
    const blob = git(d, ["hash-object", "-w", "--stdin"], { input: kirpik }).out.trim();
    const tree = git(d, ["mktree"], { input: `100644 blob ${blob}\t${DEFAULTS.file}\n` }).out.trim();
    const c = git(d, ["commit-tree", tree, "-p", tip, "-m", "kurcala"]).out.trim();
    git(d, ["fetch", "-q", "origin", `+${DEFAULTS.ref}:refs/once`]);
    let kod = null;
    try { gecmisiDogrula(d, c); } catch (e) { kod = e.kod; }
    ok("satır silen commit geçmiş doğrulamasında yakalanır (SILME)", kod === "SILME", kod);
  }
  // ── 13) Aynı sürüm iki kez 'ayir' içeren defter → tutarsız (CIFT); bunun üzerine yazma yapılmaz.
  let kod13 = null;
  try { durum(ayristir(`{"olay":"ayir","surum":"20300101000000","dosya":"a.sql"}\n{"olay":"ayir","surum":"20300101000000","dosya":"b.sql"}\n`)); } catch (e) { kod13 = e.kod; }
  ok("aynı sürümün ikinci ayırması tutarsızlık olarak reddedilir (CIFT)", kod13 === "CIFT");
} catch (e) {
  fail++;
  console.log(`FAIL beklenmeyen hata: ${e.stack?.split("\n").slice(0, 4).join(" | ")}`);
} finally {
  fs.rmSync(KOK, { recursive: true, force: true });
}
console.log(`\nmigration-numara git-eşzamanlılık harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);

function writeProd(list) {
  const p = path.join(KOK, "prod.txt");
  fs.writeFileSync(p, list.join("\n") + "\n");
  return p;
}
