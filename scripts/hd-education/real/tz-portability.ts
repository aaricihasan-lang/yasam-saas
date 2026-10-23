/**
 * TAŞINABİLİRLİK (saat dilimi) testi — GERÇEK snapshot paketleri, YALNIZ izole yerel embedded-postgres, sağlayıcı çağrısı YOK.
 * Bir süreç = bir saat dilimi: hem Node süreci (process.env.TZ) hem PostgreSQL oturumu (SET TIME ZONE) `--tz` değerine ayarlanır.
 *   1) Orijinal paketten 12/12 geri yükleme (v1 + v2; eski dosyalar DEĞİŞTİRİLMEZ) + ikinci yükleme 0 mükerrer + BodyGraph alanları.
 *   2) Aktarım SQL'i (verilirse, SHA doğrulamalı; dosyanın kendisi değişmez) ayrı DB'de 12/12 + ikinci çalıştırma 0 mükerrer.
 *   3) Olumsuz: yanlış UTC · yanlış kişi ID · yanlış natural_key · yanlış revizyon · belirsiz UTC biçimi · bozuk dosya SHA →
 *      RED (geçici kopyalar; orijinal paket okunur, yazılmaz).
 *   4) v3 (yeni biçim) dışa aktarım → `--out-dir/v3-<tz>`; `--v3-in <klasör>` verilirse BAŞKA TZ'de üretilmiş v3 paketleri geri yüklenir.
 * Çalıştır: npx tsx scripts/hd-education/real/tz-portability.ts --tz <IANA> --import <sql> --local-key <sql> --owner <uuid> --pkg <paket>
 *           --out-dir <repo-dışı klasör> [--transfer-sql <sql>] [--v3-in <klasör>] [--port <n>]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type pg from "pg";

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
const TZ = arg("--tz");
if (!TZ) throw new Error("--tz zorunlu");
process.env.TZ = TZ;   // Date / String(Date) bu andan itibaren bu saat dilimini kullanır
const IMPORT = arg("--import"), LOCALKEY = arg("--local-key"), OWNER = arg("--owner"), PKG = arg("--pkg"), OUT = arg("--out-dir"), XFER = arg("--transfer-sql"), V3IN = arg("--v3-in");
if (!IMPORT || !LOCALKEY || !OWNER || !PKG || !OUT) throw new Error("--import --local-key --owner --pkg --out-dir zorunlu");
if (path.resolve(OUT).toLowerCase().startsWith(process.cwd().toLowerCase())) throw new Error("çıktı repo İÇİNDE olamaz (gerçek kişi verisi)");
const tag = TZ.replace(/[^A-Za-z0-9]+/g, "_");
let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; fails.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 400)}` : ""}`); } };
const section = (s: string) => console.log(`\n[${TZ}] ${s}`);
const ROOT = process.cwd();
const MIGS = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql", "20271113000000_hd_education_chart_provider_body.sql"]
  .filter((f, i) => i < 2 || existsSync(path.join(ROOT, "supabase/migrations", f)));
type Man = { file: string; sha256: string; natural_key: string };
const readMan = (dir: string): Man[] => readFileSync(path.join(dir, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Man);
let port = Number(arg("--port") || 54801);

async function main() {
  const { startAnamnezTestEnv } = await import("../../anamnez/testEnv");
  const io = await import("./snapshot-io");
  const { buildTransferSql } = await import("./snapshot-sql");
  const boot = async () => {
    const env = await startAnamnezTestEnv({ port: port++, dirName: `hd-edu-tz-${tag}-${Date.now()}-${randomUUID().slice(0, 8)}`, rpcAllow: [],
      extraSql: [`create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid, target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`,
        ...MIGS.map((f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"))] });
    await env.su.query(`set time zone '${TZ.replace(/'/g, "")}'`);
    const tenant = randomUUID();
    await env.su.query(`insert into public.tenants(id, name) values ($1,'ZZ yerel owner')`, [tenant]);
    await env.su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, package_type, plan, admin_level)
                        values ($1,'Yerel Owner (test)','owner.local@example.test','admin',true,'approved',true,$2,'premium','premium','owner')`, [OWNER, tenant]);
    await env.su.query(readFileSync(LOCALKEY, "utf8"));
    await env.su.query(readFileSync(IMPORT, "utf8"));
    return env;
  };
  const charts = async (su: pg.Client) => Number((await su.query(`select count(*)::int n from public.hd_education_charts`)).rows[0].n);
  const manifest = readMan(PKG);
  const envs: Array<{ stop: () => Promise<void> }> = [];
  try {
    section(`süreç TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone} · örnek String(Date)=${String(new Date("1869-11-22T02:50:39Z"))}`);
    const e1 = await boot(); envs.push(e1); const su = e1.su;
    ok((await su.query("show timezone")).rows[0].TimeZone === TZ, `PostgreSQL oturum saat dilimi = ${TZ}`);
    const legacy: Record<string, number> = {};
    const r1: string[] = [];
    for (const m of manifest) r1.push(await io.restoreSnapshotFile(su, path.join(PKG, "snapshots", m.file), m.sha256, (e) => { legacy[e.legacyFingerprint] = (legacy[e.legacyFingerprint] ?? 0) + 1; }));
    ok(r1.every((r) => r === "RESTORED") && (await charts(su)) === manifest.length, `orijinal paket (v1 ${manifest.filter((m) => /\.v\d+\.json$/.test(m.file)).length}): ${r1.filter((r) => r === "RESTORED").length}/${manifest.length} RESTORED`, r1);
    console.log(`  · eski parmak izi bu ortamda: ${JSON.stringify(legacy)}`);
    const r2 = await Promise.all(manifest.map((m) => io.restoreSnapshotFile(su, path.join(PKG, "snapshots", m.file), m.sha256)));
    ok(r2.every((r) => r === "ALREADY_PRESENT") && (await charts(su)) === manifest.length, "ikinci yükleme: 12/12 ALREADY_PRESENT, 0 mükerrer");
    let gatesOk = 0;
    for (const m of manifest) {
      const p = JSON.parse(readFileSync(path.join(PKG, "snapshots", m.file), "utf8")) as { chart: { id: string; provider_raw: { type: string; gates: Array<{ gate: number }>; channels: unknown[] } } };
      const db = (await su.query(`select provider_raw from public.hd_education_charts where id=$1`, [p.chart.id])).rows[0]?.provider_raw as typeof p.chart.provider_raw | undefined;
      const g = (x?: { gates: Array<{ gate: number }> }) => JSON.stringify([...new Set((x?.gates ?? []).map((q) => q.gate))].sort((a, b) => a - b));
      if (db && db.type === p.chart.provider_raw.type && g(db) === g(p.chart.provider_raw) && JSON.stringify(db.channels) === JSON.stringify(p.chart.provider_raw.channels)) gatesOk++;
    }
    ok(gatesOk === manifest.length, `BodyGraph tip/kapı/kanal: ${gatesOk}/${manifest.length} paketle aynı`);

    section("olumsuz senaryolar (geçici kopyalar; orijinal okunur)");
    const tmp = path.join(os.tmpdir(), `hd-edu-tz-neg-${tag}-${randomUUID().slice(0, 8)}`);
    cpSync(PKG, tmp, { recursive: true });
    const neg = async (label: string, idx: number, mutate: (o: Record<string, unknown>) => void, expect: RegExp, keepSha = false) => {
      const m = manifest[idx]; const f = path.join(tmp, "snapshots", m.file);
      const o = JSON.parse(readFileSync(path.join(PKG, "snapshots", m.file), "utf8")) as Record<string, unknown>;
      mutate(o);
      const txt = JSON.stringify(o, null, 2); writeFileSync(f, txt);
      const r = await io.restoreSnapshotFile(su, f, keepSha ? m.sha256 : io.sha256(txt));
      ok(expect.test(r), `${label} (${m.natural_key}) → ${r}`, r);
    };
    const subj = (o: Record<string, unknown>) => o.subject as Record<string, unknown>;
    const other = (await su.query(`select id, natural_key from public.hd_education_subjects where natural_key <> all($1::text[]) order by natural_key limit 1`, [manifest.map((m) => m.natural_key)])).rows[0] as { id: string; natural_key: string };
    await neg("yanlış UTC (+1 sn)", 0, (o) => { subj(o).birth_utc = new Date(Date.parse(String(subj(o).birth_utc)) + 1000).toISOString(); }, /^REJECTED:EVIDENCE_CHANGED$/);
    await neg("yanlış kişi ID", 1, (o) => { subj(o).id = other.id; (o.chart as Record<string, unknown>).subject_id = other.id; }, /^REJECTED:(NATURAL_KEY|EVIDENCE_CHANGED)$/);
    await neg("yanlış natural_key", 2, (o) => { subj(o).natural_key = other.natural_key; }, /^REJECTED:NATURAL_KEY$/);
    await neg("belirsiz UTC biçimi (Z yok)", 3, (o) => { subj(o).birth_utc = String(subj(o).birth_utc).replace("T", " ").replace(/\.\d+Z$/, ""); }, /^REJECTED:EVIDENCE_AMBIGUOUS$/);
    await neg("yanlış koordinat", 4, (o) => { subj(o).latitude = "1.000000"; }, /^REJECTED:EVIDENCE_CHANGED$/);
    await neg("bozuk dosya SHA (manifest değeri)", 5, (o) => { subj(o).display_name = `${String(subj(o).display_name)} `; }, /^REJECTED:FILE_SHA$/, true);
    // Eski parmak izi tek başına bozuk (alanlar doğru): üretildiği ortamda (Europe/Istanbul + Türkçe) RED; başka ortamda yeniden
    // üretilemez → karar dosya SHA + alan alan karşılaştırmaya kalır (kayıt zaten var → ALREADY_PRESENT). Bilinçli ve raporlanır.
    const home = Intl.DateTimeFormat().resolvedOptions().timeZone === io.LEGACY_EXPORT_TZ && /Türkiye/.test(String(new Date(Date.UTC(2026, 0, 1))));
    await neg(`eski parmak izi bozuk (${home ? "üretildiği ortam" : "başka ortam: yeniden üretilemez"})`, 7, (o) => { subj(o).evidence_fingerprint = "0".repeat(64); },
      home ? /^REJECTED:LEGACY_FINGERPRINT$/ : /^ALREADY_PRESENT$/);
    const victim = manifest[6];
    await su.query(`update public.hd_education_subjects set birth_place = coalesce(birth_place,'') || ' (zz)', revision = revision + 1 where natural_key=$1`, [victim.natural_key]);
    const rv = await io.restoreSnapshotFile(su, path.join(PKG, "snapshots", victim.file), victim.sha256);
    ok(rv === "REJECTED:REVISION", `yanlış revizyon (${victim.natural_key} DB revizyonu +1) → ${rv}`, rv);
    console.log(`  · geçici kopya: ${tmp}`);

    if (XFER) {
      section("aktarım SQL'i (dosya değiştirilmez; SHA doğrulanır)");
      const sql = readFileSync(XFER, "utf8"); const want = readFileSync(XFER + ".sha256", "utf8").split(/\s+/)[0];
      ok(io.sha256(sql) === want, `SQL SHA-256 = ${want.slice(0, 16)}…`);
      const e2 = await boot(); envs.push(e2);
      await e2.su.query(sql); const n1 = await charts(e2.su);
      await e2.su.query(sql); const n2 = await charts(e2.su);
      const imp = Number((await e2.su.query(`select count(*)::int n from public.hd_education_audit_events where actor_kind='import'`)).rows[0].n);
      ok(n1 === manifest.length && n2 === manifest.length && imp === manifest.length, `SQL: 1. çalıştırma ${n1}/${manifest.length}, 2. çalıştırma 0 yeni (toplam ${n2}, olay ${imp})`);
      const gen = buildTransferSql(PKG, (await io.bodyColumnCount(e2.su)) === 3 ? "with-body" : "legacy");
      await e2.su.query(gen.sql);
      ok((await charts(e2.su)) === manifest.length, "güncel üreticinin SQL'i aynı DB'de: 0 yeni (iki yol aynı satırları tanır)");
    }

    section("v3 (yeni biçim) dışa aktarım + başka TZ'den gelen v3");
    const v3dir = path.join(OUT, `v3-${tag}`);
    if (!existsSync(v3dir)) {
      mkdirSync(path.join(v3dir, "snapshots"), { recursive: true });
      const lines: string[] = [];
      for (const m of manifest) {
        const p = JSON.parse(readFileSync(path.join(PKG, "snapshots", m.file), "utf8")) as { format: string; chart: { id: string }; provider_body_text?: string };
        if (!io.hasProviderBody(p.format)) continue;   // v1 kökenli kayıtlarda HTTP gövdesi yok → v3'e DÖNÜŞTÜRÜLMEZ (v1 olarak kalır)
        const ex = await io.exportSnapshot(su, p.chart.id, p.provider_body_text ?? null);
        const pc = p.chart as unknown as Record<string, unknown>; const xc = (JSON.parse(ex.json) as { chart: Record<string, unknown> }).chart;
        ok(["design_instant_utc", "computed_at"].every((k) => Date.parse(String(xc[k])) === Date.parse(String(pc[k]))) && ex.productShaOk && ex.roundtripOk,
          `v3 dışa aktarım ${m.natural_key}: zaman alanları + ürün SHA + jsonb kanonik aynı`);
        writeFileSync(path.join(v3dir, "snapshots", m.file), ex.json, { flag: "wx" });
        lines.push(JSON.stringify({ file: m.file, sha256: io.sha256(ex.json), natural_key: m.natural_key, format: io.SNAPSHOT_FORMAT_V3 }));
      }
      writeFileSync(path.join(v3dir, "manifest.jsonl"), lines.join("\n") + "\n", { flag: "wx" });
      ok(lines.length === manifest.filter((m) => io.hasProviderBody(JSON.parse(readFileSync(path.join(PKG, "snapshots", m.file), "utf8")).format)).length, `v3 paket üretildi: ${lines.length} (yalnız gövdeli kayıtlar) → ${v3dir}`);
    }
    if (V3IN) {
      const vm = readMan(V3IN);
      const e3 = await boot(); envs.push(e3);
      const r = await Promise.all(vm.map((m) => io.restoreSnapshotFile(e3.su, path.join(V3IN, "snapshots", m.file), m.sha256)));
      const fpv: string[] = [];
      for (const m of vm) await io.restoreSnapshotFile(e3.su, path.join(V3IN, "snapshots", m.file), m.sha256, (e) => fpv.push(e.v2Fingerprint));
      ok(r.every((x) => x === "RESTORED") && fpv.every((x) => x === "verified"), `başka TZ'de üretilmiş v3 (${path.basename(V3IN)}): ${r.filter((x) => x === "RESTORED").length}/${vm.length} RESTORED, parmak izi v2 doğrulandı`, { r, fpv });
      const m0 = vm[0]; const o = JSON.parse(readFileSync(path.join(V3IN, "snapshots", m0.file), "utf8")) as { subject: Record<string, unknown> };
      o.subject.evidence_fingerprint_v2 = "0".repeat(64);
      const t = JSON.stringify(o, null, 2); const f = path.join(os.tmpdir(), `hd-edu-v3-neg-${randomUUID().slice(0, 8)}.json`); writeFileSync(f, t);
      const e4 = await boot(); envs.push(e4);
      const rr = await io.restoreSnapshotFile(e4.su, f, io.sha256(t));
      ok(rr === "REJECTED:EVIDENCE_V2_INCONSISTENT", `v3 parmak izi bozuk → ${rr}`, rr);
    }
  } finally {
    for (const e of envs) await e.stop().catch(() => undefined);
  }
  console.log(`\n[${TZ}] TAŞINABİLİRLİK: ${pass} PASS / ${fail} FAIL · sağlayıcı çağrısı 0 · production bağlantısı YOK`);
  if (fail) console.error(" - " + fails.join("\n - "));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("çöktü:", e); process.exit(1); });
