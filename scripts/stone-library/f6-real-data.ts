/**
 * Doğaltaş Kütüphanesi F6 — GERÇEK 91 taş + F4-T3 çeviri paketiyle İZOLE uçtan uca doğrulama (0 kredi, ağ YOK).
 *
 * • Kaynak: F2_DIR/ham (Git DIŞI: kayıtlı ham yanıtlar + görseller) ve F4T3_FILE (Git DIŞI nihai yayın adayı JSON).
 *   Yeni sağlayıcı çağrısı YAPILMAZ; ham yanıt yazımı güvenilir aktarım rolüyle (stone_library_importer) yapılır.
 * • Hedef: geçici embedded-postgres + shim, migration F1 + F2 + F3 + F6-A + F6-B. PRODUCTION'A SIFIR TEMAS.
 * • Çıktı: OUT_DIR/f6-real-data-check.json — YALNIZ sayılar / kimlikler / alan adları (kaynak veya çeviri METNİ yazılmaz).
 * Çalıştır:
 *   F2_DIR=C:/YasamSistemi-QA/DOGALTAS-KUTUPHANE-F2-2026-10-24 F4T3_FILE=<…>/nihai-yayin-adayi.json OUT_DIR=<Git dışı klasör> \
 *   LICENSE_FILE=$F2_DIR/lisans-kaniti/<ekran görüntüsü>.png TERMS_SHA256=<64 hex> npx tsx scripts/stone-library/f6-real-data.ts
 */
import "../hd-analysis-word-flow/env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv } from "../anamnez/testEnv";
import { runCrystalImport, type RawPutArgs } from "../../lib/stone-library/import/runner";
import type { CrystalsFetch } from "../../lib/stone-library/import/roxyCrystalsClient";
import { findStoneLibraryLeaks, stoneDocAllowedLabels } from "../../lib/stone-library/expertDto";
import type { StoneLibraryStoneDoc } from "../../lib/stone-library/contract";

const F2 = process.env.F2_DIR ?? "";
const F4T3 = process.env.F4T3_FILE ?? "";
const OUT = process.env.OUT_DIR ?? "";
const LICENSE_FILE = process.env.LICENSE_FILE ?? "";
const TERMS = process.env.TERMS_SHA256 ?? "";
const PORT = Number(process.env.PG_PORT ?? 54617);
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

