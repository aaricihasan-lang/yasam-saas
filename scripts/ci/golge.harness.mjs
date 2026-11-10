#!/usr/bin/env node
/**
 * Akıllı CI F3 — gölge mod doğrulama matrisi (ağ / sır / veritabanı yok; yalnız GEÇİCİ sentetik git deposu).
 *
 *   node scripts/ci/golge.harness.mjs
 *
 * Geçici dizinde gerçek kurallarla eşleşen küçük bir depo kurar ve GERÇEK git işlemleriyle (ekleme, silme, yeniden
 * adlandırma, modüller arası taşıma, çok commit'li PR, birleştirme commit'i, ilerleyen taban, push, manuel çalıştırma,
 * sığ klon, hatalı SHA, kötü niyetli dosya adı …) 50+ senaryoda gölge kararını doğrular. Ayrıca gölge raporunun bozuk /
 * tutarsız girdiyi sessizce geçmediğini ve yanlış negatif adayını işaretlediğini sınar. Proje deposuna DOKUNMAZ.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { golgeAnaliz } from "./golge-analiz.mjs";
import { golgeDogrula, karsilastir } from "./golge-rapor.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0;
let fail = 0;
const check = (ok, name, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const repo = fs.mkdtempSync(path.join(os.tmpdir(), "golge-repo-"));
const G = (args, cwd = repo) => execFileSync("git", ["-c", "user.name=golge", "-c", "user.email=golge@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const yaz = (p, s) => { const f = path.join(repo, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const sil = (p) => fs.rmSync(path.join(repo, p));
const tasi = (a, b) => { fs.mkdirSync(path.dirname(path.join(repo, b)), { recursive: true }); fs.renameSync(path.join(repo, a), path.join(repo, b)); };
const commit = (m) => { G(["add", "-A"]); G(["commit", "-q", "--allow-empty", "-m", m]); return G(["rev-parse", "HEAD"]); };

// ── Sentetik depo ──────────────────────────────────────────────────────────────────────────────
const T = {
  tas: "scripts/stone-library/a.harness.ts", bes: "scripts/beslenme-x/b.test.ts", yh: "scripts/yh-x/c.harness.ts",
  genis: "scripts/anamnez/w.harness.ts", dyn: "scripts/demo-x/dyn.harness.mjs", lit: "scripts/campaign/lit.test.ts",
  doc: "scripts/dy-doc/d.harness.ts", auth: "scripts/uye-x/u.harness.ts", rgx: "scripts/refleks-x/r.harness.ts", takma: "scripts/cupping-x/k.harness.ts",
};
const ortakTestleri = Array.from({ length: 21 }, (_, i) => `scripts/wt9/t${String(i).padStart(2, "0")}.harness.ts`);
const liste = [...Object.values(T), ...ortakTestleri];
yaz("package.json", JSON.stringify({ name: "sentetik", scripts: { "test:astrology:pro": "node scripts/astrology/pro-run-all.mjs", "test:astrology:horary-western": "tsx scripts/astrology/horaryWestern.harness.ts", "test:astrology:horary-pg": "node scripts/astrology/pg/horary-questions.mjs", "test:astrology:horary-backup": "node scripts/astrology/pg/horary-backup-restore.mjs" } }, null, 1));
yaz("tsconfig.json", "{}");
yaz("next.config.ts", "export default {};");
yaz(".github/workflows/ci.yml", "name: CI\n");
yaz("supabase/migrations/20270101000000_ilk.sql", "select 1;\n");
yaz("scripts/ci/regression-tests.json", JSON.stringify({ tests: liste.map((file) => ({ file })) }, null, 1));
yaz("scripts/ci/regression-durations.json", JSON.stringify({ sureler: Object.fromEntries(liste.map((f) => [f, 3])) }));
yaz("lib/auth/guard.ts", "export const guard = 1;\n");
yaz("lib/stone-library/core.ts", "export const core = 1;\n");
yaz("lib/stone-library/eski.ts", "export const eski = 1;\n");
yaz("lib/beslenme/calc.ts", "export const calc = 2;\n");
yaz("lib/yasam-hafizasi/m.ts", 'import { u } from "@/lib/ortak-yardim/u";\nexport const m = u;\n');
yaz("lib/ortak-yardim/u.ts", "export const u = 3;\n");
yaz("lib/urun-stok/ortak.ts", "export const ortak = 4;\n");
yaz("lib/human-design/x.ts", "export const hd = 1;\n");
yaz("lib/numeroloji/n.ts", "export const n = 1;\n");
yaz("lib/cosmic/k.ts", "export const k = 1;\n");
yaz("lib/astrology/pro/zaman.ts", "export const z = 1;\n");
yaz("lib/astrology/horary/h.ts", "export const h = 1;\n");
yaz("app/dogaltas/page.tsx", "export default function P() { return null; }\n");
yaz("app/_campaign/metin.json", '{"a":1}\n');
yaz("public/premium/dogaltas/taş.webp", "webp");
yaz("docs/a.md", "# belge\n");
yaz("docs/okuma.md", "# testin okuduğu belge\n");
yaz("README.md", "# depo\n");
yaz("tuhaf-kok-dosya.xyz", "?\n");
yaz(T.tas, 'import { core } from "@/lib/stone-library/core";\nimport { eski } from "@/lib/stone-library/eski";\nconsole.log(core, eski, "1 PASS / 0 FAIL");\n');
yaz(T.bes, 'import { calc } from "../../lib/beslenme/calc";\nconsole.log(calc);\n');
yaz(T.yh, 'import { m } from "@/lib/yasam-hafizasi/m";\nconsole.log(m);\n');
yaz(T.genis, 'import { readdirSync } from "node:fs";\nconsole.log(readdirSync("."));\n');
yaz(T.dyn, "const ad = process.argv[2];\nawait import(ad);\n");
yaz(T.lit, 'import fs from "node:fs";\nconsole.log(fs.readFileSync("app/_campaign/metin.json", "utf8"));\n');
yaz(T.doc, 'import fs from "node:fs";\nconsole.log(fs.readFileSync("docs/okuma.md", "utf8"));\n');
yaz(T.rgx, 'const kok = ["(", "lib/refleksoloji/)"].join("");\nconsole.log(kok);\n');
yaz(T.takma, 'import { createRequire } from "node:module";\nconst req = createRequire(import.meta.url);\nconst k = req("../../lib/cupping/k.ts");\nconsole.log(k);\n');
yaz("lib/cupping/k.ts", "export const k = 1;\n");
yaz("scripts/_shims/serverOnly.ts", "export {};\n");
yaz("lib/refleksoloji/r.ts", "export const r = 1;\n");
yaz(T.auth, 'import { guard } from "@/lib/auth/guard";\nconsole.log(guard);\n');
for (const t of ortakTestleri) yaz(t, 'import { ortak } from "@/lib/urun-stok/ortak";\nconsole.log(ortak);\n');
yaz("scripts/astrology/pro-zaman.harness.ts", 'import { z } from "@/lib/astrology/pro/zaman";\nconsole.log(z);\n');
yaz("scripts/astrology/pro-run-all.mjs", "// koşucu\n");
yaz("scripts/astrology/horaryWestern.harness.ts", 'import { h } from "@/lib/astrology/horary/h";\nconsole.log(h);\n');
G(["init", "-q", "-b", "main"]);
const MAIN0 = commit("taban");

/** Senaryo: main'den dal → değişiklik → commit → PR analizi (pr-base = main ucu, pr-head = dal ucu). */
function pr(ad, uygula, { base = "main" } = {}) {
  G(["checkout", "-q", "-B", `s-${ad}`, base]);
  uygula();
  const head = commit(ad);
  const b = G(["rev-parse", "main"]);
  const r = golgeAnaliz({ cwd: repo, olay: "pull_request", prBase: b, prHead: head, head });
  G(["checkout", "-q", "main"]);
  return r;
}
const sec = (r) => new Set(r.oneri.regresyonTestleri ?? []);
const FULL = (ad, r, sinif) => check(r.fullFallback && r.oneri.tumIsler && r.oneri.regresyonTestSayisi >= liste.length && r.oneri.regresyonTestleri.length === r.oneri.regresyonTestSayisi && (!sinif || r.sinif === sinif) && r.gerekceler.length > 0, `${ad} → FULL${sinif ? ` (${sinif})` : ""}`, r.gerekceler.slice(0, 2).join(" · "));
const DAR = (ad, r, sinif, icermeli = [], icermemeli = []) => {
  const s = sec(r);
  const ok = !r.fullFallback && r.sinif === sinif && icermeli.every((x) => s.has(x)) && icermemeli.every((x) => !s.has(x))
    && ["typescript", "build", "guvenlik", "ci-kapisi"].every((i) => r.oneri.isler.includes(i));
  check(ok, `${ad} → ${sinif} (${s.size} test önerisi)`, ok ? "" : `sinif=${r.sinif} full=${r.fullFallback} eksik=${icermeli.filter((x) => !s.has(x)).join(",")} fazla=${icermemeli.filter((x) => s.has(x)).join(",")} ${r.gerekceler.join(" · ")}`);
};

