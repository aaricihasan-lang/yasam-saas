/**
 * Doğaltaş Kütüphanesi F2 — AKTARIM MOTORU + OWNER API + GÖRSEL + GÜVENLİK + PERFORMANS testi.
 * İzole embedded-postgres + PostgREST/Storage shim + migration F1 (20271201000000) + F2 (20271201000100) + GERÇEK route'lar.
 * Prod/Preview'a SIFIR temas. Sağlayıcı SAHTE (scripts/stone-library/fakeCrystals.ts, sentetik ZZ_* içerik); gerçek
 * sağlayıcıya çağrı YOK (dış ağ kilidi sayar, beklenen 0). Gerçek anahtar bu süreçte KULLANILMAZ.
 * Çalıştır: npx tsx scripts/stone-library/f2-harness.ts   (STONE_LIBRARY_F2_PG_PORT, varsayılan 54591)
 */
import "../hd-analysis-word-flow/env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { createFakeCrystals, fakeId, type Fault, type ImageFault } from "./fakeCrystals";
import { runCrystalImport, type LedgerEntry, type RunnerSummary } from "../../lib/stone-library/import/runner";
import { detectLanguage, trFieldFlags, isDuplicateOf } from "../../lib/stone-library/import/langQuality";
import { hasHealthClaim } from "../../lib/stone-library/import/healthLexicon";
import { planCrystal } from "../../lib/stone-library/import/roxyNormalize";
import { processImage, sniffImage } from "../../lib/stone-library/import/imageProcess";
import { buildCrystalsUrl, isAllowedCrystalImageUrl } from "../../lib/stone-library/import/roxyCrystalsClient";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 700)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

type Who = { id: string; token: string };
type Res = { status: number; body: string; json: Record<string, unknown>; cache: string | null; type: string | null; bytes: Buffer };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(h: Handler, auth: { kind: "user" | "admin"; id?: string; token?: string } | null,
  o: { method?: string; body?: unknown; rawBody?: string; query?: string; params?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" };
  if (auth?.id) headers[auth.kind === "admin" ? "x-admin-id" : "x-user-id"] = auth.id;
  if (auth?.token) headers["x-session-token"] = auth.token;
  const bodyText = o.rawBody ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined);
  if (bodyText !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest(`http://localhost/api/test${o.query ?? ""}`, { method: o.method ?? "GET", headers, body: bodyText });
  const res = await h(req, { params: Promise.resolve(o.params ?? {}) });
  const bytes = Buffer.from(await res.arrayBuffer());
  const body = bytes.toString("utf8");
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(body) as Record<string, unknown>; } catch { /* json değil */ }
  return { status: res.status, body, json, cache: res.headers.get("cache-control"), type: res.headers.get("content-type"), bytes };
}

