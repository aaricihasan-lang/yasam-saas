/**
 * Klasik Numeroloji E2E — yerel veritabanı ortamı (embedded-postgres + PostgREST shim; YALNIZ 127.0.0.1).
 *
 *  - Şema: testEnv BASE_DDL (users / user_sessions / tenants / clients …) + mevcut Numeroloji tabloları
 *    (numerology_records, numerology_stone_assignments, dogaltas_inventory; service_role YALNIZ SELECT) +
 *    GERÇEK migration'lar: numerology core RLS kilidi, records client link, numerology_classic_core,
 *    Doğaltaş Kütüphanesi F1 + F2 + F3 + F6-A + F6-B.
 *  - Doğaltaş Kütüphanesi GERÇEK kayıtlı kristal verisiyle (çevrimdışı yeniden oynatma, 0 kredi, ağ yok) doldurulur
 *    ve gerçek owner fonksiyonlarıyla yayımlanır (stone_library_owner_publish); uzmana gerçek erişim fonksiyonuyla
 *    (stone_library_grant_access) yetki verilir.
 *  - Sentetik kullanıcı / tenant / danışan tohumu.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { runCrystalImport, type RawPutArgs } from "../../../lib/stone-library/import/runner";
import type { CrystalsFetch } from "../../../lib/stone-library/import/roxyCrystalsClient";

export { ANON_KEY, SERVICE_KEY };
const ROOT = path.resolve(__dirname, "../../..");
export const STONE_DIR = process.env.NUMK_E2E_STONE_DIR ?? "C:/YasamSistemi-QA/DOGALTAS-KUTUPHANE-F2-2026-10-24";

const NUM_MIGS = ["20270121000000_numerology_core_rls_lock.sql", "20271120000300_numerology_records_client_link.sql", "20271205000000_numerology_classic_core.sql"];
const STONE_MIGS = ["20271201000000_stone_library_core.sql", "20271201000100_stone_library_f2.sql", "20271201000200_stone_library_f3.sql",
  "20271201000300_stone_library_f6_raw_guard.sql", "20271201000400_stone_library_f6_layers.sql"];
const mig = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");

const LEGACY = `
  create table if not exists public.numerology_records (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
    name text, surname text, birth_date text, analysis_data jsonb, created_at timestamptz default now());
  create table if not exists public.numerology_stone_assignments (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
    analysis_type text not null, value text not null, reason text, stones jsonb, updated_at timestamptz default now());
  create table if not exists public.dogaltas_inventory (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text, adet integer);`;

export type Who = { id: string; token: string; tenantId: string; perms: Record<string, boolean>; fullName: string; email: string };
export type Seed = {
  TA: string; TB: string;
  A: Who; A2: Who; B: Who;
  clientA: string; clientB: string;
  legacyA: string;
};

export type StoneReport = {
  imported: number; images: number; published: number; publishFailures: Record<string, string>; replayedRequests: number;
  importStatus: string; failedCalls: number; accessGranted: boolean; termsSha: string;
};

/** Kayıtlı kristal yanıtlarından sağlayıcı taklidi (yalnız dosya okur). scripts/stone-library/replaySource.ts ile aynı eşleme. */
function replayFetch(dir: string, counter: { n: number }): CrystalsFetch {
  return async (input: string) => {
    counter.n++;
    const u = new URL(input);
    const lang = u.searchParams.get("lang") ?? "x";
    const send = (file: string, type: string) => existsSync(file)
      ? new Response(readFileSync(file), { status: 200, headers: { "content-type": type } })
      : new Response(JSON.stringify({ error: "not in replay" }), { status: 404, headers: { "content-type": "application/json" } });
    const img = /^\/img\/crystals\/([a-z0-9-]+)\.jpg$/.exec(u.pathname);
    if (img) return send(path.join(dir, `ham/gorseller/orig/${img[1]}.jpg`), "image/jpeg");
    const p = u.pathname.replace(/^\/api\/v2/, "");
    const det = /^\/crystals\/([a-z0-9-]+)$/.exec(p);
    if (det && !["colors", "planets"].includes(det[1])) return send(path.join(dir, `ham/roxy/${det[1]}.${lang}.json`), "application/json");
    let ep = p;
    if (u.searchParams.get("limit")) ep += `_limit_${u.searchParams.get("limit")}${u.searchParams.get("offset") ? `_offset_${u.searchParams.get("offset")}` : ""}`;
    return send(path.join(dir, `ham/roxy/_${ep.replace(/[/]/g, "_")}.${lang}.200.json`), "application/json");
  };
}