// ── A: ortak altyapı → FULL ───────────────────────────────────────────────────────────────────
FULL("ortak auth değişikliği", pr("auth", () => yaz("lib/auth/guard.ts", "export const guard = 2;\n")), "A");
FULL("migration ekleme", pr("mig", () => yaz("supabase/migrations/20270102000000_yeni.sql", "select 2;\n")), "A");
FULL("CI workflow değişikliği", pr("wf", () => yaz(".github/workflows/ci.yml", "name: CI2\n")), "A");
FULL("package.json", pr("pkg", () => yaz("package.json", JSON.stringify({ name: "x" }))), "A");
FULL("lockfile ekleme", pr("lock", () => yaz("package-lock.json", "{}")), "A");
FULL("tsconfig", pr("tsc", () => yaz("tsconfig.json", '{"x":1}')), "A");
FULL("next.config", pr("nextcfg", () => yaz("next.config.ts", "export default {a:1};")), "A");
FULL("regresyon listesine test ekleme (scripts/ci)", pr("liste", () => { const j = JSON.parse(fs.readFileSync(path.join(repo, "scripts/ci/regression-tests.json"), "utf8")); j.tests.push({ file: "scripts/yeni/t.ts" }); yaz("scripts/ci/regression-tests.json", JSON.stringify(j)); yaz("scripts/yeni/t.ts", "1"); }), "A");
FULL("ortak bağımlılık (21 testin kullandığı dosya, gerçek grafik)", pr("fanin", () => yaz("lib/urun-stok/ortak.ts", "export const ortak = 5;\n")), "A");
FULL("modül dosyası ortak altyapıya taşındı", pr("altyapiya", () => { tasi("lib/beslenme/calc.ts", "lib/auth/calc.ts"); yaz(T.bes, 'import { calc } from "../../lib/auth/calc";\nconsole.log(calc);\n'); }), "A");
{ const r = pr("karisik", () => { yaz("lib/stone-library/core.ts", "export const core = 9;\n"); yaz("lib/auth/guard.ts", "export const guard = 9;\n"); }); FULL("modül + ortak altyapı birlikte", r, "A"); }

