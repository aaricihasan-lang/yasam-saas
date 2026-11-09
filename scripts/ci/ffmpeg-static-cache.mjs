#!/usr/bin/env node
/**
 * CI — ffmpeg-static resmî ikili dosyaları: önbellek + sınırlı tekrar + SHA-256. Sır / production YOK.
 *
 * Sorun: ffmpeg-static'in postinstall'u (install.js) her `npm ci`'de GitHub release'ten 3 dosya indirir
 * (ffmpeg-linux-x64.gz, linux-x64.README, linux-x64.LICENSE); 404 dışı her hata (ör. HTTP 504) kurulumu düşürür,
 * kendi tekrarları ~200 ms aralıklıdır ve indirilen dosyayı DOĞRULAMAZ.
 *
 * Çözüm (ci.yml):
 *   1) prepare: önbellek dizinindeki 3 dosya sabit SHA-256 ile eşleşirse kullanılır; yoksa resmî adresten
 *      sınırlı tekrar + artan beklemeyle indirilir ve SHA-256 doğrulanır. Tüm denemeler biterse çıkış 1 (CI kırmızı).
 *   2) `npm ci` FFMPEG_BIN = doğrulanmış dosya ile çalışır → install.js "installed already" der, ağa çıkmaz
 *      (ffmpeg-static index.js FFMPEG_BIN'i ikili yolu olarak döndürür; install.js dosya varsa çıkış 0).
 *   3) install: node_modules/ffmpeg-static sürümü / release etiketi sabitlerle aynı mı denetlenir; 3 dosya
 *      install.js'in yazacağı yerlere (ffmpeg, ffmpeg.README, ffmpeg.LICENSE, 0755) kopyalanır, yeniden doğrulanır,
 *      `require("ffmpeg-static")` yolu ve `ffmpeg -version` kontrol edilir. Sonraki adımlar normal kurulumla aynı durumu görür.
 *
 * SHA-256 değerleri: resmî b6.1.1 release varlıklarının GitHub "digest" alanı ile indirilen dosyaların hesabı birebir aynı.
 * ffmpeg-static sürümü değişirse `install` kırmızı biter → bu sabitler yeni sürüm için güncellenmelidir.
 *
 * Kullanım:  node scripts/ci/ffmpeg-static-cache.mjs prepare --dir <önbellek dizini>
 *            node scripts/ci/ffmpeg-static-cache.mjs install --dir <önbellek dizini>
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

const PKG_VERSION = "5.3.0";
const RELEASE = "b6.1.1";
const TARGET = "linux-x64";
const FILES = [
  { name: "ffmpeg", asset: `ffmpeg-${TARGET}.gz`, gz: true, sha256: "e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99" },
  { name: "ffmpeg.README", asset: `${TARGET}.README`, gz: false, sha256: "72f4b1b06d419d22ace6e7cc75f06826f90737345aa0b1736158929f4aacc537" },
  { name: "ffmpeg.LICENSE", asset: `${TARGET}.LICENSE`, gz: false, sha256: "8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903" },
];
// ffmpeg-static ile aynı ortam değişkeni (yansı adresi); verilmezse resmî GitHub release adresi.
const BASE = `${process.env.FFMPEG_BINARIES_URL || "https://github.com/eugeneware/ffmpeg-static/releases/download"}/${RELEASE}`;
// Deneme sayısı = bekleme sayısı + 1 (varsayılan 4 deneme; 20 sn, 60 sn, 120 sn bekleme).
const DELAYS_S = (process.env.FFMPEG_FETCH_RETRY_DELAYS_S || "20,60,120").split(",").map(Number);
const TIMEOUT_MS = 120_000;

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error(`ffmpeg-static: HATA — ${msg}`); process.exit(1); };

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) fail(`${name} gerekli`);
  return path.resolve(process.argv[i + 1]);
}

function cachedOk(dir) {
  return FILES.every((f) => {
    const p = path.join(dir, f.name);
    return fs.existsSync(p) && sha256(fs.readFileSync(p)) === f.sha256;
  });
}

/** Geçici hata (ağ / zaman aşımı / 429 / 5xx) → tekrar; diğer HTTP hataları (ör. 404) → hemen kırmızı. */
async function download(url) {
  for (let attempt = 1; ; attempt++) {
    let reason;
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status !== 429 && res.status < 500) fail(`${url} → HTTP ${res.status} (geçici değil; tekrar yok)`);
      reason = `HTTP ${res.status}`;
    } catch (e) {
      reason = e?.cause?.code || e?.name || String(e);
    }
    if (attempt > DELAYS_S.length) fail(`${url} → ${reason}; ${attempt} denemenin tamamı başarısız`);
    console.log(`ffmpeg-static: ${path.basename(url)} deneme ${attempt} başarısız (${reason}); ${DELAYS_S[attempt - 1]} sn sonra tekrar`);
    await sleep(DELAYS_S[attempt - 1] * 1000);
  }
}

