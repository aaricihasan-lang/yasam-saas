/**
 * BF-12B — Local-only CLI. Web endpoint YOK; browser'dan production backup YOK.
 *
 *   npm run yh:bf12b:fixture                          # sentetik backup + validate (temp/out)
 *   npm run yh:bf12b:validate  -- --backup-dir <p> --passphrase-file <f>
 *   npm run yh:bf12b:backup    -- --source fixture --out <p> --passphrase-file <f>
 *   npm run yh:bf12b:backup    -- --source production --execute ...   # AYRI ONAY KAPISI
 *
 * Default: fixture. `--source production` OLMADAN production'a ASLA bağlanmaz.
 * Passphrase yalnız --passphrase-file'dan; argv/log/process-list'e düşmez.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBackup } from "../../lib/yasam-hafizasi/backup/engine";
import { FixtureReader } from "../../lib/yasam-hafizasi/backup/reader";
import { FixtureStorage } from "../../lib/yasam-hafizasi/backup/storage";
import { validateArchive } from "../../lib/yasam-hafizasi/backup/validate";
import { assertPassphraseStrength } from "../../lib/yasam-hafizasi/backup/crypto";
import { findGitRoot } from "../../lib/yasam-hafizasi/backup/outputSafety";
import { createProductionPgReader } from "../../lib/yasam-hafizasi/backup/reader";
import { createSupabaseStorageReader } from "../../lib/yasam-hafizasi/backup/storage";
import { redactSecrets, resolveProductionDbConfig } from "../../lib/yasam-hafizasi/backup/prodConfig";
import { buildBaseDb, buildBaseStorage } from "./fixture";

function parseArgs(argv: string[]): { cmd: string; flags: Map<string, string>; bools: Set<string> } {
  const cmd = argv[0] && !argv[0].startsWith("-") ? argv[0] : "fixture";
  const rest = cmd === argv[0] ? argv.slice(1) : argv;
  const flags = new Map<string, string>();
  const bools = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      i++;
    } else {
      bools.add(key);
    }
  }
  return { cmd, flags, bools };
}

function readPassphrase(file: string | undefined): string {
  if (!file) throw new Error("--passphrase-file zorunludur (passphrase argv'de verilemez).");
  if (!existsSync(file)) throw new Error(`Passphrase dosyası yok: ${file}`);
  const pass = readFileSync(file, "utf8").trim();
  assertPassphraseStrength(pass);
  return pass;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function cmdFixture(flags: Map<string, string>): Promise<number> {
  const repoRoot = findGitRoot(process.cwd()) ?? process.cwd();
  const out = flags.get("out") ?? join(mkdtempSync(join(tmpdir(), "bf12b-fixture-")), "backup");
  const passFile = flags.get("passphrase-file");
  const passphrase = passFile ? readPassphrase(passFile) : "bf12b-fixture-passphrase-1234";
  const res = await runBackup({
    reader: new FixtureReader(buildBaseDb()),
    storage: new FixtureStorage(buildBaseStorage()),
    outputDir: out,
    passphrase,
    toolVersion: "bf12b-cli",
    originMainSha: "local",
    pageSize: 500,
    repoRoots: [repoRoot],
    now: nowIso(),
  });
  process.stdout.write(`fixture backup → ${res.finalDir}\ncomplete=${res.complete} validation.ok=${res.validation.ok}\n`);
  return res.complete && res.validation.ok ? 0 : 1;
}

function cmdValidate(flags: Map<string, string>): number {
  const dir = flags.get("backup-dir");
  if (!dir) throw new Error("--backup-dir zorunludur.");
  const passphrase = readPassphrase(flags.get("passphrase-file"));
  const rep = validateArchive({ backupDir: dir, passphrase });
  for (const c of rep.checks) process.stdout.write(`${c.ok ? "OK " : "XX "} ${c.name}: ${c.detail}\n`);
  process.stdout.write(`validation: ${rep.ok ? "PASS" : "FAIL"}\n`);
  return rep.ok ? 0 : 1;
}

async function cmdBackup(flags: Map<string, string>, bools: Set<string>): Promise<number> {
  const source = flags.get("source");
  if (source === "fixture") return cmdFixture(flags);

  if (source !== "production") {
    throw new Error("--source zorunludur (fixture | production). Bayraksız komut production'a BAĞLANMAZ.");
  }

  // ── Production yürütme kapısı (AYRI ONAY; bu kod fazında çalıştırılmaz) ──
  // Gerçek DB URL / service key CLI ARGÜMANI olarak alınmaz; yalnız env ADI.
  const resolved = resolveProductionDbConfig({
    dbUrlEnv: flags.get("db-url-env"),
    rawDbUrlProvided: flags.has("db-url") || bools.has("db-url"),
    supabaseUrl: flags.get("supabase-url"),
    serviceKeyEnv: flags.get("service-key-env"),
    passphraseFileProvided: flags.has("passphrase-file"),
    execute: bools.has("execute"),
    ack: bools.has("i-understand-production-read"),
    projectRef: flags.get("project-ref"),
    out: flags.get("out"),
    env: process.env,
  });
  if (!resolved.ok || !resolved.config) {
    // FAIL-CLOSED: production'a bağlanma, secret basma.
    throw new Error(
      "Production backup fail-closed (bağlantı KURULMADI):\n" +
        resolved.errors.map((e) => `  - ${e}`).join("\n") +
        "\nGerçek run AYRI açık onay kapısıdır.",
    );
  }
  const cfg = resolved.config;

  const passphrase = readPassphrase(flags.get("passphrase-file"));
  const repoRoot = findGitRoot(process.cwd()) ?? process.cwd();
  process.stdout.write(`[production] proje=${cfg.projectRef} → ${cfg.out} (gerçek okuma başlıyor)\n`);

  let reader;
  try {
    reader = await createProductionPgReader({
      connectionString: cfg.connectionString,
      expectedProjectRef: cfg.projectRef,
    });
  } catch (e) {
    throw new Error(`DB bağlantısı başarısız: ${redactSecrets(e instanceof Error ? e.message : String(e))}`);
  }
  try {
    const storage = await createSupabaseStorageReader({ url: cfg.supabaseUrl, serviceRoleKey: cfg.serviceRoleKey });
    const res = await runBackup({
      reader,
      storage,
      outputDir: cfg.out,
      passphrase,
      toolVersion: "bf12b-cli",
      originMainSha: flags.get("origin-sha") ?? "unknown",
      pageSize: Number(flags.get("page-size") ?? "1000") || 1000,
      repoRoots: [repoRoot],
      now: nowIso(),
    });
    process.stdout.write(`complete=${res.complete} validation.ok=${res.validation.ok} → ${res.finalDir}\n`);
    return res.complete && res.validation.ok ? 0 : 1;
  } catch (e) {
    throw new Error(redactSecrets(e instanceof Error ? e.message : String(e)));
  } finally {
    await reader.close();
  }
}

async function main(): Promise<void> {
  const { cmd, flags, bools } = parseArgs(process.argv.slice(2));
  let code = 0;
  if (cmd === "fixture") code = await cmdFixture(flags);
  else if (cmd === "validate") code = cmdValidate(flags);
  else if (cmd === "backup") code = await cmdBackup(flags, bools);
  else {
    process.stdout.write(`Bilinmeyen komut: ${cmd} (fixture | validate | backup)\n`);
    code = 2;
  }
  process.exit(code);
}

main().catch((e) => {
  process.stdout.write(`BF-12B CLI hata: ${redactSecrets(e instanceof Error ? e.message : String(e))}\n`);
  process.exit(1);
});