// ── E: bilinmeyen / güvenilmez → FULL ─────────────────────────────────────────────────────────
FULL("bilinmeyen kök dosya", pr("bilinmeyen", () => yaz("tuhaf-yeni.xyz", "?")), "E");
FULL("bilinmeyen dizinde dosya", pr("bilinmeyen2", () => yaz("tools/betik.sh", "echo")), "E");
FULL("bilinmeyen dosya silme", pr("bilsil", () => sil("tuhaf-kok-dosya.xyz")), "E");
FULL("modülsüz public varlık", pr("public", () => yaz("public/diger/x.svg", "<svg/>")), "E");
{ const r = pr("bos", () => {}); FULL("boş fark (değişiklik yok)", r, "E"); }

// ── D: yalnız belge ───────────────────────────────────────────────────────────────────────────
{ const r = pr("belge", () => yaz("docs/a.md", "# değişti\n")); check(!r.fullFallback && r.sinif === "D" && r.oneri.regresyonTestSayisi === 0 && !r.oneri.isler.includes("regresyon") && ["typescript", "build", "guvenlik", "ci-kapisi"].every((i) => r.oneri.isler.includes(i)), "yalnız belge (docs/) → D, temel işler korunur", r.gerekceler.join(" · ")); }
{ const r = pr("readme", () => yaz("README.md", "# x\n")); check(r.sinif === "D" && !r.fullFallback, "yalnız kök README → D"); }
DAR("testin okuduğu belge → D DEĞİL", pr("okunan", () => yaz("docs/okuma.md", "# değişti\n")), "B", [T.doc]);
{ const r = pr("belge-kod", () => { yaz("docs/a.md", "# y\n"); yaz("lib/beslenme/calc.ts", "export const calc = 3;\n"); }); check(r.sinif !== "D", "belge + kod birlikte → D değil", r.sinif); }

