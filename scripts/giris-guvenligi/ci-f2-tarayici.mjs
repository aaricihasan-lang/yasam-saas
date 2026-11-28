#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ F2-L — F2 TARAYICI uçtan uca test koşucusu (yerel + GitHub Actions).
 *
 * Ön koşul: sahte değerlerle `next build --webpack` (bkz. scripts/giris-guvenligi/f2c-ui.e2e.ts başlığı).
 * Çalıştır:  node scripts/giris-guvenligi/ci-f2-tarayici.mjs --out <kanıt-klasörü> [--only f2c,f2k] [--negatif]
 *
 * Kurallar (boş paket / sessiz atlama PASS VEREMEZ):
 *   - Önce GERÇEK tarayıcı ikilileri yoklanır: Chrome (channel chrome), Microsoft Edge (channel msedge), WebKit. Her biri
 *     için çalıştırılabilir dosya yolu + sürüm kanıta yazılır. Edge açılamazsa Chromium "Edge" diye RAPORLANMAZ → FAIL.
 *   - Her test sırayla (bellek) çalışır; PASS ancak: çıkış kodu 0 VE "N PASS / 0 FAIL" özeti VE N ≥ beklenen asgari sayı.
 *   - Test DB: F2_TEST_DB_LATEST=1 → güncel kodla EN GÜNCEL F2 şeması (F2_STAGES son aşaması; 23.11'de 001200 / F2-M).
 *     Düzey SABİT YAZILMAZ: önceden sabit F2-K bayrağı vardı ve 001200 eklenince CI 001100'de sessizce yeşil kaldı.
 *   - Düzey koruması (f2-test-db-duzey.mjs): (a) testlerden ÖNCE statik denetim — en son F2 migration dosyası = F2_STAGES
 *     son aşaması ve testDb.ts hepsini uyguluyor; (b) her testin günlüğünde testDb'nin yazdığı "[f2-test-db] düzey" satırı
 *     ARANIR: kayıt (auth_f2_schema_level) = katalog parmak izi = beklenen düzey olmazsa test FAIL. Düzey özete yazılır.
 *   - --negatif: f2k-ui F2-K migration'ı OLMADAN (F2L_NEGATIF=1, en güncel zincir bayrağı KAPALI) çalıştırılır ve FAIL
 *     VERMEK ZORUNDADIR; DB düzeyi F2-K'dan hemen önceki aşama (1000) olmak zorundadır; ayrıca kritik kuralların (işleme
 *     özel doğrulama, 6 haneli yazılan kod) FAIL listesinde görünmesi şarttır.
 * Çıktı: <out>/ozet.md + ozet.json (+ GITHUB_STEP_SUMMARY), test başına günlük + ekran görüntüleri.
 */
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { checkCoverage, readRepo, latestStage, stageBefore, judgeLevels } from "./f2-test-db-duzey.mjs";

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const OUT = path.resolve(arg("--out") ?? "");
if (!arg("--out")) { console.error("--out <kanıt-klasörü> gerekli"); process.exit(2); }
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) { console.error("kanıt klasörü boş olmalı"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (arg("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const NEGATIF = args.includes("--negatif");

// Asgari PASS = 17.11 tam koşuda GÖZLENEN madde sayısı: tek bir madde bile sessizce atlanırsa koşu KIRMIZI olur.
const SUITES = [
  { key: "f2c", file: "f2c-ui.e2e.ts", min: 36, title: "F2-C QR girişi + Owner cihaz onayı (Chrome, Edge; 320/375 px)" },
  { key: "f2d", file: "f2d-ui.e2e.ts", min: 48, title: "F2-D e-posta kodu (Chrome, Edge, WebKit iPhone emülasyonu, Android emülasyonu)" },
  { key: "f2e", file: "f2e-ui.e2e.ts", min: 63, title: "F2-E hesap kurtarma (Chrome, Edge, WebKit, Android emülasyonu, 320/375/390)" },
  { key: "f2g", file: "f2g-ui.e2e.ts", min: 16, title: "F2-G Owner işleme özel doğrulama (Chrome, Edge, 375 px)" },
  { key: "f2i", file: "f2i-mobil-ui.e2e.ts", min: 55, title: "F2-I e-posta kodu dayanıklılık (yapıştırma, süre, yenileme, geri, ağ kesintisi)" },
  { key: "f2k", file: "f2k-ui.e2e.ts", min: 80, title: "F2-K 6 haneli yazılan QR, paralel sekme, yönetici yetkisi, cihaz talebi süresi, ekran genişlikleri" },
];

const results = [];
const log = (s) => { console.log(s); };

// ── 0) Test DB düzey koruması (statik) ───────────────────────────────────────────────────────────────────────────
const LATEST = latestStage();
const NEGATIF_LEVEL = stageBefore(1100).level;   // F2-K kuralları YOK
const EXPECTED_LEVEL = NEGATIF ? NEGATIF_LEVEL : LATEST.level;
{
  const problems = checkCoverage(readRepo(process.cwd()));
  log(`── Test DB düzey koruması: en güncel F2 aşaması ${LATEST.level} (${LATEST.file}); bu koşuda beklenen DB düzeyi ${EXPECTED_LEVEL}${NEGATIF ? " (negatif: F2-K öncesi)" : ""} ──`);
  for (const p of problems) log(`  FAIL ${p}`);
  if (!problems.length) log("  PASS migration klasörü = F2_STAGES = testDb.ts (en güncel zincir eşlemesi var)");
  results.push({ key: "duzey-koruma", title: `Test DB düzey koruması (en son migration ${LATEST.file} = F2_STAGES = testDb.ts)`,
    pass: problems.length ? 0 : 1, fail: problems.length, exit: problems.length ? 1 : 0, ok: !problems.length, detail: { latest: LATEST, problems } });
}

// ── 1) Tarayıcı ikilisi yoklaması ───────────────────────────────────────────────────────────────────────────────
const probeSrc = `
const { chromium, webkit } = require("playwright");
(async () => {
  const out = {};
  for (const [name, launch] of [["chrome", () => chromium.launch({ channel: "chrome", headless: true })],
                                ["msedge", () => chromium.launch({ channel: "msedge", headless: true })],
                                ["webkit", () => webkit.launch({ headless: true })]]) {
    try {
      const b = await launch();
      const p = await (await b.newContext()).newPage();
      const ua = await p.evaluate(() => navigator.userAgent);
      out[name] = { ok: true, version: b.version(), ua };
      await b.close();
    } catch (e) { out[name] = { ok: false, error: String(e && e.message || e).split("\\n")[0].slice(0, 300) }; }
  }
  console.log(JSON.stringify(out));
})();`;
const probeFile = path.join(OUT, "tarayici-yoklama.cjs");
fs.writeFileSync(probeFile, probeSrc);
// Depo dizininde çalışır (playwright modülü buradan çözülür); kopyası kanıt klasöründe.
const probe = spawnSync(process.execPath, ["-e", probeSrc], { cwd: process.cwd(), encoding: "utf8", timeout: 180000 });
if (!(probe.stdout || "").trim()) log(`  yoklama hatası: ${(probe.stderr || "").slice(0, 600)}`);
let browsers = {};
try { browsers = JSON.parse((probe.stdout || "").trim().split("\n").pop() || "{}"); } catch { browsers = {}; }
const binPath = (cands) => cands.find((c) => { try { return fs.existsSync(c); } catch { return false; } });
const EDGE_BIN = process.platform === "win32"
  ? binPath(["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"])
  : binPath(["/opt/microsoft/msedge/msedge"]);
const CHROME_BIN = process.platform === "win32"
  ? binPath(["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"])
  : binPath(["/opt/google/chrome/chrome"]);
if (browsers.chrome) browsers.chrome.path = CHROME_BIN ?? "(bulunamadı)";
if (browsers.msedge) {
  browsers.msedge.path = EDGE_BIN ?? "(bulunamadı)";
  // GERÇEK Edge: kullanıcı ajanında "Edg/" belirteci ve Microsoft Edge ikilisi ŞART (Chromium Edge diye sayılmaz).
  browsers.msedge.gercekEdge = !!browsers.msedge.ok && /\bEdg\//.test(browsers.msedge.ua ?? "") && !!EDGE_BIN;
}
log("── Tarayıcı ikilileri ──");
for (const [k, v] of Object.entries(browsers)) log(`  ${k}: ${v.ok ? `OK ${v.version} · ${v.path ?? ""}${k === "msedge" ? ` · gerçek Edge=${v.gercekEdge}` : ""}` : `AÇILAMADI: ${v.error}`}`);
const probeOk = browsers.chrome?.ok && browsers.msedge?.ok && browsers.msedge?.gercekEdge && browsers.webkit?.ok;
results.push({ key: "yoklama", title: "Gerçek tarayıcı ikilileri (Chrome, Microsoft Edge, WebKit)", pass: probeOk ? 3 : 0, fail: probeOk ? 0 : 1, exit: probeOk ? 0 : 1, ok: !!probeOk, detail: browsers });

// ── 2) WebKit için yerel TEST sertifikası (HTTPS vekil; __Host- çerezi http'de saklanmaz) ──────────────────────────
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
if (!env.F2D_TLS_DIR) {
  const tls = path.join(OUT, "tls-test");
  fs.mkdirSync(tls, { recursive: true });
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(tls, "key.pem"), "-out", path.join(tls, "cert.pem"),
      "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
    env.F2D_TLS_DIR = tls;
    log(`  bilgi: WebKit HTTPS vekili için 1 günlük yerel TEST sertifikası üretildi (yalnız localhost; gizli değildir)`);
  } catch {
    log("  UYARI: openssl yok → WebKit HTTP üzerinden koşar (__Host- çerezi saklanmayabilir)");
  }
}

// ── 3) Testler ───────────────────────────────────────────────────────────────────────────────────────────────
// F2-L: testlerin kullandığı portlar. Önceki testin sunucusu portta kalırsa sonraki test ESKİ sunucuya (eski ortam ayarları,
// eski e-posta kutusu) bağlanır ve yanlış sonuç üretir → her testten önce portlar BOŞ olmak zorunda.
const PORTS = [3987, 3988, 3989, 54398];
const portBusy = (port) => Promise.all(["127.0.0.1", "::1"].map((host) => new Promise((res) => {
  const sock = net.connect({ port, host });
  sock.once("connect", () => { sock.destroy(); res(true); });
  sock.once("error", () => res(false));
  sock.setTimeout(1500, () => { sock.destroy(); res(false); });
}))).then((r) => r.some(Boolean));
async function waitPortsFree(maxMs) {
  const until = Date.now() + maxMs;
  for (;;) {
    const busy = [];
    for (const port of PORTS) if (await portBusy(port)) busy.push(port);
    if (!busy.length || Date.now() > until) return busy;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function runSuite(s, extraEnv, outName) {
  const dir = path.join(OUT, outName);
  const before = await waitPortsFree(20000);
  if (before.length) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "gunluk.txt"), `port dolu (önceki sunucu kapanmadı): ${before.join(",")} — test KOŞTURULMADI`);
    return { pass: 0, fail: -1, exit: 1, sec: 0, summaryFound: false, failLines: [`FAIL port dolu: ${before.join(",")}`], signal: null, portsAfter: before };
  }
  const started = Date.now();
  // Dış ortamdan sızan F2 test DB bayrakları temizlenir: düzeyi YALNIZ bu koşucu belirler (negatif kontrol izolasyonu).
  const baseEnv = Object.fromEntries(Object.entries(env).filter(([k]) => !/^F2_TEST_DB_|^F2L_NEGATIF$/.test(k)));
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", path.join("scripts", "giris-guvenligi", s.file), dir], {
    cwd: process.cwd(), env: { ...baseEnv, F2_TEST_DB_LEVEL_LOG: "1", ...extraEnv }, encoding: "utf8", timeout: 20 * 60 * 1000, maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  let text = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const after = await waitPortsFree(20000);
  if (after.length) text += `\nUYARI: test bittikten 20 sn sonra port hâlâ dolu: ${after.join(",")}\n`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "gunluk.txt"), text);
  const m = [...text.matchAll(/(\d+) PASS \/ (\d+) FAIL/g)].pop();
  const failLines = text.split("\n").filter((l) => /^\s+FAIL /.test(l)).map((l) => l.trim());
  if (after.length) failLines.push(`FAIL test sonrası port dolu: ${after.join(",")}`);
  const lv = judgeLevels(text, EXPECTED_LEVEL);
  if (!lv.ok) failLines.push(`FAIL DB düzeyi: ${lv.reason}`);
  const dbLevel = lv.levels.length ? [...new Set(lv.levels.map((l) => `${l.registry ?? "yok"}/${l.catalog}`))].join(", ") : "—";
  return { pass: m ? Number(m[1]) : 0, fail: m ? Number(m[2]) : -1, exit: r.status ?? (r.signal ? 128 : 1), sec: Math.round((Date.now() - started) / 1000),
    summaryFound: !!m, failLines, signal: r.signal ?? null, portsAfter: after, levelOk: lv.ok, dbLevel, dbLevelCount: lv.levels.length };
}

