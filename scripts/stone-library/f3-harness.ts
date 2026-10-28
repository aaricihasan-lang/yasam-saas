/**
 * Doğaltaş Kütüphanesi F3 — YAYIN MODELİ + KAYNAK VERİSİ KORUMASI + SAĞLIK C MODELİ + GÖRSEL EŞLEŞMESİ + ARAMA / FİLTRE +
 * YETKİ / GÜVENLİK + TEKRAR AKTARIM + BÜTÜNLÜK TESPİTİ testi.
 * İzole embedded-postgres + PostgREST/Storage shim + migration F1 + F2 + F3 + GERÇEK route'lar. Prod/Preview'a SIFIR temas.
 * Sağlayıcı SAHTE (scripts/stone-library/fakeCrystals.ts, sentetik ZZ_* içerik); gerçek sağlayıcıya çağrı YOK (dış ağ kilidi).
 * Çalıştır: npx tsx scripts/stone-library/f3-harness.ts   (STONE_LIBRARY_F3_PG_PORT, varsayılan 54593)
 */
import "../hd-analysis-word-flow/env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { createFakeCrystals, fakeId } from "./fakeCrystals";
import { runCrystalImport, type RunnerSummary } from "../../lib/stone-library/import/runner";
import { buildStoneLibraryExcerpt } from "../../lib/stone-library/expertDto";
import { STONE_LIBRARY_HEALTH_NOTICE_TR, STONE_LIBRARY_MEDICAL_NOTICE_TR } from "../../lib/stone-library/contract";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 700)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const MIGS = ["20271201000000_stone_library_core.sql", "20271201000100_stone_library_f2.sql", "20271201000200_stone_library_f3.sql"];
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0; };

type Who = { id: string; token: string };
type Res = { status: number; body: string; json: Record<string, unknown>; cache: string | null; type: string | null; bytes: Buffer; ms: number };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const UA = {
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
};

async function call(h: Handler, auth: { kind: "user" | "admin"; id?: string; token?: string } | null,
  o: { method?: string; body?: unknown; rawBody?: string; query?: string; params?: Record<string, string>; ua?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": o.ua ?? UA.desktop };
  if (auth?.id) headers[auth.kind === "admin" ? "x-admin-id" : "x-user-id"] = auth.id;
  if (auth?.token) headers["x-session-token"] = auth.token;
  const bodyText = o.rawBody ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined);
  if (bodyText !== undefined) headers["content-type"] = "application/json";
  const req = new NextRequest(`http://localhost/api/test${o.query ?? ""}`, { method: o.method ?? "GET", headers, body: bodyText });
  const t0 = performance.now();
  const res = await h(req, { params: Promise.resolve(o.params ?? {}) });
  const bytes = Buffer.from(await res.arrayBuffer());
  const ms = performance.now() - t0;
  const body = bytes.toString("utf8");
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(body) as Record<string, unknown>; } catch { /* json değil */ }
  return { status: res.status, body, json, cache: res.headers.get("cache-control"), type: res.headers.get("content-type"), bytes, ms };
}