// ── B / C: modül ──────────────────────────────────────────────────────────────────────────────
const GEN = [T.genis, T.dyn];
DAR("tek modül kaynak (taş) → kullanan test + geniş testler", pr("tas", () => yaz("lib/stone-library/core.ts", "export const core = 2;\n")), "B", [T.tas, ...GEN], [T.bes, T.yh, ...ortakTestleri]);
DAR("modül sayfası, doğrudan test yok → modül testleri", pr("sayfa", () => yaz("app/dogaltas/page.tsx", "export default function P() { return 1; }\n")), "B", [T.tas, ...GEN], [T.bes]);
DAR("beslenme kaynak → yalnız beslenme testi", pr("bes", () => yaz("lib/beslenme/calc.ts", "export const calc = 5;\n")), "B", [T.bes, ...GEN], [T.tas]);
DAR("çoklu modül (taş + beslenme) → birleşik", pr("coklu", () => { yaz("lib/stone-library/core.ts", "export const core = 3;\n"); yaz("lib/beslenme/calc.ts", "export const calc = 6;\n"); }), "C", [T.tas, T.bes, ...GEN], [T.yh]);
DAR("geçişli bağımlılık (modülsüz yardımcı → yh testi)", pr("gecisli", () => yaz("lib/ortak-yardim/u.ts", "export const u = 4;\n")), "B", [T.yh, ...GEN], [T.tas]);
DAR("test dosyasının kendisi değişti", pr("testdeg", () => yaz(T.bes, 'import { calc } from "../../lib/beslenme/calc";\nconsole.log(calc, 2);\n')), "B", [T.bes]);
DAR("literal yol bağımlılığı (app/_campaign/metin.json)", pr("literal", () => yaz("app/_campaign/metin.json", '{"a":2}\n')), "B", [T.lit]);
DAR("parantezle biten yol metni (\"lib/refleksoloji/)\") → önek eşleşir", pr("parantez", () => yaz("lib/refleksoloji/r.ts", "export const r = 2;\n")), "B", [T.rgx]);
DAR("takma adlı yükleyici (req(\"../../lib/cupping/k.ts\")) → bağımlılık", pr("takma", () => yaz("lib/cupping/k.ts", "export const k = 2;\n")), "B", [T.takma]);
FULL("test stub / shim (tsconfig paths hedefi) değişti", pr("shim", () => yaz("scripts/_shims/serverOnly.ts", "export const x = 1;\n")), "A");
DAR("modül varlığı (public/premium/dogaltas)", pr("varlik", () => yaz("public/premium/dogaltas/taş.webp", "webp2")), "B", [T.tas]);
DAR("modül dosyası ekleme", pr("ekle", () => yaz("lib/stone-library/yeni.ts", "export const y = 1;\n")), "B", [T.tas]);
DAR("modül dosyası silme (testin importu da kaldırıldı)", pr("silme", () => { sil("lib/stone-library/eski.ts"); yaz(T.tas, 'import { core } from "@/lib/stone-library/core";\nconsole.log(core);\n'); }), "B", [T.tas]);
{ const r = pr("rename", () => { tasi("lib/stone-library/core.ts", "lib/stone-library/cekirdek.ts"); yaz(T.tas, 'import { core } from "@/lib/stone-library/cekirdek";\nimport { eski } from "@/lib/stone-library/eski";\nconsole.log(core, eski);\n'); });
  DAR("modül içi yeniden adlandırma", r, "B", [T.tas]);
  check(r.tasinanlar.length === 1 && r.tasinanlar[0].eskiYol === "lib/stone-library/core.ts" && !r.tasinanlar[0].modullerArasi, "yeniden adlandırma kaydı (eski/yeni yol, aynı modül)", JSON.stringify(r.tasinanlar)); }
{ const r = pr("tasima", () => { tasi("lib/beslenme/calc.ts", "lib/stone-library/calc.ts"); yaz(T.bes, 'import { calc } from "../../lib/stone-library/calc";\nconsole.log(calc);\n'); });
  DAR("modüller arası taşıma → eski + yeni konum etkisi", r, "C", [T.bes, T.tas]);
  check(r.tasinanlar[0]?.modullerArasi === true && r.notlar.some((n) => /modüller arası/.test(n)), "modüller arası taşıma işaretlendi"); }
{ const r = pr("cokcommit", () => { yaz("lib/stone-library/core.ts", "export const core = 11;\n"); commit("ara 1"); yaz("lib/stone-library/core.ts", "export const core = 12;\n"); commit("ara 2"); yaz("app/dogaltas/page.tsx", "export default function P() { return 2; }\n"); });
  DAR("çok commit'li PR → toplam fark", r, "B", [T.tas]); check(r.degisiklikler.length === 2, "çok commit'li PR: 2 dosya (ara commit'ler birleşik)", String(r.degisiklikler.length)); }

