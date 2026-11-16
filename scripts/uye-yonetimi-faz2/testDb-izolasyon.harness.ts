/**
 * TEST ORTAMI GÜVENLİĞİ — startTestDb yalıtım harness'ı (gerçek embedded-postgres; production'a / ağa SIFIR temas).
 *
 *   U  kurallar (DB yok): koşu dizini benzersiz · sahiplik işareti olmayan / başka koşuya ait / öneki ya da konumu
 *      tutmayan dizin SİLİNMEZ · eski sabit adlı klasöre dokunulmaz · ölü çocuk süreç "canlı" sayılmaz
 *   E  eşzamanlı iki koşu (AYNI dirName): ayrı dizin, ayrı sunucu, ayrı veri; biri durunca diğeri çalışmaya devam eder
 *   P  port başka koşudayken: yeni koşu başlamaz, çalışan koşuya ve verisine dokunulmaz, kendi dizinini bırakmaz
 *   K  postmaster dışarıdan bittiyse stop(): PID'e sinyal / taskkill YOK, askıda kalmaz, yalnız kendi dizini silinir
 *   C  yakalanmamış hata ile çıkan süreç: kendi postmaster'ı kapanır, kendi dizini silinir, yabancı dizin kalır
 *   Y  (Windows) PID + oluşturulma zamanı: zaman tutmayan kayıt süreci ÖLDÜRMEZ; stop() sonrası postmaster'ın hiçbir
 *      çocuğu (io_worker…) yetim kalmaz
 * Deneme dizinlerinin hepsi bu koşuya özgü `zz-izolasyon-<rastgele>` önekiyle açılır; harness yalnız kendi
 * oluşturduklarını siler.
 *
 * Çalıştır: npx tsx scripts/uye-yonetimi-faz2/testDb-izolasyon.harness.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import { startTestDb } from "./testDb";
import { OWNER_FILE, createRunDir, freePort, killStampedSync, ownChildAlive, removeOwnRunDir, sameDataDir } from "./testDbRun";

const TAG = `zz-izolasyon-${randomUUID().slice(0, 8)}`;

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 500)}`}`);
  }
}
const own = (ds: string[]) => readdirSync(os.tmpdir()).filter((n) => n.startsWith(TAG)).filter((n) => !ds.includes(n));
const portOpen = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = createConnection({ host: "127.0.0.1", port });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
/** Windows: verilen ebeveynin canlı çocuk süreçleri (yetim io_worker denetimi); diğer platformlarda boş. */
const childrenOf = (pid: number): number[] => {
  if (process.platform !== "win32") return [];
  const r = spawnSync("powershell", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}").ProcessId`], { encoding: "utf8" });
  return String(r.stdout).split(/\r?\n/).map((x) => Number(x.trim())).filter((x) => x > 0);
};
const pmPidOf = (dataDir: string) => Number(readFileSync(path.join(dataDir, "postmaster.pid"), "utf8").split(/\r?\n/)[0]);
const pidAlive = (pid: number) => {
  if (process.platform === "win32") return spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8" }).stdout.includes(String(pid));
  try { process.kill(pid, 0); return true; } catch { return false; }
};

