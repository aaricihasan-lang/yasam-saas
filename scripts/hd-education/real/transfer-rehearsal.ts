/**
 * GERÇEK snapshot aktarım provası — YALNIZ izole yerel embedded-postgres (production'a BAĞLANMAZ, sağlayıcı çağrısı YOK).
 * Repodaki eğitim migration'ları sırayla uygulanır (20271113 repoda varsa dahil); hedef şemaya göre `--target` seçilir
 * (gövde kolonları varsa with-body, yoksa legacy). İki ayrı ortam:
 *   Ortam 1 (olumlu): SQL üret → uygula → İKİNCİ KEZ uygula (0 yeni satır) → 12/12 yeniden okuma (paketle içerik, ürün /
 *     kanonik / gövde özetleri, v1 gövde NULL, v2 orijinal gövde) → aynı paketin geri yüklemesi ALREADY_PRESENT → yanlış hedef
 *     (legacy↔with-body) SQL'i RED → yayın/erişim değişmedi.
 *   Ortam 2 (olumsuz): gövdesi bozulmuş SQL · verisi bozulmuş SQL · yanlış kişi kimliği · yanlış revizyon → her biri TAM geri
 *     alma (0 snapshot, 0 içe aktarım olayı) · bozuk paket → SQL ÜRETİLMEZ.
 * Üretilen gerçek SQL repo DIŞINDA `--out-dir` (yeni, boş klasör) altına yazılır (+ .sha256).
 * Çalıştır: npx tsx scripts/hd-education/real/transfer-rehearsal.ts --import <sql> --local-key <sql> --owner <uuid> --pkg <paket> --out-dir <yeni klasör>
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { buildTransferSql, type TransferTarget } from "./snapshot-sql";
import { bodyColumnCount, canonicalSha256, restoreSnapshotFile, sha256, verifyPackageText, hasProviderBody } from "./snapshot-io";

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
const IMPORT = arg("--import"), LOCALKEY = arg("--local-key"), OWNER = arg("--owner"), PKG = arg("--pkg"), OUT = arg("--out-dir");
if (!IMPORT || !LOCALKEY || !OWNER || !PKG || !OUT) throw new Error("--import --local-key --owner --pkg --out-dir zorunlu");
if (path.resolve(OUT).toLowerCase().startsWith(process.cwd().toLowerCase())) throw new Error("çıktı repo İÇİNDE olamaz (gerçek kişi verisi)");
if (existsSync(OUT) && readdirSync(OUT).length) throw new Error(`çıktı klasörü boş değil: ${OUT}`);
mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; fails.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 400)}` : ""}`); } };
const section = (s: string) => console.log(`\n[${s}]`);
const ROOT = process.cwd();
const MIGS = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql", "20271113000000_hd_education_chart_provider_body.sql"]
  .filter((f, i) => i < 2 || existsSync(path.join(ROOT, "supabase/migrations", f)));
const manifest = readFileSync(path.join(PKG, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { file: string; sha256: string; natural_key: string });

async function boot(tag: string): Promise<TestEnv> {
  const env = await startAnamnezTestEnv({
    port: Number(process.env.HD_EDU_XFER_PG_PORT ?? 54581) + (tag === "2" ? 1 : 0), dirName: `hd-edu-xfer-${tag}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: [], extraSql: [`create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid, target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`,
      ...MIGS.map((f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"))],
  });
  const tenant = randomUUID();
  await env.su.query(`insert into public.tenants(id, name) values ($1,'ZZ yerel owner')`, [tenant]);
  await env.su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, package_type, plan, admin_level)
                      values ($1,'Yerel Owner (test)','owner.local@example.test','admin',true,'approved',true,$2,'premium','premium','owner')`, [OWNER, tenant]);
  await env.su.query(readFileSync(LOCALKEY, "utf8"));
  await env.su.query(readFileSync(IMPORT, "utf8"));
  return env;
}
const count = async (su: pg.Client, q: string) => Number((await su.query(q)).rows[0].n);
const charts = (su: pg.Client) => count(su, `select count(*)::int n from public.hd_education_charts`);
const imports = (su: pg.Client) => count(su, `select count(*)::int n from public.hd_education_audit_events where actor_kind='import' and action='chart_recorded'`);
/** SQL dosyasını olduğu gibi çalıştırır; hata → işlem iptal → ROLLBACK. Dönüş: null (başarılı) veya hata metni. */
async function runSql(su: pg.Client, sql: string): Promise<string | null> {
  try { await su.query(sql); return null; } catch (e) { await su.query("ROLLBACK").catch(() => undefined); return (e as Error).message; }
}

