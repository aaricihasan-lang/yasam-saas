#!/usr/bin/env node
/**
 * Regresyon koşucusu (scripts/ci/run-regression.mjs) — zaman aşımı ve alt süreç temizliği harness'ı.
 *
 *   node scripts/ci/run-regression-timeout.harness.mjs [--runner <run-regression.mjs yolu>]
 *
 * Geçici dizinde ZARARSIZ sahte testler (yalnız node; ağ / sır / veritabanı yok) üretir ve koşucuyu
 * `--list` ile onlar üzerinde çalıştırır. Kanıtlananlar:
 *   1. Normal PASS testi PASS kalır; FAIL testi FAIL kalır ve yeniden denenmez (davranış değişmedi).
 *   2. Takılan test + çıktı kanalını tutan alt / torun süreçler (npx → tsx → node zinciri benzeri; POSIX'te kendi
 *      süreç grubunu kuran torun dahil): zaman aşımı → FAIL "zaman aşımı", bir kez yeniden denenir, koşucu sınırlı
 *      sürede biter ve ağacın TÜM süreçleri ölür (2026-11-09 PR #765 checks: f6 takıldı, kill yalnız npx'e gitti,
 *      "close" hiç gelmedi → iş 30 dk sınırında iptal).
 *   3. Çıkışta geride alt süreç bırakan test: koşucu beklemede kalmaz, sonuç testin kendi çıkışıyla verilir,
 *      kalan süreçler temizlenir (POSIX; Windows'ta bilgi olarak raporlanır).
 * --runner verilirse aynı senaryolar başka bir koşucu sürümüne uygulanır (ör. önceki sürümle önce/sonra kanıtı);
 * bu durumda koşucu en fazla DIS_SINIR_SN saniye bekletilir, sonra harness onu ve sahte süreçleri öldürür.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const RUNNER = arg("--runner") ? path.resolve(arg("--runner")) : path.join(HERE, "run-regression.mjs");
const IS_WIN = process.platform === "win32";
const TIMEOUT_SN = 3;
const DIS_SINIR_SN = 60;

let pass = 0;
let fail = 0;
const check = (ok, name, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-runner-timeout-"));
const pidFile = (name) => path.join(dir, `${name}.pids`);
const js = (s) => JSON.stringify(s);

/** Her sahte süreç pid'ini dosyaya ekler (ölüm kontrolü için). */
const kayit = (name) => `require("fs").appendFileSync(${js(pidFile(name))}, process.pid + "\\n");`;
/** Sonsuza dek yaşayan, çıktı kanalını (stdio inherit) tutan torun. */
const torun = (name, detached) =>
  `require("child_process").spawn(process.execPath, ["-e", ${js(`${kayit(name)} setInterval(() => {}, 1000);`)}], { stdio: "inherit", detached: ${detached} });`;

const fixtures = {
  "basarili.cjs": `console.log("3 PASS / 0 FAIL");`,
  "basarisiz.cjs": `${kayit("basarisiz")} console.log("1 PASS / 1 FAIL"); process.exitCode = 1;`,
  // npx → tsx → node benzeri zincir: test → ara süreç → torunlar; hepsi takılır ve kanalı tutar.
  "takilan.cjs": [
    kayit("takilan"),
    `require("child_process").spawn(process.execPath, ["-e", ${js(`${kayit("takilan")} ${torun("takilan", false)} ${IS_WIN ? "" : torun("takilan", true)} setInterval(() => {}, 1000);`)}], { stdio: "inherit" });`,
    `console.log("hazırlık tamam, sonsuz bekleme");`,
    `setInterval(() => {}, 1000);`,
  ].join("\n"),
  // Testin kendisi PASS ile çıkar ama kanalı tutan bir alt süreç bırakır.
  "artik-surec.cjs": [`${torun("artik", false)}`, `console.log("2 PASS / 0 FAIL");`, `setTimeout(() => process.exit(0), 300);`].join("\n"),
};
for (const [f, src] of Object.entries(fixtures)) fs.writeFileSync(path.join(dir, f), src);

const listFile = path.join(dir, "liste.json");
fs.writeFileSync(listFile, JSON.stringify({
  tests: Object.keys(fixtures).map((f) => ({ file: path.join(dir, f), timeoutSec: TIMEOUT_SN })),
}));

const pids = (name) => { try { return fs.readFileSync(pidFile(name), "utf8").split(/\r?\n/).filter(Boolean).map(Number); } catch { return []; } };
const alive = (pid) => {
  if (IS_WIN) {
    const r = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8", windowsHide: true });
    return new RegExp(`\\b${pid}\\b`).test(r.stdout ?? "");
  }
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
};
const killPid = (pid) => {
  if (IS_WIN) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else { try { process.kill(pid, "SIGKILL"); } catch { /* yok */ } }
};