async function main(): Promise<void> {
  const created: string[] = []; // harness'ın kendi elle oluşturduğu tuzak / yabancı dizinler (sonda yalnız bunlar silinir)
  try {
    // ── U) Kurallar ─────────────────────────────────────────────────────────────────────────────────────────
    console.log("\n[U] Kurallar (DB yok)");
    const legacy = path.join(os.tmpdir(), `${TAG}-u`); // ESKİ kodun sabit hedefi
    mkdirSync(legacy);
    created.push(path.basename(legacy));
    writeFileSync(path.join(legacy, "baska-kosu.txt"), "dokunulmamalı");
    const r1 = createRunDir(`${TAG}-u`, 1);
    const r2 = createRunDir(`${TAG}-u`, 1);
    ok(r1.runDir !== r2.runDir && existsSync(r1.runDir) && existsSync(r2.runDir), "aynı dirName iki kez → iki ayrı benzersiz koşu dizini");
    ok(existsSync(path.join(legacy, "baska-kosu.txt")), "eski sabit adlı klasör (başka koşu) yerinde");
    const marker = JSON.parse(readFileSync(path.join(r1.runDir, OWNER_FILE), "utf8"));
    ok(marker.runId === r1.runId && marker.pid === process.pid, "sahiplik işareti: runId + pid");
    ok(removeOwnRunDir({ ...r1, runId: r2.runId }).removed === false && existsSync(r1.runDir), "başka koşunun runId'si ile silme REDDEDİLİR");
    ok(removeOwnRunDir({ ...r1, prefix: "baska-onek-" }).removed === false && existsSync(r1.runDir), "önek tutmazsa silme REDDEDİLİR");
    ok(removeOwnRunDir({ ...r1 }, path.join(os.tmpdir(), "yok")).removed === false && existsSync(r1.runDir), "tmp tabanı dışında sayılırsa silme REDDEDİLİR");
    rmSync(path.join(r2.runDir, OWNER_FILE));
    ok(removeOwnRunDir(r2).removed === false && existsSync(r2.runDir), "sahiplik işareti yoksa silme REDDEDİLİR");
    writeFileSync(path.join(r2.runDir, OWNER_FILE), JSON.stringify({ runId: r2.runId })); // kendi işaretimizi geri koy
    ok(removeOwnRunDir(r1).removed && removeOwnRunDir(r2).removed, "kendi koşu dizini (işaret eşleşir) silinir");
    ok(existsSync(path.join(legacy, "baska-kosu.txt")), "silmelerden sonra eski sabit adlı klasör hâlâ yerinde");
    const fakeChild = { pid: 4242, exitCode: null, signalCode: null, killed: false } as const;
    ok(ownChildAlive(fakeChild) && !ownChildAlive({ ...fakeChild, exitCode: 1 }) && !ownChildAlive({ ...fakeChild, signalCode: "SIGTERM" })
      && !ownChildAlive({ ...fakeChild, killed: true }) && !ownChildAlive({ ...fakeChild, pid: undefined }) && !ownChildAlive(undefined),
      "bitmiş / öldürülmüş / PID'siz çocuk süreç canlı SAYILMAZ (PID yeniden kullanımına sinyal yok)");
    ok(sameDataDir("C:/Tmp/A/data", "c:\\tmp\\a\\data") === (process.platform === "win32") && !sameDataDir("/x/a/data", "/x/b/data"),
      "veri dizini karşılaştırması (Windows'ta büyük/küçük harf + ayraç duyarsız)");

    // ── Y) PID + oluşturulma zamanı ────────────────────────────────────────────────────────────────────────
    console.log("\n[Y] PID + oluşturulma zamanı (yeniden kullanılmış PID'e dokunulmaz)");
    if (process.platform === "win32") {
      const dummy = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
      await new Promise((r) => setTimeout(r, 400));
      const real = spawnSync("powershell", ["-NoProfile", "-Command",
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${dummy.pid}").CreationDate.ToUniversalTime().ToString('o')`], { encoding: "utf8" }).stdout.trim();
      const wrong = new Date(Date.parse(real) - 3_600_000).toISOString(); // aynı PID, FARKLI oluşturulma zamanı
      ok(killStampedSync([{ pid: dummy.pid!, created: wrong }]) === 0 && pidAlive(dummy.pid!), "aynı PID ama farklı oluşturulma zamanı → süreç ÖLDÜRÜLMEZ (PID yeniden kullanımı)");
      ok(killStampedSync([{ pid: dummy.pid!, created: real }]) === 1, "PID + oluşturulma zamanı birebir eşleşen kendi süreci sonlandırılır");
      await new Promise((r) => setTimeout(r, 400));
      ok(!pidAlive(dummy.pid!), "eşleşen süreç gerçekten kapandı");
    } else {
      ok(killStampedSync([{ pid: process.pid, created: "x" }]) === 0, "Windows dışı: işaretli süreç sonlandırma yok (postmaster çocukları kendini kapatır)");
    }

    // ── E) Eşzamanlı iki koşu, AYNI dirName ─────────────────────────────────────────────────────────────────
    console.log("\n[E] Eşzamanlı iki koşu (aynı dirName)");
    const foreign = path.join(os.tmpdir(), `${TAG}-e-yabanci`); // başka koşuya ait gibi duran dizin
    mkdirSync(foreign);
    created.push(path.basename(foreign));
    writeFileSync(path.join(foreign, OWNER_FILE), JSON.stringify({ runId: randomUUID() }));
    writeFileSync(path.join(foreign, "veri.txt"), "yabancı");
    const [pA, pB] = [await freePort(), await freePort()];
    const [A, B] = await Promise.all([startTestDb(pA, `${TAG}-e`), startTestDb(pB, `${TAG}-e`)]);
    ok(A.runDir !== B.runDir && A.dataDir !== B.dataDir, "iki koşu ayrı dizinde", { A: A.runDir, B: B.runDir });
    const ddA = (await A.su.query(`select current_setting('data_directory') d`)).rows[0].d;
    const ddB = (await B.su.query(`select current_setting('data_directory') d`)).rows[0].d;
    ok(sameDataDir(ddA, A.dataDir) && sameDataDir(ddB, B.dataDir), "her istemci yalnız kendi sunucusuna bağlı (data_directory)");
    await A.su.query(`create table zz_izolasyon(x int); insert into zz_izolasyon values (1)`);
    const inB = (await B.su.query(`select to_regclass('public.zz_izolasyon') t`)).rows[0].t;
    ok(inB === null, "A'nın verisi B'de yok (ayrı küme)");
    const pmA = pmPidOf(A.dataDir);
    const pmB = pmPidOf(B.dataDir);
    await A.stop();
    ok(!existsSync(A.runDir) && !(await portOpen(pA)), "A durdu: A'nın dizini silindi, A'nın portu kapandı");
    ok(childrenOf(pmA).length === 0 && !pidAlive(pmA), "A'nın postmaster'ı ve çocuk süreçleri (io_worker…) kalmadı — yetim yok", childrenOf(pmA));
    const bAlive = (await B.su.query(`select count(*)::int n from public.users`)).rows[0].n;
    ok(typeof bAlive === "number" && existsSync(B.dataDir) && (await portOpen(pB)), "B, A durduktan sonra çalışmaya devam ediyor (dizin + port + sorgu)");
    ok(existsSync(path.join(foreign, "veri.txt")) && existsSync(path.join(legacy, "baska-kosu.txt")), "yabancı / eski klasörler yerinde");

    // ── P) Port başka koşudayken ───────────────────────────────────────────────────────────────────────────
    console.log("\n[P] Dolu port: yeni koşu başkasının sunucusuna dokunmaz");
    await B.su.query(`create table zz_b(x int); insert into zz_b values (7)`);
    const before = own([path.basename(legacy), path.basename(foreign)]);
    let err = "";
    try {
      const C = await startTestDb(pB, `${TAG}-e`);
      await C.stop();
    } catch (e) {
      err = String((e as Error)?.message ?? e ?? "red");
    }
    ok(err !== "", "B'nin portunda ikinci koşu BAŞLAMAZ (hata verir)", err);
    const bAfter = (await B.su.query(`select x from zz_b`)).rows;
    const roles = (await B.su.query(`select count(*)::int n from pg_roles where rolname in ('anon','authenticated','service_role')`)).rows[0].n;
    ok(bAfter.length === 1 && bAfter[0].x === 7 && roles === 3, "B'nin verisi ve şeması değişmedi (DDL çalışmadı)");
    ok(JSON.stringify(own([path.basename(legacy), path.basename(foreign)])) === JSON.stringify(before), "başarısız koşu kendi dizinini bırakmadı", { before, after: own([]) });
    await B.stop();
    ok(!existsSync(B.runDir) && !(await portOpen(pB)), "B durdu: dizin silindi, port kapandı");
    ok(childrenOf(pmB).length === 0 && !pidAlive(pmB), "B'nin postmaster'ı ve çocuk süreçleri kalmadı — yetim yok", childrenOf(pmB));

    // ── K) Postmaster dışarıdan bitti → stop() güvenli ─────────────────────────────────────────────────────
    console.log("\n[K] Postmaster dışarıdan bittiyse stop()");
    const pD = await freePort();
    const D = await startTestDb(pD, `${TAG}-k`);
    const pmPid = Number(readFileSync(path.join(D.dataDir, "postmaster.pid"), "utf8").split(/\r?\n/)[0]);
    // Deney: sunucu dışarıdan öldürülünce açık bağlantılar ECONNRESET üretir — bu deneyde beklenen, yok sayılır.
    D.su.on("error", () => undefined);
    D.pool.on("error", () => undefined);
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pmPid), "/t", "/f"], { stdio: "ignore" });
    else process.kill(pmPid, "SIGKILL");
    for (let i = 0; i < 50 && pidAlive(pmPid); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    ok(!pidAlive(pmPid), "kendi postmaster'ımız dışarıdan sonlandırıldı (deney kurulumu)");
    const t0 = Date.now();
    const stopped = await Promise.race([D.stop().then(() => "bitti"), new Promise((r) => setTimeout(() => r("ASKIDA"), 15_000))]);
    ok(stopped === "bitti" && Date.now() - t0 < 15_000, `stop() askıda kalmadı (${Date.now() - t0} ms; eski kod ölü süreci 'exit' için sonsuza dek bekler)`);
    ok(!existsSync(D.runDir), "stop(): kendi dizini silindi");

    // ── C) Yakalanmamış hata ile çıkış ─────────────────────────────────────────────────────────────────────
    console.log("\n[C] Alt süreç yakalanmamış hata ile çıkar");
    const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    const child: ChildProcess = spawn(process.execPath, [tsxCli, path.join("scripts", "uye-yonetimi-faz2", "testDb-izolasyon.harness.ts"), "--alt-cikis", `${TAG}-c`], {
      cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (b) => { out += String(b); });
    child.stderr?.on("data", (b) => { out += String(b); });
    const code = await new Promise<number | null>((r) => child.on("exit", (c) => r(c)));
    const m = /ALT (\{.*\})/.exec(out);
    const info = m ? (JSON.parse(m[1]) as { runDir: string; pid: number; port: number }) : null;
    await new Promise((r) => setTimeout(r, 800));
    ok(code !== 0 && !!info, "alt süreç hata ile çıktı", { code, out: out.slice(-300) });
    const km = /TESTDB CIKIS KANCASI (\{.*\})/.exec(out);
    const kanca = km ? (JSON.parse(km[1]) as { cocukCanli?: boolean; pgCtl?: boolean; kill?: boolean; dizin?: string }) : null;
    // embedded-postgres kendi `exit` dinleyicisinde postmaster'a eşzamansız SIGINT gönderir; bizim kanca ondan SONRA
    // çalışırsa postmaster'ı kapanış ortasında bulur ve dizin silme kapanış yazımlarıyla yarışır.
    ok(!!kanca && kanca.cocukCanli === true && (kanca.pgCtl === true || kanca.kill === true),
      "çıkış kancası kendi postmaster'ını canlı buldu ve dizini silmeden önce kendisi kapattı", kanca);
    ok(!!kanca && kanca.dizin === "silindi", "çıkış kancası: dizin silme sonucu bildirildi (silindi)", kanca);
    ok(!!info && !existsSync(info.runDir), "çıkış kancası: alt sürecin kendi dizini silindi", info);
    ok(!!info && !pidAlive(info.pid) && !(await portOpen(info.port)), "çıkış kancası: alt sürecin postmaster'ı kapandı (yetim yok)", info);
    ok(existsSync(path.join(foreign, "veri.txt")) && existsSync(path.join(legacy, "baska-kosu.txt")), "yabancı / eski klasörler hâlâ yerinde");
    ok(own([path.basename(legacy), path.basename(foreign)]).length === 0, "bu harness'ın açtığı test DB dizinlerinden hiçbiri kalmadı", own([]));
  } finally {
    // Yalnız harness'ın elle oluşturduğu tuzak dizinler (benzersiz TAG önekli) silinir.
    for (const n of created) {
      const p = path.join(os.tmpdir(), n);
      if (n.startsWith(TAG) && existsSync(p)) rmSync(p, { recursive: true, force: true });
    }
  }
  console.log(`\nTEST DB YALITIMI: PASS ${pass} · FAIL ${fail}`);
  if (fail) {
    console.log("Başarısız:", failures);
    process.exit(1);
  }
}

// ── Alt süreç kipi (C bölümü): DB başlat, durdurmadan yakalanmamış hata ile çık ────────────────────────────────
if (process.argv[2] === "--alt-cikis") {
  (async () => {
    const db = await startTestDb(await freePort(), process.argv[3]);
    const pid = Number(readFileSync(path.join(db.dataDir, "postmaster.pid"), "utf8").split(/\r?\n/)[0]);
    const port = Number(readFileSync(path.join(db.dataDir, "postmaster.pid"), "utf8").split(/\r?\n/)[3]);
    console.log(`ALT ${JSON.stringify({ runDir: db.runDir, pid, port })}`);
    setTimeout(() => { throw new Error("kasıtlı yakalanmamış hata (alt süreç)"); }, 50);
  })();
} else {
  void main();
}
