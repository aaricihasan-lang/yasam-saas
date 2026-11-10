#!/usr/bin/env node
/**
 * Akıllı CI F2 — paralel regresyon parçaları ve CI kapısı harness'ı (ağ / sır / veritabanı yok).
 *
 *   node scripts/ci/ci-paralel.harness.mjs
 *
 * Kanıtlananlar:
 *   1. Parça planı gerçek regression-tests.json üzerinde her n için her testi TAM BİR KEZ kapsar, deterministiktir ve dengelidir.
 *   2. CI kapısı: bütün zorunlu işler "success" + tam kapsam → PASS; failure / cancelled / skipped / eksik iş, eksik / tekrar /
 *      bilinmeyen / başarısız test, eksik / bozuk / filtreli / aynı makinede koşmuş parça → FAIL.
 *   3. ci.yml ↔ kapı tutarlılığı: kapı her zaman çalışır, needs = zorunlu işler = ci.yml'deki bütün işler, matris parça
 *      sayısı = koşucu ve kapı parça sayısı, parça sonuçları yüklenir.
 *   4. Uçtan uca: koşucu --parca k/3 --sonuc ile sahte liste üzerinde gerçekten koşar; üç parça listeyi tam bir kez kapsar,
 *      kapı CLI'ı PASS verir; bir iş failure olunca ve bir parça eksik olunca kapı CLI'ı FAIL verir; --parca + --only reddedilir.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZORUNLU_ISLER, kapiDegerlendir, parcaCoz, parcaPlani } from "./regression-shard.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let pass = 0;
let fail = 0;
const check = (ok, name, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// ── 1) Parça planı (gerçek liste + ölçülmüş süreler) ─────────────────────────────────────────────
const liste = JSON.parse(fs.readFileSync(path.join(HERE, "regression-tests.json"), "utf8")).tests.map((t) => t.file);
const sureler = JSON.parse(fs.readFileSync(path.join(HERE, "regression-durations.json"), "utf8")).sureler;
const w = (f) => sureler[f] ?? 2;
for (let n = 1; n <= 8; n++) {
  const plan = parcaPlani(liste, n, sureler);
  const hepsi = plan.flat();
  const tam = hepsi.length === liste.length && new Set(hepsi).size === liste.length && liste.every((f) => hepsi.includes(f));
  const yukler = plan.map((p) => p.reduce((a, f) => a + w(f), 0));
  const toplam = yukler.reduce((a, b) => a + b, 0);
  const enAgir = Math.max(...liste.map(w));
  const dengeli = Math.max(...yukler) <= toplam / n + enAgir + 1e-9;
  check(tam && plan.every((p) => p.length > 0) && dengeli, `plan n=${n}: her test tam bir kez, boş parça yok, dengeli`,
    `${plan.map((p) => p.length).join("+")}=${hepsi.length} test; yük ${yukler.map((y) => Math.round(y)).join("/")} sn`);
}
check(JSON.stringify(parcaPlani(liste, 3, sureler)) === JSON.stringify(parcaPlani([...liste].reverse(), 3, sureler).map((p) => [...p].sort((a, b) => liste.indexOf(a) - liste.indexOf(b)))),
  "plan deterministik (liste sırasından bağımsız aynı atama)");
const p3 = parcaPlani(liste, 3, sureler);
check(p3.every((p) => p.every((f, i) => i === 0 || liste.indexOf(p[i - 1]) < liste.indexOf(f))), "parça içinde özgün liste sırası korunur");
const yeniTest = "scripts/__yeni-olculmemis-test.ts";
check(parcaPlani([...liste, yeniTest], 3, sureler).flat().includes(yeniTest), "süresi ölçülmemiş yeni test de plana girer (atlanmaz)");
check(throws(() => parcaPlani(["a", "a", "b"], 2)), "listede tekrar eden test → plan hatası");
check(throws(() => parcaPlani(["a"], 2)) && throws(() => parcaPlani(["a"], 0)), "geçersiz parça sayısı → plan hatası");
check(throws(() => parcaCoz("0/3")) && throws(() => parcaCoz("4/3")) && throws(() => parcaCoz("x")) && parcaCoz("2/3").k === 2, "parça kimliği doğrulaması");

// ── 2) CI kapısı kararları ────────────────────────────────────────────────────────────────────────
const L = ["t/a.ts", "t/b.ts", "t/c.ts", "t/d.ts", "t/e.ts"];
const tamamNeeds = () => Object.fromEntries(ZORUNLU_ISLER.map((j) => [j, { result: "success" }]));
const sonuc = (k, files, ek = {}) => ({ ad: `parca-${k}.json`, veri: { parca: `${k}/3`, listeUzunlugu: L.length, filtre: null, makine: `runner-${k}`, tests: files.map((f) => ({ file: f, ok: true, neden: "1 PASS" })), ...ek } });
const tamamSonuc = () => [sonuc(1, ["t/a.ts", "t/d.ts"]), sonuc(2, ["t/b.ts", "t/e.ts"]), sonuc(3, ["t/c.ts"])];
const kapi = (degis = {}) => kapiDegerlendir({ needs: tamamNeeds(), liste: L, parcaSayisi: 3, sonuclar: tamamSonuc(), ...degis });
const kapali = (ad, r) => { const neden = r.kontroller.filter((x) => !x.ok).map((x) => x.ad).join("; "); check(!r.ok, `kapı FAIL: ${ad}`, neden); };

check(kapi().ok, "kapı PASS: bütün işler success + liste tam bir kez PASS");
for (const durum of ["failure", "cancelled", "skipped"]) for (const is of ["regresyon", "build", "astro-pro"]) {
  const needs = tamamNeeds(); needs[is] = { result: durum };
  kapali(`${is} = ${durum}`, kapi({ needs }));
}
{ const needs = tamamNeeds(); delete needs["horary-western"]; kapali("zorunlu iş kapıya bağlı değil (horary-western yok)", kapi({ needs })); }
kapali("needs okunamadı (null)", kapi({ needs: null }));
kapali("parça sonucu eksik (2/3 yok)", kapi({ sonuclar: tamamSonuc().filter((s) => s.ad !== "parca-2.json") }));
kapali("hiç parça sonucu yok", kapi({ sonuclar: [] }));
kapali("bozuk parça sonucu", kapi({ sonuclar: [...tamamSonuc().slice(0, 2), { ad: "parca-3.json", hata: "Unexpected token" }] }));
kapali("test eksik (c.ts hiçbir parçada)", kapi({ sonuclar: [sonuc(1, ["t/a.ts", "t/d.ts"]), sonuc(2, ["t/b.ts", "t/e.ts"]), sonuc(3, [])] }));
kapali("test iki kez koştu", kapi({ sonuclar: [sonuc(1, ["t/a.ts", "t/d.ts"]), sonuc(2, ["t/b.ts", "t/e.ts", "t/a.ts"]), sonuc(3, ["t/c.ts"])] }));
kapali("listede olmayan test", kapi({ sonuclar: [...tamamSonuc().slice(0, 2), sonuc(3, ["t/c.ts", "t/zz.ts"])] }));
{ const s = tamamSonuc(); s[1].veri.tests[0].ok = false; s[1].veri.tests[0].neden = "zaman aşımı"; kapali("bir test FAIL", kapi({ sonuclar: s })); }
kapali("aynı parça iki kez (3/3 yerine 2/3)", kapi({ sonuclar: [sonuc(1, ["t/a.ts", "t/d.ts"]), sonuc(2, ["t/b.ts", "t/e.ts"]), { ...sonuc(2, ["t/c.ts"]), ad: "parca-x.json" }] }));
kapali("--only filtresiyle koşmuş parça", kapi({ sonuclar: [...tamamSonuc().slice(0, 2), sonuc(3, ["t/c.ts"], { filtre: "/c/" })] }));
kapali("farklı liste uzunluğu görmüş parça", kapi({ sonuclar: [...tamamSonuc().slice(0, 2), sonuc(3, ["t/c.ts"], { listeUzunlugu: 4 })] }));
kapali("parça sayısı uyuşmuyor (kapı 4 bekliyor)", kapi({ parcaSayisi: 4 }));
kapali("iki parça aynı makinede koştu (yalıtım yok)", kapi({ sonuclar: [sonuc(1, ["t/a.ts", "t/d.ts"]), sonuc(2, ["t/b.ts", "t/e.ts"], { makine: "runner-1" }), sonuc(3, ["t/c.ts"])] }));

// ── 3) ci.yml ↔ kapı tutarlılığı ──────────────────────────────────────────────────────────────────
const yml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8").replace(/\r\n/g, "\n");
const isler = [...yml.slice(yml.indexOf("\njobs:\n")).matchAll(/^ {2}([a-z0-9-]+):\n/gm)].map((m) => m[1]);
const kapiBlok = yml.slice(yml.indexOf("\n  ci-kapisi:"));
const needsYml = (/needs: \[([^\]]+)\]/.exec(kapiBlok)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const es = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
check(isler.includes("ci-kapisi"), "ci.yml'de ci-kapisi işi var");
check(es(needsYml, ZORUNLU_ISLER), "kapı needs = zorunlu iş listesi", needsYml.join(", "));
check(es(isler.filter((j) => j !== "ci-kapisi"), ZORUNLU_ISLER), "ci.yml'deki her iş kapıya bağlı (unutulan iş yok)", isler.join(", "));
check(/^ {4}if: always\(\)$/m.test(kapiBlok), "kapı her koşulda çalışır (if: always())");
const regBlok = yml.slice(yml.indexOf("\n  regresyon:"), yml.indexOf("\n  ci-kapisi:"));
const matris = (/parca: \[([^\]]+)\]/.exec(regBlok)?.[1] ?? "").split(",").map((s) => Number(s.trim()));
const N = matris.length;
check(N >= 2 && matris.every((v, i) => v === i + 1), "regresyon matrisi 1..N", `N=${N}`);
check(/fail-fast: false/.test(regBlok), "matris fail-fast: false (her parça sonucunu bildirir)");
check(regBlok.includes(`--parca "\${{ matrix.parca }}/${N}"`) && regBlok.includes("--sonuc"), "koşucu matris parçasıyla ve sonuç dosyasıyla çağrılır");
check(kapiBlok.includes(`--parca-sayisi ${N}`), "kapı parça sayısı = matris", `N=${N}`);
check(/upload-artifact@v4[\s\S]*name: regresyon-sonuc-\$\{\{ matrix\.parca \}\}/.test(regBlok) && /if: always\(\)\n\s+uses: actions\/upload-artifact/.test(regBlok), "parça sonucu her koşulda yüklenir");
check(!/--only/.test(regBlok), "CI regresyonunda --only filtresi yok");
// Önceki `checks` işi tam geçmişle (fetch-depth: 0) çalışıyordu; origin/main kullanan testler ve DB-02 buna dayanır.
for (const j of ["regresyon", "guvenlik"]) {
  const b = yml.slice(yml.indexOf(`\n  ${j}:`) + 1).split(/\n {2}[a-z0-9-]+:\n/)[0];
  check(/uses: actions\/checkout@v4\n\s+with:\n\s+fetch-depth: 0/.test(b), `${j}: tam git geçmişi (fetch-depth: 0, önceki checks ile aynı)`);
}
for (const j of ["typescript", "build", "guvenlik", "regresyon", "astro-pro", "horary-western"]) {
  const b = yml.slice(yml.indexOf(`\n  ${j}:`) + 1).split(/\n {2}[a-z0-9-]+:\n/)[0];
  check(b.includes("uses: ./.github/actions/kurulum"), `${j}: ortak kurulum (ffmpeg önbellek + SHA-256 + npm ci)`);
}
const kurulum = fs.readFileSync(path.join(ROOT, ".github", "actions", "kurulum", "action.yml"), "utf8");
check(/ffmpeg-static-cache\.mjs prepare/.test(kurulum) && /ffmpeg-static-cache\.mjs install/.test(kurulum) && /FFMPEG_BIN/.test(kurulum) && /npm ci --no-audit --no-fund/.test(kurulum),
  "ortak kurulum PR #765 ffmpeg adımlarını içerir (prepare + FFMPEG_BIN + npm ci + install denetimi)");
const yerler = { "tsc --noEmit": "typescript", "next build": "build", "migration-naming-check.mjs": "guvenlik", "test:asama1\n": "guvenlik", "test:asama1:pg": "guvenlik", "test:backup": "guvenlik", "test:astrology:horary-western": "horary-western", "test:astrology:horary-pg": "horary-western", "test:astrology:horary-backup": "horary-western", "test:astrology:pro": "astro-pro" };
for (const [cmd, is] of Object.entries(yerler)) {
  const b = yml.slice(yml.indexOf(`\n  ${is}:`) + 1).split(/\n {2}[a-z0-9-]+:\n/)[0];
  check(b.includes(cmd), `önceki kontrol korunuyor: ${cmd.trim()} → ${is}`);
}

// ── 4) Uçtan uca: koşucu parçaları + kapı CLI'ı (sahte liste) ────────────────────────────────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-paralel-"));
const files = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"].map((n) => {
  const f = path.join(dir, `${n}.cjs`);
  fs.writeFileSync(f, `console.log("1 PASS / 0 FAIL");`);
  return f;
});
const listFile = path.join(dir, "liste.json");
fs.writeFileSync(listFile, JSON.stringify({ tests: files.map((file) => ({ file, timeoutSec: 30 })) }));
const sonucDir = path.join(dir, "sonuc");
const env = { ...process.env };
delete env.GITHUB_STEP_SUMMARY;
const kosucu = path.join(HERE, "run-regression.mjs");
for (let k = 1; k <= 3; k++) {
  const r = spawnSync(process.execPath, [kosucu, "--list", listFile, "--parca", `${k}/3`, "--sonuc", path.join(sonucDir, `parca-${k}.json`)], { cwd: ROOT, env: { ...env, RUNNER_NAME: `sahte-runner-${k}` }, encoding: "utf8", windowsHide: true });
  check(r.status === 0, `koşucu --parca ${k}/3 PASS`, (r.stdout.match(/Regresyon parça .*/) ?? [""])[0]);
}
const okunan = [1, 2, 3].map((k) => JSON.parse(fs.readFileSync(path.join(sonucDir, `parca-${k}.json`), "utf8")));
const kosan = okunan.flatMap((v) => v.tests.map((t) => t.file));
check(kosan.length === files.length && new Set(kosan).size === files.length, "üç parça sahte listeyi tam bir kez koştu", `${okunan.map((v) => v.tests.length).join("+")}=${kosan.length}`);
const gate = (needs, extra = {}) => spawnSync(process.execPath, [path.join(HERE, "ci-gate.mjs"), "--sonuc-dir", sonucDir, "--parca-sayisi", "3", "--list", listFile], { cwd: ROOT, env: { ...env, CI_KAPISI_NEEDS: JSON.stringify(needs), ...extra }, encoding: "utf8", windowsHide: true });
check(gate(tamamNeeds()).status === 0, "kapı CLI: tam başarı → çıkış 0");
{ const n = tamamNeeds(); n.guvenlik = { result: "failure" }; const r = gate(n); check(r.status === 1 && /FAIL zorunlu iş guvenlik — sonuç: failure/.test(r.stdout), "kapı CLI: guvenlik failure → çıkış 1"); }
{ const n = tamamNeeds(); n.regresyon = { result: "cancelled" }; check(gate(n).status === 1, "kapı CLI: regresyon cancelled → çıkış 1"); }
check(spawnSync(process.execPath, [path.join(HERE, "ci-gate.mjs"), "--sonuc-dir", sonucDir, "--parca-sayisi", "3", "--list", listFile], { cwd: ROOT, env: { ...env, CI_KAPISI_NEEDS: "" }, encoding: "utf8" }).status === 1, "kapı CLI: needs boş → çıkış 1");
fs.rmSync(path.join(sonucDir, "parca-2.json"));
check(gate(tamamNeeds()).status === 1, "kapı CLI: parça sonucu silinince → çıkış 1");
const birlikte = spawnSync(process.execPath, [kosucu, "--list", listFile, "--parca", "1/3", "--only", "p1"], { cwd: ROOT, env, encoding: "utf8", windowsHide: true });
check(birlikte.status === 1 && /birlikte kullanılamaz/.test(birlikte.stdout), "koşucu: --parca + --only reddedilir");
const gecersiz = spawnSync(process.execPath, [kosucu, "--list", listFile, "--parca", "4/3"], { cwd: ROOT, env, encoding: "utf8", windowsHide: true });
check(gecersiz.status === 1, "koşucu: geçersiz parça (4/3) reddedilir");
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* yok */ }

console.log(`\nci paralel harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