async function prepare(dir) {
  if (cachedOk(dir)) {
    console.log(`ffmpeg-static: önbellek kullanıldı (${RELEASE} ${TARGET}, 3 dosya SHA-256 eşleşti)`);
    return;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const f of FILES) {
    const raw = await download(`${BASE}/${f.asset}`);
    const data = f.gz ? zlib.gunzipSync(raw) : raw;
    const got = sha256(data);
    if (got !== f.sha256) fail(`${f.asset} SHA-256 uyuşmuyor (beklenen ${f.sha256}, gelen ${got})`);
    fs.writeFileSync(path.join(dir, `${f.name}.part`), data);
    fs.renameSync(path.join(dir, `${f.name}.part`), path.join(dir, f.name));
    console.log(`ffmpeg-static: ${f.asset} indirildi, SHA-256 OK`);
  }
  fs.chmodSync(path.join(dir, "ffmpeg"), 0o755);
}

function install(dir) {
  if (`${process.platform}-${process.arch}` !== TARGET) fail(`platform ${process.platform}-${process.arch}; bu dosyalar ${TARGET} içindir`);
  if (!cachedOk(dir)) fail(`${dir} içinde doğrulanmış dosyalar yok (önce prepare)`);
  const pkgDir = path.join(process.cwd(), "node_modules", "ffmpeg-static");
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  const tag = pkg["ffmpeg-static"]?.["binary-release-tag"];
  if (pkg.version !== PKG_VERSION || tag !== RELEASE) {
    fail(`kurulu ffmpeg-static ${pkg.version} / ${tag}; betik ${PKG_VERSION} / ${RELEASE} için — sabitleri ve SHA-256 değerlerini güncelleyin`);
  }
  for (const f of FILES) fs.copyFileSync(path.join(dir, f.name), path.join(pkgDir, f.name));
  fs.chmodSync(path.join(pkgDir, "ffmpeg"), 0o755);
  for (const f of FILES) {
    if (sha256(fs.readFileSync(path.join(pkgDir, f.name))) !== f.sha256) fail(`node_modules içindeki ${f.name} SHA-256 uyuşmuyor`);
  }
  const env = { ...process.env };
  delete env.FFMPEG_BIN;
  const resolved = execFileSync(process.execPath, ["-e", "process.stdout.write(require('ffmpeg-static'))"], { env, encoding: "utf8" });
  if (path.resolve(resolved) !== path.join(pkgDir, "ffmpeg")) fail(`require("ffmpeg-static") beklenmeyen yol: ${resolved}`);
  const version = execFileSync(resolved, ["-version"], { encoding: "utf8" }).split("\n")[0];
  if (!version.startsWith("ffmpeg version")) fail(`ffmpeg -version beklenmeyen çıktı: ${version}`);
  console.log(`ffmpeg-static: kurulum çıktıları tamam (ffmpeg, README, LICENSE; SHA-256 OK) — ${version}`);
}

const mode = process.argv[2];
if (mode === "prepare") await prepare(arg("--dir"));
else if (mode === "install") install(arg("--dir"));
else fail("kullanım: prepare|install --dir <dizin>");