for (const s of SUITES) {
  if (ONLY.length && !ONLY.includes(s.key)) continue;
  if (NEGATIF && s.key !== "f2k") continue;
  if (NEGATIF) {
    log(`\n── NEGATİF KONTROL: ${s.file} — F2-K migration'ı OLMADAN (FAIL beklenir) ──`);
    const r = await runSuite(s, { F2L_NEGATIF: "1" }, `${s.key}-negatif`);
    const must = [/doğrulama penceresini açtı/, /MFA ZORUNLU|yönetici oluştu/, /6 haneli kod = sunucu kodu|yazma' kipini/];
    const caught = must.map((re) => r.failLines.some((l) => re.test(l)));
    const ok = r.exit !== 0 && r.fail > 0 && caught.every(Boolean) && r.levelOk;
    log(`  ${ok ? "PASS" : "FAIL"} negatif kontrol: çıkış=${r.exit} · ${r.pass} PASS / ${r.fail} FAIL · DB düzeyi (kayıt/katalog) ${r.dbLevel} (beklenen ${EXPECTED_LEVEL}) · kritik kurallar yakalandı=${JSON.stringify(caught)}`);
    for (const l of r.failLines.slice(0, 15)) log(`     ${l}`);
    results.push({ key: `${s.key}-negatif`, title: `NEGATİF KONTROL — ${s.title} (F2-K kuralları kaldırılmış)`, pass: r.pass, fail: r.fail, exit: r.exit, sec: r.sec, ok,
      dbLevel: r.dbLevel, dbLevelCount: r.dbLevelCount, levelOk: r.levelOk, detail: { caught, failLines: r.failLines.slice(0, 30) } });
    continue;
  }
  log(`\n── ${s.file}: ${s.title} ──`);
  const r = await runSuite(s, { F2_TEST_DB_LATEST: "1" }, s.key);
  const ok = r.exit === 0 && r.summaryFound && r.fail === 0 && r.pass >= s.min && !r.portsAfter.length && r.levelOk;
  log(`  ${ok ? "PASS" : "FAIL"} ${s.key}: çıkış=${r.exit}${r.signal ? ` sinyal=${r.signal}` : ""} · ${r.pass} PASS / ${r.fail} FAIL (asgari ${s.min}) · DB düzeyi (kayıt/katalog) ${r.dbLevel} (beklenen ${EXPECTED_LEVEL}) · ${r.sec} sn${r.summaryFound ? "" : " · ÖZET SATIRI YOK"}`);
  for (const l of r.failLines.slice(0, 15)) log(`     ${l}`);
  if (!r.summaryFound || r.exit !== 0) {
    const tail = fs.readFileSync(path.join(OUT, s.key, "gunluk.txt"), "utf8").split("\n").slice(-25).join("\n");
    log(tail.split("\n").map((l) => `     | ${l}`).join("\n"));
  }
  results.push({ key: s.key, title: s.title, min: s.min, ...r, ok });
}

// ── 4) Özet ──────────────────────────────────────────────────────────────────────────────────────────────────
const allOk = results.length > 2 && results.every((r) => r.ok);
const md = [
  `## F2 tarayıcı uçtan uca — ${NEGATIF ? "NEGATİF KONTROL" : "kabul"} ${allOk ? "✅" : "❌"}`,
  "",
  `Test DB: beklenen F2 düzeyi **${EXPECTED_LEVEL}**${NEGATIF ? " (negatif kontrol: F2-K öncesi)" : ` (en güncel aşama ${LATEST.file})`}. "DB düzeyi" sütunu testin kendi günlüğünden okunur: kayıt (auth_f2_schema_level) / katalog parmak izi.`,
  "",
  "| Test | Sonuç | PASS | FAIL | DB düzeyi (kayıt/katalog) | Süre |",
  "|---|---|---|---|---|---|",
  ...results.map((r) => `| ${r.title} | ${r.ok ? "PASS" : "**FAIL**"} | ${r.pass} | ${r.fail} | ${r.dbLevel ?? "-"} | ${r.sec ?? "-"} sn |`),
  "",
  `Tarayıcılar: ${Object.entries(browsers).map(([k, v]) => `${k} ${v.ok ? v.version : "AÇILAMADI"}${k === "msedge" ? ` (gerçek Edge=${v.gercekEdge})` : ""}`).join(" · ")}`,
  "",
  "WebKit = Safari motoru emülasyonu (GERÇEK iPhone Safari DEĞİL). Telefon = Node P-256 anahtarı (Android Keystore DEĞİL). E-posta = sentetik sağlayıcı (gerçek Gmail YOK).",
].join("\n");
fs.writeFileSync(path.join(OUT, "ozet.md"), md);
fs.writeFileSync(path.join(OUT, "ozet.json"), JSON.stringify({ negatif: NEGATIF, ok: allOk, expectedDbLevel: EXPECTED_LEVEL, latestStage: LATEST, browsers, results }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
log(`\n${md}`);
process.exit(allOk ? 0 : 1);
