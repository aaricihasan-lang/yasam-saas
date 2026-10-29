/**
 * Doğaltaş Kütüphanesi F3 — F2'de alınmış GERÇEK 91 taş verisiyle İZOLE uçtan uca doğrulama (0 kredi, ağ YOK).
 *
 * • Kaynak: F2_DIR/ham (Git DIŞI QA klasörü: kayıtlı ham yanıtlar + görseller). Yeni sağlayıcı çağrısı YAPILMAZ:
 *   sağlayıcı istemcisine yalnız dosya okuyan yeniden oynatıcı verilir; başka her dış istek kilitle reddedilir ve sayılır.
 * • Hedef: geçici embedded-postgres + shim (yalnız 127.0.0.1), migration F1 + F2 + F3. PRODUCTION'A SIFIR TEMAS.
 * • Lisans kanıtı: LICENSE_FILE (owner'ın Gmail EKRAN GÖRÜNTÜSÜ; özgün e-posta DEĞİL) SHA-256'sıyla belge kaydı.
 * • Çıktı: OUT_DIR/ham/f3-real-data-check.json — yalnız sayılar / kimlikler (kaynak metni YAZILMAZ). Repoya veri girmez.
 * Çalıştır:
 *   F2_DIR=C:/YasamSistemi-QA/DOGALTAS-KUTUPHANE-F2-2026-10-24 OUT_DIR=C:/YasamSistemi-QA/DOGALTAS-KUTUPHANE-F3-2026-10-24 \
 *   LICENSE_FILE=$F2_DIR/lisans-kaniti/roxy-nora-gmail-ekran-goruntusu-2026-10-24-105624.png TERMS_SHA256=<64 hex> \
 *   npx tsx scripts/stone-library/f3-real-data.ts
 */
import "../hd-analysis-word-flow/env";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv } from "../anamnez/testEnv";
import { runCrystalImport } from "../../lib/stone-library/import/runner";
import type { CrystalsFetch } from "../../lib/stone-library/import/roxyCrystalsClient";
import { STONE_LIBRARY_MEDICAL_NOTICE_TR } from "../../lib/stone-library/contract";

const F2 = process.env.F2_DIR ?? "";
const OUT = process.env.OUT_DIR ?? "";
const LICENSE_FILE = process.env.LICENSE_FILE ?? "";
const LICENSE_SHA_EXPECTED = "8250d8eb43ec85d5e16d093c91982599a423438a3b1a4914a57f7ae42e6bc64a";
const TERMS = process.env.TERMS_SHA256 ?? "";
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0); };

