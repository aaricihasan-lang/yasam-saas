/**
 * Test veritabanı koşusu — YALITIM ve SAHİPLİK yardımcıları (ortak; yalnız test altyapısı).
 *
 * Neden: eski startTestDb `os.tmpdir()/<sabit ad>` klasörünü açılışta koşulsuz siliyordu. Aynı adı kullanan
 * başka bir koşu (paralel Claude oturumu, aynı rastgele portu seçen ikinci harness) çalışırken onun veri
 * dizini silinebiliyordu. Ayrıca embedded-postgres `stop()` Windows'ta `taskkill /pid <pid> /t /f` çalıştırır:
 * postmaster önceden kapanmış ve PID başka sürece verilmişse YABANCI bir süreç ağacı öldürülebilirdi.
 *
 * Kurallar:
 *   - Her koşu `mkdtemp` ile KENDİNE ÖZGÜ bir dizin açar; önceden var olan hiçbir klasör silinmez.
 *   - Dizine runId taşıyan sahiplik işareti yazılır; temizlik yalnız işaret + konum + önek doğrulanınca yapılır.
 *   - Bağlanılan sunucunun `data_directory` değeri bu koşunun dizini değilse hiçbir DDL çalıştırılmaz.
 *   - Postmaster'a yalnız KENDİ çocuk süreç tutamacımız hâlâ canlıyken sinyal gönderilir (Windows'ta açık tutamaç
 *     varken PID yeniden atanamaz); süreç bitmişse PID'e hiçbir işlem yapılmaz.
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

export const OWNER_FILE = ".yasam-testdb-sahip.json";

export type RunDir = { runId: string; runDir: string; dataDir: string; prefix: string };

const norm = (p: string): string => {
  let r = path.resolve(p);
  try { r = realpathSync.native(r); } catch { /* yoksa olduğu gibi */ }
  return process.platform === "win32" ? r.replace(/\//g, "\\").toLowerCase() : r;
};

/** dirName'den güvenli önek; koşu dizini `<tmpdir>/<önek>-<rastgele>`; veri dizini onun `data` alt klasörü. */
export function createRunDir(dirName: string, port: number, base = os.tmpdir()): RunDir {
  const prefix = `${dirName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 60) || "testdb"}-`;
  const runDir = mkdtempSync(path.join(base, prefix));
  const runId = randomUUID();
  writeFileSync(
    path.join(runDir, OWNER_FILE),
    JSON.stringify({ runId, pid: process.pid, port, createdAt: new Date().toISOString(), dirName }),
    { flag: "wx" },
  );
  return { runId, runDir, dataDir: path.join(runDir, "data"), prefix };
}

/**
 * Koşu dizinini YALNIZ sahiplik doğrulanırsa siler: tmp tabanının doğrudan altında, beklenen önekle başlıyor,
 * işaret dosyası okunuyor ve runId eşleşiyor. Aksi hâlde hiçbir şey silinmez; neden döner.
 */
export function removeOwnRunDir(run: RunDir, base = os.tmpdir()): { removed: boolean; reason: string } {
  const dir = norm(run.runDir);
  if (path.dirname(dir) !== norm(base)) return { removed: false, reason: "tmp tabanının doğrudan altında değil" };
  if (!path.basename(dir).startsWith(process.platform === "win32" ? run.prefix.toLowerCase() : run.prefix)) {
    return { removed: false, reason: "önek eşleşmiyor" };
  }
  if (!existsSync(run.runDir)) return { removed: false, reason: "dizin yok" };
  let owner: { runId?: unknown };
  try { owner = JSON.parse(readFileSync(path.join(run.runDir, OWNER_FILE), "utf8")); } catch { return { removed: false, reason: "sahiplik işareti okunamadı" }; }
  if (owner.runId !== run.runId) return { removed: false, reason: "sahiplik işareti başka koşuya ait" };
  rmSync(run.runDir, { recursive: true, force: true });
  return { removed: !existsSync(run.runDir), reason: "kendi koşu dizini" };
}

/** Kendi çocuk sürecimiz hâlâ çalışıyor mu? (Bitmişse PID başka sürece verilmiş olabilir → sinyal YOK.) */
export function ownChildAlive(child: Pick<ChildProcess, "pid" | "exitCode" | "signalCode" | "killed"> | null | undefined): boolean {
  return !!child && typeof child.pid === "number" && child.exitCode === null && child.signalCode === null && !child.killed;
}

/** Bağlanılan sunucu bu koşunun veri dizinini mi kullanıyor? (Başka koşunun sunucusuna DDL çalıştırılmaz.) */
export function sameDataDir(serverDataDirectory: string, dataDir: string): boolean {
  return norm(serverDataDirectory) === norm(dataDir);
}

