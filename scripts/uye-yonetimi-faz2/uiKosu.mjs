/**
 * UI yığını ↔ UI kontrolü — KOŞUYA ÖZGÜ yapılandırma ve ekran görüntüsü dizini (ortak; yalnız test altyapısı).
 *
 * Eskiden yığınlar yapılandırmayı `os.tmpdir()/<sabit ad>.json` dosyasına yazıyor, kontroller oradan okuyordu;
 * ekran görüntüleri de sabit bir dizine gidiyordu. Aynı testten iki koşu aynı anda çalışınca biri diğerinin
 * yapılandırmasını ve kanıtını eziyordu.
 *
 * Kurallar:
 *   - Yığın yapılandırmayı KENDİ koşu dizinine yazar (`<runDir>/ui-cfg.json`; test DB durunca dizinle birlikte
 *     silinir). Sabit ortak dosyaya YAZILMAZ. `<ÖNEK>_CFG` verilmişse ayrıca o yola yazılır (çağıranın dosyası).
 *   - Kontrol: `<ÖNEK>_CFG` varsa onu okur. Yoksa CANLI yığınları bulur (koşu dizini + sahiplik işareti +
 *     yapılandırma + shim gerçekten cevap veriyor). Tam bir tane varsa onu kullanır; birden fazlaysa durur ve
 *     yolları listeler (yanlış yığına bağlanmaz); hiç yoksa açıklayıcı hata verir.
 *   - Ekran görüntüsü dizini sahiplik işaretiyle (`.ui-kosu.json`, atomik oluşturma) alınır. Aynı dizin o anda
 *     CANLI başka bir koşuya aitse bu koşu kendi `kosu-*` alt dizinine yazar. İşaret koşu bitince bırakılır;
 *     ardışık koşular eskisi gibi aynı dizini kullanır.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const UI_CFG_FILE = "ui-cfg.json";
export const SHOTS_MARKER = ".ui-kosu.json";
const OWNER_FILE = ".yasam-testdb-sahip.json"; // testDbRun.ts ile aynı ad

/**
 * Yığın tarafı: yapılandırmayı koşu dizinine (ve istenirse `envPath`'e) yazar; kontrolün bulması için shim adresi
 * ve koşu bilgisi `__kosu` alanına eklenir. Okunacak yolu döner.
 * @param {{ runDir: string, shimUrl: string, cfg: Record<string, unknown>, envPath?: string }} o
 */
export function writeStackConfig({ runDir, shimUrl, cfg, envPath }) {
  const body = JSON.stringify({ ...cfg, __kosu: { runDir, shim: shimUrl, pid: process.pid, at: new Date().toISOString() } });
  const own = path.join(runDir, UI_CFG_FILE);
  writeFileSync(own, body, { flag: "wx" });
  if (envPath) writeFileSync(envPath, body);
  return envPath || own;
}

async function shimAlive(url) {
  if (typeof url !== "string" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) return false;
  try {
    const r = await fetch(`${url}/rest/v1/users?select=id&limit=1`, { signal: AbortSignal.timeout(3000) });
    return r.status === 200;
  } catch {
    return false;
  }
}

/** tmp tabanında, verilen öneklerle başlayan, sahiplik işaretli ve yapılandırması olan CANLI yığınlar. */
export async function liveStackConfigs(prefixes, base = os.tmpdir()) {
  const out = [];
  for (const name of readdirSync(base)) {
    if (!prefixes.some((p) => name.startsWith(p))) continue;
    const dir = path.join(base, name);
    const cfgPath = path.join(dir, UI_CFG_FILE);
    if (!existsSync(path.join(dir, OWNER_FILE)) || !existsSync(cfgPath)) continue;
    let cfg;
    try { cfg = JSON.parse(readFileSync(cfgPath, "utf8")); } catch { continue; }
    if (cfg?.__kosu?.runDir && path.resolve(cfg.__kosu.runDir) === path.resolve(dir) && (await shimAlive(cfg.__kosu.shim))) {
      out.push({ path: cfgPath, cfg });
    }
  }
  return out;
}

/**
 * Kontrol tarafı: hangi yığına bağlanılacağını belirler.
 * @param {{ envVar: string, prefixes: string[] }} o
 */
export async function resolveUiConfig({ envVar, prefixes }) {
  const env = process.env[envVar];
  if (env) return { path: env, cfg: JSON.parse(readFileSync(env, "utf8")), source: envVar };
  const live = await liveStackConfigs(prefixes);
  if (live.length === 1) return { ...live[0], source: "tek canlı yığın" };
  if (live.length > 1) {
    throw new Error(`Birden fazla canlı yığın var; ${envVar}=<yol> ile birini seçin:\n${live.map((l) => `  ${l.path}`).join("\n")}`);
  }
  throw new Error(`Çalışan yığın bulunamadı (önek: ${prefixes.join(", ")}). Önce ui-stack'i başlatın ya da ${envVar}=<yol> verin.`);
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code === "EPERM"; }
}

/**
 * Ekran görüntüsü dizinini bu koşu için sahiplenir. Dizin başka bir CANLI koşuya aitse `kosu-*` alt dizini
 * açılır (birbirini ezmez). PID yeniden kullanılmışsa yanlışlıkla "canlı" sayılabilir → alt dizine yazılır
 * (güvenli yön). İşaret, süreç çıkarken yalnız runId eşleşirse silinir.
 * @param {string} dir
 */
export function claimShotsDir(dir) {
  const runId = randomUUID();
  const mark = (d) => writeFileSync(path.join(d, SHOTS_MARKER), JSON.stringify({ runId, pid: process.pid, at: new Date().toISOString() }), { flag: "wx" });
  mkdirSync(dir, { recursive: true });
  let target = dir;
  try {
    mark(dir);
  } catch (e) {
    if (e?.code !== "EEXIST") throw e;
    let owner = null;
    try { owner = JSON.parse(readFileSync(path.join(dir, SHOTS_MARKER), "utf8")); } catch { /* bozuk işaret → canlı say */ }
    if (owner && !pidAlive(owner.pid)) {
      // Önceki koşu bitmiş ama işaretini bırakamamış: yerine geç (ardışık koşular aynı dizini kullanır).
      try { unlinkSync(path.join(dir, SHOTS_MARKER)); } catch { /* yarış: başka koşu aldıysa alt dizin */ }
      try { mark(dir); } catch { target = mkdtempSync(path.join(dir, "kosu-")); mark(target); }
    } else {
      target = mkdtempSync(path.join(dir, "kosu-"));
      mark(target);
    }
  }
  process.on("exit", () => {
    try {
      const m = JSON.parse(readFileSync(path.join(target, SHOTS_MARKER), "utf8"));
      if (m.runId === runId) unlinkSync(path.join(target, SHOTS_MARKER));
    } catch { /* yok */ }
  });
  return target;
}