// Koşucuyu sahte liste üzerinde çalıştır (CI özet dosyasına yazmasın).
const env = { ...process.env };
delete env.GITHUB_STEP_SUMMARY;
const t0 = Date.now();
const res = await new Promise((resolve) => {
  const child = spawn(process.execPath, [RUNNER, "--list", listFile], { cwd: ROOT, env, windowsHide: true, detached: !IS_WIN });
  let out = "";
  child.stdout.on("data", (b) => { out += b; });
  child.stderr.on("data", (b) => { out += b; });
  let hung = false;
  const guard = setTimeout(() => {
    hung = true;
    if (IS_WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    else { try { process.kill(-child.pid, "SIGKILL"); } catch { /* yok */ } }
    setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); resolve({ code: null, out, hung }); }, 2000);
  }, DIS_SINIR_SN * 1000);
  child.on("close", (code) => { clearTimeout(guard); resolve({ code, out, hung }); });
});
const secs = (Date.now() - t0) / 1000;
const line = (f) => res.out.split(/\r?\n/).find((l) => /^(PASS|FAIL) /.test(l) && l.includes(f)) ?? "";

console.log(`koşucu: ${path.relative(ROOT, RUNNER) || RUNNER} · platform ${process.platform} · ${secs.toFixed(1)} sn · çıkış ${res.code}${res.hung ? " · DIŞ SINIRDA DURDURULDU (takıldı)" : ""}`);
for (const l of res.out.split(/\r?\n/)) if (/^(PASS|FAIL) /.test(l)) console.log(`  │ ${l.replace(dir, "<tmp>")}`);

// Üst sınır: 2 normal test + takılan (2 deneme × (3 sn sınır + 5 sn kanal bekleme)) + artık süreç (5 sn) + pay.
const UST_SINIR = 2 * (TIMEOUT_SN + 5) + 5 + 15;
check(!res.hung && secs < UST_SINIR, "koşucu sınırlı sürede bitti (takılma yok)", `${secs.toFixed(1)} sn < ${UST_SINIR} sn`);
check(res.code === 1, "koşucu başarısızlık varken sıfırdan farklı çıktı", `çıkış ${res.code}`);
check(/^PASS .*basarili\.cjs — 3 PASS \(/.test(line("basarili.cjs")) && !/yeniden denendi|kalan alt süreç/.test(line("basarili.cjs")),
  "normal PASS testi aynen PASS (yeniden deneme / temizlik notu yok)", line("basarili.cjs").replace(dir, "<tmp>"));
check(/^FAIL .*basarisiz\.cjs — 1 PASS \/ 1 FAIL/.test(line("basarisiz.cjs")) && !/yeniden denendi/.test(line("basarisiz.cjs")) && pids("basarisiz").length === 1,
  "FAIL testi FAIL kalır ve yeniden denenmez", `başlatma ${pids("basarisiz").length}`);

const tl = line("takilan.cjs");
check(/^FAIL .*takilan\.cjs — zaman aşımı/.test(tl), "takılan test FAIL: zaman aşımı (PASS sayılmadı)", tl.replace(dir, "<tmp>"));
check(/yeniden denendi/.test(tl), "zaman aşımı mevcut kuralla bir kez yeniden denendi");
// Her deneme: test + ara süreç + torun (+ POSIX'te ayrı gruptaki torun) → pid sayısı denemeyi gösterir.
const perTry = IS_WIN ? 3 : 4;
const tp = pids("takilan");
check(tp.length === 2 * perTry, "iki denemede de bütün süreç ağacı başladı", `${tp.length} süreç (beklenen ${2 * perTry})`);
await new Promise((r) => setTimeout(r, 1500));
const tAlive = tp.filter(alive);
check(tAlive.length === 0, "zaman aşımında testin TÜM alt/torun süreçleri öldü", tAlive.length ? `yaşayan: ${tAlive.join(",")}` : `${tp.length}/${tp.length} öldü`);

const al = line("artik-surec.cjs");
check(/^PASS .*artik-surec\.cjs — 2 PASS/.test(al), "çıkışta alt süreç bırakan test kendi sonucuyla (PASS) sonuçlandı", al.replace(dir, "<tmp>"));
const ap = pids("artik").filter(alive);
if (IS_WIN) {
  console.log(`BİLGİ Windows: çıkıştan sonra kalan alt süreç ${ap.length ? "yaşıyor (ebeveyni çıktığı için taskkill /T ağaca ulaşamaz) — harness temizliyor" : "kalmadı"}`);
} else {
  check(/kalan alt süreçler temizlendi/.test(al), "kalan alt süreç temizliği raporlandı");
  check(ap.length === 0, "çıkıştan sonra kalan alt süreç öldürüldü", ap.length ? `yaşayan: ${ap.join(",")}` : "");
}

// Hijyen: ne olursa olsun sahte süreçleri ve geçici dizini temizle.
for (const n of ["takilan", "artik", "basarisiz"]) for (const p of pids(n)) if (alive(p)) killPid(p);
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows'ta kilitli kalabilir */ }

console.log(`\nregression runner timeout harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