/** İşletim sisteminden boş TCP portu (sabit port yerine; paralel koşular çakışmaz). */
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const a = srv.address();
      const p = typeof a === "object" && a ? a.port : 0;
      srv.close(() => (p ? resolve(p) : reject(new Error("boş port alınamadı"))));
    });
  });
}

/** Senkron son çare: kendi canlı postmaster ağacımızı kapat (yalnız tutamaç canlıysa). Süreç çıkışında kullanılır. */
export function killOwnChildSync(child: ChildProcess | null | undefined): boolean {
  if (!ownChildAlive(child) || !child?.pid) return false;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  else child.kill("SIGINT");
  return true;
}

/**
 * Uzun ömürlü UI yığınları için güvenli kapanış: Ctrl+C / SIGTERM / SIGBREAK ya da (TESTDB_STDIN_KAPAT=1 iken)
 * stdin'in kapanması → kendi kaynaklarını sırayla kapatır (shim, kontrol ucu, test DB) ve çıkar. Windows'ta zorla
 * sonlandırmada (TerminateProcess) bu çalışmaz; o durumda startTestDb'nin `exit` kancası da çalışmaz ve kendi
 * dizini / postmaster'ı kalabilir — ama başka hiçbir koşunun kaynağına dokunulmaz.
 */
export function installStackShutdown(closers: Array<() => unknown>): void {
  let closing = false;
  const close = async (why: string) => {
    if (closing) return;
    closing = true;
    console.log(`UI STACK KAPANIYOR (${why})`);
    for (const c of closers) {
      try { await c(); } catch { /* sıradaki kaynağa geç */ }
    }
    console.log("UI STACK KAPANDI");
    process.exit(0);
  };
  for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"] as const) process.once(sig, () => void close(sig));
  if (process.env.TESTDB_STDIN_KAPAT === "1") {
    process.stdin.resume();
    process.stdin.once("end", () => void close("stdin kapandı"));
  }
}

/** Süreç kimliği = PID + oluşturulma zamanı (PID yeniden kullanılsa bile oluşturulma zamanı tutmaz). */
export type ProcStamp = { pid: number; created: string };

function winProcs(filter: string): ProcStamp[] {
  const ps = `Get-CimInstance Win32_Process -Filter "${filter}" | ForEach-Object { "$($_.ProcessId)|$($_.CreationDate.ToUniversalTime().ToString('o'))" }`;
  const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", windowsHide: true });
  return String(r.stdout ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [pid, created] = l.split("|");
    return { pid: Number(pid), created };
  }).filter((p) => Number.isInteger(p.pid) && p.pid > 0 && !!p.created);
}

/**
 * Postmaster'ın çocuk süreçlerinin (io_worker, arka plan işçileri…) PID + oluşturulma zamanı anlık görüntüsü.
 * Windows'ta postmaster kapatılınca bu çocuklar dinleme soketini miras aldıkları için portu açık tutarak
 * yetim kalabiliyor. Görüntü YALNIZ kendi canlı postmaster'ımızdan (açık tutamaç) alınır. Diğer platformlarda
 * çocuklar postmaster'ın ölümünü kendileri algılar → boş liste.
 */
export function ownChildStampsSync(postmaster: ChildProcess | null | undefined): ProcStamp[] {
  if (process.platform !== "win32" || !ownChildAlive(postmaster) || !postmaster?.pid) return [];
  return winProcs(`ParentProcessId=${postmaster.pid}`);
}

/** Görüntüdeki süreçlerden YALNIZ PID + oluşturulma zamanı hâlâ birebir eşleşenleri sonlandırır; sayısını döner. */
export function killStampedSync(stamps: ProcStamp[]): number {
  let n = 0;
  for (const s of stamps) {
    const now = winProcs(`ProcessId=${s.pid}`)[0];
    if (!now || now.created !== s.created) continue; // bitmiş ya da PID başka sürece verilmiş → dokunma
    spawnSync("taskkill", ["/pid", String(s.pid), "/f"], { stdio: "ignore", windowsHide: true });
    n++;
  }
  return n;
}

/**
 * Postgres'in KENDİ kapanış yolu: `pg_ctl stop -m fast -w` (postmaster'ın yanındaki pg_ctl). Kapanış kipindeki
 * postmaster yeni çocuk başlatmaz; çocuklar düzgün çıkar. `taskkill /t` ise yük altında bir io_worker'ı önce
 * öldürüp postmaster'ın yenisini başlatmasına yol açabiliyor (yeni çocuk ağaçta yok → yetim, port açık kalır).
 * pg_ctl yalnız BU koşunun veri dizinindeki postmaster.pid'i okur ve yalnız kendi canlı tutamacımız varken çağrılır
 * (o sırada PID yeniden atanamaz). Başarılıysa true.
 */