// ── Korunan alanlar → KAPSAM BOŞLUĞU ──────────────────────────────────────────────────────────
for (const [ad, yol, mod] of [["Human Design", "lib/human-design/x.ts", "human-design"], ["Numeroloji", "lib/numeroloji/n.ts", "numeroloji"], ["Kozmik Takvim", "lib/cosmic/k.ts", "kozmik"]]) {
  const r = pr(`korunan-${mod}`, () => yaz(yol, "export const x = 9;\n"));
  check(!r.fullFallback && r.kapsamBosluklari.some((b) => b.modul === mod && /KAPSAM BOŞLUĞU/.test(b.aciklama)), `korunan modül (${ad}) → KAPSAM BOŞLUĞU raporlandı`, r.kapsamBosluklari.map((b) => b.modul).join(","));
}
{ const r = pr("atlas-pro", () => yaz("lib/astrology/pro/zaman.ts", "export const z = 2;\n"));
  check(r.oneri.isler.includes("astro-pro") && r.kapsamBosluklari.some((b) => b.modul === "atlas"), "atlas pro motoru → astro-pro önerilir + kapsam boşluğu", r.oneri.isler.join(",")); }
{ const r = pr("horary", () => yaz("lib/astrology/horary/h.ts", "export const h = 2;\n"));
  check(r.oneri.isler.includes("horary-western"), "horary motoru → horary-western önerilir", r.oneri.isler.join(",")); }
{ const r = pr("astro-yok", () => yaz("lib/beslenme/calc.ts", "export const calc = 7;\n"));
  check(!r.oneri.isler.includes("astro-pro") && !r.oneri.isler.includes("horary-western"), "astroloji dışı değişiklik → astro işleri önerilmez (yalnız gölge)"); }

