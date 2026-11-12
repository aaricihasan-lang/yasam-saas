/**
 * f6-source-setup.ts — İZOLE doğrulama (geçici embedded-postgres + shim, migration F1…F6; PRODUCTION'A SIFIR TEMAS, 0 kredi).
 * Girdi/kanıt dosyaları SENTETİK (işletim sistemi geçici klasöründe). İsteğe bağlı: REAL_F2_DIR verilirse betiğin ürettiği
 * kaynak + izin kimlikleriyle kayıtlı yanıtlardan (ağ yok) aktarım yapılıp uyumluluk doğrulanır.
 * Çalıştır: npx tsx scripts/stone-library/f6-source-setup-harness.ts   [REAL_F2_DIR=C:/YasamSistemi-QA/DOGALTAS-KUTUPHANE-F2-2026-10-24]
 */
import "../hd-analysis-word-flow/env";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { SERVICE_KEY, ANON_KEY, startAnamnezTestEnv } from "../anamnez/testEnv";
import { blankTemplate, runSourceSetup, validateInput } from "./f6-source-setup";
import { runCrystalImport, type RawPutArgs } from "../../lib/stone-library/import/runner";
import { replayFetch } from "./replaySource";

const PORT = Number(process.env.PG_PORT ?? 54651);
const REAL_F2 = process.env.REAL_F2_DIR ?? "";
const ROOT = process.cwd();
let pass = 0; let fail = 0;
const ok = (c: boolean, label: string, extra?: unknown) => {
  if (c) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
};
const section = (s: string) => console.log(`\n[${s}]`);
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