export function pgCtlStopSync(postmaster: ChildProcess | null | undefined, dataDir: string, timeoutSec = 20): boolean {
  if (!ownChildAlive(postmaster) || !postmaster?.spawnfile) return false;
  const exe = path.join(path.dirname(postmaster.spawnfile), process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");
  if (!existsSync(exe)) return false;
  const r = spawnSync(exe, ["stop", "-D", dataDir, "-m", "fast", "-w", "-t", String(timeoutSec)], { stdio: "ignore", windowsHide: true });
  return r.status === 0;
}

export type OwnedEmbeddedPg = {
  port: number;
  /** Bu koşuya özgü dizin (`<tmpdir>/<dirName>-<rastgele>`) ve içindeki veri dizini. */
  runDir: string;
  dataDir: string;
  stop: () => Promise<void>;
};

/**
 * Kendi DDL'ini kendisi kuran harness'lar (ör. üye yönetimi FAZ 1 db-contract / route-integration) için yalnız
 * embedded-postgres yaşam döngüsü — startTestDb ile AYNI sahiplik kuralları: koşuya özgü dizin + sahiplik işareti
 * (önceden var olan klasör silinmez), varsayılan boş port, bağlanılan sunucunun data_directory'si bu koşunun değilse
 * hata (çağıran DDL çalıştırmaz), kapanışta pg_ctl + yalnız PID ve oluşturulma zamanıyla doğrulanan kendi
 * çocuklarımız, son olarak yalnız kendi dizinimiz. Süreç beklenmedik biterse `exit` kancası aynı kuralları uygular.
 */
export async function startOwnedEmbeddedPg(dirName: string, opts: { port?: number; password?: string } = {}): Promise<OwnedEmbeddedPg> {
  const port = opts.port ?? (await freePort());
  const password = opts.password ?? "testpw";
  const run = createRunDir(dirName, port);
  const epg = new EmbeddedPostgres({
    databaseDir: run.dataDir, user: "postgres", password, port, persistent: false,
    initdbFlags: ["--locale=C", "--encoding=UTF8"],
  });
  const child = () => (epg as unknown as { process?: ChildProcess }).process;
  let stopped = false;
  const exitHook = () => {
    if (stopped) return;
    const stamps = ownChildStampsSync(child());
    if (!pgCtlStopSync(child(), run.dataDir)) killOwnChildSync(child());
    killStampedSync(stamps);
    try { removeOwnRunDir(run); } catch { /* son çare; başka hiçbir şeye dokunulmaz */ }
  };
  process.on("exit", exitHook);
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    process.off("exit", exitHook);
    if (ownChildAlive(child())) {
      const stamps = ownChildStampsSync(child());
      pgCtlStopSync(child(), run.dataDir);
      for (let i = 0; i < 50 && ownChildAlive(child()); i++) await new Promise((r) => setTimeout(r, 100));
      if (ownChildAlive(child())) await epg.stop().catch(() => undefined);
      else (epg as unknown as { process?: ChildProcess }).process = undefined;
      killStampedSync(stamps);
    } else {
      // Postmaster zaten bitmiş: PID başka bir sürece verilmiş olabilir → taskkill / sinyal GÖNDERİLMEZ. Yalnız
      // kendi (bitmiş) çocuğumuzun stdout/stderr borularını kapat: dışarıdan /t ile öldürülünce açık kalabiliyor ve
      // olay döngüsünü (harness'ın doğal çıkışını) askıda tutuyordu.
      const dead = child();
      dead?.stdout?.destroy();
      dead?.stderr?.destroy();
      (epg as unknown as { process?: ChildProcess }).process = undefined;
    }
    removeOwnRunDir(run);
  };
  try {
    await epg.initialise();
    await epg.start();
    const c = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password, database: "postgres" });
    await c.connect();
    try {
      const dd = String((await c.query(`select current_setting('data_directory') d`)).rows[0].d);
      if (!sameDataDir(dd, run.dataDir)) {
        throw new Error(`test DB sahiplik hatası: ${port} portundaki sunucu bu koşunun değil (${dd}); DDL çalıştırılmadı`);
      }
    } finally {
      await c.end().catch(() => undefined);
    }
  } catch (e) {
    await stop();
    throw e;
  }
  return { port, runDir: run.runDir, dataDir: run.dataDir, stop };
}