export async function startE2eDb(opts: { pgPort: number; httpPort: number }): Promise<TestEnv & { dataDir: string }> {
  const dirName = `numk-e2e-db-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const fns = [...new Set([...STONE_MIGS.map(mig).join("\n").matchAll(/FUNCTION public\.(stone_library_[a-z_]+)\(/g)].map((m) => m[1]))];
  const env = await startAnamnezTestEnv({
    port: opts.pgPort,
    httpPort: opts.httpPort,
    dirName,
    rpcAllow: fns,
    extraSql: [
      LEGACY,
      ...NUM_MIGS.map(mig),
      ...STONE_MIGS.map(mig),
      // Mevcut tablolar: service_role YALNIZ select (ürün bunlara yazmamalı).
      "revoke all on public.numerology_records, public.numerology_stone_assignments, public.dogaltas_inventory from service_role;",
      "grant select on public.numerology_records, public.numerology_stone_assignments, public.dogaltas_inventory to service_role;",
    ],
  });
  return Object.assign(env, { dataDir: path.join(os.tmpdir(), dirName) });
}

export async function seedUsers(su: pg.Client): Promise<Seed> {
  const TA = randomUUID();
  const TB = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_NUMK_E2E_A'),($2,'ZZ_NUMK_E2E_B')`, [TA, TB]);
  const mk = async (label: string, tenantId: string, perms: Record<string, boolean>): Promise<Who> => {
    const id = randomUUID();
    const token = `zz-numk-e2e-${label.toLowerCase()}-${randomUUID()}`;
    const fullName = `ZZ NUMK E2E ${label}`;
    const email = `zz.numk.e2e.${label.toLowerCase()}@example.test`;
    await su.query(
      `insert into public.users(id, full_name, name, email, role, active, approval_status, module_permissions, package_type, plan, membership_status, tenant_id, is_demo_account)
       values ($1,$2,$2,$3,'expert',true,'approved',$4,'premium','premium','active',$5,false)`,
      [id, fullName, email, JSON.stringify(perms), tenantId],
    );
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
    return { id, token, tenantId, perms, fullName, email };
  };
  // A: "Gelecek Yılları Göster" alt-yetkili (2028 hedefli Kişisel Gün vakası); A2: alt-yetkisiz (NK-R3 kontrolü)
  const A = await mk("A", TA, { numerology: true, numeroloji: true, clients: true, stones: true, numerology_future_years: true });
  const A2 = await mk("A2", TA, { numerology: true, numeroloji: true, clients: false, stones: true });
  const B = await mk("B", TB, { numerology: true, numeroloji: true, clients: true, stones: true });
  // Danışan adı / doğum = kayıtlı sentetik sağlayıcı vakası (m02-c1) → "Bilgileri forma aktar" sonrası istek gövdesi kayıtla birebir.
  const clientA = randomUUID();
  const clientB = randomUUID();
  await su.query(
    `insert into public.clients(id, tenant_id, user_id, ad, soyad, dogum, telefon, email) values
       ($1,$2,$3,'Ayşe Can','Öztürk','1988-02-29','05550000001','zz.numk.e2e.danisan.a@example.test'),
       ($4,$5,$6,'ZZ Bora','DEMİR','1980-05-05','05550000002','zz.numk.e2e.danisan.b@example.test')`,
    [clientA, TA, A.id, clientB, TB, B.id],
  );
  // Mevcut Numeroloji kaydı (karşılaştırma için; gerçek mevcut motor çıktısı)
  const { hesaplaNumeroloji } = await import("../../../lib/numeroloji/numerolojiMotor");
  const { NUMEROLOJI_METHODOLOGY_VERSION } = await import("../../../lib/numeroloji/methodology");
  const motor = hesaplaNumeroloji({ firstName: "Ayşe Can", lastName: "Öztürk", birthDate: "29.02.1988" });
  const snap = { version: 1, motor: JSON.parse(JSON.stringify(motor)), summary: "ZZ özet", tas: { bileklik: "Ametist", kolye: "Ay Taşı" },
    calc: { methodology: NUMEROLOJI_METHODOLOGY_VERSION, stampedAt: "2026-10-20T10:00:00.000Z" } };
  const legacyA = randomUUID();
  await su.query(
    `insert into public.numerology_records(id, tenant_id, name, surname, birth_date, analysis_data, client_id, created_at)
     values ($1,$2,'Ayşe Can','Öztürk','1988-02-29',$3,$4, now() - interval '1 day')`,
    [legacyA, TA, JSON.stringify(snap), clientA],
  );
  await su.query(`insert into public.dogaltas_inventory(tenant_id, name, adet) values ($1,'Ametist',4),($1,'Ay Taşı',0),($2,'Yakut',9)`, [TA, TB]);
  return { TA, TB, A, A2, B, clientA, clientB, legacyA };
}

/** Klasik Numeroloji sabit kataloğu (kayıtlı ham yanıtlardan; çevrimdışı). Başarısızsa yalnız rapor edilir. */
export async function importCatalog(pgPort: number): Promise<{ ok: boolean; written: number; problems: string[] }> {
  const { runCatalogImport } = await import("../catalog/import");
  return runCatalogImport({
    NUM_KLASIK_IMPORT_TARGET: "local-test",
    NUM_KLASIK_IMPORT_DB_URL: `postgres://postgres:testpw@127.0.0.1:${pgPort}/postgres`,
  }, { log: () => undefined });
}