async function main() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "sl-source-setup-"));
  const terms = path.join(tmp, "sartlar.html"); writeFileSync(terms, "<html>sentetik hizmet şartları</html>");
  const evid = path.join(tmp, "izin.png"); writeFileSync(evid, Buffer.from("sentetik izin kanıtı"));
  const appr = { onaylayan: "Sentetik Owner", tarih: "2026-10-29", aciklama: "harness" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test girdisi bilerek serbest biçimli (geçersiz değer senaryoları)
  type Loose = any;
  const input = (over: (o: Loose) => void = () => {}) => {
    const o: Loose = {
      kaynak: { source_key: "kristal-kaynak", kind: "api", real_name: "Kristal sağlayıcısı (sentetik)", provider_code: "roxy", license_type: "api_terms",
        license_ref: "YOK", license_terms_url: "https://example.test/terms", license_terms_file: terms, license_terms_sha256_beklenen: sha(readFileSync(terms)),
        license_accepted_at: "2026-10-19T00:00:00Z", license_valid_until: "YOK", commercial_use_ok: true, image_rights: "rehost_ok", status: "active", notes: "YOK", owner_onayi: appr },
      belgeler: [{ anahtar: "gorsel-izni", doc_kind: "correspondence", title: "sentetik izin", url: "YOK", captured_at: "2026-10-24T10:56:00Z", dosya: evid, sha256_beklenen: "YOK", note: "YOK" }],
      gorsel_izni: { belge: "gorsel-izni", scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "sentetik", commercial_display: true, storage_allowed: true,
        post_subscription_rights: true, attribution_required: false, attribution_text: "YOK", modification_allowed: true, redistribution_limit: "sentetik sınır",
        max_resolution: "300x300", valid_until: "YOK", notes: "YOK", kanit_durumu: "verified", owner_onayi: appr },
    };
    over(o); return o;
  };
  const plan = (o: unknown) => validateInput(o, ROOT);

  section("1. Girdi doğrulaması (çevrimdışı; varsayılan değer yok)");
  const blank = plan(blankTemplate());
  ok(!blank.plan && blank.errors.length >= 30, "boş şablon reddedildi (tüm alanlar doldurulmadı)", blank.errors.length);
  ok(!!plan(input()).plan, "tam ve geçerli girdi kabul edildi", plan(input()).errors);
  ok(!plan(input((o) => { o.kaynak.commercial_use_ok = null; })).plan, "null ticari kullanım → red (uydurulmaz)");
  ok(!plan(input((o) => { o.kaynak.commercial_use_ok = "true"; })).plan, "metin 'true' → red (yalnız true/false)");
  ok(!plan(input((o) => { o.gorsel_izni.storage_allowed = "YOK"; })).plan, "zorunlu boolean'da \"YOK\" → red");
  ok(!plan(input((o) => { delete o.gorsel_izni.owner_onayi; })).plan, "owner onayı yok → red");
  ok(!plan(input((o) => { o.kaynak.image_rights = "her_sey"; })).plan, "liste dışı değer → red");
  ok(!plan(input((o) => { o.belgeler[0].dosya = path.join(ROOT, "package.json"); })).plan, "Git deposu içindeki kanıt dosyası → red");
  ok(!plan(input((o) => { o.belgeler[0].sha256_beklenen = "0".repeat(64); })).plan, "beklenen SHA-256 uyuşmazlığı → red");
  ok(!plan(input((o) => { o.kaynak.display_mode = "real"; })).plan, "görünürlük betikle açılamaz → red");
  ok(!plan(input((o) => { o.gorsel_izni.attribution_required = true; })).plan, "atıf zorunlu + metin YOK → red");
  ok(!plan(input((o) => { o.gorsel_izni.belge = "olmayan"; })).plan, "izin, listede olmayan belgeye bağlanamaz");
  ok(plan(input((o) => { o.gorsel_izni = "YOK"; })).plan?.grant === null, "görsel izni bilerek \"YOK\" → yalnız kaynak + belge");
  const p0 = plan(input()).plan!;
  ok(p0.source.license_terms_sha256 === sha(readFileSync(terms)) && p0.docs[0].content_sha256 === sha(readFileSync(evid)), "SHA-256 dosyalardan hesaplandı");

  section("2. Komut satırı korumaları (DB'ye bağlanmadan)");
  const cli = (args: string[], env: Record<string, string> = {}) => spawnSync(process.execPath, [path.join(ROOT, "node_modules/tsx/dist/cli.mjs"), "scripts/stone-library/f6-source-setup.ts", ...args],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", STONE_LIBRARY_OWNER_ID: "", ...env } });
  const good = path.join(tmp, "girdi.json"); writeFileSync(good, JSON.stringify(input()));
  const sab = path.join(tmp, "sablon.json");
  let r = cli(["--sablon", sab]);
  ok(existsSync(sab) && Object.values(JSON.parse(readFileSync(sab, "utf8")).kaynak).filter((v) => v === null).length >= 14, "şablon yazıldı, kararların hepsi null", r.stdout);
  r = cli(["--sablon", sab]); ok(/zaten var/.test(r.stdout), "şablon üzerine yazılmaz");
  r = cli(["--input", sab]); ok(r.status === 2 && /GİRDİ GEÇERSİZ/.test(r.stdout), "boş şablonla çalıştırma reddedildi (çıkış 2)");
  r = cli(["--input", good]); ok(/çevrimdışı deneme/.test(r.stdout) && /Girdi geçerli/.test(r.stdout), "DB bilgisi yok → yalnız doğrulama, yazma yok");
  r = cli(["--input", good, "--write"]); ok(/--confirm-write/.test(r.stdout), "--write tek başına reddedildi");
  r = cli(["--input", good, "--write", "--confirm-write", "--target-host", "x"]); ok(/gerekli\. DURDU/.test(r.stdout), "yazma için DB kimlikleri zorunlu");

  section("3. İzole veritabanı");
  const MIGS = ["20271201000000_stone_library_core.sql", "20271201000100_stone_library_f2.sql", "20271201000200_stone_library_f3.sql",
    "20271201000300_stone_library_f6_raw_guard.sql", "20271201000400_stone_library_f6_layers.sql"];
  const mig = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");
  const external: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (i: RequestInfo | URL, init?: RequestInit) => {
    const u = String(i instanceof Request ? i.url : i);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(i, init);
    external.push(u); throw new Error("dış ağ yasak");
  }) as typeof fetch;
  const env = await startAnamnezTestEnv({ port: PORT, dirName: `stone-library-source-setup-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: [...new Set([...MIGS.map(mig).join("\n").matchAll(/FUNCTION public\.(stone_library_[a-z_]+)\(/g)].map((m) => m[1]))], extraSql: MIGS.map(mig) });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url; process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY; process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
  const counts = async () => (await su.query(`select (select count(*) from public.stone_library_sources) s, (select count(*) from public.stone_library_source_documents) d,
    (select count(*) from public.stone_library_license_grants) g, (select count(*) from public.stone_library_reviews) rv`)).rows[0] as Record<string, string>;
  try {
    const T = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_SL_SETUP')`, [T]);
    const mk = async (role: string, sup: boolean) => { const id = randomUUID();
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin, admin_level)
        values ($1,'ZZ',$2,$3,true,'approved','{}','premium','premium',$4,$5,$6)`, [id, `zz.slsetup.${id.slice(0, 8)}@example.test`, role, T, sup, role === "admin" ? (sup ? "owner" : "admin") : null]); return id; };
    const OWNER = await mk("admin", true); const ADMIN = await mk("admin", false);

    section("4. Deneme (yazma yok)");
    const c0 = await counts();
    const d1 = await runSourceSetup(db, OWNER, p0, false);
    ok(d1.ok && d1.steps.map((s) => s.durum).join(",") === "olustur,olustur,olustur,dogrula", "plan: kaynak + belge + izin oluştur, izni doğrula", d1.steps);
    ok(JSON.stringify(await counts()) === JSON.stringify(c0), "deneme hiçbir satır yazmadı (kaynak/belge/izin/işlem kaydı)");

    section("5. Yetki");
    let denied = false; try { await runSourceSetup(db, ADMIN, p0, true); } catch { denied = true; }
    ok(denied && JSON.stringify(await counts()) === JSON.stringify(c0), "owner olmayan admin reddedildi, satır yok");

    section("6. Uygulama");
    const w1 = await runSourceSetup(db, OWNER, p0, true);
    ok(w1.ok && !!w1.source_id && !!w1.grant_id && w1.grant_status === "verified", "kaynak + belge + izin oluşturuldu, izin doğrulandı", w1);
    const src = (await su.query(`select * from public.stone_library_sources where id=$1`, [w1.source_id])).rows[0];
    ok(src.display_mode === "hidden" && src.status === "active" && src.commercial_use_ok === true && src.license_terms_sha256 === p0.source.license_terms_sha256,
      "kaynak: gizli, etkin, ticari onay ve şartlar özeti girdiyle aynı");
    const g = (await su.query(`select * from public.stone_library_license_grants where id=$1`, [w1.grant_id])).rows[0];
    ok(g.document_sha256 === p0.docs[0].content_sha256 && g.max_resolution === "300x300" && g.attribution_required === false && g.post_subscription_rights === true,
      "izin alanları girdiyle birebir");
    const c1 = await counts();
    ok(+c1.s === +c0.s + 1 && +c1.d === +c0.d + 1 && +c1.g === +c0.g + 1, "tam 1 kaynak + 1 belge + 1 izin");

    section("7. Tekrar çalıştırma");
    const w2 = await runSourceSetup(db, OWNER, p0, true);
    ok(w2.ok && w2.steps.every((s) => s.durum === "atla") && w2.source_id === w1.source_id && w2.grant_id === w1.grant_id, "ikinci uygulama: her adım 'atla', aynı kimlikler", w2.steps);
    ok(JSON.stringify(await counts()) === JSON.stringify(c1), "ikinci uygulama satır eklemedi");

    section("8. Çakışma");
    const pc = plan(input((o) => { o.kaynak.commercial_use_ok = false; })).plan!;
    const x1 = await runSourceSetup(db, OWNER, pc, true);
    ok(!x1.ok && x1.steps[0].durum === "CAKISMA" && /commercial_use_ok/.test(x1.steps[0].ayrinti ?? ""), "kaynak farkı → DUR (alan adı raporlanır)", x1.steps);
    const pg2 = plan(input((o) => { o.gorsel_izni.max_resolution = "600x600"; })).plan!;
    const x2 = await runSourceSetup(db, OWNER, pg2, true);
    ok(!x2.ok && x2.steps.some((s) => s.adim === "gorsel_izni" && s.durum === "CAKISMA"), "izin farkı → DUR");
    const pd = plan(input((o) => { o.gorsel_izni.kanit_durumu = "owner_verification_pending"; })).plan!;
    ok(!(await runSourceSetup(db, OWNER, pd, true)).ok, "doğrulanmış izin geri alınmaz → DUR");
    ok(JSON.stringify(await counts()) === JSON.stringify(c1), "çakışmalarda hiçbir satır değişmedi");
    const after = (await su.query(`select commercial_use_ok, row_version from public.stone_library_sources where id=$1`, [w1.source_id])).rows[0];
    ok(after.commercial_use_ok === true && after.row_version === src.row_version, "kaynak satırı değişmedi");

    section("9. Bekleyen kanıt + görselsiz kaynak");
    const pp = plan(input((o) => { o.kaynak.source_key = "kaynak-bekleyen"; o.gorsel_izni.kanit_durumu = "owner_verification_pending"; })).plan!;
    const w3 = await runSourceSetup(db, OWNER, pp, true);
    ok(w3.ok && w3.grant_status === "owner_verification_pending" && !w3.steps.some((s) => s.durum === "dogrula"), "kanıt beklemede → izin 'owner_verification_pending' kalır");
    const pn = plan(input((o) => { o.kaynak.source_key = "kaynak-gorselsiz"; o.gorsel_izni = "YOK"; })).plan!;
    const w4 = await runSourceSetup(db, OWNER, pn, true);
    ok(w4.ok && w4.grant_id === null && Object.keys(w4.document_ids).length === 1, "görsel izni YOK → izin kaydı oluşmaz");
    const draft = plan(input((o) => { o.kaynak.source_key = "kaynak-taslak"; o.kaynak.status = "draft"; o.gorsel_izni = "YOK"; })).plan!;
    const w5 = await runSourceSetup(db, OWNER, draft, true);
    ok(w5.ok && (await su.query(`select status from public.stone_library_sources where id=$1`, [w5.source_id])).rows[0].status === "draft", "status 'draft' korunur");

    section("10. Mevcut tablolara dokunulmadı");
    const other = (await su.query(`select count(*) n from pg_stat_user_tables where schemaname='public' and relname not like 'stone_library%' and (n_tup_upd + n_tup_del) > 0
      and relname not in ('users','tenants','user_sessions')`)).rows[0];
    ok(Number(other.n) === 0, "kütüphane dışı tablolarda güncelleme/silme yok", other);

    if (REAL_F2 && existsSync(path.join(REAL_F2, "ham/roxy"))) {
      section("11. Uyumluluk: betiğin kimlikleriyle 0 kredili aktarım (kayıtlı yanıtlar, ağ yok)");
      const imp = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: "testpw", database: "postgres" }); await imp.connect();
      const importerRaw = async (a: RawPutArgs): Promise<string> => { await imp.query("begin");
        try { await imp.query("set local role stone_library_importer");
          const x = await imp.query("select public.stone_library_raw_put($1,$2,$3,$4,$5,$6,$7::jsonb) as id", [a.p_actor, a.p_batch_id, a.p_external_id, a.p_lang, a.p_endpoint, a.p_http_status, JSON.stringify(a.p_payload)]);
          await imp.query("commit"); return String(x.rows[0].id); } catch (e) { await imp.query("rollback"); throw e; } };
      const n = { n: 0 }; const rf = replayFetch(REAL_F2, n);
      const s1 = await runCrystalImport({ db, actor: OWNER, sourceId: w1.source_id!, licenseGrantId: w1.grant_id, writeRaw: importerRaw,
        client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "cevrimdisi-yeniden-oynatma-anahtari-yok", fetchImpl: rf, timeoutMs: 5000 },
        imageFetch: rf, includeImages: true, includeBirthstones: true, includeVocabLists: true, creditCap: 1000, allowanceRemaining: 1000, quotaFloor: 0,
        termsSha256: p0.source.license_terms_sha256, sleep: async () => undefined });
      ok(s1.status === "completed" && s1.stonesCreated === 91 && s1.imagesStored === 91 && s1.failedCalls === 0, "91 taş + 91 görsel aktarıldı", { status: s1.status, stones: s1.stonesCreated, images: s1.imagesStored });
      ok(external.length === 0, "dış ağa 0 istek", external.slice(0, 3));
      await imp.end();
    } else console.log("\n[11. Uyumluluk aktarımı] ATLANDI (REAL_F2_DIR verilmedi)");
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exitCode = fail ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
