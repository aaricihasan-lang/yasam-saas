/**
 * Doğaltaş Kütüphanesi F7 — Doğaltaş modülü içi tek çalışma alanı: GERÇEK 91 taş + 182 görsel + 546 çeviri alanıyla İZOLE uçtan uca
 * doğrulama (0 kredi, ağ YOK, PRODUCTION'A SIFIR TEMAS). Production'daki gibi görsel izni "owner_verification_pending".
 *
 *  A) API (route handler'lar süreç içinde): owner / owner olmayan admin / yetkili uzman / yetkisiz uzman sınırları, taslak görsel
 *     önizlemesi (owner kapak + kaynak görsel), uzman görsel kapısının KORUNMASI (yayın + onay + doğrulanmış lisans),
 *     owner görsel yükleme → birincil → kaynağa dönüş, çeviri yayın ilişkisi, toplu çeviri deneme sayıları, kaynak dokunulmazlığı.
 *  B) --ui: gerçek tarayıcı (Playwright chromium) masaüstü / tablet / telefon; `next build --webpack` ön koşul
 *     (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54343, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<test anon>).
 *
 * Çalıştır: OUT_DIR=<Git dışı klasör> [F2_DIR=…] [F4T3_FILE=…] npx tsx scripts/stone-library/f7-calisma-alani-e2e.ts [--ui]
 * Çıktı: OUT_DIR/ekran/*.png + OUT_DIR/f7-sonuc.json (yalnız sayılar / etiketler; kaynak metin yazılmaz).
 */
import "../hd-analysis-word-flow/env";
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv } from "../anamnez/testEnv";
import { runCrystalImport, type RawPutArgs } from "../../lib/stone-library/import/runner";
import { replayFetch } from "./replaySource";
import { startRealPostgrest, type RealPostgrest } from "./realPostgrest";
import { publishGate } from "../../app/admin/dogaltas-kutuphane/_components/publishGate";

const F2 = process.env.F2_DIR ?? "C:/YasamSistemi-QA/DOGALTAS-KUTUPHANE-F2-2026-10-24";
const F4T3 = process.env.F4T3_FILE ?? "C:/YasamSistemi-QA/DOGALTAS-KUTUPHANE-F4-T3-KAPANIS-2026-10-24/nihai-yayin-adayi.json";
const OUT = process.env.OUT_DIR ?? "";
const UI = process.argv.includes("--ui");
const PG_PORT = 54691;
const HTTP_PORT = 54343; // build'deki NEXT_PUBLIC_SUPABASE_URL ile aynı olmalı
const APP_PORT = 3993;
const REST_PORT = 54345;
/** POSTGREST_BIN verilirse uygulama + API gerçek PostgREST ile çalışır (shim 54344'e kayar, vekil 54343'te). */
const REAL_PGRST = process.env.POSTGREST_BIN ?? "";
const APP = `http://127.0.0.1:${APP_PORT}`;
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

let pass = 0; let fail = 0; const fails: string[] = [];
function ok(cond: unknown, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type Who = { kind: "user" | "admin"; id: string; token: string };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type CallOpts = { body?: unknown; form?: FormData; params?: Record<string, string>; query?: string };
async function call(h: Handler, who: Who, o: CallOpts = {}) {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130", [who.kind === "admin" ? "x-admin-id" : "x-user-id"]: who.id, "x-session-token": who.token };
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.body !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(o.body); }
  const res = await h(new NextRequest(`http://localhost/api/test${o.query ?? ""}`, { method: body ? "POST" : "GET", headers, body }), { params: Promise.resolve(o.params ?? {}) });
  const type = res.headers.get("content-type") ?? "";
  if (type.startsWith("image/")) return { status: res.status, type, bytes: Buffer.from(await res.arrayBuffer()), json: {} as Record<string, unknown> };
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* boş */ }
  return { status: res.status, type, bytes: Buffer.alloc(0), json };
}

/** Geçerli küçük PNG (RGB, w×h, tek renk) — owner görsel yükleme testi için. */
function tinyPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = rgb[2]; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

type Unit = { tas_id: string; alan: string; en: string; roxy_tr: string; gosterim_tr: string; gosterim_kaynagi: string; dogrulama_durumu: string; kaynak_sha256: { en: string; tr: string } };