/** GERÇEK kayıtlı kristal verisi → yerel kütüphane; tüm taşlar gerçek owner fonksiyonuyla yayımlanır. */
export async function populateStoneLibrary(env: TestEnv, pgPort: number, expertIds: string[]): Promise<StoneReport> {
  const su = env.su;
  const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const termsFile = path.join(STONE_DIR, "ham/roxy-policy-terms.html");
  const termsSha = createHash("sha256").update(existsSync(termsFile) ? readFileSync(termsFile) : Buffer.from("zz-no-terms")).digest("hex");
  const OWNER = randomUUID();
  const TO = randomUUID();
  await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_NUMK_E2E_OWNER')`, [TO]);
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, tenant_id, is_super_admin, admin_level)
     values ($1,'ZZ NUMK E2E OWNER','zz.numk.e2e.owner@example.test','admin',true,'approved',$2,true,'owner')`,
    [OWNER, TO],
  );
  const owner = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await db.rpc(fn, { p_actor: OWNER, ...args });
    if (error) throw Object.assign(new Error(`${fn}: ${error.code} ${error.message}`), { code: error.code });
    return Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === "object" && fn in data[0] ? (data[0] as Record<string, unknown>)[fn] : data;
  };
  // F6: ham yanıt yazımı güvenilir aktarım rolüyle (stone_library_importer), f6-real-data.ts ile aynı.
  const imp = new pg.Client({ host: "127.0.0.1", port: pgPort, user: "postgres", password: "testpw", database: "postgres" });
  await imp.connect();
  const importerRaw = async (a: RawPutArgs): Promise<string> => {
    await imp.query("begin");
    try {
      await imp.query("set local role stone_library_importer");
      const r = await imp.query("select public.stone_library_raw_put($1,$2,$3,$4,$5,$6,$7::jsonb) as id", [a.p_actor, a.p_batch_id, a.p_external_id, a.p_lang, a.p_endpoint, a.p_http_status, JSON.stringify(a.p_payload)]);
      await imp.query("commit");
      return String(r.rows[0].id);
    } catch (e) {
      await imp.query("rollback");
      throw e;
    }
  };
  try {
    const SRC = String(await owner("stone_library_source_save", { p_source_id: null, p_data: { source_key: "kristal-kaynak", kind: "api", real_name: "Kristal sağlayıcısı (E2E)", provider_code: "roxy" } }));
    await owner("stone_library_source_save", { p_source_id: SRC, p_data: { license_type: "api_terms", license_terms_url: "https://example.test/terms", license_terms_sha256: termsSha, commercial_use_ok: true, status: "active", image_rights: "rehost_ok" } });
    const DOC = String(await owner("stone_library_document_add", { p_source_id: SRC, p_data: { doc_kind: "correspondence", title: "ZZ E2E — yerel test izni kaydı", content_sha256: termsSha } }));
    const LIC = String(await owner("stone_library_license_grant_save", { p_grant_id: null, p_data: {
      source_id: SRC, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "ZZ E2E yerel test", commercial_display: true, storage_allowed: true,
      post_subscription_rights: true, attribution_required: false, modification_allowed: true, redistribution_limit: "Yalnız yerel test.",
      max_resolution: "300x300", document_id: DOC, document_sha256: termsSha } }));
    const replays = { n: 0 };
    const rf = replayFetch(STONE_DIR, replays);
    const s1 = await runCrystalImport({
      db, actor: OWNER, sourceId: SRC, licenseGrantId: LIC, writeRaw: importerRaw,
      client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "cevrimdisi-yeniden-oynatma-anahtari-yok", fetchImpl: rf, timeoutMs: 5000 },
      imageFetch: rf, includeImages: true, includeBirthstones: true, includeVocabLists: true,
      creditCap: 1000, allowanceRemaining: 1000, quotaFloor: 0, termsSha256: termsSha, sleep: async () => undefined,
    });
    for (const im of (await su.query(`select id from public.stone_library_images where deleted_at is null`)).rows as { id: string }[]) {
      await owner("stone_library_image_review", { p_image_id: im.id, p_action: "approve", p_note: "ZZ E2E görsel onayı (yerel)" });
    }
    const stones = (await su.query(`select s.id, e.external_id ext from public.stone_library_stones s join public.stone_library_external_ids e on e.stone_id=s.id where s.deleted_at is null order by e.external_id`)).rows as { id: string; ext: string }[];
    const failures: Record<string, string> = {};
    for (const s of stones) {
      try {
        await owner("stone_library_owner_publish", { p_stone_id: s.id, p_note: "ZZ E2E tek adım yayın (yerel)" });
      } catch (e) {
        failures[s.ext] = String((e as Error).message).slice(0, 160);
      }
    }
    let accessGranted = true;
    for (const id of expertIds) {
      try {
        await owner("stone_library_grant_access", { p_target: id, p_note: "ZZ E2E uzman erişimi" });
      } catch (e) {
        accessGranted = false;
        console.error("  (erişim verilemedi)", (e as Error).message);
      }
    }
    const published = Number((await su.query(`select count(*)::int n from public.stone_library_published`)).rows[0].n);
    return {
      imported: s1.stonesCreated, images: s1.imagesStored, published, publishFailures: failures, replayedRequests: replays.n,
      importStatus: s1.status, failedCalls: s1.failedCalls, accessGranted, termsSha,
    };
  } finally {
    await imp.end().catch(() => undefined);
  }
}