async function main() {
  // Dış ağ kilidi: yalnız 127.0.0.1 shim'i ve SAHTE sağlayıcı (roxyapi.com → fake). Her şey sayılır.
  const external: string[] = [];
  const realFetch = globalThis.fetch;
  let fakeHandler: ((u: string, i?: RequestInit) => Promise<Response>) | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    if (/^https:\/\/roxyapi\.com\//.test(u) && fakeHandler) return fakeHandler(u, init);
    external.push(u);
    throw new Error(`harness: dış ağ yasak ${u}`);
  }) as typeof fetch;

  // Tüm stone_library fonksiyonları shim'de yönlendirilir; yetki DB'de (service_role EXECUTE yalnız sözleşmedekilerde).
  const fns = [...new Set([...(mig("20271201000000_stone_library_core.sql") + mig("20271201000100_stone_library_f2.sql")).matchAll(/FUNCTION public\.(stone_library_[a-z_]+)\(/g)].map((m) => m[1]))];
  const env2: TestEnv = await startAnamnezTestEnv({
    port: Number(process.env.STONE_LIBRARY_F2_PG_PORT ?? 54591), dirName: `stone-library-f2-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: fns, extraSql: [mig("20271201000000_stone_library_core.sql"), mig("20271201000100_stone_library_f2.sql")],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env2.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.STONE_LIBRARY_ENABLED = "true";
  process.env.ROXY_API_KEY = "zz-harness-fake-roxy-key";
  const su = env2.su;
  const db = createClient(env2.url, SERVICE_KEY, { auth: { persistSession: false } });
  const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []): Promise<T[]> => (await su.query(sql, p)).rows as T[];
  const one = async (sql: string, p: unknown[] = []): Promise<unknown> => { const r = await su.query(sql, p); const row = r.rows[0] as Record<string, unknown> | undefined; return row ? Object.values(row)[0] : undefined; };
  const errCode = async (sql: string, p: unknown[] = []) => { try { await su.query(sql, p); return null; } catch (e) { return (e as { code?: string }).code ?? "?"; } };

  try {
    section("0. Şema ve ayrıcalıklar (F1 + F2)");
    const tbl = await q<{ relname: string; rls: boolean }>(`select relname, relrowsecurity rls from pg_class where relname like 'stone\\_library\\_%' and relkind='r'`);
    ok(tbl.length === 19 && tbl.every((t) => t.rls), "19 tablo (F1 17 + F2 2), hepsinde RLS açık", tbl.length);
    const priv = await q<{ n: number }>(`select count(*)::int n from (select t.relname, r from pg_class t, unnest(array['anon','authenticated','service_role']) r
      where t.relname like 'stone\\_library\\_%' and t.relkind='r' and has_table_privilege(r, t.oid, 'SELECT,INSERT,UPDATE,DELETE')) x`);
    ok(priv[0].n === 0, "hiçbir rolün 19 tabloda ayrıcalığı yok (service_role dahil)");
    const svcFns = Number(await one(`select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'stone\\_library\\_%' and p.proname <> 'stone_library_fold' and has_function_privilege('service_role', p.oid, 'EXECUTE')`));
    ok(svcFns === 44, "service_role yalnız sözleşmedeki 44 RPC'yi çalıştırabilir (F1 27 + F2 17)", svcFns);
    const anonFns = Number(await one(`select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'stone\\_library\\_%' and p.proname <> 'stone_library_fold' and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))`));
    ok(anonFns === 0, "anon / authenticated hiçbir stone_library RPC'sini çalıştıramaz");
    ok((await q(`select public from storage.buckets where id='stone-library-images'`))[0]?.public === false, "görsel bucket'ı PRIVATE");
    for (const t of ["stone_library_images", "stone_library_license_grants"]) {
      const g = await realFetch(`${env2.url}/rest/v1/${t}?select=*`, { headers: { apikey: SERVICE_KEY } });
      ok(g.status === 403, `service_role REST GET ${t} → 403`, g.status);
    }

    // ── Kullanıcılar ───────────────────────────────────────────────────────────────────────────
    const T = [randomUUID(), randomUUID()];
    for (const [i, t] of T.entries()) await su.query(`insert into public.tenants(id, name) values ($1,$2)`, [t, `ZZ_F2_T${i}`]);
    let seq = 0;
    const mk = async (label: string, o: { role?: string; stones?: boolean; demo?: boolean; superAdmin?: boolean; tenant?: string } = {}): Promise<Who> => {
      const id = randomUUID(); const token = `zz-f2-tok-${++seq}-${id.slice(0, 8)}`; const role = o.role ?? "expert";
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account, is_super_admin, admin_level)
        values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7,$8,$9)`,
        [id, `ZZ_F2_${label}`, `zz.f2.${label.toLowerCase()}@example.test`, role, JSON.stringify(role === "expert" ? { stones: o.stones ?? true, clients: true } : {}),
          o.tenant ?? T[0], o.demo === true, o.superAdmin === true, role === "admin" ? "owner" : null]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const OWNER = await mk("OWNER", { role: "admin", superAdmin: true });
    const ADMIN = await mk("ADMIN", { role: "admin" });
    const DEMO_OWNER = await mk("DEMOOWNER", { role: "admin", superAdmin: true, demo: true });
    const E1 = await mk("E1");
    const E2 = await mk("E2", { tenant: T[1] });
    const asAdmin = (w: Who) => ({ kind: "admin" as const, id: w.id, token: w.token });
    const asUser = (w: Who) => ({ kind: "user" as const, id: w.id, token: w.token });

    // ── Kaynak + lisans ────────────────────────────────────────────────────────────────────────
    const owner = (fn: string, args: Record<string, unknown>) => db.rpc(fn, { p_actor: OWNER.id, ...args }).then(({ data, error }) => {
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === "object" && fn in data[0] ? (data[0] as Record<string, unknown>)[fn] : data;
    });
    const SRC = String(await owner("stone_library_source_save", { p_source_id: null, p_data: { source_key: "zz-sentetik-api", kind: "api", real_name: "RoxyAPI (ZZ sentetik)", provider_code: "roxy" } }));
    await owner("stone_library_source_save", { p_source_id: SRC, p_data: { license_type: "api_terms", license_terms_url: "https://example.test/terms", license_terms_sha256: "a".repeat(64), commercial_use_ok: true, status: "active", image_rights: "rehost_ok" } });
    const DOC = String(await owner("stone_library_document_add", { p_source_id: SRC, p_data: { doc_kind: "permission_letter", title: "ZZ yazılı görsel izni (sentetik)", content_sha256: "e".repeat(64) } }));
    const LIC = String(await owner("stone_library_license_grant_save", { p_grant_id: null, p_data: {
      source_id: SRC, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "ZZ sağlayıcı destek ekibi", commercial_display: true, storage_allowed: true,
      post_subscription_rights: true, attribution_required: false, modification_allowed: true, redistribution_limit: "Bağımsız veri seti veya API olarak yeniden dağıtılamaz.",
      max_resolution: "300x300", document_id: DOC } }));
    const TERMS = "b".repeat(64);

    const ledger: LedgerEntry[] = [];
    const run = async (fake: ReturnType<typeof createFakeCrystals>, extra: Partial<Parameters<typeof runCrystalImport>[0]> = {}): Promise<RunnerSummary> => {
      fakeHandler = fake.handler;
      return runCrystalImport({ db, actor: OWNER.id, sourceId: SRC, licenseGrantId: LIC, client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "sentetik-test-anahtari-0123456789abcdef", fetchImpl: fake.handler, timeoutMs: 300 },
        imageFetch: fake.handler, includeImages: true, includeBirthstones: true, includeVocabLists: true, creditCap: 1000, allowanceRemaining: 1000, quotaFloor: 5000,
        termsSha256: TERMS, sleep: async () => undefined, ledger: (e) => ledger.push(e), ...extra });
    };

    // ── 1) Saf modüller ────────────────────────────────────────────────────────────────────────
    section("1. Saf modüller (dil, sağlık, normalizasyon, URL / görsel doğrulama)");
    ok(detectLanguage("ZZ taşı sakin ve dengeli bir enerji için kullanılır ve bu metin bir denemedir.").lang === "tr", "TR metin tespiti");
    ok(detectLanguage("ZZ stone is a calm crystal and this text is used for the test of the stone.").lang === "en", "EN metin tespiti");
    ok(detectLanguage("Huzur").lang === "unknown", "çok kısa metinde karar verilmez");
    ok(trFieldFlags("Same text here for the stone.", "Same text here for the stone.").includes("tr_equals_en"), "TR = EN → tr_equals_en + lang_suspect (silinmez, işaretlenir)");
    ok(trFieldFlags("This is an English sentence and it is the text of the stone.", "x").includes("lang_suspect"), "TR alanında İngilizce metin → lang_suspect");
    ok(isDuplicateOf("It helps with headaches and sleep issues today. It also supports immunity for real.", "It helps with headaches and sleep issues today. It also supports immunity for real."), "tekrar eden metin tespiti");
    ok(hasHealthClaim("Baş ağrısını hafifletir") && hasHealthClaim("supports the immune system") && !hasHealthClaim("ruhsal denge ve huzur") && !hasHealthClaim("healing crystal for calm"),
      "sağlık sözlüğü: tıbbi iddia yakalanır, genel ruhsal metin işaretlenmez");
    for (const t of ["ZZ metni hastalığı uzaklaştırır.", "Insomnia için ZZ kullanılır.", "IMMUNE ZZ", "Inflammation ZZ", "ZZ may treat stress", "ZZ purifies the blood",
      "ZZ during pregnancy", "ZZ soothes the nervous system", "ZZ improves overall health", "ZZ iyileştirici kabul edilir", "ZZ sinir sistemini rahatlatır"]) {
      ok(hasHealthClaim(t), `sağlık sözlüğü (çekim / büyük I / sentetik örnek): "${t}"`);
    }
    ok(!hasHealthClaim("ZZ taşı huzur ve sezgi verir.") && !hasHealthClaim("ZZ is a stone of calm, intuition and protection."), "ruhsal / duygusal genel ifadeler kilitlenmez");
    const cross = planCrystal({ id: "zz-h", name: "ZZ H", meaning: { emotional: "Relieves insomnia and anxiety disorder." } }, { id: "zz-h", name: "ZZ H", meaning: { emotional: "Duygusal dengeyi destekler ve sakinlik verir." } })!;
    ok(cross.records.filter((r) => r.field === "meaning_emotional").every((r) => r.health), "sağlık işareti diller arası yayılır (EN'de iddia → TR de kilitli)", cross.records.map((r) => [r.lang, r.health]));
    ok(trFieldFlags("Zz zz zz zz", null).includes("lang_suspect"), "TR alanı: karar verilemeyen + Türkçe karaktersiz ≥ 3 kelime → lang_suspect");
    const p = planCrystal({ id: "zz-x", name: "ZZ X", imageUrl: "https://roxyapi.com/img/crystals/zz-x.jpg", description: "d", meaning: { spiritual: null, emotional: "e", physical: "p", extra: 1 },
      chakras: ["Third Eye", "Bogus"], zodiacSigns: ["pisces"], planet: "Chiron", elements: ["Storm"], colors: ["multi-colored"], hardness: 7, numericalVibration: 3, keywords: ["A"], birthMonth: 13, affirmation: "a", pairsWith: ["zz-y"], newThing: 1 }, null);
    ok(!!p && p.unknownKeys.includes("newThing") && p.unknownKeys.includes("meaning.extra"), "bilinmeyen alanlar sessizce atılmaz, raporlanır", p?.unknownKeys);
    ok(!!p && p.issues.some((i) => i.startsWith("vocab_missing:chakra")) && p.issues.some((i) => i === "vocab_missing:planet:Chiron") && p.issues.includes("birth_month_invalid") && p.issues.includes("tr_missing"),
      "sözlük dışı / geçersiz değerler olay olarak raporlanır", p?.issues);
    ok(!!p && p.facets.some((f) => f.facet === "color" && f.value_key === "multicolor" && f.value_text === "multi-colored") && p.facets.some((f) => f.facet === "element" && f.value_key === "storm"), "renk ailesi normalizasyonu (özgün metin korunur) + Storm elementi");
    const pc = planCrystal({ id: "zz-c", name: "ZZ C", zodiacSigns: ["All birth signs"], elements: ["Fire / Earth", "All (Earth", "Water)"], planet: "Venus & Neptune",
      colors: ["apple green", "black-green", "colourless", "zzunknowncolor"], chakras: [], keywords: [], pairsWith: [] }, null)!;
    const keys = (f: string) => pc.facets.filter((x) => x.facet === f).map((x) => x.value_key).sort().join(",");
    ok(keys("zodiac").split(",").length === 12 && pc.issues.some((i) => i.startsWith("zodiac_all_expanded")), "burç 'All birth signs' → 12 burç + owner'a olay", pc.issues);
    ok(keys("element") === "earth,fire,water" && pc.issues.some((i) => i.startsWith("element_all_ambiguous")), "bileşik element bölündü; belirsiz 'All' genişletilmedi, işaretlendi", keys("element"));
    ok(keys("planet") === "neptune,venus", "bileşik gezegen bölündü (Venus & Neptune)", keys("planet"));
    ok(keys("color") === "black,clear,green" && pc.issues.includes("color_unmapped:zzunknowncolor"), "serbest renk metni → renk aileleri; eşlenemeyen olay olur", { c: keys("color"), i: pc.issues });
    ok(p?.records.find((r) => r.field === "meaning_physical")?.health === true, "fiziksel etki daima sağlık hassas");
    ok(planCrystal({ id: "../etc", name: "x" }, null) === null, "geçersiz harici kimlik reddedilir");
    ok(buildCrystalsUrl({ baseUrl: "https://roxyapi.com/api/v2", apiKey: "k" }, "/crystals/amethyst", { lang: "tr" }) !== null
       && buildCrystalsUrl({ baseUrl: "https://roxyapi.com/api/v2", apiKey: "k" }, "/astrology/x", {}) === null
       && buildCrystalsUrl({ baseUrl: "https://roxyapi.com/api/v2", apiKey: "k" }, "/crystals/../x", {}) === null
       && buildCrystalsUrl({ baseUrl: "http://evil.test", apiKey: "k" }, "/crystals", {}) === null, "istemci yalnız beyaz listedeki kristal yollarına / https tabanına gider");
    ok(isAllowedCrystalImageUrl("https://roxyapi.com/img/crystals/amethyst.jpg") && !isAllowedCrystalImageUrl("https://roxyapi.com/img/tarot/x.jpg")
       && !isAllowedCrystalImageUrl("https://evil.test/img/crystals/x.jpg") && !isAllowedCrystalImageUrl("http://roxyapi.com/img/crystals/x.jpg"), "görsel indirme yalnız izinli kristal görsel yolundan (diğer sağlayıcı görselleri kapsam dışı)");
    const jpg = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
    const good = await processImage(jpg, "image/jpeg");
    ok(good.ok && good.original.width === 300 && good.optimized.mime === "image/webp" && good.original.sha256 === createHash("sha256").update(jpg).digest("hex"), "geçerli görsel: 300×300 korunur, SHA-256, optimize WebP");
    ok(good.ok && good.optimized.width === 300 && good.optimized.height === 300, "optimize sürüm çözünürlüğü korur");
    const optCheck = good.ok ? await sharp(good.optimized.bytes).metadata() : null;
    ok(optCheck?.format === "webp", "optimize sürüm gerçekten WebP (bütünlük)");
    ok((await processImage(jpg.subarray(0, 200), "image/jpeg")).ok === false, "kesik / bozuk JPEG reddedilir");
    const r1 = await processImage(jpg, "image/png");
    ok(!r1.ok && r1.reason === "mime_mismatch", "başlık MIME ≠ içerik → reddedilir");
    const r2 = await processImage(Buffer.from("<html></html>"), "image/jpeg");
    ok(!r2.ok && r2.reason === "type_unknown", "görsel olmayan içerik reddedilir");
    const r3 = await processImage(Buffer.alloc(3 * 1024 * 1024, 1), "image/jpeg");
    ok(!r3.ok && r3.reason === "too_large", "2 MB üstü reddedilir");
    ok(sniffImage(Buffer.from("RIFF0000WEBP")) === "image/webp", "WebP magic tespiti");
    const bomb = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png({ compressionLevel: 9 }).toBuffer();
    const rssBefore = process.memoryUsage().rss;
    const rb = await processImage(bomb, "image/png");
    const rssDelta = process.memoryUsage().rss - rssBefore;
    ok(!rb.ok && rb.reason === "dimensions", `dekompresyon bombası (5000² PNG, ${Math.round(bomb.length / 1024)} KB) tam çözümlemeden önce reddedildi`, rb);
    ok(rssDelta < 60 * 1024 * 1024, `bomba reddinde bellek artışı sınırlı (${Math.round(rssDelta / 1048576)} MB)`);

    // ── 2) Tam aktarım (sentetik 91 taş) ───────────────────────────────────────────────────────
    section("2. Tam aktarım — 91 sentetik taş, TR + EN, görseller");
    const imageFaults = new Map<string, ImageFault>([[fakeId(5), "corrupt"], [fakeId(6), "wrong_mime"], [fakeId(7), "too_large"], [fakeId(8), "404"], [fakeId(9), "small"], [fakeId(20), "html"]]);
    const fake1 = createFakeCrystals({ count: 91, quotaRemaining: 29000, trFallback: new Set([fakeId(3)]), extraField: new Set([fakeId(4)]), imageFaults,
      duplicateImageOf: new Map([[fakeId(31), fakeId(30)]]),
      faults: new Map<string, Fault>([[`${fakeId(40)}|tr`, "500"], [`${fakeId(41)}|en`, "timeout"], [`${fakeId(42)}|tr`, "429"], [`${fakeId(43)}|en`, "badjson"]]) });
    const t0 = Date.now();
    const s1 = await run(fake1);
    const tImport = Date.now() - t0;
    console.log(`    (ölçüm) 91 taş tam aktarım: ${tImport} ms`);
    ok(s1.status === "completed", "paket tamamlandı", s1.stopReason);
    ok(s1.catalogTotal === 91 && s1.catalogIds.length === 91, "katalog toplamı sağlayıcıdan doğrulandı (91)", s1.catalogTotal);
    const apiCalls = fake1.calls.filter((c) => c.kind === "api").length;
    ok(apiCalls === s1.paidCalls, `ücretli çağrı sayısı defterle birebir (${s1.paidCalls})`, { apiCalls, paid: s1.paidCalls });
    ok(s1.paidCalls === 2 + 2 + 182 + 12 + 4, "plan: 2 liste + 2 sözlük + 182 detay + 12 doğum ayı + 4 sınırlı yeniden deneme = 202", s1.paidCalls);
    ok(Number(await one(`select calls_used from public.stone_library_import_batches where id=$1`, [s1.batchId])) === s1.paidCalls + s1.imageDownloads,
      "DB kredi defteri (calls_used) = ücretli API çağrısı + görsel indirme (temkinli; görseller de tavana sayılır)", { db: await one(`select calls_used from public.stone_library_import_batches where id=$1`, [s1.batchId]), api: s1.paidCalls, img: s1.imageDownloads });
    ok(s1.stonesCreated === 91, "91 taş kartı oluşturuldu", s1.stonesCreated);
    ok(Number(await one(`select count(*)::int from public.stone_library_stones where status='draft'`)) === 91, "hepsi TASLAK (yayın yok)");
    ok(Number(await one(`select count(*)::int from public.stone_library_published`)) === 0, "yayın yüzeyi BOŞ — owner incelemesi olmadan hiçbir şey yayımlanmadı");
    ok(Number(await one(`select count(*)::int from public.stone_library_records where review_state<>'pending'`)) === 0, "tüm kayıtlar onay BEKLİYOR");
    ok(Number(await one(`select count(*)::int from public.stone_library_raw where batch_id=$1 and http_status between 200 and 299`, [s1.batchId])) === 198, "198 başarılı ham yanıt değiştirilemez olarak saklandı");
    ok(s1.unknownKeys.includes("zzExtraField"), "beklenmeyen API alanı tespit edildi", s1.unknownKeys);
    ok((s1.issues[fakeId(13)] ?? []).some((i) => i.includes("vocab_missing:planet:Chiron")), "sözlük dışı gezegen raporlandı (Chiron)");
    ok(s1.vocabLists.planets?.includes("Chiron") === true && s1.vocabLists.colors?.length === 7, "renk / gezegen listeleri sözlük karşılaştırması için alındı");
    ok(Number(await one(`select count(*)::int from public.stone_library_facets f left join public.stone_library_vocab v on v.facet='color' and v.value_key=f.value_key where f.facet='color' and v.value_key is null`)) === 0,
      "her renk facet'i Türkçe etiketli sözlük ailesinde");
    const tr3 = await q<{ flags: string[]; content: string }>(`select quality_flags flags, content from public.stone_library_records r join public.stone_library_external_ids e on e.stone_id=r.stone_id where e.external_id=$1 and r.lang='tr' and r.field_key='description'`, [fakeId(3)]);
    ok(tr3.length === 1 && tr3[0].flags.includes("lang_suspect") && tr3[0].flags.includes("tr_equals_en"), "TR'si İngilizceye düşen alan SİLİNMEDİ, işaretlendi (lang_suspect + tr_equals_en)", tr3);
    const name10 = await q<{ name_tr: string; name_en: string }>(`select s.name_tr, s.name_en from public.stone_library_stones s join public.stone_library_external_ids e on e.stone_id=s.id where e.external_id=$1`, [fakeId(10)]);
    ok(name10[0]?.name_tr === name10[0]?.name_en && (await q(`select 1 from public.stone_library_import_events where batch_id=$1 and kind='tr_name_missing' and external_id=$2`, [s1.batchId, fakeId(10)])).length === 1,
      "Türkçe adı olmayan taş kaydedildi + 'tr_name_missing' olayı (owner düzeltir)");
    ok(Number(await one(`select count(*)::int from public.stone_library_records where field_key='meaning_physical' and not health_sensitive`)) === 0, "tüm fiziksel etki kayıtları sağlık hassas");
    ok(Number(await one(`select count(*)::int from public.stone_library_records where 'duplicate_text' = any(quality_flags)`)) > 0, "EN tekrar eden metin işaretlendi (duplicate_text)");
    const kwSuspect = Number(await one(`select count(*)::int from public.stone_library_facets where facet='keyword' and lang='tr' and 'lang_suspect' = any(quality_flags)`));
    ok(kwSuspect > 0, "TR = EN anahtar kelime işaretlendi", kwSuspect);
    // Hata senaryoları
    const ev = await q<{ kind: string; external_id: string | null }>(`select kind, external_id from public.stone_library_import_events where batch_id=$1 and level='error'`, [s1.batchId]);
    ok(ev.some((e) => e.kind === "http_500" && e.external_id === fakeId(40)), "500 hatası günlüğe yazıldı");
    ok(ev.some((e) => e.kind === "timeout" && e.external_id === fakeId(41)), "zaman aşımı günlüğe yazıldı");
    ok(ev.some((e) => e.kind === "http_429"), "429 günlüğe yazıldı ve tek kez yeniden denendi");
    ok(ev.some((e) => e.kind === "malformed_json" && e.external_id === fakeId(43)), "bozuk JSON günlüğe yazıldı");
    ok(Object.keys(s1.issues).every((k) => !(s1.issues[k] ?? []).some((i) => i.startsWith("detail_failed"))), "geçici hatalar sınırlı ikinci turda tamamlandı (eksik detay yok)", s1.issues);
    // Görseller
    ok(s1.imagesStored === 91 - 5, `görseller: ${s1.imagesStored} depolandı (5 bilinçli bozuk reddedildi)`, s1.imageFailures);
    const reasons = Object.fromEntries(s1.imageFailures.map((f) => [f.id, f.reason]));
    ok(reasons[fakeId(5)] === "corrupt" && reasons[fakeId(6)] === "mime_mismatch" && reasons[fakeId(7)] === "too_large" && reasons[fakeId(8)] === "http" && reasons[fakeId(20)] === "type_unknown",
      "bozuk / yanlış MIME / çok büyük / 404 / HTML görsel reddedildi", reasons);
    const imgRows = await q<{ variant: string; n: number }>(`select variant, count(*)::int n from public.stone_library_images group by variant order by 1`);
    ok(JSON.stringify(imgRows) === JSON.stringify([{ variant: "optimized", n: 86 }, { variant: "original", n: 86 }]), "her görsel için özgün + optimize kayıt", imgRows);
    ok((await q(`select 1 from public.stone_library_images i join public.stone_library_external_ids e on e.stone_id=i.stone_id where e.external_id=$1 and 'duplicate_image' = any(i.quality_flags)`, [fakeId(31)])).length >= 1,
      "iki taşta aynı görsel → duplicate_image işareti");
    ok((await q(`select 1 from public.stone_library_images i join public.stone_library_external_ids e on e.stone_id=i.stone_id where e.external_id=$1 and 'size_unexpected' = any(i.quality_flags)`, [fakeId(9)])).length >= 1,
      "300×300 dışı görsel → size_unexpected (reddedilmez)");
    const stored = await q<{ storage_path: string; sha256: string }>(`select storage_path, sha256 from public.stone_library_images where variant='original' limit 5`);
    let shaOk = 0;
    for (const s of stored) {
      const dl = await db.storage.from("stone-library-images").download(s.storage_path);
      if (dl.data && createHash("sha256").update(Buffer.from(await dl.data.arrayBuffer())).digest("hex") === s.sha256) shaOk++;
    }
    ok(shaOk === stored.length, "depodaki görsel baytlarının SHA-256'sı kayıtla birebir (5 örnek)");
    ok(stored.every((s) => !/roxy/i.test(s.storage_path)), "depo yolunda sağlayıcı adı yok");
    ok(ledger.filter((l) => l.kind === "image").every((l) => l.creditCounted === 1) && ledger.filter((l) => l.kind === "api").every((l) => l.creditCounted === 1), "defter: API çağrısı ve görsel indirme 1'er kredi (en kötü durum)");

    // ── 3) Tekrar aktarım: mükerrer yok, kredi yok ─────────────────────────────────────────────
    section("3. Tekrar aktarım (idempotent)");
    const counts = async () => (await q<{ t: string; n: number }>(`select 'stones' t, count(*)::int n from public.stone_library_stones union all select 'records', count(*)::int from public.stone_library_records
      union all select 'facets', count(*)::int from public.stone_library_facets union all select 'images', count(*)::int from public.stone_library_images union all select 'ext', count(*)::int from public.stone_library_external_ids order by 1`));
    const c1 = await counts();
    const callsBefore = fake1.calls.length;
    const s2 = await run(fake1);
    const newCalls = fake1.calls.slice(callsBefore);
    ok(s2.status === "completed" && s2.paidCalls === 0 && newCalls.filter((c) => c.kind === "api").length === 0, "ikinci aktarımda 0 ücretli çağrı (ham yanıtlar yeniden kullanıldı)", { paid: s2.paidCalls });
    ok(newCalls.filter((c) => c.kind === "image").length === 5 && s2.imagesSkippedExisting === 86, "görsel: kayıtlı 86 görsel yeniden indirilmedi; yalnız önceden reddedilen 5 tekrar denendi", { img: newCalls.filter((c) => c.kind === "image").length, skip: s2.imagesSkippedExisting });
    ok(JSON.stringify(c1) === JSON.stringify(await counts()), "mükerrer taş / kayıt / facet / görsel / kimlik oluşmadı");
    ok(s2.stonesExisting === 91 && s2.stonesCreated === 0, "mevcut kartlar kaynak kimliğiyle eşleşti");

    // ── 4) Kaynak değişikliği: yeni sürüm bekler, yayındaki ezilmez ─────────────────────────────
    section("4. Kaynak değişikliği tespiti");
    const fake2 = createFakeCrystals({ count: 91, quotaRemaining: 28000, revision: 2 });
    const s3 = await run(fake2, { forceRefetch: true, includeImages: false, includeBirthstones: false, includeVocabLists: false });
    ok(s3.status === "completed" && s3.paidCalls === 2 + 182, "forceRefetch: yalnız liste + detaylar yeniden çekildi", s3.paidCalls);
    const v = await q<{ n: number }>(`select count(*)::int n from public.stone_library_records r join public.stone_library_external_ids e on e.stone_id=r.stone_id where e.external_id=$1 and r.field_key='description' and r.lang='tr'`, [fakeId(1)]);
    ok(v[0].n === 2, "değişen içerik → yeni sürüm (eski sürüm korunur)", v);
    ok(Number(await one(`select count(*)::int from public.stone_library_records r join public.stone_library_external_ids e on e.stone_id=r.stone_id where e.external_id=$1 and r.field_key='description' and r.lang='tr' and r.is_current and r.content like '%sürüm 1%'`, [fakeId(1)])) === 1,
      "güncel sürüm değişmedi (yeni sürüm owner onayını bekler)");

    // ── 5) Kısmi aktarım + devam ───────────────────────────────────────────────────────────────
    section("5. Kesinti ve kaldığı yerden devam");
    await su.query(`select public.stone_library_batch_rollback($1, id, 'test') from public.stone_library_import_batches where status in ('completed','stopped')`, [OWNER.id]);
    const before5 = Number(await one(`select count(*)::int from public.stone_library_raw`));
    const fake3 = createFakeCrystals({ count: 91, quotaRemaining: 27000, revision: 3 });
    const s4 = await run(fake3, { abortAfterCalls: 60, includeImages: false });
    ok(s4.status === "stopped" && s4.stopReason === "simulated_interrupt" && s4.paidCalls === 60, "60 çağrıdan sonra kesildi; paket 'stopped'", { st: s4.status, r: s4.stopReason, p: s4.paidCalls });
    const s5 = await run(fake3, { includeImages: false });
    ok(s5.status === "completed" && s5.reusedResponses >= 59 && s4.paidCalls + s5.paidCalls === 198, `devam: tamamlanan ${s5.reusedResponses} yanıt yeniden kullanıldı; toplam ücretli = 198 (çift ödeme yok)`, { a: s4.paidCalls, b: s5.paidCalls, reuse: s5.reusedResponses });
    ok(Number(await one(`select count(*)::int from public.stone_library_raw`)) - before5 === 198, "ham kayıt: kesinti + devam toplamı tam 198 (tekrar yok)");

    // ── 6) Kredi / kota / yetki durdurmaları ───────────────────────────────────────────────────
    section("6. Kredi tavanı, kota tabanı, 401");
    const s6 = await run(createFakeCrystals({ count: 91, quotaRemaining: 26000, revision: 4 }), { forceRefetch: true, creditCap: 10, allowanceRemaining: 10 });
    ok(s6.status === "stopped" && s6.stopReason === "credit_cap" && s6.paidCalls + s6.imageDownloads === 10, "kredi tavanı 10 → API + görsel toplamı 10'da DURDU (DB zorunlu)", { r: s6.stopReason, p: s6.paidCalls, i: s6.imageDownloads });
    const s6b = await run(createFakeCrystals({ count: 91, quotaRemaining: 26000, revision: 5 }), { forceRefetch: true, creditCap: 500, allowanceRemaining: 7 });
    ok(s6b.paidCalls === 7 && s6b.stopReason === "credit_cap", "gece izni (kalan 7) paket tavanından küçükse izin geçerli", { p: s6b.paidCalls });
    const s7 = await run(createFakeCrystals({ count: 91, quotaRemaining: 5100, revision: 6 }), { forceRefetch: true });
    ok(s7.status === "stopped" && s7.stopReason === "quota_floor" && s7.paidCalls < 10, "kota tabanı (5.000) korunur: kalan kota yetmeyince ilk çağrılardan sonra DURDU", { r: s7.stopReason, p: s7.paidCalls });
    const s8 = await run(createFakeCrystals({ count: 91, quotaRemaining: 26000, revision: 7, faults: new Map<string, Fault>([["/crystals|en", "401"]]) }), { forceRefetch: true });
    ok(s8.status === "stopped" && s8.stopReason === "auth_401" && s8.paidCalls === 1, "401 → paket hemen DURDU", { r: s8.stopReason, p: s8.paidCalls });
    const s9 = await run(createFakeCrystals({ count: 91, quotaRemaining: 26000, revision: 8, faults: new Map<string, Fault>([[`${fakeId(2)}|en`, "500"]]), faultTimes: 5 }), { forceRefetch: true, includeImages: false });
    ok(s9.status === "completed" && (s9.issues[fakeId(2)] ?? []).some((i) => i === "detail_failed:en") && s9.retries >= 1, "kalıcı 5xx: en çok 1 ek tur, sonra 'detail_failed' raporu (sonsuz döngü yok)", { iss: s9.issues[fakeId(2)], st: s9.status, r: s9.stopReason, retries: s9.retries });
    ok(s9.paidCalls <= 198 + 2, "kalıcı hata ek kredi tüketimini sınırlı tuttu", s9.paidCalls);

    // geri al: son durumu temiz tek aktarıma döndür
    await su.query(`select public.stone_library_batch_rollback($1, id, 'test') from public.stone_library_import_batches where status in ('completed','stopped','failed')`, [OWNER.id]);
    const sF = await run(createFakeCrystals({ count: 91, quotaRemaining: 25000, revision: 9, trFallback: new Set([fakeId(3)]) }), { forceRefetch: true });
    ok(sF.status === "completed" && Number(await one(`select count(*)::int from public.stone_library_stones where deleted_at is null`)) === 91, "temiz yeniden aktarım: 91 taş (yeni kart açılmadı)");
    ok(sF.stonesAdopted === 91 && sF.stonesCreated === 0, "geri alınan paketten kalan sahipsiz kartlar güvenle yeniden bağlandı (91)", { a: sF.stonesAdopted, c: sF.stonesCreated });

    // ── 7) Owner API güvenliği ─────────────────────────────────────────────────────────────────
    section("7. Owner yönetim API'leri — yetki matrisi");
    const R = async (p: string) => (await import(`../../app/api/admin/dogaltas-kutuphane/${p}`)) as Record<string, Handler>;
    const routes: [string, string, Record<string, unknown> | undefined, Record<string, string>?][] = [
      ["route", "GET", undefined], ["taslar/route", "GET", undefined], ["taslar/route", "POST", { stone: { slug: "zz-yeni", name_tr: "ZZ Yeni" } }],
      ["taslar/[id]/route", "GET", undefined, { id: randomUUID() }], ["inceleme/route", "POST", { entity: "record", id: randomUUID(), action: "approve" }],
      ["kaynaklar/route", "POST", { action: "save_source", data: {} }], ["paketler/[id]/route", "GET", undefined, { id: randomUUID() }],
      ["silme/route", "POST", { action: "restore", op_id: randomUUID() }], ["yetkiler/route", "POST", { action: "grant", user_id: E1.id }],
      ["ayarlar/route", "POST", { data: {} }], ["gorseller/[id]/route", "GET", undefined, { id: randomUUID() }], ["aktarim/route", "POST", { action: "run" }],
    ];
    const deniedBodies = new Set<string>();
    for (const [p, method, body, params] of routes) {
      const h = (await R(p))[method];
      const rs = [
        await call(h, null, { method, body, params }),
        await call(h, asUser(E1), { method, body, params }),
        await call(h, { kind: "admin", id: E1.id, token: E1.token }, { method, body, params }),
        await call(h, asAdmin(ADMIN), { method, body, params }),
        await call(h, asAdmin(DEMO_OWNER), { method, body, params }),
        await call(h, { kind: "admin", id: OWNER.id, token: E1.token }, { method, body, params }),
      ];
      for (const r of rs) deniedBodies.add(r.body);
      ok(rs.every((r) => r.status === 404 && r.cache === "no-store"), `${method} ${p}: anonim / uzman / uzman-admin başlığı / owner olmayan admin / demo owner / sahte token → 404`, rs.map((r) => r.status));
    }
    ok(deniedBodies.size === 1, "tüm red dalları aynı gövde (varlık sızdırılmaz)");
    ok((await call((await R("route")).GET, asAdmin(OWNER))).status === 200, "owner genel görünüm 200");

    // ── 8) Owner inceleme akışı (route'lar üzerinden) ──────────────────────────────────────────
    section("8. Owner inceleme → yayın akışı");
    const list = await call((await R("taslar/route")).GET, asAdmin(OWNER), { query: "?q=zz%20kristal%201&limit=5" });
    ok(list.status === 200 && Number(list.json.total) >= 1, "owner taş araması", list.json.total);
    const stone1 = String(await one(`select stone_id from public.stone_library_external_ids where external_id=$1 and deleted_at is null`, [fakeId(1)]));
    const stone3 = String(await one(`select stone_id from public.stone_library_external_ids where external_id=$1 and deleted_at is null`, [fakeId(3)]));
    const det = await call((await R("taslar/[id]/route")).GET, asAdmin(OWNER), { params: { id: stone1 } });
    const cmp = (det.json.compare ?? []) as { field: string; tr: { current: { id: string } | null }; en: { current: { id: string } | null } }[];
    ok(det.status === 200 && cmp.some((c) => c.field === "description" && c.tr.current && c.en.current), "owner ayrıntı: TR/EN yan yana karşılaştırma", cmp.length);
    ok(JSON.stringify(det.json).includes("RoxyAPI (ZZ sentetik)") === false, "owner taş ayrıntısında kaynak kimliği uuid ile; gerçek ad ayrıntıda değil, kaynak listesinde");
    const inc = (await R("inceleme/route")).POST;
    const recIds = await q<{ id: string; field_key: string; lang: string }>(`select id, field_key, lang from public.stone_library_records where stone_id=$1 and is_current and deleted_at is null`, [stone1]);
    for (const r of recIds) ok((await call(inc, asAdmin(OWNER), { method: "POST", body: { entity: "record", id: r.id, action: "approve" } })).status === 200, `onay: ${r.field_key}/${r.lang}`);
    const facetIds = await q<{ id: string }>(`select id from public.stone_library_facets where stone_id=$1 and deleted_at is null`, [stone1]);
    for (const f of facetIds) await call(inc, asAdmin(OWNER), { method: "POST", body: { entity: "facet", id: f.id, action: "approve" } });
    const imgs1 = await q<{ id: string }>(`select id from public.stone_library_images where stone_id=$1`, [stone1]);
    for (const i of imgs1) await call(inc, asAdmin(OWNER), { method: "POST", body: { entity: "image", id: i.id, action: "approve" } });
    ok((await call((await R("taslar/[id]/route")).POST, asAdmin(OWNER), { method: "POST", params: { id: stone1 }, body: { action: "publish" } })).status === 200, "owner yayımladı");
    // Uzman
    const S = (await import("../../app/api/dogaltas/kutuphane/route")).GET as unknown as Handler;
    const D = (await import("../../app/api/dogaltas/kutuphane/[slug]/route")).GET as unknown as Handler;
    const G = (await import("../../app/api/dogaltas/kutuphane/[slug]/gorsel/route")).GET as unknown as Handler;
    const slug1 = String(await one(`select slug from public.stone_library_stones where id=$1`, [stone1]));
    ok((await call(S, asUser(E1))).status === 404, "yetkisiz uzman: arama 404 (varsayılan kapalı)");
    ok((await call((await R("yetkiler/route")).POST, asAdmin(OWNER), { method: "POST", body: { action: "grant", user_id: E1.id } })).status === 200, "owner yetki verdi (route)");
    const sr = await call(S, asUser(E1), { query: `?q=${encodeURIComponent("ZZ Kristal 1")}` });
    ok(sr.status === 200 && ((sr.json.items ?? []) as { slug: string }[]).some((i) => i.slug === slug1), "yetkili uzman yayımlanmış taşı buldu");
    const dr = await call(D, asUser(E1), { params: { slug: slug1 } });
    ok(dr.status === 200 && dr.body.includes("ZZ sentetik açıklama 1"), "uzman taş kartı 200");
    ok(!dr.body.includes("baş ağrısını") && !dr.body.includes("headache"), "fiziksel etki (onaylı olsa da) hukuk onayı yokken uzmanda YOK");
    ok(((dr.json.item as Record<string, unknown>)?.image ?? null) === null, "lisans kanıtı owner tarafından doğrulanmadan görsel YOK");
    ok((await call(G, asUser(E1), { params: { slug: slug1 } })).status === 404, "görsel ucu: lisans doğrulanmadan 404");
    const ks = (await R("kaynaklar/route")).POST;
    ok((await call(ks, asAdmin(OWNER), { method: "POST", body: { action: "license_status", id: LIC, status: "verified" } })).status === 400, "belge SHA-256'sı olmadan izin doğrulanamaz");
    ok((await call(ks, asAdmin(OWNER), { method: "POST", body: { action: "save_license", id: LIC, data: { document_sha256: "f".repeat(64) } } })).status === 200, "owner (yanlış) belge özeti kaydetti");
    ok((await call(ks, asAdmin(OWNER), { method: "POST", body: { action: "license_status", id: LIC, status: "verified" } })).status === 400, "belge özeti eşleşmeyen izin doğrulanamaz (SL085)");
    ok((await call(ks, asAdmin(OWNER), { method: "POST", body: { action: "save_license", id: LIC, data: { document_sha256: "e".repeat(64) } } })).status === 200, "owner doğru belge özetini kaydetti");
    ok((await call(ks, asAdmin(OWNER), { method: "POST", body: { action: "license_status", id: LIC, status: "verified", note: "owner doğruladı" } })).status === 200, "owner lisans kanıtını doğruladı");
    const dr2 = await call(D, asUser(E1), { params: { slug: slug1 } });
    const im = (dr2.json.item as Record<string, unknown>)?.image as Record<string, unknown> | null;
    ok(!!im && im.available === true && im.width === 300, "doğrulama sonrası kartta yalnız 'görsel var' + boyut", im);
    const gr = await call(G, asUser(E1), { params: { slug: slug1 } });
    ok(gr.status === 200 && gr.type === "image/webp" && (await sharp(gr.bytes).metadata()).width === 300, "uzman görsel ucu: optimize WebP 300×300");
    ok(gr.cache === "private, max-age=60", "görsel önbelleği yalnız tarayıcıya özel ve kısa (iptal sonrası en çok 60 sn)");
    const gro = await call(G, asUser(E1), { params: { slug: slug1 }, query: "?v=original" });
    const origSha = String(await one(`select sha256 from public.stone_library_images where stone_id=$1 and variant='original' and deleted_at is null`, [stone1]));
    ok(gro.status === 200 && createHash("sha256").update(gro.bytes).digest("hex") === origSha, "özgün sürüm kayıttaki özetle eşleşiyor");
    const providerBytes = Buffer.from(await (await fakeHandler!(`https://roxyapi.com/img/crystals/${fakeId(1)}.jpg`)).arrayBuffer());
    ok(Buffer.compare(providerBytes, gro.bytes) === 0, "özgün sürüm SAĞLAYICININ gönderdiği baytlarla birebir aynı (bağımsız kanıt)");
    ok((await call(G, asUser(E2), { params: { slug: slug1 } })).status === 404, "yetkisiz uzman görsel ucundan da 404");
    // Bütünlük: depodaki dosya değiştirilirse servis edilmez
    const optPath = String(await one(`select storage_path from public.stone_library_images where stone_id=$1 and variant='optimized' and deleted_at is null`, [stone1]));
    await db.storage.from("stone-library-images").upload(optPath, Buffer.from("tampered"), { contentType: "image/webp", upsert: true });
    ok((await call(G, asUser(E1), { params: { slug: slug1 } })).status === 404, "depoda değiştirilmiş görsel SHA uyuşmazlığıyla REDDEDİLDİ");
    // Lisans iptali → görsel anında düşer
    await call(ks, asAdmin(OWNER), { method: "POST", body: { action: "license_status", id: LIC, status: "revoked" } });
    ok(((await call(D, asUser(E1), { params: { slug: slug1 } })).json.item as Record<string, unknown>)?.image === null, "lisans iptal → görsel yayından anında düştü");
    // Dil şüphesi kilidi
    for (const r of await q<{ id: string }>(`select id from public.stone_library_records where stone_id=$1 and is_current`, [stone3])) await call(inc, asAdmin(OWNER), { method: "POST", body: { entity: "record", id: r.id, action: "approve" } });
    await call((await R("taslar/[id]/route")).POST, asAdmin(OWNER), { method: "POST", params: { id: stone3 }, body: { action: "publish" } });
    const slug3 = String(await one(`select slug from public.stone_library_stones where id=$1`, [stone3]));
    const d3 = await call(D, asUser(E1), { params: { slug: slug3 } });
    const trDesc = ((d3.json.item as { sections: { fields: { field: string; lang: string; content: string }[] }[] }).sections.flatMap((s) => s.fields)).filter((f) => f.field === "description" && f.lang === "tr");
    ok(d3.status === 200 && trDesc.length === 0, "TR'si İngilizce olan alan (onaylı olsa da) 'tr' etiketiyle YAYIMLANMADI");
    const sus = String(await one(`select id from public.stone_library_records where stone_id=$1 and lang='tr' and field_key='description' and is_current`, [stone3]));
    await call(inc, asAdmin(OWNER), { method: "POST", body: { entity: "record", id: sus, action: "confirm_language" } });
    const d3b = await call(D, asUser(E1), { params: { slug: slug3 } });
    ok((d3b.json.item as { sections: { fields: { field: string; lang: string }[] }[] }).sections.flatMap((s) => s.fields).some((f) => f.field === "description" && f.lang === "tr"), "owner dili doğrulayınca alan yayımlandı");
    fakeHandler = createFakeCrystals({ count: 91, quotaRemaining: 23000, revision: 9, trFallback: new Set([fakeId(3)]) }).handler;
    await run(createFakeCrystals({ count: 91, quotaRemaining: 23000, revision: 9, trFallback: new Set([fakeId(3)]) }), { includeImages: false });
    const flagsAfter = (await q<{ f: string[] }>(`select quality_flags f from public.stone_library_records where id=$1`, [sus]))[0]?.f ?? [];
    ok(!flagsAfter.includes("lang_suspect"), "yeniden aktarım owner'ın dil onayını geri almadı", flagsAfter);
    // Owner metin düzenlemesi = yeni sürüm
    const descTr = String(await one(`select id from public.stone_library_records where stone_id=$1 and lang='tr' and field_key='description' and is_current`, [stone1]));
    const ed = await call(inc, asAdmin(OWNER), { method: "POST", body: { entity: "record", id: descTr, action: "edit_text", stone_id: stone1, content: "ZZ owner düzenlemesi zzownered." } });
    ok(ed.status === 201 && (await one(`select content from public.stone_library_records where id=$1`, [descTr])) === "ZZ sentetik açıklama 1 ve bu taş için bir deneme metni (sürüm 9).", "owner düzenlemesi yeni sürüm; kaynak metni aynen duruyor");
    // Silme / geri alma route
    const sil = (await R("silme/route")).POST;
    ok((await call(sil, asAdmin(OWNER), { method: "POST", body: { action: "delete", entity: "stone", id: stone1 } })).status === 409, "yayımdaki taş silinemez (409)");
    await call((await R("taslar/[id]/route")).POST, asAdmin(OWNER), { method: "POST", params: { id: stone1 }, body: { action: "unpublish" } });
    const del = await call(sil, asAdmin(OWNER), { method: "POST", body: { action: "delete", entity: "stone", id: stone1, cascade: true, reason: "ZZ" } });
    ok(del.status === 200 && Number(await one(`select count(*)::int from public.stone_library_images where stone_id=$1 and deleted_at is null`, [stone1])) === 0, "cascade silme görselleri de kapsar");
    ok((await call(sil, asAdmin(OWNER), { method: "POST", body: { action: "restore", op_id: del.json.op_id } })).status === 200
       && Number(await one(`select count(*)::int from public.stone_library_images where stone_id=$1 and deleted_at is null`, [stone1])) === 2, "geri alma görselleri geri getirdi");
    // Girdi doğrulama
    const bad = [
      await call(inc, asAdmin(OWNER), { method: "POST", rawBody: "{bozuk" }),
      await call(inc, asAdmin(OWNER), { method: "POST", rawBody: JSON.stringify({ x: "a".repeat(70000) }) }),
      await call(inc, asAdmin(OWNER), { method: "POST", body: { entity: "record'; drop table x;--", id: stone1, action: "approve" } }),
      await call(inc, asAdmin(OWNER), { method: "POST", body: { entity: "record", id: "not-uuid", action: "approve" } }),
      await call(inc, asAdmin(OWNER), { method: "POST", body: { entity: "record", id: stone1, action: "drop" } }),
      await call((await R("aktarim/route")).POST, asAdmin(OWNER), { method: "POST", body: { action: "run", source_id: SRC, credit_cap: 5000, terms_sha256: TERMS } }),
    ];
    ok(bad.every((r) => r.status === 400 && r.json.code === "INPUT"), "bozuk JSON / büyük gövde / enjeksiyon / geçersiz uuid / bilinmeyen işlem / 1000 üstü kredi → 400 (500 yok)", bad.map((r) => r.status));
    ok(!bad.some((r) => /at |stack|\.ts:/.test(r.body)), "hata yanıtlarında yığın izi yok");
    // Aktarım route'u (sahte sağlayıcı; gerçek ağ yok)
    fakeHandler = createFakeCrystals({ count: 91, quotaRemaining: 24000, revision: 9 }).handler;
    const ar = await call((await R("aktarim/route")).POST, asAdmin(OWNER), { method: "POST", body: { action: "run", source_id: SRC, credit_cap: 300, terms_sha256: TERMS, include_images: false } });
    ok(ar.status === 200 && (ar.json.summary as Record<string, unknown>)?.status === "completed" && (ar.json.summary as Record<string, unknown>)?.paidCalls === 0, "aktarım ucu: owner çalıştırdı; önceki yanıtlar yeniden kullanıldı (0 kredi)", ar.json.summary);

    // ── 9) Sızıntı taraması ────────────────────────────────────────────────────────────────────
    section("9. Uzman yanıtlarında sızıntı yok");
    const bodies = [sr.body, dr.body, dr2.body, d3.body, d3b.body, (await call(S, asUser(E1))).body];
    const all = bodies.join("\n");
    for (const banned of ["roxy", "RoxyAPI", "roxyapi.com", "/img/crystals", "stone-library-images", "orig/", "opt/", "zz-crystal-0", "zz-sentetik-api", SRC, LIC, "license", "payload", "source_url", "storage_path", "sha256", "quota"]) {
      ok(!all.toLowerCase().includes(banned.toLowerCase()), `uzman yanıtlarında yok: ${banned.length > 36 ? banned.slice(0, 10) + "…" : banned}`);
    }
    ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(all), "uzman yanıtlarında iç uuid yok");
    const pubRaw = JSON.stringify(await q(`select doc, names_fold from public.stone_library_published`));
    ok(!/roxy|img\/crystals|stone-library-images|zz-crystal-0/i.test(pubRaw), "DB yayın yüzeyinde de sağlayıcı / URL / yol / harici kimlik yok");


    // ── 9b) F2 bağımsız denetim düzeltmeleri ──────────────────────────────────────────────────
    section("9b. F2 denetim düzeltmeleri (görsel lisans koşulları, paket, süre)");
    {
      const SRC3 = String(await owner("stone_library_source_save", { p_source_id: null, p_data: { source_key: "zz-gorsel-src", kind: "licensed_course", real_name: "ZZ Görsel Kaynağı" } }));
      await owner("stone_library_source_save", { p_source_id: SRC3, p_data: { license_type: "written_contract", license_ref: "ZZ-G", commercial_use_ok: true, status: "active", image_rights: "rehost_ok" } });
      const DOC3 = String(await owner("stone_library_document_add", { p_source_id: SRC3, p_data: { doc_kind: "permission_letter", title: "ZZ izin 3", content_sha256: "9".repeat(64) } }));
      const mkGrant = async (extra: Record<string, unknown>) => String(await owner("stone_library_license_grant_save", { p_grant_id: null, p_data: {
        source_id: SRC3, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "ZZ", commercial_display: true, storage_allowed: true, post_subscription_rights: true,
        attribution_required: false, modification_allowed: true, redistribution_limit: "ZZ", max_resolution: "300x300", document_id: DOC3, document_sha256: "9".repeat(64), ...extra } }));
      const G_ATTR = await mkGrant({ attribution_required: true, attribution_text: "© ZZ Fotoğraf Sahibi", modification_allowed: false });
      await owner("stone_library_license_grant_set_status", { p_grant_id: G_ATTR, p_status: "verified", p_note: "zz" });
      const S9 = String(await owner("stone_library_stone_save", { p_stone_id: null, p_data: { slug: "zz-gorsel-tasi", name_tr: "ZZ Görsel Taşı" } }));
      const rec = String(await owner("stone_library_record_add", { p_data: { stone_id: S9, source_id: SRC3, field_key: "description", lang: "tr", content: "ZZ görsel taşı açıklaması zzgorselkelime." } }));
      await owner("stone_library_review", { p_entity: "record", p_id: rec, p_action: "approve", p_note: null });
      const jpg9 = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
      const chk = await processImage(jpg9, "image/jpeg");
      if (!chk.ok) throw new Error("fixture image");
      const reg = async (grant: string, variant: "original" | "optimized", v: typeof chk.original, derived: string | null, batch: string | null = null) => {
        const pth = `${variant === "original" ? "orig" : "opt"}/${SRC3}/${v.sha256}.${v.ext}`;
        await db.storage.from("stone-library-images").upload(pth, v.bytes, { contentType: v.mime, upsert: true });
        return String(await owner("stone_library_image_register", { p_data: { stone_id: S9, source_id: SRC3, license_grant_id: grant, variant, derived_from_id: derived, storage_path: pth,
          mime: v.mime, bytes: v.bytes.length, width: v.width, height: v.height, sha256: v.sha256, ...(batch ? { batch_id: batch } : {}) } }));
      };
      const o9 = await reg(G_ATTR, "original", chk.original, null);
      const p9 = await reg(G_ATTR, "optimized", chk.optimized, o9);
      for (const id of [o9, p9]) await owner("stone_library_image_review", { p_image_id: id, p_action: "approve", p_note: null });
      await owner("stone_library_stone_set_status", { p_stone_id: S9, p_status: "published", p_note: null });
      const d9 = await call(D, asUser(E1), { params: { slug: "zz-gorsel-tasi" } });
      const im9 = (d9.json.item as Record<string, unknown>)?.image as Record<string, unknown> | null;
      ok(d9.status === 200 && im9?.attribution === "© ZZ Fotoğraf Sahibi", "zorunlu atıflı izin: kartta görsel atfı var (sızıntı tarayıcısından geçti)", im9);
      const g9 = await call(G, asUser(E1), { params: { slug: "zz-gorsel-tasi" } });
      ok(g9.status === 200 && g9.type === "image/jpeg" && Buffer.compare(g9.bytes, jpg9) === 0, "değiştirme izni YOK → optimize (yeniden kodlanmış) sürüm servis edilmez; özgün bayt döner", { st: g9.status, type: g9.type });
      // izin süresi (abonelik sonrası hak yok)
      ok((await errCode(`select public.stone_library_license_grant_save($1, null, $2)`, [OWNER.id, JSON.stringify({ source_id: SRC3, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "ZZ",
        commercial_display: true, storage_allowed: true, post_subscription_rights: false, attribution_required: false, modification_allowed: true, redistribution_limit: "ZZ" })])) === "23514",
        "abonelik sonrası hak yoksa izin bitiş tarihi zorunlu (CHECK)");
      // kaynak lisans bitişi → görsel düşer
      await owner("stone_library_source_save", { p_source_id: SRC3, p_data: { license_valid_until: new Date(Date.now() - 86400000).toISOString() } });
      ok(((await call(D, asUser(E1), { params: { slug: "zz-gorsel-tasi" } })).json.item ?? null) === null || (((await call(D, asUser(E1), { params: { slug: "zz-gorsel-tasi" } })).json.item as Record<string, unknown>)?.image ?? null) === null,
        "kaynak lisansı bitince görsel yayından düştü");
      ok((await call(G, asUser(E1), { params: { slug: "zz-gorsel-tasi" } })).status === 404, "kaynak lisansı bitince görsel ucu 404");
      await owner("stone_library_source_save", { p_source_id: SRC3, p_data: { license_valid_until: null } });
      ok((await call(G, asUser(E1), { params: { slug: "zz-gorsel-tasi" } })).status === 200, "lisans süresi kaldırılınca görsel geri geldi");
      // kaynak görsel hakkı → yayın anında güncellenir (kırık görsel kalmaz)
      await owner("stone_library_source_save", { p_source_id: SRC3, p_data: { image_rights: "none" } });
      ok((((await call(D, asUser(E1), { params: { slug: "zz-gorsel-tasi" } })).json.item as Record<string, unknown>)?.image ?? null) === null, "kaynağın görsel hakkı kaldırılınca karttaki görsel bilgisi de anında düştü");
      await owner("stone_library_source_save", { p_source_id: SRC3, p_data: { image_rights: "rehost_ok" } });
      // azami çözünürlük
      const big9 = await processImage(await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 9, g: 9, b: 9 } } }).jpeg().toBuffer(), "image/jpeg", { width: 400, height: 400 });
      if (!big9.ok) throw new Error("fixture big");
      const S9b = String(await owner("stone_library_stone_save", { p_stone_id: null, p_data: { slug: "zz-buyuk-gorsel", name_tr: "ZZ Büyük Görsel" } }));
      ok((await errCode(`select public.stone_library_image_register($1, $2)`, [OWNER.id, JSON.stringify({ stone_id: S9b, source_id: SRC3, license_grant_id: G_ATTR, variant: "original",
        storage_path: `orig/${SRC3}/${big9.original.sha256}.jpg`, mime: "image/jpeg", bytes: big9.original.bytes.length, width: 400, height: 400, sha256: big9.original.sha256 })])) === "SL088",
        "izindeki azami çözünürlüğü (300×300) aşan görsel kaydedilmez");
      // iptal edilmiş izin düzenlenemez
      const G_REV = await mkGrant({});
      await owner("stone_library_license_grant_set_status", { p_grant_id: G_REV, p_status: "revoked", p_note: null });
      ok((await errCode(`select public.stone_library_license_grant_save($1, $2, '{"scope":"other"}')`, [OWNER.id, G_REV])) === "SL084", "iptal edilmiş izin düzenlenemez");
      // paket geri alma görselleri de geri alır
      const B9 = String(await owner("stone_library_batch_open", { p_data: { source_id: SRC3, dry_run: false, credit_cap: 5, terms_sha256: "d".repeat(64) } }));
      await owner("stone_library_batch_set_status", { p_batch_id: B9, p_status: "running", p_note: null });
      const S9c = String(await owner("stone_library_stone_save", { p_stone_id: null, p_data: { slug: "zz-paket-gorsel", name_tr: "ZZ Paket Görseli" } }));
      const rc = String(await owner("stone_library_record_add", { p_data: { stone_id: S9c, source_id: SRC3, field_key: "description", lang: "tr", content: "ZZ paket görsel taşı metni zzpaketgorsel." } }));
      await owner("stone_library_review", { p_entity: "record", p_id: rc, p_action: "approve", p_note: null });
      const chkC = await processImage(await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 200, g: 1, b: 1 } } }).jpeg().toBuffer(), "image/jpeg");
      if (!chkC.ok) throw new Error("fixture c");
      const pthC = `orig/${SRC3}/${chkC.original.sha256}.jpg`;
      await db.storage.from("stone-library-images").upload(pthC, chkC.original.bytes, { contentType: "image/jpeg", upsert: true });
      const imgC = String(await owner("stone_library_image_register", { p_data: { stone_id: S9c, source_id: SRC3, license_grant_id: G_ATTR, variant: "original", storage_path: pthC,
        mime: "image/jpeg", bytes: chkC.original.bytes.length, width: 300, height: 300, sha256: chkC.original.sha256, batch_id: B9 } }));
      await owner("stone_library_image_review", { p_image_id: imgC, p_action: "approve", p_note: null });
      await owner("stone_library_stone_set_status", { p_stone_id: S9c, p_status: "published", p_note: null });
      ok((await call(G, asUser(E1), { params: { slug: "zz-paket-gorsel" } })).status === 200, "paket görseli onay sonrası servis ediliyor");
      await owner("stone_library_batch_set_status", { p_batch_id: B9, p_status: "stop_requested", p_note: null });
      await owner("stone_library_batch_set_status", { p_batch_id: B9, p_status: "stopped", p_note: null });
      await owner("stone_library_batch_rollback", { p_batch_id: B9, p_note: "zz" });
      ok((await call(G, asUser(E1), { params: { slug: "zz-paket-gorsel" } })).status === 404 && Number(await one(`select count(*)::int from public.stone_library_images where id=$1 and deleted_at is null`, [imgC])) === 0,
        "paket geri alınınca paketin görseli de geri alındı (yayından düştü)");
      // takılı 'running' paket: yeni çalıştırma yetim bırakmadan durur; owner kurtarır, sonra devam eder
      const BST = String(await owner("stone_library_batch_open", { p_data: { source_id: SRC3, dry_run: false, credit_cap: 5, terms_sha256: "d".repeat(64) } }));
      await owner("stone_library_batch_set_status", { p_batch_id: BST, p_status: "running", p_note: null });
      const smallFake = createFakeCrystals({ count: 3, quotaRemaining: 20000, namePrefix: "ZZS" });
      fakeHandler = smallFake.handler;
      const runS = (extra: Partial<Parameters<typeof runCrystalImport>[0]> = {}) => runCrystalImport({ db, actor: OWNER.id, sourceId: SRC3, licenseGrantId: null,
        client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "sentetik-test-anahtari-0123456789abcdef", fetchImpl: smallFake.handler },
        includeImages: false, includeBirthstones: false, includeVocabLists: false, creditCap: 50, allowanceRemaining: 50, quotaFloor: 5000, termsSha256: TERMS, sleep: async () => undefined, ...extra });
      const plannedBefore = Number(await one(`select count(*)::int from public.stone_library_import_batches where source_id=$1 and status='planned'`, [SRC3]));
      const blocked = await runS();
      ok(blocked.status === "stopped" && blocked.stopReason === "batch_already_running" && blocked.paidCalls === 0, "takılı 'running' paket varken yeni aktarım ücretli çağrı yapmadan durdu", { st: blocked.status, r: blocked.stopReason });
      ok(Number(await one(`select count(*)::int from public.stone_library_import_batches where source_id=$1 and status='planned'`, [SRC3])) === plannedBefore, "engellenen deneme yetim 'planned' paket bırakmadı");
      const rec2 = await call((await R("aktarim/route")).POST, asAdmin(OWNER), { method: "POST", body: { action: "recover", batch_id: BST } });
      ok(rec2.status === 200 && rec2.json.status === "stopped", "owner takılı paketi kurtardı (aktarım ucu: recover)");
      const after = await runS();
      ok(after.status === "completed" && after.paidCalls === 2 + 6, "kurtarma sonrası aktarım çalıştı", { st: after.status, p: after.paidCalls });
      const dl = await runS({ deadlineMs: -1, forceRefetch: true });
      ok(dl.status === "stopped" && dl.stopReason === "time_budget" && dl.paidCalls === 0, "süre bütçesi aşılınca yeni çağrı başlatılmadı (Vercel kesintisinden önce zarif durma)", { st: dl.status, r: dl.stopReason });
      // görsel izni başta doğrulanır: geçersiz izinle dosya indirilmez / yüklenmez
      const objBefore = (await db.storage.from("stone-library-images").list(`orig/${SRC3}`)).data?.length ?? 0;
      const badLic = await runS({ licenseGrantId: G_REV, includeImages: true, forceRefetch: true });
      ok(badLic.imagesDisabledReason === "license_grant_invalid" && badLic.imageDownloads === 0 && ((await db.storage.from("stone-library-images").list(`orig/${SRC3}`)).data?.length ?? 0) === objBefore,
        "iptal edilmiş izinle görsel indirilmedi, depoya yetim dosya yüklenmedi", { r: badLic.imagesDisabledReason, d: badLic.imageDownloads });
    }

    // ── 10) Performans ─────────────────────────────────────────────────────────────────────────
    section("10. Performans (izole)");
    await su.query(`select public.stone_library_review($1, 'record', id, 'approve') from public.stone_library_records where is_current and review_state='pending' and deleted_at is null`, [OWNER.id]);
    await su.query(`select public.stone_library_review($1, 'facet', id, 'approve') from public.stone_library_facets where review_state='pending' and deleted_at is null`, [OWNER.id]);
    const tp = Date.now();
    await su.query(`select public.stone_library_stone_set_status($1, id, 'published') from public.stone_library_stones where deleted_at is null and status<>'published'`, [OWNER.id]);
    console.log(`    (ölçüm) 91 taşı yayımlama: ${Date.now() - tp} ms`);
    ok(Number(await one(`select count(*)::int from public.stone_library_published p join public.stone_library_external_ids e on e.stone_id=p.stone_id and e.deleted_at is null where e.source_id=$1`, [SRC])) === 91, "kaynağın 91 taşı yayında");
    const en5 = await call(S, asUser(E1), { query: "?q=" + encodeURIComponent("ZZ Crystal 5") });
    ok(((en5.json.items ?? []) as { slug: string }[])[0]?.slug === "zz-kristal-5", "İngilizce adın birebir eşleşmesi ilk sırada (ZZ Crystal 5 → zz-kristal-5, 50–59 önünde)", ((en5.json.items ?? []) as { slug: string }[]).slice(0, 3));
    const queries = ["?q=zz%20kristal", "?q=kristal%2055", "?q=ZZ%20CRYSTAL%207", "?chakra=heart", "?chakra=crown&zodiac=leo", "?q=huzur", "?element=storm", "?color=purple", "?q=zz%20balance", "?birth_month=3"];
    const lat: number[] = [];
    const users = [E1];
    for (let i = 0; i < 8; i++) { const u = await mk(`PERF${i}`); await owner("stone_library_grant_access", { p_target: u.id, p_note: null }); users.push(u); }
    const tc = Date.now();
    await Promise.all(users.flatMap((u) => queries.map(async (qq) => { const t = Date.now(); const r = await call(S, asUser(u), { query: qq }); lat.push(Date.now() - t); if (r.status !== 200) throw new Error(`perf ${qq} ${r.status}`); })));
    const wall = Date.now() - tc;
    lat.sort((a, b) => a - b);
    const p95 = lat[Math.floor(lat.length * 0.95)];
    console.log(`    (ölçüm) ${users.length} uzman × ${queries.length} sorgu eşzamanlı: toplam ${wall} ms, p50 ${lat[Math.floor(lat.length / 2)]} ms, p95 ${p95} ms`);
    ok(lat.length === users.length * queries.length && p95 < 3000, `eşzamanlı arama: ${lat.length} istek, p95 ${p95} ms (< 3 sn, yerel shim)`);
    // Büyük sentetik katalog (300 taş) aktarımı
    await su.query(`select public.stone_library_stone_set_status($1, id, 'draft') from public.stone_library_stones where status='published'`, [OWNER.id]);
    await su.query(`select public.stone_library_batch_rollback($1, id, 'perf') from public.stone_library_import_batches where status in ('completed','stopped','failed')`, [OWNER.id]);
    const SRC2 = String(await owner("stone_library_source_save", { p_source_id: null, p_data: { source_key: "zz-perf-api", kind: "api", real_name: "ZZ Perf API" } }));
    await owner("stone_library_source_save", { p_source_id: SRC2, p_data: { license_type: "api_terms", license_terms_sha256: "c".repeat(64), commercial_use_ok: true, status: "active" } });
    const bigFake = createFakeCrystals({ count: 300, quotaRemaining: 40000, revision: 11, namePrefix: "ZZP" });
    fakeHandler = bigFake.handler;
    const tb = Date.now();
    const big = await runCrystalImport({ db, actor: OWNER.id, sourceId: SRC2, licenseGrantId: null, client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "sentetik-test-anahtari-0123456789abcdef", fetchImpl: bigFake.handler },
      includeImages: false, includeBirthstones: false, includeVocabLists: false, creditCap: 1000, allowanceRemaining: 1000, quotaFloor: 5000, termsSha256: TERMS, sleep: async () => undefined });
    const tBig = Date.now() - tb;
    console.log(`    (ölçüm) 300 taş (TR+EN) aktarımı: ${tBig} ms, ${big.paidCalls} çağrı, ${big.recordsWritten} kayıt, ${big.facetsWritten} facet`);
    ok(big.status === "completed" && big.stonesCreated === 300 && big.paidCalls === 6 + 600, "300 taşlık büyük katalog tamamlandı (3 sayfa × 2 dil + 600 detay)", { st: big.status, r: big.stopReason, c: big.stonesCreated, p: big.paidCalls, ev: await q(`select level, kind, message from public.stone_library_import_events where batch_id=$1 order by id`, [big.batchId]) });
    ok(tBig < 300_000, `büyük katalog süresi ${Math.round(tBig / 1000)} sn (< 300 sn; tek Vercel çağrı bütçesi)`);
    const tr = Date.now();
    await su.query(`select public.stone_library_batch_rollback($1, $2, 'perf')`, [OWNER.id, big.batchId]);
    console.log(`    (ölçüm) 300 taş paket geri alma: ${Date.now() - tr} ms`);
    ok(Date.now() - tr < 20000, "büyük paket geri alma < 20 sn");

    section("11. Son kontroller");
    ok(external.length === 0, "gerçek dış ağ çağrısı: 0 (sağlayıcı dahil)", external.slice(0, 3));
    ok(errCode !== null, "harness yardımcıları çalıştı");
  } finally {
    await env2.stop();
  }
  console.log(`\nstone-library F2 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}

main().catch((e) => { console.error("harness çöktü:", e); process.exit(1); });