async function main() {
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

  const fns = [...new Set([...MIGS.map(mig).join("\n").matchAll(/FUNCTION public\.(stone_library_[a-z_]+)\(/g)].map((m) => m[1]))];
  const env: TestEnv = await startAnamnezTestEnv({
    port: Number(process.env.STONE_LIBRARY_F3_PG_PORT ?? 54593), dirName: `stone-library-f3-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: fns, extraSql: MIGS.map(mig),
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.STONE_LIBRARY_ENABLED = "true";
  process.env.ROXY_API_KEY = "zz-harness-fake-roxy-key";
  const su = env.su;
  const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
  const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []): Promise<T[]> => (await su.query(sql, p)).rows as T[];
  const one = async (sql: string, p: unknown[] = []): Promise<unknown> => { const r = await su.query(sql, p); const row = r.rows[0] as Record<string, unknown> | undefined; return row ? Object.values(row)[0] : undefined; };
  const n = async (sql: string, p: unknown[] = []) => Number(await one(sql, p));
  const errCode = async (sql: string, p: unknown[] = []) => { try { await su.query(sql, p); return null; } catch (e) { return (e as { code?: string }).code ?? "?"; } };

  try {
    // ── 0) Şema ve ayrıcalıklar ─────────────────────────────────────────────────────────────────
    section("0. Şema ve ayrıcalıklar (F1 + F2 + F3)");
    const tbl = await q<{ relname: string; rls: boolean }>(`select relname, relrowsecurity rls from pg_class where relname like 'stone\\_library\\_%' and relkind='r'`);
    ok(tbl.length === 19 && tbl.every((t) => t.rls), "19 tablo (F3 yeni tablo eklemez), hepsinde RLS açık", tbl.length);
    ok(await n(`select count(*)::int from pg_policies where tablename like 'stone\\_library\\_%'`) === 0, "hiçbir kütüphane tablosunda policy yok (yalnız SECURITY DEFINER RPC)");
    ok(await n(`select count(*)::int from (select t.relname, r from pg_class t, unnest(array['anon','authenticated','service_role']) r
      where t.relname like 'stone\\_library\\_%' and t.relkind='r' and has_table_privilege(r, t.oid, 'SELECT,INSERT,UPDATE,DELETE')) x`) === 0,
      "hiçbir rolün 19 tabloda ayrıcalığı yok (service_role dahil)");
    const svcFns = await n(`select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'stone\\_library\\_%' and p.proname <> 'stone_library_fold' and has_function_privilege('service_role', p.oid, 'EXECUTE')`);
    ok(svcFns === 48, "service_role yalnız sözleşmedeki 48 RPC'yi çalıştırabilir (F1 27 + F2 17 + F3 5 − alternatif ad ekleme)", svcFns);
    ok(await n(`select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'stone\\_library\\_%' and p.proname <> 'stone_library_fold' and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))`) === 0,
      "anon / authenticated hiçbir kütüphane RPC'sini çalıştıramaz");
    for (const f of ["stone_library_health_ok", "stone_library_readiness", "stone_library_field_path_guard", "stone_library_source_name_guard", "stone_library_image_binding_guard",
      "stone_library_integrity", "stone_library_source_kind_guard", "stone_library_external_link_guard", "stone_library_name_add"]) {
      ok(await n(`select count(*)::int from pg_proc where proname=$1 and has_function_privilege('service_role', oid, 'EXECUTE')`, [f]) === 0, `iç yardımcı service_role'e kapalı: ${f}`);
    }
    const cfg0 = (await q<Record<string, unknown>>(`select * from public.stone_library_settings`))[0];
    ok(cfg0.health_publication_mode === "legal_review" && cfg0.health_content_publication_enabled === false,
      "varsayılan sağlık modu legal_review + genel kilit KAPALI (production davranışı değişmez)", cfg0);
    ok(cfg0.medical_notice_tr === STONE_LIBRARY_MEDICAL_NOTICE_TR && cfg0.health_notice_tr === STONE_LIBRARY_HEALTH_NOTICE_TR,
      "ayrı tıbbi bilgilendirme metni owner önerisiyle birebir (DB = sözleşme)");
    ok(await errCode(`update public.stone_library_settings set health_content_publication_enabled = true`) === "23514", "genel kilit hukuk referansı olmadan açılamaz (legal_review)");
    ok(await errCode(`update public.stone_library_settings set health_publication_mode='owner_decision', health_content_publication_enabled = true`) === "23514",
      "owner_decision modunda da owner'ın yazılı karar referansı olmadan açılamaz");
    ok(await errCode(`update public.stone_library_settings set legal_review_ref = '  ', health_content_publication_enabled = true`) === "23514"
      && await errCode(`update public.stone_library_settings set health_publication_mode='owner_decision', owner_decision_ref = ' ', health_content_publication_enabled = true`) === "23514",
      "boş / yalnız boşluktan oluşan referansla genel kilit açılamaz (denetim P3-6)");
    ok(await errCode(`insert into public.stone_library_stones(slug, name_tr, status) values ('zz-st', 'ZZ ST', 'archived')`) === "23514", "geçersiz yayın durumu DB'de reddedilir");

    // ── Kullanıcılar ───────────────────────────────────────────────────────────────────────────
    const T = [randomUUID(), randomUUID()];
    for (const [i, t] of T.entries()) await su.query(`insert into public.tenants(id, name) values ($1,$2)`, [t, `ZZ_F3_T${i}`]);
    let seq = 0;
    const mk = async (label: string, o: { role?: string; stones?: boolean; demo?: boolean; superAdmin?: boolean; tenant?: string } = {}): Promise<Who> => {
      const id = randomUUID(); const token = `zz-f3-tok-${++seq}-${id.slice(0, 8)}`; const role = o.role ?? "expert";
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account, is_super_admin, admin_level)
        values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7,$8,$9)`,
        [id, `ZZ_F3_${label}`, `zz.f3.${label.toLowerCase()}@example.test`, role, JSON.stringify(role === "expert" ? { stones: o.stones ?? true, clients: true } : {}),
          o.tenant ?? T[0], o.demo === true, o.superAdmin === true, role === "admin" ? "owner" : null]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const OWNER = await mk("OWNER", { role: "admin", superAdmin: true });
    const ADMIN = await mk("ADMIN", { role: "admin" });
    const DEMO_OWNER = await mk("DEMOOWNER", { role: "admin", superAdmin: true, demo: true });
    const E1 = await mk("E1");
    const E2 = await mk("E2", { tenant: T[1] });
    const E3 = await mk("E3NOSTONES", { stones: false });
    const asAdmin = (w: Who) => ({ kind: "admin" as const, id: w.id, token: w.token });
    const asUser = (w: Who) => ({ kind: "user" as const, id: w.id, token: w.token });
    const owner = (fn: string, args: Record<string, unknown>) => db.rpc(fn, { p_actor: OWNER.id, ...args }).then(({ data, error }) => {
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === "object" && fn in data[0] ? (data[0] as Record<string, unknown>)[fn] : data;
    });
    const ownerErr = async (fn: string, args: Record<string, unknown>) => { try { await owner(fn, args); return null; } catch (e) { return (e as { code?: string }).code ?? "?"; } };

    const SRC = String(await owner("stone_library_source_save", { p_source_id: null, p_data: { source_key: "zz-f3-api", kind: "api", real_name: "RoxyAPI (ZZ sentetik)", provider_code: "roxy" } }));
    await owner("stone_library_source_save", { p_source_id: SRC, p_data: { license_type: "api_terms", license_terms_url: "https://example.test/terms", license_terms_sha256: "a".repeat(64), commercial_use_ok: true, status: "active", image_rights: "rehost_ok" } });
    const DOC = String(await owner("stone_library_document_add", { p_source_id: SRC, p_data: { doc_kind: "correspondence", title: "ZZ e-posta ekran görüntüsü — özgün e-posta değil (sentetik)", content_sha256: "e".repeat(64) } }));
    const LIC = String(await owner("stone_library_license_grant_save", { p_grant_id: null, p_data: {
      source_id: SRC, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "ZZ sağlayıcı destek ekibi", commercial_display: true, storage_allowed: true,
      post_subscription_rights: true, attribution_required: false, modification_allowed: true, redistribution_limit: "Bağımsız veri seti veya API olarak yeniden dağıtılamaz.",
      max_resolution: "300x300", document_id: DOC, document_sha256: "e".repeat(64) } }));
    const LONG = new Set([fakeId(1), fakeId(2)]);
    const run = async (fake: ReturnType<typeof createFakeCrystals>, extra: Partial<Parameters<typeof runCrystalImport>[0]> = {}): Promise<RunnerSummary> => {
      fakeHandler = fake.handler;
      return runCrystalImport({ db, actor: OWNER.id, sourceId: SRC, licenseGrantId: LIC, client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "sentetik-test-anahtari-0123456789abcdef", fetchImpl: fake.handler, timeoutMs: 300 },
        imageFetch: fake.handler, includeImages: true, includeBirthstones: true, includeVocabLists: true, creditCap: 1000, allowanceRemaining: 1000, quotaFloor: 5000,
        termsSha256: "b".repeat(64), sleep: async () => undefined, ...extra });
    };

    // ── 1) Aktarım F3 kurallarıyla ──────────────────────────────────────────────────────────────
    section("1. Aktarım F3 koruma kurallarıyla (91 sentetik taş)");
    const fake1 = createFakeCrystals({ count: 91, longText: LONG, duplicateImageOf: new Map([[fakeId(31), fakeId(30)]]) });
    const s1 = await run(fake1);
    ok(s1.status === "completed" && s1.stonesCreated === 91, "aktarım tamamlandı, 91 taş", { st: s1.status, c: s1.stonesCreated, r: s1.stopReason });
    const allIssues = Object.values(s1.issues).flat();
    ok(!allIssues.some((i) => /facet_rejected|name_en_not_set/.test(i)), "F3 kuralları gerçek aktarım yolunu engellemedi (facet reddi / ad tamamlama hatası yok)", allIssues.filter((i) => /facet_rejected|name_en_not_set/.test(i)).slice(0, 5));
    ok(s1.imagesStored === 91, "91 görsel (özgün + optimize) kendi taşına kaydedildi", s1.imagesStored);
    const integ1 = await owner("stone_library_owner_integrity", { p_stone_id: null }) as Record<string, number | boolean>;
    ok(integ1.ok === true && integ1.records_total === integ1.records_verbatim && integ1.keywords_total === integ1.keywords_verbatim && integ1.non_source_current === 0
      && integ1.names_tr_checked === 91 && integ1.names_en_checked === 91, "bütünlük RPC'si: tüm kaynak kayıtları + anahtar kelimeler + adlar ham yanıtla birebir", integ1);
    ok(await n(`select count(*)::int from public.stone_library_records r where r.origin='source' and (r.raw_id is null
        or (select payload #>> public.stone_library_field_path(r.field_key) from public.stone_library_raw w where w.id=r.raw_id) is distinct from r.content)`) === 0,
      "her kaynak kaydı ham yanıtta KENDİ ALANININ yolundaki değerle aynen aynı");
    ok(await n(`select count(*)::int from public.stone_library_names`) === 0, "alternatif ad EKLENMEDİ (owner kararı)");
    const stoneOf = async (i: number) => String(await one(`select stone_id from public.stone_library_external_ids where external_id=$1`, [fakeId(i)]));
    const slugOf = async (i: number) => String(await one(`select s.slug from public.stone_library_stones s join public.stone_library_external_ids e on e.stone_id=s.id where e.external_id=$1`, [fakeId(i)]));
    const S1 = await stoneOf(1); const S2 = await stoneOf(2); const S3 = await stoneOf(3); const S5 = await stoneOf(5);

    // ── 2) Kaynak verisi koruması ───────────────────────────────────────────────────────────────
    section("2. Kaynak verisi koruması (hiçbir yönetim yolu sağlayıcı metnini / adını değiştiremez)");
    const R = async (p: string) => (await import(`../../app/api/admin/dogaltas-kutuphane/${p}`)) as Record<string, Handler>;
    const inc = (await R("inceleme/route")).POST;
    const taslarId = await R("taslar/[id]/route");
    const descTr1 = await q<{ id: string; raw_id: string; content: string }>(`select id, raw_id, content from public.stone_library_records where stone_id=$1 and field_key='description' and lang='tr' and is_current`, [S1]);
    const affTr1 = String(await one(`select content from public.stone_library_records where stone_id=$1 and field_key='affirmation' and lang='tr' and is_current`, [S1]));
    ok(await errCode(`select public.stone_library_record_add($1,$2)`, [OWNER.id, JSON.stringify({ stone_id: S1, source_id: SRC, field_key: "description", lang: "tr", content: "ZZ owner düzeltmesi.", origin: "owner_edit", based_on_id: descTr1[0].id })]) === "SL037",
      "owner düzenlemesi (owner_edit) sağlayıcı kaynağında DB'de reddedilir (SL037)");
    const ed = await call(inc, asAdmin(OWNER), { method: "POST", body: { entity: "record", id: descTr1[0].id, action: "edit_text", stone_id: S1, content: "ZZ owner düzenlemesi." } });
    ok(ed.status === 400 && ed.json.code === "INPUT", "owner API'sinde metin düzenleme ucu YOK (edit_text → 400)", ed.json);
    ok(await errCode(`select public.stone_library_record_add($1,$2)`, [OWNER.id, JSON.stringify({ stone_id: S1, source_id: SRC, field_key: "general", lang: "tr", content: "ZZ ham bağı olmayan kaynak metni.", origin: "source" })]) === "SL038",
      "sağlayıcı kaynak kaydı ham yanıt bağı olmadan eklenemez (SL038)");
    ok(await errCode(`select public.stone_library_facet_add($1,$2)`, [OWNER.id, JSON.stringify({ stone_id: S1, source_id: SRC, facet: "keyword", lang: "tr", value_text: "ZZ owner anahtar kelimesi" })]) === "SL038",
      "sağlayıcı kaynağına ham bağı olmayan anahtar kelime eklenemez (SL038)");
    ok(await errCode(`select public.stone_library_record_add($1,$2)`, [OWNER.id, JSON.stringify({ stone_id: S1, source_id: SRC, field_key: "description", lang: "tr", content: affTr1, origin: "source", raw_id: descTr1[0].raw_id })]) === "SL012",
      "alan–yol kuralı: ham yanıtta geçen başka alanın metni (olumlama) açıklama alanına kaydedilemez (SL012)");
    ok(await errCode(`select public.stone_library_facet_add($1,$2)`, [OWNER.id, JSON.stringify({ stone_id: S1, source_id: SRC, facet: "keyword", lang: "tr", value_text: affTr1, raw_id: descTr1[0].raw_id })]) === "SL012",
      "alan–yol kuralı: anahtar kelime yalnız ham yanıtın anahtar kelime listesinden gelebilir (SL012)");
    const nm = await call(taslarId.POST, asAdmin(OWNER), { method: "POST", params: { id: S1 }, body: { action: "edit", data: { name_tr: "ZZ Yeni Ad" } } });
    ok(nm.status === 409 && nm.json.code === "SL039", "sağlayıcı kaynağındaki Türkçe ad owner ucundan değiştirilemez (409 SL039)", nm.json);
    const nmEn = await call(taslarId.POST, asAdmin(OWNER), { method: "POST", params: { id: S1 }, body: { action: "edit", data: { name_en: "ZZ New Name" } } });
    ok(nmEn.status === 409 && nmEn.json.code === "SL039", "sağlayıcı kaynağındaki İngilizce ad değiştirilemez (409 SL039)");
    ok(await errCode(`update public.stone_library_stones set name_tr = name_tr || ' ' where id=$1`, [S1]) === "SL039", "ada tek boşluk eklemek bile DB'de reddedilir");
    ok(await errCode(`update public.stone_library_stones set name_en = null where id=$1`, [S1]) === "SL039", "kaynak İngilizce adı silinemez");
    ok(await errCode(`update public.stone_library_stones set name_en = name_en where id=$1`, [S1]) === null, "değişmeyen ad güncellemesi serbest (gürültü yok)");
    const ownStone = String(await owner("stone_library_stone_save", { p_stone_id: null, p_data: { slug: "zz-owner-karti", name_tr: "ZZ Owner Kartı" } }));
    const rn = await call(taslarId.POST, asAdmin(OWNER), { method: "POST", params: { id: ownStone }, body: { action: "edit", data: { name_tr: "ZZ Owner Kartı 2" } } });
    ok(rn.status === 200, "owner'ın kendi oluşturduğu (kaynaksız) kart düzenlenebilir — kural yalnız sağlayıcı verisini korur", rn.json);
    // F1 kapsamı korunur: eğitmen arşivi kaynağında owner düzenlemesi (yeni sürüm) çalışmaya devam eder.
    const TRN = String(await owner("stone_library_source_save", { p_source_id: null, p_data: { source_key: "zz-f3-trainer", kind: "trainer_archive", real_name: "ZZ Eğitmen Arşivi" } }));
    const tr0 = String(await owner("stone_library_record_add", { p_data: { stone_id: ownStone, source_id: TRN, field_key: "description", lang: "tr", content: "ZZ eğitmen metni.", origin: "source" } }));
    ok(await ownerErr("stone_library_record_add", { p_data: { stone_id: ownStone, source_id: TRN, field_key: "description", lang: "tr", content: "ZZ eğitmen metni düzeltildi.", origin: "owner_edit", based_on_id: tr0 } }) === null,
      "F1 davranışı korunur: eğitmen arşivi (API olmayan) kaynakta owner düzenlemesi yeni sürüm olarak çalışır");
    ok(await n(`select count(*)::int from public.stone_library_records r join public.stone_library_sources s on s.id=r.source_id where s.kind='api' and r.origin<>'source'`) === 0,
      "sağlayıcı kaynağında kaynak dışı (owner) sürüm SIFIR");

    // ── 2b) Bağımsız denetim bulguları (P1 / P2) ─────────────────────────────────────────────────
    section("2b. Bağımsız denetim bulguları: tür çevirme, bağlantı zinciri, başka taşın ham yanıtı, ham bağsız facet, alternatif ad");
    ok(await ownerErr("stone_library_source_save", { p_source_id: SRC, p_data: { kind: "trainer_archive" } }) === "SL093"
      && await ownerErr("stone_library_source_save", { p_source_id: SRC, p_data: { provider_code: "zz" } }) === "SL093",
      "P1-1: veri bağlı sağlayıcı kaynağının türü / sağlayıcı kodu değiştirilemez (korumaları atlatma yolu kapalı, SL093)");
    const kayR = await call((await R("kaynaklar/route")).POST, asAdmin(OWNER), { method: "POST", body: { action: "save_source", id: SRC, data: { kind: "trainer_archive" } } });
    ok(kayR.status === 409 && kayR.json.code === "SL093", "P1-1: owner ucundan tür çevirme reddedilir (409 SL093)", kayR.json);
    ok(String(await one(`select kind from public.stone_library_sources where id=$1`, [SRC])) === "api", "kaynak türü değişmedi");
    const silme = (await R("silme/route")).POST;
    const ext2 = String(await one(`select id from public.stone_library_external_ids where stone_id=$1`, [S2]));
    const delExt = await call(silme, asAdmin(OWNER), { method: "POST", body: { action: "delete", entity: "external_id", id: ext2, cascade: true } });
    ok(delExt.status === 200, "harici kimlik geri alınabilir biçimde silindi (zincir testi)", delExt.json);
    const nm2 = await call(taslarId.POST, asAdmin(OWNER), { method: "POST", params: { id: S2 }, body: { action: "edit", data: { name_tr: "ZZ Bağlantısız Ad" } } });
    ok(nm2.status === 409 && nm2.json.code === "SL039", "P1-2: bağlantı silinmişken de sağlayıcı adı değiştirilemez (silinmiş bağlantılar dahil)", nm2.json);
    const integDel = await owner("stone_library_owner_integrity", { p_stone_id: S2 }) as { names_tr_checked: number; ok: boolean };
    ok(integDel.names_tr_checked === 1 && integDel.ok === true, "P2-2: bağlantı silinmişken bütünlük adları yine denetliyor (yanlış-negatif yok)", integDel);
    const orphan2 = String(await owner("stone_library_stone_save", { p_stone_id: null, p_data: { slug: "zz-yabanci-kart", name_tr: "ZZ Yabancı Kart" } }));
    ok(await ownerErr("stone_library_external_id_link", { p_source_id: SRC, p_external_id: fakeId(2), p_stone_id: orphan2, p_batch_id: null }) === "SL039",
      "P1-2: sağlayıcı kimliği, adı farklı başka bir karta bağlanamaz (SL039)");
    const rsExt = await call(silme, asAdmin(OWNER), { method: "POST", body: { action: "restore", op_id: delExt.json.op_id } });
    ok(rsExt.status === 200 && await n(`select count(*)::int from public.stone_library_external_ids where id=$1 and deleted_at is null`, [ext2]) === 1, "adı değişmemiş kartın bağlantısı geri getirildi", rsExt.json);
    const desc5raw = (await q<{ raw_id: string; content: string }>(`select raw_id, content from public.stone_library_records where stone_id=$1 and field_key='description' and lang='tr' and is_current`, [S5]))[0];
    ok(await errCode(`select public.stone_library_record_add($1,$2)`, [OWNER.id, JSON.stringify({ stone_id: S1, source_id: SRC, field_key: "description", lang: "tr", content: desc5raw.content, origin: "source", raw_id: desc5raw.raw_id })]) === "SL094",
      "P2-1: başka taşın ham yanıtıyla kaynak kaydı eklenemez (SL094)");
    const kw5 = String(await one(`select value_text from public.stone_library_facets where stone_id=$1 and facet='keyword' and lang='tr' limit 1`, [S5]));
    ok(await errCode(`select public.stone_library_facet_add($1,$2)`, [OWNER.id, JSON.stringify({ stone_id: S1, source_id: SRC, facet: "keyword", lang: "tr", value_text: kw5, raw_id: desc5raw.raw_id })]) === "SL038",
      "P2-4: paket dışı anahtar kelime eklenemez (SL038)");
    ok(await errCode(`select public.stone_library_facet_add($1,$2)`, [OWNER.id, JSON.stringify({ stone_id: S1, source_id: SRC, facet: "zodiac", value_key: "aries" })]) === "SL038",
      "P2-4: sağlayıcı kaynağına ham bağı olmayan yapısal değer (burç) eklenemez (SL038)");
    const enRaw1 = String(await one(`select raw_id from public.stone_library_records where stone_id=$1 and lang='en' and field_key='description' and is_current`, [S1]));
    ok(await ownerErr("stone_library_facet_add", { p_data: { stone_id: S1, source_id: SRC, facet: "chakra", value_key: "root", raw_id: enRaw1 } }) === "SL038",
      "P2-4: sağlayıcı kaynağına aktarım paketi dışında yapısal değer eklenemez (SL038)");
    const b1 = String(await one(`select batch_id from public.stone_library_records where id=$1`, [descTr1[0].id]));
    await su.query(`update public.stone_library_import_batches set status='running' where id=$1`, [b1]);
    ok(await ownerErr("stone_library_facet_add", { p_data: { stone_id: S1, source_id: SRC, facet: "hardness", value_num: 9.5, raw_id: enRaw1, batch_id: b1 } }) === "SL012"
      && await ownerErr("stone_library_facet_add", { p_data: { stone_id: S1, source_id: SRC, facet: "pairing", pair_external_id: fakeId(77), raw_id: enRaw1, batch_id: b1 } }) === "SL012",
      "P2-4: Roxy sertlik / eşleştirme değeri ham yanıttakinden farklıysa paket içinde de reddedilir (SL012)");
    ok(await errCode(`select public.stone_library_facet_add($1,$2)`, [OWNER.id, JSON.stringify({ stone_id: S1, source_id: SRC, facet: "keyword", lang: "tr", value_text: kw5, raw_id: desc5raw.raw_id, batch_id: b1 })]) === "SL094",
      "P2-1: paket içinde de başka taşın ham yanıtıyla anahtar kelime eklenemez (SL094)");
    await su.query(`update public.stone_library_import_batches set status='completed' where id=$1`, [b1]);
    const na = await db.rpc("stone_library_name_add", { p_actor: OWNER.id, p_stone_id: S1, p_lang: "tr", p_name: "ZZ Alternatif", p_kind: "alias", p_source_id: null, p_batch_id: null });
    ok(!!na.error && await n(`select count(*)::int from public.stone_library_names`) === 0, "P2-5: alternatif ad ekleme RPC'si kapalı (owner kararı); ad eklenmedi", na.error?.code);

    // ── 3) Yayın modeli ─────────────────────────────────────────────────────────────────────────
    section("3. Yayın modeli: taslak → incelemede → yayına hazır → yayında → yayından kaldırılmış");
    const grant = await call((await R("yetkiler/route")).POST, asAdmin(OWNER), { method: "POST", body: { action: "grant", user_id: E1.id } });
    ok(grant.status === 200, "owner E1'e kişi bazlı erişim verdi (diğer uzmanlar kapalı)");
    const S = (await import("../../app/api/dogaltas/kutuphane/route")).GET as unknown as Handler;
    const D = (await import("../../app/api/dogaltas/kutuphane/[slug]/route")).GET as unknown as Handler;
    const G = (await import("../../app/api/dogaltas/kutuphane/[slug]/gorsel/route")).GET as unknown as Handler;
    const act = (id: string, action: string, extra: Record<string, unknown> = {}) => call(taslarId.POST, asAdmin(OWNER), { method: "POST", params: { id }, body: { action, ...extra } });
    const r1 = await act(S1, "ready");
    ok(r1.status === 409 && r1.json.code === "SL090" && String(r1.json.error).includes("records_pending"), "bekleyen kayıt varken 'yayına hazır' reddedilir (409 SL090, engel listesiyle)", r1.json);
    ok((await act(S1, "publish")).json.code === "SL091", "taslaktan doğrudan yayın reddedilir (önce yayına hazır)");
    ok((await act(S1, "withdraw")).json.code === "SL091", "yayında olmayan taş 'yayından kaldırılamaz'");
    ok((await act(S1, "review")).status === 200 && String(await one(`select status from public.stone_library_stones where id=$1`, [S1])) === "review", "taş 'incelemede' durumuna alındı");
    const allIds = (await q<{ id: string }>(`select s.id from public.stone_library_stones s join public.stone_library_external_ids e on e.stone_id=s.id`)).map((x) => x.id);
    const pendRec = await n(`select count(*)::int from public.stone_library_records where is_current and review_state='pending' and deleted_at is null`);
    const pendFac = await n(`select count(*)::int from public.stone_library_facets where review_state='pending' and deleted_at is null`);
    const bulkBad = await call(inc, asAdmin(OWNER), { method: "POST", body: { action: "bulk_approve", stone_ids: ["x"] } });
    ok(bulkBad.status === 400, "toplu onay: geçersiz kimlik → 400");
    const bulk = await call(inc, asAdmin(OWNER), { method: "POST", body: { action: "bulk_approve", stone_ids: allIds, note: "ZZ owner toplu inceleme" } });
    const br = bulk.json.result as Record<string, number>;
    ok(bulk.status === 200 && br.records_approved === pendRec && br.facets_approved === pendFac && br.stones === 91, "toplu onay: 91 taşın bekleyen güncel kayıt + facet'leri onaylandı (sayılar birebir)", { br, pendRec, pendFac });
    ok(await n(`select count(*)::int from public.stone_library_images where review_state <> 'pending'`) === 0, "toplu onay görselleri KAPSAMAZ (ayrı owner adımı)");
    ok(await n(`select count(*)::int from public.stone_library_reviews where action='approve' and note='ZZ owner toplu inceleme'`) === pendRec + pendFac, "her toplu onay tek tek inceleme kaydına yazıldı (denetim izi)");
    const rd1 = (await call(taslarId.GET, asAdmin(OWNER), { params: { id: S1 } })).json.readiness as { ready: boolean; blockers: string[]; warnings: string[] };
    ok(!rd1.ready && rd1.blockers.includes("images_pending") && rd1.warnings.includes("health_content_not_published"), "hazırlık: görsel bekliyor engeli + sağlık içeriği yayımlanmayacak uyarısı", rd1);
    for (const img of await q<{ id: string }>(`select id from public.stone_library_images where deleted_at is null`)) await owner("stone_library_image_review", { p_image_id: img.id, p_action: "approve", p_note: null });
    const rd1b = (await act(S1, "ready")).json.readiness as { ready: boolean; warnings: string[] };
    ok(String(await one(`select status from public.stone_library_stones where id=$1`, [S1])) === "ready" && rd1b.warnings.includes("image_not_publishable"),
      "görseller onaylandı → 'yayına hazır'; lisans doğrulanmadığı için görsel yayımlanmayacak uyarısı", rd1b);
    ok((await act(S1, "publish")).status === 200 && await n(`select count(*)::int from public.stone_library_published where stone_id=$1`, [S1]) === 1, "yayına hazır taş yayımlandı");
    const slug1 = await slugOf(1);
    const d1 = await call(D, asUser(E1), { params: { slug: slug1 } });
    const doc1 = d1.json.item as Record<string, unknown>;
    ok(d1.status === 200 && (doc1.sections as { fields: { field: string }[] }[]).every((s) => s.fields.every((f) => f.field !== "meaning_physical")) && doc1.has_health_content === false,
      "varsayılan modda fiziksel etki uzmana gitmez; has_health_content=false", doc1.has_health_content);
    ok(JSON.stringify(doc1.medical_notice) === JSON.stringify({ tr: STONE_LIBRARY_MEDICAL_NOTICE_TR, en: cfg0.medical_notice_en }), "ayrı tıbbi bilgilendirme bileşeni belgede (metinlerin İÇİNDE değil)");
    // Görünür içeriği olmayan taş: yalnız sağlık içeriği kalırsa yayına hazır olamaz.
    for (const r of await q<{ id: string }>(`select id from public.stone_library_records where stone_id=$1 and is_current and not health_sensitive`, [S3])) {
      await owner("stone_library_review", { p_entity: "record", p_id: r.id, p_action: "hide", p_note: null });
    }
    const r3 = await act(S3, "ready");
    ok(r3.status === 409 && String(r3.json.error).includes("no_visible_content"), "yalnız kilitli sağlık içeriği kalan taş 'yayına hazır' olamaz (no_visible_content)", r3.json);
    ok((await act(S1, "ready")).json.code === "SL091" && (await act(S1, "review")).json.code === "SL091", "yayındaki taş sessizce 'yayına hazır' / 'incelemede'ye düşürülemez (önce yayından kaldır)");
    ok((await act(S1, "withdraw")).status === 200 && (await call(D, asUser(E1), { params: { slug: slug1 } })).status === 404, "yayından kaldırılan taş uzmana 404");
    ok(((await call(S, asUser(E1), { query: "?q=ZZ%20Kristal%201" })).json.items as { slug: string }[]).every((i) => i.slug !== slug1), "yayından kaldırılan taş aramada yok");
    ok((await act(S1, "publish")).status === 200 && (await call(D, asUser(E1), { params: { slug: slug1 } })).status === 200, "yayından kaldırılmış taş yeniden yayımlandı");
    const del1 = await call((await R("silme/route")).POST, asAdmin(OWNER), { method: "POST", body: { action: "delete", entity: "stone", id: S1, cascade: true } });
    ok(del1.status === 409, "yayındaki taş silinemez (önce yayından kaldır)", del1.json);
    await act(S1, "withdraw");
    const del2 = await call((await R("silme/route")).POST, asAdmin(OWNER), { method: "POST", body: { action: "delete", entity: "stone", id: S1, cascade: true, reason: "ZZ geri alınabilir silme" } });
    ok(del2.status === 200 && !!del2.json.op_id && await n(`select count(*)::int from public.stone_library_stones where id=$1 and deleted_at is not null`, [S1]) === 1, "geri alınabilir silme (cascade)");
    const rDel = await act(S1, "ready");
    ok(rDel.status >= 400 && rDel.json.code === "SL024", "silinmiş taş durum değiştiremez (SL024)", rDel.json);
    const rs = await call((await R("silme/route")).POST, asAdmin(OWNER), { method: "POST", body: { action: "restore", op_id: del2.json.op_id } });
    ok(rs.status === 200 && Number(rs.json.restored) > 0 && String(await one(`select status from public.stone_library_stones where id=$1`, [S1])) === "hidden", "silinen taş geri getirildi (durum: yayından kaldırılmış)", rs.json);
    ok((await act(S1, "publish")).status === 200, "geri getirilen taş yeniden yayımlandı");
    // Kalan taşlar: hazırla + yayımla
    const readyFail: string[] = [];
    for (const id of allIds) {
      if (id === S1 || id === S3) continue;
      const a = await act(id, "ready");
      if (a.status !== 200) { readyFail.push(String(a.json.error)); continue; }
      await act(id, "publish");
    }
    const pubCount = await n(`select count(*)::int from public.stone_library_published`);
    ok(readyFail.length === 0 && pubCount === 90, "90 taş yayında (S3 bilinçli olarak içeriksiz)", { pubCount, readyFail: readyFail.slice(0, 3) });

    // ── 4) Sağlık C modeli ──────────────────────────────────────────────────────────────────────
    section("4. Sağlık içeriği — C modeli (owner yayın kararı; metin değişmez; ayrı tıbbi bilgilendirme)");
    const ayar = (await R("ayarlar/route")).POST;
    const legalBefore = await n(`select count(*)::int from public.stone_library_records where legal_cleared_at is not null`);
    const a1 = await call(ayar, asAdmin(OWNER), { method: "POST", body: { data: { health_content_publication_enabled: true } } });
    ok(a1.status >= 400, "legal_review modunda hukuk referansı olmadan genel kilit açılamaz", a1.status);
    const a2 = await call(ayar, asAdmin(OWNER), { method: "POST", body: { data: { health_publication_mode: "owner_decision", health_content_publication_enabled: true } } });
    ok(a2.status >= 400, "owner_decision modunda owner karar referansı olmadan açılamaz", a2.status);
    const a3 = await call(ayar, asAdmin(OWNER), { method: "POST", body: { data: { health_publication_mode: "owner_decision", owner_decision_ref: "ZZ owner yazılı yayın kararı (sentetik)", health_content_publication_enabled: true } } });
    ok(a3.status === 200, "owner_decision modu + owner karar referansı + genel kilit açık (YALNIZ izole ortam)");
    ok(((await call(D, asUser(E1), { params: { slug: slug1 } })).json.item as { has_health_content: boolean }).has_health_content === false, "taş bazında owner kararı olmadan sağlık içeriği hâlâ gizli");
    const physBefore = (await call(S, asUser(E1), { query: "?q=fiziksel%20etki%201" })).json.total;
    ok(physBefore === 0, "gizli sağlık metni aramada da bulunmaz (arama dizini yalnız görünür içerikten)", physBefore);
    const noNote = await act(S1, "health_allow");
    ok(noNote.status === 400 && noNote.json.code === "SL092", "owner sağlık kararı yazılı not olmadan verilemez (SL092)", noNote.json);
    ok((await act(S1, "health_allow", { note: "ZZ owner kararı: fiziksel etki metinleri aynen gösterilecek" })).status === 200, "owner taş bazında sağlık yayın kararı verdi");
    const d1h = (await call(D, asUser(E1), { params: { slug: slug1 } })).json.item as { sections: { fields: { field: string; lang: string; content: string; health_related: boolean }[] }[]; has_health_content: boolean };
    const phys = d1h.sections.flatMap((s) => s.fields).filter((f) => f.field === "meaning_physical");
    const dbPhys = await q<{ lang: string; content: string }>(`select lang, content from public.stone_library_records where stone_id=$1 and field_key='meaning_physical' and is_current`, [S1]);
    ok(phys.length === 2 && phys.every((f) => f.health_related && dbPhys.some((r) => r.lang === f.lang && r.content === f.content)) && d1h.has_health_content,
      "C modeli: fiziksel etki TR + EN aynen gösterildi, health_related=true, has_health_content=true", phys);
    ok(phys.every((f) => !f.content.includes(STONE_LIBRARY_MEDICAL_NOTICE_TR.slice(0, 30))), "tıbbi bilgilendirme kaynak metninin içine EKLENMEDİ");
    ok(await n(`select count(*)::int from public.stone_library_records where legal_cleared_at is not null`) === legalBefore, "owner kararı hukuki onay olarak KAYDEDİLMEDİ (legal_cleared_at değişmedi)");
    ok(((await call(S, asUser(E1), { query: "?q=fiziksel%20etki%201" })).json.items as { slug: string }[]).some((i) => i.slug === slug1), "yayına açılan sağlık metni artık aranabilir");
    ok((await act(S1, "health_revoke")).status === 200
      && ((await call(D, asUser(E1), { params: { slug: slug1 } })).json.item as { has_health_content: boolean }).has_health_content === false, "owner kararı geri alındı → sağlık içeriği yeniden gizli");
    await act(S3, "health_allow", { note: "ZZ owner kararı" });
    ok((await act(S3, "ready")).status === 200 && (await act(S3, "publish")).status === 200, "C modelinde yalnız sağlık içeriği olan taş da owner kararıyla yayına hazır + yayında");
    await act(S1, "health_allow", { note: "ZZ owner kararı" });
    await call(ayar, asAdmin(OWNER), { method: "POST", body: { data: { health_publication_mode: "legal_review", health_content_publication_enabled: false } } });
    ok(((await call(D, asUser(E1), { params: { slug: slug1 } })).json.item as { has_health_content: boolean }).has_health_content === false
      && (await call(D, asUser(E1), { params: { slug: await slugOf(3) } })).status === 200,
      "legal_review moduna dönüşte owner kararları etkisiz (yayın kapısı tek ayardan geri alınır)");
    ok(await n(`select count(*)::int from public.stone_library_published p where p.doc::text like '%"field": "meaning_physical"%'`) === 0, "varsayılana dönünce yayın yüzeyinde fiziksel etki SIFIR");

    // ── 5) Görsel–taş eşleşmesi + lisans ─────────────────────────────────────────────────────────
    section("5. Görseller: taş eşleşmesi, türetme, lisans doğrulaması, sızıntı");
    ok(await n(`select count(*)::int from public.stone_library_images i left join public.stone_library_external_ids e on e.stone_id=i.stone_id and e.source_id=i.source_id and e.external_id=i.external_id where e.id is null`) === 0,
      "her görselin harici kimliği kendi taşının harici kimliği (91 × 2)");
    ok(await n(`select count(*)::int from public.stone_library_images o join public.stone_library_images p on p.id=o.derived_from_id where o.stone_id<>p.stone_id or p.variant<>'original'`) === 0,
      "her optimize sürüm kendi taşının özgün görselinden türedi");
    ok(await n(`select count(*)::int from public.stone_library_images where 'duplicate_image' = any(quality_flags)`) >= 1, "sağlayıcıdaki aynı fotoğraf işaretli (duplicate_image)");
    const im1 = (await q<Record<string, unknown>>(`select * from public.stone_library_images where stone_id=$1 and variant='original'`, [S1]))[0];
    const imgData = (o: Record<string, unknown>) => ({ stone_id: o.stone_id, source_id: SRC, license_grant_id: LIC, external_id: o.external_id, variant: o.variant,
      derived_from_id: o.derived_from_id, source_url: o.source_url, storage_path: o.storage_path, mime: o.mime, bytes: o.bytes, width: o.width, height: o.height, sha256: o.sha256 });
    await su.query(`update public.stone_library_images set deleted_at = now() where stone_id=$1`, [S5]);
    const im5 = (await q<Record<string, unknown>>(`select * from public.stone_library_images where stone_id=$1 and variant='original'`, [S5]))[0];
    ok(await ownerErr("stone_library_image_register", { p_data: { ...imgData(im1), stone_id: S5 } }) === "SL089", "başka taşın harici kimliğiyle görsel bu taşa bağlanamaz (SL089)");
    ok(await ownerErr("stone_library_image_register", { p_data: { ...imgData(im5), source_url: "https://roxyapi.com/img/crystals/zz-crystal-001.jpg" } }) === "SL089", "kaynak yanıttaki adresle eşleşmeyen görsel adresi reddedilir (SL089)");
    ok(await ownerErr("stone_library_image_register", { p_data: { ...imgData(im5), external_id: null } }) === "SL089", "sağlayıcı görseli harici kimliksiz kaydedilemez (SL089)");
    const opt5 = { ...imgData(im5), variant: "optimized", derived_from_id: im1.id, source_url: null, mime: "image/webp" };
    ok(await ownerErr("stone_library_image_register", { p_data: opt5 }) === "SL089", "optimize sürüm başka taşın özgün görselinden türetilemez (SL089)");
    await su.query(`update public.stone_library_images set deleted_at = null where stone_id=$1`, [S5]);
    ok((await call(G, asUser(E1), { params: { slug: slug1 } })).status === 404 && (doc1.image ?? null) === null, "lisans owner tarafından doğrulanmadan görsel uzmana 404 / belgede yok");
    const kay = (await R("kaynaklar/route")).POST;
    const ver = await call(kay, asAdmin(OWNER), { method: "POST", body: { action: "license_status", id: LIC, status: "verified", note: "ZZ ekran görüntüsü SHA-256 eşleşti" } });
    ok(ver.status === 200, "owner lisans iznini SHA eşleşen belgeyle doğruladı", ver.json);
    const g1 = await call(G, asUser(E1), { params: { slug: slug1 } });
    const opt1 = String(await one(`select sha256 from public.stone_library_images where stone_id=$1 and variant='optimized'`, [S1]));
    ok(g1.status === 200 && sha(g1.bytes) === opt1 && g1.type === "image/webp", "doğrulanmış lisansla görsel servis edildi; bayt SHA-256 = kayıt", { st: g1.status });
    const g1o = await call(G, asUser(E1), { params: { slug: slug1 }, query: "?v=original" });
    ok(g1o.status === 200 && sha(g1o.bytes) === String(im1.sha256), "özgün sürüm bayt bayt korunmuş (SHA-256)");
    const slug6 = await slugOf(6); const S6 = await stoneOf(6);
    ok((await call(G, asUser(E1), { params: { slug: slug6 } })).status === 200, "taş 6 görseli servis ediliyor");
    const ext6 = String(await one(`select id from public.stone_library_external_ids where stone_id=$1`, [S6]));
    const del6 = await call((await R("silme/route")).POST, asAdmin(OWNER), { method: "POST", body: { action: "delete", entity: "external_id", id: ext6, cascade: true } });
    ok(del6.status === 200 && (await call(G, asUser(E1), { params: { slug: slug6 } })).status === 404
      && ((await call(D, asUser(E1), { params: { slug: slug6 } })).json.item as { image: unknown } | undefined)?.image == null,
      "P2-6: harici kimlik bağı kalkınca görsel yayından düşer (yayın anında bağ kontrolü)", del6.json);
    await call((await R("silme/route")).POST, asAdmin(OWNER), { method: "POST", body: { action: "restore", op_id: del6.json.op_id } });
    ok((await call(G, asUser(E1), { params: { slug: slug6 } })).status === 200, "bağ geri gelince görsel yeniden servis ediliyor");
    const dImg = (await call(D, asUser(E1), { params: { slug: slug1 } })).json.item as Record<string, unknown>;
    ok(JSON.stringify(dImg.image) === JSON.stringify({ available: true, width: 300, height: 300, attribution: null }), "kart yanıtında yalnız görsel boyutu (URL / yol / bucket yok)", dImg.image);
    ok(!/roxyapi|img\/crystals|stone-library-images|orig\/|opt\//i.test(JSON.stringify(dImg)), "uzman kart yanıtında kaynak URL'si / depo yolu YOK");

    // ── 6) Arama ve filtreleme ──────────────────────────────────────────────────────────────────
    section("6. Arama + filtre: önizleme '…', birebir ad önceliği, filtre kataloğu, tam metin");
    ok(buildStoneLibraryExcerpt("kısa", false) === "kısa" && buildStoneLibraryExcerpt("a".repeat(240), false) === "a".repeat(240)
      && buildStoneLibraryExcerpt("a".repeat(240), true) === "a".repeat(240) + "…" && buildStoneLibraryExcerpt("a".repeat(241), false) === "a".repeat(240) + "…"
      && buildStoneLibraryExcerpt("🌙".repeat(241), false) === "🌙".repeat(240) + "…" && buildStoneLibraryExcerpt("", false) === null,
      "önizleme: ≤240 aynen, >240 → ilk 240 karakter + '…' (emoji / Türkçe karakter kod noktası sayımı)");
    const longRes = await call(S, asUser(E1), { query: `?q=${encodeURIComponent("ZZ Kristal 2")}` });
    const slug2 = await slugOf(2);
    const it2 = (longRes.json.items as { slug: string; excerpt: string }[]).find((i) => i.slug === slug2);
    const desc2 = String(await one(`select content from public.stone_library_records where stone_id=$1 and field_key='description' and lang='tr' and is_current`, [S2]));
    ok(!!it2 && it2.excerpt === Array.from(desc2).slice(0, 240).join("") + "…" && Array.from(desc2).length > 240, "uzun açıklama: önizleme = kaynak metnin ilk 240 karakteri + '…'", it2?.excerpt?.slice(-20));
    const it5 = ((await call(S, asUser(E1), { query: "?q=ZZ%20Kristal%205" })).json.items as { slug: string; excerpt: string }[]);
    const desc5 = String(await one(`select content from public.stone_library_records where stone_id=$1 and field_key='description' and lang='tr' and is_current`, [S5]));
    ok(it5[0]?.slug === await slugOf(5) && it5[0].excerpt === desc5, "birebir ad eşleşmesi ilk sırada; kısa açıklama önizlemede AYNEN ('…' yok)", it5.slice(0, 3).map((x) => x.slug));
    const en50 = ((await call(S, asUser(E1), { query: "?q=ZZ%20Crystal%2050" })).json.items as { slug: string }[]);
    ok(en50[0]?.slug === await slugOf(50), "İngilizce ad aramasında birebir eşleşme ilk sırada", en50.slice(0, 3));
    const cat = await call(S, asUser(E1), { query: "?filtreler=1" });
    const facets = cat.json.facets as Record<string, { key: string; count: number }[]>;
    const pubN = await n(`select count(*)::int from public.stone_library_published`);
    ok(cat.status === 200 && cat.json.total === pubN && ["chakra", "zodiac", "element", "color", "planet"].every((k) => Array.isArray(facets[k]) && facets[k].length > 0), "filtre kataloğu: 5 facet + toplam yayın sayısı", { total: cat.json.total, pubN });
    let catOk = true;
    for (const k of ["chakra", "zodiac", "element", "color", "planet"] as const) {
      for (const v of facets[k]) {
        const real = await n(`select count(*)::int from public.stone_library_published where $1 = any(${k})`, [v.key]);
        if (real !== v.count) catOk = false;
      }
      const distinct = await n(`select count(distinct x)::int from public.stone_library_published, unnest(${k}) x`);
      if (distinct !== facets[k].length) catOk = false;
    }
    ok(catOk, "katalog sayıları yayın yüzeyiyle birebir; yalnız veride bulunan değerler (üretim / tahmin yok)");
    const heart = facets.chakra.find((v) => v.key === "heart");
    const fh = await call(S, asUser(E1), { query: "?chakra=heart&limit=50" });
    ok(!!heart && fh.json.total === heart.count, "çakra filtresi sonucu katalog sayısıyla aynı", { cat: heart?.count, got: fh.json.total });
    ok(Array.isArray(cat.json.birth_month) && (cat.json.birth_month as unknown[]).length > 0 && !!cat.json.hardness, "doğum ayı + sertlik aralığı katalogda (kaynakta olan veriden)");
    // Ayrıntıda metnin tamamı karakteri karakterine
    let fullOk = 0; let fullAll = 0; let kwOrderOk = true;
    for (const p of await q<{ stone_id: string; slug: string }>(`select stone_id, slug from public.stone_library_published`)) {
      const doc = (await call(D, asUser(E1), { params: { slug: p.slug } })).json.item as { sections: { fields: { field: string; lang: string; content: string }[] }[]; facets: { keyword?: { lang: string; text: string }[] } };
      for (const f of doc.sections.flatMap((s) => s.fields)) {
        fullAll++;
        const cur = String(await one(`select content from public.stone_library_records where stone_id=$1 and field_key=$2 and lang=$3 and is_current and origin='source'`, [p.stone_id, f.field, f.lang]));
        if (cur === f.content) fullOk++;
      }
      const ext = String(await one(`select external_id from public.stone_library_external_ids where stone_id=$1`, [p.stone_id]));
      const rawEn = (await q<{ payload: { keywords: string[] } }>(`select payload from public.stone_library_raw where external_id=$1 and lang='en' and http_status=200 order by fetched_at limit 1`, [ext]))[0]?.payload;
      const shownEn = (doc.facets.keyword ?? []).filter((k) => k.lang === "en").map((k) => k.text);
      if (rawEn && JSON.stringify(shownEn) !== JSON.stringify(rawEn.keywords)) kwOrderOk = false;
    }
    ok(fullAll > 0 && fullOk === fullAll, `taş ayrıntısında kaynak metnin TAMAMI karakteri karakterine (${fullOk}/${fullAll})`);
    ok(kwOrderOk, "anahtar kelimeler kaynak sırasıyla ve aynen gösteriliyor");

    // ── 7) Yetki ve güvenlik ────────────────────────────────────────────────────────────────────
    section("7. Yetki + güvenlik: owner / owner olmayan admin / yetkisiz uzman / oturum / sızıntı / enjeksiyon / mobil");
    const ownerRoutes: [string, string, Record<string, unknown>?][] = [
      ["route", "GET"], ["taslar/route", "GET"], ["taslar/[id]/route", "GET"], ["taslar/[id]/route", "POST", { action: "publish" }],
      ["inceleme/route", "POST", { action: "bulk_approve", stone_ids: [S1] }], ["butunluk/route", "GET"], ["ayarlar/route", "POST", { data: { health_content_publication_enabled: false } }],
      ["silme/route", "POST", { action: "delete", entity: "stone", id: S2 }], ["yetkiler/route", "POST", { action: "grant", user_id: E2.id }],
      ["kaynaklar/route", "POST", { action: "license_status", id: LIC, status: "revoked" }], ["gorseller/[id]/route", "GET"],
    ];
    let ownerGateOk = true; const bodies = new Set<string>();
    for (const [p, m, b] of ownerRoutes) {
      const h = (await R(p))[m];
      for (const who of [asAdmin(ADMIN), asAdmin(DEMO_OWNER), asUser(E1), asAdmin({ id: OWNER.id, token: "zz-sahte-token" }), null]) {
        const r = await call(h, who, { method: m, body: b, params: { id: p.includes("gorseller") ? String(im1.id) : S1 } });
        if (r.status !== 404 || r.cache !== "no-store") ownerGateOk = false;
        bodies.add(r.body);
      }
    }
    ok(ownerGateOk && bodies.size === 1, "11 owner ucu (yeni bütünlük ucu dahil): owner olmayan admin, demo owner, uzman, sahte token, oturumsuz → aynı 404 + no-store", [...bodies].slice(0, 2));
    ok(String(await one(`select evidence_status from public.stone_library_license_grants where id=$1`, [LIC])) === "verified" && await n(`select count(*)::int from public.stone_library_stones where deleted_at is not null`) === 0,
      "reddedilen istekler hiçbir değişiklik yapmadı (lisans / silme)");
    let expertGateOk = true;
    for (const who of [asUser(E2), asUser(E3), asUser({ id: E1.id, token: E2.token }), asUser({ id: E2.id, token: E1.token }), null]) {
      for (const [h, o] of [[S, { query: "" }], [S, { query: "?filtreler=1" }], [D, { params: { slug: slug1 } }], [G, { params: { slug: slug1 } }]] as const) {
        const r = await call(h, who, o);
        if (r.status !== 404) expertGateOk = false;
      }
    }
    ok(expertGateOk, "yetkisiz uzman / Doğaltaş izni olmayan uzman / başka uzmanın kimliği / oturumsuz: arama, katalog, kart, görsel → 404");
    await su.query(`update public.user_sessions set expires_at = now() - interval '1 hour' where user_id=$1`, [E1.id]);
    const exp = await call(S, asUser(E1));
    const expRow = (await q<{ is_active: boolean; end_reason: string | null }>(`select is_active, end_reason from public.user_sessions where user_id=$1`, [E1.id]))[0];
    E1.token = `zz-f3-tok-yeni-${E1.id.slice(0, 8)}`;
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [E1.id, E1.token]);
    ok(exp.status === 404 && !expRow.is_active && (await call(S, asUser(E1))).status === 200,
      "oturum süresi dolunca yetkili uzman da 404 (oturum kapatıldı); yeni oturumla 200", { st: exp.status, expRow });
    await su.query(`update public.users set active=false where id=$1`, [E1.id]);
    ok((await call(S, asUser(E1))).status === 404, "pasif hesap → 404");
    await su.query(`update public.users set active=true where id=$1`, [E1.id]);
    const draftSlug = "zz-owner-karti";
    ok((await call(D, asUser(E1), { params: { slug: draftSlug } })).status === 404 && (await call(D, asUser(E1), { params: { slug: "zz-yok-boyle-tas" } })).status === 404,
      "yayınlanmamış / var olmayan slug → 404 (sızıntı yok)");
    const listAll = await call(S, asUser(E1), { query: "?limit=50" });
    ok(listAll.json.total === await n(`select count(*)::int from public.stone_library_published`), "arama toplamı yalnız yayındaki taşlar");
    const expertBlobs = [listAll.body, cat.body, (await call(D, asUser(E1), { params: { slug: slug1 } })).body];
    const forbiddenKeys = ["raw_id", "source_url", "storage_path", "health_publish_note", "owner_decision_ref", "legal_cleared_at", "legal_review_ref", "quality_flags", "external_id", "payload", "review_state"];
    ok(expertBlobs.every((b) => forbiddenKeys.every((k) => !b.includes(`"${k}"`)) && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(b) && !/roxy/i.test(b)),
      "uzman yanıtlarında gizli alan / iç kimlik / sağlayıcı adı YOK (arama, katalog, kart)");
    const inj = await call(S, asUser(E1), { query: `?q=${encodeURIComponent("'; drop table public.stone_library_published; --")}&chakra=..%2F&filtreler=0` });
    ok(inj.status === 200 && await n(`select count(*)::int from public.stone_library_published`) === pubN, "enjeksiyon denemesi zararsız (200, tablo yerinde)");
    ok((await act(S1, "health_allow", { note: "x".repeat(3000) })).status === 400, "aşırı uzun owner notu → 400");
    ok((await call(taslarId.POST, asAdmin(OWNER), { method: "POST", params: { id: "abc" }, body: { action: "publish" } })).status === 400, "geçersiz taş kimliği → 400");
    ok((await call(taslarId.POST, asAdmin(OWNER), { method: "POST", params: { id: S1 }, body: { action: "zz" } })).status === 400, "bilinmeyen işlem → 400");
    ok(await one(`select public.stone_library_expert_facets($1)`, [E2.id]) === null && await one(`select public.stone_library_expert_search($1, '', '{}'::jsonb, 5, 0)`, [E2.id]) === null,
      "DB ikinci kilidi: yetkisiz uzman kimliğiyle uzman RPC'leri NULL");
    ok(await errCode(`select public.stone_library_owner_integrity($1, null)`, [E1.id]) === "SL001" && await errCode(`select public.stone_library_health_decision($1, $2, 'allow', 'x')`, [ADMIN.id, S1]) === "SL001"
      && await errCode(`select public.stone_library_owner_bulk_review($1, $2::jsonb, null)`, [E1.id, JSON.stringify([S1])]) === "SL001",
      "F3 owner RPC'leri DB'de owner'ı yeniden doğrular (uzman / owner olmayan admin → SL001)");
    // Mobil / tablet
    const times: Record<string, number[]> = { desktop: [], iphone: [], ipad: [], android: [] };
    let uaSame = true;
    const baseList = (await call(S, asUser(E1), { query: "?q=ZZ&limit=20" })).body;
    const baseDoc = (await call(D, asUser(E1), { params: { slug: slug1 } })).body;
    for (const [k, ua] of Object.entries(UA)) {
      for (let i = 0; i < 10; i++) {
        const l = await call(S, asUser(E1), { query: "?q=ZZ&limit=20", ua });
        const d = await call(D, asUser(E1), { params: { slug: slug1 }, ua });
        times[k].push(l.ms, d.ms);
        if (l.body.replace(/"updated_at":"[^"]*"/g, "") !== baseList.replace(/"updated_at":"[^"]*"/g, "") || d.status !== 200 || d.body.length !== baseDoc.length) uaSame = false;
      }
    }
    ok(uaSame, "mobil (iPhone / Android) ve tablet (iPad) istemcileri masaüstüyle aynı yanıtı alır");
    const listBytes = Buffer.byteLength(baseList); const docBytes = Buffer.byteLength(baseDoc);
    console.log(`    (ölçüm) liste(20) ${listBytes} B · kart ${docBytes} B · p50/p95 ms: ` + Object.entries(times).map(([k, v]) => `${k} ${pct(v, 50).toFixed(0)}/${pct(v, 95).toFixed(0)}`).join(" · "));
    ok(listBytes < 60_000 && docBytes < 30_000, "mobil yük boyutu sınırlı (liste 20 < 60 KB, kart < 30 KB)", { listBytes, docBytes });
    ok(Object.values(times).every((v) => pct(v, 95) < 1500), "yerel p95 < 1,5 sn (tüm istemci türleri)");

    // ── 8) Tekrar aktarım ───────────────────────────────────────────────────────────────────────
    section("8. Tekrar aktarım: aynı veri → değişiklik yok; kaynakta yeni sürüm → yayındaki metin değişmez, owner'a uyarı");
    const before = { rec: await n(`select count(*)::int from public.stone_library_records`), fac: await n(`select count(*)::int from public.stone_library_facets`),
      pub: await n(`select count(*)::int from public.stone_library_published`), dec: await n(`select count(*)::int from public.stone_library_stones where health_publish_decided_at is not null`) };
    const s2 = await run(fake1);
    ok(s2.status === "completed" && await n(`select count(*)::int from public.stone_library_records`) === before.rec && await n(`select count(*)::int from public.stone_library_facets`) === before.fac,
      "aynı verinin yeniden aktarımı yeni kayıt üretmedi", { rec: before.rec });
    ok(await n(`select count(*)::int from public.stone_library_published`) === before.pub && await n(`select count(*)::int from public.stone_library_stones where health_publish_decided_at is not null`) === before.dec,
      "yayın durumları ve owner sağlık kararları korunur");
    const fake2 = createFakeCrystals({ count: 91, longText: LONG, revision: 2, duplicateImageOf: new Map([[fakeId(31), fakeId(30)]]) });
    const noTs = (b: string) => b.replace(/"updated_at":"[^"]*"/g, "");
    const docOld = noTs((await call(D, asUser(E1), { params: { slug: await slugOf(5) } })).body);
    const imgBefore = await q<{ id: string; sha256: string }>(`select id, sha256 from public.stone_library_images where deleted_at is null order by id`);
    const s3 = await run(fake2, { forceRefetch: true });
    ok(s3.status === "completed", "kaynak değişikliği (sürüm 2) aktarıldı", s3.stopReason);
    const rd5 = (await call(taslarId.GET, asAdmin(OWNER), { params: { id: S5 } })).json.readiness as { warnings: string[] };
    ok(rd5.warnings.includes("new_source_version_pending"), "hazırlık uyarısı: kaynakta yeni sürüm owner kararını bekliyor", rd5);
    ok(noTs((await call(D, asUser(E1), { params: { slug: await slugOf(5) } })).body) === docOld, "yayındaki metin owner kararı olmadan DEĞİŞMEDİ");
    ok(JSON.stringify(await q(`select id, sha256 from public.stone_library_images where deleted_at is null order by id`)) === JSON.stringify(imgBefore),
      "kayıtlı görseller yeniden aktarımda değişmedi (yeniden indirilmez; değişiklik owner incelemesiyle)");
    const integ2 = await owner("stone_library_owner_integrity", { p_stone_id: null }) as Record<string, unknown>;
    ok(integ2.ok === true, "yeni sürümler dahil bütünlük birebir", integ2);

    // ── 9) Bütünlük ihlali tespiti ─────────────────────────────────────────────────────────────
    section("9. Bütünlük RPC'si ihlali yakalar (koruma tetikleyicileri bilinçli devre dışı bırakılarak)");
    const victim = descTr1[0].id;
    await su.query(`alter table public.stone_library_records disable trigger user`);
    await su.query(`update public.stone_library_records set content = content || ' ' where id=$1`, [victim]);
    const integ3 = await owner("stone_library_owner_integrity", { p_stone_id: S1 }) as { ok: boolean; mismatch_record_ids: string[] };
    const rdBad = await owner("stone_library_owner_readiness", { p_stone_id: S1 }) as { blockers: string[] };
    await su.query(`update public.stone_library_records set content = left(content, char_length(content) - 1) where id=$1`, [victim]);
    await su.query(`alter table public.stone_library_records enable trigger user`);
    ok(integ3.ok === false && integ3.mismatch_record_ids.includes(victim), "tek boşluk eklenmiş kayıt bütünlük denetiminde yakalandı (ok=false, kayıt kimliğiyle)", integ3);
    ok(rdBad.blockers.includes("integrity_failed"), "P2-3: bütünlüğü bozuk taş 'yayına hazır' / 'yayında' olamaz (integrity_failed engeli)", rdBad);
    const integ4 = await call((await R("butunluk/route")).GET, asAdmin(OWNER), { query: `?stone_id=${S1}` });
    ok(integ4.status === 200 && (integ4.json.integrity as { ok: boolean }).ok === true, "geri alındıktan sonra bütünlük ucu ok=true");
    ok((await call((await R("butunluk/route")).GET, asAdmin(OWNER), { query: "?stone_id=abc" })).status === 400, "bütünlük ucu: geçersiz kimlik → 400");

    ok(external.length === 0, "gerçek sağlayıcıya / dış ağa 0 çağrı", external.slice(0, 3));
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  console.log(`\nstone-library F3 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}

main().catch((e) => { console.error("harness çöktü:", e); process.exit(1); });