// ── Git olayları ve taban doğruluğu ───────────────────────────────────────────────────────────
{ G(["checkout", "-q", "-B", "s-merge-src", "main"]); yaz("lib/stone-library/core.ts", "export const core = 21;\n"); const ph = commit("pr");
  G(["checkout", "-q", "-B", "s-merge-ref", "main"]); G(["merge", "-q", "--no-ff", "-m", "Merge pr into main", "s-merge-src"]); const mref = G(["rev-parse", "HEAD"]); G(["checkout", "-q", "main"]);
  const r = golgeAnaliz({ cwd: repo, olay: "pull_request", head: mref });
  DAR("PR birleştirme commit'i (CI merge ref) → ebeveynlerden taban/uç", r, "B", [T.tas]);
  check(r.sha.head === ph && r.sha.analiz === mref, "birleştirme: uç = PR ebeveyni, analiz = test edilen commit"); }
{ G(["checkout", "-q", "-B", "s-ilerleyen", "main"]); yaz("lib/stone-library/core.ts", "export const core = 31;\n"); const ph = commit("pr");
  G(["checkout", "-q", "-B", "s-ilerleyen-main", "main"]); yaz("lib/auth/guard.ts", "export const guard = 31;\n"); const yeniMain = commit("main ilerledi"); G(["checkout", "-q", "main"]);
  const r = golgeAnaliz({ cwd: repo, olay: "pull_request", prBase: yeniMain, prHead: ph, head: ph });
  DAR("taban ilerledi (main'e auth commit'i) → merge-base ile yalnız PR farkı", r, "B", [T.tas]);
  check(r.sha.mergeBase !== yeniMain && !r.degisiklikler.some((d) => d.yol === "lib/auth/guard.ts"), "main'deki değişiklik PR farkına karışmadı");
}
{ G(["checkout", "-q", "-B", "s-dep", "main"]); yaz("lib/beslenme/calc.ts", "export const calc = 41;\n"); const f2 = commit("F2 benzeri dal");
  yaz("lib/stone-library/core.ts", "export const core = 41;\n"); const f3 = commit("F3 benzeri bağımlı dal"); G(["checkout", "-q", "main"]);
  const r = golgeAnaliz({ cwd: repo, olay: "pull_request", prBase: f2, prHead: f3, head: f3 });
  DAR("bağımlı PR (hedef başka geliştirme dalı) → yalnız kendi farkı", r, "B", [T.tas], []); check(!r.degisiklikler.some((d) => d.yol === "lib/beslenme/calc.ts"), "bağımlı PR: hedef dalın değişikliği farka girmedi"); }
{ G(["checkout", "-q", "-B", "s-push", "main"]); const once = G(["rev-parse", "HEAD"]); yaz("lib/beslenme/calc.ts", "export const calc = 51;\n"); const sonra = commit("push");
  const r = golgeAnaliz({ cwd: repo, olay: "push", pushBefore: once, pushAfter: sonra, head: sonra }); G(["checkout", "-q", "main"]);
  DAR("main push (before..after)", r, "B", [T.bes]); }
{ const r = golgeAnaliz({ cwd: repo, olay: "push", pushBefore: "0".repeat(40), pushAfter: MAIN0, head: MAIN0 }); FULL("push before = 000… (yeni dal)", r, "E"); }
{ const r = golgeAnaliz({ cwd: repo, olay: "push", pushBefore: "deadbeef".repeat(5), pushAfter: MAIN0, head: MAIN0 }); FULL("push before depoda yok (force push / eksik geçmiş)", r, "E"); }
{ const r = golgeAnaliz({ cwd: repo, olay: "workflow_dispatch", head: MAIN0 }); FULL("manuel çalıştırma (workflow_dispatch)", r, "E"); }
{ const r = golgeAnaliz({ cwd: repo, olay: undefined, head: MAIN0 }); FULL("olay türü yok", r, "E"); }
{ const r = golgeAnaliz({ cwd: repo, olay: "pull_request", prBase: "1234567890abcdef1234567890abcdef12345678", prHead: MAIN0, head: MAIN0 }); FULL("hatalı PR base SHA", r, "E"); }
{ const r = golgeAnaliz({ cwd: repo, olay: "pull_request", prBase: "; touch HACK", prHead: MAIN0, head: MAIN0 }); FULL("SHA alanında komut metni → reddedildi", r, "E"); check(!fs.existsSync(path.join(repo, "HACK")), "SHA alanındaki komut çalışmadı"); }
{ G(["checkout", "-q", "-B", "s-sig", "main"]); yaz("lib/stone-library/core.ts", "export const core = 61;\n"); const ph = commit("sığ"); G(["checkout", "-q", "main"]);
  const klon = fs.mkdtempSync(path.join(os.tmpdir(), "golge-sig-"));
  execFileSync("git", ["clone", "-q", "--depth", "1", "--branch", "s-sig", `file://${repo.replace(/\\/g, "/")}`, klon], { stdio: "pipe" });
  const r = golgeAnaliz({ cwd: klon, olay: "pull_request", prBase: MAIN0, prHead: ph, head: ph });
  FULL("sığ klon / eksik git geçmişi", r, "E");
  fs.rmSync(klon, { recursive: true, force: true }); }

