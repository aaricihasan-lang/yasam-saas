#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ — Android App Links (QR onayı) için assetlinks.json üretme ve doğrulama aracı.
 * Parmak izi TAHMİN EDİLMEZ: yalnız Owner'ın Play Console › Uygulama bütünlüğü › Uygulama imzalama sayfasından kopyaladığı
 * "Uygulama imzalama anahtarı sertifikası" SHA-256 değeri kabul edilir (yükleme anahtarı DEĞİL).
 *
 *   node scripts/giris-guvenligi/assetlinks.mjs uret --sha256 "AB:CD:…(32 bayt)" [--cikti public/.well-known/assetlinks.json]
 *       → biçimi doğrular, dosyayı yazar (var olan dosyanın üzerine yazmaz). Çıktı verilmezse yalnız ekrana basar.
 *   node scripts/giris-guvenligi/assetlinks.mjs dogrula [--url https://www.yasamsistemi.com/.well-known/assetlinks.json] [--sha256 …]
 *       → HTTP 200, yönlendirme YOK, Content-Type application/json, geçerli JSON, paket adı + (verildiyse) parmak izi.
 *   node scripts/giris-guvenligi/assetlinks.mjs --kendini-sina   → yerel sunucuyla aracın kendi testleri (ağ gerekmez).
 *
 * Son adım gerçek cihazdadır: adb shell pm get-app-links com.yasamsistemi.app → "www.yasamsistemi.com: verified".
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

export const PACKAGE = "com.yasamsistemi.app";
export const DEFAULT_URL = "https://www.yasamsistemi.com/.well-known/assetlinks.json";

/** "ab:cd:…" / "ABCD…" → "AB:CD:…" (32 bayt) ya da null. */
export function normalizeFingerprint(v) {
  const hex = String(v ?? "").replace(/[\s:]/g, "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hex)) return null;
  if (/^(00)+$/.test(hex) || /^(FF)+$/.test(hex)) return null;   // yer tutucu değerler reddedilir
  return hex.match(/.{2}/g).join(":");
}

export function buildAssetLinks(fp) {
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: PACKAGE, sha256_cert_fingerprints: [fp] },
  }];
}

/** Yayımlanmış dosyayı doğrular; { ok, problems[] }. fetchImpl: test için. */
export async function verifyUrl(url, expectedFp, fetchImpl = fetch) {
  const problems = [];
  let res;
  try {
    res = await fetchImpl(url, { redirect: "manual", headers: { accept: "application/json" } });
  } catch (e) {
    return { ok: false, problems: [`erişilemedi: ${e?.message ?? e}`] };
  }
  if (res.status >= 300 && res.status < 400) problems.push(`yönlendirme var (${res.status} → ${res.headers.get("location")}); Android yönlendirmeyi izlemez`);
  else if (res.status !== 200) problems.push(`HTTP ${res.status} (200 olmalı)`);
  const ct = res.headers.get("content-type") ?? "";
  if (res.status === 200 && !/^application\/json\b/i.test(ct)) problems.push(`Content-Type "${ct}" (application/json olmalı)`);
  let body = null;
  if (res.status === 200) {
    try { body = JSON.parse(await res.text()); } catch { problems.push("geçerli JSON değil"); }
  }
  if (body !== null) {
    const entries = Array.isArray(body) ? body : [];
    const mine = entries.filter((e) => e?.target?.namespace === "android_app" && e?.target?.package_name === PACKAGE
      && Array.isArray(e?.relation) && e.relation.includes("delegate_permission/common.handle_all_urls"));
    if (!mine.length) problems.push(`${PACKAGE} için handle_all_urls kaydı yok`);
    if (expectedFp) {
      const fps = mine.flatMap((e) => (Array.isArray(e.target.sha256_cert_fingerprints) ? e.target.sha256_cert_fingerprints : []))
        .map((f) => normalizeFingerprint(f));
      if (!fps.includes(expectedFp)) problems.push("beklenen SHA-256 parmak izi dosyada yok");
    }
  }
  return { ok: problems.length === 0, problems };
}

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };

async function selfTest() {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${m}`); };
  const FP = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5"; // biçim örneği (SAHTE)
  ok(normalizeFingerprint(FP.toLowerCase()) === FP, "parmak izi normalleştirme");
  ok(normalizeFingerprint("12:34") === null && normalizeFingerprint("00".repeat(32)) === null, "eksik / yer tutucu parmak izi reddedilir");
  const good = JSON.stringify(buildAssetLinks(FP));
  const routes = {
    "/iyi": [200, "application/json", good],
    "/yonlendirme": [307, "text/plain", "", { location: "https://www.example.test/iyi" }],
    "/html": [200, "text/html; charset=utf-8", "<html>404</html>"],
    "/baska-paket": [200, "application/json", JSON.stringify([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "com.baska", sha256_cert_fingerprints: [FP] } }])],
    "/yok": [404, "text/plain", "yok"],
  };
  const server = http.createServer((req, res) => {
    const r = routes[req.url] ?? routes["/yok"];
    res.writeHead(r[0], { "content-type": r[1], ...(r[3] ?? {}) });
    res.end(r[2]);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    ok((await verifyUrl(`${base}/iyi`, FP)).ok, "doğru dosya PASS");
    ok(!(await verifyUrl(`${base}/iyi`, normalizeFingerprint("AB".repeat(32)))).ok, "farklı parmak izi FAIL");
    ok(!(await verifyUrl(`${base}/yonlendirme`, FP)).ok, "yönlendirme FAIL");
    ok(!(await verifyUrl(`${base}/html`, FP)).ok, "HTML / yanlış tür FAIL");
    ok(!(await verifyUrl(`${base}/baska-paket`, FP)).ok, "başka paket FAIL");
    ok(!(await verifyUrl(`${base}/yok`, FP)).ok, "404 FAIL");
  } finally {
    server.close();
  }
  const tmp = fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "assetlinks-"));
  const out = path.join(tmp, "assetlinks.json");
  fs.writeFileSync(out, "önceki");
  const r = spawnWrite(out, FP);
  ok(r === "exists" && fs.readFileSync(out, "utf8") === "önceki", "var olan dosyanın üzerine yazılmaz");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nassetlinks aracı: ${pass} PASS / ${fail} FAIL`);
  process.exitCode = fail ? 1 : 0;
}

function spawnWrite(out, fp) {
  if (fs.existsSync(out)) return "exists";
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(buildAssetLinks(fp), null, 2)}\n`);
  return "written";
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
// Windows'ta ağ isteğinden hemen sonra process.exit libuv uyarısı basar → çıkış kodu process.exitCode ile verilir.
async function cli() {
  const cmd = process.argv[2];
  if (process.argv.includes("--kendini-sina")) return selfTest();
  if (cmd === "uret") {
    const fp = normalizeFingerprint(arg("--sha256"));
    if (!fp) { console.error("Geçersiz SHA-256: Play Console'daki 'Uygulama imzalama anahtarı sertifikası' değerini (32 bayt) verin."); process.exitCode = 2; return; }
    const out = arg("--cikti");
    if (!out) { console.log(JSON.stringify(buildAssetLinks(fp), null, 2)); return; }
    if (spawnWrite(out, fp) === "exists") { console.error(`${out} zaten var; üzerine yazılmadı.`); process.exitCode = 2; return; }
    console.log(`yazıldı: ${out}`);
    return;
  }
  if (cmd === "dogrula") {
    const fp = arg("--sha256") ? normalizeFingerprint(arg("--sha256")) : null;
    const r = await verifyUrl(arg("--url") ?? DEFAULT_URL, fp);
    console.log(r.ok ? "PASS — dosya doğru yayımlanmış (son adım: gerçek cihazda pm get-app-links)" : `FAIL\n - ${r.problems.join("\n - ")}`);
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  console.log("kullanım: uret --sha256 … [--cikti …] | dogrula [--url …] [--sha256 …] | --kendini-sina");
  process.exitCode = 2;
}
if (isMain) await cli();