let pass = 0; let fail = 0; const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(h: Handler, who: { kind: "user" | "admin"; id: string; token: string }, o: { body?: unknown; params?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130", [who.kind === "admin" ? "x-admin-id" : "x-user-id"]: who.id, "x-session-token": who.token };
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const res = await h(new NextRequest("http://localhost/api/test", { method: o.body !== undefined ? "POST" : "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }),
    { params: Promise.resolve(o.params ?? {}) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* bayt */ }
  return { status: res.status, json, body: text };
}

/** Kayıtlı yanıtlardan sağlayıcı taklidi (yalnız dosya okur; ağ YOK). f3-real-data.ts ile aynı eşleme. */
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

type Unit = { tas_id: string; alan: string; en: string; roxy_tr: string; gosterim_tr: string; gosterim_kaynagi: string; dogrulama_durumu: string; kaynak_sha256: { en: string; tr: string } };

async function main() {
  if (!F2 || !existsSync(path.join(F2, "ham/roxy"))) return console.log("F2_DIR/ham/roxy yok — DURDU.");
  if (!F4T3 || !existsSync(F4T3)) return console.log("F4T3_FILE yok — DURDU.");
  if (!OUT || /yasam-dogaltas-kutuphane|yasam-saas/i.test(path.resolve(OUT))) return console.log("OUT_DIR Git dışı bir klasör olmalı — DURDU.");
  if (!/^[0-9a-f]{64}$/.test(TERMS)) return console.log("TERMS_SHA256 gerekli — DURDU.");
  if (!LICENSE_FILE || !existsSync(LICENSE_FILE)) return console.log("LICENSE_FILE yok — DURDU.");
  mkdirSync(OUT, { recursive: true });
  const licSha = sha(readFileSync(LICENSE_FILE));
  const pkg = JSON.parse(readFileSync(F4T3, "utf8")) as { birimler: Record<string, Unit> };
  const units = Object.values(pkg.birimler);

  const external: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    external.push(u);
    throw new Error("dış ağ yasak");
  }) as typeof fetch;

  const MIGS = ["20271201000000_stone_library_core.sql", "20271201000100_stone_library_f2.sql", "20271201000200_stone_library_f3.sql",
    "20271201000300_stone_library_f6_raw_guard.sql", "20271201000400_stone_library_f6_layers.sql"];
  const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
  const env = await startAnamnezTestEnv({
    port: PORT, dirName: `stone-library-f6-real-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: [...new Set([...MIGS.map(mig).join("\n").matchAll(/FUNCTION public\.(stone_library_[a-z_]+)\(/g)].map((m) => m[1]))], extraSql: MIGS.map(mig),
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.STONE_LIBRARY_ENABLED = "true";
  const su = env.su;
  const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
  const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await su.query(sql, p)).rows as T[];
  const n = async (sql: string, p: unknown[] = []) => Number(Object.values((await su.query(sql, p)).rows[0] ?? { x: 0 })[0]);
  const imp = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: "testpw", database: "postgres" });
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
  const report: Record<string, unknown> = { at: new Date().toISOString(), license_file_sha256: licSha, package_units: units.length };

  try {
    const T = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_F6_REAL')`, [T]);
    const mkUser = async (label: string, role: string, superAdmin: boolean) => {
      const id = randomUUID(); const token = `zz-f6r-${label}-${id.slice(0, 8)}`;
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin, admin_level)
        values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7,$8)`, [id, `ZZ ${label}`, `zz.f6r.${label}@example.test`, role,
        JSON.stringify(role === "expert" ? { stones: true } : {}), T, superAdmin, role === "admin" ? "owner" : null]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const OWNER = await mkUser("owner", "admin", true);
    const E1 = await mkUser("uzman", "expert", false);
    const owner = (fn: string, args: Record<string, unknown>) => db.rpc(fn, { p_actor: OWNER.id, ...args }).then(({ data, error }) => {
      if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: error.code });
      return Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === "object" && fn in data[0] ? (data[0] as Record<string, unknown>)[fn] : data;
    });
    const asO = { kind: "admin" as const, ...OWNER }; const asE = { kind: "user" as const, ...E1 };

    section("1. Güvenilir çevrimdışı aktarım (aktarım rolü, 0 kredi, ağ yok)");
    const SRC = String(await owner("stone_library_source_save", { p_source_id: null, p_data: { source_key: "kristal-kaynak", kind: "api", real_name: "Kristal sağlayıcısı", provider_code: "roxy" } }));
    await owner("stone_library_source_save", { p_source_id: SRC, p_data: { license_type: "api_terms", license_terms_url: "https://example.test/terms", license_terms_sha256: TERMS, commercial_use_ok: true, status: "active", image_rights: "rehost_ok" } });
    const DOC = String(await owner("stone_library_document_add", { p_source_id: SRC, p_data: { doc_kind: "correspondence", title: "Gmail ekran görüntüsü — özgün e-posta değil (kristal görsel izni yanıtı, 24.10.2026)", content_sha256: licSha } }));
    const LIC = String(await owner("stone_library_license_grant_save", { p_grant_id: null, p_data: {
      source_id: SRC, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "Sağlayıcı destek ekibi (e-posta yanıtı)", commercial_display: true, storage_allowed: true,
      post_subscription_rights: true, attribution_required: false, modification_allowed: true, redistribution_limit: "Görseller bağımsız veri seti veya API olarak yeniden dağıtılamaz.",
      max_resolution: "300x300", document_id: DOC, document_sha256: licSha } }));
    const replays = { n: 0 };
    const rf = replayFetch(F2, replays);
    const s1 = await runCrystalImport({ db, actor: OWNER.id, sourceId: SRC, licenseGrantId: LIC, writeRaw: importerRaw,
      client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "cevrimdisi-yeniden-oynatma-anahtari-yok", fetchImpl: rf, timeoutMs: 5000 },
      imageFetch: rf, includeImages: true, includeBirthstones: true, includeVocabLists: true, creditCap: 1000, allowanceRemaining: 1000, quotaFloor: 0, termsSha256: TERMS, sleep: async () => undefined });
    report.import = { status: s1.status, replayed: replays.n, stones: s1.stonesCreated, images: s1.imagesStored, failedCalls: s1.failedCalls };
    ok(s1.status === "completed" && s1.stonesCreated === 91 && s1.imagesStored === 91 && s1.failedCalls === 0, "91 taş + 91 görsel aktarıldı (güvenilir yol)", report.import);
    ok(external.length === 0, "sağlayıcıya / dış ağa 0 istek", external.slice(0, 3));
    const integ0 = await owner("stone_library_owner_integrity", { p_stone_id: null }) as Record<string, unknown>;
    ok(integ0.ok === true && integ0.raw_unverified === 0, "bütünlük: ok, doğrulanmamış ham yanıt 0", integ0);
    const recSha0 = String(Object.values((await su.query(`select md5(string_agg(id::text || content_sha256, ',' order by id)) h from public.stone_library_records`)).rows[0])[0]);

    section("2. Paket kaynak SHA-256 bağı (ham yanıt dosyaları ↔ F4-T3)");
    const ids = [...new Set(units.map((u) => u.tas_id))].sort();
    let shaOk = 0;
    for (const id of ids) for (const l of ["en", "tr"] as const) {
      const fileSha = sha(readFileSync(path.join(F2, `ham/roxy/${id}.${l}.json`)));
      if (units.filter((u) => u.tas_id === id).every((u) => u.kaynak_sha256[l] === fileSha)) shaOk++;
    }
    report.sha = { stones: ids.length, file_sha_match: shaOk };
    ok(ids.length === 91 && shaOk === 182, "182/182 ham yanıt dosyası SHA-256 paketle aynı", report.sha);

    section("3. Çeviri katmanı içe aktarma (veritabanında kaynak EN/TR metnine BİREBİR doğrulama)");
    const rows = units.map((u) => ({ external_id: u.tas_id, field: u.alan, display: u.gosterim_kaynagi, status: u.dogrulama_durumu, en: u.en, source_tr: u.roxy_tr,
      content_tr: u.gosterim_kaynagi === "DOGRULANMIS_TR_CEVIRI" ? u.gosterim_tr : null, file_sha_en: u.kaynak_sha256.en, file_sha_tr: u.kaynak_sha256.tr }));
    let dry: Record<string, unknown> = {}; let importErr: string | null = null;
    try { dry = await owner("stone_library_translation_import", { p_rows: rows, p_package_ref: "F4-T3-KAPANIS-2026-10-24", p_dry_run: true }) as Record<string, unknown>; }
    catch (e) { importErr = String((e as Error).message).slice(0, 300); }
    report.translation_dry = importErr ? { error: importErr } : dry;
    ok(!importErr && dry.inserted === 546 && dry.fallback === 3, "deneme: 546 alan kaynakla birebir eşleşti (543 çeviri + 3 kaynak metin)", report.translation_dry);
    if (!importErr) {
      const real = await owner("stone_library_translation_import", { p_rows: rows, p_package_ref: "F4-T3-KAPANIS-2026-10-24", p_dry_run: false }) as Record<string, unknown>;
      report.translation_import = real;
      ok(real.inserted === 546 && await n(`select count(*)::int from public.stone_library_translations where published_at is not null`) === 0, "546 alan aktarıldı, hiçbiri yayında değil", real);
      const fb = await q<{ ext: string; field_key: string }>(`select e.external_id ext, t.field_key from public.stone_library_translations t join public.stone_library_external_ids e on e.stone_id=t.stone_id where t.display_kind='source_tr_fallback' order by 1,2`);
      report.fallback = fb.map((r) => `${r.ext}|${r.field_key}`);
      ok(JSON.stringify(report.fallback) === JSON.stringify(["chrysocolla|meaning_spiritual", "pink-tourmaline|affirmation", "smoky-quartz|affirmation"]), "3 kaynak metin alanı doğru (Krizokola spiritüel, Pembe Turmalin + Dumanlı Kuvars olumlama)", report.fallback);
      const pubDry = await owner("stone_library_translation_publish", { p_stone_id: null, p_field: null, p_action: "publish", p_dry_run: true }) as Record<string, unknown>;
      report.translation_publish_dry = pubDry;
      ok(pubDry.affected === 543 && pubDry.excluded_fallback === 3 && pubDry.excluded_stale === 0, "toplu yayın önizlemesi: 543 / 3 hariç / 0 eskimiş", pubDry);
      await owner("stone_library_translation_publish", { p_stone_id: null, p_field: null, p_action: "publish", p_dry_run: false });
    }

    section("4. Tek adım yayın + sağlık filtresi (hukuk modu varsayılan; 91 taş yayımlanabilir mi?)");
    for (const im of await q<{ id: string }>(`select id from public.stone_library_images where deleted_at is null`)) await owner("stone_library_image_review", { p_image_id: im.id, p_action: "approve", p_note: "F6 gerçek veri: görsel onayı (izole)" });
    const stones = await q<{ id: string; ext: string; slug: string }>(`select s.id, e.external_id ext, s.slug from public.stone_library_stones s join public.stone_library_external_ids e on e.stone_id=s.id order by e.external_id`);
    const pubFail: Record<string, string> = {};
    for (const s of stones) { try { await owner("stone_library_owner_publish", { p_stone_id: s.id, p_note: "F6 gerçek veri: tek adım yayın (izole)" }); } catch (e) { pubFail[s.ext] = String((e as Error).message).slice(0, 160); } }
    report.publish = { attempted: stones.length, published: await n(`select count(*)::int from public.stone_library_stones where status='published'`), failures: pubFail };
    ok(Object.keys(pubFail).length === 0 && (report.publish as Record<string, number>).published === 91, "91/91 taş tek adımda yayımlandı (sağlık kilidi yüzünden yayımlanamayan taş yok)", report.publish);
    await call((await import("../../app/api/admin/dogaltas-kutuphane/yetkiler/route")).POST as unknown as Handler, asO, { body: { action: "grant", user_id: E1.id } });
    const D = (await import("../../app/api/dogaltas/kutuphane/[slug]/route")).GET as unknown as Handler;
    const perStone: Record<string, { visible: string[]; sources: Record<string, string> }> = {};
    let leaks = 0; let verifiedShown = 0; let zeroVisible = 0; let fallbackLabeledVerified = 0;
    for (const s of stones) {
      const r = await call(D, asE, { params: { slug: s.slug } });
      const d = r.status === 200 ? (r.json.item as StoneLibraryStoneDoc) : null;
      if (!d) { zeroVisible++; continue; }
      if (findStoneLibraryLeaks(d, stoneDocAllowedLabels(d)).length) leaks++;
      const vis = d.display.fields.map((f) => f.field);
      perStone[s.ext] = { visible: vis, sources: Object.fromEntries(d.display.fields.map((f) => [f.field, f.display_source])) };
      verifiedShown += d.display.fields.filter((f) => f.display_source === "DOGRULANMIS_TR_CEVIRI").length;
      if (vis.filter((f) => f !== "keywords").length === 0) zeroVisible++;
      for (const k of ["chrysocolla|meaning_spiritual", "pink-tourmaline|affirmation", "smoky-quartz|affirmation"]) {
        const [id, f] = k.split("|");
        if (id === s.ext && (d.display.verified_available as Record<string, boolean>)[f] === true) fallbackLabeledVerified++;
      }
    }
    const four = Object.fromEntries(["ametrine", "carnelian", "amber", "pink-tourmaline"].map((k) => [k, perStone[k]?.visible.filter((f) => f !== "keywords") ?? []]));
    report.expert = { stones: stones.length, leaks, zero_visible_text: zeroVisible, verified_fields_shown: verifiedShown, fallback_labeled_verified: fallbackLabeledVerified, four_stones: four };
    ok(leaks === 0, "uzman yanıtlarında sızıntı yok (91 taş)", leaks);
    ok(zeroVisible === 0, "hukuk modunda her taşta en az bir görünür metin alanı var (91/91)", zeroVisible);
    ok(fallbackLabeledVerified === 0, "3 kaynak metin alanı hiçbir yerde 'doğrulanmış çeviri' etiketi almadı");
    ok(four.ametrine.length >= 1 && four.carnelian.length >= 1 && four.amber.length >= 1 && four["pink-tourmaline"].length >= 1,
      "Ametrin / Karneol / Kehribar / Pembe Turmalin: görünür alan var", four);
    report.health = {
      records_health: await n(`select count(*)::int from public.stone_library_records where is_current and health_sensitive and field_key <> 'meaning_physical'`),
      records_non_physical: await n(`select count(*)::int from public.stone_library_records where is_current and field_key <> 'meaning_physical'`),
      physical_all_health: await n(`select count(*)::int from public.stone_library_records where field_key='meaning_physical' and not health_sensitive`) === 0,
    };
    ok((report.health as Record<string, unknown>).physical_all_health === true, "fiziksel etki alanları daima sağlık hassas (kilit gevşetilmedi)", report.health);

    section("5. Özgün kaynak dokunulmazlığı");
    const recSha1 = String(Object.values((await su.query(`select md5(string_agg(id::text || content_sha256, ',' order by id)) h from public.stone_library_records`)).rows[0])[0]);
    const integ1 = await owner("stone_library_owner_integrity", { p_stone_id: null }) as Record<string, unknown>;
    ok(recSha1 === recSha0 && integ1.ok === true, "çeviri / yayın işlemlerinden sonra kaynak kayıtları birebir aynı + bütünlük ok");
  } finally {
    await imp.end().catch(() => undefined);
    await env.stop().catch(() => undefined);
    globalThis.fetch = realFetch;
  }
  report.result = { pass, fail, fails };
  writeFileSync(path.join(OUT, "f6-real-data-check.json"), JSON.stringify(report, null, 1));
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
