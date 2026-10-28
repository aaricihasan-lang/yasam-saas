/**
 * Doğaltaş Kütüphanesi F2 — GERÇEK sağlayıcıdan YEREL / İZOLE aktarım (owner izinli gece çalışması aracı).
 *
 * • Hedef: geçici embedded-postgres + PostgREST/Storage shim (yalnız 127.0.0.1). PRODUCTION'A SIFIR TEMAS.
 * • Ücretli çağrı yalnız `RUN_REAL_IMPORT=EVET` ile ve dış defterin izin verdiği kalan krediyle (varsayılan tavan 1.000).
 * • Lisanslı ham yanıtlar / görseller YALNIZ `OUT_DIR` (Git DIŞI) klasörüne yazılır; repoya hiçbir veri girmez.
 * • Anahtar yalnız `ROXY_API_KEY` ortam değişkeninden okunur; hiçbir dosyaya / log'a yazılmaz.
 * Çalıştır:
 *   RUN_REAL_IMPORT=EVET OUT_DIR=C:/YasamSistemi-QA/... TERMS_SHA256=<64 hex> npx tsx scripts/stone-library/f2-local-import.ts
 * Çevrimdışı yeniden oynatma (0 kredi, ağ YOK): OFFLINE_REPLAY=1 → OUT_DIR/ham altındaki kayıtlı yanıtlar / görseller sunulur;
 *   normalizasyon değiştiğinde yerel veritabanı yeni ücretli çağrı yapılmadan yeniden kurulur.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SERVICE_KEY, startAnamnezTestEnv } from "../anamnez/testEnv";
import { runCrystalImport, type LedgerEntry } from "../../lib/stone-library/import/runner";
import { CRYSTALS_DEFAULT_BASE_URL, type CrystalsFetch } from "../../lib/stone-library/import/roxyCrystalsClient";
import { detectLanguage } from "../../lib/stone-library/import/langQuality";

const OUT = process.env.OUT_DIR ?? "";
const ALLOWANCE_TOTAL = Number(process.env.CREDIT_ALLOWANCE ?? 1000);
const QUOTA_FLOOR = 5000;

const REPLAY = process.env.OFFLINE_REPLAY === "1";

/** Kayıtlı yanıtlardan sağlayıcı taklidi (yalnız dosya okur; ağ YOK). */
function replayFetch(dir: string): CrystalsFetch {
  return async (input: string) => {
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

async function main() {
  if (process.env.RUN_REAL_IMPORT !== "EVET" && !REPLAY) return console.log("RUN_REAL_IMPORT=EVET yok — çağrı YAPILMADI.");
  const key = REPLAY ? "cevrimdisi-yeniden-oynatma-anahtari-yok" : process.env.ROXY_API_KEY;
  if (!key) return console.log("anahtar yok — çağrı YAPILMADI.");
  if (!OUT || /yasam-dogaltas-kutuphane|yasam-saas/i.test(path.resolve(OUT))) return console.log("OUT_DIR Git dışı bir klasör olmalı — DURDU.");
  for (const d of ["ham/roxy", "ham/gorseller/orig", "ham/gorseller/opt", "ham/db"]) mkdirSync(path.join(OUT, d), { recursive: true });
  const LEDGER = path.join(OUT, REPLAY ? "ham/ledger-replay.jsonl" : "ham/ledger.jsonl");
  const REAL_LEDGER = path.join(OUT, "ham/ledger.jsonl");
  const prior = existsSync(REAL_LEDGER) ? readFileSync(REAL_LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as LedgerEntry) : [];
  // Gece izni muhasebesi EN KÖTÜ DURUM: API çağrısı 1 + görsel indirme 1 (görsellerin kredi etkisi kesin ölçülemedi).
  const usedSoFar = prior.reduce((n, e) => n + (e.kind === "api" ? 1 : e.kind === "image" ? 1 : 0), 0);
  const allowance = ALLOWANCE_TOTAL - usedSoFar;
  console.log(`gece izni: ${ALLOWANCE_TOTAL} · defterde kullanılan: ${usedSoFar} · kalan: ${allowance}`);
  if (allowance <= 0 && !REPLAY) return console.log("izin dolmuş — çağrı YAPILMADI.");

  const termsSha = process.env.TERMS_SHA256 ?? "";
  if (!/^[0-9a-f]{64}$/.test(termsSha)) return console.log("TERMS_SHA256 gerekli — çağrı YAPILMADI.");

  const env = await startAnamnezTestEnv({
    port: Number(process.env.PG_PORT ?? 54611), dirName: `stone-library-real-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: [...new Set([...(readFileSync("supabase/migrations/20271201000000_stone_library_core.sql", "utf8") + readFileSync("supabase/migrations/20271201000100_stone_library_f2.sql", "utf8"))
      .matchAll(/FUNCTION public\.(stone_library_[a-z_]+)\(/g)].map((m) => m[1]))],
    extraSql: [readFileSync("supabase/migrations/20271201000000_stone_library_core.sql", "utf8"), readFileSync("supabase/migrations/20271201000100_stone_library_f2.sql", "utf8")],
  });
  const su = env.su;
  const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
  try {
    const OWNER = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'LOCAL')`, [OWNER]);
    await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, tenant_id, is_super_admin) values ($1,'LOCAL OWNER','local.owner@example.test','admin',true,'approved',$1,true)`, [OWNER]);
    const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
      const { data, error } = await db.rpc(fn, { p_actor: OWNER, ...args });
      if (error) throw new Error(`${fn}: ${error.code} ${error.message}`);
      return (Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === "object" && fn in data[0] ? (data[0] as Record<string, unknown>)[fn] : data) as T;
    };
    const SRC = await rpc<string>("stone_library_source_save", { p_source_id: null, p_data: { source_key: "roxy-crystals", kind: "api", real_name: "RoxyAPI — Crystals", provider_code: "roxy" } });
    await rpc("stone_library_source_save", { p_source_id: SRC, p_data: { license_type: "api_terms", license_terms_url: "https://roxyapi.com/policy/terms", license_terms_sha256: termsSha,
      commercial_use_ok: true, status: "active", image_rights: "rehost_ok", notes: "Görsel hakkı: owner'ın aktardığı yazılı izin (24.10.2026). Kanıt belgesi owner doğrulaması bekliyor." } });
    const DOC = await rpc<string>("stone_library_document_add", { p_source_id: SRC, p_data: { doc_kind: "permission_letter", title: "Sağlayıcı destek ekibinin yazılı görsel izni (e-posta) — owner doğrulaması bekliyor",
      note: "E-posta dosyası çalışma ortamında YOK; içerik uydurulmadı. Owner belgeyi güvenli arşive koyup SHA-256'sını kaydedecek." } });
    await rpc("stone_library_document_add", { p_source_id: SRC, p_data: { doc_kind: "terms_snapshot", title: "Sağlayıcı kullanım şartları anlık görüntüsü", url: "https://roxyapi.com/policy/terms", content_sha256: termsSha } });
    const LIC = await rpc<string>("stone_library_license_grant_save", { p_grant_id: null, p_data: {
      source_id: SRC, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "Sağlayıcı destek ekibi (owner'ın aktardığı yazılı yanıt)",
      commercial_display: true, storage_allowed: true, post_subscription_rights: true, attribution_required: false, modification_allowed: true,
      redistribution_limit: "Görseller bağımsız veri seti veya API olarak yeniden dağıtılamaz.", max_resolution: "300x300", document_id: DOC,
      notes: "Yalnız kristal görselleri. Diğer sağlayıcı API görsellerine genişletilmez. Kanıt doğrulaması (belge SHA-256) owner'da." } });

    const t0 = Date.now();
    const summary = await runCrystalImport({
      db, actor: OWNER, sourceId: SRC, licenseGrantId: LIC,
      client: { baseUrl: (process.env.ROXY_API_BASE_URL ?? CRYSTALS_DEFAULT_BASE_URL).trim(), apiKey: key, ...(REPLAY ? { fetchImpl: replayFetch(OUT) } : {}) },
      ...(REPLAY ? { imageFetch: replayFetch(OUT) } : {}),
      includeImages: true, includeBirthstones: true, includeVocabLists: true,
      creditCap: REPLAY ? 1000 : Math.min(Number(process.env.BATCH_CAP ?? 300), allowance), allowanceRemaining: REPLAY ? 1000 : allowance, quotaFloor: QUOTA_FLOOR, termsSha256: termsSha,
      paidPeriodNote: "Starter plan, ücretli dönem (bitiş 2026-11-05)",
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      ledger: (e) => appendFileSync(LEDGER, JSON.stringify(e) + "\n"),
      log: (m) => console.log(m),
    });
    const secs = Math.round((Date.now() - t0) / 1000);
    console.log(`aktarım: ${summary.status} (${summary.stopReason ?? "-"}) · ${secs} sn · ücretli ${summary.paidCalls} · yeniden kullanılan ${summary.reusedResponses} · başarısız ${summary.failedCalls}`);

    // ── Git DIŞI çıktı: ham yanıtlar, görseller, DB dışa aktarımı ──────────────────────────────
    if (!REPLAY) for (const [id, d] of summary.details) {
      if (d.en) writeFileSync(path.join(OUT, `ham/roxy/${id}.en.json`), JSON.stringify(d.en, null, 2));
      if (d.tr) writeFileSync(path.join(OUT, `ham/roxy/${id}.tr.json`), JSON.stringify(d.tr, null, 2));
    }
    const raws = REPLAY ? [] : (await su.query(`select endpoint, lang, http_status, payload, payload_sha256 from public.stone_library_raw where endpoint not like '/crystals/%' or endpoint like '/crystals/birthstone%' or endpoint in ('/crystals/colors','/crystals/planets')`)).rows;
    for (const r of raws) writeFileSync(path.join(OUT, `ham/roxy/_${String(r.endpoint).replace(/[/]/g, "_")}.${r.lang ?? "x"}.${r.http_status}.json`), JSON.stringify(r.payload, null, 2));
    const imgs = (await su.query(`select i.variant, i.storage_path, i.sha256, i.bytes, i.width, i.height, i.mime, i.quality_flags, e.external_id
      from public.stone_library_images i join public.stone_library_external_ids e on e.stone_id = i.stone_id and e.deleted_at is null where i.deleted_at is null order by e.external_id, i.variant`)).rows;
    const manifest: Record<string, unknown>[] = [];
    for (const im of imgs) {
      const dl = await db.storage.from("stone-library-images").download(im.storage_path);
      if (!dl.data) continue;
      const buf = Buffer.from(await dl.data.arrayBuffer());
      const ok = createHash("sha256").update(buf).digest("hex") === im.sha256;
      const file = path.join(OUT, `ham/gorseller/${im.variant === "original" ? "orig" : "opt"}/${im.external_id}.${im.mime === "image/webp" ? "webp" : im.mime === "image/png" ? "png" : "jpg"}`);
      if (!REPLAY || im.variant === "optimized") writeFileSync(file, buf);
      manifest.push({ external_id: im.external_id, variant: im.variant, sha256: im.sha256, sha_ok: ok, bytes: im.bytes, width: im.width, height: im.height, mime: im.mime, flags: im.quality_flags });
    }
    writeFileSync(path.join(OUT, "ham/gorseller/manifest.json"), JSON.stringify(manifest, null, 2));

    // Kapsam matrisi + dil kalitesi
    const fields = ["description", "meaning_spiritual", "meaning_emotional", "meaning_physical", "affirmation"];
    const matrix = (await su.query(`select r.field_key, r.lang, count(*)::int n,
        count(*) filter (where 'lang_suspect' = any(r.quality_flags))::int suspect,
        count(*) filter (where 'tr_equals_en' = any(r.quality_flags))::int tr_eq_en,
        count(*) filter (where 'duplicate_text' = any(r.quality_flags))::int dup,
        count(*) filter (where r.health_sensitive)::int health
      from public.stone_library_records r where r.deleted_at is null and r.is_current group by 1,2 order by 1,2`)).rows;
    const facetM = (await su.query(`select facet, coalesce(lang,'-') lang, count(*)::int n, count(distinct stone_id)::int stones,
        count(*) filter (where 'lang_suspect' = any(quality_flags))::int suspect, count(*) filter (where health_sensitive)::int health
      from public.stone_library_facets where deleted_at is null group by 1,2 order by 1,2`)).rows;
    const stones = Number((await su.query(`select count(*)::int n from public.stone_library_stones where deleted_at is null`)).rows[0].n);
    const trNameMissing = (await su.query(`select s.name_tr, e.external_id from public.stone_library_stones s join public.stone_library_external_ids e on e.stone_id=s.id
      where s.deleted_at is null and lower(s.name_tr) = lower(s.name_en) order by 1`)).rows;
    const suspects = (await su.query(`select e.external_id, r.field_key, r.lang, r.quality_flags, left(r.content, 160) excerpt from public.stone_library_records r
      join public.stone_library_external_ids e on e.stone_id = r.stone_id and e.deleted_at is null
      where r.deleted_at is null and r.is_current and 'lang_suspect' = any(r.quality_flags) order by 1,2,3`)).rows;
    const langDet: Record<string, Record<string, number>> = {};
    for (const [, d] of summary.details) {
      for (const lang of ["tr", "en"] as const) {
        const o = d[lang] as Record<string, unknown> | null;
        if (!o) continue;
        const m = (o.meaning ?? {}) as Record<string, unknown>;
        for (const [f, v] of [["description", o.description], ["meaning_spiritual", m.spiritual], ["meaning_emotional", m.emotional], ["meaning_physical", m.physical], ["affirmation", o.affirmation]] as const) {
          if (typeof v !== "string" || !v.trim()) { langDet[`${lang}.${f}`] = { ...(langDet[`${lang}.${f}`] ?? {}), empty: ((langDet[`${lang}.${f}`] ?? {}).empty ?? 0) + 1 }; continue; }
          const det = detectLanguage(v).lang;
          langDet[`${lang}.${f}`] = { ...(langDet[`${lang}.${f}`] ?? {}), [det]: ((langDet[`${lang}.${f}`] ?? {})[det] ?? 0) + 1 };
        }
      }
    }
    const { details: _d, ...rest } = summary;
    void _d;
    writeFileSync(path.join(OUT, REPLAY ? "ham/summary-final.json" : "ham/summary.json"), JSON.stringify({ ...rest, seconds: secs, stones, fields, matrix, facetM, trNameMissing, suspects, langDet,
      imagesManifestCount: manifest.length, imagesShaOk: manifest.filter((m) => m.sha_ok).length, allowance, usedSoFar }, null, 2));
    // Owner incelemesi için DB dışa aktarımı (yerel; Git dışı)
    const all = await rpc<{ items: { id: string }[] }>("stone_library_owner_stones", { p_query: null, p_status: null, p_limit: 200, p_offset: 0 });
    for (const s of all.items) writeFileSync(path.join(OUT, `ham/db/${s.id}.json`), JSON.stringify(await rpc("stone_library_owner_stone", { p_stone_id: s.id }), null, 2));
    writeFileSync(path.join(OUT, "ham/db/_batch.json"), JSON.stringify(await rpc("stone_library_owner_batch", { p_batch_id: summary.batchId }), null, 2));
    writeFileSync(path.join(OUT, "ham/db/_published_count.txt"), String((await su.query(`select count(*)::int n from public.stone_library_published`)).rows[0].n));
    if (process.env.VERIFY_SEARCH === "1") {
      // YALNIZ yerel geçici veritabanında: tüm içerik onaylanır + taşlar yayımlanır → uzman araması gerçek veriyle denetlenir.
      await su.query(`select public.stone_library_review($1, 'record', id, 'approve') from public.stone_library_records where is_current and review_state='pending' and deleted_at is null`, [OWNER]);
      await su.query(`select public.stone_library_review($1, 'facet', id, 'approve') from public.stone_library_facets where review_state='pending' and deleted_at is null`, [OWNER]);
      await su.query(`select public.stone_library_stone_set_status($1, id, 'published') from public.stone_library_stones where deleted_at is null`, [OWNER]);
      const terms = ["Ametist", "Amethyst", "AMETİST", "ametist", "Karneol", "Carnelian", "KARNEOL", "Kuvars", "Quartz", "kuvars", "Gül Kuvars", "gul kuvars", "Rose Quartz",
        "Lapis Lazuli", "lapis", "Kaplan Gözü", "kaplan gozu", "Tiger", "Ay Taşı", "ay tasi", "Moonstone", "Siyah Turmalin", "Şungit", "sungit", "Shungite", "Yeşim", "yesim", "Jade",
        "huzur", "koruma", "protection", "sezgi", "intuition", "Turkuaz", "Kehribar", "Amber"];
      const results: Record<string, { total: number; top: string[] }> = {};
      for (const t of terms) {
        const r = await rpc<{ total: number; items: { slug: string; name_tr: string }[] }>("stone_library_expert_search", { p_viewer: OWNER, p_actor: undefined, p_query: t, p_filters: {}, p_limit: 5, p_offset: 0 } as Record<string, unknown>);
        results[t] = { total: r.total, top: r.items.map((i) => `${i.name_tr} (${i.slug})`) };
      }
      const filt: Record<string, number> = {};
      for (const [k, v] of [["chakra", "heart"], ["chakra", "crown"], ["zodiac", "pisces"], ["element", "earth"], ["color", "green"], ["color", "turquoise"], ["planet", "venus"]]) {
        const r = await rpc<{ total: number }>("stone_library_expert_search", { p_viewer: OWNER, p_actor: undefined, p_query: "", p_filters: { [k]: [v] }, p_limit: 1, p_offset: 0 } as Record<string, unknown>);
        filt[`${k}=${v}`] = r.total;
      }
      const pub = (await su.query(`select count(*)::int n, count(*) filter (where has_image)::int img, sum(jsonb_array_length(doc->'sections'))::int sections from public.stone_library_published`)).rows[0];
      const leak = (await su.query(`select count(*)::int n from public.stone_library_published where doc::text ~* 'roxy|img/crystals|stone-library-images|orig/|opt/'`)).rows[0].n;
      const physicalPublished = (await su.query(`select count(*)::int n from public.stone_library_published where doc::text like '%meaning_physical%'`)).rows[0].n;
      writeFileSync(path.join(OUT, "ham/search-check.json"), JSON.stringify({ results, filters: filt, published: pub, leakRows: leak, physicalPublished }, null, 2));
      console.log(`arama denetimi yazıldı · yayın ${pub.n} · sızıntı satırı ${leak} · fiziksel etki yayında ${physicalPublished}`);
    }
    if (process.env.VERIFY_VERBATIM === "1") {
      // BİREBİR DENETİM: ham yanıt dosyaları normalizasyon kodundan BAĞIMSIZ okunur; DB'deki her özgün değer karakteri karakterine
      // ve SHA-256 ile karşılaştırılır. Çıktı yalnız sayılar + özetler (metin yok) → ham/verbatim-check.json.
      const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
      const mean = (o: Record<string, unknown>) => (o.meaning ?? {}) as Record<string, unknown>;
      const FIELDS: [string, (o: Record<string, unknown>) => unknown][] = [
        ["description", (o) => o.description], ["meaning_spiritual", (o) => mean(o).spiritual], ["meaning_emotional", (o) => mean(o).emotional],
        ["meaning_physical", (o) => mean(o).physical], ["affirmation", (o) => o.affirmation]];
      const rawDir = path.join(OUT, "ham/roxy");
      const ids = [...new Set(readdirSync(rawDir).filter((f) => !f.startsWith("_") && /\.(tr|en)\.json$/.test(f)).map((f) => f.replace(/\.(tr|en)\.json$/, "")))].sort();
      type Rec = { external_id: string; field_key: string; lang: string; content: string; content_sha256: string; health_sensitive: boolean; quality_flags: string[]; origin: string; raw_id: string | null };
      const recs = (await su.query(`select e.external_id, r.field_key, r.lang, r.content, r.content_sha256, r.health_sensitive, r.quality_flags, r.origin, r.raw_id
        from public.stone_library_records r join public.stone_library_external_ids e on e.stone_id = r.stone_id and e.deleted_at is null
        where r.deleted_at is null and r.is_current`)).rows as Rec[];
      const kws = (await su.query(`select e.external_id, f.lang, f.value_text, f.health_sensitive from public.stone_library_facets f
        join public.stone_library_external_ids e on e.stone_id = f.stone_id and e.deleted_at is null where f.deleted_at is null and f.facet = 'keyword'`)).rows as { external_id: string; lang: string; value_text: string; health_sensitive: boolean }[];
      const names = new Map(((await su.query(`select e.external_id, s.name_tr, s.name_en from public.stone_library_stones s
        join public.stone_library_external_ids e on e.stone_id = s.id and e.deleted_at is null where s.deleted_at is null`)).rows as { external_id: string; name_tr: string; name_en: string | null }[]).map((r) => [r.external_id, r]));
      const recBy = new Map(recs.map((r) => [`${r.external_id}|${r.lang}|${r.field_key}`, r]));
      const mism: { id: string; lang: string; what: string; reason: string }[] = [];
      const hashes: { id: string; lang: string; field: string; sha256: string; chars: number }[] = [];
      let textsCompared = 0, textsEqual = 0, emptyInSource = 0, kwCompared = 0, kwEqual = 0, namesEqual = 0;
      for (const id of ids) {
        for (const lang of ["tr", "en"] as const) {
          const f = path.join(rawDir, `${id}.${lang}.json`);
          if (!existsSync(f)) { mism.push({ id, lang, what: "file", reason: "ham dosya yok" }); continue; }
          const raw = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
          for (const [field, get] of FIELDS) {
            const v = get(raw);
            const r = recBy.get(`${id}|${lang}|${field}`);
            if (typeof v !== "string" || v.trim() === "") { emptyInSource++; if (r) mism.push({ id, lang, what: field, reason: "kaynakta boş ama DB'de kayıt var" }); continue; }
            textsCompared++;
            hashes.push({ id, lang, field, sha256: sha(v), chars: [...v].length });
            if (!r) { mism.push({ id, lang, what: field, reason: "DB'de kayıt yok" }); continue; }
            if (r.origin !== "source" || !r.raw_id) { mism.push({ id, lang, what: field, reason: "kaynak kaydı değil / ham bağı yok" }); continue; }
            if (r.content !== v) { mism.push({ id, lang, what: field, reason: "içerik farklı" }); continue; }
            if (r.content_sha256 !== sha(v)) { mism.push({ id, lang, what: field, reason: "SHA farklı" }); continue; }
            textsEqual++;
          }
          const rawKw = (Array.isArray(raw.keywords) ? raw.keywords : []).filter((x): x is string => typeof x === "string" && x.trim() !== "");
          const pool = kws.filter((k) => k.external_id === id && k.lang === lang).map((k) => k.value_text);
          kwCompared += rawKw.length;
          for (const k of rawKw) { const i = pool.indexOf(k); if (i >= 0) { pool.splice(i, 1); kwEqual++; } else mism.push({ id, lang, what: "keyword", reason: "anahtar kelime DB'de aynen yok" }); }
          if (pool.length) mism.push({ id, lang, what: "keyword", reason: `DB'de kaynakta olmayan ${pool.length} anahtar kelime` });
          const n = names.get(id);
          const want = typeof raw.name === "string" ? raw.name : null;
          const got = n ? (lang === "tr" ? n.name_tr : n.name_en) : undefined;
          if (got === want) namesEqual++; else mism.push({ id, lang, what: "name", reason: "ad farklı" });
        }
      }
      const pubFields = (await su.query(`select fl->>'field' field, fl->>'lang' lang, fl->>'content' content from public.stone_library_published p,
        jsonb_array_elements(p.doc->'sections') sec, jsonb_array_elements(sec->'fields') fl`)).rows as { field: string; lang: string; content: string }[];
      const srcSet = new Set(recs.filter((r) => r.origin === "source").map((r) => `${r.lang}|${r.field_key}|${r.content}`));
      const pubNotVerbatim = pubFields.filter((p) => !srcSet.has(`${p.lang}|${p.field}|${p.content}`)).length;
      const cat = (pred: (r: Rec) => boolean) => {
        const xs = recs.filter(pred);
        return { total: xs.length, verbatim: xs.filter((r) => !mism.some((m) => m.id === r.external_id && m.lang === r.lang && m.what === r.field_key)).length };
      };
      const out = {
        stones: ids.length, textsCompared, textsEqual, emptyInSource, kwCompared, kwEqual, namesCompared: ids.length * 2, namesEqual,
        mismatches: mism,
        categories: {
          physical: cat((r) => r.field_key === "meaning_physical"),
          healthSensitiveOther: cat((r) => r.health_sensitive && r.field_key !== "meaning_physical"),
          langSuspect: cat((r) => r.quality_flags.includes("lang_suspect")),
          duplicateText: cat((r) => r.quality_flags.includes("duplicate_text")),
          healthKeywords: kws.filter((k) => k.health_sensitive).length,
          trNameEqualsEn: [...names.values()].filter((n) => n.name_en && n.name_tr.toLowerCase() === n.name_en.toLowerCase()).map((n) => n.name_tr).sort(),
        },
        published: { fields: pubFields.length, notVerbatim: pubNotVerbatim },
        rawFilesSha256: Object.fromEntries(readdirSync(rawDir).filter((f) => !f.startsWith("_")).sort()
          .map((f) => [f, createHash("sha256").update(readFileSync(path.join(rawDir, f))).digest("hex")])),
      };
      writeFileSync(path.join(OUT, "ham/verbatim-check.json"), JSON.stringify(out, null, 2));
      writeFileSync(path.join(OUT, "ham/verbatim-hashes.json"), JSON.stringify(hashes, null, 2));
      console.log(`birebir denetim: metin ${textsEqual}/${textsCompared} · anahtar kelime ${kwEqual}/${kwCompared} · ad ${namesEqual}/${ids.length * 2} · uyuşmazlık ${mism.length}`);
    }
    console.log("çıktı yazıldı:", OUT);
  } finally {
    await env.stop();
  }
}

main().catch((e) => { console.error("çöktü:", e instanceof Error ? e.message : e); process.exit(1); });