async function main() {
  let env1: TestEnv | null = null, env2: TestEnv | null = null;
  try {
    section(`Ortam 1 — olumlu yol (migration: ${MIGS.length}; 20271113 ${MIGS.length === 3 ? "VAR" : "YOK"})`);
    env1 = await boot("1");
    const su = env1.su;
    const bc = await bodyColumnCount(su);
    const target: TransferTarget = bc === 3 ? "with-body" : "legacy";
    ok(bc === 0 || bc === 3, `hedef şema tutarlı (gövde kolonu ${bc}) → --target ${target}`);
    const subjects = await count(su, `select count(*)::int n from public.hd_education_subjects`);
    ok(subjects === 43 && (await count(su, `select count(*)::int n from public.hd_education_publications where status <> 'draft'`)) === 0, `43 kişi taslak olarak içe aktarıldı (${subjects})`);
    const gen = buildTransferSql(PKG, target);
    const file = path.join(OUT, `snapshot-aktarim-${manifest.length}-${target}.sql`);
    writeFileSync(file, gen.sql, { flag: "wx" });
    writeFileSync(file + ".sha256", `${sha256(gen.sql)}  ${path.basename(file)}\n`, { flag: "wx" });
    console.log(`  · SQL: ${file} · sha256 ${sha256(gen.sql)} · v1 ${gen.v1} / v2 ${gen.v2}`);
    ok(gen.count === manifest.length && gen.v1 + gen.v2 === manifest.length, `SQL üretildi: ${gen.count} snapshot (v1 ${gen.v1} / v2 ${gen.v2})`);
    ok(!/zz-harness|ROXY_API_KEY|x-api-key/i.test(gen.sql), "SQL'de API anahtarı / başlık YOK");

    const e1 = await runSql(su, readFileSync(file, "utf8"));
    ok(e1 === null && (await charts(su)) === manifest.length && (await imports(su)) === manifest.length, `1. uygulama: ${await charts(su)}/${manifest.length} snapshot, ${await imports(su)} içe aktarım olayı`, e1);
    const e2 = await runSql(su, readFileSync(file, "utf8"));
    ok(e2 === null && (await charts(su)) === manifest.length && (await imports(su)) === manifest.length, "2. uygulama (aynı SQL): 0 yeni satır, 0 yeni olay (idempotent)", e2);

    section("Ortam 1 — 12/12 yeniden okuma (paketle birebir)");
    for (const m of manifest) {
      const v = verifyPackageText(readFileSync(path.join(PKG, "snapshots", m.file), "utf8"), m.sha256);
      const c = v.pkg!.chart;
      const row = (await su.query(`select * from public.hd_education_charts where subject_id=$1`, [c.subject_id])).rows as Array<Record<string, unknown>>;
      const r = row[0] ?? {};
      const isV2 = hasProviderBody(v.pkg!.format);
      const s = (await su.query(`select id, natural_key, revision, extract(epoch from birth_utc)::float8 as utc_epoch from public.hd_education_subjects where id=$1`, [c.subject_id])).rows[0] as Record<string, unknown>;
      const same = row.length === 1 && r.id === c.id && r.request_hash === c.request_hash && r.adapter_version === c.adapter_version && Number(r.version) === Number(c.version)
        && Number(r.subject_revision) === Number(s.revision) && s.natural_key === m.natural_key && Number(s.utc_epoch) * 1000 === Date.parse(String(v.pkg!.subject.birth_utc))
        && r.provider_raw_sha256 === c.provider_raw_sha256 && sha256(JSON.stringify(v.providerObject)) === c.provider_raw_sha256
        && canonicalSha256(r.provider_raw) === canonicalSha256(v.providerObject) && canonicalSha256(r.computed_result) === canonicalSha256(c.computed_result);
      const bodyOk = target === "legacy" ? !("provider_body" in r)
        : r.provider_canonical_sha256 === canonicalSha256(v.providerObject)
          && (isV2 ? r.provider_body === v.pkg!.provider_body_text && r.provider_body_sha256 === v.pkg!.provider_body_sha256 && sha256(Buffer.from(String(r.provider_body), "utf8")) === r.provider_body_sha256
            : r.provider_body === null && r.provider_body_sha256 === null);
      const raw = r.provider_raw as { type?: string; gates?: Array<{ gate: number }>; channels?: unknown[] } | undefined;
      const pr = c.provider_raw as { type?: string; gates?: Array<{ gate: number }>; channels?: unknown[] };
      const gates = (x?: { gates?: Array<{ gate: number }> }) => JSON.stringify([...new Set((x?.gates ?? []).map((g) => g.gate))].sort((a, b) => a - b));
      ok(same && bodyOk && raw?.type === pr.type && gates(raw) === gates(pr) && JSON.stringify(raw?.channels) === JSON.stringify(pr.channels),
        `${m.natural_key} (${isV2 ? "v2" : "v1"}): kimlik/natural_key/revizyon/UTC/istek özeti/adapter/ürün+kanonik SHA/normalize sonuç${target === "with-body" ? (isV2 ? "/orijinal gövde" : "/gövde NULL") : ""}/BodyGraph alanları`,
        { same, bodyOk });
    }
    const restore = await Promise.all(manifest.map((m) => restoreSnapshotFile(su, path.join(PKG, "snapshots", m.file), m.sha256)));
    ok(restore.every((r) => r === "ALREADY_PRESENT") && (await charts(su)) === manifest.length, "aynı paketin geri yüklemesi: 12/12 ALREADY_PRESENT (iki yol tek satır)", restore);
    const wrong = buildTransferSql(PKG, target === "with-body" ? "legacy" : "with-body");
    const ew = await runSql(su, wrong.sql);
    ok(ew !== null && /hedef şema --target/.test(ew) && (await charts(su)) === manifest.length, `yanlış hedef (${target === "with-body" ? "legacy" : "with-body"}) SQL'i → açık RED, değişiklik yok`, ew);
    ok((await count(su, `select count(*)::int n from public.hd_education_publications where status <> 'draft'`)) === 0
      && (await count(su, `select count(*)::int n from public.hd_education_access_grants`)) === 0
      && (await count(su, `select count(*)::int n from public.hd_education_subjects where legal_reviewed_at is not null or legal_reviewed_by is not null`)) === 0,
      "yayın 0 · eğitmen yetkisi 0 · hukuk inceleme alanları değişmedi");
    await env1.stop(); env1 = null;

    section("Ortam 2 — olumsuz yol (her biri TAM geri alma)");
    env2 = await boot("2");
    const s2 = env2.su;
    const sql = readFileSync(file, "utf8");
    const zero = async () => (await charts(s2)) === 0 && (await imports(s2)) === 0;
    if (target === "with-body") {
      const lastV2 = manifest.filter((m) => hasProviderBody(JSON.parse(readFileSync(path.join(PKG, "snapshots", m.file), "utf8")).format)).pop();
      const ii = lastV2 ? sql.indexOf(`-- ${lastV2.natural_key} `) : -1;
      const bodyAt = ii >= 0 ? sql.indexOf('"type":"', sql.indexOf("'OK', ", ii)) : -1;
      ok(bodyAt > 0, "bozma noktası bulundu (v2 gövde literal'i)");
      const tampered = sql.slice(0, bodyAt) + '"type":"ZZ' + sql.slice(bodyAt + 8);
      const e = await runSql(s2, tampered);
      ok(e !== null && (await zero()), "gövdesi bozulmuş SQL (özet aynı) → DB kısıtı RED → tam geri alma", e);
    }
    {
      const at = sql.indexOf('"type":"');
      const tampered = sql.slice(0, at) + '"type":"ZZ' + sql.slice(at + 8);
      const e = await runSql(s2, tampered);
      ok(e !== null && (await zero()), "verisi bozulmuş SQL (ilk snapshot) → RED → tam geri alma", e);
    }
    const victim = manifest[1].natural_key, victim2 = manifest[2].natural_key;
    {
      // Yanlış kişi kimliği: SQL'de bir snapshot başka bir kişinin kimliğine bağlanır (DB natural_key değişikliğine zaten izin vermez).
      const own = JSON.parse(readFileSync(path.join(PKG, "snapshots", manifest[1].file), "utf8")).chart.subject_id as string;
      const other = (await s2.query(`select id from public.hd_education_subjects where natural_key <> all($1::text[]) order by natural_key limit 1`, [manifest.map((m) => m.natural_key)])).rows[0].id as string;
      const blk = sql.indexOf(`-- ${victim} `), next = sql.indexOf("\n-- ", blk + 5);
      const tampered = sql.slice(0, blk) + sql.slice(blk, next).split(own).join(other) + sql.slice(next);
      const e = await runSql(s2, tampered);
      ok(tampered !== sql && e !== null && /kişi\/kanıt\/revizyon uyuşmuyor/.test(e) && e.includes(victim) && (await zero()), `yanlış kişi kimliği (${victim} snapshot'ı başka kişiye bağlandı) → RED → tam geri alma`, e);
    }
    await s2.query(`update public.hd_education_subjects set birth_place = coalesce(birth_place,'') || ' (zz düzeltme)', revision = revision + 1 where natural_key=$1`, [victim2]);
    {
      const e = await runSql(s2, sql);
      ok(e !== null && /uyuşmuyor/.test(e) && (await zero()), `yanlış revizyon (${victim2} revizyon +1) → RED → tam geri alma`, e);
    }
    {
      const tmp = path.join(os.tmpdir(), `hd-edu-bozuk-paket-${randomUUID().slice(0, 8)}`);
      cpSync(PKG, tmp, { recursive: true });
      const f = path.join(tmp, "snapshots", manifest[0].file);
      writeFileSync(f, readFileSync(f, "utf8").replace('"calc_status": "OK"', '"calc_status": "OK" '));
      let refused = "";
      try { buildTransferSql(tmp, target); } catch (e) { refused = (e as Error).message; }
      ok(/FILE_SHA/.test(refused), "bozuk paket dosyası (1 bayt) → FILE_SHA → SQL ÜRETİLMEDİ", refused);
      console.log(`  · geçici bozuk kopya: ${tmp} (orijinal paket DEĞİŞMEDİ)`);
    }
    const rr = await Promise.all(manifest.map((m) => restoreSnapshotFile(s2, path.join(PKG, "snapshots", m.file), m.sha256)));
    ok(rr.filter((r) => r === "RESTORED").length === manifest.length - 1 && /^REJECTED:(REVISION|EVIDENCE_CHANGED)$/.test(rr[2]),
      `geri yükleme yolu da aynı kuralı uygular: ${manifest.length - 1} RESTORED, revizyonu değişen kişi REJECTED`, rr);
  } finally {
    await env1?.stop().catch(() => undefined);
    await env2?.stop().catch(() => undefined);
  }
  console.log(`\nAKTARIM PROVASI: ${pass} PASS / ${fail} FAIL · sağlayıcı çağrısı 0 · production bağlantısı YOK`);
  if (fail) { console.error(" - " + fails.join("\n - ")); process.exit(1); }
}
main().then(() => process.exit(0), (e) => { console.error("çöktü:", e); process.exit(1); });