let pass = 0; let fail = 0; const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const UA = {
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
};
async function call(h: Handler, who: { kind: "user" | "admin"; id: string; token: string }, o: { method?: string; body?: unknown; query?: string; params?: Record<string, string>; ua?: string } = {}) {
  const headers: Record<string, string> = { "user-agent": o.ua ?? UA.desktop, [who.kind === "admin" ? "x-admin-id" : "x-user-id"]: who.id, "x-session-token": who.token };
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const t0 = performance.now();
  const res = await h(new NextRequest(`http://localhost/api/test${o.query ?? ""}`, { method: o.method ?? "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }),
    { params: Promise.resolve(o.params ?? {}) });
  const bytes = Buffer.from(await res.arrayBuffer());
  const ms = performance.now() - t0;
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>; } catch { /* bayt */ }
  return { status: res.status, json, bytes, body: bytes.toString("utf8"), ms, type: res.headers.get("content-type") };
}

/** Kayıtlı yanıtlardan sağlayıcı taklidi (yalnız dosya okur; ağ YOK). f2-local-import.ts ile aynı eşleme. */
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

const FIELDS: [string, (o: Record<string, unknown>) => unknown][] = [
  ["description", (o) => o.description], ["meaning_spiritual", (o) => (o.meaning as Record<string, unknown> | undefined)?.spiritual],
  ["meaning_emotional", (o) => (o.meaning as Record<string, unknown> | undefined)?.emotional], ["meaning_physical", (o) => (o.meaning as Record<string, unknown> | undefined)?.physical],
  ["affirmation", (o) => o.affirmation]];

async function main() {
  if (!F2 || !existsSync(path.join(F2, "ham/roxy"))) return console.log("F2_DIR/ham/roxy yok — DURDU.");
  if (!OUT || /yasam-dogaltas-kutuphane|yasam-saas/i.test(path.resolve(OUT))) return console.log("OUT_DIR Git dışı bir klasör olmalı — DURDU.");
  if (!/^[0-9a-f]{64}$/.test(TERMS)) return console.log("TERMS_SHA256 gerekli — DURDU.");
  if (!LICENSE_FILE || !existsSync(LICENSE_FILE)) return console.log("LICENSE_FILE yok — DURDU (owner'dan istenecek; uydurulmaz).");
  mkdirSync(path.join(OUT, "ham"), { recursive: true });
  const licSha = sha(readFileSync(LICENSE_FILE));

  // Dış ağ kilidi: yalnız 127.0.0.1 shim'i. Sağlayıcı istemcisi yeniden oynatıcıyı kullanır (global fetch'e gitmez).
  const external: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    external.push(u);
    throw new Error("dış ağ yasak");
  }) as typeof fetch;

  const MIGS = ["20271201000000_stone_library_core.sql", "20271201000100_stone_library_f2.sql", "20271201000200_stone_library_f3.sql"];
  const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
  const env = await startAnamnezTestEnv({
    port: Number(process.env.PG_PORT ?? 54615), dirName: `stone-library-f3-real-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: [...new Set([...MIGS.map(mig).join("\n").matchAll(/FUNCTION public\.(stone_library_[a-z_]+)\(/g)].map((m) => m[1]))],
    extraSql: MIGS.map(mig),
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.STONE_LIBRARY_ENABLED = "true";
  const su = env.su;
  const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
  const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await su.query(sql, p)).rows as T[];
  const n = async (sql: string, p: unknown[] = []) => Number(Object.values((await su.query(sql, p)).rows[0] ?? { x: 0 })[0]);
  const report: Record<string, unknown> = { at: new Date().toISOString(), license_file_sha256: licSha };

  try {
    const T = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ_F3_REAL')`, [T]);
    const mkUser = async (label: string, role: string, superAdmin: boolean) => {
      const id = randomUUID(); const token = `zz-f3r-${label}-${id.slice(0, 8)}`;
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_super_admin, admin_level)
        values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7,$8)`, [id, `ZZ ${label}`, `zz.f3r.${label}@example.test`, role,
        JSON.stringify(role === "expert" ? { stones: true } : {}), T, superAdmin, role === "admin" ? "owner" : null]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const OWNER = await mkUser("owner", "admin", true);
    const E1 = await mkUser("uzman", "expert", false);
    const E2 = await mkUser("yetkisiz", "expert", false);
    const owner = (fn: string, args: Record<string, unknown>) => db.rpc(fn, { p_actor: OWNER.id, ...args }).then(({ data, error }) => {
      if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: error.code });
      return Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === "object" && fn in data[0] ? (data[0] as Record<string, unknown>)[fn] : data;
    });
    const asO = { kind: "admin" as const, ...OWNER }; const asE = { kind: "user" as const, ...E1 }; const asE2 = { kind: "user" as const, ...E2 };

    section("1. Kaynak + lisans kanıtı (ekran görüntüsü; özgün e-posta değil)");
    ok(licSha === LICENSE_SHA_EXPECTED, "lisans ekran görüntüsünün SHA-256'sı F2 arşiviyle aynı", licSha);
    const SRC = String(await owner("stone_library_source_save", { p_source_id: null, p_data: { source_key: "kristal-kaynak", kind: "api", real_name: "Kristal sağlayıcısı", provider_code: "roxy" } }));
    await owner("stone_library_source_save", { p_source_id: SRC, p_data: { license_type: "api_terms", license_terms_url: "https://example.test/terms", license_terms_sha256: TERMS, commercial_use_ok: true, status: "active", image_rights: "rehost_ok" } });
    const DOC = String(await owner("stone_library_document_add", { p_source_id: SRC, p_data: { doc_kind: "correspondence",
      title: "Gmail ekran görüntüsü — özgün e-posta değil (kristal görsel izni yanıtı, 24.10.2026)", content_sha256: licSha,
      note: "Kanıt türü: ekran görüntüsü. Özgün .eml dosyası arşivde yok; varmış gibi gösterilmez." } }));
    const LIC = String(await owner("stone_library_license_grant_save", { p_grant_id: null, p_data: {
      source_id: SRC, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "Sağlayıcı destek ekibi (e-posta yanıtı)", commercial_display: true, storage_allowed: true,
      post_subscription_rights: true, attribution_required: false, modification_allowed: true,
      redistribution_limit: "Görseller bağımsız veri seti veya API olarak yeniden dağıtılamaz.", max_resolution: "300x300", document_id: DOC, document_sha256: licSha } }));
    ok(await n(`select count(*)::int from public.stone_library_source_documents where doc_kind='correspondence' and title like 'Gmail ekran görüntüsü — özgün e-posta değil%'`) === 1,
      "belge 'ekran görüntüsü — özgün e-posta değil' olarak kayıtlı");

    section("2. Çevrimdışı yeniden oynatma ile aktarım (0 kredi, ağ yok)");
    const replays = { n: 0 };
    const rf = replayFetch(F2, replays);
    const t0 = Date.now();
    const s1 = await runCrystalImport({ db, actor: OWNER.id, sourceId: SRC, licenseGrantId: LIC, client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "cevrimdisi-yeniden-oynatma-anahtari-yok", fetchImpl: rf, timeoutMs: 5000 },
      imageFetch: rf, includeImages: true, includeBirthstones: true, includeVocabLists: true, creditCap: 1000, allowanceRemaining: 1000, quotaFloor: 0, termsSha256: TERMS, sleep: async () => undefined });
    report.import = { seconds: Math.round((Date.now() - t0) / 1000), status: s1.status, replayedResponses: replays.n, stonesCreated: s1.stonesCreated, imagesStored: s1.imagesStored, failedCalls: s1.failedCalls };
    ok(s1.status === "completed" && s1.stonesCreated === 91 && s1.imagesStored === 91 && s1.failedCalls === 0, "91 taş + 91 görsel aktarıldı (F3 koruma kurallarıyla)", report.import);
    ok(external.length === 0, "dış ağa / sağlayıcıya 0 istek", external.slice(0, 3));

    section("3. Kaynak metin bütünlüğü (ham dosyalardan BAĞIMSIZ karşılaştırma)");
    const rawDir = path.join(F2, "ham/roxy");
    const ids = [...new Set(readdirSync(rawDir).filter((f) => !f.startsWith("_") && /\.(tr|en)\.json$/.test(f)).map((f) => f.replace(/\.(tr|en)\.json$/, "")))].sort();
    const raw = new Map<string, Record<string, unknown>>();
    for (const id of ids) for (const l of ["tr", "en"]) raw.set(`${id}|${l}`, JSON.parse(readFileSync(path.join(rawDir, `${id}.${l}.json`), "utf8")) as Record<string, unknown>);
    const recs = await q<{ ext: string; field_key: string; lang: string; content: string; content_sha256: string; health_sensitive: boolean; quality_flags: string[] }>(
      `select e.external_id ext, r.field_key, r.lang, r.content, r.content_sha256, r.health_sensitive, r.quality_flags from public.stone_library_records r
        join public.stone_library_external_ids e on e.stone_id=r.stone_id where r.is_current and r.deleted_at is null and r.origin='source'`);
    const recBy = new Map(recs.map((r) => [`${r.ext}|${r.lang}|${r.field_key}`, r]));
    let tC = 0, tE = 0, kC = 0, kE = 0, nE = 0, kwOrder = 0;
    for (const id of ids) for (const l of ["tr", "en"] as const) {
      const o = raw.get(`${id}|${l}`)!;
      for (const [f, g] of FIELDS) {
        const v = g(o);
        if (typeof v !== "string" || !v.trim()) continue;
        tC++;
        const r = recBy.get(`${id}|${l}|${f}`);
        if (r && r.content === v && r.content_sha256 === sha(v)) tE++;
      }
      const kws = (Array.isArray(o.keywords) ? o.keywords : []).filter((x): x is string => typeof x === "string" && x.trim() !== "");
      const dbKw = await q<{ value_text: string }>(`select f.value_text from public.stone_library_facets f join public.stone_library_external_ids e on e.stone_id=f.stone_id
        where e.external_id=$1 and f.facet='keyword' and f.lang=$2 and f.deleted_at is null order by f.created_at, f.id`, [id, l]);
      kC += kws.length;
      kE += kws.filter((k) => dbKw.some((d) => d.value_text === k)).length;
      if (JSON.stringify(dbKw.map((d) => d.value_text)) === JSON.stringify(kws)) kwOrder++;
      const st = (await q<{ name_tr: string; name_en: string }>(`select s.name_tr, s.name_en from public.stone_library_stones s join public.stone_library_external_ids e on e.stone_id=s.id where e.external_id=$1`, [id]))[0];
      if (st && (l === "tr" ? st.name_tr : st.name_en) === o.name) nE++;
    }
    const health = {
      physical: recs.filter((r) => r.field_key === "meaning_physical").length,
      otherHealth: recs.filter((r) => r.health_sensitive && r.field_key !== "meaning_physical").length,
      healthKeywords: await n(`select count(*)::int from public.stone_library_facets where facet='keyword' and health_sensitive`),
      langSuspect: recs.filter((r) => r.quality_flags.includes("lang_suspect")).length,
      duplicateText: recs.filter((r) => r.quality_flags.includes("duplicate_text")).length,
    };
    const sameNames = (await q<{ name_tr: string }>(`select name_tr from public.stone_library_stones where lower(name_tr)=lower(name_en) order by name_tr`)).map((x) => x.name_tr);
    report.integrity = { textsCompared: tC, textsEqual: tE, keywordsCompared: kC, keywordsEqual: kE, keywordOrderEqualLists: kwOrder, namesEqual: nE, ...health, trNameEqualsEnCount: sameNames.length };
    ok(ids.length === 91, "91 taş (ham dosya)", ids.length);
    ok(tC === 909 && tE === 909, `909 özgün metin alanı birebir + SHA-256 (${tE}/${tC})`);
    ok(kC === 1072 && kE === 1072, `1.072 anahtar kelime birebir (${kE}/${kC})`);
    ok(kwOrder === 182, `anahtar kelimeler 182 listenin tamamında kaynak sırasıyla (${kwOrder}/182)`);
    ok(nE === 182, `182 taş adı birebir (${nE}/182)`);
    ok(health.physical === 182 && health.otherHealth === 176 && health.healthKeywords === 24, "182 fiziksel etki + 176 sağlık işaretli diğer kayıt + 24 sağlık işaretli anahtar kelime (hepsi aynen saklı)", health);
    ok(health.langSuspect === 1 && health.duplicateText === 2, "1 şüpheli TR olumlama + 2 tekrar eden EN alan aynen saklı (silinmedi / birleştirilmedi)", health);
    // Beklenen liste F2 birebir denetiminden (Git dışı) okunur; kaynak adları repoya yazılmaz.
    const f2Same = ((JSON.parse(readFileSync(path.join(F2, "birebir-denetim/ham/verbatim-check.json"), "utf8")) as { categories: { trNameEqualsEn: string[] } }).categories.trNameEqualsEn).slice().sort();
    ok(sameNames.length === 10 && JSON.stringify(sameNames) === JSON.stringify(f2Same),
      "TR adı EN ile aynı 10 taşın kaynak adları F2'deki gibi aynen (alternatif / Türkçeleştirilmiş ad UYGULANMADI)", { n: sameNames.length });
    ok(await n(`select count(*)::int from public.stone_library_names`) === 0, "alternatif ad EKLENMEDİ");
    // F2 izole veritabanının facet dökümüyle (summary-final.json) facet + dil bazında birebir aynı sayılar
    const f2m = (JSON.parse(readFileSync(path.join(F2, "ham/summary-final.json"), "utf8")) as { facetM: { facet: string; lang: string; n: number }[] }).facetM;
    const f3m = await q<{ facet: string; lang: string; n: number }>(`select facet, coalesce(lang,'-') lang, count(*)::int n from public.stone_library_facets where deleted_at is null group by 1,2 order by 1,2`);
    const key = (xs: { facet: string; lang: string; n: number }[]) => JSON.stringify(xs.map((x) => `${x.facet}|${x.lang}|${x.n}`).sort());
    report.facets = { total: f3m.reduce((t, x) => t + x.n, 0), byFacet: f3m };
    ok(key(f2m) === key(f3m), `yapısal değerler F2 ile facet + dil bazında birebir (${(report.facets as { total: number }).total} değer)`, f3m);
    const integ = await owner("stone_library_owner_integrity", { p_stone_id: null }) as Record<string, unknown>;
    report.integrityRpc = integ;
    ok(integ.ok === true && integ.records_total === 909 && integ.records_verbatim === 909 && integ.keywords_verbatim === 1072 && integ.names_tr_equal === 91 && integ.names_en_equal === 91,
      "owner bütünlük RPC'si: 909 / 1.072 / 91 + 91 birebir, kaynak dışı sürüm 0", integ);

    section("4. Görseller: 91 taş eşleşmesi + SHA-256 + lisans bağı");
    const imgs = await q<{ ext: string; img_ext: string; variant: string; sha256: string; license_grant_id: string; flags: string[]; derived_ok: boolean }>(
      `select e.external_id ext, i.external_id img_ext, i.variant, i.sha256, i.license_grant_id, i.quality_flags flags,
              (i.derived_from_id is null or exists (select 1 from public.stone_library_images p where p.id=i.derived_from_id and p.stone_id=i.stone_id and p.variant='original')) derived_ok
         from public.stone_library_images i join public.stone_library_external_ids e on e.stone_id=i.stone_id where i.deleted_at is null`);
    const orig = imgs.filter((i) => i.variant === "original");
    const shaOk = orig.filter((i) => existsSync(path.join(F2, `ham/gorseller/orig/${i.ext}.jpg`)) && sha(readFileSync(path.join(F2, `ham/gorseller/orig/${i.ext}.jpg`))) === i.sha256).length;
    const manifest = JSON.parse(readFileSync(path.join(F2, "ham/gorseller/manifest.json"), "utf8")) as { external_id: string; variant: string; sha256: string }[];
    const optOk = imgs.filter((i) => i.variant === "optimized" && manifest.some((m) => m.external_id === i.ext && m.variant === "optimized" && m.sha256 === i.sha256)).length;
    report.images = { original: orig.length, optimized: imgs.length - orig.length, originalShaEqualsF2File: shaOk, optimizedShaEqualsF2Manifest: optOk,
      bindingMismatch: imgs.filter((i) => i.ext !== i.img_ext).length, derivedBad: imgs.filter((i) => !i.derived_ok).length,
      licenseLinked: imgs.filter((i) => i.license_grant_id === LIC).length, duplicateFlagged: imgs.filter((i) => i.flags.includes("duplicate_image")).map((i) => `${i.ext}:${i.variant}`) };
    ok(orig.length === 91 && imgs.length === 182, "91 özgün + 91 optimize görsel", report.images);
    ok(shaOk === 91 && optOk === 91, "özgün görseller F2'de indirilen dosyalarla, optimize sürümler F2 manifestiyle bayt düzeyinde aynı (SHA-256)", { shaOk, optOk });
    ok((report.images as { bindingMismatch: number }).bindingMismatch === 0 && (report.images as { derivedBad: number }).derivedBad === 0, "her görsel kendi taşına bağlı; optimize sürüm kendi özgününden türedi");
    ok((report.images as { licenseLinked: number }).licenseLinked === 182, "182 görselin tamamı ekran görüntüsü kanıtlı lisans iznine bağlı");

    section("5. Yayın — varsayılan sağlık modu (legal_review, kilit KAPALI)");
    const R = async (p: string) => (await import(`../../app/api/admin/dogaltas-kutuphane/${p}`)) as Record<string, Handler>;
    const S = (await import("../../app/api/dogaltas/kutuphane/route")).GET as unknown as Handler;
    const D = (await import("../../app/api/dogaltas/kutuphane/[slug]/route")).GET as unknown as Handler;
    const G = (await import("../../app/api/dogaltas/kutuphane/[slug]/gorsel/route")).GET as unknown as Handler;
    await call((await R("yetkiler/route")).POST, asO, { method: "POST", body: { action: "grant", user_id: E1.id } });
    const stones = await q<{ id: string; slug: string; ext: string; name_tr: string; name_en: string }>(
      `select s.id, s.slug, e.external_id ext, s.name_tr, s.name_en from public.stone_library_stones s join public.stone_library_external_ids e on e.stone_id=s.id order by s.slug`);
    const bulk = await call((await R("inceleme/route")).POST, asO, { method: "POST", body: { action: "bulk_approve", stone_ids: stones.map((s) => s.id), note: "F3 izole test: owner toplu inceleme" } });
    ok(bulk.status === 200, "toplu inceleme (91 taş)", bulk.json.result);
    for (const im of await q<{ id: string }>(`select id from public.stone_library_images where deleted_at is null`)) await owner("stone_library_image_review", { p_image_id: im.id, p_action: "approve", p_note: null });
    const taslarId = await R("taslar/[id]/route");
    const blockedDefault: { slug: string; blockers: string }[] = [];
    for (const s of stones) {
      const r = await call(taslarId.POST, asO, { method: "POST", params: { id: s.id }, body: { action: "ready" } });
      if (r.status !== 200) { blockedDefault.push({ slug: s.slug, blockers: String(r.json.error ?? "") }); continue; }
      await call(taslarId.POST, asO, { method: "POST", params: { id: s.id }, body: { action: "publish" } });
    }
    const pubDefault = await n(`select count(*)::int from public.stone_library_published`);
    report.publishDefault = { published: pubDefault, blocked: blockedDefault };
    ok(pubDefault + blockedDefault.length === 91 && blockedDefault.every((b) => b.blockers.includes("no_visible_content")),
      `varsayılan modda ${pubDefault} taş yayında; ${blockedDefault.length} taş yalnız kilitli sağlık içeriği taşıdığı için 'yayına hazır' olamadı`, blockedDefault);
    ok(await n(`select count(*)::int from public.stone_library_published where doc::text like '%"field": "meaning_physical"%'`) === 0, "varsayılan modda yayın yüzeyinde fiziksel etki 0");
    const g0 = await call(G, asE, { params: { slug: stones[0].slug } });
    ok(g0.status === 404, "lisans owner tarafından doğrulanmadan görsel servis edilmez");

    section("6. Lisans doğrulaması → görseller");
    const v = await call((await R("kaynaklar/route")).POST, asO, { method: "POST", body: { action: "license_status", id: LIC, status: "verified", note: "Ekran görüntüsü SHA-256 eşleşti (izole test)" } });
    ok(v.status === 200, "lisans izni ekran görüntüsü SHA-256'sıyla doğrulandı (izole ortam)", v.json);

    section("7. Sağlık C modeli (izole): owner kararı + ayrı tıbbi bilgilendirme; metin aynen");
    const a = await call((await R("ayarlar/route")).POST, asO, { method: "POST", body: { data: { health_publication_mode: "owner_decision",
      owner_decision_ref: "Owner F3 talimatı 24.10.2026 — C seçeneği (YALNIZ izole test; canlı karar sonraki aşama)", health_content_publication_enabled: true } } });
    ok(a.status === 200, "owner_decision modu + genel kilit (yalnız izole veritabanı)");
    for (const s of stones) {
      await call(taslarId.POST, asO, { method: "POST", params: { id: s.id }, body: { action: "health_allow", note: "Owner kararı: fiziksel etkiler dahil kaynak bilgileri aynen gösterilecek (izole test)" } });
      const st = String((await q<{ status: string }>(`select status from public.stone_library_stones where id=$1`, [s.id]))[0].status);
      if (st !== "published") {
        await call(taslarId.POST, asO, { method: "POST", params: { id: s.id }, body: { action: "ready" } });
        await call(taslarId.POST, asO, { method: "POST", params: { id: s.id }, body: { action: "publish" } });
      }
    }
    const pubC = await n(`select count(*)::int from public.stone_library_published`);
    ok(pubC === 91, "C modelinde 91 taşın tamamı yayında", pubC);
    ok(await n(`select count(*)::int from public.stone_library_records where legal_cleared_at is not null`) === 0, "owner kararı hukuki onay olarak kaydedilmedi (legal_cleared 0)");

    section("8. Uzman API: ayrıntıda kaynak metnin TAMAMI, karakteri karakterine (ham dosyaya karşı)");
    let shown = 0, shownEqual = 0, physShown = 0, kwShown = 0, kwShownEqual = 0, nameOk = 0, noticeOk = 0;
    const detailMs: number[] = []; const detailBytes: number[] = []; const imgMs: number[] = []; let imgOk = 0; let leak = 0;
    const optSha = new Map((await q<{ ext: string; sha256: string }>(`select external_id ext, sha256 from public.stone_library_images where variant='optimized' and deleted_at is null`)).map((x) => [x.ext, x.sha256]));
    for (const s of stones) {
      const r = await call(D, asE, { params: { slug: s.slug } });
      detailMs.push(r.ms); detailBytes.push(r.bytes.length);
      if (/\broxy|img\/crystals|stone-library-images|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(r.body)) leak++;
      const doc = r.json.item as { name_tr: string; name_en: string; sections: { fields: { field: string; lang: string; content: string; health_related: boolean }[] }[];
        facets: { keyword?: { lang: string; text: string }[] }; medical_notice: { tr: string }; has_health_content: boolean };
      if (!doc) continue;
      if (doc.name_tr === raw.get(`${s.ext}|tr`)!.name && doc.name_en === raw.get(`${s.ext}|en`)!.name) nameOk++;
      if (doc.medical_notice?.tr === STONE_LIBRARY_MEDICAL_NOTICE_TR) noticeOk++;
      for (const f of doc.sections.flatMap((x) => x.fields)) {
        shown++;
        if (f.field === "meaning_physical") physShown++;
        const src = FIELDS.find((x) => x[0] === f.field)?.[1](raw.get(`${s.ext}|${f.lang}`)!);
        if (src === f.content) shownEqual++;
      }
      for (const k of doc.facets.keyword ?? []) {
        kwShown++;
        const src = raw.get(`${s.ext}|${k.lang}`)!.keywords as string[];
        if (Array.isArray(src) && src.includes(k.text)) kwShownEqual++;
      }
      const g = await call(G, asE, { params: { slug: s.slug } });
      imgMs.push(g.ms);
      if (g.status === 200 && sha(g.bytes) === optSha.get(s.ext)) imgOk++;
    }
    report.expertDetail = { fieldsShown: shown, fieldsEqualToRaw: shownEqual, physicalShown: physShown, keywordsShown: kwShown, keywordsEqualToRaw: kwShownEqual,
      namesEqual: nameOk, medicalNoticeOk: noticeOk, imagesServedShaOk: imgOk, leakResponses: leak,
      detailMs: { p50: pct(detailMs, 50), p95: pct(detailMs, 95) }, detailBytes: { p50: pct(detailBytes, 50), max: Math.max(...detailBytes) }, imageMs: { p50: pct(imgMs, 50), p95: pct(imgMs, 95) } };
    ok(shown === 908 && shownEqual === 908, `uzman ayrıntısında gösterilen ${shown} alanın tamamı ham yanıtla birebir (909 − 1 dil şüphesi bekleyen olumlama)`, report.expertDetail);
    ok(physShown === 182, "182 fiziksel etki metni C modelinde aynen gösterildi", physShown);
    ok(kwShownEqual === kwShown && kwShown > 0, `gösterilen ${kwShown} anahtar kelimenin tamamı kaynakta aynen var`);
    ok(nameOk === 91, "91 taşın TR + EN adı ayrıntıda kaynakla birebir");
    ok(noticeOk === 91, "91 kartta ayrı tıbbi bilgilendirme bileşeni");
    ok(imgOk === 91, "91 görsel uzmana servis edildi; bayt SHA-256 = kayıt");
    ok(leak === 0, "uzman yanıtlarında sağlayıcı adı / görsel adresi / depo yolu / iç kimlik YOK");

    section("9. Arama + filtre (gerçek 91 taş)");
    const searchMs: number[] = []; let firstTr = 0, firstEn = 0; const missTr: string[] = []; const missEn: string[] = [];
    for (const s of stones) {
      for (const [nm, lang] of [[s.name_tr, "tr"], [s.name_en, "en"]] as const) {
        const r = await call(S, asE, { query: `?q=${encodeURIComponent(nm)}&limit=5` });
        searchMs.push(r.ms);
        const first = (r.json.items as { slug: string }[] | undefined)?.[0]?.slug;
        if (lang === "tr") { if (first === s.slug) firstTr++; else missTr.push(`${nm}→${first}`); }
        else { if (first === s.slug) firstEn++; else missEn.push(`${nm}→${first}`); }
      }
    }
    report.search = { firstTr, firstEn, missTr, missEn, ms: { p50: pct(searchMs, 50), p95: pct(searchMs, 95) } };
    ok(firstTr === 91, `Türkçe ad aramasında ilgili taş ilk sırada (${firstTr}/91)`, missTr.slice(0, 5));
    ok(firstEn === 91, `İngilizce ad aramasında ilgili taş ilk sırada (${firstEn}/91)`, missEn.slice(0, 5));
    // Önizleme: ilk 240 karakter + "…"
    let exOk = 0, exAll = 0, exCut = 0;
    for (let off = 0; off < 100; off += 50) {
      const r = await call(S, asE, { query: `?limit=50&offset=${off}` });
      for (const it of (r.json.items as { slug: string; excerpt: string | null }[]) ?? []) {
        const s = stones.find((x) => x.slug === it.slug)!;
        const d = raw.get(`${s.ext}|tr`)!.description as string;
        exAll++;
        const cps = Array.from(d);
        const want = cps.length > 240 ? cps.slice(0, 240).join("") + "…" : d;
        if (cps.length > 240) exCut++;
        if (it.excerpt === want) exOk++;
      }
    }
    report.excerpt = { items: exAll, equal: exOk, truncatedWithEllipsis: exCut };
    ok(exAll === 91 && exOk === 91, `arama önizlemesi: 91/91 = kaynak TR açıklamanın ilk 240 karakteri (+ '…' ${exCut} uzun metinde)`, report.excerpt);
    const cat = await call(S, asE, { query: "?filtreler=1" });
    const facets = cat.json.facets as Record<string, { key: string; count: number }[]>;
    let filterOk = 0, filterAll = 0;
    for (const k of Object.keys(facets ?? {})) {
      for (const val of facets[k]) {
        filterAll++;
        const r = await call(S, asE, { query: `?${k}=${val.key}&limit=1` });
        if (r.json.total === val.count) filterOk++;
      }
    }
    report.filters = { facets: Object.fromEntries(Object.entries(facets ?? {}).map(([k, vs]) => [k, vs.length])), values: filterAll, totalsMatch: filterOk,
      birthMonths: (cat.json.birth_month as unknown[] | undefined)?.length ?? 0, hardness: cat.json.hardness };
    ok(cat.status === 200 && filterAll > 0 && filterOk === filterAll, `filtre kataloğundaki ${filterAll} değerin tamamında filtre sonucu = katalog sayısı`, report.filters);
    // Başka taşların adında da geçen tek kelimelik adlar (veriden türetilir): birebir adlı taş yine ilk sırada mı?
    const contained = stones.filter((a) => !a.name_en.includes(" ") && stones.some((b) => b.id !== a.id && b.name_en.split(" ").includes(a.name_en)));
    let containedOk = 0;
    for (const a of contained) {
      const r = await call(S, asE, { query: `?q=${encodeURIComponent(a.name_en)}&limit=5` });
      if ((r.json.items as { slug: string }[])[0]?.slug === a.slug) containedOk++;
    }
    report.searchContained = { names: contained.length, firstOk: containedOk };
    ok(contained.length > 0 && containedOk === contained.length, `başka adların içinde geçen ${contained.length} tek kelimelik adın aramasında birebir adlı taş ilk sırada`, report.searchContained);

    section("10. Mobil / tablet davranışı + yetkisiz erişim");
    const base = (await call(S, asE, { query: "?q=kuvars&limit=20" })).body;
    let same = true; const uaMs: Record<string, number[]> = {};
    for (const [k, ua] of Object.entries(UA)) {
      uaMs[k] = [];
      for (let i = 0; i < 15; i++) {
        const r = await call(S, asE, { query: "?q=kuvars&limit=20", ua });
        uaMs[k].push(r.ms);
        if (r.body !== base) same = false;
        const d = await call(D, asE, { params: { slug: stones[i % stones.length].slug }, ua });
        uaMs[k].push(d.ms);
        if (d.status !== 200) same = false;
      }
    }
    report.mobile = Object.fromEntries(Object.entries(uaMs).map(([k, v2]) => [k, { p50: pct(v2, 50), p95: pct(v2, 95) }]));
    ok(same, "iPhone / Android / iPad istemcileri masaüstüyle aynı yanıtı alır", report.mobile);
    ok((await call(S, asE2)).status === 404 && (await call(D, asE2, { params: { slug: stones[0].slug } })).status === 404 && (await call(G, asE2, { params: { slug: stones[0].slug } })).status === 404,
      "yetkisiz uzman: arama / kart / görsel → 404 (gerçek veriyle)");

    section("11. Tekrar aktarım (gerçek veri, kayıtlı ham yanıtlardan; 0 istek)");
    const before = { rec: await n(`select count(*)::int from public.stone_library_records`), fac: await n(`select count(*)::int from public.stone_library_facets`), img: await n(`select count(*)::int from public.stone_library_images`) };
    const replays2 = { n: 0 };
    const rf2 = replayFetch(F2, replays2);
    const s2 = await runCrystalImport({ db, actor: OWNER.id, sourceId: SRC, licenseGrantId: LIC, client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "cevrimdisi-yeniden-oynatma-anahtari-yok", fetchImpl: rf2, timeoutMs: 5000 },
      imageFetch: rf2, includeImages: true, includeBirthstones: true, includeVocabLists: true, creditCap: 1000, allowanceRemaining: 1000, quotaFloor: 0, termsSha256: TERMS, sleep: async () => undefined });
    const after = { rec: await n(`select count(*)::int from public.stone_library_records`), fac: await n(`select count(*)::int from public.stone_library_facets`), img: await n(`select count(*)::int from public.stone_library_images`) };
    report.reimport = { status: s2.status, providerRequests: replays2.n, reusedResponses: s2.reusedResponses, before, after, published: await n(`select count(*)::int from public.stone_library_published`) };
    ok(s2.status === "completed" && replays2.n === 0 && JSON.stringify(before) === JSON.stringify(after), "tekrar aktarım: sağlayıcıya 0 istek (kayıtlı yanıt), yeni kayıt / görsel yok", report.reimport);
    ok((report.reimport as { published: number }).published === 91 && ((await owner("stone_library_owner_integrity", { p_stone_id: null })) as { ok: boolean }).ok === true, "tekrar aktarım sonrası 91 taş yayında, bütünlük birebir");
    ok(external.length === 0, "tüm çalışma boyunca dış ağa 0 istek", external.length);
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  report.result = { pass, fail, fails };
  writeFileSync(path.join(OUT, "ham/f3-real-data-check.json"), JSON.stringify(report, null, 2));
  console.log(`\nstone-library F3 gerçek veri: ${pass} PASS / ${fail} FAIL → ${path.join(OUT, "ham/f3-real-data-check.json")}`);
  if (fail) { console.error(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}

main().catch((e) => { console.error("çöktü:", e instanceof Error ? e.message : e); process.exit(1); });