// ── Güvenlik: kötü niyetli dosya adları ───────────────────────────────────────────────────────
{ const adlar = ["app/dogaltas/$(touch PWNED1).tsx", "app/dogaltas/a;touch PWNED2;.tsx", "app/dogaltas/`touch PWNED3`.tsx", "app/dogaltas/x' && touch PWNED4 '.tsx"];
  const r = pr("kotu-ad", () => adlar.forEach((a) => yaz(a, "export {};\n")));
  const pw = fs.readdirSync(repo).filter((f) => /^PWNED/.test(f)).concat(fs.readdirSync(process.cwd()).filter((f) => /^PWNED/.test(f)));
  check(pw.length === 0, "kötü niyetli dosya adları komut çalıştırmadı", pw.join(","));
  check(adlar.every((a) => r.degisiklikler.some((d) => d.yol === a)) && r.sinif === "B", "kötü niyetli adlar doğru okunup sınıflandırıldı (dogaltas)", r.sinif);
  const { ozetMd } = await import("./golge-analiz.mjs");
  const o = ozetMd({ ...r, siniflandirilamayan: ["a|b`c<script>"] });
  check(!o.includes("<script>") && !o.includes("a|b"), "özet markdown'ı dosya adlarını kaçışlıyor"); }

// ── Belirlenimcilik, SHA tutarlılığı, hata yolu ───────────────────────────────────────────────
{ G(["checkout", "-q", "-B", "s-det", "main"]); yaz("lib/stone-library/core.ts", "export const core = 71;\n"); const ph = commit("det"); G(["checkout", "-q", "main"]);
  const a = golgeAnaliz({ cwd: repo, olay: "pull_request", prBase: MAIN0, prHead: ph, head: ph });
  const b = golgeAnaliz({ cwd: repo, olay: "pull_request", prBase: MAIN0, prHead: ph, head: ph });
  check(JSON.stringify(a) === JSON.stringify(b), "aynı git durumu → birebir aynı karar (belirlenimci)");
  check(a.sha.analiz === ph && a.sha.head === ph && a.sha.mergeBase === MAIN0, "analiz SHA'ları commit'lerle tutarlı"); }
{ const r = pr("bozuk-liste", () => yaz("scripts/ci/regression-tests.json", "{bozuk")); check(r.fullFallback && r.hata && r.oneri.tumIsler, "analiz hatası (okunamayan test listesi) → FULL + hata alanı", r.hata ?? ""); }
{ G(["checkout", "-q", "-B", "s-cli", "main"]); yaz("scripts/ci/regression-tests.json", "{bozuk"); const ph = commit("cli"); G(["checkout", "-q", "main"]);
  const out = path.join(repo, "..", `golge-cli-${process.pid}.json`);
  const c = spawnSync(process.execPath, [path.join(HERE, "golge-analiz.mjs"), "--cwd", repo, "--olay", "pull_request", "--pr-base", MAIN0, "--pr-head", ph, "--head", ph, "--cikti", out], { encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } });
  const j = JSON.parse(fs.readFileSync(out, "utf8")); fs.rmSync(out, { force: true });
  check(c.status === 1 && j.fullFallback && j.hata, "CLI: analiz hatası → çıkış 1 (görünür) + FULL JSON (sessiz başarı yok)"); }

