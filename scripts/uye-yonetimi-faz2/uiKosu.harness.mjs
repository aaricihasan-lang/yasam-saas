/**
 * UI koşusu yalıtımı — uiKosu.mjs harness'ı (DB / tarayıcı yok; yalnız yerel geçici dizin + localhost sahte shim).
 *
 *   Y  yapılandırma: koşu dizinine yazılır, sabit ortak dosyaya YAZILMAZ; <ÖNEK>_CFG verilirse ayrıca oraya
 *   K  keşif: tek canlı yığın → o · iki canlı yığın → durur (yolları listeler) · shim'i ölü yığın sayılmaz ·
 *      sahiplik işareti olmayan / runDir'i tutmayan dizin sayılmaz · <ÖNEK>_CFG her zaman önceliklidir
 *   G  ekran görüntüsü dizini: ilk koşu dizini alır · aynı anda ikinci (canlı) koşu `kosu-*` alt dizinine yazar ·
 *      sahibi ölmüş işaret devralınır (ardışık koşular aynı dizin) · işaret çıkışta yalnız sahibince bırakılır
 * Tüm dizinler bu koşuya özgü `zz-uikosu-<rastgele>` önekiyle açılır; harness yalnız kendi oluşturduklarını siler.
 *
 * Çalıştır: node scripts/uye-yonetimi-faz2/uiKosu.harness.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHOTS_MARKER, UI_CFG_FILE, claimShotsDir, liveStackConfigs, resolveUiConfig, writeStackConfig } from "./uiKosu.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Alt süreç kipi (G): dizini sahiplen, yolu yaz, beklemeden çık (işaret çıkışta bırakılmalı).
if (process.argv[2] === "--alt-sahiplen") {
  console.log(`HEDEF ${claimShotsDir(process.argv[3])}`);
  process.exit(0);
}

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l, d) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 400)}`}`); }
};
const TAG = `zz-uikosu-${randomUUID().slice(0, 8)}`;
const created = [];
const mk = (name) => { const d = path.join(os.tmpdir(), name); mkdirSync(d); created.push(d); return d; };
const OWNER_FILE = ".yasam-testdb-sahip.json";
/** Sahte yığın: koşu dizini + sahiplik işareti + (isteğe bağlı) cevap veren sahte shim. */
async function fakeStack(suffix, { alive = true } = {}) {
  const runDir = mk(`${TAG}-ui-${suffix}`);
  writeFileSync(path.join(runDir, OWNER_FILE), JSON.stringify({ runId: randomUUID() }));
  const srv = http.createServer((req, res) => { res.writeHead(req.url.startsWith("/rest/v1/users") ? 200 : 404, { "content-type": "application/json" }); res.end("[]"); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const shimUrl = `http://127.0.0.1:${srv.address().port}`;
  const cfgPath = writeStackConfig({ runDir, shimUrl, cfg: { owner: { token: `t-${suffix}` } } });
  if (!alive) await new Promise((r) => srv.close(r));
  return { runDir, shimUrl, cfgPath, close: () => new Promise((r) => (srv.listening ? srv.close(r) : r())) };
}

const servers = [];
try {
  // ── Y) Yapılandırma ──────────────────────────────────────────────────────────────────────────────────────
  console.log("\n[Y] Yapılandırma koşu dizinine yazılır");
  const legacyName = `${TAG}-ui.json`; // eski kalıp: os.tmpdir()/<sabit ad>.json
  const a = await fakeStack("a");
  servers.push(a);
  ok(a.cfgPath === path.join(a.runDir, UI_CFG_FILE) && existsSync(a.cfgPath), "yapılandırma koşunun kendi dizininde (ui-cfg.json)");
  ok(!existsSync(path.join(os.tmpdir(), legacyName)) && !readdirSync(os.tmpdir()).some((n) => n === `${TAG}-ui.json`), "sabit ortak dosyaya yazılmadı");
  const c0 = JSON.parse(readFileSync(a.cfgPath, "utf8"));
  ok(c0.owner.token === "t-a" && c0.__kosu.runDir === a.runDir && c0.__kosu.shim === a.shimUrl && c0.__kosu.pid === process.pid, "yapılandırma + koşu bilgisi (__kosu: runDir, shim, pid)");
  let dup = "";
  try { writeStackConfig({ runDir: a.runDir, shimUrl: a.shimUrl, cfg: {} }); } catch (e) { dup = e.code; }
  ok(dup === "EEXIST", "aynı koşu dizinine ikinci yazım reddedilir (başka koşunun dosyası ezilmez)", dup);
  const envDir = mk(`${TAG}-env`);
  const envPath = path.join(envDir, "benim.json");
  const r1 = writeStackConfig({ runDir: mk(`${TAG}-ui-env`), shimUrl: "http://127.0.0.1:1", cfg: { x: 1 }, envPath });
  ok(r1 === envPath && JSON.parse(readFileSync(envPath, "utf8")).x === 1, "<ÖNEK>_CFG verilince o yola da yazılır ve o yol döner");

  // ── K) Keşif ─────────────────────────────────────────────────────────────────────────────────────────────
  console.log("\n[K] Kontrol hangi yığına bağlanır");
  const P = [`${TAG}-ui-`];
  const tek = await resolveUiConfig({ envVar: "ZZ_UIKOSU_CFG_YOK", prefixes: P });
  ok(tek.path === a.cfgPath && tek.cfg.owner.token === "t-a", "tek canlı yığın → ortam değişkeni olmadan bulunur (tekil kullanım bozulmaz)", tek.path);
  const dead = await fakeStack("olu", { alive: false });
  ok((await liveStackConfigs(P)).every((l) => l.path !== dead.cfgPath), "shim'i cevap vermeyen (kapanmış) yığın canlı sayılmaz");
  const noOwner = mk(`${TAG}-ui-isaretsiz`);
  writeFileSync(path.join(noOwner, UI_CFG_FILE), JSON.stringify({ __kosu: { runDir: noOwner, shim: a.shimUrl } }));
  const moved = mk(`${TAG}-ui-tasinmis`);
  writeFileSync(path.join(moved, OWNER_FILE), "{}");
  writeFileSync(path.join(moved, UI_CFG_FILE), JSON.stringify({ __kosu: { runDir: a.runDir, shim: a.shimUrl } }));
  const live1 = await liveStackConfigs(P);
  ok(live1.length === 1 && live1[0].path === a.cfgPath, "sahiplik işareti olmayan / runDir'i tutmayan dizin canlı sayılmaz", live1.map((l) => l.path));
  const b = await fakeStack("b");
  servers.push(b);
  let err = "";
  try { await resolveUiConfig({ envVar: "ZZ_UIKOSU_CFG_YOK", prefixes: P }); } catch (e) { err = String(e.message); }
  ok(err.includes("Birden fazla canlı yığın") && err.includes(a.cfgPath) && err.includes(b.cfgPath), "iki canlı yığın → durur, yolları listeler (yanlış yığına bağlanmaz)", err);
  process.env.ZZ_UIKOSU_CFG = b.cfgPath;
  const sec = await resolveUiConfig({ envVar: "ZZ_UIKOSU_CFG", prefixes: P });
  ok(sec.path === b.cfgPath && sec.cfg.owner.token === "t-b" && sec.source === "ZZ_UIKOSU_CFG", "<ÖNEK>_CFG her zaman önceliklidir (iki yığın varken bile)");
  delete process.env.ZZ_UIKOSU_CFG;
  await a.close();
  const sonra = await resolveUiConfig({ envVar: "ZZ_UIKOSU_CFG_YOK", prefixes: P });
  ok(sonra.path === b.cfgPath, "bir yığın kapanınca kalan tek canlı yığın bulunur", sonra.path);
  let none = "";
  try { await resolveUiConfig({ envVar: "ZZ_UIKOSU_CFG_YOK", prefixes: [`${TAG}-hic-`] }); } catch (e) { none = String(e.message); }
  ok(none.includes("Çalışan yığın bulunamadı"), "canlı yığın yoksa açıklayıcı hata");

  // ── G) Ekran görüntüsü dizini ────────────────────────────────────────────────────────────────────────────
  console.log("\n[G] Ekran görüntüsü dizini koşuya özgü");
  const shots = path.join(os.tmpdir(), `${TAG}-shots`);
  created.push(shots);
  const t1 = claimShotsDir(shots);
  ok(t1 === shots && JSON.parse(readFileSync(path.join(shots, SHOTS_MARKER), "utf8")).pid === process.pid, "ilk koşu dizini doğrudan alır (tekil kullanım aynı)");
  const child = spawn(process.execPath, [path.join(HERE, "uiKosu.harness.mjs"), "--alt-sahiplen", shots], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (x) => { out += x; });
  await new Promise((r) => child.on("exit", r));
  const t2 = /HEDEF (.+)/.exec(out)?.[1]?.trim();
  ok(!!t2 && t2 !== shots && path.dirname(t2) === shots && path.basename(t2).startsWith("kosu-"), "aynı anda ikinci (canlı) koşu kendi `kosu-*` alt dizinine yazar", t2);
  ok(!!t2 && !existsSync(path.join(t2, SHOTS_MARKER)), "ikinci koşu çıkınca kendi işaretini bıraktı");
  ok(existsSync(path.join(shots, SHOTS_MARKER)) && JSON.parse(readFileSync(path.join(shots, SHOTS_MARKER), "utf8")).pid === process.pid, "ilk koşunun işareti ve dizini etkilenmedi");
  writeFileSync(path.join(shots, "kanit.png"), "ilk-kosu");
  ok(readFileSync(path.join(shots, "kanit.png"), "utf8") === "ilk-kosu", "ilk koşunun kanıtı ikinci koşu tarafından ezilmedi");
  // Sahibi ölmüş işaret: geçmiş bir koşudan kalmış gibi (ölü PID) → devralınır
  const stale = path.join(os.tmpdir(), `${TAG}-shots-eski`);
  created.push(stale);
  mkdirSync(stale);
  const deadPid = (() => {
    const p = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" });
    return Number(p.stdout.trim());
  })();
  writeFileSync(path.join(stale, SHOTS_MARKER), JSON.stringify({ runId: "eski", pid: deadPid }));
  const t3 = claimShotsDir(stale);
  ok(t3 === stale && JSON.parse(readFileSync(path.join(stale, SHOTS_MARKER), "utf8")).pid === process.pid, "sahibi bitmiş işaret devralınır → ardışık koşular aynı dizini kullanır");
} finally {
  for (const s of servers) await s.close();
  for (const d of created) if (path.basename(d).startsWith(TAG) && existsSync(d)) rmSync(d, { recursive: true, force: true });
}
console.log(`\nUI KOŞU YALITIMI: PASS ${pass} · FAIL ${fail}`);
if (fail) { console.log("Başarısız:", failures); process.exit(1); }