async function main() {
  if (!OUT || /yasam-saas|yasam-dogaltas/i.test(path.resolve(OUT))) return console.log("OUT_DIR Git dışı bir klasör olmalı — DURDU.");
  if (!existsSync(path.join(F2, "ham/roxy")) || !existsSync(F4T3)) return console.log("F2_DIR / F4T3_FILE yok — DURDU.");
  mkdirSync(path.join(OUT, "ekran"), { recursive: true });
  const report: Record<string, unknown> = { at: new Date().toISOString() };
  const external: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    external.push(u);
    throw new Error("dış ağ yasak");
  }) as typeof fetch;

  const MIGS = ["20271201000000_stone_library_core.sql", "20271201000100_stone_library_f2.sql", "20271201000200_stone_library_f3.sql",
    "20271201000300_stone_library_f6_raw_guard.sql", "20271201000400_stone_library_f6_layers.sql", "20271211000000_stone_library_owner_rpc_timeout.sql"];
  const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
  const env = await startAnamnezTestEnv({
    port: PG_PORT, httpPort: REAL_PGRST ? HTTP_PORT + 1 : HTTP_PORT, dirName: `stone-library-f7-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: [...new Set([...MIGS.map(mig).join("\n").matchAll(/FUNCTION public\.(stone_library_[a-z_]+)\(/g)].map((m) => m[1]))], extraSql: MIGS.map(mig),
  });
  let real: RealPostgrest | null = null;
  if (REAL_PGRST) real = await startRealPostgrest({ bin: REAL_PGRST, su: env.su, pgPort: PG_PORT, shimUrl: env.url, restPort: REST_PORT, proxyPort: HTTP_PORT });
  const base = real ? real.url : env.url;
  console.log(real ? "Ortam: GERÇEK PostgREST (vekil) + test depolama emülatörü" : "Ortam: PostgREST shim");
  process.env.NEXT_PUBLIC_SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.STONE_LIBRARY_ENABLED = "true";
  const su = env.su;
  const db = createClient(base, SERVICE_KEY, { auth: { persistSession: false } });
  const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await su.query(sql, p)).rows as T[];
  const n = async (sql: string, p: unknown[] = []) => Number(Object.values((await su.query(sql, p)).rows[0] ?? { x: 0 })[0]);
  const imp = new pg.Client({ host: "127.0.0.1", port: PG_PORT, user: "postgres", password: "testpw", database: "postgres" });
  await imp.connect();
  const importerRaw = async (a: RawPutArgs): Promise<string> => {
    await imp.query("begin");
    try {
      await imp.query("set local role stone_library_importer");
      const r = await imp.query("select public.stone_library_raw_put($1,$2,$3,$4,$5,$6,$7::jsonb) as id", [a.p_actor, a.p_batch_id, a.p_external_id, a.p_lang, a.p_endpoint, a.p_http_status, JSON.stringify(a.p_payload)]);
      await imp.query("commit");
      return String(r.rows[0].id);
    } catch (e) { await imp.query("rollback"); throw e; }
  };
  let app: ChildProcess | null = null;

  try {
    // ── Kurulum: production ile aynı biçim (görsel izni doğrulanmamış, görseller onaysız, 91 taş taslak, 546 çeviri yayımlanmamış)
    const T = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_F7')`, [T]);
    const mkUser = async (label: string, role: string, superAdmin: boolean, stones: boolean) => {
      const id = randomUUID(); const token = `zz-f7-${label}-${randomUUID()}`;
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin, admin_level)
        values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7,$8)`, [id, `ZZ ${label}`, `zz.f7.${label}@example.test`, role,
        JSON.stringify(stones ? { stones: true } : {}), T, superAdmin, role === "admin" ? (superAdmin ? "owner" : "admin") : null]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, label, role };
    };
    const OWNER = await mkUser("owner", "admin", true, false);
    const ADMIN2 = await mkUser("admin2", "admin", false, false);
    const EXPG = await mkUser("uzman-yetkili", "expert", false, true);
    const EXPN = await mkUser("uzman-yetkisiz", "expert", false, true);
    const asO: Who = { kind: "admin", id: OWNER.id, token: OWNER.token };
    const asA2: Who = { kind: "admin", id: ADMIN2.id, token: ADMIN2.token };
    const asG: Who = { kind: "user", id: EXPG.id, token: EXPG.token };
    const asN: Who = { kind: "user", id: EXPN.id, token: EXPN.token };
    const asGadm: Who = { kind: "admin", id: EXPG.id, token: EXPG.token };
    const owner = (fn: string, args: Record<string, unknown>) => db.rpc(fn, { p_actor: OWNER.id, ...args }).then(({ data, error }) => {
      if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: error.code });
      return Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === "object" && fn in data[0] ? (data[0] as Record<string, unknown>)[fn] : data;
    });

    /** Doğaltaş Kütüphanesi DIŞINDAKİ veri tabloları (uzman taşları, danışanlar, stok, satış…): satır sayısı + içerik özeti. */
    const otherFingerprint = async () => {
      const tabs = (await q<{ t: string }>(`select table_name t from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
        and table_name !~ '^stone_library_' and table_name !~ '(session|audit|_log$|_logs$|_events?$|rate_limit|login)' and table_name not in ('users','tenants') order by 1`)).map((r) => r.t);
      const parts: string[] = [];
      for (const t of tabs) parts.push(`${t}:${Object.values((await su.query(`select count(*) || ':' || coalesce(md5(string_agg(x::text, '|' order by x::text)), '') from public."${t}" x`)).rows[0])[0]}`);
      return { n: tabs.length, h: sha(parts.join("\n")) };
    };
    const other0 = await otherFingerprint();
    report.otherTables = other0.n;

    section("0. Kurulum (production biçimi)");
    const TERMS = sha(readFileSync(path.join(F2, "ham/roxy-policy-terms.html")));
    const SRC = String(await owner("stone_library_source_save", { p_source_id: null, p_data: { source_key: "roxy-kristal", kind: "api", real_name: "Kristal sağlayıcısı (izole)", provider_code: "roxy", license_type: "api_terms", license_terms_sha256: TERMS, commercial_use_ok: true, image_rights: "rehost_ok" } }));
    await owner("stone_library_source_save", { p_source_id: SRC, p_data: { status: "active" } });
    const licFile = readFileSync(path.join(F2, "lisans-kaniti/roxy-nora-gmail-ekran-goruntusu-2026-10-24-105624.png"));
    const DOC = String(await owner("stone_library_document_add", { p_source_id: SRC, p_data: { doc_kind: "correspondence", title: "ekran görüntüsü (izole)", content_sha256: sha(licFile) } }));
    const LIC = String(await owner("stone_library_license_grant_save", { p_grant_id: null, p_data: {
      source_id: SRC, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "izole", commercial_display: true, storage_allowed: true,
      post_subscription_rights: true, attribution_required: false, modification_allowed: true, redistribution_limit: "izole", document_id: DOC, document_sha256: sha(licFile) } }));
    const rf = replayFetch(F2, { n: 0 });
    const s1 = await runCrystalImport({ db, actor: OWNER.id, sourceId: SRC, licenseGrantId: LIC, writeRaw: importerRaw,
      client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "cevrimdisi-yeniden-oynatma-anahtari-yok", fetchImpl: rf, timeoutMs: 5000 },
      imageFetch: rf, includeImages: true, includeBirthstones: true, includeVocabLists: true, creditCap: 1000, allowanceRemaining: 1000, quotaFloor: 0, termsSha256: TERMS, sleep: async () => undefined });
    ok(s1.status === "completed" && s1.stonesCreated === 91 && s1.imagesStored === 91, "91 taş + 91 görsel (kayıtlı yanıtlardan)", { status: s1.status, stones: s1.stonesCreated, images: s1.imagesStored });
    const units = Object.values((JSON.parse(readFileSync(F4T3, "utf8")) as { birimler: Record<string, Unit> }).birimler);
    const rows = units.map((u) => ({ external_id: u.tas_id, field: u.alan, display: u.gosterim_kaynagi, status: u.dogrulama_durumu, en: u.en, source_tr: u.roxy_tr,
      content_tr: u.gosterim_kaynagi === "DOGRULANMIS_TR_CEVIRI" ? u.gosterim_tr : null, file_sha_en: u.kaynak_sha256.en, file_sha_tr: u.kaynak_sha256.tr }));
    const tr = await owner("stone_library_translation_import", { p_rows: rows, p_package_ref: "F4-T3 izole", p_dry_run: false }) as Record<string, unknown>;
    ok(tr.inserted === 546 && tr.fallback === 3, "546 çeviri alanı (543 + 3 kaynak metin), yayımlanmamış", tr);
    ok(await n(`select count(*) from public.stone_library_images where deleted_at is null`) === 182 && await n(`select count(*) from public.stone_library_images where review_state <> 'approved'`) === 182,
      "182 görsel kaydı, hepsi onay bekliyor (production ile aynı)");
    const recSha0 = String(Object.values((await su.query(`select md5(string_agg(id::text || content_sha256, ',' order by id)) h from public.stone_library_records`)).rows[0])[0]);
    const stones = await q<{ id: string; ext: string; slug: string; name_tr: string }>(`select s.id, e.external_id ext, s.slug, s.name_tr from public.stone_library_stones s join public.stone_library_external_ids e on e.stone_id=s.id order by e.external_id`);
    const AMETH = stones.find((s) => s.ext === "amethyst")!;
    const ROSE = stones.find((s) => s.ext === "rose-quartz")!;

    const R = async (p: string) => (await import(`../../app/api/admin/dogaltas-kutuphane/${p}`)) as Record<string, Handler>;
    const KAT = (await R("katalog/route")).GET;
    const KAPAK = (await R("taslar/[id]/kapak/route")).GET;
    const TAS = (await R("taslar/[id]/route")).GET;
    const GOR = (await R("gorseller/[id]/route")).GET;
    const KATMAN = await R("katman/[id]/route");
    const KGOR = await R("katman/[id]/gorsel/route");
    const CEV = (await R("ceviri/route")).POST;
    const YET = await R("yetkiler/route");
    const INC = (await R("inceleme/route")).POST;
    const VS = (await import("../../app/api/dogaltas/kutuphane/route")).GET as unknown as Handler;
    const VD = (await import("../../app/api/dogaltas/kutuphane/[slug]/route")).GET as unknown as Handler;
    const VG = (await import("../../app/api/dogaltas/kutuphane/[slug]/gorsel/route")).GET as unknown as Handler;

    section("A1. Owner kataloğu: tüm taşlar, taslak durumuyla");
    const kat = await call(KAT, asO);
    const katStones = (kat.json.stones ?? []) as { status: string; deleted: boolean }[];
    ok(kat.status === 200 && katStones.filter((x) => !x.deleted).length === 91 && katStones.every((x) => x.status === "draft"), "owner 91 taşı taslak olarak görür", { status: kat.status, n: katStones.length });

    section("A1b. Yayına hazırlık: 91 taşın engel / uyarı dağılımı (production ile aynı başlangıç durumu)");
    const readiness = await Promise.all(stones.map((s) => call(KATMAN.GET, asO, { params: { id: s.id } })));
    const blockers: Record<string, number> = {}; const warnings: Record<string, number> = {}; let readyN = 0; const notReady: string[] = [];
    readiness.forEach((r, i) => {
      const rd = (r.json.readiness ?? {}) as { ready?: boolean; blockers?: string[]; warnings?: string[] };
      if (rd.ready) readyN++; else notReady.push(stones[i].ext);
      for (const b of rd.blockers ?? []) blockers[b] = (blockers[b] ?? 0) + 1;
      for (const w of rd.warnings ?? []) warnings[w] = (warnings[w] ?? 0) + 1;
    });
    report.readiness = { ready: readyN, blockers, warnings, not_ready: notReady };
    console.log(`    yayın öncesi rapor: hazır ${readyN}/91 · engeller ${JSON.stringify(blockers)} · uyarılar ${JSON.stringify(warnings)}`);
    // Yayın öncesi rapordaki bekleyen kayıt engelleri tek adım yayının KENDİSİNCE çözülür (DB önce onaylar, sonra denetler).
    const gateOk = readiness.filter((r) => publishGate((r.json.readiness ?? { ready: false, blockers: ["?"] }) as { ready: boolean; blockers: string[] }).canTry).length;
    ok(gateOk === 91, "91/91 taşta owner 'Yayınla' düğmesi etkin (yayının çözemeyeceği engel yok)", gateOk);
    const sample = ["ametrine", "carnelian", "amber", "pink-tourmaline", "chrysocolla", "smoky-quartz"].map((x) => stones.find((s) => s.ext === x)!);
    const sp = [];
    for (const st of sample) sp.push(await call(KATMAN.POST, asO, { params: { id: st.id }, body: { action: "publish" } }));
    ok(sp.every((r) => r.status === 200), "örnek 6 taş (sağlık içeriği ağır 4 taş dahil) sunucuda tek adımda yayınlanır", sp.map((r) => [r.status, r.json.code]));
    for (const st of sample) await call(KATMAN.POST, asO, { params: { id: st.id }, body: { action: "unpublish" } });
    ok(await n(`select count(*) from public.stone_library_stones where status='published'`) === 0 && await n(`select count(*) from public.stone_library_translations where published_at is not null`) === 0,
      "örnek taşlar yayından kaldırıldı; çevirileri de geri alındı");

    section("A2. Taslak görsel önizlemesi (yalnız owner)");
    const kp = await call(KAPAK, asO, { params: { id: AMETH.id } });
    ok(kp.status === 200 && kp.type.startsWith("image/") && kp.bytes.length > 500, "owner kapak: taslak taşın kaynak görseli gelir", { status: kp.status, type: kp.type, bytes: kp.bytes.length });
    const kpAll = await Promise.all(stones.map((s) => call(KAPAK, asO, { params: { id: s.id } })));
    ok(kpAll.every((r) => r.status === 200 && r.type.startsWith("image/")), "owner kapak: 91/91 taşın görseli gelir (katalog küçük resimleri)", kpAll.filter((r) => r.status !== 200).length);
    for (const [who, label] of [[asA2, "owner olmayan admin"], [asGadm, "uzman (admin başlığıyla)"]] as const) {
      const r = await call(KAPAK, who, { params: { id: AMETH.id } });
      ok(r.status === 404 && r.bytes.length === 0, `${label}: kapak 404, bayt yok`, r.status);
    }
    const det = await call(TAS, asO, { params: { id: AMETH.id } });
    const imgs = (det.json.images ?? []) as { id: string; variant: string; review_state: string; license_grant_id: string }[];
    const lics = (det.json.image_licenses ?? []) as { id: string; evidence_status: string }[];
    ok(det.status === 200 && imgs.length === 2 && lics.some((l) => l.id === imgs[0]?.license_grant_id && l.evidence_status === "owner_verification_pending"),
      "taş ayrıntısı: 2 kaynak görsel (özgün + optimize) + izin durumu 'doğrulama bekliyor'", { n: imgs.length, lics });
    ok(!JSON.stringify(det.json.image_licenses).includes("grantor") && !JSON.stringify(det.json.image_licenses).includes("document"), "izin özeti yalnız kimlik / kapsam / durum içerir");
    const opt = imgs.find((i) => i.variant === "optimized")!;
    const gor = await call(GOR, asO, { params: { id: opt.id } });
    ok(gor.status === 200 && gor.type.startsWith("image/"), "owner kaynak görsel önizlemesi (onay öncesi) 200", gor.status);
    ok((await call(GOR, asA2, { params: { id: opt.id } })).status === 404, "owner olmayan admin: kaynak görsel 404");
    ok((await call(TAS, asA2, { params: { id: AMETH.id } })).status === 404, "owner olmayan admin: taş ayrıntısı 404");

    section("A3. Uzman sınırları + görsel kapısı korunur");
    ok((await call(YET.POST, asO, { body: { action: "grant", user_id: EXPG.id } })).status === 200, "owner yetkili uzmana erişim verir");
    const pub = await call(KATMAN.POST, asO, { params: { id: AMETH.id }, body: { action: "publish" } });
    ok(pub.status === 200, "owner tek taşı yayınlar (ametist)", pub.json);
    const vs = await call(VS, asG, { query: "?limit=50" });
    ok(vs.status === 200 && vs.json.total === 1, "yetkili uzman yalnız yayımlanmış 1 taşı görür", { status: vs.status, total: vs.json.total });
    ok((await call(VD, asG, { params: { slug: ROSE.slug } })).status === 404, "yetkili uzman taslak taşı göremez (404)");
    const vg1 = await call(VG, asG, { params: { slug: AMETH.slug } });
    ok(vg1.status === 404, "uzman görseli: onaysız + lisans doğrulanmamış → gösterilmez", vg1.status);
    const appr: { status: number; json: Record<string, unknown> }[] = [];
    for (const i of imgs) appr.push(await call(INC, asO, { body: { entity: "image", id: i.id, action: "approve" } }));
    ok(appr.every((r) => r.status === 200), "owner kaynak görselini onaylar (iki sürüm, arayüzdeki gibi sırayla)", appr.map((r) => [r.status, r.json.code, r.json.error]));
    const vg2 = await call(VG, asG, { params: { slug: AMETH.slug } });
    ok(vg2.status === 404, "uzman görseli: onaylı ama lisans doğrulanmamış → hâlâ gösterilmez (kapı korunur)", vg2.status);
    ok((await call(KAPAK, asO, { params: { id: AMETH.id } })).status === 200, "owner kapak yayın sonrası da gelir");
    ok((await call(VS, asN, { query: "?limit=5" })).status === 404, "yetkisiz uzman: kütüphane 404");
    ok((await call(KAT, asGadm)).status === 404, "uzman owner kataloğuna erişemez (404)");
    const yk = await call(KAT, asO, { query: "?yoklama=1" });
    ok(yk.status === 200 && yk.json.ok === true && !("stones" in yk.json), "owner yoklaması (?yoklama=1): 200, katalog verisi taşımaz (hızlı)", yk.json);
    ok((await call(KAT, asA2, { query: "?yoklama=1" })).status === 404 && (await call(KAT, asGadm, { query: "?yoklama=1" })).status === 404 && (await call(KAT, asG, { query: "?yoklama=1" })).status === 404,
      "owner yoklaması: owner olmayan admin / uzman 404 (sekme gösterilmez)");

    section("A4. Owner görseli: yükle → birincil → kaynağa dönüş");
    const png = tinyPng(16, 16, [19, 145, 122]);
    const fd = new FormData();
    fd.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "owner.png");
    fd.set("license_status", "undocumented");
    fd.set("make_primary", "true");
    const up = await call(KGOR.POST, asO, { params: { id: ROSE.id }, form: fd });
    ok(up.status === 200 || up.status === 201, "owner PNG yükler (birincil)", up.json);
    const kp2 = await call(KAPAK, asO, { params: { id: ROSE.id } });
    ok(kp2.type === "image/png" && sha(kp2.bytes) === sha(png), "kapak artık owner görseli (birebir aynı bayt)", { type: kp2.type });
    const back = await call(KATMAN.POST, asO, { params: { id: ROSE.id }, body: { action: "image_primary", image_id: null } });
    const kp3 = await call(KAPAK, asO, { params: { id: ROSE.id } });
    ok(back.status === 200 && kp3.type !== "image/png" && kp3.type.startsWith("image/"), "kaynak görseline dönüş: kapak yeniden kaynak görseli", { type: kp3.type });
    const upA2 = await call(KGOR.POST, asA2, { params: { id: ROSE.id }, form: fd });
    ok(upA2.status === 404, "owner olmayan admin görsel yükleyemez (404)", upA2.status);

    section("A5. Tek akış: taş yayını doğrulanmış çevirileri de yayınlar; yayından kaldırma geri alır");
    const srcOf = async () => {
      const r = await call(VD, asG, { params: { slug: AMETH.slug } });
      return { status: r.status, src: ((r.json.item as { display?: { fields?: { display_source: string }[] } })?.display?.fields ?? []).map((f) => f.display_source) };
    };
    const trPub = (id: string) => n(`select count(*) from public.stone_library_translations where stone_id=$1 and published_at is not null`, [id]);
    const s1v = await srcOf();
    ok(s1v.status === 200 && s1v.src.includes("DOGRULANMIS_TR_CEVIRI"), "taş yayınlanınca uzman doğrulanmış Türkçe çeviriyi görür (ayrı çeviri yayını gerekmez)", s1v.src);
    const amPub = await trPub(AMETH.id);
    ok(amPub >= 1 && amPub === await n(`select count(*) from public.stone_library_translations where stone_id=$1 and display_kind='verified_translation'`, [AMETH.id]),
      "ametistin tüm doğrulanmış çevirileri taşla birlikte yayınlandı", amPub);
    ok((await call(KATMAN.POST, asO, { params: { id: AMETH.id }, body: { action: "unpublish" } })).status === 200 && await trPub(AMETH.id) === 0
      && (await call(VD, asG, { params: { slug: AMETH.slug } })).status === 404, "yayından kaldırma: taş + çevirileri geri alınır, uzman göremez");
    ok((await call(KATMAN.POST, asO, { params: { id: AMETH.id }, body: { action: "publish" } })).status === 200 && await trPub(AMETH.id) === amPub, "yeniden yayın: taş + çeviriler geri gelir");
    ok(await n(`select count(*) from public.stone_library_stones where status='published'`) === 1, "yalnız ametist yayında");
    const dry = await call(CEV, asO, { body: { op: "publish", dry_run: true } });
    const pre = dry.json.result as Record<string, number>;
    ok(dry.status === 200 && pre.affected + pre.already === 543 && pre.excluded_fallback === 3 && await n(`select count(*) from public.stone_library_translations where published_at is not null`) === pre.already,
      "katalog geneli çeviri denemesi: 543 doğrulanmış alan (yayında + yayınlanacak), 3 kaynak metin hariç; deneme yazmaz", pre);
    ok((await call(CEV, asA2, { body: { op: "publish", dry_run: true } })).status === 404, "owner olmayan admin toplu çeviri ucuna erişemez (404)");

    section("A5b. Tek 'Kaydet': owner sürümü kaydedilir ve etkin olur; taşın yayın durumu değişmez");
    const sv = await call(KATMAN.POST, asO, { params: { id: ROSE.id }, body: { action: "save_apply", data: { fields: { affirmation: "ZZ owner olumlaması (izole test)" } }, expected_version: 0 } });
    const roseRow = (await q<{ owner_version_current: number | null; status: string }>(`select owner_version_current, status from public.stone_library_stones where id=$1`, [ROSE.id]))[0];
    ok(sv.status === 200 && roseRow.owner_version_current === 1 && roseRow.status === "draft", "Kaydet → sürüm 1 etkin, taş taslak kalır", { status: sv.status, roseRow });
    ok((await call(KATMAN.POST, asO, { params: { id: ROSE.id }, body: { action: "set_version", version: null } })).status === 200
      && (await q<{ v: number | null }>(`select owner_version_current v from public.stone_library_stones where id=$1`, [ROSE.id]))[0].v === null, "özgün kaynağa dönüş (geri alma)");
    ok((await call(KATMAN.POST, asA2, { params: { id: ROSE.id }, body: { action: "save_apply", data: { fields: {} } } })).status === 404, "owner olmayan admin kaydedemez (404)");

    section("A5c. Uzman erişimi listesi (yalnız owner; otomatik yetki yok)");
    const UZ = (await R("uzmanlar/route")).GET;
    const uz = await call(UZ, asO);
    const exList = (uz.json.experts ?? []) as { id: string; eligible: boolean; email: string }[];
    ok(uz.status === 200 && exList.some((x) => x.id === EXPG.id && x.eligible) && exList.some((x) => x.id === EXPN.id && x.eligible), "owner uygun uzmanları ad / e-postayla listeler", exList.length);
    ok((await call(UZ, asA2)).status === 404 && (await call(UZ, asGadm)).status === 404, "owner olmayan admin / uzman listeyi göremez (404)");
    ok(await n(`select count(*) from public.stone_library_access_grants where revoked_at is null`) === 1, "yalnız owner'ın açıkça yetki verdiği 1 uzman (otomatik yetki yok)");

    section("A5d. Uzman yalnız okur: bütün owner uçları uzmana kapalı (iki başlık türüyle), veri değişmez");
    {
      const lib0 = String(Object.values((await su.query(`select md5(string_agg(t, '|' order by t)) from (
        select 'S' || id || status || row_version t from public.stone_library_stones union all select 'G' || id || coalesce(revoked_at::text,'') from public.stone_library_access_grants
        union all select 'L' || id || evidence_status from public.stone_library_license_grants union all select 'I' || id || review_state from public.stone_library_images
        union all select 'T' || id || coalesce(published_at::text,'') from public.stone_library_translations) z`)).rows[0])[0]);
      const ROUTES = ["route", "aktarim/route", "ayarlar/route", "butunluk/route", "ceviri/route", "gorseller/[id]/route", "inceleme/route", "katalog/route",
        "katman/[id]/gorsel/route", "katman/[id]/route", "kaynaklar/route", "paketler/[id]/route", "silme/route", "taslar/[id]/kapak/route", "taslar/[id]/route",
        "taslar/route", "toplu-silme/route", "toplu-yayin/route", "uzmanlar/route", "yeni-tas/route", "yetkiler/route"];
      const BODY = { action: "publish", step: "apply", user_id: EXPG.id, expected: { stones: 0, translations: 0 }, data: { name_tr: "ZZ uzman denemesi" }, ids: [AMETH.id] };
      const bad: string[] = []; let tried = 0;
      for (const rp of ROUTES) {
        const mod = await R(rp);
        for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
          if (typeof mod[m] !== "function") continue;
          for (const who of [asG, asGadm]) {
            tried++;
            const r = await call(mod[m], who, { params: { id: AMETH.id }, body: m === "GET" ? undefined : BODY });
            if (r.status !== 404) bad.push(`${m} ${rp} (${who.kind}) → ${r.status}`);
          }
        }
      }
      ok(tried >= 50 && bad.length === 0, `yetkili uzman ${tried} owner çağrısının hepsinde 404 (ekleme / düzenleme / silme / yayın / yetki / görsel izni kapalı)`, bad);
      for (const [m, rp] of [["POST", "route"], ["POST", "[slug]/route"], ["POST", "[slug]/gorsel/route"]] as const) {
        const mod = (await import(`../../app/api/dogaltas/kutuphane/${rp}`)) as Record<string, unknown>;
        ok(typeof mod[m] !== "function" && typeof mod.PUT !== "function" && typeof mod.PATCH !== "function" && typeof mod.DELETE !== "function", `uzman ucu ${rp}: yalnız GET (yazma yöntemi yok)`);
      }
      const lib1 = String(Object.values((await su.query(`select md5(string_agg(t, '|' order by t)) from (
        select 'S' || id || status || row_version t from public.stone_library_stones union all select 'G' || id || coalesce(revoked_at::text,'') from public.stone_library_access_grants
        union all select 'L' || id || evidence_status from public.stone_library_license_grants union all select 'I' || id || review_state from public.stone_library_images
        union all select 'T' || id || coalesce(published_at::text,'') from public.stone_library_translations) z`)).rows[0])[0]);
      ok(lib0 === lib1, "uzman denemelerinden sonra kütüphane verisi birebir aynı");
      const vy = await call(VS, asG, { query: "?yoklama=1" });
      ok(vy.status === 200 && vy.json.ok === true && Object.keys(vy.json).length === 1, "uzman yoklaması (?yoklama=1): yetkili uzman 200, içerik yok", vy.json);
      ok((await call(VS, asN, { query: "?yoklama=1" })).status === 404, "uzman yoklaması: yetkisiz uzman 404 (kart gösterilmez)");
      for (const [h, label] of [[VS, "liste"], [VD, "taş ayrıntısı"], [VG, "görsel"]] as const) {
        const r = await call(h, asN, { params: { slug: AMETH.slug }, query: "?limit=50" });
        ok(r.status === 404 && r.bytes.length === 0 && !JSON.stringify(r.json).includes(AMETH.slug), `yetkisiz uzman API ${label}: 404, veri yok`, r.status);
      }
    }

    section("A6. Veri koruması");
    const recSha1 = String(Object.values((await su.query(`select md5(string_agg(id::text || content_sha256, ',' order by id)) h from public.stone_library_records`)).rows[0])[0]);
    ok(recSha1 === recSha0, "kaynak metin kayıtları birebir aynı (owner işlemleri ayrı katmanda)");
    ok(await n(`select count(*) from public.stone_library_translations`) === 546 && await n(`select count(*) from public.stone_library_images where deleted_at is null`) === 182,
      "546 çeviri alanı + 182 kaynak görsel kaydı korunur");
    ok(external.length === 0, "dış ağa 0 istek", external.slice(0, 3));
    report.api = { pass, fail };

    if (UI) await uiTests({ OWNER, ADMIN2, EXPG, EXPN, T, AMETH, ROSE, su, n, report, setApp: (a) => { app = a; } });
    section("Z. Doğaltaş dışı veriler (uzman taşları, danışanlar, stok, satış…) test boyunca değişmedi");
    const other1 = await otherFingerprint();
    ok(other1.n === other0.n && other1.h === other0.h, `${other0.n} Doğaltaş dışı tablonun içeriği birebir aynı`, { once: other0, sonra: other1 });
  } finally {
    globalThis.fetch = realFetch;
    if (app) (app as ChildProcess).kill();
    await imp.end().catch(() => undefined);
    if (real) await real.stop().catch(() => undefined);
    await env.stop().catch(() => undefined);
  }
  report.result = { pass, fail, fails };
  writeFileSync(path.join(OUT, "f7-sonuc.json"), JSON.stringify(report, null, 1));
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exitCode = fail ? 1 : 0;
}

type U = { id: string; token: string; label: string; role: string };
type UiCtx = {
  OWNER: U; ADMIN2: U; EXPG: U; EXPN: U; T: string; AMETH: { id: string; slug: string }; ROSE: { id: string; slug: string };
  su: pg.Client; n: (sql: string, p?: unknown[]) => Promise<number>; report: Record<string, unknown>; setApp: (a: ChildProcess) => void;
};

async function uiTests(c: UiCtx) {
  const { chromium } = await import("playwright");
  section("B0. Uygulama (next start, izole Supabase)");
  const app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
    cwd: process.cwd(), stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${HTTP_PORT}`, STONE_LIBRARY_ENABLED: "true", NEXT_TELEMETRY_DISABLED: "1" },
  });
  c.setApp(app);
  app.stderr?.pipe(createWriteStream(path.join(OUT, "next-stderr.log")));
  const until = Date.now() + 180_000;
  for (;;) {
    try { const r = await fetch(`${APP}/`); if (r.status < 500) break; } catch { /* bekle */ }
    if (Date.now() > until) throw new Error("uygulama açılmadı");
    await new Promise((r) => setTimeout(r, 1000));
  }
  ok(true, "uygulama ayakta");
  const browser = await chromium.launch();
  const userJson = (u: U) => JSON.stringify({ id: u.id, tenant_id: c.T, full_name: `ZZ ${u.label}`, email: `zz.f7.${u.label}@example.test`, role: u.role, active: true,
    approval_status: "approved", package_type: "premium", plan: "premium", module_permissions: u.role === "expert" ? { stones: true } : {}, is_demo_account: false, is_super_admin: u === c.OWNER });
  const VIEWS = [{ name: "masaustu", width: 1440, height: 900 }, { name: "tablet", width: 820, height: 1180 }, { name: "telefon", width: 390, height: 844 }];
  const shots: string[] = [];
  const ctxFor = async (u: U, vp: { width: number; height: number }, adminCookie = false) => {
    const ctx = await browser.newContext({ viewport: vp, locale: "tr-TR", deviceScaleFactor: 1, isMobile: vp.width < 500, hasTouch: vp.width < 900 });
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }, ...(adminCookie ? [{ name: "yasam_admin_session", value: u.token, url: APP }] : [])]);
    await ctx.addInitScript(([uj, tok]) => { localStorage.setItem("yasam_user", uj as string); localStorage.setItem("yasam_session_token", tok as string); }, [userJson(u), u.token]);
    return ctx;
  };
  const overflow = async (page: import("playwright").Page, vpw: number) => page.evaluate((w) => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - w, vpw);
  const shot = async (page: import("playwright").Page, name: string) => { const f = path.join(OUT, "ekran", `${name}.png`); await page.screenshot({ path: f, fullPage: false }); shots.push(name); };
  const blobImgs = (page: import("playwright").Page, sel: string) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((i) => (i as HTMLImageElement).src.startsWith("blob:") && (i as HTMLImageElement).naturalWidth > 0).length, sel);

  for (const vp of VIEWS) {
    section(`B1. Owner çalışma alanı — ${vp.name} ${vp.width}×${vp.height}`);
    const ctx = await ctxFor(c.OWNER, vp);
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(`${APP}/dogaltas/kutuphane`, { waitUntil: "domcontentloaded" });
    const mgmtTab = page.getByRole("link", { name: "Kütüphane Yönetimi", exact: true });
    await mgmtTab.waitFor({ timeout: 60_000 });
    ok(await page.getByRole("searchbox").count() > 0 && await page.getByRole("link", { name: "Taş yönetimi" }).count() === 0
      && await page.getByRole("link", { name: /Kütüphaneyi kullanıma aç|Yeni Taş/ }).count() === 0 && await page.getByRole("button", { name: /Yayınla|Kaydet|Sil|Düzenle/ }).count() === 0,
      "owner: kütüphane açılınca uzman görünümü (arama / filtreler) — yönetim düğmesi / düzenleme kontrolü yok");
    await shot(page, `owner-kutuphane-uzman-gorunumu-${vp.name}`);
    await mgmtTab.click();
    await page.waitForURL(/\/dogaltas\/kutuphane\/yonetim$/, { timeout: 60_000 });
    await page.getByRole("link", { name: "Taş yönetimi" }).first().waitFor({ timeout: 60_000 });
    await page.getByText("Ametist", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 30_000 });
    ok(await page.getByRole("link", { name: "‹ Kütüphaneye Dön" }).count() === 1, "owner: 'Kütüphane Yönetimi' sekmesi → yönetim ekranı ('‹ Kütüphaneye Dön' bağlantısıyla)");
    ok(await page.getByRole("link", { name: "Kullanıma açma" }).count() > 0 && await page.getByRole("link", { name: "Uzman erişimi" }).count() > 0,
      "Doğaltaş içinden yönetim gezinmesi (taş / kullanıma açma / uzman erişimi)");
    const draftPills = await page.getByText("Taslak", { exact: true }).count();
    ok(draftPills >= 10, "katalogda taslak taşlar durumlarıyla listelenir", draftPills);
    // Küçük resimler tembel yüklenir (ekrana yaklaşınca): telefonda liste ilk ekranın altında → önce listeye kaydır.
    await page.getByText("Ametist", { exact: true }).filter({ visible: true }).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    const thumbs = await blobImgs(page, "img");
    ok(thumbs >= 3, "katalog küçük resimleri taslakta da yüklenir", thumbs);
    ok(await overflow(page, vp.width) <= 1, "yatay taşma yok (katalog)", await overflow(page, vp.width));
    await shot(page, `owner-katalog-${vp.name}`);

    // Production hatası yolu: katalogdan "Düzenle" ile İSTEMCİ İÇİ geçiş → Görseller sekmesi (Akuamarin).
    const aquaRow = page.getByText("Akuamarin", { exact: true }).filter({ visible: true }).first().locator("xpath=ancestor::*[.//a[normalize-space()='Düzenle']][1]");
    await aquaRow.getByRole("link", { name: "Düzenle" }).first().click();
    await page.waitForURL(/\/dogaltas\/kutuphane\/yonetim\/tas\//, { timeout: 60_000 });
    await page.getByRole("tab", { name: /Görseller/ }).click();
    await page.getByText("Kaynak görseli", { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    ok(await blobImgs(page, "figure img") >= 1 && await page.getByText("This page couldn", { exact: false }).count() === 0,
      "katalog → Düzenle (istemci içi geçiş) → Görseller: sayfa çökmez, kaynak görseli görünür (Akuamarin)");
    ok(await blobImgs(page, "header img") >= 1, "taş başlığındaki kapak görseli yüklenir");
    await shot(page, `owner-duzenle-gorseller-${vp.name}`);

    await page.goto(`${APP}/dogaltas/kutuphane/yonetim/tas/${c.ROSE.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /Görseller/ }).waitFor({ timeout: 60_000 });
    await page.getByRole("tab", { name: /Görseller/ }).click();
    await page.getByText("Kaynak görseli", { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    ok(await blobImgs(page, "figure img") >= 1, "Görseller sekmesi: taslak taşın kaynak görseli görünür", await blobImgs(page, "figure img"));
    ok(await page.getByText("Görsel izni Owner onayı bekliyor").count() > 0 && await page.getByText("Gösterilmez", { exact: true }).count() > 0, "görsel izni Owner onayı bekliyor + uzmana gösterilmez açıkça yazılı");
    ok(await page.getByRole("button", { name: "Kaynak görselini onayla" }).count() > 0, "onay bekleyen kaynak görseli için onay düğmesi var");
    ok(await overflow(page, vp.width) <= 1, "yatay taşma yok (görseller)", await overflow(page, vp.width));
    await shot(page, `owner-gorseller-${vp.name}`);
    await page.getByRole("tab", { name: /Çeviri/ }).click();
    await page.getByText("Doğrulanmış Türkçe çeviri").first().waitFor({ timeout: 20_000 });
    ok(await page.getByText("Kaynak metin (İngilizce)").count() > 0 && await page.getByText("Kaynak metin (Türkçe)").count() > 0, "çeviri karşılaştırması: İngilizce kaynak / Türkçe kaynak / doğrulanmış çeviri");
    ok(await page.getByText("Uzman ne görür?").count() > 0, "taş ↔ çeviri yayın ilişkisi açıklaması görünür");
    ok(await overflow(page, vp.width) <= 1, "yatay taşma yok (çeviri)", await overflow(page, vp.width));
    await shot(page, `owner-ceviri-${vp.name}`);
    ok(errs.length === 0, "sayfa hatası yok (owner)", errs.slice(0, 3));
    await ctx.close();
  }

  section("B2. Owner işlemleri (masaüstü): görsel onayı, kaynağa dönüş, yayın, düzenleme, çeviri, uzman erişimi, önizleme, Yönetim Paneli");
  {
    const ctx = await ctxFor(c.OWNER, VIEWS[0], true);
    const page = await ctx.newPage();
    await page.goto(`${APP}/dogaltas/kutuphane/yonetim/tas/${c.ROSE.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /Görseller/ }).click();
    await page.getByRole("button", { name: "Kaynak görselini onayla" }).click();
    await page.getByText("Onaylı", { exact: true }).first().waitFor({ timeout: 20_000 });
    ok(await c.n(`select count(*) from public.stone_library_images where stone_id=$1 and review_state='approved'`, [c.ROSE.id]) === 2, "arayüzden kaynak görseli onayı (2 sürüm) DB'de");
    const pngPath = path.join(OUT, "owner-test.png");
    writeFileSync(pngPath, tinyPng(20, 20, [124, 77, 219]));
    await page.locator('input[type="file"]').setInputFiles(pngPath);
    await page.getByRole("button", { name: "Görseli kaydet" }).click();
    await page.getByText("Şu an owner görseli birincil.").waitFor({ timeout: 20_000 });
    ok(true, "arayüzden owner görseli yüklendi ve birincil oldu");
    await page.getByRole("button", { name: "Kaynak görseline dön" }).click();
    await page.getByText("Şu an kaynak görseli kullanılıyor.").waitFor({ timeout: 20_000 });
    ok(true, "arayüzden kaynak görseline dönüldü");
    await shot(page, "owner-gorsel-donus-masaustu");
    await page.getByRole("tab", { name: "Yayın" }).click();
    ok(await page.getByText(/sizin adınıza\s+onaylar/).count() > 0, "Yayın sekmesi: bekleyen kayıtların yayınla birlikte onaylanacağı açıkça yazılı");
    await shot(page, "owner-yayin-sekmesi-masaustu");
    const pubBtn = page.getByRole("button", { name: "Yayınla", exact: true }).first();
    ok(!(await pubBtn.isDisabled()), "taslak taşta 'Yayınla' düğmesi etkin");
    await pubBtn.click();
    await page.getByText("Taş yayınlandı.").waitFor({ timeout: 30_000 });
    ok(await c.n(`select count(*) from public.stone_library_stones where id=$1 and status='published'`, [c.ROSE.id]) === 1, "arayüzden tek adım yayın (Gül Kuvars) DB'de");
    await page.getByRole("button", { name: "Yayından kaldır" }).first().click();
    await page.getByText("Taş yayından kaldırıldı.").waitFor({ timeout: 30_000 });
    ok(await c.n(`select count(*) from public.stone_library_stones where id=$1 and status='published'`, [c.ROSE.id]) === 0, "arayüzden yayından kaldırma");

    ok(await c.n(`select count(*) from public.stone_library_translations where stone_id=$1 and published_at is not null`, [c.ROSE.id]) === 0, "yayından kaldırma çevirileri de geri aldı (Gül Kuvars)");

    // Düzenleme ekranı: doğrulanmış Türkçe çeviri kısa kaynak Türkçeye göre öncelikli; tek "Kaydet".
    const verDesc = String((await c.su.query(`select content_tr from public.stone_library_translations where stone_id=$1 and field_key='description' and display_kind='verified_translation' and superseded_at is null order by version desc limit 1`, [c.ROSE.id])).rows[0]?.content_tr ?? "");
    await page.goto(`${APP}/dogaltas/kutuphane/yonetim/tas/${c.ROSE.id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Düzenle" }).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    const areaVals = await page.evaluate(() => [...document.querySelectorAll("textarea")].map((t) => (t as HTMLTextAreaElement).value));
    ok(verDesc.length > 20 && areaVals.some((v) => v.trim() === verDesc.trim()), "Düzenleme ekranı doğrulanmış Türkçe çeviriyi gösterir (uzmanın göreceği metin)", { verDesc: verDesc.slice(0, 40), n: areaVals.length });
    ok(await page.getByRole("button", { name: "Kaydet", exact: true }).count() === 1 && await page.getByRole("button", { name: "Taslak Kaydet" }).count() === 0
      && await page.getByRole("button", { name: "Kaydet ve Yayınla" }).count() === 0, "tek 'Kaydet' düğmesi (ayrı Taslak / Kaydet ve Yayınla yok)");
    await shot(page, "owner-duzenle-masaustu");
    await page.getByRole("tab", { name: /Çeviri/ }).click();
    await page.getByText("Doğrulanmış Türkçe çeviri").first().waitFor({ timeout: 20_000 });
    ok(await page.getByRole("button", { name: /Yayınla/ }).filter({ hasText: /çeviri|Kaydet ve/i }).count() === 0 && await page.getByText("Taşla birlikte yayınlanacak").count() > 0,
      "Çeviri sekmesi: ayrı çeviri yayın düğmesi yok; 'taşla birlikte yayınlanacak'");

    // Uzman erişimi: listeden seç → erişim ver → kaldır (otomatik yetki yok).
    await page.goto(`${APP}/dogaltas/kutuphane/yonetim/uzmanlar`, { waitUntil: "domcontentloaded" });
    const nRow = page.getByText("ZZ uzman-yetkisiz", { exact: true }).first().locator("xpath=ancestor::*[.//button][1]");
    await nRow.waitFor({ timeout: 60_000 });
    ok(await page.getByText("ZZ uzman-yetkili", { exact: true }).count() > 0 && await page.getByText("Erişimi açık").count() >= 1, "uzman listesi: ad + erişim durumu görünür");
    await shot(page, "owner-uzman-erisimi-masaustu");
    await nRow.getByRole("button", { name: "Erişim ver" }).click();
    await page.getByText(/erişim verildi/).waitFor({ timeout: 20_000 });
    ok(await c.n(`select count(*) from public.stone_library_access_grants where user_id=$1 and revoked_at is null`, [c.EXPN.id]) === 1, "arayüzden kişi bazında erişim verildi");
    await page.getByText("ZZ uzman-yetkisiz", { exact: true }).first().locator("xpath=ancestor::*[.//button][1]").getByRole("button", { name: "Erişimi kaldır" }).click();
    await page.getByText(/erişim kaldırıldı/).waitFor({ timeout: 20_000 });
    ok(await c.n(`select count(*) from public.stone_library_access_grants where user_id=$1 and revoked_at is null`, [c.EXPN.id]) === 0, "arayüzden erişim kaldırıldı");

    // Çoklu seçim: seçilen uzmanların erişimini kaldır / seçilen birden fazla uzmana tek seferde erişim ver.
    const active = (uid: string) => c.n(`select count(*) from public.stone_library_access_grants where user_id=$1 and revoked_at is null`, [uid]);
    const pick = async (label: string) => { await page.getByLabel(`${label} seç`).check(); };
    await page.getByRole("searchbox").first().fill("ZZ uzman");
    await pick("ZZ uzman-yetkili"); await pick("ZZ uzman-yetkisiz");
    ok(await page.getByRole("button", { name: "Seçilenlere erişim ver (1)" }).count() === 1 && await page.getByRole("button", { name: "Seçilenlerin erişimini kaldır (1)" }).count() === 1,
      "çoklu seçim: seçilenlere ver / seçilenlerin erişimini kaldır sayıları doğru");
    await shot(page, "owner-uzman-coklu-secim-masaustu");
    await page.getByRole("button", { name: "Seçilenlerin erişimini kaldır (1)" }).click();
    await page.getByText("1 uzmanın erişimi kaldırıldı.").first().waitFor({ timeout: 20_000 });
    ok(await active(c.EXPG.id) === 0, "seçilen uzmanın erişimi kaldırıldı");
    const gone = await fetch(`${APP}/api/dogaltas/kutuphane?limit=5`, { headers: { "x-user-id": c.EXPG.id, "x-session-token": c.EXPG.token } });
    ok(gone.status === 404, "erişimi kaldırılan uzman kütüphaneye o an erişemez (404)", gone.status);
    await pick("ZZ uzman-yetkili"); await pick("ZZ uzman-yetkisiz");
    await page.getByRole("button", { name: "Seçilenlere erişim ver (2)" }).click();
    await page.getByText("2 uzmana erişim verildi.").first().waitFor({ timeout: 20_000 });
    ok(await active(c.EXPG.id) === 1 && await active(c.EXPN.id) === 1, "seçilen 2 uzmana tek seferde erişim verildi");
    await pick("ZZ uzman-yetkisiz");
    await page.getByRole("button", { name: "Seçilenlerin erişimini kaldır (1)" }).click();
    await page.getByText("1 uzmanın erişimi kaldırıldı.").first().waitFor({ timeout: 20_000 });
    ok(await active(c.EXPG.id) === 1 && await active(c.EXPN.id) === 0, "başlangıç durumu: yalnız yetkili uzman (yetkisiz uzmanın erişimi kaldırıldı)");

    await page.goto(`${APP}/dogaltas/kutuphane?gorunum=onizleme`, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Kütüphane Yönetimi", exact: true }).waitFor({ timeout: 60_000 });
    ok(true, "eski önizleme adresi (?gorunum=onizleme) korunur: uzman görünümü + Kütüphane Yönetimi sekmesi");
    await shot(page, "owner-onizleme-masaustu");
    await page.goto(`${APP}/dogaltas/kutuphane/yonetim/uzmanlar`, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "‹ Kütüphaneye Dön" }).click();
    await page.waitForURL(/\/dogaltas\/kutuphane$/, { timeout: 60_000 });
    await page.getByRole("link", { name: "Kütüphane Yönetimi", exact: true }).waitFor({ timeout: 60_000 });
    ok(true, "yönetim alt ekranından '‹ Kütüphaneye Dön' → kütüphane (uzman görünümü)");

    await page.goto(`${APP}/admin/dogaltas-kutuphane`, { waitUntil: "domcontentloaded" });
    await page.getByText("Ametist", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 60_000 });
    ok(await page.getByRole("link", { name: "Kütüphane önizlemesi" }).count() > 0, "mevcut Yönetim Paneli adresi çalışmaya devam eder");
    await ctx.close();
  }

  for (const vp of VIEWS) {
    section(`B3. Uzman izolasyonu — ${vp.name}`);
    const g = await ctxFor(c.EXPG, vp);
    const pg1 = await g.newPage();
    await pg1.goto(`${APP}/dogaltas/kutuphane`, { waitUntil: "domcontentloaded" });
    await pg1.getByText("Ametist", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 60_000 });
    ok(await pg1.getByRole("link", { name: "Taş yönetimi" }).count() === 0 && await pg1.getByText("Gül Kuvars").count() === 0, "yetkili uzman: yalnız yayımlanmış taş, yönetim yok");
    ok(await overflow(pg1, vp.width) <= 1, "yatay taşma yok (uzman)", await overflow(pg1, vp.width));
    await shot(pg1, `uzman-yetkili-${vp.name}`);
    if (vp.name === "masaustu") {
      const box = pg1.getByRole("searchbox").first();
      await box.fill("amet");
      await pg1.waitForTimeout(1200);
      ok(await pg1.getByText("Ametist", { exact: true }).filter({ visible: true }).count() > 0, "uzman arama: 'amet' → Ametist");
      await box.fill("zzqxw");
      await pg1.waitForTimeout(1200);
      ok(await pg1.getByText("Ametist", { exact: true }).filter({ visible: true }).count() === 0, "uzman arama: eşleşmeyen sorgu → sonuç yok");
      await box.fill("");
      await pg1.waitForTimeout(1200);
      const chip = pg1.locator("button[aria-pressed]").filter({ visible: true }).first();
      await chip.click();
      await pg1.waitForTimeout(1200);
      ok(await chip.getAttribute("aria-pressed") === "true" && await pg1.getByText("Ametist", { exact: true }).filter({ visible: true }).count() > 0, "uzman filtresi: seçili filtreyle sonuç gelir");
    }
    ok(await pg1.getByRole("link", { name: "Kütüphane Yönetimi", exact: true }).count() === 0, "yetkili uzman: 'Kütüphane Yönetimi' sekmesi yok");
    for (const u of [`/dogaltas/kutuphane/yonetim/tas/${c.ROSE.id}`, "/dogaltas/kutuphane/yonetim", "/dogaltas/kutuphane/yonetim/toplu", "/dogaltas/kutuphane/yonetim/uzmanlar"]) {
      await pg1.goto(`${APP}${u}`, { waitUntil: "domcontentloaded" });
      await pg1.getByText("Bulunamadı", { exact: false }).first().waitFor({ timeout: 60_000 });
      ok(await pg1.getByText("Gül Kuvars").count() === 0 && await pg1.getByText("Ametist", { exact: true }).count() === 0 && await pg1.getByRole("button", { name: /Erişim ver|Onayla/ }).count() === 0,
        `yetkili uzman ${u.replace(c.ROSE.id, ":id")} doğrudan adresinde 'bulunamadı', veri / kontrol yok`);
    }
    await g.close();
    const nn = await ctxFor(c.EXPN, vp);
    const pg2 = await nn.newPage();
    await pg2.goto(`${APP}/dogaltas/kutuphane`, { waitUntil: "domcontentloaded" });
    await pg2.getByText("Bulunamadı", { exact: false }).first().waitFor({ timeout: 60_000 });
    ok(await pg2.getByText("Ametist").count() === 0 && await pg2.getByRole("link", { name: "Kütüphane Yönetimi", exact: true }).count() === 0, "yetkisiz uzman: kütüphane 'bulunamadı', yönetim sekmesi yok");
    await pg2.goto(`${APP}/dogaltas/kutuphane/yonetim`, { waitUntil: "domcontentloaded" });
    await pg2.getByText("Bulunamadı", { exact: false }).first().waitFor({ timeout: 60_000 });
    ok(await pg2.getByText("Ametist", { exact: true }).count() === 0, "yetkisiz uzman /yonetim doğrudan adresinde 'bulunamadı'");
    await nn.close();
  }

  section("B4. Doğaltaş modülü: 'Doğaltaş Kütüphanesi' kartı (Taş Makaleleri'nin altında 5. kart; ana menüde ayrı bağlantı yok)");
  for (const [who, label, allowed] of [[c.OWNER, "owner", true], [c.EXPG, "yetkili uzman", true], [c.EXPN, "yetkisiz uzman", false]] as const) {
    for (const vp of [VIEWS[0], VIEWS[2]]) {
      const ctx = await ctxFor(who, vp);
      const page = await ctx.newPage();
      const errs: string[] = [];
      page.on("pageerror", (e) => errs.push(e.message));
      // Kart listesi + ana panel konumu: liste görünür olduğu İLK anda ve 3 sn sonra (kayma ölçümü). Liste gizliyken
      // (yetki kesinleşmeden) sayfada kütüphane bağlantısı olmamalı.
      // Not: tarayıcıya DÜZ METİN gönderilir (tsx/esbuild'in iç fonksiyonlara eklediği __name yardımcısı tarayıcıda yok).
      type Layout = { ready: boolean; visible: boolean; links: number; hrefs: (string | null)[]; rects: string; hero: string | null };
      const layout = () => page.evaluate(`(() => {
        const ul = [...document.querySelectorAll("nav ul")].find((u) => u.querySelector('[href="/dogaltas/tas-bilgi-kutuphanesi"]'));
        const hero = [...document.querySelectorAll("h1")].find((h) => /Doğaltaş/.test(h.textContent || ""));
        const rect = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)].join(","); };
        return {
          ready: !!ul && !!hero,
          visible: !!ul && getComputedStyle(ul).visibility === "visible",
          links: document.querySelectorAll('a[href="/dogaltas/kutuphane"]').length,
          hrefs: ul ? [...ul.querySelectorAll("li > a")].map((a) => a.getAttribute("href")) : [],
          rects: ul ? [...ul.querySelectorAll("li")].map(rect).join("|") : "",
          hero: rect(hero),
        };
      })()`) as Promise<Layout>;
      const measure = async (tag: string) => {
        let early: Layout | null = null;
        const t0 = Date.now();
        let cur = await layout();
        while (!(cur.ready && cur.visible) && Date.now() - t0 < 60_000) {
          if (cur.ready && !cur.visible && !early) early = cur;
          await page.waitForTimeout(25);
          cur = await layout();
        }
        const first = cur;
        await page.waitForTimeout(3000);
        const later = await layout();
        ok(first.visible && first.hrefs.length === (allowed ? 5 : 4) && first.rects === later.rects && JSON.stringify(first.hrefs) === JSON.stringify(later.hrefs),
          `${label} (${vp.name}, ${tag}): kartlar görünür oldukları ilk anda ${allowed ? 5 : 4} adet ve 3 sn sonra aynı yerde (kayma yok)`, { first: first.hrefs, later: later.hrefs });
        ok(!early || early.links === 0, `${label} (${vp.name}, ${tag}): yetki kesinleşmeden kütüphane bağlantısı yok (liste gizli)`, early);
        return { early, first, later };
      };
      // Ana panel: kart eklenmesi onlarca px kaydırır; ilk yüklemede yazı tipi yüklenmesinden gelen ≤2 px oynama kart kaynaklı değildir.
      const sameSpot = (a: string | null | undefined, b: string | null | undefined) => {
        if (!a || !b) return a === b;
        const x = a.split(",").map(Number); const y = b.split(",").map(Number);
        return x.every((v, k) => Math.abs(v - y[k]) <= 2);
      };
      const r = await page.goto(`${APP}/dogaltas`, { waitUntil: "commit" });
      const m1 = await measure("ilk yükleme");
      if (label === "owner" || !allowed) ok(!m1.early || sameSpot(m1.early.hero, m1.later.hero), `${label} (${vp.name}, ilk yükleme): ana panel kaymadı (kart kaynaklı kayma yok; ≤2 px tolerans)`, { once: m1.early?.hero, sonra: m1.later.hero });
      await page.reload({ waitUntil: "commit" });
      const m2 = await measure("yenileme");
      ok(!m2.early || sameSpot(m2.early.hero, m2.later.hero), `${label} (${vp.name}, yenileme): ana panel kaymadı (kart sonradan eklenmiyor; ≤2 px tolerans)`, { once: m2.early?.hero, sonra: m2.later.hero });
      const menu = page.locator("nav ul").filter({ has: page.locator('a[href="/dogaltas/tas-bilgi-kutuphanesi"]') }).first();
      const card = menu.locator('a[href="/dogaltas/kutuphane"]');
      const hrefs = await menu.locator("li > a").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
      if (allowed) {
        ok(r?.status() === 200 && hrefs.length === 5 && hrefs[3] === "/dogaltas/tas-bilgi-kutuphanesi" && hrefs[4] === "/dogaltas/kutuphane",
          `${label} (${vp.name}): Doğaltaş ana ekranında 5. kart 'Doğaltaş Kütüphanesi', Taş Makaleleri'nin hemen altında`, hrefs);
        ok(await card.innerText().then((t) => t.includes("Doğaltaş Kütüphanesi")) && await card.locator("img").count() === 1
          && await menu.locator('a[href="/dogaltas/tas-bilgi-kutuphanesi"]').getAttribute("class") === await card.getAttribute("class"),
          `${label} (${vp.name}): kart diğer kartlarla aynı tasarım (aynı sınıf + ikon + başlık/alt başlık)`);
      } else {
        ok(r?.status() === 200 && hrefs.length === 4 && !hrefs.includes("/dogaltas/kutuphane"), `${label} (${vp.name}): kütüphane kartı GÖSTERİLMEZ (4 kart)`, hrefs);
      }
      ok(await page.locator('a[href="/dogaltas/kutuphane"]').count() === (allowed ? 1 : 0), `${label} (${vp.name}): sayfada başka kütüphane bağlantısı yok (ana sol menüde ayrı bağlantı kaldırıldı)`);
      if (vp.name === "telefon") ok(await overflow(page, vp.width) <= 1, `${label} (telefon): Doğaltaş ana ekranı yatay taşma yok`);
      await shot(page, `dogaltas-ana-${label.replace(/ /g, "-")}-${vp.name}`);
      if (allowed) {
        await card.click();
        await page.waitForURL(/\/dogaltas\/kutuphane$/, { timeout: 60_000 });
        await page.locator("main").getByText(/Doğaltaş Kütüphanesi/).first().waitFor({ timeout: 60_000 });
        ok(await page.getByText("Bulunamadı", { exact: false }).count() === 0, `${label} (${vp.name}): karttan kütüphaneye geçiş (bulunamadı yok)`);
        const tabs = page.locator('nav[aria-label="Doğaltaş modülü"]');
        if (label === "owner") await tabs.getByRole("link", { name: "Kütüphane Yönetimi", exact: true }).waitFor({ timeout: 60_000 });
        const tabNames = await tabs.locator("a").allInnerTexts();
        ok(JSON.stringify(tabNames.map((x) => x.trim())) === JSON.stringify(label === "owner" ? ["Doğaltaş Kütüphanesi", "Kütüphane Yönetimi"] : ["Doğaltaş Kütüphanesi"]),
          `${label} (${vp.name}): kütüphane sekmeleri — 'Taş Makaleleri' kısayolu yok${label === "owner" ? "; owner'a Kütüphane Yönetimi" : ""}`, tabNames);
      }
      ok(errs.length === 0, `${label} (${vp.name}): sayfa hatası yok`, errs.slice(0, 2));
      await ctx.close();
    }
  }
  {
    const ctx = await ctxFor(c.EXPG, VIEWS[0]);
    const page = await ctx.newPage();
    const r2 = await page.goto(`${APP}/dogaltas/tas-bilgi-kutuphanesi`, { waitUntil: "domcontentloaded" });
    ok(r2?.status() === 200, "Taş Makaleleri açılır (regresyon)", r2?.status());
    await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    ok(await page.locator('a[href="/dogaltas/kutuphane"]').count() === 0, "ana sayfa: sol menüde ayrı Doğaltaş Kütüphanesi bağlantısı yok");
    await ctx.close();
  }
  section("C. Kütüphaneyi kullanıma açma: tek onay → 91 taş + 543 çeviri → uzman görünümü → geri alma");
  {
    const before = await c.n(`select count(*) from public.stone_library_stones where status='published'`);
    const toPub = await c.n(`select count(*) from public.stone_library_stones where deleted_at is null and status <> 'published'`);
    const ownerH = { "x-admin-id": c.OWNER.id, "x-session-token": c.OWNER.token, "content-type": "application/json" };
    const st409 = await fetch(`${APP}/api/admin/dogaltas-kutuphane/toplu-yayin`, { method: "POST", headers: ownerH, body: JSON.stringify({ step: "apply", expected: { stones: 1, translations: 1 } }) });
    ok(st409.status === 409 && await c.n(`select count(*) from public.stone_library_stones where status='published'`) === before, "eski / yanlış önizleme sayısıyla uygulama reddedilir (409), hiçbir şey yayınlanmaz", st409.status);
    const a2r = await fetch(`${APP}/api/admin/dogaltas-kutuphane/toplu-yayin`, { method: "POST", headers: { "x-admin-id": c.ADMIN2.id, "x-session-token": c.ADMIN2.token, "content-type": "application/json" }, body: JSON.stringify({ step: "preview" }) });
    ok(a2r.status === 404, "owner olmayan admin toplu yayın ucuna erişemez (404)", a2r.status);

    const ctx = await ctxFor(c.OWNER, VIEWS[0]);
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(`${APP}/dogaltas/kutuphane/yonetim`, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Kütüphaneyi kullanıma aç" }).click();
    await page.getByText("Tek onay: yapılacaklar").waitFor({ timeout: 120_000 });
    const items = (await page.locator("li").allInnerTexts()).join(" | ");
    ok(items.includes(`${toPub} taş yayınlanacak`) && /\d+ doğrulanmış Türkçe çeviri alanı yayınlanacak/.test(items), "onay ekranı: taş ve çeviri sayıları + etki tek ekranda", items.slice(0, 300));
    ok(items.includes("Hiçbir uzmana erişim verilmez") && items.includes("hukuki inceleme"), "onay ekranı: yetki verilmediği ve sağlık kısıtı açıkça yazılı");
    const applyBtn = page.getByRole("button", { name: `Onayla ve kullanıma aç (${toPub} taş)` });
    ok(await applyBtn.isDisabled(), "onay kutusu işaretlenmeden uygulama düğmesi pasif");
    ok(await page.getByText("Owner onayı bekliyor — görseller uzmanlara gösterilmez.", { exact: false }).count() > 0, "görsel izni durumu ve uzmana gösterilmeme nedeni yazılı");
    ok(!/roxy/i.test(await page.locator("main").innerText()), "kullanıma açma ekranında sağlayıcı marka adı yok");
    ok(await page.getByPlaceholder(/gerekçe/i).count() === 0, "görsel izni için gerekçe alanı yok (tek onay)");
    await shot(page, "owner-kullanima-acma-onay-masaustu");
    await page.getByLabel(/taşın ve .* çeviri alanının yayınlanmasını onaylıyorum/).check();
    await applyBtn.click();
    await page.getByText(/taş ve \d+ çeviri alanı yayınlandı/).first().waitFor({ timeout: 280_000 });
    ok(await c.n(`select count(*) from public.stone_library_stones where status='published'`) === 91, "91/91 taş yayında");
    ok(await c.n(`select count(*) from public.stone_library_translations where published_at is not null`) === 543, "543 doğrulanmış çeviri alanı yayında (3 kaynak metin alanı hariç)");
    ok(await c.n(`select count(*) from public.stone_library_images where deleted_at is null and review_state='approved'`) === 182, "182 kaynak görsel kaydı onaylı");
    ok(await c.n(`select count(*) from public.stone_library_access_grants where revoked_at is null`) === 1, "toplu yayın hiçbir uzmana yetki vermedi");
    ok(await c.n(`select count(*) from public.stone_library_license_grants where evidence_status='verified'`) === 0, "görsel izni kendiliğinden doğrulanmadı");
    ok(errs.length === 0, "sayfa hatası yok (kullanıma açma)", errs.slice(0, 2));
    await shot(page, "owner-kullanima-acma-sonuc-masaustu");

    const expH = { "x-user-id": c.EXPG.id, "x-session-token": c.EXPG.token };
    const sr = await (await fetch(`${APP}/api/dogaltas/kutuphane?limit=50`, { headers: expH })).json() as { total?: number };
    ok(sr.total === 91, "yetkili uzman 91 taşı görür", sr.total);
    const dr = await (await fetch(`${APP}/api/dogaltas/kutuphane/${c.ROSE.slug}`, { headers: expH })).json() as { item?: { display?: { fields?: { display_source: string }[] } } };
    ok((dr.item?.display?.fields ?? []).some((f) => f.display_source === "DOGRULANMIS_TR_CEVIRI"), "uzman doğrulanmış Türkçe çeviriyi görür (Gül Kuvars)");
    const gi = await fetch(`${APP}/api/dogaltas/kutuphane/${c.ROSE.slug}/gorsel`, { headers: expH });
    ok(gi.status === 404, "uzman görseli: lisans doğrulanmadığı için gösterilmez (kapı korunur)", gi.status);
    const nr = await fetch(`${APP}/api/dogaltas/kutuphane?limit=5`, { headers: { "x-user-id": c.EXPN.id, "x-session-token": c.EXPN.token } });
    ok(nr.status === 404, "yetkisiz uzman yine göremez (404)", nr.status);

    // Görsel izni: Owner'ın TEK onayı (gerekçe / yeni belge yok) → yetkili uzman görseli görür; yetkisiz uzman yine göremez.
    const licBtn = page.getByRole("button", { name: "Onayla ve görselleri aç" });
    ok(await licBtn.isDisabled(), "görsel onay düğmesi onay kutusu işaretlenmeden pasif");
    await page.getByLabel("Görsel kullanım iznini Owner olarak onaylıyorum.").check();
    await licBtn.click();
    await page.getByText("Owner onaylı — görseller yetkili uzmanlara gösterilir.", { exact: false }).first().waitFor({ timeout: 280_000 });
    ok(await c.n(`select count(*) from public.stone_library_license_grants where evidence_status='verified'`) === 1, "tek onayla görsel izni Owner onaylı");
    ok(await c.n(`select count(*) from public.stone_library_source_documents where deleted_at is null`) === 1, "yeni belge oluşturulmadı; mevcut kanıt korunur");
    ok(await c.n(`select count(*) from public.stone_library_published where has_image`) === 91, "91 yayın satırında görsel var");
    const gi2 = await fetch(`${APP}/api/dogaltas/kutuphane/${c.ROSE.slug}/gorsel`, { headers: expH });
    ok(gi2.status === 200 && (gi2.headers.get("content-type") ?? "").startsWith("image/"), "Owner onayından sonra yetkili uzman görseli görür (200)", gi2.status);
    const gi3 = await fetch(`${APP}/api/dogaltas/kutuphane/${c.ROSE.slug}/gorsel`, { headers: { "x-user-id": c.EXPN.id, "x-session-token": c.EXPN.token } });
    ok(gi3.status === 404, "erişim verilmemiş uzman görseli yine göremez (404)", gi3.status);
    ok(await c.n(`select count(*) from public.stone_library_access_grants where revoked_at is null`) === 1, "görsel onayı uzman yetkisi vermedi");
    await shot(page, "owner-gorsel-izni-onayli-masaustu");
    const ph = await ctxFor(c.EXPG, VIEWS[2]);
    const pp = await ph.newPage();
    await pp.goto(`${APP}/dogaltas/kutuphane`, { waitUntil: "domcontentloaded" });
    await pp.getByText("91 taş").first().waitFor({ timeout: 60_000 });
    ok(await overflow(pp, VIEWS[2].width) <= 1, "uzman telefon görünümü: 91 taş, yatay taşma yok");
    await shot(pp, "uzman-91-tas-telefon");
    await pp.reload({ waitUntil: "domcontentloaded" });
    await pp.getByText("91 taş").first().waitFor({ timeout: 60_000 });
    await pp.waitForTimeout(1500);
    ok(await pp.locator("img").filter({ visible: true }).count() > 0, "uzman telefon görünümü: Owner onayından sonra taş görselleri görünür");
    await shot(pp, "uzman-91-tas-gorselli-telefon");
    await ph.close();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Geri alma", { exact: true }).waitFor({ timeout: 120_000 });
    await page.getByLabel(/91 taşın yayından kaldırılmasını onaylıyorum/).check();
    await page.getByRole("button", { name: "Geri al: tümünü yayından kaldır" }).click();
    await page.getByText(/taş ve \d+ çeviri alanı yayından kaldırıldı/).first().waitFor({ timeout: 280_000 });
    ok(await c.n(`select count(*) from public.stone_library_stones where status='published'`) === 0 && await c.n(`select count(*) from public.stone_library_translations where published_at is not null`) === 0,
      "geri alma: 0 taş, 0 çeviri yayında (veri silinmedi)");
    ok(await c.n(`select count(*) from public.stone_library_stones where deleted_at is null`) === 91 && await c.n(`select count(*) from public.stone_library_translations`) === 546, "91 taş + 546 çeviri kaydı korunur");
    await ctx.close();
    const mob = await ctxFor(c.OWNER, VIEWS[2]);
    const mp = await mob.newPage();
    await mp.goto(`${APP}/dogaltas/kutuphane/yonetim/toplu`, { waitUntil: "domcontentloaded" });
    await mp.getByText("Tek onay: yapılacaklar").waitFor({ timeout: 120_000 });
    ok(await overflow(mp, VIEWS[2].width) <= 1, "kullanıma açma ekranı telefonda taşmasız");
    await shot(mp, "owner-kullanima-acma-telefon");
    await mob.close();
  }

  await browser.close();
  c.report.ui = { screenshots: shots };
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