// ── Gölge raporu (öneri ↔ gerçek) ─────────────────────────────────────────────────────────────
const okNeeds = Object.fromEntries(["typescript", "build", "guvenlik", "regresyon", "astro-pro", "horary-western"].map((i) => [i, { result: "success" }]));
const parca = (tests) => [{ tests: tests.map((file) => ({ file, ok: true })) }];
{ const g = golgeAnaliz({ cwd: repo, olay: "workflow_dispatch", head: MAIN0 });
  check(golgeDogrula(g, MAIN0).length === 0, "rapor: geçerli FULL gölge doğrulanır");
  check(golgeDogrula(g, "f".repeat(40)).some((h) => /SHA/.test(h)), "rapor: SHA tutarsızlığı yakalanır");
  check(golgeDogrula({ ...g, sema: "x" }).length > 0, "rapor: yanlış şema yakalanır");
  check(golgeDogrula({ ...g, gerekceler: [] }).length > 0, "rapor: gerekçesiz karar yakalanır");
  check(golgeDogrula(null).length > 0, "rapor: boş / bozuk JSON yakalanır");
  check(golgeDogrula({ ...g, fullFallback: false, hata: "x", oneri: { isler: [], regresyonTestleri: [] } }).length > 0, "rapor: hata varken daraltılmış öneri yakalanır");
  const k = karsilastir(g, okNeeds, parca(liste)); check(k.fark === 0 && k.yanlisNegatifAdayi.length === 0 && k.gercek.regresyonTestSayisi === liste.length, "rapor: FULL + tüm testler → fark 0"); }
{ G(["checkout", "-q", "-B", "s-yn", "main"]); yaz("lib/beslenme/calc.ts", "export const calc = 81;\n"); const ph = commit("yn"); G(["checkout", "-q", "main"]);
  const g = golgeAnaliz({ cwd: repo, olay: "pull_request", prBase: MAIN0, prHead: ph, head: ph });
  const p = [{ tests: liste.map((file) => ({ file, ok: file !== T.tas })) }];
  const k = karsilastir(g, { ...okNeeds, "astro-pro": { result: "failure" } }, p);
  check(k.yanlisNegatifAdayi.includes(T.tas), "rapor: önerilmeyen ama başarısız test → yanlış negatif adayı", k.yanlisNegatifAdayi.join(","));
  check(k.isYanlisNegatif.includes("astro-pro"), "rapor: önerilmeyen ama başarısız iş → yanlış negatif adayı");
  const k2 = karsilastir(g, okNeeds, parca([T.genis]));
  check(k2.onerilipCalismayan.includes(T.bes), "rapor: önerilip gerçekte koşmayan test işaretlenir");
  const cli = spawnSync(process.execPath, [path.join(HERE, "golge-rapor.mjs"), "--golge", path.join(repo, "yok.json"), "--sonuc-dir", repo, "--beklenen-sha", ph], { encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "", CI_KAPISI_NEEDS: JSON.stringify(okNeeds) } });
  check(cli.status === 1, "rapor CLI: gölge JSON yok → çıkış 1 (sessiz başarı yok)");
  const bozuk = path.join(repo, "..", `golge-bozuk-${process.pid}.json`); fs.writeFileSync(bozuk, "{bozuk");
  const cli2 = spawnSync(process.execPath, [path.join(HERE, "golge-rapor.mjs"), "--golge", bozuk, "--sonuc-dir", repo, "--beklenen-sha", ph], { encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "", CI_KAPISI_NEEDS: JSON.stringify(okNeeds) } });
  fs.rmSync(bozuk, { force: true });
  check(cli2.status === 1, "rapor CLI: bozuk gölge JSON → çıkış 1"); }

try { fs.rmSync(repo, { recursive: true, force: true }); } catch { /* Windows kilidi */ }
console.log(`\ngolge harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
