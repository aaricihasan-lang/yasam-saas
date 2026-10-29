// GÖKYÜZÜ ATLASI — astro_horary_questions YEDEK + GERİ YÜKLEME doğrulaması. YALNIZ geçici, yalıtılmış PostgreSQL kümesi (initdb ile
// işletim sistemi geçici dizininde, 127.0.0.1 rastgele port; test sonunda durdurulur ve silinir). Production / staging / sistem
// PostgreSQL servisi KULLANILMAZ. Yalnız SENTETİK kayıtlar.
//
//   A) Tam veritabanı yedeği (Altın Yedek yolu): pg_dump -Fc → boş veritabanına pg_restore → satırlar birebir (özet), tetikleyiciler,
//      RLS, yetkiler, FK ON DELETE SET NULL (client_id), değişmezlik ve tavan geri yüklenen veritabanında da çalışır.
//   B) Tenant bazlı bağımsız Horary aracı (scripts/astrology/pg/horaryRecordsBackupCore.mjs): yalnız istenen tenant; birebir geri
//      yükleme; idempotent; kurcalanmış dosya / tenant uyuşmazlığı / çakışma → hiçbir satır yazılmaz; eksik danışan → NULL + rapor;
//      deneme modu yazmaz.
//
// PostgreSQL araçları: aynı ana sürümden initdb + pg_ctl + postgres + pg_dump + pg_restore. Sıra: HORARY_PG_BIN, Windows
// "C:/Program Files/PostgreSQL/<17..15>/bin", Linux "/usr/lib/postgresql/<17..15>/bin". Bulunamazsa FAIL (atlanmaz).
// Çalıştırma: node scripts/astrology/pg/horary-backup-restore.mjs
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { canonical, exportTenant, restoreTenant, sha256 } from "./horaryRecordsBackupCore.mjs";
import { decryptFileToJson, encryptJsonToFile } from "./horaryBackupCrypto.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIG = (f) => path.join(REPO, "supabase/migrations", f);
const SCHEMA = [
  path.join(REPO, "scripts/astrology/pg/astrology-fixture.sql"),
  path.join(REPO, "scripts/astrology/pg/astrology-7b-fixture.sql"),
  ...["000000_astrology_foundation", "000100_astrology_kb_analyses", "000200_astrology_timing_relationship", "000300_astrology_owner_isolation", "000400_astrology_client_list", "000500_astrology_profile_delete", "000600_astrology_record_caps"].map((f) => MIG(`20271101${f}.sql`)),
  MIG("20271210000000_astro_horary_questions.sql"),
];
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`;
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U1 = "c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7";
const U2 = "c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6";
const CA = "11111111-1111-4111-8111-111111111111";
const exe = process.platform === "win32" ? ".exe" : "";
const TOOLS = ["initdb", "pg_ctl", "postgres", "pg_dump", "pg_restore"];

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const watchdog = setTimeout(() => {
  console.error("FAIL horary-backup-restore: 6 dakikalık süre aşıldı — zorla çıkılıyor");
  process.exit(1);
}, 6 * 60_000);
watchdog.unref();

function findBin() {
  const cands = [process.env.HORARY_PG_BIN, ...[17, 16, 15].map((v) => `C:/Program Files/PostgreSQL/${v}/bin`), ...[17, 16, 15].map((v) => `/usr/lib/postgresql/${v}/bin`)].filter(Boolean);
  for (const d of cands) if (TOOLS.every((t) => fs.existsSync(path.join(d, t + exe)))) return d;
  return null;
}
async function freePort() {
  for (let i = 0; i < 50; i++) {
    const p = 56000 + Math.floor(Math.random() * 3000);
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once("error", () => res(false));
      s.listen(p, "127.0.0.1", () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error("boş port yok");
}

const BIN = findBin();
if (!BIN) {
  console.log("FAIL horary-backup-restore: aynı sürümden initdb/pg_ctl/postgres/pg_dump/pg_restore bulunamadı (HORARY_PG_BIN ile verin)");
  process.exit(1);
}
const tool = (t) => path.join(BIN, t + exe);
const version = execFileSync(tool("postgres"), ["--version"], { encoding: "utf8" }).trim();
const work = fs.mkdtempSync(path.join(os.tmpdir(), "astro-horary-backup-"));
const dataDir = path.join(work, "data");
const dumpFile = path.join(work, "full.dump");
const port = await freePort();
const conn = (db) => {
  const c = new pg.Client({ host: "127.0.0.1", port, user: "postgres", database: db });
  c.on("error", () => {});
  return c;
};
let started = false;
const opened = [];
const open = async (db) => {
  const c = conn(db);
  await c.connect();
  opened.push(c);
  return c;
};
const rowsHash = async (c, where = "true", params = []) =>
  (await c.query(`SELECT count(*)::int n, md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY id), '')) h FROM public.astro_horary_questions t WHERE ${where}`, params)).rows[0];
const SNAP = (n) => ({ chart: { cusps: Array.from({ length: 12 }, (_, i) => 12.345678901234 + i * 29.987654321 + n), planets: [{ planet: "saturn", lon: 333.123456789, retrograde: false }] }, significators: { querent: "saturn", quesited: "sun" }, note: "Türkçe ğüşıöç İ — ☉☽♄", n });
const INS = `INSERT INTO public.astro_horary_questions (tenant_id, owner_user_id, client_id, title, question_text, question_local_date, question_local_time, timezone, utc_offset_seconds, dst_choice, question_utc, location_id, location_label, latitude, longitude, quesited_house, school, methodology_version, orb_variant, snapshot_schema, result_snapshot, is_demo, save_request_id)
  VALUES ($1,$2,$3,$4,$5,'2026-10-29','14:30','Europe/Istanbul',10800,'auto','2026-10-29T11:30:00Z','tr-34-istanbul','İstanbul, Türkiye',41.0082,28.9784,$6,'lilly_1647','lilly-1647@horary-western-2026-10-29','lilly_ca107_primary',1,$7::jsonb,$8,gen_random_uuid())`;
async function schema(c) {
  await c.query(BOOT);
  for (const f of SCHEMA) await c.query(fs.readFileSync(f, "utf8"));
  // Supabase'de service_role public.clients'ı okuyabilir (fixture bu yetkiyi kurmaz → üretimdeki durumu taklit).
  await c.query("GRANT SELECT ON public.clients TO service_role");
}

try {
  execFileSync(tool("initdb"), ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C"], { stdio: "ignore" });
  // Debian/Ubuntu derlemeleri Unix soketini /var/run/postgresql'e açar (CI kullanıcısı yazamaz) → soket geçici dizinde.
  const sock = process.platform === "win32" ? "" : ` -c unix_socket_directories=${work}`;
  try {
    execFileSync(tool("pg_ctl"), ["-D", dataDir, "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c max_connections=30${sock}`, "-l", path.join(work, "pg.log"), "-w", "start"], { stdio: "ignore" });
  } catch (e) {
    const log = fs.existsSync(path.join(work, "pg.log")) ? fs.readFileSync(path.join(work, "pg.log"), "utf8").split("\n").slice(-8).join(" | ") : "";
    throw new Error(`geçici küme başlatılamadı: ${log || e.message}`);
  }
  started = true;
  console.log(`bilgi: ${version} · geçici küme ${work} · port ${port}`);
  const admin = await open("postgres");
  for (const db of ["horary_src", "horary_full_restore", "horary_tool_restore", "horary_tool_noclient"]) await admin.query(`CREATE DATABASE ${db}`);

  // ── Kaynak: şema + sentetik kayıtlar ──
  const src = await open("horary_src");
  await schema(src);
  await src.query("BEGIN; SET LOCAL ROLE service_role;");
  await src.query(INS, [TA, U1, CA, "Danışanlı, soru metni AÇIK izinle", "Bu ortaklık teklifi gerçekleşir mi?", 7, JSON.stringify(SNAP(1)), false]);
  await src.query(INS, [TA, U1, null, "Danışansız, soru metni yok", null, 10, JSON.stringify(SNAP(2)), false]);
  await src.query(INS, [TA, U1, null, "DEMO kaydı", null, 7, JSON.stringify(SNAP(3)), true]);
  await src.query(INS, [TA, U2, null, "Meslektaşın kaydı", "Başka uzmanın sorusu", 4, JSON.stringify(SNAP(4)), false]);
  await src.query(INS, [TB, U2, null, "Başka tenant", null, 2, JSON.stringify(SNAP(5)), false]);
  await src.query("COMMIT");
  const srcAll = await rowsHash(src);
  const srcA = await rowsHash(src, "tenant_id = $1", [TA]);
  check("H-B0 kaynak: 5 sentetik kayıt (A tenant 4, iki uzman; B tenant 1)", srcAll.n === 5 && srcA.n === 4);

  // ── A) Tam veritabanı yedeği: pg_dump → pg_restore ──
  execFileSync(tool("pg_dump"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-Fc", "-d", "horary_src", "-f", dumpFile], { stdio: "ignore" });
  let restoreErr = null;
  try {
    execFileSync(tool("pg_restore"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "--exit-on-error", "-d", "horary_full_restore", dumpFile], { stdio: "pipe" });
  } catch (e) {
    restoreErr = String(e.stderr ?? e.message).split("\n").slice(0, 3).join(" ");
  }
  check("H-A1 pg_dump -Fc → pg_restore --exit-on-error hatasız", restoreErr === null, restoreErr ?? "");
  const full = await open("horary_full_restore");
  const fullAll = await rowsHash(full);
  check("H-A2 geri yüklenen tüm Horary satırları birebir (sayı + satır özeti: tenant, uzman, danışan, soru metni, anlık görüntü, zamanlar)", fullAll.n === srcAll.n && fullAll.h === srcAll.h, `${fullAll.n}/${srcAll.n}`);
  const meta = (await full.query(`SELECT
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.astro_horary_questions'::regclass) rls,
      (SELECT count(*)::int FROM pg_trigger WHERE tgrelid='public.astro_horary_questions'::regclass AND tgname IN ('trg_astro_horary_questions_guard','trg_astro_cap_horary') AND NOT tgisinternal) trg,
      has_table_privilege('anon','public.astro_horary_questions','SELECT') anon_s,
      has_table_privilege('service_role','public.astro_horary_questions','DELETE') sr_d,
      has_column_privilege('service_role','public.astro_horary_questions','result_snapshot','UPDATE') sr_u_snap,
      has_column_privilege('service_role','public.astro_horary_questions','title','UPDATE') sr_u_title,
      (SELECT confdeltype FROM pg_constraint WHERE conname='astro_hq_client_fk') fkdel`)).rows[0];
  check("H-A3 geri yüklemede RLS, değişmezlik + tavan tetikleyicileri, yetkiler ve FK SET NULL korunur", meta.rls === true && meta.trg === 2 && !meta.anon_s && !meta.sr_d && !meta.sr_u_snap && meta.sr_u_title && meta.fkdel === "n", JSON.stringify(meta));
  let imm = "";
  try {
    await full.query("UPDATE public.astro_horary_questions SET result_snapshot = '{\"x\":1}'::jsonb WHERE title = 'Danışansız, soru metni yok'");
  } catch (e) {
    imm = String(e.message);
  }
  check("H-A4 geri yüklenen veritabanında sonuç görüntüsü DEĞİŞTİRİLEMEZ", /ASTRO_HORARY_IMMUTABLE/.test(imm), imm.slice(0, 60));
  await full.query("DELETE FROM public.clients WHERE id = $1", [CA]);
  const afterCli = (await full.query("SELECT client_id, question_text FROM public.astro_horary_questions WHERE title = 'Danışanlı, soru metni AÇIK izinle'")).rows[0];
  check("H-A5 geri yüklenen veritabanında danışan silinince kayıt korunur, client_id NULL; soru metni aynı", afterCli && afterCli.client_id === null && afterCli.question_text === "Bu ortaklık teklifi gerçekleşir mi?");

  // ── B) Tenant bazlı bağımsız Horary aracı ──
  const exported = JSON.parse(JSON.stringify(await exportTenant(src, TA)));
  check("H-B1 dışa aktarma yalnız A tenant'ı (4 kayıt; B tenant kaydı YOK), satır özetleri + manifest", exported.count === 4 && exported.records.every((r) => r.row.tenant_id === TA && /^[0-9a-f]{64}$/.test(r.sha256)) && /^[0-9a-f]{64}$/.test(exported.manifest));
  const dst = await open("horary_tool_restore");
  await schema(dst);
  const dry = await restoreTenant(dst, exported, TA, { dryRun: true });
  check("H-B2 deneme modu (dry-run) hiçbir satır yazmaz", dry.inserted === 4 && (await rowsHash(dst)).n === 0);
  const r1 = await restoreTenant(dst, exported, TA);
  const dstA = await rowsHash(dst, "tenant_id = $1", [TA]);
  check("H-B3 geri yükleme A tenant'ını BİREBİR getirir (kimlik, uzman, danışan, soru metni NULL/metin, anlık görüntü, zamanlar)", r1.inserted === 4 && dstA.n === srcA.n && dstA.h === srcA.h && (await rowsHash(dst)).n === 4, `eklenen ${r1.inserted}`);
  const qt = (await dst.query("SELECT title, question_text FROM public.astro_horary_questions ORDER BY title")).rows;
  check("H-B4 soru metni izinleri korunur: yalnız açık izinli 2 kayıtta metin var, diğerleri NULL", qt.filter((x) => x.question_text !== null).length === 2 && qt.find((x) => x.title === "Danışansız, soru metni yok").question_text === null);
  const snapEq = (await dst.query("SELECT result_snapshot FROM public.astro_horary_questions WHERE title='DEMO kaydı'")).rows[0].result_snapshot;
  check("H-B5 anlık görüntü bayt düzeyinde aynı (kanonik JSON; ondalık hassasiyet + Türkçe + glif)", canonical(snapEq) === canonical(SNAP(3)));
  const r2 = await restoreTenant(dst, exported, TA);
  check("H-B6 ikinci geri yükleme idempotent (0 eklenen, 4 aynı)", r2.inserted === 0 && r2.skippedIdentical === 4 && (await rowsHash(dst)).n === 4);
  const tampered = JSON.parse(JSON.stringify(exported));
  tampered.records[0].row.result_snapshot.chart.cusps[0] = 1;
  let tErr = "";
  try {
    await restoreTenant(dst, tampered, TA);
  } catch (e) {
    tErr = e.message;
  }
  check("H-B7 kurcalanmış dosya (anlık görüntü değişmiş) → HORARY_BACKUP_ROW_HASH, yazım yok", tErr === "HORARY_BACKUP_ROW_HASH" && (await rowsHash(dst)).n === 4, tErr);
  let mErr = "";
  try {
    await restoreTenant(dst, exported, TB);
  } catch (e) {
    mErr = e.message;
  }
  check("H-B8 başka tenant'a geri yükleme → HORARY_BACKUP_TENANT_MISMATCH", mErr === "HORARY_BACKUP_TENANT_MISMATCH", mErr);
  await dst.query("UPDATE public.astro_horary_questions SET title = 'Hedefte değiştirildi' WHERE title = 'Meslektaşın kaydı'");
  // Kaynakta YENİ bir kayıt + hedefte çakışan kayıt: geri yükleme tümüyle geri alınmalı (yeni kayıt da yazılmamalı).
  await src.query("BEGIN; SET LOCAL ROLE service_role;");
  await src.query(INS, [TA, U1, null, "Kaynakta yeni kayıt", null, 11, JSON.stringify(SNAP(6)), false]);
  await src.query("COMMIT");
  const withNew = JSON.parse(JSON.stringify(await exportTenant(src, TA)));
  // Yeni kaydı dosyanın BAŞINA al (manifest yeniden hesaplanır): önce yeni kayıt EKLENİR, sonra çakışma → gerçek geri alma sınanır.
  withNew.records.unshift(withNew.records.splice(withNew.records.findIndex((r) => r.row.title === "Kaynakta yeni kayıt"), 1)[0]);
  withNew.manifest = sha256(withNew.records.map((r) => r.sha256).join("\n"));
  let cErr = "";
  try {
    await restoreTenant(dst, withNew, TA);
  } catch (e) {
    cErr = e.message;
  }
  const afterConflict = (await dst.query("SELECT count(*)::int n, count(*) FILTER (WHERE title='Hedefte değiştirildi')::int changed, count(*) FILTER (WHERE title='Kaynakta yeni kayıt')::int fresh FROM public.astro_horary_questions")).rows[0];
  check("H-B9 hedefte farklı içerikli aynı kimlik → HORARY_BACKUP_CONFLICT, sessiz üzerine yazma YOK, dosyadaki YENİ kayıt da yazılmaz (tümü geri alınır)", /^HORARY_BACKUP_CONFLICT:/.test(cErr) && withNew.count === 5 && afterConflict.n === 4 && afterConflict.changed === 1 && afterConflict.fresh === 0, `${cErr} · ${JSON.stringify(afterConflict)}`);
  const nc = await open("horary_tool_noclient");
  await schema(nc);
  await nc.query("DELETE FROM public.clients WHERE id = $1", [CA]);
  const r3 = await restoreTenant(nc, exported, TA);
  const ncRow = (await nc.query("SELECT client_id FROM public.astro_horary_questions WHERE title = 'Danışanlı, soru metni AÇIK izinle'")).rows[0];
  check("H-B10 hedefte danışan yoksa kayıt korunur, client_id NULL, raporlanır", r3.inserted === 4 && r3.clientNulled.length === 1 && ncRow.client_id === null);
  const r4 = await restoreTenant(nc, exported, TA);
  check("H-B11 danışanı boşaltılmış kayıtla yeniden geri yükleme de idempotent (çakışma sayılmaz)", r4.inserted === 0 && r4.skippedIdentical === 4);
  let ni = "";
  try {
    await nc.query("UPDATE public.astro_horary_questions SET question_text = 'x' WHERE title = 'Danışansız, soru metni yok'");
  } catch (e) {
    ni = e.message;
  }
  check("H-B12 araçla geri yüklenen kayıtta da değişmezlik tetikleyicisi çalışır", /ASTRO_HORARY_IMMUTABLE/.test(ni));

  // ── C) Şifreli dosya (GPG AES-256): düz metin diske yazılmaz ──
  const passFile = path.join(work, "pass.key");
  fs.writeFileSync(passFile, `sentetik-test-parolasi-${process.pid}`, { mode: 0o600 });
  const wrongPass = path.join(work, "wrong.key");
  fs.writeFileSync(wrongPass, "yanlis", { mode: 0o600 });
  const enc = path.join(work, "horary-A.json.gpg");
  encryptJsonToFile(await exportTenant(src, TA), enc, passFile);
  const raw = fs.readFileSync(enc);
  check("H-C1 şifreli dosyada soru metni / başlık / tenant DÜZ METİN olarak yok; düz JSON yazılmadı", !raw.includes(Buffer.from("ortaklık teklifi")) && !raw.includes(Buffer.from("Danışanlı")) && !raw.includes(Buffer.from(TA)) && fs.readdirSync(work).filter((f) => f.endsWith(".json")).length === 0);
  let wp = "";
  try {
    decryptFileToJson(enc, wrongPass);
  } catch (e) {
    wp = e.message;
  }
  check("H-C2 yanlış parola → HORARY_BACKUP_DECRYPT_FAILED", wp === "HORARY_BACKUP_DECRYPT_FAILED", wp);
  await admin.query("CREATE DATABASE horary_enc_restore");
  const er = await open("horary_enc_restore");
  await schema(er);
  const rr = await restoreTenant(er, decryptFileToJson(enc, passFile), TA);
  const erA = await rowsHash(er, "tenant_id = $1", [TA]);
  const srcA2 = await rowsHash(src, "tenant_id = $1", [TA]);
  check("H-C3 şifreli dosyadan geri yükleme birebir (satır özeti)", rr.inserted === srcA2.n && erA.h === srcA2.h, `eklenen ${rr.inserted}`);
  let ov = "";
  let ng = "";
  try {
    encryptJsonToFile({}, enc, passFile);
  } catch (e) {
    ov = e.message;
  }
  try {
    encryptJsonToFile({}, path.join(work, "x.json"), passFile);
  } catch (e) {
    ng = e.message;
  }
  check("H-C4 var olan dosyanın üzerine yazılmaz; .gpg dışı çıktı reddedilir", ov === "HORARY_BACKUP_OUT_EXISTS" && ng === "HORARY_BACKUP_OUT_NOT_GPG", `${ov} / ${ng}`);
} catch (e) {
  fail++;
  console.log(`FAIL horary-backup-restore: beklenmeyen hata — ${String(e?.message ?? e).slice(0, 300)}`);
} finally {
  await Promise.all(opened.map((c) => c.end().catch(() => {})));
  if (started) {
    try {
      execFileSync(tool("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"], { stdio: "ignore" });
    } catch {}
  }
  fs.rmSync(work, { recursive: true, force: true });
}
console.log(`\nastrology horary-backup-restore (PostgreSQL) harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
